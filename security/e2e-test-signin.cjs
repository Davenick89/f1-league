/**
 * F1 Karvaan — E2E test sign-in helper
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node security/e2e-test-signin.cjs
 *
 * What it does:
 *   - Creates (or reuses) a dedicated test account, isolated from real users:
 *     claude-e2e-test@f1-predictionsleague.internal
 *   - Creates (or reuses) a throwaway "E2E Test League" with that account as
 *     admin — never the real live league, so real player data is untouched.
 *   - Mints a fresh Firebase custom auth token (1hr TTL) for that account
 *     and prints UID / GROUP_ID / TOKEN.
 *
 * Why this exists: real Google OAuth can't be scripted headlessly. A custom
 * token is real Firebase Auth against the real production project — not a
 * mock — so security rules, real data reads/writes, everything behaves
 * exactly as it would for a real signed-in user. This only requires Admin
 * SDK credentials (already used elsewhere in security/), no app changes.
 *
 * How to use the token to actually drive a signed-in browser session
 * (requires some way to run Playwright — the MCP tool if registered and
 * restarted, or a direct `playwright` npm import):
 *
 *   1. Navigate to https://f1-predictionsleague.web.app/ normally first.
 *   2. Run this in the page (page.evaluate / browser_evaluate), passing in
 *      the token this script printed and the real firebaseConfig (values
 *      are in .env.production — NOT secret, Firebase client config is
 *      public by design; security is enforced by firestore.rules):
 *
 *        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js');
 *        const { getAuth, signInWithCustomToken, setPersistence, browserLocalPersistence } =
 *          await import('https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js');
 *        const app = initializeApp(firebaseConfig); // NO second (name) arg —
 *          // must be '[DEFAULT]' to share the same IndexedDB persistence key
 *          // the app's own already-initialized Firebase Auth instance reads
 *          // from. A custom app name silently signs in a *different*,
 *          // unlinked session the app never sees.
 *        const auth = getAuth(app);
 *        await setPersistence(auth, browserLocalPersistence);
 *        await signInWithCustomToken(auth, token);
 *
 *   3. Reload the page with `waitUntil: 'load'`, NOT `'networkidle'` — an
 *      authenticated session opens persistent Firestore onSnapshot
 *      listeners, which never go network-idle and will time out the wait.
 *   4. The app's own Firebase Auth instance picks up the persisted session
 *      on that reload and renders as signed-in — no app source changes
 *      were made anywhere in this flow.
 *
 * Token expires in 1 hour — just re-run this script for a fresh one.
 */

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp({ projectId: 'f1-predictions-league' });
const auth = getAuth();
const db = getFirestore();

const TEST_EMAIL = 'claude-e2e-test@f1-predictionsleague.internal';

async function ensureTestUser() {
  try {
    return await auth.getUserByEmail(TEST_EMAIL);
  } catch {
    return auth.createUser({ email: TEST_EMAIL, emailVerified: true, displayName: 'E2E Test Account' });
  }
}

async function ensureTestLeague(uid) {
  const existing = await db.collection('groups').where('admin', '==', uid).where('name', '==', 'E2E Test League').limit(1).get();
  if (!existing.empty) return existing.docs[0].id;

  const groupId = `group_e2e_test_${Date.now()}`;
  // Same write ordering as the fixed AdminWizard.jsx/F1League.jsx creation
  // paths: currentOpenRound is set LAST, only once raceStatus/round1 exists,
  // so a dropped write mid-sequence never leaves the league permanently
  // blocked (isRaceOpen() treats a missing currentOpenRound as legacy-open).
  await db.doc(`groups/${groupId}`).set({
    name: 'E2E Test League',
    admin: uid,
    members: [uid],
    createdTimestamp: FieldValue.serverTimestamp(),
  });
  await db.doc(`groups/${groupId}/raceStatus/round1`).set({
    status: 'CURRENT',
    isPredictionOpen: true,
    openedAt: new Date().toISOString(),
  });
  await db.doc(`groups/${groupId}`).update({ currentOpenRound: 'round1' });
  return groupId;
}

(async () => {
  const user = await ensureTestUser();
  await db.doc(`users/${user.uid}`).set({
    nickname: 'E2E Tester',
    email: TEST_EMAIL,
    notificationSettings: { pushNotifications: false, emailNotifications: false, reminderMinutesBefore: 30 },
  }, { merge: true });

  const groupId = await ensureTestLeague(user.uid);
  const token = await auth.createCustomToken(user.uid);

  console.log(`UID: ${user.uid}`);
  console.log(`GROUP_ID: ${groupId}`);
  console.log(`TOKEN: ${token}`);
})().catch((err) => { console.error('FAILED:', err); process.exit(1); });
