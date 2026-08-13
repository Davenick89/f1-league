# Build plan: AI Insight Panel (v3) — supersedes the original digest design

**This spec replaces an earlier version of this file.** The original v3
design was a scheduled digest bolted onto the News tab. After seeing v2
live, the app's owner said they weren't convinced by the News tab as a
destination and clarified the actual intent: the article corpus (v2) and
the stats data (v1) should ground a feature that helps a player decide who
to pick, surfaced where picks actually get made — not a second thing to
read. This document is that redesign, not an addition alongside the old
one.

**On the original "wait until v2 is proven" gate**: this feature depends
on v2's *cache* (the `news/{sourceId}` pipeline — proven, live, 8 working
sources, already validated end-to-end), not on the News tab's UI being a
proven destination. That dependency is already satisfied. What still
deserves real care: this is the first LLM-cost-bearing function in this
app, and it's surfaced on `PredictionView.jsx` — the single highest-stakes,
most safety-hardened page in the app (offline-write guards,
`waitForServerAck`, lock-time enforcement all live there). Build and
validate this carefully for those two reasons specifically, not because of
a calendar-time gate.

## Why this shape, not a chat interface

Confirmed directly with the app's owner: not open-ended chat. Contextual
suggestions inside `PredictionView.jsx`, at the point of the actual pick.

Also confirmed by reading `PredictionView.jsx` directly: every prediction
field is a plain native `<select>` of `F1_DRIVERS` (`shared.js`) — there is
no per-option rich-content slot, so a "hover a driver for insight" design
would require replacing the select inputs, which is far too risky a change
to the app's most safety-hardened flow for what this feature needs.
Instead: **one read-only "AI Insight" panel, above the existing form,
with the actual prediction inputs completely untouched below it.** Zero
risk to prediction-submission mechanics.

## 0. GATE — check the 8 sources' terms before writing any code

**Do this first; it can change what gets built.** v2 verified that the 8
sources' feeds *worked* and were F1-scoped. Nobody has checked whether
their terms permit using their content as LLM input to produce a
user-facing derivative — a different use from v2's headline-plus-excerpt-
plus-link-out, and the one publishers most commonly restrict, since a
generated answer removes the reader's reason to click through.

For each of the 8 (`NEWS_SOURCES` in `functions/index.js`: Autosport, BBC
Sport, F1Technical, GrandPrix.com, The Guardian, Motorsport.com,
RaceFans, The Race), check the RSS/content terms for: "personal,
non-commercial use only" clauses, restrictions on derivative or
machine-generated works, and anything about AI/LLM training or inference.
Read the actual terms pages — this is the same verify-live-don't-assume
discipline that caught the Formula1.com restriction and the Sky Sports
content bug.

Any source whose terms don't permit this use gets **excluded from the LLM
corpus only** — it stays in the News tab exactly as today, since v2's
aggregation use was already verified acceptable for all 8. These are two
separate permissions; losing one doesn't lose the other. If enough
sources are excluded that the remaining corpus is too thin to ground
anything useful, stop and report back rather than shipping a panel with
nothing behind it.

**Formula1.com stays out of the corpus entirely** — decided 2026-08-10,
see CLAUDE.md's RSS News Tab section for the full reasoning. Do not
re-open this without the user explicitly asking.

## 1. Backend — `refreshRoundInsights`, `functions/index.js`

Modeled on this app's established cache-then-serve pattern
(`refreshScheduleCache`/`refreshDriverStatsCache`/`refreshNewsCache`), but
with a different trigger condition — this one costs real money per
generation (an LLM call), unlike a plain fetch:

- `onSchedule`, daily — but **no-op most days**. Only call the LLM if (a)
  the current round has changed since the last cached generation (derive
  the current round the same way `NewsView.jsx` already does, via
  `getCurrentRound()`/`F1_SCHEDULE_2026` in `shared.js` — don't
  reimplement), or (b) meaningfully new news volume has landed in the
  "most relevant" window since the last generation. Regenerating for an
  unchanged round on an unchanged news set is pure waste.
- **Driver selection for the panel**: union of (a) the top N drivers by
  current championship position (already in cached standings order in
  `driverStats/{series}`) and (b) any driver whose name appears in this
  round's "most relevant" news window (reuse `NewsView.jsx`'s existing
  date-window logic, don't reimplement it). Cap the union at ~8-10 drivers
  so both the LLM call and the rendered panel stay bounded.
- **Driver name matching**: `F1_DRIVERS` (`shared.js`) holds full display
  names ("Max Verstappen"); `driverStats/{series}`'s cached entries already
  store `driverName` built the same way from Jolpica's given/family name —
  these should match directly. **Normalize (trim, case-fold) before
  comparing, and verify all 22 `F1_DRIVERS` names actually match cached
  `driverName` values during validation** — a silent mismatch would drop a
  driver from the panel with no visible error anywhere.
- LLM call: API key via `defineSecret`, same established pattern as
  `GMAIL_USER`/`UNSUBSCRIBE_SIGNING_KEY`. **Provider choice is a real
  decision — confirm with the user at build time, don't silently lock one
  in.** Input per selected driver: their cached stats (recent form/points
  trend, track history at this round's circuit if cached, qual-vs-race
  delta) plus any news items mentioning them in the relevant window.
  Output: a short (2-3 sentence) per-driver blurb where **every claim is
  traceable to a specific stats field or a specific cached news item** —
  this is what makes the labeling requirement below actually checkable,
  not just a UI disclaimer.
- Cache to `roundInsights/{series}` (single doc, overwritten each
  generation, no history needed). Never overwrite with a failed/partial
  LLM response — same "don't cache a bad result as truth" principle as
  every other cache in this app.

## 2. Frontend — `PredictionView.jsx` addition

- New read-only section, above the existing prediction form, inside the
  same file — **not** a new lazy-loaded view. This needs to load with the
  form itself, not live behind separate navigation.
- Reads `roundInsights/{series}` via `onSnapshot`, same pattern as every
  other cache read in this app.
- **Must be labeled unambiguously as AI-generated** — e.g. "AI insight, may
  be inaccurate — verify before you pick" — with each driver's blurb
  showing or linking the specific stats/news item it drew from. Carried
  over from the original design, and matters *more* here, not less: this
  panel sits directly above the controls a player uses to make their
  actual pick — a more consequential placement than a digest ever was.
  Do not soften or drop this requirement for a cleaner UI.
- Degrades silently to not rendering the panel at all if no cached insight
  exists yet (first deploy, before the function's first run). Never show a
  loading state that blocks or delays the actual prediction form
  underneath it.

## 3. Validation checklist (Claude runs this after Codex, before deploy)

1. Confirm section 0's terms check was actually done, and that the
   corpus only draws from sources it cleared — check the shipped source
   list against the check's findings, not just that a check happened.
2. Read every file touched; diff against this spec.
3. **Confirm all 22 `F1_DRIVERS` names match `driverStats` `driverName`
   values** after normalization — check this directly, don't trust it.
4. Confirm the no-op/regeneration-trigger logic actually skips a call when
   the round hasn't changed and news hasn't meaningfully moved — this is a
   cost control; verify it doesn't silently call the LLM every single day.
5. Confirm every rendered blurb traces back to a real stats field or a
   real cached news item — spot-check actual output, not just the code.
6. **Confirm the panel never blocks or delays the prediction form itself
   rendering and being usable** — this is the one thing that must never
   regress, on the single most sensitive page in this app.
7. `npm run build` — confirm no bundle-size regression on
   `PredictionView.jsx`'s existing chunk (this isn't a new lazy chunk, it's
   added directly to an existing one — check its size before/after).
8. Exercise live via `security/e2e-test-signin.cjs` + Playwright, same
   authenticated-verification pattern as v1/v2 — confirm the panel
   renders, confirm normal prediction save/submit still works end-to-end
   exactly as before, zero console errors.
