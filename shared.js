// shared.js — Firebase instances, season schedule/constants, and utility
// functions used across multiple views. Extracted from F1League.jsx as part
// of the Track C code-split; every lazy-loaded view file imports from here
// instead of duplicating these definitions.
import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { collection, doc, getDocs, initializeFirestore, onSnapshot, persistentLocalCache, setDoc, writeBatch } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getMessaging, onMessage } from 'firebase/messaging';
import { getAnalytics, logEvent, isSupported as analyticsIsSupported } from 'firebase/analytics';
import { rfDistance, rfPoints, scoreRace } from './scoring.js';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(e => console.error("Auth error:", e));
export const db = initializeFirestore(app, { localCache: persistentLocalCache() });
export const functions = getFunctions(app);

// Shared browser connectivity state. Firestore listeners independently report
// cached snapshots; this hook is for UI that must block writes while offline.
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const setOnline = () => setIsOnline(true);
    const setOffline = () => setIsOnline(false);
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);
    return () => {
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
    };
  }, []);

  return isOnline;
}

// FIX (post-Track-D audit): navigator.onLine only reflects whether a network
// interface is up, not whether Firestore is actually reachable — a player on
// a dead/degraded Wi-Fi uplink or behind a captive portal can pass the
// useOnlineStatus() gate. Combined with persistentLocalCache(), setDoc()
// resolves as soon as a write is durably queued locally, before any server
// round-trip — so a caller that shows "saved" on setDoc() resolving alone can
// tell a player their prediction is locked in when it's only queued, and if
// it doesn't sync until after the round locks, firestore.rules silently
// rejects it with nothing surfacing the failure. This waits for the write's
// own snapshot to confirm hasPendingWrites === false (i.e., the server has
// it) before the caller treats it as truly saved, so a caller can tell a
// merely-queued write apart from a confirmed one instead of asserting success
// for both.
export function waitForServerAck(docRef, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};

    // unsubscribe is called from inside callbacks that may fire before the
    // onSnapshot() call below returns and assigns it — guard with a wrapper
    // rather than referencing the outer const directly (TDZ/undefined risk).
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(result);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    unsubscribe = onSnapshot(docRef, { includeMetadataChanges: true }, (snapshot) => {
      if (!snapshot.metadata.hasPendingWrites) finish(true);
    }, () => finish(false));
  });
}

// ─── Analytics ────────────────────────────────────────────────────────────────
// Initialised lazily — GA4 requires a browser environment and a valid
// measurementId. Falls back to a no-op so missing config never breaks the app.
let analytics = null;
analyticsIsSupported().then(supported => {
  if (supported && import.meta.env.VITE_FIREBASE_MEASUREMENT_ID &&
      !import.meta.env.VITE_FIREBASE_MEASUREMENT_ID.includes('XXXXXXXXXX')) {
    analytics = getAnalytics(app);
  }
}).catch(() => {});

export function track(eventName, params = {}) {
  if (!analytics) return;
  try { logEvent(analytics, eventName, params); } catch (_) {}
}

// FCM — capability check is cheap and runs eagerly (drives Settings UI).
// The actual messaging instance is only constructed lazily, the first time
// enablePushNotifications() runs, since most visitors never open Settings.
export const fcmSupported = (() => {
  try {
    return 'serviceWorker' in navigator && 'Notification' in window;
  } catch (e) {
    return false;
  }
})();
let messaging = null;
export function getMessagingInstance() {
  if (messaging || !fcmSupported) return messaging;
  try {
    messaging = getMessaging(app);
    // Show in-app notification toasts for foreground messages
    onMessage(messaging, (payload) => {
      const { title, body } = payload.notification ?? {};
      // Foreground FCM messages handled silently — no toast needed
      // Foreground toast is handled in the Settings UI via a state update
    });
  } catch (e) {
    // FCM not supported in this browser — silent fallback
  }
  return messaging;
}

// Rebuilt (session 2026-08-06) against live Jolpica data to match the real,
// current 2026 calendar: Bahrain and Saudi Arabia were cancelled (Middle
// East conflict) and are no longer rounds — Formula 1 later added a
// relocated "Bahrain Grand Prix" hosted at Sepang, Malaysia in October
// (round 16 below) rather than restoring either original race. The season
// is 23 rounds, not 24. Every consumer of this array's length (getCurrentRound,
// season-total loops, "next round" gates) now derives from
// F1_SCHEDULE_2026.length instead of a hardcoded number, so a further
// cancellation/addition — plausible given the ongoing regional
// instability — only requires editing this array, not hunting down magic
// numbers across the codebase.
export const F1_SCHEDULE_2026 = [
  { round: 1,  name: "Australia",          location: "Melbourne",     date: "2026-03-08", fp1: "2026-03-06T01:30:00Z", fp2: "2026-03-06T05:00:00Z", qualStart: "2026-03-07T05:00:00Z", raceStart: "2026-03-08T04:00:00Z", isSprint: false },
  { round: 2,  name: "China",              location: "Shanghai",      date: "2026-03-15", fp1: "2026-03-13T03:30:00Z", sprintQualStart: "2026-03-13T07:30:00Z",                                               qualStart: "2026-03-14T07:00:00Z", raceStart: "2026-03-15T07:00:00Z", isSprint: true  },
  { round: 3,  name: "Japan",              location: "Suzuka",        date: "2026-03-29", fp1: "2026-03-27T02:30:00Z", fp2: "2026-03-27T06:00:00Z", qualStart: "2026-03-28T06:00:00Z", raceStart: "2026-03-29T05:00:00Z", isSprint: false },
  { round: 4,  name: "Miami",              location: "Miami",         date: "2026-05-03", fp1: "2026-05-01T16:00:00Z", sprintQualStart: "2026-05-01T20:30:00Z",                                               qualStart: "2026-05-02T20:00:00Z", raceStart: "2026-05-03T20:00:00Z", isSprint: true  },
  { round: 5,  name: "Canada",             location: "Montreal",      date: "2026-05-24", fp1: "2026-05-22T16:30:00Z", sprintQualStart: "2026-05-22T20:30:00Z",                                               qualStart: "2026-05-23T20:00:00Z", raceStart: "2026-05-24T20:00:00Z", isSprint: true  },
  { round: 6,  name: "Monaco",             location: "Monte Carlo",   date: "2026-06-07", fp1: "2026-06-05T11:30:00Z", fp2: "2026-06-05T15:00:00Z", qualStart: "2026-06-06T14:00:00Z", raceStart: "2026-06-07T13:00:00Z", isSprint: false },
  { round: 7,  name: "Barcelona-Catalunya",location: "Barcelona",     date: "2026-06-14", fp1: "2026-06-12T11:30:00Z", fp2: "2026-06-12T15:00:00Z", qualStart: "2026-06-13T14:00:00Z", raceStart: "2026-06-14T13:00:00Z", isSprint: false },
  { round: 8,  name: "Austria",            location: "Spielberg",     date: "2026-06-28", fp1: "2026-06-26T11:30:00Z", fp2: "2026-06-26T15:00:00Z", qualStart: "2026-06-27T14:00:00Z", raceStart: "2026-06-28T13:00:00Z", isSprint: false },
  { round: 9,  name: "Great Britain",      location: "Silverstone",   date: "2026-07-05", fp1: "2026-07-03T11:30:00Z", sprintQualStart: "2026-07-03T15:30:00Z",                                               qualStart: "2026-07-04T15:00:00Z", raceStart: "2026-07-05T14:00:00Z", isSprint: true  },
  { round: 10, name: "Belgium",            location: "Spa",           date: "2026-07-19", fp1: "2026-07-17T11:30:00Z", fp2: "2026-07-17T15:00:00Z", qualStart: "2026-07-18T14:00:00Z", raceStart: "2026-07-19T13:00:00Z", isSprint: false },
  { round: 11, name: "Hungary",            location: "Budapest",      date: "2026-07-26", fp1: "2026-07-24T11:30:00Z", fp2: "2026-07-24T15:00:00Z", qualStart: "2026-07-25T14:00:00Z", raceStart: "2026-07-26T13:00:00Z", isSprint: false },
  { round: 12, name: "Netherlands",        location: "Zandvoort",     date: "2026-08-23", fp1: "2026-08-21T10:30:00Z", sprintQualStart: "2026-08-21T14:30:00Z",                                               qualStart: "2026-08-22T14:00:00Z", raceStart: "2026-08-23T13:00:00Z", isSprint: true  },
  { round: 13, name: "Italy",              location: "Monza",         date: "2026-09-06", fp1: "2026-09-04T10:30:00Z", fp2: "2026-09-04T14:00:00Z", qualStart: "2026-09-05T14:00:00Z", raceStart: "2026-09-06T13:00:00Z", isSprint: false },
  { round: 14, name: "Spain",              location: "Madrid",        date: "2026-09-13", fp1: "2026-09-11T11:30:00Z", fp2: "2026-09-11T15:00:00Z", qualStart: "2026-09-12T14:00:00Z", raceStart: "2026-09-13T13:00:00Z", isSprint: false },
  { round: 15, name: "Azerbaijan",         location: "Baku",          date: "2026-09-26", fp1: "2026-09-24T08:30:00Z", fp2: "2026-09-24T12:00:00Z", qualStart: "2026-09-25T12:00:00Z", raceStart: "2026-09-26T11:00:00Z", isSprint: false },
  { round: 16, name: "Bahrain (Malaysia)", location: "Kuala Lumpur",  date: "2026-10-04", fp1: "2026-10-02T02:00:00Z", fp2: "2026-10-02T06:00:00Z", qualStart: "2026-10-03T09:00:00Z", raceStart: "2026-10-04T07:00:00Z", isSprint: false },
  { round: 17, name: "Singapore",          location: "Marina Bay",    date: "2026-10-11", fp1: "2026-10-09T08:30:00Z", sprintQualStart: "2026-10-09T12:30:00Z",                                               qualStart: "2026-10-10T13:00:00Z", raceStart: "2026-10-11T12:00:00Z", isSprint: true  },
  { round: 18, name: "United States",      location: "Austin",        date: "2026-10-25", fp1: "2026-10-23T17:30:00Z", fp2: "2026-10-23T21:00:00Z", qualStart: "2026-10-24T21:00:00Z", raceStart: "2026-10-25T20:00:00Z", isSprint: false },
  { round: 19, name: "Mexico",             location: "Mexico City",   date: "2026-11-01", fp1: "2026-10-30T18:30:00Z", fp2: "2026-10-30T22:00:00Z", qualStart: "2026-10-31T21:00:00Z", raceStart: "2026-11-01T20:00:00Z", isSprint: false },
  { round: 20, name: "Brazil",             location: "São Paulo",     date: "2026-11-08", fp1: "2026-11-06T15:30:00Z", fp2: "2026-11-06T19:00:00Z", qualStart: "2026-11-07T18:00:00Z", raceStart: "2026-11-08T17:00:00Z", isSprint: false },
  { round: 21, name: "Las Vegas",          location: "Las Vegas",     date: "2026-11-22", fp1: "2026-11-20T00:30:00Z", fp2: "2026-11-20T04:00:00Z", qualStart: "2026-11-21T04:00:00Z", raceStart: "2026-11-22T04:00:00Z", isSprint: false },
  { round: 22, name: "Qatar",              location: "Lusail",        date: "2026-11-29", fp1: "2026-11-27T13:30:00Z", fp2: "2026-11-27T17:00:00Z", qualStart: "2026-11-28T18:00:00Z", raceStart: "2026-11-29T16:00:00Z", isSprint: false },
  { round: 23, name: "Abu Dhabi",          location: "Yas Island",    date: "2026-12-06", fp1: "2026-12-04T09:30:00Z", fp2: "2026-12-04T13:00:00Z", qualStart: "2026-12-05T14:00:00Z", raceStart: "2026-12-06T13:00:00Z", isSprint: false },
];

export const F1_DRIVERS = [
  "Lando Norris", "Oscar Piastri", "George Russell", "Kimi Antonelli",
  "Charles Leclerc", "Lewis Hamilton", "Max Verstappen", "Isack Hadjar",
  "Carlos Sainz", "Alexander Albon", "Fernando Alonso", "Lance Stroll",
  "Pierre Gasly", "Franco Colapinto", "Oliver Bearman", "Esteban Ocon",
  "Liam Lawson", "Arvid Lindblad", "Nico Hulkenberg", "Gabriel Bortoleto",
  "Sergio Perez", "Valtteri Bottas"
];

export const F1_TEAMS = [
  "McLaren", "Mercedes", "Ferrari", "Red Bull Racing", "Williams",
  "Aston Martin", "Alpine", "Haas", "Racing Bulls", "Audi", "Cadillac"
];


export function getCurrentRound() {
  const now = new Date();
  const seasonStart = new Date("2026-03-06T00:00:00Z");
  if (now < seasonStart) return 1;
  for (let i = F1_SCHEDULE_2026.length - 1; i >= 0; i--) {
    if (now >= new Date(F1_SCHEDULE_2026[i].date + "T23:59:59Z")) {
      return Math.min(i + 2, F1_SCHEDULE_2026.length);
    }
  }
  return 1;
}

// Returns the prediction lock time for a race:
// - Sprint weekends: 30 min before Sprint Qualifying
// - Normal weekends: 30 min before Qualifying
// Falls back to 5h before race start if session times are missing.
// offsetMins: minutes before qualifying session to lock predictions.
// Defaults to 30; overridden per-league via group.predictionLockOffsetMins.
// apiSessionStr: validated qualifying start from Jolpica API — overrides hardcoded qualStart
// when present (more accurate for mid-season schedule changes).
export function getPredictionLockTime(race, offsetMins = 60, apiSessionStr = null) {
  if (!race) return null;
  // API time wins when available; hardcoded is the fallback.
  const sessionStr = apiSessionStr ?? (race.isSprint ? race.sprintQualStart : race.qualStart);
  if (sessionStr) return new Date(new Date(sessionStr).getTime() - offsetMins * 60 * 1000);
  return race.raceStart ? new Date(new Date(race.raceStart).getTime() - 5 * 60 * 60 * 1000) : null;
}

// Validates an apiRound's qualifying/sprint-qualifying time against the
// hardcoded schedule before it's trusted as a lock-time override — catches
// round-number mismatches (e.g. a cancelled/rescheduled race shifting every
// later round) that would otherwise silently swap in a wildly wrong lock
// time. apiRound is one entry of useF1ApiSchedule's apiData map.
// Threshold tightened from 10 to 3 days (session 2026-08-06): verified against
// live data that a 10-day window silently accepted several round-shifted
// mismatches following the Bahrain/Saudi Arabia cancellation (see
// functions/index.js's SCHEDULE_SANITY_MS for the full analysis) — the
// season's tightest real gap between two different rounds is 7 days, so 3
// days keeps margin on both sides.
export function getValidatedApiSessionStr(race, apiRound) {
  if (!race || !apiRound) return null;
  const hardcodedStr = race.isSprint ? race.sprintQualStart : (race.qualStart ?? race.raceStart);
  const apiStr = race.isSprint ? apiRound.sprintQualifyingStart : apiRound.qualifyingStart;
  if (!hardcodedStr || !apiStr) return null;
  const hardcodedMs = new Date(hardcodedStr).getTime();
  const apiMs = new Date(apiStr).getTime();
  const valid = Math.abs(apiMs - hardcodedMs) < 3 * 24 * 60 * 60 * 1000;
  return valid ? apiStr : null;
}

// Format a Date as IST with a UTC reference, e.g.
// "Sat, 7 Jun · 6:30 PM IST (13:00 UTC)"
export function formatLockTimeIST(date) {
  if (!date) return null;
  const ist = date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).replace(/,\s*/g, ', ');
  const utcH = String(date.getUTCHours()).padStart(2, '0');
  const utcM = String(date.getUTCMinutes()).padStart(2, '0');
  return `${ist} IST (${utcH}:${utcM} UTC)`;
}

export function getTimeUntilLock(race, offsetMins = 60, apiSessionStr = null) {
  const lockTime = getPredictionLockTime(race, offsetMins, apiSessionStr);
  if (!lockTime) return "N/A";
  const diff = lockTime - new Date();
  if (diff <= 0) return "LOCKED";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function isEditLocked(race, offsetMins = 60, apiSessionStr = null) {
  const lockTime = getPredictionLockTime(race, offsetMins, apiSessionStr);
  return lockTime ? new Date() >= lockTime : false;
}

// Returns the Monday 00:00:00 UTC of the race week — predictions open at this point.
// Sun race (day=0): daysSinceMonday=6  Mon race (day=1): daysSinceMonday=0  Sat (day=6): daysSinceMonday=5
export function getPredictionOpenTime(race) {
  if (!race?.date) return null;
  const raceDate = new Date(race.date + 'T00:00:00Z');
  const dayOfWeek = raceDate.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return new Date(raceDate.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
}

// Returns display name: custom nickname > first letter of email > "?"
export function getDisplayName(nickname, googleFirstName, email) {
  if (nickname && nickname.trim()) return nickname.trim();
  if (googleFirstName && googleFirstName.trim()) return googleFirstName.trim();
  if (email) return email.charAt(0).toUpperCase();
  return '?';
}

// SCHEDULE SYNC — runs on app load, checks Jolpica API against hardcoded schedule
export async function syncScheduleWithAPI() {
  const TOLERANCE_MS = 60 * 60 * 1000; // 1-hour tolerance
  try {
    const res = await fetch('https://api.jolpi.ca/ergast/f1/2026.json?limit=100');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const races = data?.MRData?.RaceTable?.Races;
    if (!races?.length) return;

    const toIso = (obj) => obj?.date && obj?.time ? `${obj.date}T${obj.time}` : null;

    // Calendar-restructure check (session 2026-08-06): the per-round time-drift
    // check below silently no-ops for any round the API returns that isn't in
    // F1_SCHEDULE_2026 at all — which is exactly what let the Bahrain/Saudi
    // Arabia cancellation go unnoticed for months (the region remains
    // unstable, so a further cancellation/addition is plausible, not a one-off).
    // A count or name mismatch means round *numbers* have shifted, not just
    // times — F1_SCHEDULE_2026 needs a manual rebuild, not just a time nudge.
    if (races.length !== F1_SCHEDULE_2026.length) {
      console.error(`[Schedule Sync] CALENDAR SIZE MISMATCH: API has ${races.length} rounds, F1_SCHEDULE_2026 has ${F1_SCHEDULE_2026.length} — a race was likely added or cancelled. Round numbers may no longer line up; rebuild F1_SCHEDULE_2026 from the live API rather than trusting per-round time checks below.`);
    }
    races.forEach(apiRace => {
      const round = parseInt(apiRace.round);
      const hardcoded = F1_SCHEDULE_2026.find(r => r.round === round);
      if (!hardcoded) {
        console.error(`[Schedule Sync] API round ${round} (${apiRace.raceName}) has no matching entry in F1_SCHEDULE_2026 — calendar has likely been restructured; rebuild the hardcoded schedule.`);
        return;
      }
      // Check every field getPredictionLockTime() can actually use — qualifying/
      // sprint-qualifying drive the real lock time; raceStart is only the
      // fallback when qualifying data is missing. A drift check that only
      // looked at raceStart (the old behavior) could miss the field that
      // matters for locking predictions.
      const checks = [
        ['raceStart', toIso(apiRace), hardcoded.raceStart],
        ['qualifying', toIso(apiRace.Qualifying), hardcoded.qualStart],
        ['sprintQualifying', toIso(apiRace.SprintQualifying), hardcoded.sprintQualStart],
      ];
      checks.forEach(([label, apiStr, hardcodedStr]) => {
        if (!apiStr || !hardcodedStr) return;
        const diffMs = Math.abs(new Date(apiStr).getTime() - new Date(hardcodedStr).getTime());
        if (diffMs > TOLERANCE_MS) {
          const diffH = Math.round(diffMs / (1000 * 60 * 60));
          console.error(`[Schedule Sync] R${round} ${hardcoded.name} ${label}: differs by ~${diffH}h — update F1_SCHEDULE_2026 (API: ${apiStr}, hardcoded: ${hardcodedStr})`);
        }
      });
    });
  } catch (err) {
    console.error('[Schedule Sync] Error:', err.message);
  }
}

export function useF1ApiSchedule(season = 2026) {
  const [apiData, setApiData] = useState(null);
  const [apiStatus, setApiStatus] = useState('loading'); // 'loading' | 'ok' | 'error'

  useEffect(() => {
    const toIso = (obj) => obj?.date && obj?.time ? `${obj.date}T${obj.time}` : null;
    fetch(`https://api.jolpi.ca/ergast/f1/${season}.json`)
      .then(r => { if (!r.ok) throw new Error('API error'); return r.json(); })
      .then(data => {
        const races = data?.MRData?.RaceTable?.Races;
        if (!races?.length) { setApiStatus('error'); return; }
        const schedule = {};
        races.forEach(race => {
          const round = parseInt(race.round);
          schedule[round] = {
            raceStart: toIso(race),
            fp2Start: toIso(race.SecondPractice),
            sprintStart: toIso(race.Sprint),
            sprintQualifyingStart: toIso(race.SprintQualifying),
            qualifyingStart: toIso(race.Qualifying),
          };
        });
        setApiData(schedule);
        setApiStatus('ok');
      })
      .catch(() => setApiStatus('error'));
  }, [season]);

  return { apiData, apiStatus };
}

// Computes and persists every player's score for one round, then refreshes
// the league's precomputed standings summary doc that GroupStandingBadge
// reads (see Track C #15). Single write path for both ResultsView's "Save
// Results" flow and CalendarView's admin "Recalculate" flow — they used to
// duplicate this ~30-line block, one atomically (batched writes) and one
// with a sequential per-player await (Track B #7's atomicity fix hadn't
// reached the second copy).
// playerEntries: [{ userId, roundData }] — roundData is that player's
// prediction payload for this round (finisherPosition, pole, etc.), or
// null/undefined for players who didn't predict this round (skipped).
export async function saveRoundScores({ db, groupId, roundNum, playerEntries, results, randomNumber, isSprint }) {
  const roundKey = `round${roundNum}`;

  const withDistance = playerEntries
    .filter(({ roundData }) => roundData)
    .map(({ userId, roundData }) => ({
      userId,
      roundData,
      distance: rfDistance(userId, roundData.finisherPosition, results.rPredFinishPositions, randomNumber),
    }));

  const validDistances = withDistance.filter(p => p.distance !== Infinity).map(p => p.distance);
  const minDistance = validDistances.length > 0 ? Math.min(...validDistances) : Infinity;

  const batch = writeBatch(db);
  for (const { userId, roundData, distance } of withDistance) {
    const { totalPoints, breakdown } = scoreRace(roundData, results, isSprint);
    const rfPts = rfPoints(distance, minDistance);
    breakdown.randomFinisher = rfPts;
    batch.set(doc(db, `groups/${groupId}/scores`, userId), {
      [roundKey]: { totalPoints: totalPoints + rfPts, breakdown },
    }, { merge: true });
  }
  await batch.commit();

  const freshScoresSnap = await getDocs(collection(db, `groups/${groupId}/scores`));
  const totals = freshScoresSnap.docs
    .filter(d => d.id !== 'summary')
    .map(d => {
      let pts = 0;
      for (let i = 1; i <= F1_SCHEDULE_2026.length; i++) pts += d.data()[`round${i}`]?.totalPoints || 0;
      return { userId: d.id, totalPoints: pts };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const summary = {};
  totals.forEach((p, i) => { summary[p.userId] = { totalPoints: p.totalPoints, rank: i + 1 }; });
  await setDoc(doc(db, `groups/${groupId}/scores`, 'summary'), {
    players: summary,
    updatedAt: new Date().toISOString(),
  });

  return withDistance.length;
}
