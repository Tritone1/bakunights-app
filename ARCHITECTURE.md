# WhereToGo architecture

The active product is a client-only React application in `apps/web`. It deliberately keeps all venue data and UI composition in `App.tsx`, matching the prototype requirement and making the experience deployable as static files.

## Styling

Tailwind CSS 4 runs through the official Vite plugin. Theme tokens for the near-black background, card surface, gold, red, violet, muted copy, and both font families live in `index.css`. A small amount of CSS handles glass surfaces, the deal pulse, hidden scrollbars, reduced motion, and the dark OpenStreetMap treatment.

## State

React owns three local interaction states:

- Search and category filtering
- The selected venue in the map section
- Saved venue IDs, persisted in `localStorage`

Flash-deal countdowns update once per second and count toward the next 22:00 boundary.

## Maps and navigation

The selected venue’s latitude and longitude generate an OpenStreetMap export iframe URL with a close bounding box and marker. Navigate and Go links open the venue on OpenStreetMap in a new tab. No API key or secret is shipped to the browser.

## Responsive verification

`scripts/mobile-check.mjs` runs the live app through WebKit using an iPhone profile and Chromium using a Pixel profile. It verifies exact document/viewport widths, card rendering, countdowns, search, category filters, navigation controls, and the map embed.

The retained `apps/api` workspace is not used by this prototype and can later provide accounts, server-side saves, or managed venue data without changing the visual layer.
