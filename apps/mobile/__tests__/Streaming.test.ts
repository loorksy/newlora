import * as Keychain from 'react-native-keychain';
import { restore, subscribe } from '../src/services/api';

test('authenticated reconnect replays from the last event and drops duplicates', async () => {
  jest.useFakeTimers();
  jest
    .mocked(Keychain.getGenericPassword)
    .mockResolvedValue({
      username: 'owner',
      password: JSON.stringify({
        base: 'https://test.example',
        accessToken: 'test-access',
        refreshToken: 'test-refresh',
      }),
      service: 'newlora.session',
      storage: 'Keystore',
    } as never);
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  const sockets: any[] = [];
  globalThis.WebSocket = jest.fn().mockImplementation(() => {
    const socket = { send: jest.fn(), close: jest.fn() };
    sockets.push(socket);
    return socket;
  }) as unknown as typeof WebSocket;
  await restore();
  const receive = jest.fn();
  const stop = subscribe('chat', receive, jest.fn());
  await jest.advanceTimersByTimeAsync(0);
  sockets[0].onopen();
  expect(JSON.parse(sockets[0].send.mock.calls[0][0])).toEqual({
    token: 'test-access',
    sessionId: 'chat',
    after: 0,
  });
  const event = {
    version: 1,
    id: 12,
    event: 'chat.delta',
    payload: { text: 'gold' },
  };
  sockets[0].onmessage({ data: JSON.stringify(event) });
  sockets[0].onmessage({ data: JSON.stringify(event) });
  expect(receive).toHaveBeenCalledTimes(1);
  sockets[0].onclose();
  await jest.advanceTimersByTimeAsync(1000);
  sockets[1].onopen();
  expect(JSON.parse(sockets[1].send.mock.calls[0][0]).after).toBe(12);
  stop();
  expect(sockets[1].close).toHaveBeenCalled();
  jest.useRealTimers();
});
