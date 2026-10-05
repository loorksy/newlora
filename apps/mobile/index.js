import 'react-native-get-random-values';
import {AppRegistry} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee,{EventType} from '@notifee/react-native';
import App from './App';
import {name as appName} from './app.json';
import {receivePush,routeNotification} from './src/services/notifications';
// Firebase is optional at build time; register handlers only when configured.
try {
 messaging().setBackgroundMessageHandler(async message=>{await receivePush(message.data);});
 notifee.onBackgroundEvent(async({type,detail})=>{if(type===EventType.ACTION_PRESS&&detail.pressAction?.id==='decline'){await notifee.cancelNotification(detail.notification.id);}else if(type===EventType.PRESS||type===EventType.ACTION_PRESS){routeNotification(detail.notification?.data||{},detail.pressAction?.id);}});
} catch { /* Settings reports notification configuration when registration is requested. */ }
AppRegistry.registerComponent(appName,()=>App);
