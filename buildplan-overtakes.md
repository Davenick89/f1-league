# Build plan: On-track overtakes + Jolpica request discipline

**For Codex (bulk implementation) + Claude (validation).** Implement as
written; don't redesign.

**Depends on `buildplan-readability.md` having shipped** — section 3 below
modifies the merged "Season form" table that round creates. Don't start
this until that's deployed.

## Why, and the finding that shapes it

A research pass (2026-08-17, live-tested against Round 11) established:

- **Jolpica serves lap-by-lap position** via `laps.json`, with `driverId`
  and `position` per timing entry. Viable.
- **`limit` is silently capped at 100** regardless of what's requested, so
  a round's ~1,430 lap×driver rows need 15 paginated requests, plus 1 for
  pitstops. ~16 requests, ~100KB per round.
- **The 429s this project keeps hitting are a concurrency limiter, not a
  volume limiter.** 48 sequential requests completed in 36s with zero
  failures; 20 parallel produced 3-20 failures, and 6 parallel was enough
  to break OpenF1. Recovery is immediate — a single sequential request
  straight after a burst succeeds. There are **no `Retry-After` or
  `X-RateLimit-*` headers**, so pacing must be hardcoded and conservative,
  not adaptive.

That last point is why this spec fixes two existing bugs before adding
anything (section 1). **OpenF1 was evaluated and rejected** for this
feature: its request-count advantage is worthless once you know count
isn't the constraint, `/v1/laps` carries no position field at all, and
`/v1/position` returns timestamped events that need correlating to lap
boundaries — real complexity and a bug surface, for no gain.

---

## 1. Fix the two existing concurrency-burst sites

**This is the highest-value part of this spec and is independent of the
overtakes feature.** Both are confirmed causes of live 429s.

### 1a. `refreshDriverStatsCache` — `functions/index.js`

It fetches results, driverStandings and constructorStandings per round via
`Promise.all`. Serialize them instead — three sequential awaits. The
existing 500ms inter-round delay stays. At ~0.75s per request this costs
about 1.5s more per round and removes a confirmed 429 source.

### 1b. Race Insight Panel track history — `PredictionView.jsx`

It fires `getDriverCircuitHistory` for ~8 drivers in parallel on panel
load. Confirmed live: 3 of 8 failed with `HttpsError("unavailable")`, so
those drivers silently lose their track-history line on first view of a
round.

Serialize these calls, and keep them **fully non-blocking** — the panel
must still render its season stats immediately and fill track-history
lines in as each resolves, exactly as it does now. Do not introduce a
loading gate that waits for all of them.

Note the existing per-pair Firestore cache means this burst only happens
on the *first* view of a new round, which is why it looked intermittent.
Serializing makes that first view slightly slower and completely
reliable — the right trade.

### 1c. Write the rule down

Add a comment at the top of the Jolpica fetch helpers in
`functions/index.js` stating the rule plainly: **never `Promise.all` over
Jolpica or OpenF1 requests; always sequential.** Include the measured
numbers (48 sequential fine, 6 parallel enough to fail) so the next person
doesn't rediscover it.

---

## 2. Backend — `refreshOvertakeCache`, `functions/index.js`

A **new** scheduled function, deliberately separate from
`refreshDriverStatsCache`:
- Adding 16 requests/round to that function would push a 5-round run past
  the default 60s timeout.
- Two functions writing the same document is a write-contention risk.

Shape:
- `onSchedule`, hourly, with an explicit `timeoutSeconds` high enough for
  its per-run cap (16 sequential requests/round × 2 rounds ≈ 25-30s;
  set 120s for headroom).
- **Cap 2 rounds per invocation.** Lower than `refreshDriverStatsCache`'s
  5 because each round is 16 requests rather than 3. A cold 23-round
  backfill works off over ~12 hourly runs.
- Incremental, same pattern as the existing cache: track
  `lastCachedRound`, only fetch rounds after it.
- **All requests strictly sequential**, per section 1. 500ms between
  rounds; no delay needed between pages of the same round (48 back-to-back
  was measured clean), but do not parallelise them.
- Same failure discipline as every other cache in this codebase: on any
  failure, log with a `[refreshOvertakeCache]` prefix and leave existing
  cached data untouched. Never write a partial round.

Fetch per round: `laps.json?limit=100&offset=0,100,…` until returned rows
< 100, plus `pitstops.json` (fetch it for completeness//future use even
though the metric doesn't need it — it's one cheap request).

### The computation

For each lap N ≥ 2, for each driver D present at both lap N−1 and lap N:

```
rawGain      = position(N-1) - position(N)          // positive = moved up
retiredAhead = count of drivers that were ahead of D at lap N-1
               AND are absent from lap N            // retirement promotions
realGain     = rawGain - retiredAhead
```

Accumulate `realGain` when positive as **gained**; accumulate the absolute
value when negative as **lost**. A retirement behind D cannot affect D's
position, so no adjustment is needed on the loss side.

**Lap 1 counts**, measured from `grid` to lap-1 position — a good start is
genuinely passing people on track. Apply the same `retiredAhead` exclusion
using cars that started but never appear at lap 1.

**Pit cycles are deliberately NOT filtered.** Undercuts and overcuts are
meant to count as gains — that's an explicit product decision, and it also
removes the hardest part of the algorithm.

Store per round: `{ round, drivers: [{ driverId, gained, lost }] }`.

### Storage

One document per round: `driverStats/{series}/overtakes/{roundId}`.
Per-round docs avoid both write contention with `refreshDriverStatsCache`
and an unboundedly growing array. Mirrors the existing
`driverStats/{series}/circuits/{pairId}` subcollection pattern.

New `firestore.rules` block, same shape as the existing sibling —
single-expression, authenticated read, no client write:

```
match /driverStats/{series}/overtakes/{roundId} {
  allow read: if isAuth();
  allow write: if false;
}
```

**Claude must review this rules addition line by line before deploy**, per
this project's convention that `firestore.rules` is never trusted to a
build check alone.

---

## 3. Frontend — one column in the Season form table

`StatsView.jsx` reads the `driverStats/{series}/overtakes` collection
(sums `gained` across cached rounds per driver) and adds **one** column to
the merged Season form table from `buildplan-readability.md`:

| Driver | Wins | Podiums | DNFs | Overtakes | Grid→Finish (avg) |

To keep the table from growing past six columns, **drop the
"Gained (total)" column** — it's redundant against the average once you
know the round count, and the average is the comparable figure. Keep
"Gained (avg)".

Caption, adjacent to the column — wording matters here:

> Positions gained on track, including at the start and via pit strategy.
> Excludes places inherited from retirements. Not comparable with F1's
> official overtake statistics, which use different data and definitions.

That caveat is not optional. The number is honest only if what it counts
is stated.

**Degrade silently**: if the overtakes collection is empty or fails to
load (e.g. before the first backfill completes), render the column as "—"
rather than 0, and never block the rest of the table. Zero and
not-yet-computed are different facts.

---

## 4. Validation checklist (Claude runs this after Codex, before deploy)

1. Read every file touched; diff against this spec.
2. **Review the `firestore.rules` addition line by line** — single
   expression, `write: false` present, nothing else in the file broadened.
3. **Confirm no `Promise.all` remains over any Jolpica or OpenF1 request**
   anywhere in `functions/index.js`, and none over
   `getDriverCircuitHistory` in `PredictionView.jsx`. Grep for it; this is
   the spec's main correctness claim.
4. Confirm the Race Insight Panel still renders season stats immediately
   and fills track history in progressively — serializing must not have
   introduced a blocking wait.
5. **Hand-verify the overtake count for one real round.** Pick a race with
   several retirements, compute one driver's figure manually from the lap
   data, and confirm the function agrees. The retirement exclusion is the
   whole point of the metric — verify it, don't trust it.
6. Confirm a mid-backfill state renders "—" and not 0 for uncached rounds.
7. Confirm `refreshOvertakeCache` completes inside its timeout on a real
   2-round run, and that a forced mid-run failure leaves prior cached
   rounds intact.
8. `npm run build` — confirm success, no bundle-size surprise.
9. Exercise live via `security/e2e-test-signin.cjs` + Playwright at both
   viewports; screenshot the Season form table and send it back.
