import notifee, {
  AndroidCategory,
  AndroidImportance,
  EventType,
} from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { request } from './api';
import { translate, type Language } from '../i18n';
export async function receivePush(
  data: Record<string, string> = {},
  lang: Language = 'ar',
) {
  const call = data.mode === 'call';
  const channelId = await notifee.createChannel({
    id: call ? 'newlora-calls' : 'newlora-updates',
    name: translate(lang, call ? 'voice' : 'tasks'),
    importance: call ? AndroidImportance.HIGH : AndroidImportance.DEFAULT,
    sound: 'default',
  });
  await notifee.displayNotification({
    id: data.notificationId,
    title: translate(lang, call ? 'incoming' : 'latestUpdate'),
    body: translate(lang, 'incomingDetail'),
    data,
    android: {
      channelId,
      category: call ? AndroidCategory.CALL : AndroidCategory.EVENT,
      pressAction: { id: call ? 'accept' : 'open', launchActivity: 'default' },
      ...(call
        ? {
            fullScreenAction: { id: 'incoming', launchActivity: 'default' },
            actions: [
              {
                title: translate(lang, 'accept'),
                pressAction: { id: 'accept', launchActivity: 'default' },
              },
              {
                title: translate(lang, 'decline'),
                pressAction: { id: 'decline' },
              },
            ],
            timeoutAfter: 60000,
          }
        : {}),
    },
  });
}
export function routeNotification(
  data: Record<string, unknown>,
  action = 'open',
) {
  if (action === 'decline') return;
  if (data.mode === 'call')
    void Linking.openURL(
      'newlora://call/' +
        encodeURIComponent(String(data.notificationId || '')) +
        '?session=' +
        encodeURIComponent(String(data.sessionId || '')),
    );
  else if (data.sessionId)
    void Linking.openURL(
      'newlora://chat/' + encodeURIComponent(String(data.sessionId)),
    );
}
export async function registerPush(_lang: Language) {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33)
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  await notifee.requestPermission();
  const token = await messaging().getToken();
  await request('/devices/push', 'PUT', { token });
  return messaging().onTokenRefresh(t => {
    void request('/devices/push', 'PUT', { token: t });
  });
}
export function foregroundNotifications(lang: Language) {
  const off = messaging().onMessage(message =>
    receivePush(message.data as Record<string, string>, lang),
  );
  const stop = notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS)
      routeNotification(
        detail.notification?.data || {},
        detail.pressAction?.id,
      );
  });
  return () => {
    off();
    stop();
  };
}

export async function initialNotification() {
  const initial = await notifee.getInitialNotification();
  if (initial)
    routeNotification(initial.notification.data || {}, initial.pressAction.id);
}
