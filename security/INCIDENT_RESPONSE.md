# F1 Karvaan — Security Incident Response Playbook

Project ID: `f1-predictions-league`
Hosting URL: `https://f1-predictionsleague.web.app`

---

## 🔴 EMERGENCY: Something Broke in Production

### Step 1 — Identify the failure (< 5 min)

| Symptom | Likely cause | Jump to |
|---------|-------------|---------|
| "Missing or insufficient permissions" errors | Firestore rules too strict | [Rollback Rules](#rollback-firestore-rules) |
| App loads but data is missing | Rules too permissive blocked a read | [Rollback Rules](#rollback-firestore-rules) |
| Leaderboard/predictions not loading | Frontend JS error | [Rollback Frontend](#rollback-frontend) |
| Notifications not sending | Cloud Function error | [Rollback Functions](#rollback-functions) |
| Data looks corrupt or missing | Data integrity issue | [Restore Backup](#restore-from-backup) |

Check error logs first:
```bash
firebase functions:log --project f1-predictions-league
```

---

## Rollback Procedures

### Rollback Firestore Rules

Fastest rollback — takes effect immediately, no app restart needed.

```bash
# Option A: revert to last committed rules
git checkout HEAD~1 -- firestore.rules
firebase deploy --only firestore:rules --project f1-predictions-league

# Option B: emergency open rules (use ONLY temporarily, max 1 hour)
cat > firestore.rules << 'EOF'
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
EOF
firebase deploy --only firestore:rules --project f1-predictions-league
```

**Verify recovery:**
1. Open the app and sign in
2. Check leaderboard loads
3. Check predictions can be saved
4. Restore proper rules within 1 hour if Option B was used

---

### Rollback Frontend

```bash
# Find the last working commit
git log --oneline -10

# Revert to it
git revert <bad-commit-hash>
npm run build
firebase deploy --only hosting --project f1-predictions-league
```

Takes ~2 minutes to deploy. CDN propagation takes up to 5 minutes.

---

### Rollback Functions

```bash
# Revert function code
git revert <bad-commit-hash>

# Redeploy only functions
firebase deploy --only functions --project f1-predictions-league
```

---

### Restore From Backup

> ⚠️ DESTRUCTIVE — overwrites all current Firestore data. Use only if data is corrupt.

```bash
# 1. List available backups
gsutil ls gs://f1-predictions-league.appspot.com/backups/

# 2. Pick the most recent pre-incident backup
BACKUP_PATH="gs://f1-predictions-league.appspot.com/backups/YYYY-MM-DD_HH-MM-SS_label"

# 3. Restore (this overwrites everything)
firebase firestore:import "${BACKUP_PATH}" --project f1-predictions-league

# 4. Verify
node security/integrity-check.js
```

After restore, document counts should match the pre-deployment snapshot saved in
`security/backup-history.log`.

---

## Deployment Phases & Checklists

### Phase 0: Pre-deployment (every time)

```bash
# 1. Take a snapshot of document counts
node security/integrity-check.js 2>&1 | tee security/snapshots/pre-deploy-$(date +%Y%m%d).json

# 2. Create a named backup
./security/backup.sh "pre-phase-1"

# 3. Commit current state
git add -A && git commit -m "checkpoint: pre-security-hardening"
```

---

### Phase 1: Firestore Rules

**Deploy:**
```bash
# Test rules locally first (optional but recommended)
firebase emulators:start --only firestore

# Deploy rules only (zero app downtime)
firebase deploy --only firestore:rules --project f1-predictions-league
```

**Verify (within 10 minutes of deploy):**
- [ ] Sign in works
- [ ] League selector shows your leagues
- [ ] Leaderboard loads
- [ ] Can save a prediction
- [ ] Can read another player's prediction (leaderboard/comparison views)
- [ ] Invite link accept flow works
- [ ] Admin can enter results
- [ ] Admin can see audit log
- [ ] Non-admin cannot see audit log

**If any check fails:** [Rollback Rules](#rollback-firestore-rules)

---

### Phase 2: Frontend Validation

Import the helpers in `F1League.jsx`:
```js
import { sanitizeInput, validateGroupName, validateNickname, validatePredictions } from './validation.js';
```

Use before Firestore writes:
```js
// Before createNewGroup():
const nameResult = validateGroupName(groupName);
if (!nameResult.valid) { setMessage(nameResult.error); return; }

// Before saveNickname():
const nickResult = validateNickname(nickname);
if (!nickResult.valid) { return; }

// Before handleSavePredictions():
const predResult = validatePredictions(predictions, race.isSprint);
if (!predResult.valid) { setMessage('Invalid prediction data'); return; }
```

**Verify:**
- [ ] Can still create a league
- [ ] Can still save a nickname
- [ ] Can still save predictions
- [ ] HTML/script tags in inputs are stripped silently
- [ ] Extremely long inputs are truncated

**Rollback:** Remove the 4 validation calls above. No data impact.

---

### Phase 3: Cloud Functions

```bash
# Test locally
cd functions && npm test  # (if tests exist)

# Deploy only functions
firebase deploy --only functions --project f1-predictions-league

# Monitor logs for 30 minutes
firebase functions:log --project f1-predictions-league
```

**Verify:**
- [ ] Prediction reminder emails still send
- [ ] No errors in function logs

---

### Phase 4: Monitoring

Set up budget alerts in [GCP Console](https://console.cloud.google.com/billing):
- Alert at $5/month (baseline)
- Alert at $20/month (anomaly)

Enable Firestore usage monitoring:
```bash
# View current read/write counts
gcloud firestore operations list --project f1-predictions-league
```

---

## Data Safety Rules (Never Break These)

| ❌ Never do this | ✅ Do this instead |
|-----------------|-------------------|
| Delete fields from documents | Add new fields, keep old ones |
| Run bulk deletes without backup | Archive to a new collection |
| Deploy rules + code in one commit | Phase separately |
| Use `firebase deploy` (deploys everything) | Use `--only hosting`, `--only firestore:rules`, etc. |
| Deploy at peak usage hours | Deploy at low-traffic time (e.g. 3–6am IST) |

---

## Key Commands Reference

```bash
# Deploy specific targets only
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only functions

# Check what would deploy
firebase deploy --only hosting --dry-run

# Tail function logs
firebase functions:log --project f1-predictions-league

# Run integrity check
node security/integrity-check.js

# Take backup
./security/backup.sh "description"

# List backups
gsutil ls gs://f1-predictions-league.appspot.com/backups/

# View all recent git commits
git log --oneline -20

# Revert last commit
git revert HEAD
```

---

## Contact & Escalation

- **Firebase Console:** https://console.firebase.google.com/project/f1-predictions-league
- **Hosting URL:** https://f1-predictionsleague.web.app
- **GCP Console:** https://console.cloud.google.com/home/dashboard?project=f1-predictions-league
- **Firestore data:** https://console.firebase.google.com/project/f1-predictions-league/firestore
