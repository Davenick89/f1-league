# Build plan: PWA audit fixes (low priority)

**For Codex + Claude validation.** Five small, independent fixes from a
Codex+Claude PWA audit plus live deployment checks (2026-08-14). None is
urgent; run this when there's a gap, and **after** `buildplan-insight-
panel.md` if the Zandvoort deadline is still live.

## 1. `CalendarView.jsx` — stale `lastSyncedAt` on cache-served reads

Confirmed bug. `lastSyncedAt` (~line 53) is stamped with the client's
current time whenever `getDocs`/`getDoc` resolves — including resolutions
served entirely from Firestore's offline cache. An offline user can be
told "last sync at [now]" for arbitrarily stale data, which is exactly the
misleading-staleness problem the offline UI work was meant to prevent.

`LeaderboardView.jsx` already does this correctly by checking
`snapshot.metadata.fromCache`. Apply the same check here: only advance
`lastSyncedAt` when the snapshot came from the server, and surface the
cached case the way `LeaderboardView` already does.

## 2. Maskable icon has no safe zone

`public/icons/icon-512-maskable.png` and `icon-512.png` are byte-identical
(verified via md5). The manifest declares the former `purpose: "maskable"`,
but maskable icons need ~20% padding on all sides — Android's adaptive
circular mask will clip artwork that extends to the canvas edge.

Regenerate a genuinely distinct maskable variant with the logo scaled into
the centre safe zone (~60% of canvas width), padded with the brand
background. `scripts/generate-icons.js` already rasterizes from
`public/icons/icon.svg` via sharp — extend it to emit a padded maskable
variant rather than the same crop twice. Verify by masking the output to a
circle and confirming nothing meaningful is clipped.

## 3. `scripts/inject-sw-env.js` — silent fallback on missing env var

Not currently broken (`.env.production` is complete, verified), but the
script falls back to `''` for any missing var with no assertion (~line 19).
A future missing var would ship a service worker with blank Firebase
config — breaking push for every client, with a green build and no error.

Add an explicit check: if any expected `VITE_FIREBASE_*` var is missing or
empty, throw and fail the build. This script already runs as a
`firebase.json` predeploy hook, so failing loudly here blocks a bad deploy
at exactly the right moment.

## 4. Favicon not precached — fails on offline load

`vite-plugin-pwa`'s default `globPatterns` covers app-shell JS/CSS/HTML but
not `public/icons/*`, so `/icons/icon.svg` 404s on an offline load
(`ERR_INTERNET_DISCONNECTED`). Cosmetic — the app shell itself loads
correctly offline — but trivially fixable by including the icon set in
`globPatterns` in `vite.config.js`. Keep the pattern tight: icons and
manifest only, **do not** widen it to anything that would cache API or
Firestore responses.

## 5. `index.html` — deprecated iOS meta tag warning

`index.html` declares only the legacy `apple-mobile-web-app-capable`,
producing a deprecation warning in every console log in this project's
history. Add the standard `mobile-web-app-capable` **alongside** it —
don't replace it; iOS Safari still relies on the legacy tag.

## 6. Validation checklist

1. Read every file touched; diff against this spec.
2. Item 1: confirm `lastSyncedAt` no longer advances on a cache-served
   read — test with `context.setOffline(true)`, don't just read the code.
3. Item 2: confirm the two 512px icons are no longer byte-identical (md5),
   and visually confirm the maskable variant survives a circular mask.
4. Item 3: confirm the build actually fails when a `VITE_FIREBASE_*` var
   is deliberately removed — make it fire.
5. Item 4: confirm the favicon loads on an offline reload.
6. Item 5: confirm the deprecation warning is gone and iOS install still
   behaves (as far as testable without a real device).
7. `npm run build` — confirm success and zero placeholder strings in the
   shipped service worker (standing check for any change touching the SW
   or its env injection).

## Still needs a real device — not fixable here

Add-to-Home-Screen and a real FCM push have never been verified outside
the VPS. Unchanged by this round; still needs an actual phone.
