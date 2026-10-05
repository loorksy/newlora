import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CallView } from '../src/components/CallView';
import { LocaleContext } from '../src/i18n';
import { VoiceSession } from '../src/services/voice';
import { request } from '../src/services/api';
jest.mock('../src/services/voice');
jest.mock('../src/services/api', () => ({ request: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
test('unmount after reconnect stops the replacement voice session', async () => {
  const instances: any[] = [];
  jest.mocked(VoiceSession).mockImplementation(() => {
    const instance = {
      start: jest.fn(async (state: (value: string) => void) => state('reconnect')),
      stop: jest.fn(), mute: jest.fn(), speaker: jest.fn(),
    };
    instances.push(instance);
    return instance as unknown as VoiceSession;
  });
  const view = render(<LocaleContext.Provider value="en"><CallView incoming={false} onClose={jest.fn()} /></LocaleContext.Provider>);
  await act(async () => {});
  const first = instances.find(s => s.start.mock.calls.length);
  fireEvent.press(screen.getByRole('button', { name: 'Reconnect' }));
  await act(async () => {});
  const second = instances.filter(s => s.start.mock.calls.length).at(-1);
  expect(second).not.toBe(first);
  expect(first.stop).toHaveBeenCalled();
  view.unmount();
  expect(second.stop).toHaveBeenCalled();
});
test('closing an incoming call during authorization never starts its microphone', async () => {
  const start = jest.fn();
  jest.mocked(VoiceSession).mockImplementation(() => ({ start, stop: jest.fn() }) as unknown as VoiceSession);
  let resolve!: (result: { available: boolean }) => void;
  jest.mocked(request).mockReturnValue(new Promise(r => { resolve = r; }));
  const view = render(<LocaleContext.Provider value="en"><CallView incoming notificationId="notification" onClose={jest.fn()} /></LocaleContext.Provider>);
  fireEvent.press(screen.getByRole('button', { name: 'Accept' }));
  view.unmount();
  await act(async () => { resolve({ available: true }); });
  expect(start).not.toHaveBeenCalled();
});
