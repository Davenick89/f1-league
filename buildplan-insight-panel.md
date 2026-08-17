# Build plan: Race Insight Panel (v3) — deterministic, no LLM

**For Codex (bulk implementation) + Claude (validation).** This file is the
spec — implement it directly, don't redesign it.

**Timing note:** this is targeted at shipping before the Zandvoort lock
(Aug 21, ~13:30 UTC). It touches `PredictionView.jsx`, the page players use
to submit picks. **If validation isn't comfortably done by Aug 19, stop and
ship after the race weekend instead** — a broken prediction form during a
live lock window is far worse than a feature arriving a week late.

## Why this shape

v3 was originally specced as an LLM-generated insight panel grounded in
the v2 news corpus. **That corpus is gone**: the section 0 terms check
(2026-08-14) found all 8 news sources prohibit LLM-derivative use — see
`buildplan-news-ai.md`, now parked, for the full findings. The LLM design
isn't wrong, it just has nothing legitimate to ground in right now.

What survives is the half that never had a terms question: **v1's stats
data, from Jolpica's open data.** So v3 ships as a deterministic form
guide — real numbers, computed from already-cached data, rendered through
fixed templates. No LLM, no API key, no per-token cost, no hallucination
risk, and nothing to label as AI-generated because nothing is generated.

**This is deliberately not a recommendation engine.** It surfaces facts
and lets the player decide. Never render "pick X" or any predictive claim
— the app shows what happened, the player decides what happens next. That
boundary is what keeps this honest and keeps it out of the trust problems
the LLM version would have carried.

## 1. No new backend — read what already exists

Everything needed is already cached and already client-readable:
- `driverStats/{series}` — per-round results (`grid`, `position`, `dnf`,
  `dns`, `points`, `constructorId`) plus `driverStandings`/
  `constructorStandings` snapshots. `StatsView.jsx` already reads this
  exact doc; `firestore.rules` already permits authenticated reads.
- `getDriverCircuitHistory` (`onCall`, already deployed) — driver×circuit
  all-time history, cached per pair in Firestore after first request.

**Do not add a Cloud Function, a Firestore collection, or a rules block
for this feature.** If you find yourself writing one, re-read this
section — the data is already there.

## 2. What the panel shows

A new read-only section in `PredictionView.jsx`, **above** the existing
prediction form, inputs untouched below it.

Driver set: top ~8 by current championship position, from the latest
cached round's `driverStandings` in `driverStats/{series}` (already in
standings order — same source `StatsView.jsx` uses, don't recompute).

Per driver, computed client-side from cached rounds:
- **Recent form** — points scored across the last 3 cached rounds, plus
  whether that's above or below their own season average per round.
  Phrase as fact: "18 pts in last 3 rounds (season avg 7.2/round)".
- **Qualifying** — average grid position over the last 5 cached rounds.
  Directly relevant to the Pole field.
- **Finishing** — wins / podiums / DNFs this season (`StatsView.jsx`
  already computes exactly this in its `summary` memo — reuse the logic,
  don't reimplement it; if it's cleanly liftable, move it to `shared.js`
  and import in both rather than duplicating).
- **Grid-to-finish movement** — the attrition-adjusted metric from
  `buildplan-ux-fixes.md` section 2, already in `StatsView.jsx`. Same
  reuse note applies. Relevant to the R# field.
- **Track history at this round's circuit** — see section 3.

## 3. Track history — lazy, optional, never blocking

Highest-value signal for "who goes well *here*", but it needs care:

- The current round hasn't been raced, so its `circuitId` isn't in
  `driverStats`' cached rounds. Get it from the season-schedule endpoint
  the same way `StatsView.jsx` already resolves its circuit list — match
  on round number. If that fetch fails, **omit track history entirely and
  render the rest of the panel**; it's an enhancement, not a dependency.
- Call `getDriverCircuitHistory` per rendered driver, in parallel, only
  for the current circuit. First viewer of a round populates the
  per-pair Firestore cache; everyone after hits it instantly.
- Render as fact: "Zandvoort: best P1 (2024), 3 starts". Omit the line
  for any driver with no history at that circuit — don't render "0
  starts" as if it were a finding.
- **Must be non-blocking**: the panel renders immediately with season
  stats, and track-history lines fill in as they resolve. A failed or slow
  call degrades to that line being absent, silently.

## 4. Hard constraint — never block the form

`PredictionView.jsx` is the most safety-hardened page in this app
(offline-write guards, `waitForServerAck`, lock-time enforcement). The
panel is additive and must be completely severable:
- If `driverStats/{series}` is missing, empty, or fails to load, **render
  no panel at all** — no error state, no spinner, no layout shift. The
  form appears exactly as it does today.
- No `await` anywhere in the panel's data path may delay the form
  rendering or the Save button becoming usable.
- Collapsible, defaulting to **collapsed on mobile** and expanded on
  desktop — mobile users are there to submit picks, and the Zandvoort
  screenshots showed how quickly vertical space disappears on a phone.

## 5. Validation checklist (Claude runs this after Codex, before deploy)

1. Read every file touched; diff against this spec.
2. **Confirm no new Cloud Function, collection, or rules block was added**
   — section 1 says none is needed; if one appeared, that's a spec
   deviation to understand before deploying.
3. **Confirm the prediction form renders and the Save button works with
   the panel's data source completely unavailable** — test it by pointing
   the read at a non-existent doc, not by reading the code. This is the
   one thing that must never regress.
4. Verify computed numbers against `StatsView.jsx` for the same drivers —
   the two views read the same cached data, so wins/podiums/DNFs and
   grid-to-finish movement must agree exactly. A mismatch means logic was
   duplicated and drifted rather than reused.
5. Confirm track history degrades silently: block the circuit-schedule
   fetch and confirm the panel still renders its season stats.
6. Confirm no predictive or recommending language rendered anywhere —
   facts only.
7. `npm run build` — confirm no bundle-size regression on
   `PredictionView.jsx`'s existing chunk.
8. Exercise live via `security/e2e-test-signin.cjs` + Playwright at both
   desktop and phone viewports — confirm the panel renders, confirm
   collapsed-by-default on mobile, confirm a normal prediction
   save/submit still works end-to-end exactly as before, zero console
   errors.
