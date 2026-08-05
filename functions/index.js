const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

initializeApp();

const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const UNSUBSCRIBE_SIGNING_KEY = defineSecret("UNSUBSCRIBE_SIGNING_KEY");

// FIX (Track B #5): the unsubscribe link previously carried a raw ?uid=,
// unauthenticated — anyone who knew or guessed another player's Firebase
// UID could hit it and silently disable that person's email reminders.
// Now the link carries an HMAC signature (and issue timestamp) over the
// uid, verified server-side before acting; a tampered or unrelated uid
// fails signature verification, and links older than 90 days expire.
const UNSUBSCRIBE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function signUnsubscribe(uid, ts, key) {
  return crypto.createHmac("sha256", key).update(`${uid}:${ts}`).digest("hex");
}

function buildUnsubscribeUrl(uid, key) {
  const ts = Date.now();
  const sig = signUnsubscribe(uid, ts, key);
  return `https://us-central1-f1-predictions-league.cloudfunctions.net/unsubscribeEmail?uid=${uid}&ts=${ts}&sig=${sig}`;
}

// ─── Schedule (mirrors F1League.jsx F1_SCHEDULE_2026 — session fields must
// stay byte-identical between the two copies; qualStart/sprintQualStart and
// date are load-bearing for lock-time math below, not just display) ───────────
const F1_SCHEDULE_2026 = [
  { round: 1,  name: "Australia",           date: "2026-03-08", fp1: "2026-03-06T09:30:00Z", fp2: "2026-03-06T13:00:00Z", qualStart: "2026-03-07T06:00:00Z", raceStart: "2026-03-08T04:00:00Z", isSprint: false },
  { round: 2,  name: "China",               date: "2026-03-15", fp1: "2026-03-13T10:00:00Z", sprintQualStart: "2026-03-13T13:30:00Z",                        raceStart: "2026-03-15T07:00:00Z", isSprint: true  },
  { round: 3,  name: "Japan",               date: "2026-03-29", fp1: "2026-03-27T10:00:00Z", fp2: "2026-03-27T13:30:00Z", qualStart: "2026-03-28T07:00:00Z", raceStart: "2026-03-29T05:00:00Z", isSprint: false },
  { round: 4,  name: "Bahrain",             date: "2026-04-12", fp1: "2026-04-10T14:00:00Z", fp2: "2026-04-10T17:30:00Z", qualStart: "2026-04-11T15:00:00Z", raceStart: "2026-04-12T15:00:00Z", isSprint: false },
  { round: 5,  name: "Saudi Arabia",        date: "2026-04-19", fp1: "2026-04-17T17:00:00Z", fp2: "2026-04-17T20:30:00Z", qualStart: "2026-04-18T17:00:00Z", raceStart: "2026-04-19T17:00:00Z", isSprint: false },
  { round: 6,  name: "Miami",               date: "2026-05-03", fp1: "2026-05-01T13:00:00Z", sprintQualStart: "2026-05-01T17:00:00Z",                        raceStart: "2026-05-03T19:30:00Z", isSprint: true  },
  { round: 7,  name: "Canada",              date: "2026-05-24", fp1: "2026-05-22T14:00:00Z", sprintQualStart: "2026-05-22T18:00:00Z",                        raceStart: "2026-05-24T18:00:00Z", isSprint: true  },
  { round: 8,  name: "Monaco",              date: "2026-06-07", fp1: "2026-06-05T14:00:00Z", fp2: "2026-06-05T17:30:00Z", qualStart: "2026-06-06T13:00:00Z", raceStart: "2026-06-07T13:00:00Z", isSprint: false },
  { round: 9,  name: "Barcelona-Catalunya", date: "2026-06-14", fp1: "2026-06-12T13:00:00Z", fp2: "2026-06-12T16:30:00Z", qualStart: "2026-06-13T13:00:00Z", raceStart: "2026-06-14T13:00:00Z", isSprint: false },
  { round: 10, name: "Austria",             date: "2026-06-28", fp1: "2026-06-26T14:00:00Z", fp2: "2026-06-26T17:30:00Z", qualStart: "2026-06-27T13:00:00Z", raceStart: "2026-06-28T13:00:00Z", isSprint: false },
  { round: 11, name: "Great Britain",       date: "2026-07-05", fp1: "2026-07-03T13:00:00Z", sprintQualStart: "2026-07-03T17:00:00Z",                        raceStart: "2026-07-05T14:00:00Z", isSprint: true  },
  { round: 12, name: "Belgium",             date: "2026-07-19", fp1: "2026-07-17T14:00:00Z", fp2: "2026-07-17T17:30:00Z", qualStart: "2026-07-18T13:00:00Z", raceStart: "2026-07-19T13:00:00Z", isSprint: false },
  { round: 13, name: "Hungary",             date: "2026-07-26", fp1: "2026-07-24T14:00:00Z", fp2: "2026-07-24T17:30:00Z", qualStart: "2026-07-25T13:00:00Z", raceStart: "2026-07-26T13:00:00Z", isSprint: false },
  { round: 14, name: "Netherlands",         date: "2026-08-23", fp1: "2026-08-21T14:00:00Z", sprintQualStart: "2026-08-21T18:00:00Z",                        raceStart: "2026-08-23T13:00:00Z", isSprint: true  },
  { round: 15, name: "Italy",               date: "2026-09-06", fp1: "2026-09-04T13:00:00Z", fp2: "2026-09-04T16:30:00Z", qualStart: "2026-09-05T13:00:00Z", raceStart: "2026-09-06T13:00:00Z", isSprint: false },
  { round: 16, name: "Spain",               date: "2026-09-13", fp1: "2026-09-11T14:00:00Z", fp2: "2026-09-11T17:30:00Z", qualStart: "2026-09-12T13:00:00Z", raceStart: "2026-09-13T13:00:00Z", isSprint: false },
  { round: 17, name: "Azerbaijan",          date: "2026-09-27", fp1: "2026-09-25T12:00:00Z", fp2: "2026-09-25T15:30:00Z", qualStart: "2026-09-26T11:00:00Z", raceStart: "2026-09-27T11:00:00Z", isSprint: false },
  { round: 18, name: "Singapore",           date: "2026-10-11", fp1: "2026-10-09T14:00:00Z", sprintQualStart: "2026-10-09T18:00:00Z",                        raceStart: "2026-10-11T12:00:00Z", isSprint: true  },
  { round: 19, name: "United States",       date: "2026-10-25", fp1: "2026-10-23T12:00:00Z", fp2: "2026-10-23T15:30:00Z", qualStart: "2026-10-24T19:00:00Z", raceStart: "2026-10-25T19:00:00Z", isSprint: false },
  { round: 20, name: "Mexico",              date: "2026-11-01", fp1: "2026-10-30T18:00:00Z", fp2: "2026-10-30T21:30:00Z", qualStart: "2026-10-31T20:00:00Z", raceStart: "2026-11-01T20:00:00Z", isSprint: false },
  { round: 21, name: "Brazil",              date: "2026-11-08", fp1: "2026-11-06T11:00:00Z", fp2: "2026-11-06T14:30:00Z", qualStart: "2026-11-07T17:00:00Z", raceStart: "2026-11-08T17:00:00Z", isSprint: false },
  { round: 22, name: "Las Vegas",           date: "2026-11-21", fp1: "2026-11-19T22:00:00Z", fp2: "2026-11-20T01:30:00Z", qualStart: "2026-11-21T06:00:00Z", raceStart: "2026-11-22T06:00:00Z", isSprint: false },
  { round: 23, name: "Qatar",               date: "2026-11-29", fp1: "2026-11-27T15:00:00Z", fp2: "2026-11-27T18:30:00Z", qualStart: "2026-11-28T14:00:00Z", raceStart: "2026-11-29T16:00:00Z", isSprint: false },
  { round: 24, name: "Abu Dhabi",           date: "2026-12-06", fp1: "2026-12-04T08:00:00Z", fp2: "2026-12-04T11:30:00Z", qualStart: "2026-12-05T13:00:00Z", raceStart: "2026-12-06T13:00:00Z", isSprint: false },
];

// FIX (post-incident, 2026-07-24): was locking 30 min before FP2 (Friday),
// hardcoded, ignoring each league's own offset setting — locking predictions
// up to a day earlier than the frontend told players, and causing
// autoOpenRound to skip straight to the next race once that early lock time
// passed. Now mirrors F1League.jsx's getPredictionLockTime() exactly: locks
// before Qualifying (or Sprint Qualifying), using the per-group
// predictionLockOffsetMins setting instead of a hardcoded offset.
function getPredictionLockTime(race, offsetMins = 60) {
  const sessionStr = race.isSprint ? race.sprintQualStart : race.qualStart;
  if (sessionStr) return new Date(new Date(sessionStr).getTime() - offsetMins * 60 * 1000);
  return race.raceStart ? new Date(new Date(race.raceStart).getTime() - 5 * 60 * 60 * 1000) : null;
}

// Mirrors F1League.jsx's getPredictionOpenTime(): Monday 00:00 UTC of race
// week. Used as a floor so autoOpenRound can't open a round before its own
// race week has started (same root cause as the lock-time mismatch above —
// autoOpenRound previously had no such floor and would jump straight to the
// next scheduled race the moment the current one's lock time passed).
function getPredictionOpenTime(race) {
  if (!race?.date) return null;
  const raceDate = new Date(race.date + 'T00:00:00Z');
  const dayOfWeek = raceDate.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return new Date(raceDate.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
}

function fmtUTC(date) {
  return date.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

// ─── Email HTML Template ───────────────────────────────────────────────────────
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}

function buildEmailHtml({ raceName, raceRound, minsUntilLock, lockTime, isSprint, predictions, leagueName, totalPoints, leagueRank, unsubscribeUrl }) {
  const fields = isSprint
    ? ["pole", "sprintQualPole", "sprintP1", "sprintP2", "sprintP3", "raceP1", "raceP2", "raceP3", "finisherPosition"]
    : ["pole", "raceP1", "raceP2", "raceP3", "finisherPosition"];

  const labels = {
    pole: "Pole Position",
    sprintQualPole: "Sprint Quali Pole",
    sprintP1: "Sprint P1",
    sprintP2: "Sprint P2",
    sprintP3: "Sprint P3",
    raceP1: "Race P1",
    raceP2: "Race P2",
    raceP3: "Race P3",
    finisherPosition: "R# Driver",
  };

  const predRows = fields.map((f) => {
    const val = predictions?.[f];
    const set = !!val;
    return `
      <tr>
        <td style="padding:6px 12px;color:#aaaaaa;font-size:13px;">${labels[f]}</td>
        <td style="padding:6px 12px;font-size:13px;font-weight:bold;color:${set ? "#4ade80" : "#ef4444"};">
          ${set ? escapeHtml(val) : "Not set"}&nbsp;${set ? "✅" : "❌"}
        </td>
      </tr>`;
  }).join("");

  const rankLine = leagueRank
    ? `<span style="color:#facc15;font-weight:bold;">P${escapeHtml(String(leagueRank))}</span> in ${escapeHtml(leagueName)} &nbsp;·&nbsp; <span style="color:#facc15;font-weight:bold;">${escapeHtml(String(totalPoints ?? 0))} pts</span>`
    : `${escapeHtml(leagueName)} &nbsp;·&nbsp; <span style="color:#facc15;font-weight:bold;">${escapeHtml(String(totalPoints ?? 0))} pts</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>F1 Karvaan — Prediction Reminder</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#cc0000,#880000);padding:28px 24px;text-align:center;border-radius:12px 12px 0 0;">
            <div style="font-size:36px;font-weight:900;color:#ffffff;letter-spacing:6px;line-height:1;">F1</div>
            <div style="font-size:13px;color:#ffcccc;letter-spacing:4px;margin-top:4px;">KARVAAN</div>
          </td>
        </tr>

        <!-- Alert banner -->
        <tr>
          <td style="background:#1c0000;padding:18px 24px;text-align:center;border-left:1px solid #440000;border-right:1px solid #440000;">
            <div style="font-size:22px;font-weight:bold;color:#ffffff;">⏰ Predictions Closing Soon!</div>
            <div style="font-size:14px;color:#ffaaaa;margin-top:6px;">${escapeHtml(raceName)} — Round ${raceRound}</div>
          </td>
        </tr>

        <!-- Countdown -->
        <tr>
          <td style="background:#111111;padding:20px 24px;border-left:1px solid #440000;border-right:1px solid #440000;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#1e1e1e;border-radius:8px;padding:16px;text-align:center;">
                  <div style="font-size:42px;font-weight:900;color:#cc0000;">${minsUntilLock}</div>
                  <div style="font-size:12px;color:#888888;letter-spacing:2px;margin-top:4px;">MINUTES REMAINING</div>
                  <div style="font-size:12px;color:#555555;margin-top:6px;">Closes ${fmtUTC(lockTime)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Predictions status -->
        <tr>
          <td style="background:#111111;padding:4px 24px 20px;border-left:1px solid #440000;border-right:1px solid #440000;">
            <div style="font-size:11px;font-weight:bold;color:#666666;letter-spacing:2px;margin-bottom:8px;">YOUR PREDICTIONS</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;overflow:hidden;">
              ${predRows}
            </table>
          </td>
        </tr>

        <!-- CTA button -->
        <tr>
          <td style="background:#111111;padding:8px 24px 24px;text-align:center;border-left:1px solid #440000;border-right:1px solid #440000;">
            <a href="https://f1-predictionsleague.web.app" style="display:inline-block;background:#cc0000;color:#ffffff;font-weight:bold;font-size:16px;padding:14px 40px;border-radius:8px;text-decoration:none;letter-spacing:1px;">
              MAKE PREDICTIONS NOW →
            </a>
          </td>
        </tr>

        <!-- League info -->
        <tr>
          <td style="background:#0d0d0d;padding:16px 24px;text-align:center;border-left:1px solid #440000;border-right:1px solid #440000;border-top:1px solid #2a0000;">
            <div style="font-size:13px;color:#888888;">${rankLine}</div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#080808;padding:16px 24px;text-align:center;border-radius:0 0 12px 12px;border-left:1px solid #440000;border-right:1px solid #440000;border-bottom:1px solid #440000;">
            <div style="font-size:11px;color:#444444;">
              You're receiving this because you enabled email reminders in F1 Karvaan.<br>
              <a href="${unsubscribeUrl}" style="color:#666666;text-decoration:underline;">Unsubscribe from email reminders</a>
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Send email with up to 3 retries ──────────────────────────────────────────
async function sendReminderEmail({ transporter, to, race, minsUntilLock, lockTime, predictions, leagueName, totalPoints, leagueRank, unsubscribeUrl }) {
  const sessionLabel = race.isSprint ? "Sprint Qualifying" : "FP2";
  const html = buildEmailHtml({
    raceName: race.name,
    raceRound: race.round,
    minsUntilLock,
    lockTime,
    isSprint: race.isSprint,
    predictions,
    leagueName,
    totalPoints,
    leagueRank,
    unsubscribeUrl,
  });

  const mailOptions = {
    from: `"F1 Karvaan" <${GMAIL_USER.value()}>`,
    to,
    subject: `⏰ F1 Karvaan: ${race.name} R${race.round} predictions close in ${minsUntilLock} mins!`,
    html,
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await transporter.sendMail(mailOptions);
      return true;
    } catch (err) {
      console.error(`[email] Attempt ${attempt}/3 failed for ${to}:`, err.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return false;
}

// ─── Main scheduled function ───────────────────────────────────────────────────
exports.sendPredictionReminders = onSchedule(
  { schedule: "every 5 minutes", secrets: [GMAIL_USER, GMAIL_APP_PASSWORD, UNSUBSCRIBE_SIGNING_KEY] },
  async () => {
    const db = getFirestore();
    const messaging = getMessaging();
    const now = Date.now();

    // Races whose lock time falls within the next 50 minutes
    const upcomingRaces = F1_SCHEDULE_2026.filter((race) => {
      const lockTime = getPredictionLockTime(race);
      if (!lockTime) return false;
      const ms = lockTime.getTime() - now;
      return ms > 0 && ms <= 50 * 60 * 1000;
    });
    if (upcomingRaces.length === 0) return;

    // Load users who have push OR email notifications enabled
    const [pushSnap, emailSnap] = await Promise.all([
      db.collection("users").where("notificationSettings.pushNotifications", "==", true).get(),
      db.collection("users").where("notificationSettings.emailNotifications", "==", true).get(),
    ]);

    // Merge into a deduplicated map: uid → userData
    const userMap = new Map();
    [...pushSnap.docs, ...emailSnap.docs].forEach(d => userMap.set(d.id, d.data()));
    if (userMap.size === 0) return;

    // Create Gmail transporter once (reused across all users/races this invocation)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER.value(), pass: GMAIL_APP_PASSWORD.value() },
    });

    for (const race of upcomingRaces) {
      const lockTime = getPredictionLockTime(race);
      const minsUntilLock = Math.floor((lockTime.getTime() - now) / 60000);
      const roundKey = `round${race.round}`;
      const sessionLabel = race.isSprint ? "Sprint Qualifying" : "FP2";

      for (const [uid, userData] of userMap) {
        const reminderMins = userData.notificationSettings?.reminderMinutesBefore ?? 30;
        const wantsPush = !!userData.notificationSettings?.pushNotifications && !!userData.fcmToken;
        const wantsEmail = !!userData.notificationSettings?.emailNotifications;

        // Only fire during the 5-minute window before the user's chosen reminder time
        if (minsUntilLock > reminderMins || minsUntilLock < reminderMins - 5) continue;

        // Load groups and predictions for this user (shared for both push + email)
        const groupsSnap = await db.collection("groups").where("members", "array-contains", uid).get();
        let hasPredictions = false;
        let predictions = null;
        let leagueName = "F1 Karvaan";
        let totalPoints = 0;
        let leagueRank = null;

        for (const groupDoc of groupsSnap.docs) {
          const predDoc = await db.collection(`groups/${groupDoc.id}/predictions`).doc(uid).get();
          const roundPred = predDoc.exists ? predDoc.data()?.[roundKey] : null;
          if (roundPred?.pole) {
            hasPredictions = true;
            predictions = roundPred;
          } else {
            predictions = roundPred || {};
          }

          // Grab league name, total season points, and rank for email
          leagueName = groupDoc.data().name || leagueName;
          const scoresSnap = await db.collection(`groups/${groupDoc.id}/scores`).get();
          const allTotals = scoresSnap.docs.map(d => ({
            uid: d.id,
            pts: Object.values(d.data()).reduce((sum, r) => sum + (r.totalPoints || 0), 0),
          })).sort((a, b) => b.pts - a.pts);
          const myEntry = allTotals.find(e => e.uid === uid);
          totalPoints = myEntry?.pts ?? 0;
          leagueRank = allTotals.findIndex(e => e.uid === uid) + 1 || null;
          break; // use first group
        }

        if (hasPredictions) continue;

        // ── Push notification ──────────────────────────────────────────────────
        if (wantsPush) {
          const pushDocId = `${uid}_round${race.round}_push`;
          const alreadySent = (await db.collection("reminders").doc(pushDocId).get()).exists;
          if (!alreadySent) {
            try {
              await messaging.send({
                token: userData.fcmToken,
                notification: {
                  title: "⏰ Race Predictions Closing Soon!",
                  body: `${race.name} R${race.round} closes in ~${minsUntilLock} min — submit before ${sessionLabel} starts!`,
                },
                data: { raceRound: String(race.round), raceName: race.name, actionUrl: "https://f1-predictionsleague.web.app" },
                webpush: { fcmOptions: { link: "https://f1-predictionsleague.web.app" }, notification: { requireInteraction: false } },
              });
              await db.collection("reminders").doc(pushDocId).set({
                userId: uid, raceRound: race.round, raceName: race.name,
                sentAt: new Date().toISOString(), method: "push",
                minsBeforeLock: minsUntilLock, status: "sent",
              });
              console.log(`[push] Sent → ${uid} for ${race.name} R${race.round}`);
            } catch (err) {
              console.error(`[push] Failed for ${uid}:`, err.message);
              await db.collection("reminders").doc(pushDocId).set({
                userId: uid, raceRound: race.round, raceName: race.name,
                sentAt: new Date().toISOString(), method: "push",
                minsBeforeLock: minsUntilLock, status: "failed", error: err.message,
              });
              if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(err.code)) {
                await db.collection("users").doc(uid).update({ fcmToken: null });
              }
            }
          }
        }

        // ── Email notification ─────────────────────────────────────────────────
        if (wantsEmail) {
          const emailDocId = `${uid}_round${race.round}_email`;
          const alreadySent = (await db.collection("reminders").doc(emailDocId).get()).exists;
          if (!alreadySent) {
            let userEmail = null;
            try {
              const authUser = await getAuth().getUser(uid);
              userEmail = authUser.email;
            } catch (err) {
              console.error(`[email] Could not fetch email for ${uid}:`, err.message);
            }

            if (userEmail) {
              const unsubscribeUrl = buildUnsubscribeUrl(uid, UNSUBSCRIBE_SIGNING_KEY.value());
              const sent = await sendReminderEmail({
                transporter, to: userEmail, race, minsUntilLock, lockTime,
                predictions, leagueName, totalPoints, leagueRank, unsubscribeUrl,
              });
              await db.collection("reminders").doc(emailDocId).set({
                userId: uid, raceRound: race.round, raceName: race.name,
                sentAt: new Date().toISOString(), method: "email",
                minsBeforeLock: minsUntilLock, status: sent ? "sent" : "failed",
              });
              console.log(`[email] ${sent ? "Sent" : "Failed"} → ${userEmail} for ${race.name} R${race.round}`);
            }
          }
        }
      }
    }
  }
);

// ─── Auto-lock round ──────────────────────────────────────────────────────────
// Runs every 5 minutes. For each group, if the current open round's lock time
// has passed and predictions are still open, closes them. Idempotent — skips
// groups where isPredictionOpen is already false.

exports.autoLockRound = onSchedule({ schedule: "every 5 minutes" }, async () => {
  const db = getFirestore();
  const now = Date.now();

  const groupsSnap = await db.collection("groups").get();

  for (const groupDoc of groupsSnap.docs) {
    const groupData = groupDoc.data();
    const currentOpenRound = groupData.currentOpenRound;
    if (!currentOpenRound) continue;

    const roundNum = parseInt(currentOpenRound.replace("round", ""), 10);
    const race = F1_SCHEDULE_2026.find(r => r.round === roundNum);
    if (!race) continue;

    // Per-group offset — defaults to 60 to match F1League.jsx's default.
    const offsetMins = groupData.predictionLockOffsetMins ?? 60;
    const lockTime = getPredictionLockTime(race, offsetMins);
    if (!lockTime || lockTime.getTime() > now) continue; // Not yet time to lock

    const statusRef = db.collection(`groups/${groupDoc.id}/raceStatus`).doc(currentOpenRound);
    const statusSnap = await statusRef.get();

    // Already locked — nothing to do
    if (!statusSnap.exists || statusSnap.data().isPredictionOpen !== true) continue;

    await statusRef.set({ isPredictionOpen: false, lockedAt: new Date().toISOString() }, { merge: true });
    console.log(`[autoLockRound] Locked ${currentOpenRound} for group ${groupDoc.id}`);
  }
});

// ─── Auto-open round ──────────────────────────────────────────────────────────
// Runs every 10 minutes. For each group, determines which round should be open
// for predictions right now — the earliest round whose lock time is still in
// the future AND whose Monday-open floor has already passed. If no round
// currently satisfies both (e.g. during a summer-break-style gap between one
// round's lock and the next round's Monday), the group is skipped entirely —
// nothing is opened. Idempotent — skips groups already pointing at the
// correct open round.
//
// FIX (post-incident, 2026-07-24): target round is now computed per-group
// (using that group's own predictionLockOffsetMins) instead of once
// globally, and is gated by getPredictionOpenTime() — previously there was
// no Monday floor at all, so the instant one round's (incorrectly early)
// lock time passed, this function would immediately jump currentOpenRound
// to the *next* scheduled race, even if that race was weeks away.

exports.autoOpenRound = onSchedule({ schedule: "every 10 minutes" }, async () => {
  const db = getFirestore();
  const now = Date.now();

  const groupsSnap = await db.collection("groups").get();

  for (const groupDoc of groupsSnap.docs) {
    const groupData = groupDoc.data();
    const offsetMins = groupData.predictionLockOffsetMins ?? 60;

    // Earliest race whose lock time is still in the future AND whose
    // race-week has actually started = round to open for this group.
    const targetRace = F1_SCHEDULE_2026.find(race => {
      const lockTime = getPredictionLockTime(race, offsetMins);
      const openTime = getPredictionOpenTime(race);
      return lockTime && lockTime.getTime() > now && (!openTime || openTime.getTime() <= now);
    });
    if (!targetRace) continue; // No round eligible to be open for this group right now (e.g. mid-break)

    const targetRoundKey = `round${targetRace.round}`;
    const currentOpenRound = groupData.currentOpenRound;

    // Already pointing at the correct round — check status is open
    if (currentOpenRound === targetRoundKey) {
      const statusSnap = await db.collection(`groups/${groupDoc.id}/raceStatus`).doc(targetRoundKey).get();
      if (statusSnap.exists && statusSnap.data().isPredictionOpen === true) continue;
    }

    // Don't override if the current round's lock time is still in the future
    // (admin may have intentionally set a different round)
    if (currentOpenRound) {
      const currentRoundNum = parseInt(currentOpenRound.replace("round", ""), 10);
      const currentRace = F1_SCHEDULE_2026.find(r => r.round === currentRoundNum);
      const currentLockTime = currentRace ? getPredictionLockTime(currentRace, offsetMins) : null;
      if (currentLockTime && currentLockTime.getTime() > now) continue;
    }

    // Open the target round for this group.
    // FIX (post-Track-B audit): these were two independent writes — if the
    // second failed, raceStatus said the round was open but currentOpenRound
    // still pointed at the old (closed) round, so isRaceOpen() would block
    // every player. Admin SDK writes bypass security rules entirely, so
    // (unlike the client-side batch fixes elsewhere in this pass) there's no
    // rules-evaluation subtlety here — a plain batch is safe and sufficient.
    const batch = db.batch();
    batch.set(db.collection(`groups/${groupDoc.id}/raceStatus`).doc(targetRoundKey), {
      status: "CURRENT",
      isPredictionOpen: true,
      openedAt: new Date().toISOString(),
    }, { merge: true });
    batch.update(db.collection("groups").doc(groupDoc.id), { currentOpenRound: targetRoundKey });
    await batch.commit();
    console.log(`[autoOpenRound] Opened ${targetRoundKey} for group ${groupDoc.id}`);
  }
});

// ─── Unsubscribe endpoint ─────────────────────────────────────────────────────
// Linked from email footer — disables email notifications when clicked.
exports.unsubscribeEmail = onRequest({ secrets: [UNSUBSCRIBE_SIGNING_KEY] }, async (req, res) => {
  const { uid, ts, sig } = req.query;
  if (!uid || !ts || !sig) {
    res.status(400).send("Invalid link.");
    return;
  }
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Date.now() - tsNum > UNSUBSCRIBE_MAX_AGE_MS) {
    res.status(400).send("This unsubscribe link has expired.");
    return;
  }
  const expectedSig = signUnsubscribe(uid, tsNum, UNSUBSCRIBE_SIGNING_KEY.value());
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    res.status(403).send("Invalid or tampered unsubscribe link.");
    return;
  }
  try {
    await getFirestore().collection("users").doc(uid).update({
      "notificationSettings.emailNotifications": false,
    });
    res.status(200).send(`
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>Unsubscribed</title>
      <style>body{margin:0;background:#0a0a0a;color:#fff;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;}
      .box{max-width:400px;} h1{color:#cc0000;font-size:2rem;} p{color:#aaa;} a{color:#cc0000;}</style></head>
      <body><div class="box">
        <h1>Unsubscribed</h1>
        <p>You've been removed from F1 Karvaan email reminders.</p>
        <p>You can re-enable them anytime in the <a href="https://f1-predictionsleague.web.app">app settings</a>.</p>
      </div></body></html>
    `);
  } catch (err) {
    console.error("Unsubscribe error:", err);
    res.status(500).send("Something went wrong. Please try again.");
  }
});

// ─── Accept invite ──────────────────────────────────────────────────────────
// FIX (invite-security follow-up to Track B #10 / post-Track-B audit): the
// old client-side flow let any authenticated user who knew a group ID join
// directly (updateDoc + arrayUnion), with no verification they actually held
// a valid invite — the group-update rule only checked that admin/name/etc.
// stayed unchanged, never that an invite was involved at all. It also needed
// a client-side transaction + manual retry loop to make the usedCount
// increment atomic, because Firestore rules don't reliably evaluate
// arrayUnion inside transactions or auto-retry on a stale exact-equality
// rules check (both confirmed empirically while building that fix).
//
// Moving redemption here removes the vulnerability and the workaround in
// one step: this runs with Admin SDK privileges, so it bypasses security
// rules entirely (no rules evaluation, no transform quirks) and can use
// FieldValue.increment(), which is atomic at the storage layer — no client
// read-then-write, no retry logic needed. The group-update rule's
// invite-join branch is removed in the same change, so joining a group's
// `members` array is no longer possible via any direct client write at all;
// this function is the only path.
//
// Preserves prior behavior: an invite code has no redemption cap (the same
// code can be shared and used by multiple people), and re-accepting an
// invite you're already a member of is a no-op, not a double-count.
// invoker: "public" — without this, the underlying Cloud Run service for a
// 2nd-gen callable function defaults to denying invocation at the IAM layer
// before the request ever reaches this code, regardless of the caller's
// Firebase Auth ID token (confirmed via Cloud Run logs: "The request was
// not authorized to invoke this service" — an infrastructure-level 401,
// not the request.auth check below). Real authorization still happens
// inside the function via request.auth; this only controls whether Cloud
// Run's own gateway lets the request through to run that check at all.
exports.acceptInvite = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to accept an invite.");
  }
  const uid = request.auth.uid;
  const code = request.data?.code;
  if (typeof code !== "string" || !/^[A-Z0-9]{8}$/.test(code.trim().toUpperCase())) {
    throw new HttpsError("invalid-argument", "Invalid invite code.");
  }
  const normalizedCode = code.trim().toUpperCase();

  const db = getFirestore();
  const inviteRef = db.collection("invites").doc(normalizedCode);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) {
    throw new HttpsError("not-found", "This invite link is no longer valid.");
  }
  const invite = inviteSnap.data();

  const groupRef = db.collection("groups").doc(invite.leagueId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    throw new HttpsError("not-found", "This league no longer exists.");
  }
  const group = groupSnap.data();
  const alreadyMember = (group.members || []).includes(uid);

  if (!alreadyMember) {
    const batch = db.batch();
    batch.update(groupRef, { members: FieldValue.arrayUnion(uid) });
    batch.update(inviteRef, { usedCount: FieldValue.increment(1) });
    await batch.commit();
  }

  return {
    leagueId: invite.leagueId,
    leagueName: invite.leagueName || group.name || "F1 League",
    alreadyMember,
  };
});
