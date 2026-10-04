declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};
import * as Keychain from 'react-native-keychain';
import type { EventEnvelope } from '@newlora/contracts';
export class APIError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
type Auth = { base: string; accessToken: string; refreshToken: string };
let auth: Auth | null = null;
let refreshing: Promise<void> | null = null;
export async function restore() {
  const saved = await Keychain.getGenericPassword({
    service: 'newlora.session',
  });
  auth = saved ? JSON.parse(saved.password) : null;
  return Boolean(auth);
}
async function persist() {
  if (auth)
    await Keychain.setGenericPassword('newlora', JSON.stringify(auth), {
      service: 'newlora.session',
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
}
export async function login(base: string, password: string) {
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(base))
    throw new APIError('httpsRequired');
  const r = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await r.json();
  if (!r.ok) throw new APIError(data.code || data.detail || 'invalid_login');
  auth = { base, ...data };
  await persist();
}
async function renew() {
  if (!auth) throw new APIError('authentication_required');
  const r = await fetch(auth.base + '/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: auth.refreshToken }),
  });
  if (!r.ok) {
    await logout();
    throw new APIError('authentication_required');
  }
  auth = { ...auth, ...(await r.json()) };
  await persist();
}
export async function request<T = unknown>(
  path: string,
  method = 'GET',
  body?: unknown,
  retry = true,
): Promise<T> {
  if (!auth) throw new APIError('authentication_required');
  let r: Response;
  try {
    r = await fetch(auth.base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + auth.accessToken,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new APIError('networkError');
  }
  if (r.status === 401 && retry) {
    if (!refreshing)
      refreshing = renew().finally(() => {
        refreshing = null;
      });
    await refreshing;
    return request<T>(path, method, body, false);
  }
  const data = await r.json();
  if (!r.ok) throw new APIError(data.code || data.detail || 'error');
  return data as T;
}
export async function logout() {
  if (auth) {
    await fetch(auth.base + '/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + auth.accessToken,
      },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    }).catch(() => {});
  }
  auth = null;
  await Keychain.resetGenericPassword({ service: 'newlora.session' });
}
export const baseURL = () => auth?.base || '';
export const authHeaders = () => ({
  Authorization: 'Bearer ' + (auth?.accessToken || ''),
});
export function id() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
export function subscribe(
  sessionId: string,
  onEvent: (event: EventEnvelope) => void,
  onError: () => void,
) {
  let closed = false;
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cursor = 0;
  let attempts = 0;
  const connect = async () => {
    if (closed) return;
    try {
      await request('/settings');
      if (closed || !auth) return;
      socket = new WebSocket(
        auth.base.replace(/^https:/, 'wss:') + '/events/ws',
      );
      socket.onopen = () => {
        attempts = 0;
        socket?.send(
          JSON.stringify({
            token: auth?.accessToken,
            sessionId,
            after: cursor,
          }),
        );
      };
      socket.onmessage = e => {
        try {
          const event = JSON.parse(e.data) as EventEnvelope;
          if (event.version === 1 && event.id > cursor) {
            cursor = event.id;
            onEvent(event);
          }
        } catch {
          onError();
        }
      };
      socket.onclose = () => {
        if (!closed)
          timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempts++));
      };
      socket.onerror = onError;
    } catch {
      onError();
      if (!closed) timer = setTimeout(connect, 5000);
    }
  };
  void connect();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    socket?.close();
  };
}

export async function requestBlob(path: string, retry = true): Promise<Blob> {
  if (!auth) throw new APIError('authentication_required');
  const response = await fetch(auth.base + path, { headers: authHeaders() });
  if (response.status === 401 && retry) {
    if (!refreshing)
      refreshing = renew().finally(() => {
        refreshing = null;
      });
    await refreshing;
    return requestBlob(path, false);
  }
  if (
    !response.ok ||
    response.headers.get('content-type')?.split(';')[0] !== 'image/png'
  )
    throw new APIError('image_export_failed');
  if (Number(response.headers.get('content-length')) > 15_000_000)
    throw new APIError('image_export_failed');
  return response.blob();
}
