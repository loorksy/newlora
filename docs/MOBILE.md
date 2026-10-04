# Native mobile client

React Native 0.81.5 / React 19.1 / TypeScript. Native Android sources are checked in, and no Expo Go runtime is required. Native modules cover WebRTC, audio routes, secure Keystore credentials, WebView, notifications and FCM. Provider branding comes from official Lobe icon components.

Navigation is a top header and side sheet with Welcome, Chats, Recommendations, Tasks, Token Usage and Settings. There is no permanent bottom navigation. Welcome never has a chart button. A contextual instrument/timeframe chart button appears only in an active chart conversation.

Arabic is the initial locale. Every main UI label has Arabic/English resources. Rows/drawer direction and text alignment derive from locale; mixed symbols/prices use Unicode LTR isolates. RTL/LTR component tests cover these boundaries. The design uses graphite surfaces, subtle borders, generous spacing and one muted green accent, with no decorative market data.

Client auth tokens are stored via Keychain, not AsyncStorage. Provider secrets are only held in secure-entry component state until upload, then cleared. Refresh tokens rotate. WebSocket authentication is a bounded first message, never a query-string secret; reconnect resumes an event cursor. Stop requests cancel the durable run. Offline browsing is limited: the server is the source of truth.

`assemblePreview` bundles JavaScript and signs with the development key for an installable evaluation APK. `assembleRelease` needs your signing secrets for distribution. Firebase config is optional for compilation but mandatory for real notifications. Full-screen intent permissions and Google Play eligibility are controlled by Android and distribution policy; actionable call notifications remain the fallback.

Real-device testing remains required for font rendering, accessibility scaling, Bluetooth, microphone lifecycle, background delivery and reconnection under mobile network changes. The component suite is not a substitute for those checks.

Chart cards export authenticated PNGs through a small native Android module. Share uses a cache-only FileProvider with temporary read grants; Save uses the system document picker. PNG signatures and sizes are checked and no broad storage permission is requested.
