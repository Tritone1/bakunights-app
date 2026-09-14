# WhereToGo mobile

The native Android and iOS app uses Expo SDK 57 and the same live WhereToGo data as the web app.

## Run on a phone with Expo Go

From the repository root:

```powershell
npm run dev:mobile -- --clear
```

Or from this directory:

```powershell
npm install
npm run start:lan
```

Scan the QR code with Expo Go on Android, or with the iPhone Camera app and open it in Expo Go. The computer and phone must normally be on the same network. Start with LAN mode; use a tunnel only when the network blocks LAN traffic.

The installed Expo Go app must support SDK 57. App icons and splash screens belong to a standalone development/production build; Expo Go itself keeps the Expo Go launcher icon.

## API

By default, the app uses the production API:

```text
https://wheretogo.az/api
```

To test against another server, set `EXPO_PUBLIC_API_URL` before starting Expo. A physical phone cannot reach a server through the computer's `localhost`; use the computer's LAN IP or a public HTTPS URL.

## Validation

```powershell
npm run typecheck
npm run lint
npx expo-doctor
npx expo export --platform android --output-dir dist/android-check --clear
npx expo export --platform ios --output-dir dist/ios-check --clear
```

## EAS release builds

The EAS project is linked to `@tritone/exp19216801018081`. The store-facing app name is **WhereToGo**; the existing `com.haragedek.app` bundle/package identifier is intentionally stable because it is a technical signing identity and is not shown as the app's name in stores.

Run the release checks before every build:

```powershell
npm run release:check
```

Create installable test builds without store submission:

```powershell
npm run build:preview:android
npm run build:preview:ios
```

The Android preview is an APK for physical devices. The iOS preview targets the simulator, so it does not require Apple signing. Once the Apple Developer and Google Play Console accounts exist, create signed store binaries and submit them with:

```powershell
npm run build:production
npm run submit:production
```

Before building Android, add `GOOGLE_MAPS_ANDROID_API_KEY` to the matching EAS environment. Restrict that key in Google Cloud to the Android package `com.haragedek.app` and the SHA-1 fingerprints of the EAS signing certificates. Expo Go supplies its own map key during development, but standalone Android builds require this project-specific key.
