# Build plan: PWA support (Track D)

**For Codex (bulk implementation) + Claude (validation).** This file is the
spec — implement it directly, don't redesign it. Claude will read every
file touched, diff against this spec, and validate before deploy.

## Why

CLAUDE.md's "Track D (PWA manifest/icons/offline caching)" — deferred,
never scoped, until now. The app currently has zero PWA infrastructure: no
manifest, no icons, no favicon, no app-shell service worker (only
`public/firebase-messaging-sw.js` for FCM push). Goal: installable
home-screen app with fast/offline loading, and let players view their
last-synced predictions/leaderboard without a connection.

**This is a live app used by real leagues mid-season. Do not regress
anything that works today** — push notifications must keep working exactly
as before, and offline support must never let a player see stale
lock-state/leaderboard data without knowing it's stale, or believe a
prediction saved when it didn't.

Decisions already made, do not relitigate:
- Offline scope: app-shell caching (install/fast-load) **and** Firestore
  offline persistence (view last-synced predictions/leaderboard while
  offline).
- Icon: designed fresh — dark background, red-600 accent, matching the
  app's existing look. No existing logo/brand assets exist anywhere in the
  repo to match.
- **Offline prediction edits are blocked, not queued.** `firestore.rules`'
  `isRaceOpen()` (lines 44-58) evaluates `request.time` at write-arrival,
  not queue time — a write queued offline before lock but delivered after
  the round locks would be silently rejected by the SDK's background sync.
  Queue-and-sync is a trust trap here. View-only offline + a disabled Save
  button is the required design — do not implement queue-and-sync.

## 1. Firestore offline persistence — `shared.js`

Single change point — `shared.js` (~line 29) is the only place `db` is
created; every view imports it from there. Replace:
```js
export const db = getFirestore(app);
```
with:
```js
export const db = initializeFirestore(app, { localCache: persistentLocalCache() });
```
`PredictionView.jsx` and `LeaderboardView.jsx` already use `onSnapshot`
listeners — these auto-serve cached data offline once persistence is on.
`CalendarView.jsx`'s one-shot `getDocs`/`getDoc` calls also fall back to
cache on network failure automatically (standard Firestore SDK behavior) —
no code change needed there beyond the UI indicator in section 2.

## 2. Online/offline UI plumbing

- New `useOnlineStatus()` hook in `shared.js` (`navigator.onLine` + `window`
  `online`/`offline` events). No existing network-state detection anywhere
  in the app — this is new.
- Global "You're offline" banner in the `F1League.jsx` shell.
- `PredictionView.jsx`: disable the Save button when offline
  (`disabled={isNotYetOpen || isOffline}`, existing button ~line 779) *and*
  add the same guard at the top of `handleSavePredictions` (~line 424) for
  defense in depth, with inline messaging ("Reconnect to submit
  predictions").
- `CalendarView.jsx`: track a `lastSyncedAt` timestamp after `loadAllData()`
  resolves; show "Offline — showing data from last sync at HH:MM" next to
  the existing refresh button (~line 295) when offline.
- `LeaderboardView.jsx`: use the live listener's `snapshot.metadata.fromCache`
  (more precise than the global flag for this one view) to show a stale-data
  note above "CHAMPIONSHIP STANDINGS" (~line 249).

## 3. Service worker — `vite-plugin-pwa`, `injectManifest` strategy

- Add devDependencies: `vite-plugin-pwa`, `workbox-precaching` (must be a
  real resolvable devDependency — injectManifest bundles the custom SW via
  esbuild, which resolves imports from `node_modules` directly, not
  transitively through `vite-plugin-pwa`).
- Relocate `public/firebase-messaging-sw.js` → `sw-src/firebase-messaging-sw.js`
  and add `precacheAndRoute(self.__WB_MANIFEST)` alongside the existing
  `importScripts`/`onBackgroundMessage` logic — one merged SW, one
  registration. Keep it a classic (non-module) script — `importScripts` is
  illegal in module SWs and unsupported in Firefox regardless.
- `vite.config.js`: add the `VitePWA` plugin with:
  - `strategy: 'injectManifest'`
  - `srcDir: 'sw-src'`, `filename: 'firebase-messaging-sw.js'` (keep the
    served filename identical to today's, so `F1League.jsx`'s existing
    `navigator.serviceWorker.register('/firebase-messaging-sw.js')` call
    (~line 337) keeps working unchanged and registrations stay idempotent)
  - `registerType: 'prompt'` — **not** `autoUpdate`. `autoUpdate`
    force-reloads on detecting a new SW, which is unsafe mid-prediction-
    submission on a live race weekend. `prompt` installs-and-waits; surface
    a small "update available, tap to refresh" banner, reload only on
    explicit user action.
  - default `globPatterns` (app-shell JS/CSS/HTML only) — **no
    `runtimeCaching` config.** Firestore/Jolpica/OpenF1 requests must never
    be intercepted or cached by the service worker. This app just fixed a
    live-data-staleness incident; do not reintroduce staleness risk via an
    overzealous cache.
  - `workbox: { cleanupOutdatedCaches: true }`
- **Move `injectSwEnv`'s env-substitution out of the Vite plugin lifecycle
  into a postbuild script**: change the root `package.json` build script to
  `"build": "vite build && node scripts/inject-sw-env.js"`, and move the
  existing env-substitution logic (currently the `injectSwEnv` plugin's
  `writeBundle` hook in `vite.config.js`) into `scripts/inject-sw-env.js`,
  targeting `dist/firebase-messaging-sw.js` directly, then remove the
  `injectSwEnv` plugin from `vite.config.js`.
  **This is the critical correctness requirement of this whole spec**:
  `vite-plugin-pwa`'s injectManifest writes the final SW in a later Rollup
  lifecycle stage (`closeBundle`) than the current `writeBundle`-based
  `injectSwEnv` hook runs. Left as-is, the shipped service worker would
  contain literal `__VITE_FIREBASE_API_KEY__`-style placeholders instead of
  real values, silently breaking push notifications for every user. The
  postbuild script sidesteps this by running strictly after the entire
  Vite build (including the plugin) completes. **Verify this specifically**
  by checking `dist/firebase-messaging-sw.js` after a build contains real
  values, not placeholder strings, before considering this done.

## 4. Manifest + icons

- `vite-plugin-pwa`'s `manifest` config object (auto-generates and injects
  `<link rel="manifest">` with correct content-hash). Dark
  `background_color`/`theme_color` matching Tailwind `gray-950`,
  `display: 'standalone'`.
- New on-brand icon: dark background, red-600 (`#dc2626`) accent, checkered
  flag or "F1K" monogram, matching the app's existing bold/black-weight
  look (see `F1League.jsx` for the existing red-600/gray-900/950 palette).
  Single SVG source, rasterized to 192×192, 512×512, a maskable 512×512, and
  a 180×180 apple-touch-icon via a one-off Node script using `sharp`
  (devDependency).
- `index.html`: favicon links, `theme-color` meta, iOS-specific tags
  `vite-plugin-pwa` doesn't auto-inject (`apple-mobile-web-app-capable`,
  `apple-touch-icon`).

## 5. Validation checklist (Claude runs this after Codex, before deploy)

1. Read every file Codex touched; diff against this spec.
2. `npm run build && npm run preview` — confirm build succeeds, manifest
   serves correctly, and `dist/firebase-messaging-sw.js` contains real
   injected env values (not literal placeholders) — this directly verifies
   the postbuild-ordering fix in section 3.
3. Diff the merged SW's `onBackgroundMessage`/`notificationclick` logic
   against git history's `public/firebase-messaging-sw.js` to confirm
   nothing was dropped in the relocation.
4. Exercise the app locally: confirm normal online flow is unaffected;
   simulate offline (devtools "Offline" or Playwright `setOffline(true)`)
   and confirm the app shell still loads, `PredictionView`'s Save button is
   disabled with the correct messaging, and `CalendarView`/`LeaderboardView`
   show their stale-data indicators.
5. Fix anything wrong before deploying.
6. Note for after deploy: a real "Add to Home Screen" test and a real FCM
   push notification test on an actual device still need to happen live —
   these can't be verified before deploy.
