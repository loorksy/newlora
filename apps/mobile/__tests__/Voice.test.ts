import { PermissionsAndroid } from 'react-native';
import { mediaDevices, RTCPeerConnection } from 'react-native-webrtc';
import { VoiceSession } from '../src/services/voice';
import { request } from '../src/services/api';
import { waitFor } from '@testing-library/react-native';
jest.mock('../src/services/api', () => ({
  request: jest.fn(),
  APIError: class extends Error {
    code: string;
    constructor(value: string) {
      super(value);
      this.code = value;
    }
  },
}));
let channel: any, peer: any, track: any;
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  channel = { send: jest.fn(), readyState: 'open' };
  peer = {
    addTrack: jest.fn(),
    createDataChannel: () => channel,
    createOffer: jest.fn().mockResolvedValue({ sdp: 'offer' }),
    setLocalDescription: jest.fn(),
    setRemoteDescription: jest.fn(),
    close: jest.fn(),
    connectionState: 'new',
  };
  track = { stop: jest.fn(), enabled: true };
  mediaDevices.getUserMedia = jest
    .fn()
    .mockResolvedValue({
      getTracks: () => [track],
      getAudioTracks: () => [track],
    });
  jest.mocked(RTCPeerConnection).mockImplementation(() => peer);
  jest
    .mocked(request)
    .mockResolvedValue({
      mode: 'realtime_brokered',
      id: 'voice-id',
      transport: { sdp: 'answer' },
    });
});
test('disconnect offers reconnect and stop cancels server session and microphone', async () => {
  const state = jest.fn();
  const session = new VoiceSession();
  await session.start(state, 'chat');
  session.mute(true);
  expect(track.enabled).toBe(false);
  peer.connectionState = 'disconnected';
  peer.onconnectionstatechange();
  expect(state).toHaveBeenCalledWith('reconnect');
  session.stop();
  expect(track.stop).toHaveBeenCalled();
  expect(peer.close).toHaveBeenCalled();
  expect(request).toHaveBeenCalledWith('/voice/voice-id/stop', 'POST');
});
test('missing session identity fails safely', async () => {
  jest
    .mocked(request)
    .mockResolvedValue({
      mode: 'realtime_brokered',
      transport: { sdp: 'answer' },
    });
  const session = new VoiceSession();
  await expect(session.start(jest.fn())).rejects.toMatchObject({
    code: 'voice_unavailable',
  });
  session.stop();
});
test('cancel while permission is pending never opens microphone', async () => {
  let grant: (
    value: typeof PermissionsAndroid.RESULTS.GRANTED,
  ) => void = () => {};
  jest.spyOn(PermissionsAndroid, 'request').mockImplementation(
    () =>
      new Promise(resolve => {
        grant = resolve;
      }),
  );
  const session = new VoiceSession();
  const starting = session.start(jest.fn());
  session.stop();
  grant(PermissionsAndroid.RESULTS.GRANTED);
  await starting;
  expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
});
test('duplicate research events are deduped and failed research is handled', async () => {
  jest.mocked(request).mockImplementation(async path => {
    if (path === '/voice/session')
      return { mode: 'realtime', id: 'v', value: 'ephemeral' } as never;
    if (path === '/voice/v/research') return { runId: 'research' } as never;
    if (path === '/runs/research')
      return { status: 'failed', text: null } as never;
    return {} as never;
  });
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, text: async () => 'answer' });
  const session = new VoiceSession();
  await session.start(jest.fn());
  const event = {
    data: JSON.stringify({
      type: 'response.function_call_arguments.done',
      name: 'research',
      call_id: 'one',
      arguments: '{"objective":"gold"}',
    }),
  };
  channel.onmessage(event);
  channel.onmessage(event);
  await waitFor(() => expect(channel.send).toHaveBeenCalled());
  expect(
    jest.mocked(request).mock.calls.filter(c => c[0] === '/voice/v/research'),
  ).toHaveLength(1);
  session.stop();
});
