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
| `F1League.jsx` | Root shell — ~1140 lines. Auth, routing between views, global state. Lazy-loads the 9 view files below (see structure below) |
| `shared.js` | Firebase init, `F1_SCHEDULE_2026`, lock-time helpers, `useF1ApiSchedule`, `useOnlineStatus`, `saveRoundScores`, `waitForServerAck` |
| `scoring.js` | Canonical scoring engine — `scoreRace()`, `rfDistance()`, `rfPoints()` |
| `firestore.rules` | Security rules — all auth/lock logic lives here |
| `functions/index.js` | Cloud Functions (v2, scheduled) — see below |
| `validation.js` | Input validation helpers — `sanitizeInput`, `validateGroupName`, `validateNickname`, `validateDriverName`, `validateInviteCode`, `validatePredictions` |
| `vite.config.js` | Vite config — dev server on port 5173, `vite-plugin-pwa` (service worker/manifest) |
| `sw-src/firebase-messaging-sw.js` | Service worker source — merged FCM push handling + Workbox app-shell precaching (built to `dist/firebase-messaging-sw.js`) |
| `scripts/inject-sw-env.js` | Postbuild script — injects Firebase env vars into the built service worker (also runs as a `firebase.json` hosting `predeploy` hook, so it can't be skipped) |
| `scripts/generate-icons.js` | One-off script (sharp) — rasterizes `public/icons/icon.svg` into the PWA icon set |
| `buildplan.md` | Spec doc for the Track D (PWA) build — implemented, kept for reference |
| `.claude/launch.json` | Dev server configs for Claude Code browser preview |
| `security/INCIDENT_RESPONSE.md` | Rollback procedures, deploy-phase checklists, backup/restore commands |
| `security/backup.sh`, `security/integrity-check.cjs` | Firestore backup and document-count integrity check |
| `security/e2e-test-signin.cjs` | Mints a Firebase custom auth token for a dedicated, isolated test account + throwaway league — the way to drive authenticated in-app flows headlessly, since real Google OAuth can't be scripted. Full recipe (including the app-name/reload gotchas) is in the script's header comment |

There is no test suite (no test runner configured in `package.json` or `functions/package.json`).

### F1League.jsx structure
Code-split (Track C) — no router, view switching is done via local state, and 9 views are `React.lazy`-loaded from their own files. Top-level pieces:
`LandingPage` → `SetNicknameModal` → `F1League` (root component, holds most state/handlers) → lazy: `AdminWizard.jsx` (league creation) → `LeaderboardView.jsx` (+ `UserStatsCard` / `PlayerSummaryModal`) → `PredictionView.jsx` (the per-race prediction form) → `SeasonBoardView.jsx` → `HowToPlayView.jsx` → `ResultsView.jsx` (admin result entry + scoring trigger) → `InvitesView.jsx` (+ `LeagueSettingsCard`) → `CalendarView.jsx` → `AuditView.jsx`. Shared helpers (Firebase init, schedule data, lock-time math, hooks) live in `shared.js`, imported by all of the above.

Race schedule/session times come from the public **Jolpica Ergast API** (`https://api.jolpi.ca/ergast/f1/{season}.json`), fetched client-side, with an hourly Cloud Function (`refreshScheduleCache`) caching validated overrides to `/system/scheduleCache` (OpenF1 as a backup source if Jolpica is unreachable) — see `F1_SCHEDULE_2026` in `shared.js`/`functions/index.js` for the hardcoded fallback.

Push notifications use Firebase Cloud Messaging (`getMessaging`), via a service worker built from `sw-src/firebase-messaging-sw.js` (source) to `dist/firebase-messaging-sw.js` (served) — the build merges FCM push handling with Workbox app-shell precaching via `vite-plugin-pwa`'s `injectManifest` strategy. See "PWA support" below.

Scoring is computed **client-side**, not in a Cloud Function: when an admin enters/edits results in `ResultsView` (`handleSaveResults`), it calls `scoreRace()` / `rfDistance()` / `rfPoints()` from `scoring.js` directly and writes the result to `/groups/{groupId}/scores/{userId}`.

### Cloud Functions (`functions/index.js`)
All are scheduled (`onSchedule`) except the two callable/request endpoints:
- `sendPredictionReminders` — emails/push notifications before lock, per-user reminder offset, checked across every league a user belongs to
- `autoLockRound` — every 5 min, locks predictions once the lock time passes (respects an active admin `overrideExpiresAt` window rather than force-relocking it early)
- `autoOpenRound` — every 10 min, opens the next round's predictions
- `refreshScheduleCache` — every hour, fetches Jolpica (falls back to OpenF1), validates against the hardcoded schedule, caches overrides to `/system/scheduleCache`
- `unsubscribeEmail` (`onRequest`) — one-click unsubscribe link handler, HMAC-signed token
- `acceptInvite` (`onCall`) — invite redemption, the only path that can add a member to a group; transactional (concurrent redemptions can't double-count)

### PWA support (Track D)
- **Offline**: Firestore offline persistence (`persistentLocalCache()` in `shared.js`) plus app-shell precaching (Workbox, via `vite-plugin-pwa`). `useOnlineStatus()` (`shared.js`) drives offline/stale-data UI in `F1League.jsx`, `PredictionView.jsx`, `CalendarView.jsx`, `LeaderboardView.jsx`.
- **Offline prediction edits are blocked, not queued** — `firestore.rules`' `isRaceOpen()` evaluates lock state at write-arrival, so a write queued offline before lock but delivered after could otherwise be silently rejected. The Save button disables while offline, and `handleSavePredictions` additionally uses `waitForServerAck()` (`shared.js`) to confirm a write actually reached the server — `navigator.onLine` alone doesn't prove Firestore is reachable — before telling the player it saved.
- **Install**: manifest + icon set (`public/icons/`, dark bg/red-600 accent) generated via `scripts/generate-icons.js`.
- **Updates**: `registerType: 'prompt'` (not `autoUpdate`) — a new service worker install-and-waits; the app shows a "tap to refresh" banner rather than force-reloading mid-session.
- See `buildplan.md` for the full spec this implements, including the env-injection ordering fix (`scripts/inject-sw-env.js` must run *after* `vite-plugin-pwa`'s `injectManifest` output, hence the postbuild script + `firebase.json` `predeploy` hook rather than a Vite plugin hook).

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

`npm run build` chains `vite build && node scripts/inject-sw-env.js` — the second
step injects real Firebase config into the built service worker (it must run
strictly after `vite-plugin-pwa`'s output, not as a Vite plugin hook, or the
shipped worker ships literal `__VITE_*__` placeholders). `firebase.json` also
runs that same script as a hosting `predeploy` hook, so even a `firebase
deploy --only hosting` off a `dist/` built via a bare `vite build` is safe —
there's no CI on this project enforcing `npm run build` as the only entry
point.

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
# NOTE: `--approval-policy=full-auto` was removed from the Codex CLI (confirmed
# 2026-08-07) — use `--approve-for-me` alone (it already implies workspace-write
# sandbox; passing --sandbox alongside it errors). See ~/CODEX_MODEL_SOP.md.
codex exec -m gpt-5.6-terra --approve-for-me "$(cat /tmp/spec.md)"   # default for real work
codex exec -m gpt-5.6-luna  --approve-for-me "$(cat /tmp/spec.md)"   # mechanical/repetitive edits

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

## Session status as of 2026-08-07 (for a fresh Claude Code session picking this up)

**Everything below is deployed and committed** (`origin/main` @ `9c3fbc7`).
Nothing mid-flight — read this section (oldest history first, dated
updates at the bottom are the most recent), check `git log`, then pick up
with the "Still open" list partway down rather than assuming anything here
needs redoing.

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

**Still open:**
- **The migration script** (`security/backups/migrate-schedule-renumber.cjs`)
  — used once already (see above). Decide: keep as a reusable/generalized
  tool (currently hardcoded to one `groupId` and one specific old→new round
  map — fine for a single emergency migration, not written to be reused
  as-is for a future disruption), or archive it now that this migration is
  done. The backup JSON it was run against is in the same gitignored
  directory.
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

### Update — 2026-08-07: Track D (PWA) built, deployed, and audited

**Track D — PWA support** (manifest, icons, offline caching, install
support) — see "PWA support" above for what it covers. Spec in
`buildplan.md`. Validated against the spec's checklist locally (clean
build, zero placeholder strings in the shipped service worker, FCM logic
diffed unchanged against pre-move `public/firebase-messaging-sw.js`,
app-shell fully renders after an offline reload), then deployed and
re-verified live the same way. All of this session's browser verification
was against the **unauthenticated shell only** (headless Chromium, driven
directly via the Playwright npm package rather than the MCP tool — see the
tooling note below) — sign-in requires an interactive Google OAuth popup,
so nothing behind login (PredictionView's offline Save-button behavior,
CalendarView/LeaderboardView's stale-data banners, the round12/round16
display, `refreshScheduleCache`'s `/system/scheduleCache` doc) was
re-verified live this session, beyond a direct code read. Those were
flagged open in the prior status update and are still open.

**Post-Track-D full system audit** — ran an independent audit pass with
both Codex (`gpt-5.6-terra`) and Claude (forked instance) over the whole
repo, per the multi-agent workflow above, then reconciled and verified
every finding against the actual code before fixing. Both independently
converged on the same offline-write trust gap; Codex additionally surfaced
several pre-existing bugs unrelated to Track D. All 11 confirmed findings
fixed and deployed:
- `autoLockRound` now respects an admin's `overrideExpiresAt` — it used to
  ignore it entirely, so the documented 15-minute unlock window actually
  lasted 0-5 minutes (the next cron tick force-relocked immediately, since
  an admin can only unlock *after* the base lock time has passed).
- Offline write-guard: `navigator.onLine` alone doesn't prove Firestore is
  reachable, and `persistentLocalCache()` lets `setDoc()` resolve from the
  local queue before any server round-trip — `waitForServerAck()`
  (`shared.js`) now confirms the write actually reached the server before
  `PredictionView.jsx` tells the player it saved.
- `acceptInvite` race condition (concurrent redemptions could double-count
  `usedCount`) — fixed via a Firestore transaction.
- `AdminWizard.jsx`'s league-creation write ordering — fixed to match
  `F1League.jsx`'s own (already-fixed) path, so a dropped write can't
  permanently block a brand-new league.
- `firebase.json` hosting `predeploy` hook — guarantees the SW env
  injection can't be skipped regardless of how `dist/` was built.
- `sendPredictionReminders` now checks completion across every group a
  user belongs to, not just the first.
- Dead `?join={groupId}` legacy flow removed (rules already rejected it).
- Reminder copy fixed ("FP2" → "Qualifying" for non-sprint weekends).
- `firestore.rules` dropped a stale `round24` allowlist entry.
- `CalendarView`/`LeaderboardView` offline-indicator UX gaps closed.

Deployed: functions, rules, hosting. Post-repair Firestore integrity check
clean, counts unchanged (all fixes were logic-only). Pushed to
`origin/main`.

**Still open from this pass:**
- **Real-device PWA test** — "Add to Home Screen" and a real FCM push
  notification can't be verified from this VPS; needs a phone. (Push can be
  tested on-demand via Firebase Console → Cloud Messaging → "Send test
  message" using the FCM token from a signed-in user's `users/{uid}` doc,
  rather than waiting for a real race-weekend reminder window.)
- **Live authenticated-flow smoke test still not done** — same gap the
  2026-08-06 status update flagged (round12/round16 calendar display,
  `refreshScheduleCache`'s cache doc) plus the new Track D authenticated
  UI (offline Save-button behavior, stale-data banners). Needs a real
  Google sign-in, which can't be scripted headlessly here.
- Two environment/tooling issues hit and fixed this session, documented in
  `~/CODEX_MODEL_SOP.md`: the Codex CLI dropped `--approval-policy=full-auto`
  in favor of `--approve-for-me`, and the Playwright MCP server defaults to
  a `chrome` channel that was never installed on this VPS (fixed via
  `--executable-path` pointing at the Chromium build already on disk) —
  applied to the Claude Code registration only; the two Codex `CODEX_HOME`
  registrations likely have the same gap, unverified.

### Update — 2026-08-07 (earlier): browser MCP confirmed working
Playwright MCP verified end-to-end through the real tool chain (not just a
bypass script) — navigation, console reading, screenshots all working for
both Claude Code and Codex (Codex needs interactive mode, see SOP). Version
now pinned (`@playwright/mcp@0.0.79`) instead of `@latest` in all three
registrations, since a floating version broke navigation once already
(browser build mismatch) — see `~/CODEX_MODEL_SOP.md` for the fix and
upgrade procedure. Also confirmed via a clean browser console check: the
`F1_SCHEDULE_2026` drift issue flagged in the previous status update
appears already resolved (0 console errors on a fresh page load, vs 20
schedule-sync errors seen before).
