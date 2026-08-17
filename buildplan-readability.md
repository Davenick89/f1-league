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

## 4. Add teammate head-to-head, and consolidate the layout

Two goals at once: add the teammate comparison, and **end up with fewer
sections than today** rather than a sixth stacked panel.

Today there are five collapsible sections: points progression,
grid-to-finish movement, wins/podiums/DNFs, head-to-head (any two
drivers), track history. Target shape is **four**:

### 4a. Merge the two per-driver tables into one "Season form" table

Grid-to-finish movement and wins/podiums/DNFs are both per-driver season
tallies, rendered as two separate 22-row tables. Merge them into one:

| Driver | Wins | Podiums | DNFs | Gained (total) | Gained (avg) |

Same data, same computations (`summarizeDriverSeason()` and
`gridToFinishDeltas()` from `shared.js` — reuse both, don't reimplement).
One table of 22 rows instead of two, so this is a net density *reduction*
even though no metric was dropped. Keep the existing `overflow-x-auto`
wrapper — six columns will scroll horizontally on a phone, which is the
pattern these tables already use.

**Grid-to-finish stays** — it was corrected for attrition and is worth
keeping for anyone interested; it just doesn't need a section of its own.
Keep the existing caption explaining the attrition adjustment ("not a
count of on-track overtakes") attached to those two columns, since that
caveat is what makes the number honest.

### 4b. New teammate head-to-head, merged into the existing comparison section

Combine the new teammate table and the existing any-two-drivers picker
into **one "Head-to-head" section with two modes** (a segmented control:
"Teammates" / "Any two drivers"). Defaults to Teammates, since that's the
comparison with no setup — it's already answered when you open it.

Teammate mode:
- For each round, group that round's drivers by `constructorId`. Where a
  constructor fielded exactly two drivers that round, compare them:
  - **Qualifying**: lower `grid` wins the round.
  - **Race**: lower `position` wins. **Skip the race comparison entirely
    for any round where either driver has `position === null`** (DNF/DNS)
    — neither driver "won" a comparison that didn't happen. Do **not**
    count a DNF as a loss.
- One row per teammate pair: both names, the qualifying tally ("7 – 4"),
  and the race tally. Bold the leading side of each.
- Row rail uses the pair's shared team colour (section 2).
- Handle mid-season changes gracefully: pair by who actually raced
  together each round, and where a constructor used more than two drivers
  across the season, show the pairing with the most shared rounds rather
  than erroring or guessing.

"Any two drivers" mode keeps today's behaviour exactly — same pickers,
same per-round list, same `teammates` flag annotation.

**Keep `gridToFinishDeltas()` in `shared.js` regardless** —
`PredictionView.jsx`'s Race Insight panel imports it, and it reads
naturally there in a single-driver sentence. Nothing in this round should
touch that helper's signature or behaviour.

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
3. **Confirm `gridToFinishDeltas()` and `summarizeDriverSeason()` are
   unchanged in `shared.js`, and `PredictionView.jsx`'s insight panel
   still renders its movement line.** Section 4a merges two tables that
   consume those helpers; it must not alter the helpers themselves.
   Regressing the insight panel is the easy mistake in this round.
4. **Confirm the section count actually went down** — five sections
   before, four after (progression / season form / head-to-head /
   track history). If it's still five or more, the consolidation in
   section 4 wasn't done as specced.
5. Verify the teammate tallies by hand against cached data for at least
   one pair — confirm DNF rounds are excluded from the race tally rather
   than counted as losses, and that qualifying and race tallies can
   legitimately differ in total (a pair can have 11 qualifying
   comparisons but only 9 race ones).
6. Confirm the title-stripping regex doesn't damage legitimate headlines
   containing a pipe — test against a title with a long tail after `|`
   and confirm it's left alone.
7. Confirm relative timestamps read correctly across boundaries (minutes,
   hours, yesterday, several days, over a week) and that an invalid
   `pubDate` still degrades gracefully.
8. Confirm Select All / Clear still work on the regrouped driver toggles,
   including that Clear actually clears (previously-fixed bug).
9. `npm run build` — confirm success, no bundle-size surprise.
10. Exercise live via `security/e2e-test-signin.cjs` + Playwright at both
   desktop and phone viewports. Screenshot Stats and News at both sizes
   and send them over — this round is judged by eye, so the screenshots
   are part of the deliverable, not an optional extra.
