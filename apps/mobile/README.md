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
https://bakunights-app-production.up.railway.app/api
```

The legacy word in this server hostname is internal only; all user-facing branding is WhereToGo. To test against another server, set `EXPO_PUBLIC_API_URL` before starting Expo. A physical phone cannot reach a server through the computer's `localhost`; use the computer's LAN IP or a public HTTPS URL.

## Validation

```powershell
npm run typecheck
npm run lint
npx expo-doctor
npx expo export --platform android --output-dir dist/android-check --clear
npx expo export --platform ios --output-dir dist/ios-check --clear
```

The EAS project is linked in `app.json`. Native store/test builds can be created with EAS after adding the desired build profiles.
