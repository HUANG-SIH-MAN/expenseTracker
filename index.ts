import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import App from './App';
import { registerNotificationListener } from './src/notificationListener';

// 註冊 Android 背景通知監聽（Phase 0：擷取原始通知）。僅 Android 生效。
registerNotificationListener();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
