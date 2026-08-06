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

**Everything below is deployed and committed** (`origin/main` @ `db5ab43`,
which includes the earlier `1b1d7e9`/`0a92d46`/`f615ae1` commits this
session started by pulling and deploying). Nothing mid-flight — read this
section, check `git log`, then pick up with the "Next session" list at the
bottom rather than assuming anything here needs redoing.

**Fully complete and deployed:**
- Track A — lock-time unification (`functions/index.js` matches the
  frontend's qualifying-based, per-group-offset logic; root cause of the
  2026-07-24 incident).
- Track B — 10 security/correctness fixes from the full Codex audit (rules
  round-scoping, unsubscribe HMAC token, non-atomic writes → batches, audit
  log integrity, season-prediction lock, invite race condition, email HTML
  escaping, scoring display de-dup, validator wiring).
- Post-Track-B audit fixes — retroactive-scoring gap in the round-scoping
  rule, group-join field-smuggling, `autoOpenRound` atomicity, invite
  redemption moved to a new `acceptInvite` Cloud Function.
- Track C — code-split `F1League.jsx` (4552 lines → ~1100-line shell +
  `shared.js` + 9 lazy-loaded view files) and fixed the per-league scores
  N+1 read (`GroupStandingBadge` reads one precomputed summary doc).
- Track A follow-up (`1b1d7e9`) — added hourly `refreshScheduleCache`
  (fetches Jolpica, validates against hardcoded, caches overrides to
  `/system/scheduleCache`; the three lock-gating functions read it with
  fallback to hardcoded data). Fixed `syncScheduleWithAPI` to diff
  qualifying/sprint-qualifying times, not just `raceStart`. Collapsed
  `ResultsView`'s `calculateAndSaveScores` and `CalendarView`'s
  `recalculatePoints` into one `saveRoundScores` helper in `shared.js`.
- OpenF1 backup source (`0a92d46`) added to `refreshScheduleCache` for when
  Jolpica itself is unreachable, plus test-only seams (`f615ae1`,
  `JOLPICA_BASE_URL`/`OPENF1_BASE_URL` env overrides and
  `__scheduleTestInternals`, gated behind `FUNCTIONS_EMULATOR`, both
  production-inert).

**This session's work (`db5ab43`) — the hardcoded schedule was itself
wrong, not just the lock-gating logic:**
- **Root cause found:** Bahrain and Saudi Arabia GPs were cancelled in the
  real 2026 season (Middle East conflict) and F1 later relocated a
  "Bahrain Grand Prix" to Sepang, Malaysia in October rather than
  restoring either race — the season is 23 rounds, not 24. `F1_SCHEDULE_2026`
  (hardcoded in both `functions/index.js` and `shared.js`, and indexed
  directly by the frontend for round name/date display) was never updated
  after the cancellation, so every round from 4 onward was off by 2 versus
  reality. **Rebuilt both copies against live Jolpica data** to match the
  real calendar. Every consumer of the old hardcoded round count
  (`getCurrentRound`, season-total loops, "next round" gates in
  `ResultsView.jsx`, UI labels in `CalendarView.jsx`/`F1League.jsx`) now
  derives from `F1_SCHEDULE_2026.length` instead of a literal `24`, so a
  further disruption in the region — plausible, not hypothetical — doesn't
  require another hunt through magic numbers.
- **OpenF1 fallback was silently non-functional**, verified live: two
  separate round-inference bugs (pre-season testing weekends, and meetings
  for the cancelled races still counted) both inflated the round count and
  shifted every later round. Neither was ever a corruption risk — the
  sanity check rejected every resulting mismatch — but it meant the
  fallback produced zero usable overrides. Fixed by filtering testing
  meetings by name (`/v1/meetings`) and cancelled meetings via
  `is_cancelled`; verified all 23 rounds now resolve correctly against
  live `api.openf1.org`.
- **Tightened the schedule-drift sanity check from 10 to 3 days**
  everywhere it appears (`functions/index.js`'s `SCHEDULE_SANITY_MS`,
  `shared.js`'s `getValidatedApiSessionStr`, `ResultsView.jsx`'s inline
  check) — verified live that the 10-day window silently accepted several
  round-shifted mismatches; the season's tightest real gap between two
  different rounds is 7 days, largest legitimate same-round time
  correction seen was ~1 day.
- **Hardened `syncScheduleWithAPI`** to flag a calendar size mismatch or an
  orphaned round number loudly (distinct console.error), instead of
  silently no-oping the way it did for months on the Bahrain/Saudi
  cancellation — the intent is that the *next* calendar disruption gets
  caught fast, not months later.
- **Migrated the one live league's Firestore data**
  (`group_1772707723293`, "F1 Karvaan") to match the renumbered schedule:
  old round6..14 → round4..12 across `predictions`, `scores`, `results`,
  `raceStatus`, `randomNumbers`, and `currentOpenRound`; the two
  orphaned/unscored round4-5 (Bahrain/Saudi — predictions were opened and
  locked on schedule but nobody submitted anything, and no results/scores
  ever existed for them) `raceStatus` shells deleted. Backed up the full
  group data first (Admin SDK snapshot, since this Firebase CLI version
  has no `firestore:export` and `gcloud`/`gsutil` aren't installed on this
  VPS) to `security/backups/*.json` — gitignored, not committed, kept
  locally as a rollback point and audit trail.
- Deployed: hosting, all 6 Cloud Functions (including new
  `refreshScheduleCache`), Firestore rules.

**VPS tooling set up in an earlier session:**
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

**Next session — user explicitly asked to continue with these tomorrow:**
- **Track D** (PWA manifest/icons/offline caching) — deferred, never scoped,
  but now the named priority for the next session.
- **The migration script** (`security/backups/migrate-schedule-renumber.cjs`)
  — used once already (see above), user wants to revisit it tomorrow.
  Decide: keep as a reusable/generalized tool (currently hardcoded to one
  `groupId` and one specific old→new round map — fine for a single
  emergency migration, not written to be reused as-is for a future
  disruption), or archive it now that this migration is done. The backup
  JSON it was run against is in the same gitignored directory.

**Also still open, lower priority:**
- **Live browser smoke test never done.** Every fix this session and last
  was verified via direct API calls, a local Firebase emulator, or Admin
  SDK reads/writes — not a live pass through the actual deployed app.
  Specifically worth checking: the calendar/current-round display for
  round12 (should read Netherlands, not Spain) and the round16 Malaysia
  entry, since those are the two things a browser pass would catch that
  nothing else in this session's verification would.
- **`refreshScheduleCache`'s first live run not yet confirmed.** It's
  newly deployed on an hourly schedule; worth checking
  `/system/scheduleCache` in Firestore populates correctly from Jolpica in
  production (only tested the logic locally against live API responses,
  not the deployed function itself).
- The driver-performance-graph feature — belongs in a **separate, new
  chat**, not a continuation of this one (see the saved memory note
  `sequencing-rebuild-vs-driver-graph` — build it against the
  now-modularized structure, following the `React.lazy` pattern
  established by Track C).
- The performance/scale question ("at how many leagues/users would this
  slow down") was answered architecturally, not benchmarked: Firestore
  scales with per-league member count, not total leagues/users; Track C
  already fixed the one real N+1; the score-write dedup fixed the main
  per-league bottleneck. No actual load test was run — if a hard number
  matters, one would need to be built.

To reconnect from phone: SSH → `tmux attach -t f1-league` → `claude`
