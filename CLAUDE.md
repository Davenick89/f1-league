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

Everything below is **shipped, tested, deployed, and pushed to `origin/main`** —
codebase is in a clean state, nothing mid-flight. Read this section, check
`git log` for exact commits, and `~/CODEX_MODEL_SOP.md` for VPS tooling notes,
before assuming anything needs redoing.

**Fully complete:**
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
- Known but unfixed: `ResultsView.jsx`'s `calculateAndSaveScores` and
  `CalendarView.jsx`'s `recalculatePoints` are two independent
  implementations of the same score-saving logic (one batched, one not) —
  flagged during Track C, not fixed, worth a proper look.
- Unexplored: the browser-MCP verification run surfaced real console errors
  from `syncScheduleWithAPI` showing the hardcoded `F1_SCHEDULE_2026` has
  drifted from the live Jolpica API starting around round 4 — not
  investigated, just discovered as a side effect of testing.

To reconnect from phone: SSH → `tmux attach -t f1-league` → `claude`
