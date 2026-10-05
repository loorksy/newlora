# Newlora Android

Native React Native application. See [mobile architecture](../../docs/MOBILE.md) and [root setup instructions](../../README.md).

From the monorepo root: `npm ci`, `npm run typecheck`, `npm test`.

For a self-contained evaluation build, run `./gradlew assemblePreview -PreactNativeArchitectures=arm64-v8a` in `apps/mobile/android` with JDK 17 and Android SDK 36. Production signing and Firebase setup are documented in the root README. No Expo Go is used.

The generated iOS scaffold is retained for future portability; iOS is not a supported or validated delivery target. The chart export bridge currently targets Android.
