/**
 * F1 Karvaan — Data Integrity Check
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node security/integrity-check.js
 *   (or run after: firebase emulators:start --import=./backup)
 *
 * What it checks:
 *   - Document counts across all collections
 *   - Admin present in own members array
 *   - No orphaned predictions (owner not a group member)
 *   - No negative point totals
 *   - Invite codes point to real groups
 *
 * Exits with code 1 if issues found, 0 if clean.
 */

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: 'f1-predictions-league' });
const db = getFirestore();

async function check() {
  const issues = [];
  const counts = {};
  const log = (msg) => process.stdout.write(msg + '\n');
  const warn = (msg) => { issues.push(msg); process.stdout.write('  ⚠️  ' + msg + '\n'); };

  log('\n╔══════════════════════════════════════════╗');
  log('║  F1 Karvaan — Data Integrity Check        ║');
  log('╚══════════════════════════════════════════╝\n');

  // ── Users ──────────────────────────────────────────────────────────────────
  const usersSnap = await db.collection('users').get();
  counts.users = usersSnap.size;
  log(`✓  Users: ${counts.users}`);

  // ── Invites ────────────────────────────────────────────────────────────────
  const invitesSnap = await db.collection('invites').get();
  counts.invites = invitesSnap.size;
  log(`✓  Invites: ${counts.invites}`);

  // Verify each invite points to a real group
  const groupIds = new Set();
  const groupsSnap = await db.collection('groups').get();
  groupsSnap.docs.forEach(d => groupIds.add(d.id));

  for (const inv of invitesSnap.docs) {
    const { leagueId } = inv.data();
    if (!groupIds.has(leagueId)) {
      warn(`Invite ${inv.id} references non-existent group ${leagueId}`);
    }
  }

  // ── Groups ─────────────────────────────────────────────────────────────────
  counts.groups = groupsSnap.size;
  log(`\n✓  Groups: ${counts.groups}`);

  let totalPredictions = 0;
  let totalScores = 0;
  let totalResults = 0;
  let totalAudit = 0;

  for (const groupDoc of groupsSnap.docs) {
    const g = groupDoc.data();
    const gId = groupDoc.id;
    const members = g.members || [];

    log(`\n  ├── Group: "${g.name}" (${gId})`);
    log(`  │   Admin: ${g.admin}`);
    log(`  │   Members: ${members.length}`);

    // Admin must be in members
    if (!members.includes(g.admin)) {
      warn(`Group "${g.name}": admin ${g.admin} is not in members array`);
    }

    // Members must all have user profiles
    for (const uid of members) {
      const userExists = usersSnap.docs.some(u => u.id === uid);
      if (!userExists) {
        warn(`Group "${g.name}": member ${uid} has no user profile doc`);
      }
    }

    // ── Predictions ──────────────────────────────────────────────────────────
    const predsSnap = await db.collection(`groups/${gId}/predictions`).get();
    totalPredictions += predsSnap.size;
    log(`  │   Prediction docs: ${predsSnap.size}`);

    for (const predDoc of predsSnap.docs) {
      if (!members.includes(predDoc.id)) {
        warn(`Group "${g.name}": prediction doc ${predDoc.id} owner is not a member`);
      }
    }

    // ── Scores ───────────────────────────────────────────────────────────────
    const scoresSnap = await db.collection(`groups/${gId}/scores`).get();
    totalScores += scoresSnap.size;
    log(`  │   Score docs: ${scoresSnap.size}`);

    for (const scoreDoc of scoresSnap.docs) {
      const data = scoreDoc.data();
      for (let r = 1; r <= 24; r++) {
        const round = data[`round${r}`];
        if (!round) continue;
        if (typeof round.totalPoints !== 'number' || round.totalPoints < 0) {
          warn(`Group "${g.name}", user ${scoreDoc.id}, round ${r}: bad totalPoints (${round.totalPoints})`);
        }
        // Max possible points per non-sprint round: pole+P1+P2+P3+R# = 6
        // Max sprint round: +4 sprint fields = 10
        if (round.totalPoints > 12) {
          warn(`Group "${g.name}", user ${scoreDoc.id}, round ${r}: suspiciously high points (${round.totalPoints})`);
        }
      }
    }

    // ── Results ──────────────────────────────────────────────────────────────
    const resultsSnap = await db.collection(`groups/${gId}/results`).get();
    totalResults += resultsSnap.size;
    log(`  │   Result docs: ${resultsSnap.size}`);

    // ── Audit Log ────────────────────────────────────────────────────────────
    const auditSnap = await db.collection(`groups/${gId}/auditLog`).get();
    totalAudit += auditSnap.size;
    log(`  └── Audit entries: ${auditSnap.size}`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('DATA COUNTS — save this before each deployment:\n');

  const snapshot = {
    timestamp: new Date().toISOString(),
    counts: {
      users: counts.users,
      groups: counts.groups,
      invites: counts.invites,
      predictions: totalPredictions,
      scores: totalScores,
      results: totalResults,
      auditLog: totalAudit,
    },
  };
  log(JSON.stringify(snapshot, null, 2));
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (issues.length === 0) {
    log('✅  No integrity issues found. Safe to proceed.\n');
    process.exit(0);
  } else {
    log(`\n❌  Found ${issues.length} issue(s). Resolve before deploying.\n`);
    process.exit(1);
  }
}

check().catch(err => {
  console.error('\n💥  Fatal error running integrity check:', err.message);
  process.exit(1);
});
