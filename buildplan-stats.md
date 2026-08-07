# Build plan: Driver/Team Performance Stats (v1)

**For Codex (bulk implementation) + Claude (validation).** This file is the
spec — implement it directly, don't redesign it. Claude will read every
file touched, diff against this spec, and validate before deploy.

**Do not run this alongside `buildplan.md` (the PWA/Track D spec) in the
same working tree at the same time** — run this only once that build is
complete, to avoid two Codex runs colliding on the same files.

## Why

Agreed over several turns of design discussion: a driver/team performance
tracker with charts. The full roadmap is four phases — **this spec covers
v1 only**:
- v1 (this spec): structured F1 stats from Jolpica. No scraping, no AI.
- v2 (future, separate spec): plain RSS news tab, no AI.
- v3 (future): AI-summarized digest layered on the v2 feed pipeline.
- v4 (future): expand v1-v3 to other motorsports, series by series, data
  availability permitting (most other series lack Jolpica/OpenF1-quality
  open APIs — a real per-series investigation later, not in scope now).

**Because v4 is on the roadmap, v1 must namespace its data by series from
the start** (`f1` is the only value today) — this costs nothing extra now
and avoids a rewrite later. Do not skip this namespacing just because only
one series exists yet.

This is a live app; follow existing patterns exactly so this slots in
cleanly.

## 1. Backend — `refreshDriverStatsCache`, `functions/index.js`

New `onSchedule` function, modeled directly on the existing
`refreshScheduleCache` in the same file: hourly-scheduled, try/catch with
fallback-or-noop on total failure — **never** corrupt or clear the existing
cache doc if a run fails, same pattern as `refreshScheduleCache`. Use
`[refreshDriverStatsCache]`-prefixed logging, matching that function's
style.

Fetch, for the current season, **incrementally** — track `lastCachedRound`
in the cache doc; each run only fetches rounds after that and appends. Do
not refetch the whole season every run.

- `GET https://api.jolpi.ca/ergast/f1/{season}/{round}/driverStandings.json`
  and `.../constructorStandings.json` — use these **directly** for points
  progression. Do not sum results client/server-side to compute points —
  replicating the current season's point table (sprint points, fastest-lap
  point, etc.) is fragile and duplicative when the API already computes it.
- `GET https://api.jolpi.ca/ergast/f1/{season}/{round}/results.json` for
  that same round:
  - **Qual-vs-race delta**: use the `grid` field (starting position,
    already reflects grid penalties) vs `position` (finish). Do not make a
    separate qualifying-classification call for this.
  - **DNF detection**: `positionText` non-numeric (e.g. "R", "D", "E", "W",
    "F", "N") = DNF/non-finish; numeric string = classified finisher.
    **Verify this against a real Jolpica response during implementation —
    do not ship on assumption alone.** This app already had one incident
    caused by an unverified live-data assumption; don't repeat that here.
  - **Head-to-head/teammate pairing**: each result entry includes a nested
    `Constructor` object — two drivers sharing a `constructorId` in the
    same round are teammates for that round. Store enough per-round data
    to support a head-to-head comparison between any two drivers for the
    current season.

Write to `/system/driverStats/{series}` via the Admin SDK (Firestore
subcollection-per-series doc; `series = "f1"` today — this is the
namespacing hook for v4, don't hardcode a flat path without the series
segment).

**Do not eagerly precompute track history** (driver × circuit across all
past seasons — ~20 drivers × ~24 circuits is several hundred pairs, almost
all never viewed). Instead, write a **separate `onCall` function**,
computed lazily the first time a specific driver/circuit pair is requested
by the frontend, cached to
`/system/driverStats/{series}/circuits/{driverId}_{circuitId}`, served from
cache on every subsequent request (safe to cache indefinitely for past
seasons; only add refresh-on-stale logic for the current season's entry, not
required for v1). Use Ergast's chained filter:
`GET https://api.jolpi.ca/ergast/f1/drivers/{driverId}/circuits/{circuitId}/results.json`
(no season/round segment → all seasons). **Verify this exact endpoint
against a live response during implementation** — if Jolpica doesn't
support this chain, fall back to iterating per-season calls filtered by
driver+circuit instead.

## 2. Firestore rules — `firestore.rules`

Add exactly this (single return-expression style — this file's rule blocks
cannot use `if` or multiple returns; uses the existing `isAuth()` helper
already defined near the top of the file):

```
match /system/driverStats/{series} {
  allow read: if isAuth();
  allow write: if false;
}
match /system/driverStats/{series}/circuits/{pairId} {
  allow read: if isAuth();
  allow write: if false;
}
```

`write: false` blanket-denies all client writes — only the Admin SDK (Cloud
Functions, bypasses rules) can write, same as every other server-only
collection in this file. Unlike `/system/scheduleCache` (which has no rule
at all and is never read by the client), this collection **is** read
directly by the new frontend view, so it needs this rule.

**Add this snippet exactly as given — do not modify its logic.** Claude
will review this specific change line-by-line before deploy; this is a
security-sensitive file.

## 3. Frontend — new lazy-loaded `StatsView.jsx`

Follow the exact existing pattern in `F1League.jsx`:
- Add `const StatsView = React.lazy(() => import('./StatsView.jsx'));` near
  the other `React.lazy` declarations (top of the file, alongside
  `CalendarView`/`AuditView`/etc.).
- Add a nav entry to the sidebar's existing `{ view, icon, label }` array
  (inline array mapped into buttons in the sidebar JSX).
- Add `{currentView === "stats" && <StatsView series="f1" .../>}` inside the
  existing shared `<Suspense>` block that already wraps every other view.
  Note the `series` prop — hardcode `"f1"` for now so the component is
  already shaped for v4 without v4 being built.
- `StatsView.jsx` reads `/system/driverStats/{series}` directly via the
  client Firestore SDK (now permitted by the new rule) — this is global
  data, not scoped to any league/group, unlike most other views.
- Add `recharts` as a new dependency (no charting library exists in
  `package.json` today). Keep this view's bundle lazy-loaded only — do not
  let it grow the main bundle; a prior build already warned about chunk
  size.
- Build these sub-views inside `StatsView.jsx`:
  - Points-progression line chart, with a drivers/constructors toggle.
  - Qual-vs-race delta view.
  - Podium/win/DNF counts table.
  - Head-to-head picker (select two drivers, compare current-season
    results).
  - Track-history lookup (driver + circuit picker) — calls the lazy
    `onCall` function from section 1 on first request for a given pair.

## 4. Validation checklist (Claude runs this after Codex, before deploy)

1. Read every file Codex touched; diff against this spec.
2. **Review the `firestore.rules` addition personally, line by line** —
   confirm single-expression syntax, confirm `write: false` is present on
   both new blocks, confirm nothing else in the file was accidentally
   broadened. Do not rely on a successful build alone to validate this.
3. `npm run build` — confirm it succeeds, and confirm the new view's bundle
   is actually split out (lazy-loaded), not inlined into the main chunk.
4. Confirm the DNF-detection assumption (`positionText` non-numeric)
   against a real Jolpica response — fix if wrong.
5. Confirm the driver+circuit chained-filter endpoint against a real
   response — fall back to per-season iteration if unsupported.
6. Exercise `StatsView` locally against real cached data once
   `refreshDriverStatsCache` has run at least once (may need a manual
   trigger the first time — same pattern as this session's
   `refreshScheduleCache` testing). Confirm charts render, head-to-head and
   track-history lookups work.
7. Confirm nothing else regressed — existing views/nav still work.
