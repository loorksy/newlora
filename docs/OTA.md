# Newlora Android updates

Newlora ships a bare React Native 0.81 app with Hermes. Compatible JavaScript and UI releases update from `https://newlora.lork.cloud/app-updates/` after one bootstrap APK install. Native changes still need a new APK.

This is not Expo Updates, App Center, or CodePush. The app downloads a Hermes bundle produced by the existing Metro and `hermesc` pipeline, checks an Ed25519 signature and a SHA-256, stores it atomically, and loads it through React Native's normal file bundle loader (`JSBundleLoader.createFileLoader`). It does not eval text from the server and it does not accept a bundle URL from the user.

## What an OTA can change

- TypeScript, JavaScript, and React components already supported by the installed native runtime
- Copy, layout, and other UI that does not add a native module
- The About revision shown from the signed manifest

## What needs a new APK

- New native dependencies, Android manifest entries, or permissions
- Gradle, Kotlin, Java, React Native, or Hermes upgrades
- A new `runtimeVersion`

The current runtime id is `newlora-android-runtime-1`. The bootstrap app requests the `preview` channel only. It does not change channels by itself. A manifest whose `runtimeVersion` does not match is rejected. The installed bundle keeps running, and About shows `APK update required`. The app does not download or sideload APKs.

## Endpoints

| Channel | Manifest |
| --- | --- |
| preview | `https://newlora.lork.cloud/app-updates/android/preview/manifest` |
| stable | `https://newlora.lork.cloud/app-updates/android/stable/manifest` |

Bundles are immutable:

`https://newlora.lork.cloud/app-updates/android/<channel>/releases/<id>/bundle`

Files live in `/opt/newlora/updates` and are served by `newlora-updates` on `127.0.0.1:18082`. Traefik routes only the `/app-updates` prefix. There is no directory listing and the signing key is not in that directory.

## Signing

Every manifest is signed with Ed25519 over a fixed line encoding (`newlora-ota-v1`), not over a raw JSON blob. The signature and the bundle hash are both required. The client also rejects a bad host, a non-HTTPS URL, a path that is not the expected release path, a malformed manifest, a size or content-type mismatch, a silent downgrade, and a replay of a different release with the same timestamp.

The private key stays at `/opt/newlora/secrets/ota-signing-key` with mode `0600`. Only the public key is embedded in the app. Do not print the private key, copy it into git, or put it in an APK.

## Publish

From a clean git checkout:

```bash
scripts/publish-mobile-update.sh preview
scripts/publish-mobile-update.sh stable
```

The script records the git SHA, builds a minified Android bundle, compiles it with Hermes, hashes it, asks the update host to sign the canonical message, and switches that channel's manifest with an atomic rename. The previous release directory stays in place. The script does not restart the API, worker, scheduler, notifier, voice, browser, PostgreSQL, or Redis.

`preview` is the channel compiled into the bootstrap APK. Do not publish to `stable` until that channel should move.

## Startup, checks, and reload

The process starts on the last known-good OTA bundle, or on the embedded factory bundle when no OTA has been promoted. The network check runs after the shell is up, again whenever the app returns to the foreground, and about every 20 minutes while it stays open. Offline startup does not wait for the update host.

A download is stored under a temporary directory, checked, then renamed. The known-good pointer does not move until the new bundle boots and the app shell marks itself healthy. Two launches that die before that marker discard the pending release and load the previous known-good bundle, or the embedded bundle if there is none. About includes `Use included version`, which clears the OTA pointer and reloads the factory bundle. Release files already on disk are kept.

The app does not reload while text is being composed, a file is attached, a run is streaming, a voice call is active, or credentials are being submitted. When a compatible update is staged and the screen is idle, a sheet says `Newlora has been updated` and offers `Update now`. That restarts the process so Hermes loads the pending file. Dismissing the sheet leaves the update pending for the next cold start.

About shows the native version, runtime id, channel, OTA id, git SHA when the manifest has one, last check time, and one of: Up to date, Checking, Downloading, Update ready, Applying, APK update required, Update failed. Paths on disk are not shown.

There is no WebSocket payload for update bytes. A live `app_update_available` event was not added, because that would require an API change and a restart of the running API. The app polls the signed manifest instead.

## Recover from a bad release

1. Confirm phones are still opening the previous bundle or the factory bundle. A release that never reaches the healthy marker is dropped after two failed launches.
2. On the update host, point the channel manifest back at a release directory that is still present and was signed with the same key. Replace the manifest with `mv` on the same filesystem. Do not delete the last known-good directory.
3. If the bad release must not be offered again, leave its directory in place but do not point the channel manifest at it.
4. If the runtime itself is wrong, ship a new APK. Do not try to fix a native mismatch with another JS bundle.
5. `Use included version` on a device returns that install to the factory bundle.

## Key rotation

1. Generate a new Ed25519 key on the update host, outside the directory that the update service can read.
2. Put the new public key in the app and ship a new APK. The old app will keep rejecting manifests from the new key, which is intended.
3. After the new APK is installed, publish with the new key.
4. Keep the previous public key only until those older binaries are retired. Do not reuse a key that may have been copied off the host.
5. Never commit either private key and never place one in the APK.
