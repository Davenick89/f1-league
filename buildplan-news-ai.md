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
- **LLM call — OpenRouter** (decided 2026-08-14). API key via
  `defineSecret`, same established pattern as
  `GMAIL_USER`/`UNSUBSCRIBE_SIGNING_KEY`. OpenRouter fronts many models
  behind one endpoint and key, so the model becomes a config string rather
  than an integration. Put it behind a single `generateInsight()` seam so
  swapping models — or providers entirely — is a one-line change.
  - Pick the specific model from OpenRouter's live model list at build
    time; don't hardcode one from this document, model naming moves fast
    and this spec may be stale by then. A fast mid-tier model is ample —
    this is short, grounded, batch generation, not frontier reasoning.
  - Self-hosting (Ollama + Qwen3 8B on the VPS) was costed out and set
    aside: the VPS has 11GB RAM with no GPU and also runs dev sessions,
    Codex and Chromium, so an 8B model fits but leaves the box contended;
    more importantly, hosting weights would force this function off Cloud
    Functions entirely (they can't host a local model) onto a VPS cron,
    making a dev box a production dependency. OpenRouter keeps the
    architecture as specced. Revisit only if API cost or availability
    actually becomes a problem — the seam above makes that cheap.
- **One LLM call per driver, not one call containing all drivers.** Less
  context per call means less room to drift — which directly serves the
  traceability requirement — and one driver's failed generation doesn't
  take down the whole batch. Same total cost, better output, more robust.
- Input per driver: their cached stats (recent form/points trend, track
  history at this round's circuit if cached, grid-to-finish movement) plus
  any news items mentioning them in the relevant window. Output: a short
  (2-3 sentence) blurb, returned as **structured JSON carrying explicit
  source references** — e.g. `{ text, sources: [{ type: "stat", field },
  { type: "news", link }] }`. Free-text output with sources named only
  inside the prose is not sufficient; section 1a depends on these being
  machine-checkable.

### 1a. Citation validation — reject, don't trust

Before anything is cached, validate every blurb's `sources` array
programmatically:
- Each `type: "news"` reference must match the `link` of an item actually
  present in the cached `news/{sourceId}` docs.
- Each `type: "stat"` reference must name a field that actually exists for
  that driver in `driverStats/{series}`.
- A blurb with any unresolvable reference is **dropped, not cached**, and
  logged with the offending reference. Better to show fewer drivers than
  one fabricated claim.

This is the real guard against hallucination, and it's deliberately
deterministic rather than a second "verifier" LLM — a fabricated citation
is caught with certainty and in milliseconds, where a verifier model would
only approximate the same check probabilistically at extra cost. If a
chosen model turns out to fail this check often, that's evidence to switch
models via the seam above, not to add more model layers.

### 1b. Cost shape — bounded by design, not by user count

Worth stating explicitly since it drives whether this ever needs metering:
this is a **scheduled batch job**, not a per-user or on-demand call. Cost
is a function of rounds per season and drivers per round — roughly ten
short generations on the days it runs at all, and it no-ops entirely on
unchanged days. **It costs the same with 10 users or 10,000**, because
every user reads the same cached Firestore doc.

That means usage cost cannot spiral with growth, and no premium tier or
metering is needed to contain it. Keep it that way: **do not add a
per-user or on-demand LLM path** (e.g. "ask a question about this
driver") without re-costing from scratch — that would change the cost
model from O(1) per day to O(users), which is the shape that would
actually need a paid tier behind it.
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
5. **Test citation validation (section 1a) against a deliberately bad
   response** — feed it a blurb citing a news link and a stat field that
   don't exist, and confirm it's dropped rather than cached. This is the
   feature's main safety mechanism; verify it by making it fire, not by
   reading the code.
6. Confirm every rendered blurb traces back to a real stats field or a
   real cached news item — spot-check actual output, not just the code.
7. **Confirm the panel never blocks or delays the prediction form itself
   rendering and being usable** — this is the one thing that must never
   regress, on the single most sensitive page in this app.
8. `npm run build` — confirm no bundle-size regression on
   `PredictionView.jsx`'s existing chunk (this isn't a new lazy chunk, it's
   added directly to an existing one — check its size before/after).
9. Exercise live via `security/e2e-test-signin.cjs` + Playwright, same
   authenticated-verification pattern as v1/v2 — confirm the panel
   renders, confirm normal prediction save/submit still works end-to-end
   exactly as before, zero console errors.
