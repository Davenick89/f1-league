# F1 Karvaan — Predictions League

## What this is
A React single-page app for running an F1 predictions league among friends. Players predict pole, race podium, sprint results, and a random-slot driver each race weekend. Points are scored on exact matches.

**Live app:** https://f1-predictionsleague.web.app  
**Firebase project:** f1-predictions-league  
**GitHub:** https://github.com/Davenick89/f1-league

---

## Tech stack
- **Frontend:** React 18, Vite 5, Tailwind v4 (via `@tailwindcss/vite`, built at compile time)
- **Database:** Firestore (Firebase)
- **Auth:** Firebase Auth (Google sign-in)
- **Backend:** Firebase Cloud Functions (Node 22) — `functions/index.js`
- **Hosting:** Firebase Hosting → `dist/` folder
- **Scoring engine:** `scoring.js` (imported by F1League.jsx)

---

## Key files
| File | Purpose |
|---|---|
| `F1League.jsx` | Entire frontend — ~4460 lines, single-file SPA (see structure below) |
| `scoring.js` | Canonical scoring engine — `scoreRace()`, `rfDistance()`, `rfPoints()` |
| `firestore.rules` | Security rules — all auth/lock logic lives here |
| `functions/index.js` | Cloud Functions (v2, scheduled) — see below |
| `validation.js` | Input validation helpers — `sanitizeInput`, `validateGroupName`, `validateNickname`, `validateDriverName`, `validateInviteCode`, `validatePredictions` |
| `vite.config.js` | Vite config — dev server on port 5173 |
| `.claude/launch.json` | Dev server configs for Claude Code browser preview |
| `security/INCIDENT_RESPONSE.md` | Rollback procedures, deploy-phase checklists, backup/restore commands |
| `security/backup.sh`, `security/integrity-check.cjs` | Firestore backup and document-count integrity check |

There is no test suite (no test runner configured in `package.json` or `functions/package.json`).

### F1League.jsx structure
Single file, no router — view switching is done via local state. Top-level pieces, in file order:
`LandingPage` → `SetNicknameModal` → `F1League` (root component, holds most state/handlers) → `AdminWizard` (league creation) → `LeaderboardView` / `UserStatsCard` / `PlayerSummaryModal` → `PredictionView` (the per-race prediction form) → `SeasonBoardView` → `HowToPlayView` → `useF1ApiSchedule` (fetches the season calendar) → `ResultsView` (admin result entry + scoring trigger) → `LeagueSettingsCard` → `InvitesView` → `CalendarView` → `AuditView`.

Race schedule/session times come from the public **Jolpica Ergast API** (`https://api.jolpi.ca/ergast/f1/{season}.json`), fetched client-side — there is no local schedule data.

Push notifications use Firebase Cloud Messaging (`getMessaging`, service worker at `public/firebase-messaging-sw.js`), separate from the scheduled email reminders sent by Cloud Functions.

Scoring is computed **client-side**, not in a Cloud Function: when an admin enters/edits results in `ResultsView` (`handleSaveResults`), it calls `scoreRace()` / `rfDistance()` / `rfPoints()` from `scoring.js` directly and writes the result to `/groups/{groupId}/scores/{userId}`.

### Cloud Functions (`functions/index.js`)
All are scheduled (`onSchedule`) except the unsubscribe endpoint:
- `sendPredictionReminders` — emails players before lock
- `autoLockRound` — every 5 min, locks predictions once the lock time passes
- `autoOpenRound` — every 10 min, opens the next round's predictions
- `unsubscribeEmail` (`onRequest`) — one-click unsubscribe link handler

---

## Firestore collections
```
/users/{userId}                        — user profiles (own-doc read only)
/groups/{groupId}                      — league doc (members, admin, settings)
/groups/{groupId}/predictions/{userId} — per-user predictions (keyed by userId, not round)
/groups/{groupId}/scores/{userId}      — cumulative scores
/groups/{groupId}/results/{roundId}    — admin-entered race results
/groups/{groupId}/raceStatus/{roundId} — lock state, override window
/groups/{groupId}/randomNumbers/{roundId} — random slot number (immutable once set)
/groups/{groupId}/auditLog/{logId}     — prediction_submit / prediction_edit / admin_unlock
/groups/{groupId}/systemLogs/{logId}   — admin operation logs
/invites/{code}                        — invite links
```

---

## Prediction lock logic
- Default lock: **60 minutes before Qualifying** (or Sprint Qualifying on sprint weekends)
- Predictions open: **Monday 00:00 UTC of race week** — Save button disabled before this
- After lock: only admin can unlock via `handleUnlockPredictions()`
- Admin unlock opens a **15-minute override window** then auto-relocks
- `overrideExpiresAt` is a Firestore `Timestamp` — enforced server-side in `isRaceOpen()` via `request.time`

Key functions in F1League.jsx:
- `getPredictionLockTime(race, offsetMins, apiSessionStr)`
- `getPredictionOpenTime(race)` — returns Monday 00:00 UTC of race week
- `isEditLocked(race, offsetMins)`

---

## Scoring rules
- **Pole, Race P1/P2/P3, Sprint fields:** +1 for exact match
- **R# (random slot):** +2 exact position, +1 closest among all players, +0 otherwise
- **DNS / NC:** score 0 for R# (no official classified position)
- **DNF-but-classified:** scores normally at their official finishing position (≥90% race distance rule)
- Scoring engine: `scoreRace()` for exact fields, `rfDistance()` + `rfPoints()` for R#

---

## Audit log action types
- `prediction_submit` — first time a player saves predictions for a round
- `prediction_edit` — subsequent saves after predictions already exist
- `admin_unlock` — admin manually opened predictions post-lock

---

## Firestore Rules — critical constraint
**Rules functions cannot use `if` statements or multiple `return` statements.**  
Must be a single `return` expression chained with `&&` / `||` and optional `let` bindings.

```javascript
// WRONG — will not compile
function isRaceOpen(groupId) {
  if (!('currentOpenRound' in g)) return true;  // ❌
}

// CORRECT
function isRaceOpen(groupId) {
  let g = groupData(groupId);
  return !('currentOpenRound' in g) || (...);   // ✓
}
```

---

## Nickname reads — important pattern
`/users/{userId}` is restricted to own-doc reads only (security fix).  
All member nickname lookups across the app read from the **predictions document**, not the users document.  
Do not add new code that reads nicknames from `/users/{otherId}`.

---

## Deployment commands
```bash
# Frontend only
npm run build && firebase deploy --only hosting

# Rules only
firebase deploy --only firestore:rules

# Cloud Functions only
firebase deploy --only functions

# Everything
npm run build && firebase deploy
```

---

## Dev server
```bash
npm run dev       # Vite dev server — http://localhost:5173 (hot reload)
npm run preview   # Serve production build locally — http://localhost:4173
```

---

## Multi-agent setup (Claude + Codex)

This project uses a two-agent workflow. Claude Code is always the primary agent.
Codex is a worker — invoked by Claude Code via bash, never run manually.

### Division of responsibility

| Task | Who does it |
|---|---|
| Planning, architecture, decisions | Claude Code |
| Security-sensitive code (rules, auth) | Claude Code only |
| Bulk implementation, repetitive code | Codex |
| Validation, review, fixing | Claude Code |
| Deployment | Claude Code |

### Auth and model — this project

Codex auth here is the **ChatGPT Go login** (default `~/.codex`, no `CODEX_HOME`
override needed) — a small shared rate-limit pool, not pay-per-token. Only
`free-bird` (a separate project on this VPS) uses the isolated API-key
`CODEX_HOME`; that separation is automatic via a `cd`-based hook in `~/.bashrc`.

**Always pin the model explicitly** — see `~/CODEX_MODEL_SOP.md` for the full
rationale. **`gpt-5.6-sol` is not available on this project's ChatGPT Go login
at all** (confirmed 400 error: "not supported when using Codex with a ChatGPT
account") — only Terra and Luna are reachable here. If a task seems to need
Sol-level reasoning, scope it down for Terra rather than reaching for a model
this login can't use.

### How to invoke Codex

Always write a spec first, then pass it to Codex:

```bash
# Step 1 — write a clear spec
cat > /tmp/spec.md << 'EOF'
[describe exactly what to implement — file paths, logic, acceptance criteria]
EOF

# Step 2 — run Codex in full-auto mode (non-interactive), model pinned
codex exec -m gpt-5.6-terra --approval-policy=full-auto "$(cat /tmp/spec.md)"   # default for real work
codex exec -m gpt-5.6-luna  --approval-policy=full-auto "$(cat /tmp/spec.md)"   # mechanical/repetitive edits

# Step 3 — review what changed
git diff
```

### Validation after every Codex run

After Codex finishes, always:
1. Read every file it touched
2. Check the diff against the spec
3. Run `npm run build` — fix any build errors directly
4. Fix anything wrong before moving on

### When NOT to use Codex

- Firestore security rules (syntax constraints — Claude Code knows them, Codex may not)
- Auth flows
- Anything touching the scoring engine (scoring.js) — correctness is critical
- Deployment commands

---

## VPS dev environment
- **Host:** Firebird VPS (`vmi3099394`) — Ubuntu 24.04 LTS
- **User:** `controller`
- **Project path:** `~/f1-league`
- **tmux session:** `f1-league`
- **Node:** v20.20.2 (via nvm)
- **Firebase CLI:** v15.24.0

---

## Session status as of 2026-08-06 (for a fresh Claude Code session picking this up)

**Git is ahead of what's live.** `origin/main` has three commits
(`1b1d7e9`, `0a92d46`, `f615ae1`, all below) that have **not been deployed**
yet — `npm run build && firebase deploy` still needs to run from a machine
with real Firebase credentials (this VPS). Do that first, then read the
rest of this section before assuming anything needs redoing.

**Fully complete and previously deployed (before this session's follow-up):**
- Track A — lock-time unification (`functions/index.js` now matches the
  frontend's qualifying-based, per-group-offset logic; root cause of the
  2026-07-24 incident).
- Track B — 10 security/correctness fixes from the full Codex audit (rules
  round-scoping, unsubscribe HMAC token, non-atomic writes → batches, audit
  log integrity, season-prediction lock, invite race condition, email HTML
  escaping, scoring display de-dup, validator wiring).
- Post-Track-B audit fixes — retroactive-scoring gap in the round-scoping
  rule, group-join field-smuggling, `autoOpenRound` atomicity, and (the
  bigger one) invite redemption moved to a new `acceptInvite` Cloud
  Function — closes the "join without a valid invite" gap entirely; the
  group-update rule no longer has any client-writable path to add members.
- Track C — code-split `F1League.jsx` (4552 lines → ~1100-line shell +
  `shared.js` + 9 lazy-loaded view files) and fixed the per-league scores
  N+1 read (`GroupStandingBadge` now reads one precomputed summary doc).

**Committed to `origin/main` this session, not yet deployed:**
- `1b1d7e9` — Track A follow-up. `autoLockRound`/`autoOpenRound`/
  `sendPredictionReminders` (the actual lock authority per
  `firestore.rules`' `isRaceOpen()`) previously only read the hardcoded
  `F1_SCHEDULE_2026` mirror with zero awareness of Jolpica's live
  qualifying times — same failure class as the 2026-07-24 incident. Added
  an hourly `refreshScheduleCache` function that fetches Jolpica, validates
  each round's qualifying/sprint-qualifying time against the hardcoded
  value (10-day sanity check), and caches only validated overrides to
  `/system/scheduleCache`; the three lock-gating functions read that cache
  and fall back to hardcoded data on any miss/failure. Also fixed
  `syncScheduleWithAPI` to diff qualifying/sprint-qualifying times (the
  fields locks actually use) instead of only `raceStart` — **this resolves
  the "hardcoded schedule drifted from live Jolpica API around round 4"
  item** that was previously flagged as unexplored (see below — it's no
  longer open). Also extracted `getValidatedApiSessionStr` (`shared.js`)
  so `CalendarView`/`F1League`'s display-only countdown/lock-state code
  stays consistent with the save form.
  **Also collapses `ResultsView`'s `calculateAndSaveScores` and
  `CalendarView`'s `recalculatePoints` into one `saveRoundScores` helper
  in `shared.js`** — these were two independent copies of the same
  score-write + summary-doc logic, one batched, one sequential-per-player.
  **This resolves the "known but unfixed" duplication item** previously
  flagged below — it's no longer open.
- `0a92d46` — Adds `api.openf1.org` as a backup schedule source inside
  `refreshScheduleCache`, used only when Jolpica itself is unreachable
  (not for partial drift — that's the `syncScheduleWithAPI` fix above).
  Round numbers aren't provided by OpenF1 directly; they're inferred by
  ordering meetings by earliest session date, so the round-inference logic
  depends on getting the *whole* season's session list, not a partial one.
- `f615ae1` — Two small, permanent, production-inert test seams added
  while stress-testing the OpenF1 backup path against a local Firebase
  emulator (Firestore+Functions+Pub/Sub, fake `demo-` project, zero
  contact with the real project): `JOLPICA_BASE_URL`/`OPENF1_BASE_URL` env
  var overrides in `functions/index.js` (default to the real hosts; only
  ever changed by a gitignored local `.env.local`), and a
  `__scheduleTestInternals` export gated behind
  `process.env.FUNCTIONS_EMULATOR === "true"` (set automatically by the
  Firebase emulator, never true in a deployed function) exposing the pure
  schedule-math helpers for direct assertions. The actual stress-test
  harness (mock OpenF1 server, seed script, 40 synthetic leagues/195
  predictions) was ephemeral scratch work, not committed — if a repeatable
  regression test is wanted, it needs to be rebuilt from scratch using
  these two seams as the entry point.
  Verified: `refreshScheduleCache` correctly falls back to OpenF1 and
  caches all 24 rounds when Jolpica is down; the real (unmodified)
  `getPredictionLockTime`, called directly, computed lock times shifted by
  exactly the injected drift (120min/30min on two test rounds); the real
  `autoLockRound`/`autoOpenRound` correctly locked/left-open 40 randomly
  seeded synthetic leagues consistent with that; and with *both* sources
  down, `refreshScheduleCache` left the existing cache untouched and every
  function still ran cleanly (no crash, no corruption).

**VPS tooling set up this session:**
- Codex CLI has two isolated `CODEX_HOME`s: `~/.codex` (ChatGPT Go login,
  default — used for this project) and `~/.codex-freebird` (API key, for the
  separate `free-bird` project). Auto-switches by `cd`, see `~/.bashrc`.
- Model tiers (Sol/Terra/Luna) and which is reachable on which login — see
  `~/CODEX_MODEL_SOP.md`.
- Playwright MCP (browser tools) is registered for Claude Code (`user`
  scope) and both Codex homes. Chromium + system deps are installed.
  Claude Code needs a session restart to load newly-registered MCP tools.
  **Codex needs interactive mode for browser tasks** — non-interactive
  `codex exec` auto-cancels all MCP tool calls (confirmed open upstream bug,
  openai/codex#24135, not something to keep re-debugging) — see the SOP
  file for the full explanation and the reasoning behind that decision.

**Deliberately not done — don't start these without the user re-confirming scope:**
- Track D (PWA manifest/icons/offline caching) — deferred, never scoped.
- The driver-performance-graph feature — belongs in a **separate, new chat**,
  not a continuation of this one (see the saved memory note
  `sequencing-rebuild-vs-driver-graph` — it should be built against this
  now-modularized structure, following the `React.lazy` pattern already
  established by Track C).
- ~~Known but unfixed: `ResultsView.jsx`'s `calculateAndSaveScores` and
  `CalendarView.jsx`'s `recalculatePoints`~~ — fixed in `1b1d7e9` (see
  above), now one shared `saveRoundScores` helper.
- ~~Unexplored: hardcoded `F1_SCHEDULE_2026` drifted from live Jolpica API
  around round 4~~ — fixed in `1b1d7e9` (see above), `syncScheduleWithAPI`
  now diffs the fields locks actually use.
- Not yet re-verified with the browser-MCP tooling: the two fixes above
  were validated via a local Firebase emulator + direct function calls
  (see `f615ae1` above), not via a live browser pass against the deployed
  app. Worth a Playwright/browser-MCP smoke pass after deploying, on the
  same rounds that originally showed the drift console errors.
- The performance/scale question ("at how many leagues/users would this
  slow down") was answered architecturally this session, not benchmarked:
  Firestore scales with per-league member count, not total leagues/users;
  Track C already fixed the one real N+1; the score-write dedup above
  removes what would've been the main per-league bottleneck. No actual
  load test was run — if a hard number matters, one would need to be built.

To reconnect from phone: SSH → `tmux attach -t f1-league` → `claude`
