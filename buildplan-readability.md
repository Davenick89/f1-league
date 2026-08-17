# Build plan: Stats & News readability pass

**For Codex (bulk implementation) + Claude (validation).** This file is the
spec — implement it directly, don't redesign it.

**Presentation-layer only.** No Cloud Functions, no Firestore schema
changes, no rules changes, no new API calls — with one named exception
(section 6, which strips text at normalize time in `functions/index.js`).
If you find yourself adding a data source, stop and re-read.

Visual reference for the before/after intent:
https://claude.ai/code/artifact/b948d91b-265f-4ce3-b312-3a5a658e98ed

## Why

Both data-heavy tabs hold the right information but are harder to read
than they need to be: numbers don't align for scanning, 22-row tables have
no visual anchor, and News cards are heavy and uniformly weighted. All
changes below were reviewed against real rendered screenshots.

---

## 1. Right-align numeric columns with tabular figures — `StatsView.jsx`

Highest gain per line changed. Every numeric `<td>`/`<th>` in the Stats
tables gets right alignment and `font-variant-numeric: tabular-nums`
(Tailwind: `text-right tabular-nums`). Left-aligned proportional digits
don't share a decimal axis, so scanning a column becomes reading it.

Applies to: wins/podiums/DNFs table, the new teammate table (section 4),
and any numeric column in track history.

## 2. Team colour rail on driver rows — `StatsView.jsx`

Add a 3px rounded colour bar before each driver's name in every table,
coloured from the existing `TEAM_COLORS` map (keyed by `constructorId` —
already in this file, don't build a second map). Ties tables to the chart,
which already colours by team, and makes teammates group visually.

Driver rows already have `constructorId` available via the same data the
chart uses. If a driver's `constructorId` isn't in `TEAM_COLORS`, fall
back to the existing `FALLBACK_COLOR` rather than rendering nothing.

## 3. Top 10 by default on long tables — `StatsView.jsx`

Three tables × 22 drivers is a wall. Show the top 10, with a
"Show all 22 drivers" expander. **Reuse the existing expander pattern
from `NewsView.jsx`** ("Show all 116" / `MOST_RELEVANT_PREVIEW_COUNT`) so
the two views behave consistently — same control style, same wording
shape. Don't invent a new interaction.

## 4. Replace grid-to-finish with teammate head-to-head — `StatsView.jsx`

**Remove the "Grid-to-finish movement" section entirely.** It's a proxy
metric that doesn't map to how people think about races, and the
attrition adjustment made it more accurate without making it more
meaningful.

Replace it with a **teammate head-to-head** table — same car, same
package, which is the comparison that actually settles arguments:

- For each round, group that round's drivers by `constructorId`. Where a
  constructor has exactly two drivers that round, compare them:
  - **Qualifying**: lower `grid` wins the round.
  - **Race**: lower `position` wins. Skip the race comparison for any
    round where either driver has `position === null` (DNF/DNS) — neither
    "won" a comparison that didn't happen. Do **not** count a DNF as a
    loss.
- Render one row per current teammate pair: driver names, the qualifying
  tally (e.g. "7 – 4"), and the race tally. Bold the leading side of each
  tally.
- Use both drivers' shared team colour as the row's rail (section 2).
- Handle mid-season driver changes gracefully: pair by whoever actually
  raced together in each round, and if a constructor had more than two
  drivers across the season, show the pairing with the most shared rounds
  rather than erroring or guessing.

Keep `gridToFinishDeltas()` in `shared.js` — **do not delete it.**
`PredictionView.jsx`'s Race Insight panel imports it and uses it there,
where "positions gained" reads naturally in a single-driver sentence.
This section only removes the Stats *table*, not the shared helper.

## 5. Group driver toggles by team — `StatsView.jsx`

The points-progression toggle currently renders 22 pills in championship
order — finding a driver means reading every label. Group into one row per
team: team colour swatch, team name, then that team's drivers as pills.
Keep Select All / Clear working exactly as they do now (including the
already-fixed behaviour where Clear genuinely clears — see the
`initializedDriversRef` comment in that file, don't regress it).

Constructor mode (`chartType === 'constructors'`) keeps its current flat
pill list — there's nothing to group by there.

## 6. Strip feed-category suffixes from headlines — `functions/index.js`

Publisher section tags are leaking into displayed titles: "…power unit
changes **| Brief**", "…quality racing? **| Debates and Polls**",
"…at summer break **| Formula 1**". These are the source's internal
content-type labels, not part of the headline.

Strip a trailing `| Segment` suffix in `normalizeNewsItems`'s `title`
handling. Be conservative:
- Only strip a **trailing** segment after the final `|`.
- Only when the trailing part is short (say ≤ 30 chars) — a long tail is
  more likely real headline text than a category label.
- Strip at most one such suffix, and never leave an empty title (if
  stripping would empty it, keep the original).

This is the one change that touches `functions/index.js`. It applies at
normalize time, so existing cached items keep their suffixes until each
source's next refresh — that's fine, no backfill needed.

## 7. Relative timestamps — `NewsView.jsx`

Replace `formatPublishedDate`'s absolute output ("Aug 10, 2026, 08:45 AM")
with relative time, since news is read by recency:
- under 1 hour → "Xm ago"
- under 24 hours → "Xh ago"
- yesterday → "Yesterday"
- under 7 days → "X days ago"
- older → fall back to a short absolute date ("10 Aug")

Keep the existing invalid-date guard (currently returns "Date unavailable")
— don't let a malformed `pubDate` render "NaN ago".

## 8. Lighten News cards — `NewsView.jsx`

- **Clamp excerpts to two lines** via CSS (`line-clamp-2`), rather than
  changing the stored 200-char truncation in `functions/index.js`. Display
  concern, not a data concern — and leaving the cache untouched means no
  refresh cycle is needed.
- **Reserve the thumbnail slot.** Sources without feed images currently
  produce a ragged left edge. Render a consistent placeholder block in the
  same dimensions when `imageUrl` is absent, so every card aligns. Keep
  the existing `onError` hide-on-broken-image behaviour, but have it fall
  back to the placeholder rather than collapsing the layout.
- **Give the first item in "Most relevant" a slightly larger title** so
  the section has a visual entry point instead of 15 identical cards.

---

## 9. Validation checklist (Claude runs this after Codex, before deploy)

1. Read every file touched; diff against this spec.
2. **Confirm `functions/index.js` changed only for section 6**, and that
   `firestore.rules` and all Cloud Functions other than
   `normalizeNewsItems` are untouched — this is otherwise a
   presentation-only round.
3. **Confirm `gridToFinishDeltas()` still exists in `shared.js` and
   `PredictionView.jsx`'s insight panel still renders its movement line.**
   Section 4 removes a table, not the shared helper — regressing the
   insight panel would be the easy mistake here.
4. Verify the teammate tallies by hand against cached data for at least
   one pair — confirm DNF rounds are excluded from the race tally rather
   than counted as losses.
5. Confirm the title-stripping regex doesn't damage legitimate headlines
   containing a pipe — test against a title with a long tail after `|`
   and confirm it's left alone.
6. Confirm relative timestamps read correctly across boundaries (minutes,
   hours, yesterday, several days, over a week) and that an invalid
   `pubDate` still degrades gracefully.
7. Confirm Select All / Clear still work on the regrouped driver toggles,
   including that Clear actually clears (previously-fixed bug).
8. `npm run build` — confirm success, no bundle-size surprise.
9. Exercise live via `security/e2e-test-signin.cjs` + Playwright at both
   desktop and phone viewports. Screenshot Stats and News at both sizes
   and send them over — this round is judged by eye, so the screenshots
   are part of the deliverable, not an optional extra.
