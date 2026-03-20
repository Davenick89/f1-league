const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
const nodemailer = require("nodemailer");

initializeApp();

const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

// ─── Schedule (mirrors F1League.jsx F1_SCHEDULE_2026) ─────────────────────────
const F1_SCHEDULE_2026 = [
  { round: 1,  name: "Australia",           fp2: "2026-03-06T13:00:00Z",             raceStart: "2026-03-08T04:00:00Z", isSprint: false },
  { round: 2,  name: "China",               sprintQualStart: "2026-03-13T13:30:00Z", raceStart: "2026-03-15T07:00:00Z", isSprint: true  },
  { round: 3,  name: "Japan",               fp2: "2026-03-27T13:30:00Z",             raceStart: "2026-03-29T05:00:00Z", isSprint: false },
  { round: 4,  name: "Bahrain",             fp2: "2026-04-10T17:30:00Z",             raceStart: "2026-04-12T15:00:00Z", isSprint: false },
  { round: 5,  name: "Saudi Arabia",        fp2: "2026-04-17T20:30:00Z",             raceStart: "2026-04-19T17:00:00Z", isSprint: false },
  { round: 6,  name: "Miami",               sprintQualStart: "2026-05-01T17:00:00Z", raceStart: "2026-05-03T19:30:00Z", isSprint: true  },
  { round: 7,  name: "Canada",              sprintQualStart: "2026-05-22T18:00:00Z", raceStart: "2026-05-24T18:00:00Z", isSprint: true  },
  { round: 8,  name: "Monaco",              fp2: "2026-06-05T17:30:00Z",             raceStart: "2026-06-07T13:00:00Z", isSprint: false },
  { round: 9,  name: "Barcelona-Catalunya", fp2: "2026-06-12T16:30:00Z",             raceStart: "2026-06-14T13:00:00Z", isSprint: false },
  { round: 10, name: "Austria",             fp2: "2026-06-26T17:30:00Z",             raceStart: "2026-06-28T13:00:00Z", isSprint: false },
  { round: 11, name: "Great Britain",       sprintQualStart: "2026-07-03T17:00:00Z", raceStart: "2026-07-05T14:00:00Z", isSprint: true  },
  { round: 12, name: "Belgium",             fp2: "2026-07-17T17:30:00Z",             raceStart: "2026-07-19T13:00:00Z", isSprint: false },
  { round: 13, name: "Hungary",             fp2: "2026-07-24T17:30:00Z",             raceStart: "2026-07-26T13:00:00Z", isSprint: false },
  { round: 14, name: "Netherlands",         sprintQualStart: "2026-08-21T18:00:00Z", raceStart: "2026-08-23T13:00:00Z", isSprint: true  },
  { round: 15, name: "Italy",               fp2: "2026-09-04T16:30:00Z",             raceStart: "2026-09-06T13:00:00Z", isSprint: false },
  { round: 16, name: "Spain",               fp2: "2026-09-11T17:30:00Z",             raceStart: "2026-09-13T13:00:00Z", isSprint: false },
  { round: 17, name: "Azerbaijan",          fp2: "2026-09-25T15:30:00Z",             raceStart: "2026-09-27T11:00:00Z", isSprint: false },
  { round: 18, name: "Singapore",           sprintQualStart: "2026-10-09T18:00:00Z", raceStart: "2026-10-11T12:00:00Z", isSprint: true  },
  { round: 19, name: "United States",       fp2: "2026-10-23T15:30:00Z",             raceStart: "2026-10-25T19:00:00Z", isSprint: false },
  { round: 20, name: "Mexico",              fp2: "2026-10-30T21:30:00Z",             raceStart: "2026-11-01T20:00:00Z", isSprint: false },
  { round: 21, name: "Brazil",              fp2: "2026-11-06T14:30:00Z",             raceStart: "2026-11-08T17:00:00Z", isSprint: false },
  { round: 22, name: "Las Vegas",           fp2: "2026-11-20T01:30:00Z",             raceStart: "2026-11-22T06:00:00Z", isSprint: false },
  { round: 23, name: "Qatar",               fp2: "2026-11-27T18:30:00Z",             raceStart: "2026-11-29T16:00:00Z", isSprint: false },
  { round: 24, name: "Abu Dhabi",           fp2: "2026-12-04T11:30:00Z",             raceStart: "2026-12-06T13:00:00Z", isSprint: false },
];

function getPredictionLockTime(race) {
  const sessionStr = race.isSprint ? race.sprintQualStart : race.fp2;
  if (sessionStr) return new Date(new Date(sessionStr).getTime() - 30 * 60 * 1000);
  return race.raceStart ? new Date(new Date(race.raceStart).getTime() - 5 * 60 * 60 * 1000) : null;
}

function fmtUTC(date) {
  return date.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

// ─── Email HTML Template ───────────────────────────────────────────────────────
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
          ${set ? val : "Not set"}&nbsp;${set ? "✅" : "❌"}
        </td>
      </tr>`;
  }).join("");

  const rankLine = leagueRank
    ? `<span style="color:#facc15;font-weight:bold;">P${leagueRank}</span> in ${leagueName} &nbsp;·&nbsp; <span style="color:#facc15;font-weight:bold;">${totalPoints ?? 0} pts</span>`
    : `${leagueName} &nbsp;·&nbsp; <span style="color:#facc15;font-weight:bold;">${totalPoints ?? 0} pts</span>`;

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
            <div style="font-size:14px;color:#ffaaaa;margin-top:6px;">${raceName} — Round ${raceRound}</div>
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
  { schedule: "every 5 minutes", secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
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
              const unsubscribeUrl = `https://us-central1-f1-predictions-league.cloudfunctions.net/unsubscribeEmail?uid=${uid}`;
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

// ─── Unsubscribe endpoint ─────────────────────────────────────────────────────
// Linked from email footer — disables email notifications when clicked.
exports.unsubscribeEmail = onRequest({ secrets: [] }, async (req, res) => {
  const uid = req.query.uid;
  if (!uid) {
    res.status(400).send("Invalid link.");
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
