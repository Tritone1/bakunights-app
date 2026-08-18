# BakuNights

BakuNights is a dark, mobile-first nightlife and dining discovery experience for Baku. It highlights tonight’s restaurants, bars, pubs, lounges, and limited-time offers in a polished single-page interface.

The repository contains both the original web/PWA experience and a native Expo application for iOS and Android.

## Stack

- React 19 and TypeScript
- Expo SDK 54 and React Native 0.81 for the native app
- Apple Maps on iOS through `react-native-maps`
- Native foreground location through `expo-location`
- Vite 8
- Tailwind CSS 4 through `@tailwindcss/vite`
- Fraunces and Outfit via Google Fonts
- OpenStreetMap embeds—no map key required
- Custom UI components and inline SVG icons; no component library

## Run locally

```powershell
cd C:\Users\kanan\Desktop\Haragedek
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173`.

To view it on an iPhone or Android phone, keep the phone and computer on the same Wi-Fi and open `http://<computer-ip>:5173`. Run `ipconfig` to find the computer’s IPv4 address.

## Run the native app with Expo Go

The mobile dependency tree is intentionally isolated from the web workspace so Expo Go always resolves SDK 54.

```powershell
cd C:\Users\kanan\Desktop\Haragedek\apps\mobile
npm.cmd install
npx.cmd expo start --lan --clear
```

Keep the iPhone and computer on the same Wi-Fi. Open the iPhone Camera, scan the terminal QR code, and choose **Open in Expo Go**. When BakuNights asks for location access, choose **Allow While Using App**.

If the router blocks local device connections, use a tunnel instead:

```powershell
npx.cmd expo start --tunnel --clear
```

## Commands

```powershell
npm.cmd run dev          # BakuNights Vite server
npm.cmd run build        # production frontend build
npm.cmd run typecheck    # frontend TypeScript validation
npm.cmd run lint         # frontend ESLint
npm.cmd run test:mobile  # WebKit/iPhone + Chromium/Android interaction checks
npm.cmd run dev:mobile   # native Expo/Metro server
npm.cmd run lint:mobile
npm.cmd run typecheck:mobile
```

## Registration and email verification

Customer and merchant registration use separate pages:

- `http://localhost:5173/register/customer`
- `http://localhost:5173/register/merchant`

Passwords must contain at least eight characters, one uppercase letter, and one lowercase letter. New accounts cannot log in until their email has been verified. Verification links are single-use and expire after 24 hours; resend requests are limited to one per 60 seconds.

To send verification messages through Gmail:

1. Open the Google Account used by `GMAIL_SENDER_EMAIL`.
2. Go to **Security** and enable **2-Step Verification**.
3. Open **App Passwords**, create an app password for BakuNights, and copy the generated 16-character password.
4. In the local `.env` file, set `GMAIL_SENDER_EMAIL` and `GMAIL_APP_PASSWORD`. Never use the normal Gmail password and never commit `.env`.

When Gmail variables are empty in development, the API prints the branded verification link to its terminal instead of sending mail. To test end-to-end, run `npm.cmd run dev:fullstack`, register an account, open the printed link, and then log in through the matching customer or merchant page.

## Frontend structure

- `apps/web/src/App.tsx`: venue data and all application components
- `apps/web/src/index.css`: Tailwind import, theme tokens, global styles, glass effects, map filter, and animations
- `apps/web/public`: PWA manifest, icon, and service worker
- `apps/mobile/app`: native Expo Router screens
- `apps/mobile/src`: native venue data and taxi UI

The web client uses the API workspace for authentication, menus, offers, redemptions, and trust data. Run `npm.cmd run dev:fullstack` when testing those flows.

## Venue onboarding and moderation

The API includes merchant publishing and admin monitoring tools for getting real venue offers onto BakuNights.

Local setup:

```powershell
cd C:\Users\kanan\Desktop\Haragedek
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev:fullstack
```

Seeded admin accounts:

- `admin@bakunights.test` / `admin1234`
- `ops@bakunights.test` / `admin1234`

Seeded merchant account:

- `merchant@grubstub.test` / `merchant123`

Admin monitoring walkthrough:

1. Open `http://localhost:5173/login/admin` and log in with `admin@bakunights.test`.
2. Go to `/admin`.
3. Review active venues, live offers, trust flags, claims, and the read-only offer activity table.
4. Merchant offers are automatically stored as active and approved; no per-offer admin approval is required.

Merchant walkthrough:

1. Open `http://localhost:5173/login/merchant` and log in with `merchant@grubstub.test`.
2. Go to `/merchant`.
3. Create or edit an offer. It publishes automatically after validation, including its scope, timing, and required photo rules.
4. If the merchant has no verified venue, search for an unclaimed venue and submit a claim with phone, email, and proof notes. Admins review these from `/admin`.

## Menu system and scoped offers

Merchants manage venue-specific items from the **Menu** tab. They can add/edit/deactivate items, paste lines such as `Lule Kebab - 12 AZN` into an editable draft, scan a menu photo/PDF into the same review table, or clone a menu between venues they own. Parsed or scanned rows are never saved until the merchant reviews and confirms them.

Offers can cover the whole menu, one global category, or selected items. Selected items may have an optional offer-price override. New offers require either an uploaded offer photo or a covered active menu item that already has a photo.

The global catalog starts with Coca-Cola 330ml, Heineken 500ml, and Nescafé. Merchants can search it from the Menu tab and add an item with their venue-specific price; admins manage catalog availability from the admin panel.

### Test menu photo/PDF extraction locally

Set these values in `.env` (never commit the key):

```dotenv
OPENAI_API_KEY="your-project-api-key"
OPENAI_VISION_MODEL="gpt-4o"
```

Restart the API, log in as a merchant, open **Menu**, and select **Scan photo/PDF**. JPG, PNG, WebP, and PDF files up to 10 MB are accepted. Extraction supports mixed Azerbaijani and English text. If the key is absent, the model cannot read the file, or no reliable rows are found, the UI shows a clear manual/paste fallback.

## Offer honesty and trusted venues

After a merchant verifies a customer's QR/code, the deal page asks the customer whether the offer was honored. The prompt is skippable; skips are stored on the redemption for future skip-rate reporting.

For each venue, the API calculates honesty from its latest 20 feedback responses. It creates an admin flag when the rate is below 80% after at least five responses, or when three or more `No` responses arrive in seven days. Flags prioritize admin review and never suspend a venue automatically.

The trusted badge requires all of the following:

- at least 10 completed redemptions;
- an honesty rate above 90%;
- no unresolved trust flags;
- no manual admin badge revocation.

Trust scores and badges are recomputed when feedback is submitted and by a daily API job. Admins can resolve flags and revoke or restore badge eligibility from the admin panel.
