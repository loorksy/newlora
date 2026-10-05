import { Linking, NativeModules } from 'react-native';
import notifee from '@notifee/react-native';
import { receivePush, routeNotification } from '../src/services/notifications';
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn().mockResolvedValue('channel'),
    displayNotification: jest.fn(),
    cancelNotification: jest.fn(),
  },
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  AndroidCategory: { CALL: 'call', EVENT: 'event' },
  EventType: { PRESS: 1, ACTION_PRESS: 2 },
}));
beforeEach(() => {
  jest.clearAllMocks();
  NativeModules.NewloraAttachments = {
    claimNotification: jest.fn().mockResolvedValue(true),
  };
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});
test.each(['normal', 'urgent', 'call'])(
  'privacy and channel behavior %s',
  async mode => {
    await receivePush(
      {
        notificationId: 'n',
        mode,
        sessionId: 's',
        summary: 'sensitive thesis',
      },
      'en',
    );
    const payload = jest.mocked(notifee.displayNotification).mock.calls[0][0];
    expect(payload.body).not.toContain('sensitive');
    expect(payload.android?.onlyAlertOnce).toBe(true);
    expect(jest.mocked(notifee.createChannel).mock.calls[0][0].importance).toBe(
      mode === 'normal' ? 3 : 4,
    );
    if (mode === 'call') expect(payload.android?.actions).toHaveLength(2);
  },
);
test('persistent receipt suppresses duplicate display', async () => {
  NativeModules.NewloraAttachments.claimNotification
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  await receivePush({ notificationId: 'same', mode: 'normal' });
  await receivePush({ notificationId: 'same', mode: 'normal' });
  expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
});
test.each([
  ['recommendationId', 'recommendation'],
  ['taskId', 'task'],
  ['sessionId', 'chat'],
])('deep-links exact %s', (field, route) => {
  routeNotification({
    notificationId: 'n',
    mode: 'normal',
    [field]: 'resource',
  });
  expect(Linking.openURL).toHaveBeenCalledWith(
    'newlora://' + route + '/resource',
  );
});
test('decline dismisses and never starts a call', () => {
  routeNotification(
    { notificationId: 'n', mode: 'call', sessionId: 's' },
    'decline',
  );
  expect(notifee.cancelNotification).toHaveBeenCalledWith('n');
  expect(Linking.openURL).not.toHaveBeenCalled();
});
test('accept routes incoming call with its source conversation', () => {
  routeNotification(
    { notificationId: 'n', mode: 'call', sessionId: 's' },
    'accept',
  );
  expect(Linking.openURL).toHaveBeenCalledWith('newlora://call/n?session=s');
});
