const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

// Mirror of the frontend schedule — only the fields needed for lock-time calculation.
// Update this alongside F1_SCHEDULE_2026 in F1League.jsx when new times are confirmed.
const F1_SCHEDULE_2026 = [
  { round: 1,  name: "Australia",           fp2: "2026-03-06T13:00:00Z",                                  raceStart: "2026-03-08T04:00:00Z", isSprint: false },
  { round: 2,  name: "China",               sprintQualStart: "2026-03-13T13:30:00Z",                      raceStart: "2026-03-15T07:00:00Z", isSprint: true  },
  { round: 3,  name: "Japan",               fp2: "2026-03-27T13:30:00Z",                                  raceStart: "2026-03-29T05:00:00Z", isSprint: false },
  { round: 4,  name: "Bahrain",             fp2: "2026-04-10T17:30:00Z",                                  raceStart: "2026-04-12T15:00:00Z", isSprint: false },
  { round: 5,  name: "Saudi Arabia",        fp2: "2026-04-17T20:30:00Z",                                  raceStart: "2026-04-19T17:00:00Z", isSprint: false },
  { round: 6,  name: "Miami",               sprintQualStart: "2026-05-01T17:00:00Z",                      raceStart: "2026-05-03T19:30:00Z", isSprint: true  },
  { round: 7,  name: "Canada",              sprintQualStart: "2026-05-22T18:00:00Z",                      raceStart: "2026-05-24T18:00:00Z", isSprint: true  },
  { round: 8,  name: "Monaco",              fp2: "2026-06-05T17:30:00Z",                                  raceStart: "2026-06-07T13:00:00Z", isSprint: false },
  { round: 9,  name: "Barcelona-Catalunya", fp2: "2026-06-12T16:30:00Z",                                  raceStart: "2026-06-14T13:00:00Z", isSprint: false },
  { round: 10, name: "Austria",             fp2: "2026-06-26T17:30:00Z",                                  raceStart: "2026-06-28T13:00:00Z", isSprint: false },
  { round: 11, name: "Great Britain",       sprintQualStart: "2026-07-03T17:00:00Z",                      raceStart: "2026-07-05T14:00:00Z", isSprint: true  },
  { round: 12, name: "Belgium",             fp2: "2026-07-17T17:30:00Z",                                  raceStart: "2026-07-19T13:00:00Z", isSprint: false },
  { round: 13, name: "Hungary",             fp2: "2026-07-24T17:30:00Z",                                  raceStart: "2026-07-26T13:00:00Z", isSprint: false },
  { round: 14, name: "Netherlands",         sprintQualStart: "2026-08-21T18:00:00Z",                      raceStart: "2026-08-23T13:00:00Z", isSprint: true  },
  { round: 15, name: "Italy",               fp2: "2026-09-04T16:30:00Z",                                  raceStart: "2026-09-06T13:00:00Z", isSprint: false },
  { round: 16, name: "Spain",               fp2: "2026-09-11T17:30:00Z",                                  raceStart: "2026-09-13T13:00:00Z", isSprint: false },
  { round: 17, name: "Azerbaijan",          fp2: "2026-09-25T15:30:00Z",                                  raceStart: "2026-09-27T11:00:00Z", isSprint: false },
  { round: 18, name: "Singapore",           sprintQualStart: "2026-10-09T18:00:00Z",                      raceStart: "2026-10-11T12:00:00Z", isSprint: true  },
  { round: 19, name: "United States",       fp2: "2026-10-23T15:30:00Z",                                  raceStart: "2026-10-25T19:00:00Z", isSprint: false },
  { round: 20, name: "Mexico",              fp2: "2026-10-30T21:30:00Z",                                  raceStart: "2026-11-01T20:00:00Z", isSprint: false },
  { round: 21, name: "Brazil",              fp2: "2026-11-06T14:30:00Z",                                  raceStart: "2026-11-08T17:00:00Z", isSprint: false },
  { round: 22, name: "Las Vegas",           fp2: "2026-11-20T01:30:00Z",                                  raceStart: "2026-11-22T06:00:00Z", isSprint: false },
  { round: 23, name: "Qatar",               fp2: "2026-11-27T18:30:00Z",                                  raceStart: "2026-11-29T16:00:00Z", isSprint: false },
  { round: 24, name: "Abu Dhabi",           fp2: "2026-12-04T11:30:00Z",                                  raceStart: "2026-12-06T13:00:00Z", isSprint: false },
];

function getPredictionLockTime(race) {
  const sessionStr = race.isSprint ? race.sprintQualStart : race.fp2;
  if (sessionStr) return new Date(new Date(sessionStr).getTime() - 30 * 60 * 1000);
  return race.raceStart ? new Date(new Date(race.raceStart).getTime() - 5 * 60 * 60 * 1000) : null;
}

/**
 * Runs every 5 minutes. For each race whose prediction window closes soon,
 * sends one push notification per user who:
 *   - has push notifications enabled
 *   - hasn't received a reminder for this race yet
 *   - hasn't submitted predictions for this round
 *   - is within their configured reminder window (default 30 min)
 *
 * Requires Firebase Blaze plan (scheduled functions need Cloud Scheduler).
 */
exports.sendPredictionReminders = onSchedule("every 5 minutes", async () => {
  const db = getFirestore();
  const messaging = getMessaging();
  const now = Date.now();

  // Find races whose lock time falls within the next 50 minutes
  // (covers the maximum 45-min reminder preference + 5-min function interval)
  const upcomingRaces = F1_SCHEDULE_2026.filter((race) => {
    const lockTime = getPredictionLockTime(race);
    if (!lockTime) return false;
    const msUntilLock = lockTime.getTime() - now;
    return msUntilLock > 0 && msUntilLock <= 50 * 60 * 1000;
  });

  if (upcomingRaces.length === 0) return;

  // Load all users with push notifications enabled
  const usersSnap = await db
    .collection("users")
    .where("notificationSettings.pushNotifications", "==", true)
    .get();

  if (usersSnap.empty) return;

  for (const race of upcomingRaces) {
    const lockTime = getPredictionLockTime(race);
    const msUntilLock = lockTime.getTime() - now;
    const minsUntilLock = Math.floor(msUntilLock / 60000);

    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      const uid = userDoc.id;
      const fcmToken = userData.fcmToken;
      const reminderMins = userData.notificationSettings?.reminderMinutesBefore ?? 30;

      if (!fcmToken) continue;

      // Only fire during the 5-minute window before the user's chosen reminder time
      // e.g. for 30-min preference: fire when minsUntilLock is 26–30
      if (minsUntilLock > reminderMins || minsUntilLock < reminderMins - 5) continue;

      // Idempotency — skip if reminder already sent for this race
      const reminderDocId = `${uid}_round${race.round}`;
      const existingReminder = await db.collection("reminders").doc(reminderDocId).get();
      if (existingReminder.exists) continue;

      // Check if user has already submitted predictions for this round
      const roundKey = `round${race.round}`;
      const groupsSnap = await db
        .collection("groups")
        .where("members", "array-contains", uid)
        .get();

      let hasPredictions = false;
      for (const groupDoc of groupsSnap.docs) {
        const predDoc = await db
          .collection(`groups/${groupDoc.id}/predictions`)
          .doc(uid)
          .get();
        if (predDoc.exists && predDoc.data()?.[roundKey]?.pole) {
          hasPredictions = true;
          break;
        }
      }

      if (hasPredictions) continue;

      // Send the push notification
      const sessionLabel = race.isSprint ? "Sprint Qualifying" : "FP2";
      try {
        await messaging.send({
          token: fcmToken,
          notification: {
            title: "⏰ Race Predictions Closing Soon!",
            body: `${race.name} R${race.round} closes in ~${minsUntilLock} minutes — make your picks before ${sessionLabel} starts!`,
          },
          data: {
            raceRound: String(race.round),
            raceName: race.name,
            actionUrl: "https://f1-predictionsleague.web.app",
          },
          webpush: {
            fcmOptions: { link: "https://f1-predictionsleague.web.app" },
            notification: { requireInteraction: false },
          },
        });

        // Log the sent reminder (prevents duplicates on next tick)
        await db.collection("reminders").doc(reminderDocId).set({
          userId: uid,
          raceRound: race.round,
          raceName: race.name,
          sentAt: new Date().toISOString(),
          method: "push",
          minsBeforeLock: minsUntilLock,
        });

        console.log(`Reminder sent → ${uid} for ${race.name} R${race.round} (${minsUntilLock} min)`);
      } catch (err) {
        console.error(`Failed to notify ${uid}:`, err.message);
        // Token expired or unregistered — clear it so we don't keep trying
        if (
          err.code === "messaging/registration-token-not-registered" ||
          err.code === "messaging/invalid-registration-token"
        ) {
          await db.collection("users").doc(uid).update({ fcmToken: null });
        }
      }
    }
  }
});
