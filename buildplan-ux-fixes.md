# Build plan: post-launch UX/bug fixes (Stats, News, PredictionView, mobile nav)

**For Codex (bulk implementation) + Claude (validation).** This file is
the spec — implement it directly, don't redesign it. Five independent
fixes, found via a design-review pass over live screenshots (Stats
desktop/mobile, News, PredictionView). Each item below is scoped to its
own file(s); there's no reason to sequence them, but validate each
separately per its own checklist item in section 6.

## 1. Teammate line style — `StatsView.jsx`

Confirmed intentional: teammates share a team color in the points-
progression chart (`colorFor()`, ~line 178, keyed by `TEAM_COLORS`). But
with no other visual differentiator, two teammates plotted together are
genuinely indistinguishable — confirmed on the actual shipped chart, not
theoretical.

Fix: the higher-points teammate (of the pair) gets a solid line (today's
default), the lower-points teammate gets a dashed line. `drivers` (~line
133) is already sorted by championship standings position (leaders
first) — use that ordering, don't recompute standings separately. Add a
`dashFor(entry)` helper alongside the existing `colorFor(entry)`:

```js
const dashFor = (entry) => {
  if (chartType !== 'drivers') return undefined; // constructors have no teammates
  const teammates = drivers.filter((d) => d.constructorId === entry.constructorId);
  if (teammates.length < 2) return undefined; // no teammate currently in the data
  return teammates[0].id === entry.id ? undefined : '6 4';
};
```

Apply as `strokeDasharray={dashFor(entry)}` on the `<Line>` at ~line 252,
alongside the existing `stroke={colorFor(entry)}`.

## 2. Qualifying-vs-race delta — attrition-adjusted — `StatsView.jsx`

Confirmed problem, not just a style preference: the current metric
(`deltas`, ~line 183-187) is `grid - position` summed per driver. For a
backmarker in a high-attrition race, this conflates genuine overtaking
with "free" position gains from cars retiring ahead of them — a driver
starting P22 and finishing P14 in a 7-DNF race didn't pass 7 cars, most
of that gap is retirements. Jolpica gives start/finish classification
only, not lap-by-lap position data, so a true "overtakes" count isn't
achievable with the current data source (that would need OpenF1's live
timing feed — a separate, larger investigation, not in scope here). What
*is* achievable now, using data already cached: subtract, per race, the
number of drivers who started ahead of this driver (`grid` less than
theirs) and did not finish (`dnf === true`). This directly corrects the
exact distortion described, using only the per-round `results` already in
`driverStats/{series}`:

```js
const deltas = useMemo(() => summary.map((driver) => {
  const perRound = rounds.map((round) => {
    const own = round.drivers?.find((entry) => entry.driverId === driver.id);
    if (!own || own.position === null || !Number.isFinite(own.grid)) return null;
    const attritionAhead = (round.drivers || []).filter((entry) =>
      entry.dnf && Number.isFinite(entry.grid) && entry.grid < own.grid
    ).length;
    return (own.grid - own.position) - attritionAhead;
  }).filter((value) => value !== null);
  const total = perRound.reduce((sum, value) => sum + value, 0);
  return { ...driver, delta: total, average: perRound.length ? total / perRound.length : 0 };
}).sort((a, b) => b.average - a.average), [summary, rounds]);
```

Also rename the section from "Qualifying vs race" to something that
doesn't imply raw overtaking — e.g. "Grid-to-finish movement" — and
update the existing caption (currently "Positive values indicate
positions gained from the grid to the classified race finish") to note
the attrition adjustment, e.g. "Adjusted for cars that retired ahead of
this driver — not a count of on-track overtakes." Keep the underlying
per-round `driverStats` data unchanged (raw grid/position/dnf) — this is
a display-layer computation, not a schema or backend change, and the raw
numbers stay available as-is for future use (e.g. as input to the v3 AI
Insight panel).

## 3. Mobile nav — hamburger + slide-out drawer — `F1League.jsx`

Confirmed via a real mobile screenshot: the sidebar (`grid-cols-1
lg:grid-cols-4`, sidebar div at ~line 786, `lg:col-span-1`) stacks above
the main content on any screen below the `lg` breakpoint, meaning a user
scrolls past all 12 nav items before reaching any actual page content.

Fix: below `lg`, hide the sidebar by default behind a hamburger toggle.
- Add a `mobileMenuOpen` state (default `false`) to the root `F1League`
  component.
- Add a hamburger button (`lg:hidden`) in the top `<nav>` bar (~line 771),
  toggling `mobileMenuOpen`.
- The sidebar div (~line 786) gets `${mobileMenuOpen ? 'block' : 'hidden'}
  lg:block` instead of always rendering — so `lg`+ behavior is completely
  unchanged (sidebar always visible, exactly as today), only the
  below-`lg` behavior changes.
- Close the drawer automatically when a nav item is selected (set
  `mobileMenuOpen(false)` in the existing per-item `onClick`, alongside
  the existing `setCurrentView` call) — standard pattern, don't leave the
  drawer open after navigating.
- No change to the actual nav item list, icons, or `lg`+ desktop rendering
  at all — this is additive, mobile-only.

## 4. Stacked prediction-status banners — `PredictionView.jsx`

Confirmed live via screenshot: "PREDICTIONS NOT YET OPEN" and
"PREDICTIONS OPEN" render simultaneously and contradict each other. Root
cause confirmed by direct code read: the pre-open banner (`isNotYetOpen`,
~line 652) and the status banner (`raceStatus !== null`, ~line 670) are
two independent conditions — `isNotYetOpen` being true doesn't suppress
the second banner at all. The Save button's own disabled logic already
correctly uses `isNotYetOpen` (~line 805) — this is a display-only bug,
not a lock-bypass, confirm that stays true after the fix.

Fix: change the status banner's condition from `raceStatus !== null` to
`raceStatus !== null && !isNotYetOpen` (~line 670) — the generic
locked/open status banner should not render at all while the round hasn't
opened yet; the pre-open banner already tells the user everything they
need to know in that state. No change to `editLocked`, `isNotYetOpen`,
or the Save button's gating logic.

## 5. Verify RaceFans feed is F1-scoped — `functions/index.js`

Confirmed via live screenshot: the News tab surfaced "Video: IndyCar round
13 race highlights – Portland" attributed to RaceFans. This app already
hit and fixed the exact same class of bug once this session (Sky Sports'
feed being general-sports rather than F1-specific, caught only by reading
actual rendered content, not by checking the feed parsed). **Verify live
whether RaceFans' current `feedUrl` in `NEWS_SOURCES` is their general
feed (bleeding in other motorsport) or genuinely F1-scoped** — check
racefans.net for an F1-specific feed URL if the current one isn't. If no
F1-specific RaceFans feed exists, apply the same resolution already used
for Sky Sports: drop it as a source rather than ship mixed content. If a
better-scoped feed URL exists, swap to it. Either way, re-verify a few
days of real cached items afterward to confirm no further non-F1 items
leak through.

## 6. Validation checklist (Claude runs this after Codex, before deploy)

1. Read every file touched; diff against this spec.
2. Stats: confirm the dashed line actually renders for the lower-points
   teammate when both are selected together — spot-check a real pair.
3. Stats: confirm the adjusted delta calculation against a hand-computed
   example from real cached data (pick one high-DNF race, verify the
   attrition subtraction matches manually).
4. Mobile nav: confirm `lg`+ desktop rendering is pixel-identical to
   before this change (this must not regress) — then confirm mobile
   shows a closed drawer by default, opens on tap, closes after
   navigating.
5. PredictionView: confirm the two banners never co-render in any state,
   and confirm the Save button's disabled/enabled behavior is completely
   unchanged from before this fix — this is the one thing that must never
   regress on this page.
6. News: confirm RaceFans' live feed content over a few real cached items
   is F1-only after whatever change (or no-op) was made.
7. `npm run build` — confirm it succeeds, no bundle-size surprises.
8. Exercise all of this live via `security/e2e-test-signin.cjs` +
   Playwright, same pattern as prior rounds — confirm no console errors,
   confirm normal prediction save/submit still works end-to-end.
