import { malformedReason } from './canonical';
import { decodeUtf8, encodeUtf8 } from './codec';
import { installedFrom, releaseBundlePath, type OtaFs } from './store';
import {
  CHECK_INTERVAL_MS,
  DOWNLOAD_TIMEOUT_MS,
  MAX_BUNDLE_BYTES,
  MAX_PENDING_ATTEMPTS,
  type ActivityFlags,
  type LaunchSource,
  type OtaPhase,
  type OtaState,
  type ReleaseManifest,
} from './types';
import {
  assessManifest,
  sha256Hex,
  signatureValid,
  urlAllowed,
  type RejectReason,
} from './verify';

export function resolveBoot(state: OtaState): { state: OtaState; source: LaunchSource } {
  const next: OtaState = {
    ...state,
    good: state.good,
    previous: state.previous,
    pending: state.pending,
  };
  if (next.pending) {
    if (next.pendingAttempts >= MAX_PENDING_ATTEMPTS) {
      next.pending = null;
      next.pendingAttempts = 0;
      next.lastError = 'rolledBack';
      next.launchSource = next.good ? 'good' : 'embedded';
      next.launchedId = next.good?.id ?? null;
      next.healthy = false;
      next.status = 'upToDate';
      return { state: next, source: next.launchSource };
    }
    next.pendingAttempts += 1;
    next.launchSource = 'pending';
    next.launchedId = next.pending.id;
    next.healthy = false;
    return { state: next, source: 'pending' };
  }
  next.launchSource = next.good ? 'good' : 'embedded';
  next.launchedId = next.good?.id ?? null;
  next.healthy = false;
  return { state: next, source: next.launchSource };
}

export function markHealthy(state: OtaState): OtaState {
  const next: OtaState = { ...state, healthy: true };
  if (state.launchSource === 'pending' && state.pending && state.launchedId === state.pending.id) {
    next.previous = state.good;
    next.good = state.pending;
    next.pending = null;
    next.pendingAttempts = 0;
    next.launchSource = 'good';
    next.status = 'upToDate';
    next.lastError = null;
  }
  return next;
}

export function resetToEmbedded(state: OtaState): OtaState {
  return {
    ...state,
    previous: state.good ?? state.previous,
    good: null,
    pending: null,
    pendingAttempts: 0,
    launchedId: null,
    launchSource: 'embedded',
    healthy: false,
    lastError: null,
    status: 'upToDate',
  };
}

export function reloadAllowed(flags: ActivityFlags): boolean {
  return !flags.typing && !flags.uploading && !flags.streaming && !flags.voice && !flags.submitting;
}

export function shouldCheck(
  reason: 'startup' | 'foreground' | 'interval' | 'manual',
  lastCheckedAt: string | null,
  nowMs: number,
): boolean {
  if (reason === 'interval') return dueForInterval(lastCheckedAt, nowMs, CHECK_INTERVAL_MS);
  return true;
}

export function dueForInterval(lastCheckedAt: string | null, nowMs: number, intervalMs: number): boolean {
  if (!lastCheckedAt) return true;
  const then = Date.parse(lastCheckedAt);
  if (Number.isNaN(then)) return true;
  return nowMs - then >= intervalMs;
}

export async function stageRelease(
  fs: OtaFs,
  state: OtaState,
  manifest: ReleaseManifest,
  bundle: Uint8Array,
  publicKey: Uint8Array,
): Promise<OtaState> {
  if (malformedReason(manifest) || !signatureValid(manifest, publicKey)) {
    throw new Error('signature');
  }
  if (bundle.byteLength !== manifest.bundle.size || bundle.byteLength > MAX_BUNDLE_BYTES) {
    throw new Error('size');
  }
  if (sha256Hex(bundle) !== manifest.bundle.sha256) throw new Error('hash');
  const partial = `partial/${manifest.id}`;
  const finalDir = `releases/${manifest.id}`;
  await fs.removeTree(partial);
  await fs.writeFileAtomic(`${partial}/bundle`, bundle);
  await fs.writeFileAtomic(
    `${partial}/manifest.json`,
    encodeUtf8(JSON.stringify(manifest)),
  );
  const written = await fs.readFile(`${partial}/bundle`);
  if (!written || sha256Hex(written) !== manifest.bundle.sha256) throw new Error('hash');
  await fs.removeTree(finalDir);
  await fs.rename(partial, finalDir);
  const placed = await fs.readFile(releaseBundlePath(manifest.id));
  if (!placed || sha256Hex(placed) !== manifest.bundle.sha256) throw new Error('hash');
  const next: OtaState = {
    ...state,
    pending: installedFrom(manifest),
    pendingAttempts: 0,
    status: 'ready',
    lastError: null,
  };
  await fs.writeState(next);
  return next;
}

export type CheckResult = {
  state: OtaState;
  phase: OtaPhase;
  reason?: RejectReason | 'offline' | 'current';
};

async function readBody(response: Response, limit: number): Promise<Uint8Array> {
  const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  const length = Number(response.headers.get('content-length') || '0');
  if (length > limit) throw new Error('size');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > limit) throw new Error('size');
  return Object.assign(bytes, { contentType: type });
}

export async function checkUpdate(input: {
  fs: OtaFs;
  publicKey: Uint8Array;
  channel: string;
  runtimeVersion: string;
  manifestUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
  timeoutMs?: number;
}): Promise<CheckResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? (() => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
  let state = await input.fs.readState();
  const previousPhase = state.status;
  state = { ...state, status: 'checking', lastError: null };
  await input.fs.writeState(state);
  const hostError = urlAllowed(input.manifestUrl, input.channel, 'unusedunused', 'manifest');
  if (hostError) {
    state = { ...state, status: 'failed', lastError: 'host', lastCheckedAt: now() };
    await input.fs.writeState(state);
    return { state, phase: 'failed', reason: 'host' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DOWNLOAD_TIMEOUT_MS);
  try {
    let manifestResponse: Response;
    try {
      manifestResponse = await fetchImpl(input.manifestUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } catch {
      state = { ...state, status: previousPhase === 'ready' ? 'ready' : 'upToDate', lastError: 'offline' };
      await input.fs.writeState(state);
      return { state, phase: state.status, reason: 'offline' };
    }
    if (manifestResponse.status === 404) {
      state = { ...state, status: 'upToDate', lastCheckedAt: now(), lastError: null };
      await input.fs.writeState(state);
      return { state, phase: 'upToDate', reason: 'current' };
    }
    if (!manifestResponse.ok) throw new Error('malformed');
    const manifestBytes = await readBody(manifestResponse, 256 * 1024);
    const manifestType = (manifestBytes as Uint8Array & { contentType?: string }).contentType;
    if (manifestType && manifestType !== 'application/json') throw new Error('type');
    const manifest = JSON.parse(decodeUtf8(manifestBytes)) as ReleaseManifest;
    const decision = assessManifest(manifest, input.publicKey, {
      channel: input.channel,
      runtimeVersion: input.runtimeVersion,
      goodCreatedAt: state.good?.createdAt ?? null,
      goodId: state.good?.id ?? null,
    });
    if (decision === 'current') {
      state = { ...state, status: 'upToDate', lastCheckedAt: now(), lastError: null };
      await input.fs.writeState(state);
      return { state, phase: 'upToDate', reason: 'current' };
    }
    if (decision === 'runtime') {
      state = { ...state, status: 'apkRequired', lastCheckedAt: now(), lastError: 'runtime' };
      await input.fs.writeState(state);
      return { state, phase: 'apkRequired', reason: 'runtime' };
    }
    if (decision !== 'install') {
      state = { ...state, status: 'failed', lastCheckedAt: now(), lastError: decision };
      await input.fs.writeState(state);
      return { state, phase: 'failed', reason: decision };
    }
    if (state.pending?.id === manifest.id) {
      state = { ...state, status: 'ready', lastCheckedAt: now(), lastError: null };
      await input.fs.writeState(state);
      return { state, phase: 'ready' };
    }
    state = { ...state, status: 'downloading' };
    await input.fs.writeState(state);
    const bundleResponse = await fetchImpl(manifest.bundle.url, { signal: controller.signal });
    if (!bundleResponse.ok) throw new Error('malformed');
    const bundle = await readBody(bundleResponse, MAX_BUNDLE_BYTES);
    const bundleType = (bundle as Uint8Array & { contentType?: string }).contentType;
    if (bundleType && bundleType !== 'application/octet-stream') throw new Error('type');
    state = await stageRelease(
      input.fs,
      { ...state, lastCheckedAt: now() },
      manifest,
      bundle,
      input.publicKey,
    );
    return { state, phase: 'ready' };
  } catch (error) {
    const reason = (error instanceof Error ? error.message : 'malformed') as RejectReason;
    const safe = ['malformed', 'signature', 'hash', 'size', 'type', 'host'].includes(reason)
      ? reason
      : 'malformed';
    state = { ...(await input.fs.readState()), status: 'failed', lastCheckedAt: now(), lastError: safe };
    if (state.pending && state.good && state.pending.id === state.good.id) state.pending = null;
    await input.fs.writeState(state);
    return { state, phase: 'failed', reason: safe };
  } finally {
    clearTimeout(timer);
  }
}
