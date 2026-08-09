# Build plan: RSS News Tab (v2)

**For Codex (bulk implementation) + Claude (validation).** This file is the
spec — implement it directly, don't redesign it. Claude will read every
file touched, diff against this spec, and validate before deploy.

**Do not run this alongside another `buildplan*.md` in the same working
tree at the same time.** Run one Codex build at a time.

## Why

Second phase of a 4-phase roadmap (v1, Driver/Team Performance Stats,
already shipped and audited). v2 is a plain RSS news tab: curated
headlines + short excerpts + source attribution + link-out to the
original article. **No AI summarization** (that's v3, a separate later
spec, explicitly deferred) and **no full-page scraping** — this app's
owner wants to stay on the safe, legitimate side of using RSS feeds as
they're intended (personal/aggregator reading), never republishing full
article text or bypassing paywalls.

**This spec could not be live-verified against the real RSS feeds before
being written** — this project's design sandbox has no outbound network
access to these hosts. Every source's actual feed availability, and the
`rss-parser` library's behavior against them, needs confirming live
during implementation, not assumed from this document.

## Candidate sources (12) — verify all live, drop any that don't work

formula1.com, f1technical.net, espn.in/f1, the-race.com, motorsport.com,
skysports.com/f1, theguardian.com/sport/formulaone, grandprix.com,
autosport.com/f1, racefans.net, bbc.com/sport/formula1.

Rough prior on likely reliability (unverified, just a starting point for
where to look first — **do not skip verifying any of these, in either
direction**): BBC Sport, The Guardian, and RaceFans.net are more likely to
have stable public feeds. Formula1.com (official rightsholder site),
ESPN F1 (ESPN deprecated many regional RSS feeds years back), and
GrandPrix.com (older site infrastructure) are more likely to need
dropping. **Verify all 12 regardless — this ranking could be wrong in
either direction.** Ship with whichever subset actually has a working
feed; don't force a source that isn't there.

## 1. Backend — `refreshNewsCache`, `functions/index.js`

Model this on the existing `refreshScheduleCache`/`refreshDriverStatsCache`
functions in the same file: `onSchedule`, try/catch per unit of work,
never corrupt or clear existing good cache data on a failure.

- Add `rss-parser` as a new dependency in `functions/package.json` (pure
  JS, works with this file's CommonJS `require()` style, handles RSS 2.0
  and Atom, tolerant of malformed feeds).
- Schedule: every 30 minutes. If a feed provides a `<ttl>` element, treat
  it as a minimum polling interval for that source rather than ignoring
  it — don't poll a feed faster than it says it wants.
- **One Firestore doc per source**, not one combined doc:
  `news/{sourceId}` (e.g. `news/bbc`, `news/racefans`) — pick short,
  stable, lowercase `sourceId` values. Doc shape:
  `{ sourceName, sourceUrl, items: [...], fetchedAt }`. Cap `items` to the
  most recent ~15-20 entries per source.
- Loop over all configured sources independently — one source's
  fetch/parse failure must not block the other sources' refresh (use
  `Promise.allSettled` or sequential with a per-source try/catch, either
  is fine; these are 12 different hosts, not repeated calls to one host,
  so there's no rate-limit-pacing concern like `refreshDriverStatsCache`
  had).
- **Only overwrite a source's doc if that fetch+parse succeeded and
  returned at least one item.** Same principle as this app's existing fix
  in `getDriverCircuitHistory` (don't cache a transient empty/failed
  result as permanent truth) — apply it here from the start, don't wait
  for an audit to catch it.
- No cross-run dedup logic needed — each successful refresh simply
  replaces a source's doc with its freshly-fetched most-recent items, same
  "always overwrite with freshly-validated data" pattern as
  `refreshScheduleCache`.
- Per stored item: `{ title, link, pubDate, sourceName, excerpt, imageUrl? }`.
  - **`excerpt` must be truncated to ~200 characters, always** — some
    feeds' description fields carry substantial content; capping keeps
    this unambiguously a snippet, not a republish.
  - **Never fetch the article page the RSS item links to.** Only ever
    store what the RSS item itself provides. This is the exact
    distinction between "aggregation" (what this feature is) and
    "scraping" (what it explicitly is not).
  - `imageUrl`, if the feed provides one: optional, best-effort. The
    frontend must render correctly without it. Hotlinking a publisher's
    images is a separate ToS consideration from text excerpts — this is
    the first thing to drop if it becomes an issue.

## 2. Frontend — new lazy-loaded `NewsView.jsx`

Follow the exact pattern established by `StatsView.jsx`:
- `React.lazy` import in `F1League.jsx`, a nav entry, rendered inside the
  existing shared `<Suspense>` block. Global data, not scoped to any
  league/group.
- Read all `news/{sourceId}` docs (small, bounded set), merge and sort by
  `pubDate` client-side into one combined feed, with a per-source filter
  toggle.
- Each item: headline, excerpt, "via {sourceName}" attribution, published
  date, link opening the original article in a new tab. No AI-generated
  content anywhere in this version — that's v3, not this spec.

## 3. Validation checklist (Claude runs this after Codex, before deploy)

1. Verify all 12 sources' actual RSS feed availability live. Drop any
   that don't have a working feed rather than forcing a broken source in.
2. Confirm `rss-parser` handles a deliberately-broken/malformed feed
   without crashing the whole refresh — test this directly, don't assume
   the library's fault-tolerance claims.
3. `npm run build` — confirm `NewsView`'s bundle is lazy-split (same check
   as was done for `StatsView`), not inlined into the main chunk.
4. Confirm excerpt truncation actually applies regardless of a given
   feed's raw content length.
5. Exercise the view against real cached data: confirm cross-source
   merge/sort works, and confirm a source with zero cached items (e.g. one
   dropped in step 1, or one that simply hasn't succeeded yet) doesn't
   break rendering.
6. Confirm nothing else regressed — existing views/nav still work.
