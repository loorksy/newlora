# Native mobile client

React Native 0.81.5 / React 19.1 / TypeScript. Native Android sources are checked in, and no Expo Go runtime is required. Native modules cover WebRTC, audio routes, secure Keystore credentials, WebView, notifications and FCM. Provider branding comes from official Lobe icon components.

Navigation is a top header and side sheet with Welcome, Chats, Recommendations, Tasks, Token Usage and Settings. There is no permanent bottom navigation. Welcome never has a chart button. A contextual instrument/timeframe chart button appears only in an active chart conversation.

Arabic is the initial locale. Every main UI label has Arabic/English resources. Rows/drawer direction and text alignment derive from locale; mixed symbols/prices use Unicode LTR isolates. RTL/LTR component tests cover these boundaries. The design uses graphite surfaces, subtle borders, generous spacing and one muted green accent, with no decorative market data.

Client auth tokens are stored via Keychain, not AsyncStorage. Provider secrets are only held in secure-entry component state until upload, then cleared. Refresh tokens rotate. WebSocket authentication is a bounded first message, never a query-string secret; reconnect resumes an event cursor. Stop requests cancel the durable run. Offline browsing is limited: the server is the source of truth.

`assemblePreview` bundles JavaScript and signs with the development key for an installable evaluation APK. `assembleRelease` needs your signing secrets for distribution. Firebase config is optional for compilation but mandatory for real notifications. Full-screen intent permissions and Google Play eligibility are controlled by Android and distribution policy; actionable call notifications remain the fallback.

Real-device testing remains required for font rendering, accessibility scaling, Bluetooth, microphone lifecycle, background delivery and reconnection under mobile network changes. The component suite is not a substitute for those checks.

Chart cards export authenticated PNGs through a small native Android module. Share uses a cache-only FileProvider with temporary read grants; Save uses the system document picker. PNG signatures and sizes are checked and no broad storage permission is requested.

## Attachments, background runs and notifications

The composer uses a native Android `ACTION_OPEN_DOCUMENT` picker (gallery/images, PDF, UTF-8 text and CSV). It does not request broad filesystem permissions. Up to four files, each at most 8 MB, can be previewed/removed before send. Images show a local preview; documents show their selected name. Multipart upload progress is real XHR progress. Failed uploads remain selected for retry. The authenticated server returns a UUID attachment ID, and message submission links those IDs atomically. Attachment-only requests are supported. Direct camera capture and persistent offline draft attachments are not included; the system picker can expose installed document/gallery providers.

Chat shows queued/analyzing/research-agent/completed/failed/cancelled states from backend events, plus Arabic/English text explaining that the app may close. Successful requests queue a normal push. Chats expose actual latest run or active monitoring state. Welcome still has no chart icon, and chat chart context still requires a real chart artifact.

Notification IDs are remembered in private Android preferences for seven days to suppress repeated delivery, including process restarts. This store contains IDs/timestamps only, never keys or session tokens; tokens remain in Keychain. Normal, urgent and incoming-call channels differ appropriately. A receipt is recorded before display, so an app crash between those steps can suppress an alert; the durable result remains in chat. Accept opens the in-app call screen with source conversation/notification identity; decline dismisses without starting audio. Current notification/task state is checked before call connection. Recommendation/task/chat links carry the exact resource ID. Android full-screen and high-priority delivery behavior still requires physical-device acceptance.
