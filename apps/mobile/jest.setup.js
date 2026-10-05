require('@testing-library/react-native').configure({asyncUtilTimeout:5000});
jest.mock('react-native-safe-area-context',()=>require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-keychain',()=>({getGenericPassword:jest.fn().mockResolvedValue(false),setGenericPassword:jest.fn(),resetGenericPassword:jest.fn(),ACCESSIBLE:{WHEN_UNLOCKED_THIS_DEVICE_ONLY:'device'}}));
jest.mock('react-native-webview',()=>({WebView:require('react-native').View}));
jest.mock('react-native-webrtc',()=>({RTCPeerConnection:jest.fn(),RTCSessionDescription:jest.fn(),mediaDevices:{}}));
jest.mock('react-native-incall-manager',()=>({start:jest.fn(),stop:jest.fn(),setForceSpeakerphoneOn:jest.fn()}));
jest.mock('@lobehub/icons-rn',()=>({OpenAI:require('react-native').View,Anthropic:require('react-native').View,ZAI:require('react-native').View}));
jest.mock('@react-native-firebase/messaging',()=>()=>({onMessage:()=>()=>{},getToken:async()=> 'test-push-token',onTokenRefresh:()=>()=>{}}));
jest.mock('@notifee/react-native',()=>({__esModule:true,default:{onForegroundEvent:()=>()=>{},requestPermission:jest.fn()},EventType:{PRESS:1,ACTION_PRESS:2}}));
