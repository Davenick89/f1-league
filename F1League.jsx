import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, updateDoc, arrayRemove, arrayUnion, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { Menu, X, LogOut, Plus, Users, Trophy, BarChart3, Settings, Copy, Check, Calendar, Lock, Edit, Info } from 'lucide-react';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(e => console.error("Auth error:", e));
const db = getFirestore(app);

// FCM — only initialised in browsers that support service workers + notifications
let messaging = null;
try {
  if ('serviceWorker' in navigator && 'Notification' in window) {
    messaging = getMessaging(app);
    // Show in-app notification toasts for foreground messages
    onMessage(messaging, (payload) => {
      const { title, body } = payload.notification ?? {};
      if (title) console.info(`[FCM] ${title}: ${body}`);
      // Foreground toast is handled in the Settings UI via a state update
    });
  }
} catch (e) {
  console.info('[FCM] Not supported in this browser:', e.message);
}

const F1_SCHEDULE_2026 = [
  { round: 1,  name: "Australia",          location: "Melbourne",    date: "2026-03-08", fp1: "2026-03-06T09:30:00Z", fp2: "2026-03-06T13:00:00Z",                                       raceStart: "2026-03-08T04:00:00Z", isSprint: false },
  { round: 2,  name: "China",              location: "Shanghai",     date: "2026-03-15", fp1: "2026-03-13T10:00:00Z", sprintQualStart: "2026-03-13T13:30:00Z",                            raceStart: "2026-03-15T07:00:00Z", isSprint: true  },
  { round: 3,  name: "Japan",              location: "Suzuka",       date: "2026-03-29", fp1: "2026-03-27T10:00:00Z", fp2: "2026-03-27T13:30:00Z",                                       raceStart: "2026-03-29T05:00:00Z", isSprint: false },
  { round: 4,  name: "Bahrain",            location: "Sakhir",       date: "2026-04-12", fp1: "2026-04-10T14:00:00Z", fp2: "2026-04-10T17:30:00Z",                                       raceStart: "2026-04-12T15:00:00Z", isSprint: false },
  { round: 5,  name: "Saudi Arabia",       location: "Jeddah",       date: "2026-04-19", fp1: "2026-04-17T17:00:00Z", fp2: "2026-04-17T20:30:00Z",                                       raceStart: "2026-04-19T17:00:00Z", isSprint: false },
  { round: 6,  name: "Miami",              location: "Miami",        date: "2026-05-03", fp1: "2026-05-01T13:00:00Z", sprintQualStart: "2026-05-01T17:00:00Z",                            raceStart: "2026-05-03T19:30:00Z", isSprint: true  },
  { round: 7,  name: "Canada",             location: "Montreal",     date: "2026-05-24", fp1: "2026-05-22T14:00:00Z", sprintQualStart: "2026-05-22T18:00:00Z",                            raceStart: "2026-05-24T18:00:00Z", isSprint: true  },
  { round: 8,  name: "Monaco",             location: "Monte Carlo",  date: "2026-06-07", fp1: "2026-06-05T14:00:00Z", fp2: "2026-06-05T17:30:00Z",                                       raceStart: "2026-06-07T13:00:00Z", isSprint: false },
  { round: 9,  name: "Barcelona-Catalunya",location: "Barcelona",    date: "2026-06-14", fp1: "2026-06-12T13:00:00Z", fp2: "2026-06-12T16:30:00Z",                                       raceStart: "2026-06-14T13:00:00Z", isSprint: false },
  { round: 10, name: "Austria",            location: "Spielberg",    date: "2026-06-28", fp1: "2026-06-26T14:00:00Z", fp2: "2026-06-26T17:30:00Z",                                       raceStart: "2026-06-28T13:00:00Z", isSprint: false },
  { round: 11, name: "Great Britain",      location: "Silverstone",  date: "2026-07-05", fp1: "2026-07-03T13:00:00Z", sprintQualStart: "2026-07-03T17:00:00Z",                            raceStart: "2026-07-05T14:00:00Z", isSprint: true  },
  { round: 12, name: "Belgium",            location: "Spa",          date: "2026-07-19", fp1: "2026-07-17T14:00:00Z", fp2: "2026-07-17T17:30:00Z",                                       raceStart: "2026-07-19T13:00:00Z", isSprint: false },
  { round: 13, name: "Hungary",            location: "Budapest",     date: "2026-07-26", fp1: "2026-07-24T14:00:00Z", fp2: "2026-07-24T17:30:00Z",                                       raceStart: "2026-07-26T13:00:00Z", isSprint: false },
  { round: 14, name: "Netherlands",        location: "Zandvoort",    date: "2026-08-23", fp1: "2026-08-21T14:00:00Z", sprintQualStart: "2026-08-21T18:00:00Z",                            raceStart: "2026-08-23T13:00:00Z", isSprint: true  },
  { round: 15, name: "Italy",              location: "Monza",        date: "2026-09-06", fp1: "2026-09-04T13:00:00Z", fp2: "2026-09-04T16:30:00Z",                                       raceStart: "2026-09-06T13:00:00Z", isSprint: false },
  { round: 16, name: "Spain",              location: "Madrid",       date: "2026-09-13", fp1: "2026-09-11T14:00:00Z", fp2: "2026-09-11T17:30:00Z",                                       raceStart: "2026-09-13T13:00:00Z", isSprint: false },
  { round: 17, name: "Azerbaijan",         location: "Baku",         date: "2026-09-27", fp1: "2026-09-25T12:00:00Z", fp2: "2026-09-25T15:30:00Z",                                       raceStart: "2026-09-27T11:00:00Z", isSprint: false },
  { round: 18, name: "Singapore",          location: "Singapore",    date: "2026-10-11", fp1: "2026-10-09T14:00:00Z", sprintQualStart: "2026-10-09T18:00:00Z",                            raceStart: "2026-10-11T12:00:00Z", isSprint: true  },
  { round: 19, name: "United States",      location: "Austin",       date: "2026-10-25", fp1: "2026-10-23T12:00:00Z", fp2: "2026-10-23T15:30:00Z",                                       raceStart: "2026-10-25T19:00:00Z", isSprint: false },
  { round: 20, name: "Mexico",             location: "Mexico City",  date: "2026-11-01", fp1: "2026-10-30T18:00:00Z", fp2: "2026-10-30T21:30:00Z",                                       raceStart: "2026-11-01T20:00:00Z", isSprint: false },
  { round: 21, name: "Brazil",             location: "São Paulo",    date: "2026-11-08", fp1: "2026-11-06T11:00:00Z", fp2: "2026-11-06T14:30:00Z",                                       raceStart: "2026-11-08T17:00:00Z", isSprint: false },
  { round: 22, name: "Las Vegas",          location: "Las Vegas",    date: "2026-11-21", fp1: "2026-11-19T22:00:00Z", fp2: "2026-11-20T01:30:00Z",                                       raceStart: "2026-11-22T06:00:00Z", isSprint: false },
  { round: 23, name: "Qatar",              location: "Lusail",       date: "2026-11-29", fp1: "2026-11-27T15:00:00Z", fp2: "2026-11-27T18:30:00Z",                                       raceStart: "2026-11-29T16:00:00Z", isSprint: false },
  { round: 24, name: "Abu Dhabi",          location: "Yas Island",   date: "2026-12-06", fp1: "2026-12-04T08:00:00Z", fp2: "2026-12-04T11:30:00Z",                                       raceStart: "2026-12-06T13:00:00Z", isSprint: false },
];

const F1_DRIVERS = [
  "Lando Norris", "Oscar Piastri", "George Russell", "Kimi Antonelli",
  "Charles Leclerc", "Lewis Hamilton", "Max Verstappen", "Isack Hadjar",
  "Carlos Sainz", "Alexander Albon", "Fernando Alonso", "Lance Stroll",
  "Pierre Gasly", "Franco Colapinto", "Oliver Bearman", "Esteban Ocon",
  "Liam Lawson", "Arvid Lindblad", "Nico Hulkenberg", "Gabriel Bortoleto",
  "Sergio Perez", "Valtteri Bottas"
];

const F1_TEAMS = [
  "McLaren", "Mercedes", "Ferrari", "Red Bull Racing", "Williams",
  "Aston Martin", "Alpine", "Haas", "Racing Bulls", "Audi", "Cadillac"
];

// Grid order for closest finisher scoring (approximate 2026 championship order)
const F1_GRID_ORDER = [
  "Lando Norris",      // 0
  "Oscar Piastri",     // 1
  "George Russell",    // 2
  "Kimi Antonelli",    // 3
  "Charles Leclerc",   // 4
  "Lewis Hamilton",    // 5
  "Max Verstappen",    // 6
  "Isack Hadjar",      // 7
  "Carlos Sainz",      // 8
  "Alexander Albon",   // 9
  "Fernando Alonso",   // 10
  "Lance Stroll",      // 11
  "Pierre Gasly",      // 12
  "Franco Colapinto",  // 13
  "Oliver Bearman",    // 14
  "Esteban Ocon",      // 15
  "Liam Lawson",       // 16
  "Arvid Lindblad",    // 17
  "Nico Hulkenberg",   // 18
  "Gabriel Bortoleto", // 19
];

function getClosestFinisher(predicted, actual) {
  if (!predicted || !actual) return 0;
  if (predicted === actual) return 2;
  const predIdx = F1_GRID_ORDER.indexOf(predicted);
  const actualIdx = F1_GRID_ORDER.indexOf(actual);
  if (predIdx === -1 || actualIdx === -1) return 0;
  return Math.abs(predIdx - actualIdx) <= 2 ? 1 : 0;
}

function getCurrentRound() {
  const now = new Date();
  const seasonStart = new Date("2026-03-06T00:00:00Z");
  if (now < seasonStart) return 1;
  for (let i = F1_SCHEDULE_2026.length - 1; i >= 0; i--) {
    if (now >= new Date(F1_SCHEDULE_2026[i].date + "T23:59:59Z")) {
      return Math.min(i + 2, 24);
    }
  }
  return 1;
}

// Returns the prediction lock time for a race:
// - Sprint weekends: 30 min before Sprint Qualifying
// - Normal weekends: 30 min before FP2
// Falls back to 5h before race start if session times are missing.
function getPredictionLockTime(race) {
  if (!race) return null;
  const sessionStr = race.isSprint ? race.sprintQualStart : race.fp2;
  if (sessionStr) return new Date(new Date(sessionStr).getTime() - 30 * 60 * 1000);
  return race.raceStart ? new Date(new Date(race.raceStart).getTime() - 5 * 60 * 60 * 1000) : null;
}

function getTimeUntilLock(race) {
  const lockTime = getPredictionLockTime(race);
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

function isEditLocked(race) {
  const lockTime = getPredictionLockTime(race);
  return lockTime ? new Date() >= lockTime : false;
}

// Returns display name: custom nickname > first letter of email > "?"
function getDisplayName(nickname, googleFirstName, email) {
  if (nickname && nickname.trim()) return nickname.trim();
  if (googleFirstName && googleFirstName.trim()) return googleFirstName.trim();
  if (email) return email.charAt(0).toUpperCase();
  return '?';
}

// SCHEDULE SYNC — runs on app load, checks Jolpica API against hardcoded schedule
async function syncScheduleWithAPI() {
  console.log('[Schedule Sync] Starting...');
  const TOLERANCE_MS = 60 * 60 * 1000; // 1-hour tolerance
  try {
    const res = await fetch('https://api.jolpi.ca/ergast/f1/2026.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const races = data?.MRData?.RaceTable?.Races;
    if (!races?.length) { console.warn('[Schedule Sync] No races returned'); return; }

    races.forEach(apiRace => {
      const round = parseInt(apiRace.round);
      const hardcoded = F1_SCHEDULE_2026.find(r => r.round === round);
      if (!hardcoded || !apiRace.date || !apiRace.time) return;
      const apiTime = new Date(`${apiRace.date}T${apiRace.time}`);
      const hardcodedTime = new Date(hardcoded.raceStart);
      const diffMs = Math.abs(apiTime - hardcodedTime);
      if (diffMs > TOLERANCE_MS) {
        const diffH = Math.round(diffMs / (1000 * 60 * 60));
        console.warn(`[Schedule Sync] R${round} ${hardcoded.name}: timing differs by ~${diffH}h (API: ${apiTime.toISOString()}, hardcoded: ${hardcodedTime.toISOString()})`);
      }
    });
    console.log(`[Schedule Sync] Complete — checked ${races.length} races`);
  } catch (err) {
    console.error('[Schedule Sync] Error:', err.message);
  }
}

function GroupStandingBadge({ groupId, userId }) {
  const [standing, setStanding] = React.useState(null);

  React.useEffect(() => {
    const load = async () => {
      try {
        const scoresSnap = await getDocs(collection(db, `groups/${groupId}/scores`));
        let userPts = 0;
        let rank = 1;
        scoresSnap.docs.forEach(d => {
          let pts = 0;
          for (let i = 1; i <= 24; i++) pts += d.data()[`round${i}`]?.totalPoints || 0;
          if (d.id === userId) userPts = pts;
        });
        scoresSnap.docs.forEach(d => {
          let pts = 0;
          for (let i = 1; i <= 24; i++) pts += d.data()[`round${i}`]?.totalPoints || 0;
          if (pts > userPts) rank++;
        });
        if (scoresSnap.docs.some(d => d.id === userId)) setStanding({ rank, pts: userPts });
      } catch {}
    };
    load();
  }, [groupId, userId]);

  if (!standing) return null;
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-xs text-gray-500">
        {standing.rank === 1 ? '🥇' : standing.rank === 2 ? '🥈' : standing.rank === 3 ? '🥉' : `#${standing.rank}`}
        {' '}P{standing.rank}
      </span>
      <span className="text-xs font-black" style={{ color: '#DC0000' }}>{standing.pts} PTS</span>
    </div>
  );
}

function SetNicknameModal({ googleFirstName, onSave, onSkip }) {
  const [value, setValue] = React.useState(googleFirstName || '');

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-sm">
        <div className="text-3xl mb-3 text-center">👋</div>
        <h2 className="text-lg font-black text-white mb-1 text-center" style={{ fontFamily: 'Orbitron' }}>
          WELCOME!
        </h2>
        <p className="text-gray-400 text-sm text-center mb-5">
          {googleFirstName ? `Hi ${googleFirstName}! ` : ''}How should teammates call you?
        </p>
        <input
          type="text"
          placeholder={googleFirstName ? `e.g. ${googleFirstName}` : 'e.g. Josh'}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && value.trim() && onSave(value.trim())}
          autoFocus
          maxLength={20}
          className="w-full bg-gray-900 border-2 border-gray-800 focus:border-red-600 rounded-xl p-3 text-white mb-4 outline-none transition"
        />
        <div className="flex gap-2">
          {googleFirstName && (
            <button
              onClick={() => onSave(googleFirstName)}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-2.5 rounded-xl text-sm transition"
            >
              Use "{googleFirstName}"
            </button>
          )}
          <button
            onClick={() => value.trim() ? onSave(value.trim()) : onSkip()}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl transition"
          >
            {value.trim() ? 'Save' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function F1League() {
  const [user, setUser] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [nickname, setNickname] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [currentRound, setCurrentRound] = useState(() => getCurrentRound());
  const [currentView, setCurrentView] = useState("leaderboard");
  const [countdown, setCountdown] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null); // { id, name }
  const [renameValue, setRenameValue] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteStats, setInviteStats] = useState(null); // { usedCount }
  const [copiedLink, setCopiedLink] = useState(false);
  const [pendingInvite, setPendingInvite] = useState(null); // { code, leagueId, leagueName, memberCount }
  const [notifSettings, setNotifSettings] = useState({ pushNotifications: false, reminderMinutesBefore: 30 });
  const [notifStatus, setNotifStatus] = useState('idle'); // 'idle' | 'requesting' | 'granted' | 'denied'
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showNicknameSetup, setShowNicknameSetup] = useState(false);
  const [googleFirstName, setGoogleFirstName] = useState('');

  // Run schedule sync once on mount
  useEffect(() => { syncScheduleWithAPI(); }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (authUser) => {
      if (authUser) {
        setUser(authUser);
        const profileRef = doc(db, "users", authUser.uid);
        const profileDoc = await getDoc(profileRef);
        if (!profileDoc.exists()) {
          // New user — create profile and trigger onboarding
          const gFirstName = authUser.displayName?.split(' ')[0] || '';
          await setDoc(profileRef, { email: authUser.email, nickname: "", googleFirstName: gFirstName, isNewAdmin: true, createdAt: serverTimestamp() });
          setShowNicknameSetup(true);
          setShowOnboarding(true);
        } else {
          const profileData = profileDoc.data();
          setNickname(profileData.nickname || "");
          setGoogleFirstName(profileData.googleFirstName || '');
          const saved = profileData.notificationSettings;
          if (saved) setNotifSettings(saved);
          // Reflect browser permission state in case it changed outside the app
          if (saved?.pushNotifications && Notification.permission !== 'granted') {
            setNotifSettings(s => ({ ...s, pushNotifications: false }));
          }
          if (profileData.isNewAdmin) setShowOnboarding(true);
        }
        const loadedGroups = await loadUserGroups(authUser.uid);

        const params = new URLSearchParams(window.location.search);

        // New invite code flow: ?invite=ABC12XYZ
        // NOTE: We intentionally do NOT read /groups/{id} here because the
        // user is not yet a member, so that read would be denied by Firestore
        // rules. The invite doc itself carries leagueName so the modal can
        // be shown without a second read.
        const inviteCodeParam = params.get('invite');
        if (inviteCodeParam) {
          const inviteRef = doc(db, "invites", inviteCodeParam);
          const inviteDoc = await getDoc(inviteRef);
          if (inviteDoc.exists()) {
            const inviteData = inviteDoc.data();
            const alreadyMember = loadedGroups.some(g => g.id === inviteData.leagueId);
            setPendingInvite({
              code: inviteCodeParam,
              leagueId: inviteData.leagueId,
              leagueName: inviteData.leagueName || "F1 League",
              alreadyMember,
            });
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }

        // Legacy direct-join flow: ?join={groupId} — keep for existing links
        const legacyGroupId = params.get('join');
        if (legacyGroupId) {
          const groupRef = doc(db, "groups", legacyGroupId);
          const groupDoc = await getDoc(groupRef);
          if (groupDoc.exists()) {
            const groupData = groupDoc.data();
            const members = groupData.members || [];
            if (!members.includes(authUser.uid)) {
              members.push(authUser.uid);
              await updateDoc(groupRef, { members });
            }
            setSelectedGroup({ id: legacyGroupId, ...groupData, members });
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }
      } else {
        setUser(null);
        setGroups([]);
        setSelectedGroup(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const race = F1_SCHEDULE_2026[currentRound - 1];
    if (!race) return;
    const updateCountdown = () => setCountdown(getTimeUntilLock(race));
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [currentRound]);

  const loadUserGroups = async (userId) => {
    try {
      const q = query(collection(db, "groups"), where("members", "array-contains", userId));
      const snapshot = await getDocs(q);
      const groupData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGroups(groupData);
      return groupData; // caller can use this to check membership without reading state
    } catch (error) {
      console.error("Error loading groups:", error);
      return [];
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setSelectedGroup(null);
  };

  const saveNicknameSetup = async (name) => {
    if (user && name) {
      await setDoc(doc(db, "users", user.uid), { nickname: name }, { merge: true });
      setNickname(name);
    }
    setShowNicknameSetup(false);
  };

  const saveNickname = async () => {
    if (!user || !nickname.trim()) return;
    try {
      const profileRef = doc(db, "users", user.uid);
      await setDoc(profileRef, { nickname: nickname.trim() }, { merge: true });
      setShowSettings(false);
    } catch (error) {
      console.error("Error saving nickname:", error);
    }
  };

  const enablePushNotifications = async () => {
    if (!messaging || !user) return;
    setNotifStatus('requesting');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotifStatus('denied');
        return;
      }
      // Register the service worker first so FCM can use it
      const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });
      const newSettings = { ...notifSettings, pushNotifications: true };
      await setDoc(doc(db, "users", user.uid), { fcmToken: token, notificationSettings: newSettings }, { merge: true });
      setNotifSettings(newSettings);
      setNotifStatus('granted');
    } catch (err) {
      console.error('[FCM] Token registration failed:', err);
      setNotifStatus('denied');
    }
  };

  const disablePushNotifications = async () => {
    if (!user) return;
    const newSettings = { ...notifSettings, pushNotifications: false };
    await setDoc(doc(db, "users", user.uid), { fcmToken: null, notificationSettings: newSettings }, { merge: true });
    setNotifSettings(newSettings);
    setNotifStatus('idle');
  };

  const saveReminderTime = async (minutes) => {
    if (!user) return;
    const newSettings = { ...notifSettings, reminderMinutesBefore: minutes };
    await setDoc(doc(db, "users", user.uid), { notificationSettings: newSettings }, { merge: true });
    setNotifSettings(newSettings);
  };

  const createNewGroup = async () => {
    if (!groupName.trim() || !user) return;
    try {
      const groupId = `group_${Date.now()}`;
      const groupRef = doc(db, "groups", groupId);
      await setDoc(groupRef, {
        name: groupName,
        admin: user.uid,
        members: [user.uid],
        createdTimestamp: serverTimestamp()
      });
      setGroupName("");
      setShowCreateGroup(false);
      await loadUserGroups(user.uid);
    } catch (error) {
      console.error("Error creating group:", error);
    }
  };

  const renameLeague = async () => {
    if (!renameValue.trim() || !renameTarget) return;
    try {
      await updateDoc(doc(db, "groups", renameTarget.id), { name: renameValue.trim() });
      setRenameTarget(null);
      setRenameValue("");
      await loadUserGroups(user.uid);
    } catch (error) {
      console.error("Error renaming league:", error);
    }
  };

  const deleteLeague = async (groupId) => {
    if (!user) return;
    try {
      const groupRef = doc(db, "groups", groupId);
      const groupDoc = await getDoc(groupRef);
      if (groupDoc.exists()) {
        const members = (groupDoc.data().members || []).filter(m => m !== user.uid);
        await updateDoc(groupRef, { members });
      }
      setDeleteConfirm(null);
      await loadUserGroups(user.uid);
    } catch (error) {
      console.error("Error deleting league:", error);
    }
  };

  const generateInviteCode = async () => {
    if (!selectedGroup || !user) return;
    try {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
      await setDoc(doc(db, "invites", code), {
        leagueId: selectedGroup.id,
        leagueName: selectedGroup.name,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        usedCount: 0,
      });
      const link = `${window.location.origin}?invite=${code}`;
      setInviteCode(code);
      setInviteLink(link);
      setInviteStats({ usedCount: 0 });
    } catch (e) {
      console.error("Error generating invite:", e);
    }
  };

  const acceptInvite = async () => {
    if (!pendingInvite || !user) return;

    console.log("🔵 [INVITE 1] 'Join League' clicked");
    console.log(`🔵 [INVITE 2] League name   : ${pendingInvite.leagueName}`);
    console.log(`🔵 [INVITE 3] League ID     : ${pendingInvite.leagueId}`);
    console.log(`🔵 [INVITE 4] Invite code   : ${pendingInvite.code}`);
    console.log(`🔵 [INVITE 5] User UID      : ${user.uid}`);
    console.log(`🔵 [INVITE 6] Already member: ${pendingInvite.alreadyMember}`);

    try {
      if (!pendingInvite.alreadyMember) {
        console.log("🔵 [INVITE 7] Writing arrayUnion to groups/" + pendingInvite.leagueId + "...");
        await updateDoc(doc(db, "groups", pendingInvite.leagueId), { members: arrayUnion(user.uid) });
        console.log("✅ [INVITE 8] Firestore write succeeded — user added to members");

        // Verify the write landed
        const groupSnap = await getDoc(doc(db, "groups", pendingInvite.leagueId));
        const currentMembers = groupSnap.data()?.members || [];
        console.log(`✅ [INVITE 9] members array now (${currentMembers.length}):`, currentMembers);
        console.log(`✅ [INVITE 10] Is ${user.uid} in members? → ${currentMembers.includes(user.uid)}`);

        const inviteRef = doc(db, "invites", pendingInvite.code);
        const inviteSnap = await getDoc(inviteRef);
        if (inviteSnap.exists()) {
          const newCount = (inviteSnap.data().usedCount || 0) + 1;
          console.log(`🔵 [INVITE 11] Incrementing usedCount to ${newCount}...`);
          await updateDoc(inviteRef, { usedCount: newCount });
          console.log("✅ [INVITE 12] usedCount updated");
        } else {
          console.warn("⚠️  [INVITE 11] Invite doc not found — skipping usedCount increment");
        }

        console.log("🔵 [INVITE 13] Re-fetching league list for user...");
        await loadUserGroups(user.uid);
        console.log("✅ [INVITE 14] loadUserGroups complete — league selector should now show the new league");
      } else {
        console.log("ℹ️  [INVITE 7] Already a member — skipping Firestore write");
      }

      setShowOnboarding(false);
      setPendingInvite(null);
      console.log("✅ [INVITE 15] Modal closed — done");
    } catch (e) {
      console.error("❌ [INVITE ERROR] Failed at some step:", e);
      console.error("   message:", e.message);
      console.error("   code   :", e.code);
    }
  };

  const completeOnboarding = async (createdGroup) => {
    try {
      await setDoc(doc(db, "users", user.uid), { isNewAdmin: false }, { merge: true });
      await loadUserGroups(user.uid);
      if (createdGroup) setSelectedGroup(createdGroup);
    } catch (e) {
      console.error("Error completing onboarding:", e);
    } finally {
      setShowOnboarding(false);
    }
  };

  if (!user) {
    return <LandingPage handleGoogleSignIn={handleGoogleSignIn} />;
  }

  if (showOnboarding && !pendingInvite) {
    return <AdminWizard user={user} onComplete={completeOnboarding} />;
  }

  if (showNicknameSetup) {
    return <SetNicknameModal googleFirstName={googleFirstName} onSave={saveNicknameSetup} onSkip={() => setShowNicknameSetup(false)} />;
  }

  if (!selectedGroup) {
    return (
      <div className="min-h-screen bg-black p-4 text-white">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');`}</style>
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-10 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>F1</span>
              <span className="text-xl font-black" style={{ fontFamily: 'Orbitron' }}>KARVAAN</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setShowSettings(true)} className="text-gray-600 hover:text-white p-2 rounded-xl hover:bg-gray-900 transition"><Settings size={20} /></button>
              <button onClick={handleSignOut} className="text-gray-600 hover:text-white p-2 rounded-xl hover:bg-gray-900 transition"><LogOut size={20} /></button>
            </div>
          </div>

          <p className="text-xs font-black text-gray-600 tracking-widest mb-4">YOUR LEAGUES</p>

          <div className="space-y-3">
            {groups.length === 0 && (
              <p className="text-gray-600 text-sm text-center py-8">No leagues yet — create one below.</p>
            )}
            {groups.map(group => (
              <div key={group.id} className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden hover:border-red-600/40 transition group">
                <button onClick={() => setSelectedGroup(group)} className="text-left w-full p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black text-white group-hover:text-red-400 transition">{group.name}</h3>
                      <p className="text-xs text-gray-600 mt-1">{group.members.length} member{group.members.length !== 1 ? 's' : ''}{group.admin === user.uid ? ' · Admin' : ''}</p>
                      <GroupStandingBadge groupId={group.id} userId={user.uid} />
                    </div>
                    <span className="text-gray-700 group-hover:text-red-600 transition text-xl">›</span>
                  </div>
                </button>
                {group.admin === user.uid && (
                  <div className="flex gap-2 px-5 pb-4">
                    <button onClick={() => { setRenameTarget(group); setRenameValue(group.name); }} className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg text-xs font-bold transition">Rename</button>
                    <button onClick={() => setDeleteConfirm(group.id)} className="px-3 py-1.5 bg-gray-900 hover:bg-red-900 text-gray-600 hover:text-red-400 rounded-lg text-xs font-bold transition">Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={() => setShowCreateGroup(true)} className="w-full mt-5 bg-red-600 hover:bg-red-700 text-white font-black py-3.5 px-6 rounded-full flex items-center justify-center gap-2 transition">
            <Plus size={18} /> Create New League
          </button>

          {showCreateGroup && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && setShowCreateGroup(false)}>
              <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-lg font-black text-white mb-5" style={{ fontFamily: 'Orbitron' }}>CREATE LEAGUE</h2>
                <label className="block text-xs font-black text-gray-600 tracking-widest mb-2">LEAGUE NAME</label>
                <input type="text" placeholder="e.g. Karvaan F1 2026" value={groupName} onChange={(e) => setGroupName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createNewGroup()} autoFocus className="w-full bg-gray-900 border-2 border-gray-800 focus:border-red-600 rounded-xl p-3.5 text-white mb-5 outline-none transition" />
                <div className="flex gap-2">
                  <button onClick={createNewGroup} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl transition">Create</button>
                  <button onClick={() => setShowCreateGroup(false)} className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-400 font-bold py-2.5 rounded-xl transition">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {showSettings && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
              <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-md space-y-5 my-4">
                <h2 className="text-xl font-black text-white" style={{ fontFamily: 'Orbitron' }}>SETTINGS</h2>

                {/* Nickname */}
                <div>
                  <label className="block text-xs font-black text-gray-600 tracking-widest mb-2">NICKNAME</label>
                  <input type="text" placeholder="Enter your nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full bg-gray-900 border-2 border-gray-800 focus:border-red-600 rounded-xl p-3 text-white outline-none transition" />
                  <button onClick={saveNickname} className="mt-2 w-full bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl transition">Save Nickname</button>
                </div>

                {/* Push Notifications */}
                <div className="border-t border-gray-800 pt-5">
                  <p className="text-xs font-black text-gray-600 tracking-widest mb-3">PUSH NOTIFICATIONS</p>
                  {!messaging ? (
                    <p className="text-xs text-gray-500">Not supported in this browser.</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white font-semibold">Prediction Reminders</p>
                          <p className="text-xs text-gray-500 mt-0.5">Get notified before predictions close</p>
                        </div>
                        <button
                          onClick={notifSettings.pushNotifications ? disablePushNotifications : enablePushNotifications}
                          disabled={notifStatus === 'requesting'}
                          className={`relative w-12 h-6 rounded-full transition-colors ${notifSettings.pushNotifications ? 'bg-red-600' : 'bg-gray-600'} disabled:opacity-50`}
                        >
                          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifSettings.pushNotifications ? 'left-6' : 'left-0.5'}`} />
                        </button>
                      </div>

                      {notifStatus === 'denied' && (
                        <p className="text-xs text-red-400">Permission denied. Enable notifications in your browser settings, then try again.</p>
                      )}
                      {notifStatus === 'requesting' && (
                        <p className="text-xs text-yellow-400">Requesting permission...</p>
                      )}

                      {notifSettings.pushNotifications && (
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Remind me</label>
                          <select
                            value={notifSettings.reminderMinutesBefore}
                            onChange={(e) => saveReminderTime(Number(e.target.value))}
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                          >
                            <option value={15}>15 minutes before close</option>
                            <option value={20}>20 minutes before close</option>
                            <option value={30}>30 minutes before close</option>
                            <option value={45}>45 minutes before close</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Email Notifications */}
                <div className="border-t border-gray-800 pt-5">
                  <p className="text-xs font-black text-gray-600 tracking-widest mb-3">EMAIL NOTIFICATIONS</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white font-semibold">Email Reminders</p>
                        <p className="text-xs text-gray-500 mt-0.5">Sent to your Google account email</p>
                      </div>
                      <button
                        onClick={async () => {
                          const newSettings = { ...notifSettings, emailNotifications: !notifSettings.emailNotifications };
                          await setDoc(doc(db, "users", user.uid), { notificationSettings: newSettings }, { merge: true });
                          setNotifSettings(newSettings);
                        }}
                        className={`relative w-12 h-6 rounded-full transition-colors ${notifSettings.emailNotifications ? 'bg-red-600' : 'bg-gray-600'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifSettings.emailNotifications ? 'left-6' : 'left-0.5'}`} />
                      </button>
                    </div>
                    {notifSettings.emailNotifications && (
                      <p className="text-xs text-green-400">
                        Reminder emails use the same timing as push notifications — adjust above.
                      </p>
                    )}
                  </div>
                </div>

                <button onClick={() => setShowSettings(false)} className="w-full bg-gray-900 hover:bg-gray-800 text-gray-400 font-bold py-2.5 rounded-xl transition">Close</button>
              </div>
            </div>
          )}

          {deleteConfirm && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
              <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-lg font-black text-white mb-2" style={{ fontFamily: 'Orbitron' }}>DELETE LEAGUE?</h2>
                <p className="text-gray-500 text-sm mb-6">You will be removed from this league. This cannot be undone.</p>
                <div className="flex gap-2">
                  <button onClick={() => deleteLeague(deleteConfirm)} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl transition">Delete</button>
                  <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-400 font-bold py-2.5 rounded-xl transition">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {renameTarget && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && setRenameTarget(null)}>
              <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-lg font-black text-white mb-5" style={{ fontFamily: 'Orbitron' }}>RENAME LEAGUE</h2>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && renameLeague()}
                  className="w-full bg-gray-900 border-2 border-gray-800 focus:border-red-600 rounded-xl p-3.5 text-white mb-5 outline-none transition"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={renameLeague} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl transition">Save</button>
                  <button onClick={() => setRenameTarget(null)} className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-400 font-bold py-2.5 rounded-xl transition">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>

      {/* Invite accept modal — shown here so it works when user has no league yet */}
      {pendingInvite && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-sm text-center">
            <div className="text-4xl mb-4">🏎️</div>
            <h2 className="text-lg font-black text-white mb-1" style={{ fontFamily: 'Orbitron' }}>YOU'RE INVITED!</h2>
            <p className="text-gray-500 text-xs mb-5">Join the league</p>
            <div className="bg-gray-900 rounded-2xl p-4 mb-5">
              <p className="text-xl font-black" style={{ color: '#DC0000', fontFamily: 'Orbitron' }}>{pendingInvite.leagueName}</p>
              <p className="text-gray-500 text-xs mt-1">F1 Predictions League · 2026</p>
            </div>
            {pendingInvite.alreadyMember ? (
              <div>
                <p className="text-green-400 text-sm mb-4">You're already a member of this league.</p>
                <button onClick={() => setPendingInvite(null)} className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-2.5 rounded-xl transition">Close</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={acceptInvite} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl transition">Join League</button>
                <button onClick={() => setPendingInvite(null)} className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-400 font-bold py-2.5 rounded-xl transition">Decline</button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    );
  }

  const race = F1_SCHEDULE_2026[currentRound - 1];

  return (
    <div className="min-h-screen bg-black text-white">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');`}</style>

      <nav style={{ background: 'rgba(0,0,0,0.97)', borderBottom: '1px solid rgba(220,0,0,0.3)' }} className="sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedGroup(null)} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
              <span className="text-xl font-black" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>F1</span>
              <span className="text-lg font-black text-white" style={{ fontFamily: 'Orbitron' }}>KARVAAN</span>
            </button>
            <span className="hidden sm:block text-gray-700 mx-2">|</span>
            <span className="hidden sm:block text-gray-400 text-sm font-semibold truncate max-w-[180px]">{selectedGroup.name}</span>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-gray-950 border border-gray-800 rounded-2xl p-3 space-y-1">
              {[
                { view: "leaderboard", icon: <Trophy size={16} />, label: "Leaderboard" },
                { view: "predict",     icon: <BarChart3 size={16} />, label: "Predictions" },
                { view: "seasonBoard", icon: <span className="text-sm">⭐</span>, label: "Season Board" },
                { view: "howToPlay",   icon: <span className="text-sm">📖</span>, label: "How to Play" },
                { view: "calendar",    icon: <Calendar size={16} />, label: "Calendar" },
                { view: "results",     icon: <span className="text-sm">📊</span>, label: "Results" },
                { view: "invites",     icon: <Users size={16} />, label: "Invite" },
              ].map(({ view, icon, label }) => (
                <button
                  key={view}
                  onClick={() => setCurrentView(view)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition text-sm font-semibold ${
                    currentView === view
                      ? "bg-red-600 text-white"
                      : "text-gray-500 hover:text-white hover:bg-gray-900"
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
              {selectedGroup.admin === user.uid && (
                <button
                  onClick={() => setCurrentView("audit")}
                  className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition text-sm font-semibold ${
                    currentView === "audit" ? "bg-yellow-600 text-white" : "text-yellow-600 hover:bg-yellow-600/10"
                  }`}
                >
                  <span className="text-sm">🔍</span> Audit Log
                </button>
              )}
              <div className="border-t border-gray-800 my-2 pt-2 space-y-1">
                <button onClick={() => setShowSettings(true)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-900 flex items-center gap-2.5 transition text-sm text-gray-600 hover:text-gray-400"><Settings size={16} /> Settings</button>
                <button onClick={() => setSelectedGroup(null)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-900 flex items-center gap-2.5 transition text-sm text-gray-600 hover:text-gray-400">← Leagues</button>
                <button onClick={handleSignOut} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-900 flex items-center gap-2.5 transition text-sm text-gray-600 hover:text-gray-400"><LogOut size={16} /> Sign out</button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {currentView === "leaderboard" && <LeaderboardView group={selectedGroup} currentRound={currentRound} user={user} />}
            {currentView === "predict" && <PredictionView group={selectedGroup} race={race} currentRound={currentRound} countdown={countdown} user={user} />}
            {currentView === "calendar" && <CalendarView group={selectedGroup} user={user} currentRound={currentRound} />}
            {currentView === "seasonBoard" && <SeasonBoardView group={selectedGroup} user={user} />}
            {currentView === "howToPlay" && <HowToPlayView />}
            {currentView === "results" && <ResultsView group={selectedGroup} user={user} currentRound={currentRound} />}
            {currentView === "invites" && <InvitesView group={selectedGroup} user={user} generateInviteCode={generateInviteCode} inviteLink={inviteLink} inviteStats={inviteStats} onGroupUpdated={() => loadUserGroups(user.uid)} />}
            {currentView === "audit" && selectedGroup.admin === user.uid && <AuditView group={selectedGroup} />}
          </div>
        </div>
      </div>

      {pendingInvite && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-sm text-center">
            <div className="text-4xl mb-4">🏎️</div>
            <h2 className="text-lg font-black text-white mb-1" style={{ fontFamily: 'Orbitron' }}>YOU'RE INVITED!</h2>
            <p className="text-gray-500 text-xs mb-5">Join the league</p>
            <div className="bg-gray-900 rounded-2xl p-4 mb-5">
              <p className="text-xl font-black" style={{ color: '#DC0000', fontFamily: 'Orbitron' }}>{pendingInvite.leagueName}</p>
              <p className="text-gray-500 text-xs mt-1">F1 Predictions League · 2026</p>
            </div>
            {pendingInvite.alreadyMember ? (
              <div>
                <p className="text-green-400 text-sm mb-4">You're already a member.</p>
                <button onClick={() => setPendingInvite(null)} className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-2.5 rounded-xl transition">Close</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={acceptInvite} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl transition">Join League</button>
                <button onClick={() => setPendingInvite(null)} className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-400 font-bold py-2.5 rounded-xl transition">Decline</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-black text-white mb-5" style={{ fontFamily: 'Orbitron' }}>SETTINGS</h2>
            <label className="block text-xs font-black text-gray-600 tracking-widest mb-2">NICKNAME</label>
            <input type="text" placeholder="Enter your nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full bg-gray-900 border-2 border-gray-800 focus:border-red-600 rounded-xl p-3 text-white mb-4 outline-none transition" />
            <div className="flex gap-2">
              <button onClick={saveNickname} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl transition">Save</button>
              <button onClick={() => setShowSettings(false)} className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-400 font-bold py-2.5 rounded-xl transition">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// LANDING PAGE
function LandingPage({ handleGoogleSignIn }) {
  const [showSignIn, setShowSignIn] = useState(false);
  const [rulesTab, setRulesTab] = useState('normal');

  return (
    <div className="min-h-screen bg-black text-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 20px rgba(220,0,0,0.3); } 50% { box-shadow: 0 0 40px rgba(220,0,0,0.7); } }
        .lp-fade { animation: fadeInUp 0.6s ease both; }
        .lp-glow { animation: pulseGlow 2s ease-in-out infinite; }
        .hero-grid { background-image: repeating-linear-gradient(0deg,transparent,transparent 60px,rgba(220,0,0,0.04) 60px,rgba(220,0,0,0.04) 61px),repeating-linear-gradient(90deg,transparent,transparent 60px,rgba(220,0,0,0.04) 60px,rgba(220,0,0,0.04) 61px); }
      `}</style>

      {/* NAV */}
      <nav style={{ background: 'rgba(0,0,0,0.96)', borderBottom: '1px solid rgba(220,0,0,0.35)' }} className="sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>F1</span>
            <span className="text-xl font-black text-white" style={{ fontFamily: 'Orbitron' }}>KARVAAN</span>
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            <a href="#how-to-play" className="hidden md:block text-gray-400 hover:text-white text-xs font-bold tracking-widest transition">HOW TO PLAY</a>
            <a href="#rules" className="hidden md:block text-gray-400 hover:text-white text-xs font-bold tracking-widest transition">RULES</a>
            <button onClick={() => setShowSignIn(true)} className="lp-glow bg-red-600 hover:bg-red-700 text-white font-black px-5 py-2 rounded-full text-sm transition">SIGN IN</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#080808 0%,#1c0000 55%,#080808 100%)', minHeight: '92vh', display: 'flex', alignItems: 'center' }}>
        <div className="hero-grid absolute inset-0" />
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-600" />
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600" />
        {/* Racing stripe */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-red-600 to-transparent opacity-60" />
        <div className="relative max-w-5xl mx-auto px-4 py-24 text-center w-full">
          <div className="lp-fade" style={{ animationDelay: '0.1s' }}>
            <span className="inline-block bg-red-600/20 border border-red-600/40 text-red-400 text-xs font-black px-4 py-1.5 rounded-full mb-8 tracking-widest">2026 SEASON</span>
          </div>
          <div className="lp-fade" style={{ animationDelay: '0.2s' }}>
            <h1 className="text-7xl md:text-9xl font-black leading-none mb-0" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>F1</h1>
            <h1 className="text-4xl md:text-6xl font-black leading-tight mb-6" style={{ fontFamily: 'Orbitron', color: '#ffffff' }}>KARVAAN</h1>
          </div>
          <div className="lp-fade" style={{ animationDelay: '0.35s' }}>
            <p className="text-lg md:text-2xl font-bold text-gray-300 tracking-widest mb-4">PREDICT. COMPETE. DOMINATE.</p>
            <p className="text-gray-500 max-w-lg mx-auto mb-10 leading-relaxed text-sm md:text-base">
              Master the grid. Predict race results before every F1 weekend. Compete with friends and climb the championship leaderboard all season long.
            </p>
          </div>
          <div className="lp-fade flex flex-col sm:flex-row gap-4 justify-center" style={{ animationDelay: '0.5s' }}>
            <button onClick={() => setShowSignIn(true)} className="lp-glow bg-red-600 hover:bg-red-700 text-white font-black px-10 py-4 rounded-full text-lg transition">
              🏎️ Start Predicting
            </button>
            <a href="#how-to-play" className="border-2 border-white/20 hover:border-red-600/70 text-white font-bold px-10 py-4 rounded-full text-lg transition text-center">
              Learn More ↓
            </a>
          </div>
          <div className="lp-fade mt-20 grid grid-cols-3 gap-6 max-w-xs mx-auto" style={{ animationDelay: '0.65s' }}>
            {[['24','RACES'],['22','DRIVERS'],['6','SPRINT WKS']].map(([v,l]) => (
              <div key={l} className="text-center">
                <div className="text-2xl font-black" style={{ color: '#DC0000', fontFamily: 'Orbitron' }}>{v}</div>
                <div className="text-xs text-gray-600 tracking-widest mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-20 px-4" style={{ background: '#0c0c0c' }}>
        <div className="max-w-7xl mx-auto">
          <h2 className="text-center text-2xl md:text-3xl font-black mb-2" style={{ fontFamily: 'Orbitron' }}>WHY F1 KARVAAN?</h2>
          <p className="text-center text-gray-600 text-sm mb-14">Everything you need to dominate your league</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: '🎯', title: 'PREDICTIONS', desc: 'Predict pole, race results, podiums and sprint positions. Each F1 weekend is a fresh battle of wits.' },
              { icon: '🏆', title: 'LEADERBOARD', desc: 'Real-time standings after every race. See who predicted right and who bottled it.' },
              { icon: '⚡', title: 'LIVE UPDATES', desc: 'Points update as races finish. Push notifications and email reminders keep you in the action.' },
            ].map(f => (
              <div key={f.title} className="bg-gray-950 border border-gray-800 hover:border-red-600/60 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 group">
                <div className="text-4xl mb-5">{f.icon}</div>
                <h3 className="font-black text-base mb-3 group-hover:text-red-400 transition-colors" style={{ fontFamily: 'Orbitron' }}>{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW TO PLAY */}
      <section id="how-to-play" className="py-20 px-4" style={{ background: '#090909' }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-2xl md:text-3xl font-black mb-2" style={{ fontFamily: 'Orbitron' }}>HOW TO PLAY</h2>
          <p className="text-center text-gray-600 text-sm mb-16">Get on the grid in 4 steps</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 relative">
            <div className="hidden md:block absolute top-10 left-[12%] right-[12%] h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(220,0,0,0.4), transparent)' }} />
            {[
              { n: '01', icon: '🔐', title: 'JOIN', desc: 'Sign in with Google. Create or join a league via invite link.' },
              { n: '02', icon: '🎯', title: 'PREDICT', desc: 'Before each race weekend, pick pole, podium, and the mystery R# driver.' },
              { n: '03', icon: '⚔️', title: 'COMPETE', desc: 'Points land as results come in. Track your championship battle live.' },
              { n: '04', icon: '🥇', title: 'WIN', desc: 'Top the leaderboard at season end. Bragging rights are everything.' },
            ].map((s, i) => (
              <div key={s.n} className="text-center">
                <div className="relative inline-block mb-5">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto text-3xl" style={{ background: 'linear-gradient(135deg,#DC0000,#7a0000)', boxShadow: '0 0 24px rgba(220,0,0,0.25)' }}>
                    {s.icon}
                  </div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black border border-red-600 flex items-center justify-center text-xs font-black text-red-500" style={{ fontFamily: 'Orbitron' }}>{i+1}</div>
                </div>
                <h3 className="font-black text-sm mb-2" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>{s.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RULES */}
      <section id="rules" className="py-20 px-4" style={{ background: '#0c0c0c' }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-center text-2xl md:text-3xl font-black mb-2" style={{ fontFamily: 'Orbitron' }}>THE RULES</h2>
          <p className="text-center text-gray-600 text-sm mb-10">Everything you need to know before your first prediction</p>
          <div className="flex gap-2 mb-8 flex-wrap justify-center">
            {[['normal','🏁 Normal Race'],['sprint','⚡ Sprint Weekend'],['points','📊 Points System'],['random','🎲 R# Finisher']].map(([t,l]) => (
              <button key={t} onClick={() => setRulesTab(t)}
                className={`px-4 py-2 rounded-full text-xs font-bold tracking-wide transition ${rulesTab === t ? 'bg-red-600 text-white' : 'bg-gray-900 text-gray-500 hover:text-white border border-gray-800'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-8">
            {rulesTab === 'normal' && (
              <div>
                <h3 className="font-black text-base mb-1" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>Normal Race Weekend</h3>
                <p className="text-gray-500 text-xs mb-6">Lock: 30 minutes before FP2. Submit 5 predictions:</p>
                <div className="space-y-2">
                  {[['Pole Position','Who starts P1 on the grid?','+1'],['Race Winner (P1)','Who takes the chequered flag?','+1'],['2nd Place (P2)','2nd on the podium','+1'],['3rd Place (P3)','3rd on the podium','+1'],['R# Random Finisher','Mystery wildcard (see R# tab)','+1 or +2']].map(([n,d,p]) => (
                    <div key={n} className="flex items-center gap-4 bg-gray-900 rounded-xl p-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-sm">{n}</p>
                        <p className="text-gray-600 text-xs mt-0.5">{d}</p>
                      </div>
                      <span className="text-yellow-400 font-black text-sm shrink-0">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {rulesTab === 'sprint' && (
              <div>
                <h3 className="font-black text-base mb-1" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>Sprint Race Weekend</h3>
                <p className="text-gray-500 text-xs mb-6">Lock: 30 minutes before Sprint Qualifying. Submit 9 predictions:</p>
                <div className="space-y-2">
                  {[['Pole Position','Grand Prix qualifying pole','+1'],['Sprint Quali Pole','Sprint shootout top spot','+1'],['Sprint P1','Sprint race winner','+1'],['Sprint P2 / P3','Sprint podium positions','+1 each'],['Race P1 / P2 / P3','Grand Prix podium','+1 each'],['R# Random Finisher','Mystery wildcard','+1 or +2']].map(([n,d,p]) => (
                    <div key={n} className="flex items-center gap-4 bg-gray-900 rounded-xl p-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-sm">{n}</p>
                        <p className="text-gray-600 text-xs mt-0.5">{d}</p>
                      </div>
                      <span className="text-yellow-400 font-black text-sm shrink-0">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {rulesTab === 'points' && (
              <div>
                <h3 className="font-black text-base mb-2" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>Points System</h3>
                <div className="overflow-hidden rounded-xl border border-gray-800">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-900"><th className="text-left p-3 text-gray-500 font-semibold text-xs">Prediction</th><th className="text-left p-3 text-gray-500 font-semibold text-xs">Weekend</th><th className="text-center p-3 text-gray-500 font-semibold text-xs">Pts</th></tr></thead>
                    <tbody className="divide-y divide-gray-900">
                      <tr><td className="p-3 text-gray-300 text-sm">Pole Position</td><td className="p-3 text-gray-600 text-xs">Both</td><td className="p-3 text-center text-yellow-400 font-black">+1</td></tr>
                      <tr><td className="p-3 text-gray-300 text-sm">Sprint Quali Pole</td><td className="p-3 text-gray-600 text-xs">Sprint</td><td className="p-3 text-center text-yellow-400 font-black">+1</td></tr>
                      <tr><td className="p-3 text-gray-300 text-sm">Sprint P1 / P2 / P3</td><td className="p-3 text-gray-600 text-xs">Sprint</td><td className="p-3 text-center text-yellow-400 font-black">+1 ea</td></tr>
                      <tr><td className="p-3 text-gray-300 text-sm">Race P1 / P2 / P3</td><td className="p-3 text-gray-600 text-xs">Both</td><td className="p-3 text-center text-yellow-400 font-black">+1 ea</td></tr>
                      <tr className="bg-gray-900/60"><td className="p-3 text-gray-300 text-sm">R# Exact Match</td><td className="p-3 text-gray-600 text-xs">Both</td><td className="p-3 text-center text-green-400 font-black">+2</td></tr>
                      <tr className="bg-gray-900/60"><td className="p-3 text-gray-300 text-sm">R# Closest Prediction</td><td className="p-3 text-gray-600 text-xs">Both</td><td className="p-3 text-center text-green-400 font-black">+1</td></tr>
                      <tr className="bg-red-900/10"><td className="p-3 text-gray-300 text-sm font-bold">Max — Normal Race</td><td className="p-3 text-gray-600 text-xs">—</td><td className="p-3 text-center text-red-400 font-black">6</td></tr>
                      <tr className="bg-red-900/10"><td className="p-3 text-gray-300 text-sm font-bold">Max — Sprint Weekend</td><td className="p-3 text-gray-600 text-xs">—</td><td className="p-3 text-center text-red-400 font-black">10</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {rulesTab === 'random' && (
              <div>
                <h3 className="font-black text-base mb-2" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>R# — The Random Finisher</h3>
                <p className="text-gray-500 text-xs mb-6">The wildcard that keeps every race unpredictable.</p>
                <div className="space-y-3">
                  {[
                    ['🎲','border-yellow-500','A secret number is drawn','Before the race, a random finishing position (e.g. position 7) is generated. This is the R# target.'],
                    ['🏎️','border-blue-500','You pick a driver','Choose any driver on the grid — who do you think will finish closest to that secret position?'],
                    ['📐','border-green-500','Distance scoring','After the race: |your driver\'s position − R# target| = distance. Closest distance wins +1. Exact match = +2.'],
                    ['⚠️','border-red-500','Ties','Equal distance = both players get +1. Only one +2 (exact match) is possible per round.'],
                  ].map(([icon, border, title, desc]) => (
                    <div key={title} className={`bg-gray-900 rounded-xl p-4 border-l-4 ${border}`}>
                      <p className="text-white font-bold text-sm mb-1">{icon} {title}</p>
                      <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 text-center" style={{ background: 'linear-gradient(135deg,#150000,#080808)' }}>
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl md:text-6xl font-black mb-3" style={{ fontFamily: 'Orbitron' }}>LIGHTS OUT.</h2>
          <h2 className="text-4xl md:text-6xl font-black mb-8" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>AND AWAY WE GO.</h2>
          <p className="text-gray-500 mb-10 text-sm">Join your friends. Make your predictions. Claim the title.</p>
          <button onClick={() => setShowSignIn(true)} className="lp-glow bg-red-600 hover:bg-red-700 text-white font-black px-12 py-5 rounded-full text-xl transition">
            🏎️ Join Now — It's Free
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t py-8 px-4" style={{ background: '#050505', borderColor: '#111' }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-black" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>F1</span>
            <span className="font-black text-white" style={{ fontFamily: 'Orbitron' }}>KARVAAN</span>
          </div>
          <p className="text-gray-700 text-xs">© 2026 F1 Karvaan · Not affiliated with Formula 1 or FOM</p>
          <button onClick={() => setShowSignIn(true)} className="text-red-600 hover:text-red-400 text-sm font-bold transition">Sign In →</button>
        </div>
      </footer>

      {/* SIGN IN MODAL */}
      {showSignIn && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && setShowSignIn(false)}>
          <div className="bg-gray-950 border-2 border-red-600 rounded-2xl p-8 w-full max-w-sm text-center">
            <div className="text-5xl font-black mb-1" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>F1</div>
            <div className="text-2xl font-black text-white mb-1" style={{ fontFamily: 'Orbitron' }}>KARVAAN</div>
            <p className="text-gray-500 text-xs mb-8">Sign in to start predicting</p>
            <button
              onClick={() => { setShowSignIn(false); handleGoogleSignIn(); }}
              className="w-full bg-white hover:bg-gray-100 text-gray-900 font-bold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 transition text-sm"
            >
              <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>
              Continue with Google
            </button>
            <p className="text-gray-700 text-xs mt-6">By signing in you agree to play by the rules.</p>
            <button onClick={() => setShowSignIn(false)} className="mt-3 text-gray-600 hover:text-gray-400 text-xs transition">← Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ADMIN SETUP WIZARD
function AdminWizard({ user, onComplete }) {
  const [step, setStep] = useState(1);
  const [leagueName, setLeagueName] = useState("");
  const [createdGroup, setCreatedGroup] = useState(null);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const createLeague = async () => {
    if (!leagueName.trim() || loading) return;
    setLoading(true);
    try {
      const groupId = `group_${Date.now()}`;
      await setDoc(doc(db, "groups", groupId), {
        name: leagueName.trim(),
        admin: user.uid,
        members: [user.uid],
        createdTimestamp: serverTimestamp(),
      });
      const group = { id: groupId, name: leagueName.trim(), admin: user.uid, members: [user.uid] };
      setCreatedGroup(group);
      setStep(3);
    } catch (e) {
      console.error("Wizard league error:", e);
    } finally {
      setLoading(false);
    }
  };

  const generateWizardInvite = async () => {
    if (!createdGroup || loading) return;
    setLoading(true);
    try {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
      await setDoc(doc(db, "invites", code), {
        leagueId: createdGroup.id,
        leagueName: createdGroup.name,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        usedCount: 0,
      });
      setInviteLink(`${window.location.origin}?invite=${code}`);
    } catch (e) {
      console.error("Wizard invite error:", e);
    } finally {
      setLoading(false);
    }
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg,#0a0a0a,#1a0000,#0a0a0a)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');`}</style>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-4xl font-black" style={{ fontFamily: 'Orbitron', color: '#DC0000' }}>F1 </span>
          <span className="text-3xl font-black text-white" style={{ fontFamily: 'Orbitron' }}>KARVAAN</span>
          <p className="text-gray-600 text-xs mt-2 tracking-widest">ADMIN SETUP</p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-8">
          {[1,2,3,4].map(s => (
            <div key={s} className="flex-1 h-1 rounded-full transition-colors duration-300" style={{ background: s <= step ? '#DC0000' : '#1f1f1f' }} />
          ))}
        </div>

        <div className="bg-gray-950 border border-red-900/30 rounded-2xl p-8 text-white">

          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="text-center">
              <div className="text-5xl mb-5">🏎️</div>
              <h2 className="text-xl font-black mb-2" style={{ fontFamily: 'Orbitron' }}>WELCOME ABOARD</h2>
              <p className="text-red-400 font-bold text-sm mb-6 tracking-wider">{(user.email || '').split('@')[0].toUpperCase()}</p>
              <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                You're setting up <strong className="text-white">F1 Karvaan</strong>. As admin you'll create the league, manage players, enter race results, and keep track of predictions.
              </p>
              <div className="space-y-2 text-left mb-8">
                {['Create and name your private league','Invite friends via a unique link','Enter race results each weekend','Track all predictions on the audit log'].map(f => (
                  <div key={f} className="flex items-center gap-3 text-sm">
                    <span className="text-red-500 text-xs">▶</span>
                    <span className="text-gray-400">{f}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep(2)} className="w-full font-black py-3.5 rounded-xl text-white transition" style={{ background: '#DC0000' }}>
                LET'S GO →
              </button>
            </div>
          )}

          {/* Step 2: Create League */}
          {step === 2 && (
            <div>
              <div className="text-4xl text-center mb-4">🏁</div>
              <h2 className="text-lg font-black text-center mb-1" style={{ fontFamily: 'Orbitron' }}>CREATE YOUR LEAGUE</h2>
              <p className="text-gray-500 text-xs text-center mb-8">Give your league a name. You can rename it later.</p>
              <label className="block text-xs font-bold text-gray-600 mb-2 tracking-widest">LEAGUE NAME</label>
              <input
                type="text"
                placeholder="e.g. Karvaan F1 2026"
                value={leagueName}
                onChange={e => setLeagueName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createLeague()}
                className="w-full bg-gray-900 border-2 border-gray-800 focus:border-red-600 rounded-xl p-4 text-white text-base outline-none transition mb-6"
                autoFocus
              />
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="px-4 py-3 bg-gray-900 hover:bg-gray-800 text-gray-500 font-bold rounded-xl transition">←</button>
                <button onClick={createLeague} disabled={!leagueName.trim() || loading}
                  className="flex-1 font-black py-3 rounded-xl text-white transition disabled:opacity-40" style={{ background: '#DC0000' }}>
                  {loading ? 'Creating...' : 'CREATE LEAGUE →'}
                </button>
              </div>
              <button onClick={() => setStep(3)} className="w-full mt-3 text-gray-700 hover:text-gray-500 text-xs py-2 transition">Skip for now</button>
            </div>
          )}

          {/* Step 3: Invite */}
          {step === 3 && (
            <div>
              <div className="text-4xl text-center mb-4">📨</div>
              <h2 className="text-lg font-black text-center mb-1" style={{ fontFamily: 'Orbitron' }}>INVITE YOUR CREW</h2>
              {createdGroup
                ? <p className="text-gray-500 text-xs text-center mb-6">League <strong className="text-white">{createdGroup.name}</strong> is live. Share the link below:</p>
                : <p className="text-gray-500 text-xs text-center mb-6">Create a league first, then generate your invite link from the Invites tab.</p>
              }
              {createdGroup && (
                inviteLink ? (
                  <div className="space-y-3 mb-6">
                    <div className="flex gap-2">
                      <input value={inviteLink} readOnly className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-3 text-white text-xs font-mono outline-none" />
                      <button onClick={copyInvite} className="bg-gray-800 hover:bg-gray-700 px-4 rounded-xl transition text-white">
                        {inviteCopied ? '✓' : <Copy size={16} />}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { const t = encodeURIComponent(`Join my F1 2026 Predictions League — ${createdGroup.name}!\n${inviteLink}`); window.open(`https://wa.me/?text=${t}`, '_blank'); }} className="flex-1 text-white text-xs font-bold py-2.5 rounded-xl transition" style={{ background: '#25d366' }}>WhatsApp</button>
                      <button onClick={() => { const s = encodeURIComponent(`Join ${createdGroup.name}`); const b = encodeURIComponent(`Join ${createdGroup.name}: ${inviteLink}`); window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${s}&body=${b}`, '_blank'); }} className="flex-1 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold py-2.5 rounded-xl transition">Email</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={generateWizardInvite} disabled={loading}
                    className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl transition mb-6 text-sm">
                    {loading ? 'Generating...' : '🔗 Generate Invite Link'}
                  </button>
                )
              )}
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="px-4 py-3 bg-gray-900 hover:bg-gray-800 text-gray-500 font-bold rounded-xl transition">←</button>
                <button onClick={() => setStep(4)} className="flex-1 font-black py-3 rounded-xl text-white transition" style={{ background: '#DC0000' }}>
                  {inviteLink ? 'DONE →' : 'SKIP →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 4 && (
            <div className="text-center">
              <div className="text-5xl mb-4">🏆</div>
              <h2 className="text-xl font-black mb-3" style={{ fontFamily: 'Orbitron' }}>YOU'RE ON THE GRID!</h2>
              <p className="text-gray-500 text-xs mb-8 leading-relaxed">
                {createdGroup
                  ? <>League <strong className="text-white">{createdGroup.name}</strong> is ready. R1 Australia kicks off on <strong className="text-red-400">8 Mar 2026</strong>.</>
                  : 'Head to the dashboard to create your first league and invite players.'}
              </p>
              <div className="space-y-2 text-left mb-8">
                {[
                  ['✅', 'Account created'],
                  [createdGroup ? '✅' : '⬜', createdGroup ? `League "${createdGroup.name}" created` : 'Create a league from the dashboard'],
                  [inviteLink ? '✅' : '⬜', inviteLink ? 'Invite link sent' : 'Generate an invite from the Invites tab'],
                  ['⬜', 'Enter results after R1 — Australia (8 Mar)'],
                ].map(([icon, text]) => (
                  <div key={text} className="flex items-center gap-3 bg-gray-900 p-3 rounded-lg text-xs">
                    <span>{icon}</span>
                    <span className="text-gray-400">{text}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => onComplete(createdGroup)} className="w-full font-black py-4 rounded-xl text-white text-lg transition" style={{ background: '#DC0000' }}>
                GO TO DASHBOARD 🏎️
              </button>
            </div>
          )}
        </div>
        <p className="text-center text-gray-800 text-xs mt-5">Step {step} of 4</p>
      </div>
    </div>
  );
}

// LEADERBOARD VIEW
function UserStatsCard({ group, userId, currentRound }) {
  const [stats, setStats] = React.useState(null);

  React.useEffect(() => {
    if (!userId || !group || currentRound < 2) return;
    const load = async () => {
      try {
        const [scoresDoc, predsDoc] = await Promise.all([
          getDoc(doc(db, `groups/${group.id}/scores`, userId)),
          getDoc(doc(db, `groups/${group.id}/predictions`, userId)),
        ]);
        if (!scoresDoc.exists()) return;
        const scoresData = scoresDoc.data();
        const predsData = predsDoc.exists() ? predsDoc.data() : {};

        let totalCorrect = 0, totalPreds = 0, racesWithPts = 0, participated = 0;
        const roundPts = [];

        for (let r = 1; r < currentRound; r++) {
          const roundScore = scoresData[`round${r}`];
          const roundPred = predsData[`round${r}`];
          if (!roundScore || !roundPred) continue;
          participated++;
          const pts = roundScore.totalPoints || 0;
          roundPts.push({ round: r, pts });
          if (pts > 0) racesWithPts++;
          const bd = roundScore.breakdown || {};
          const race = F1_SCHEDULE_2026[r - 1];
          const fields = ['pole', 'raceP1', 'raceP2', 'raceP3'];
          if (race?.isSprint) fields.push('sprintQualPole', 'sprintP1', 'sprintP2', 'sprintP3');
          fields.forEach(f => {
            if (roundPred[f]) { totalPreds++; if (bd[f] > 0) totalCorrect++; }
          });
          if (roundPred.finisherPosition) { totalPreds++; if ((bd.randomFinisher || 0) > 0) totalCorrect++; }
        }

        let streak = 0;
        for (let i = roundPts.length - 1; i >= 0; i--) {
          if (roundPts[i].pts > 0) streak++; else break;
        }
        const best = roundPts.length > 0 ? roundPts.reduce((a, b) => a.pts >= b.pts ? a : b) : null;
        setStats({
          accuracy: totalPreds > 0 ? Math.round((totalCorrect / totalPreds) * 100) : 0,
          totalCorrect, totalPreds,
          successRate: participated > 0 ? Math.round((racesWithPts / participated) * 100) : 0,
          racesWithPts, participated, streak, best,
        });
      } catch (e) { console.error(e); }
    };
    load();
  }, [userId, group, currentRound]);

  if (!stats || stats.participated === 0) return null;

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl p-5 mb-4">
      <p className="text-xs font-black text-gray-600 tracking-widest mb-3">YOUR PERFORMANCE</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-900 rounded-xl p-3">
          <p className="text-xs text-gray-600 mb-1">Prediction Accuracy</p>
          <p className="text-xl font-black" style={{ color: '#DC0000' }}>{stats.accuracy}%</p>
          <p className="text-xs text-gray-600">{stats.totalCorrect}/{stats.totalPreds} correct</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3">
          <p className="text-xs text-gray-600 mb-1">Success Rate</p>
          <p className="text-xl font-black text-white">{stats.successRate}%</p>
          <p className="text-xs text-gray-600">{stats.racesWithPts}/{stats.participated} races scored</p>
        </div>
        {stats.best && (
          <div className="bg-gray-900 rounded-xl p-3">
            <p className="text-xs text-gray-600 mb-1">Best Round</p>
            <p className="text-base font-black text-yellow-400">R{stats.best.round} · +{stats.best.pts}pts</p>
          </div>
        )}
        {stats.streak > 0 && (
          <div className="bg-gray-900 rounded-xl p-3">
            <p className="text-xs text-gray-600 mb-1">Current Streak</p>
            <p className="text-base font-black text-green-400">{stats.streak} race{stats.streak !== 1 ? 's' : ''} 🔥</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerSummaryModal({ group, playerId, playerName, currentRound, onClose }) {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  React.useEffect(() => {
    if (!playerId || !group) return;
    const load = async () => {
      try {
        const [scoresDoc, predsDoc] = await Promise.all([
          getDoc(doc(db, `groups/${group.id}/scores`, playerId)),
          getDoc(doc(db, `groups/${group.id}/predictions`, playerId)),
        ]);
        const scoresData = scoresDoc.exists() ? scoresDoc.data() : {};
        const predsData = predsDoc.exists() ? predsDoc.data() : {};

        const rounds = [];
        let totalPts = 0, totalCorrect = 0, totalPreds = 0;

        for (let r = 1; r <= currentRound; r++) {
          const roundScore = scoresData[`round${r}`];
          const roundPred = predsData[`round${r}`];
          const race = F1_SCHEDULE_2026[r - 1];
          if (!roundPred) continue;

          // Load results for this round
          let results = {};
          try {
            const resDoc = await getDoc(doc(db, `groups/${group.id}/results`, `round${r}`));
            if (resDoc.exists()) results = resDoc.data();
          } catch {}

          const pts = roundScore?.totalPoints || 0;
          const bd = roundScore?.breakdown || {};
          totalPts += pts;

          const fields = [
            { key: 'pole', label: 'Pole' },
            ...(race?.isSprint ? [
              { key: 'sprintQualPole', label: 'SQ Pole' },
              { key: 'sprintP1', label: 'Sprint P1' },
              { key: 'sprintP2', label: 'Sprint P2' },
              { key: 'sprintP3', label: 'Sprint P3' },
            ] : []),
            { key: 'raceP1', label: 'Race P1' },
            { key: 'raceP2', label: 'Race P2' },
            { key: 'raceP3', label: 'Race P3' },
            { key: 'finisherPosition', label: 'R# Pick', scoreKey: 'randomFinisher' },
          ];

          const predictions = fields.map(({ key, label, scoreKey }) => {
            const predicted = roundPred[key];
            const actual = results[scoreKey === 'randomFinisher' ? 'finisherAtPosition' : key];
            const fieldPts = bd[scoreKey || key] || 0;
            if (!predicted) return null;
            totalPreds++;
            if (fieldPts > 0) totalCorrect++;
            return { label, predicted, actual: actual || '—', correct: fieldPts > 0, pts: fieldPts };
          }).filter(Boolean);

          rounds.push({ round: r, name: race?.name || `R${r}`, pts, predictions });
        }

        setData({ rounds, totalPts, accuracy: totalPreds > 0 ? Math.round((totalCorrect / totalPreds) * 100) : 0 });
      } catch (e) { console.error(e); }
    };
    load();
  }, [playerId, group, currentRound]);

  return (
    <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-black text-white" style={{ fontFamily: 'Orbitron' }}>{playerName}</h2>
            {data && <p className="text-xs text-gray-500 mt-0.5">{data.totalPts} PTS · {data.accuracy}% accuracy</p>}
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition"><X size={18} /></button>
        </div>

        {!data ? (
          <p className="text-gray-500 text-center py-10 text-sm">Loading...</p>
        ) : data.rounds.length === 0 ? (
          <p className="text-gray-500 text-center py-10 text-sm">No predictions yet.</p>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {data.rounds.map(round => (
              <div key={round.round} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-gray-500 tracking-widest">R{round.round} · {round.name.toUpperCase()}</span>
                  <span className="text-sm font-black" style={{ color: round.pts > 0 ? '#DC0000' : undefined }}>{round.pts > 0 ? `+${round.pts} PTS` : '0 PTS'}</span>
                </div>
                <div className="space-y-1">
                  {round.predictions.map((pred, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 w-20 shrink-0">{pred.label}</span>
                      <span className={`flex-1 truncate ${pred.correct ? 'text-green-400' : 'text-gray-400'}`}>
                        {pred.correct ? '✓' : '✗'} {pred.predicted}
                      </span>
                      {!pred.correct && pred.actual !== '—' && (
                        <span className="text-gray-600 text-xs ml-2 truncate max-w-[80px]">→ {pred.actual}</span>
                      )}
                      {pred.pts > 0 && <span className="text-green-400 font-bold ml-2 shrink-0">+{pred.pts}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LeaderboardView({ group, currentRound, user }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = React.useState(null);

  useEffect(() => {
    if (!group) return;

    const unsubscribe = onSnapshot(collection(db, `groups/${group.id}/scores`), async (snapshot) => {
      try {
        const leaderboardData = await Promise.all(snapshot.docs.map(async (scoreDoc) => {
          const userRef = doc(db, "users", scoreDoc.id);
          const userDoc = await getDoc(userRef);
          const nickname = getDisplayName(userDoc.data()?.nickname, userDoc.data()?.googleFirstName, userDoc.data()?.email);
          let totalPoints = 0;
          for (let i = 1; i <= currentRound; i++) {
            totalPoints += scoreDoc.data()[`round${i}`]?.totalPoints || 0;
          }
          return { userId: scoreDoc.id, nickname, totalPoints };
        }));
        setLeaderboard(leaderboardData.sort((a, b) => b.totalPoints - a.totalPoints));
      } catch (error) {
        console.error("Error loading leaderboard:", error);
      }
    });

    return () => unsubscribe();
  }, [group, currentRound]);

  return (
    <div>
      {user && <UserStatsCard group={group} userId={user.uid} currentRound={currentRound} />}
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
        <h2 className="text-xl font-black mb-1 tracking-wider" style={{ fontFamily: 'Orbitron' }}>CHAMPIONSHIP</h2>
        <p className="text-xs text-gray-600 tracking-widest mb-5">STANDINGS</p>
        {leaderboard.length === 0 ? (
          <p className="text-gray-600 text-center py-10 text-sm">No predictions yet — be the first!</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <button key={entry.userId} onClick={() => setSelectedPlayer({ id: entry.userId, name: entry.nickname })} className={`w-full rounded-xl p-4 flex items-center justify-between transition cursor-pointer ${index === 0 ? 'bg-gradient-to-r from-yellow-900/30 to-gray-900 border border-yellow-600/30 hover:from-yellow-900/40' : 'bg-gray-900 hover:bg-gray-800'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg font-black shrink-0 ${index === 0 ? 'bg-yellow-600/20' : index === 1 ? 'bg-gray-600/20' : index === 2 ? 'bg-orange-700/20' : 'bg-gray-800'}`}>
                    {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : <span className="text-sm text-gray-500">{index + 1}</span>}
                  </div>
                  <span className="font-bold text-white text-sm text-left">{entry.nickname}</span>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black" style={{ color: index === 0 ? '#FFD700' : '#DC0000' }}>{entry.totalPoints}</p>
                  <p className="text-xs text-gray-600 tracking-widest">PTS</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedPlayer && (
        <PlayerSummaryModal
          group={group}
          playerId={selectedPlayer.id}
          playerName={selectedPlayer.name}
          currentRound={currentRound}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}

// FIELD HELP CONTENT
const FIELD_HELP = {
  pole: {
    icon: '🏁', label: 'Pole Position',
    what: 'Who will be fastest in qualifying and start from P1 on the grid?',
    points: [['✅ Correct prediction', '+1 pt'], ['❌ Wrong prediction', '0 pts']],
    example: { predict: 'George Russell', result: 'Russell qualifies fastest', earned: '+1' },
    note: 'Available every race weekend.',
  },
  sprintQualPole: {
    icon: '⚡', label: 'Sprint Quali Pole',
    what: 'Who will be fastest in the Sprint Shootout qualifying session?',
    points: [['✅ Correct prediction', '+1 pt'], ['❌ Wrong prediction', '0 pts']],
    example: { predict: 'Max Verstappen', result: 'Verstappen tops sprint quali', earned: '+1' },
    note: 'Sprint weekends only.',
  },
  sprintP1: {
    icon: '🥇', label: 'Sprint P1 (Winner)',
    what: 'Who will finish 1st in the Sprint race?',
    points: [['✅ Correct prediction', '+1 pt'], ['❌ Wrong prediction', '0 pts']],
    example: { predict: 'Oscar Piastri', result: 'Piastri wins the sprint', earned: '+1' },
    note: 'Sprint weekends only.',
  },
  sprintP2: {
    icon: '🥈', label: 'Sprint P2',
    what: 'Who will finish 2nd in the Sprint race?',
    points: [['✅ Correct prediction', '+1 pt'], ['❌ Wrong prediction', '0 pts']],
    example: { predict: 'Lando Norris', result: 'Norris finishes 2nd in sprint', earned: '+1' },
    note: 'Sprint weekends only.',
  },
  sprintP3: {
    icon: '🥉', label: 'Sprint P3',
    what: 'Who will finish 3rd in the Sprint race?',
    points: [['✅ Correct prediction', '+1 pt'], ['❌ Wrong prediction', '0 pts']],
    example: { predict: 'Charles Leclerc', result: 'Leclerc finishes 3rd in sprint', earned: '+1' },
    note: 'Sprint weekends only.',
  },
  raceP1: {
    icon: '🏆', label: 'Race P1 (Winner)',
    what: 'Who will finish 1st in the main Grand Prix?',
    points: [['✅ Correct prediction', '+1 pt'], ['❌ Wrong prediction', '0 pts']],
    example: { predict: 'Lando Norris', result: 'Norris wins the race', earned: '+1' },
    note: 'Available every race weekend.',
  },
  raceP2: {
    icon: '🥈', label: 'Race P2',
    what: 'Who will finish 2nd in the main Grand Prix?',
    points: [['✅ Correct prediction', '+1 pt'], ['❌ Wrong prediction', '0 pts']],
    example: { predict: 'George Russell', result: 'Russell finishes 2nd', earned: '+1' },
    note: 'Available every race weekend.',
  },
  raceP3: {
    icon: '🥉', label: 'Race P3',
    what: 'Who will finish 3rd in the main Grand Prix?',
    points: [['✅ Correct prediction', '+1 pt'], ['❌ Wrong prediction', '0 pts']],
    example: { predict: 'Carlos Sainz', result: 'Sainz finishes 3rd', earned: '+1' },
    note: 'Available every race weekend.',
  },
  finisherPosition: {
    icon: '🎲', label: 'R# Random Finisher',
    what: 'A random finishing position (P4–P22) is drawn before the race. Pick the driver you think will finish closest to that secret position.',
    points: [
      ['✅ Exact match (your driver hits the exact position)', '+2 pts'],
      ['🎯 Closest prediction (no one else is nearer)', '+1 pt'],
      ['❌ Not the closest', '0 pts'],
    ],
    example: { predict: 'Carlos Sainz (you pick him)', result: 'R# = P10. Sainz finishes P9 (1 away). No one else is closer.', earned: '+1' },
    note: 'Driver must start the race (DNS = 0 pts). Ties split the +1 — only one player can earn +2.',
  },
};

// Info button + modal for prediction fields
function FieldHelpModal({ fieldKey, onClose }) {
  const h = FIELD_HELP[fieldKey];
  if (!h) return null;

  // Close on Escape key
  React.useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50"
      onClick={e => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Help: ${h.label}`}
    >
      <div className="bg-gray-900 border border-red-600/60 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ background: 'rgba(220,0,0,0.12)', borderBottom: '1px solid rgba(220,0,0,0.25)' }}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{h.icon}</span>
            <span className="font-black text-white text-base" style={{ fontFamily: "'Orbitron'" }}>{h.label}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close help modal"
            className="text-gray-500 hover:text-white transition p-1 rounded-lg hover:bg-gray-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          {/* What to predict */}
          <div>
            <p className="text-xs font-black text-gray-500 tracking-widest mb-1.5">WHAT TO PREDICT</p>
            <p className="text-gray-200 leading-relaxed">{h.what}</p>
          </div>

          {/* Points */}
          <div>
            <p className="text-xs font-black text-gray-500 tracking-widest mb-1.5">HOW POINTS WORK</p>
            <div className="space-y-1.5">
              {h.points.map(([desc, pts]) => (
                <div key={desc} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-gray-300 text-xs">{desc}</span>
                  <span className={`font-black text-xs ml-3 shrink-0 ${pts.startsWith('+') ? 'text-green-400' : 'text-gray-600'}`}>{pts}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Example */}
          <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-4">
            <p className="text-xs font-black text-gray-500 tracking-widest mb-2">EXAMPLE</p>
            <div className="space-y-1 text-xs">
              <div className="flex gap-2"><span className="text-gray-500 w-16 shrink-0">You pick:</span><span className="text-white">{h.example.predict}</span></div>
              <div className="flex gap-2"><span className="text-gray-500 w-16 shrink-0">Result:</span><span className="text-gray-300">{h.example.result}</span></div>
              <div className="flex gap-2 pt-1 border-t border-gray-700 mt-1"><span className="text-gray-500 w-16 shrink-0">Earned:</span><span className="text-green-400 font-black">{h.example.earned}</span></div>
            </div>
          </div>

          {/* Note */}
          {h.note && (
            <p className="text-xs text-gray-600 italic">{h.note}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Inline info icon button
function InfoBtn({ fieldKey, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(fieldKey)}
      aria-label={`Help with ${FIELD_HELP[fieldKey]?.label}`}
      className="ml-1.5 text-gray-600 hover:text-blue-400 transition-colors align-middle inline-flex items-center"
      tabIndex={-1}
    >
      <Info size={13} />
    </button>
  );
}

// PREDICTION VIEW - COMPLETE REBUILD
function PredictionView({ group, race, currentRound, countdown, user }) {
  const [predictions, setPredictions] = useState({
    pole: "",
    sprintQualPole: "",
    sprintP1: "",
    sprintP2: "",
    sprintP3: "",
    raceP1: "",
    raceP2: "",
    raceP3: "",
    finisherPosition: "",
  });
  const [randomNumber, setRandomNumber] = useState(null);
  const [randomGeneratedBy, setRandomGeneratedBy] = useState(null);
  const [message, setMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [helpField, setHelpField] = useState(null);
  const [userHasPredictions, setUserHasPredictions] = useState(false);
  const [allPredictions, setAllPredictions] = useState([]);
  const [allResults, setAllResults] = useState(null);
  const [memberNicknames, setMemberNicknames] = useState({});

  // Load member nicknames first
  useEffect(() => {
    if (!group) return;

    const loadNicknames = async () => {
      const nicknames = {};
      if (group.members) {
        for (const memberId of group.members) {
          try {
            const userRef = doc(db, "users", memberId);
            const userDoc = await getDoc(userRef);
            nicknames[memberId] = getDisplayName(userDoc.data()?.nickname, userDoc.data()?.googleFirstName, userDoc.data()?.email);
          } catch (e) {
            nicknames[memberId] = "Unknown";
          }
        }
      }
      setMemberNicknames(nicknames);
    };

    loadNicknames();
  }, [group]);

  // Real-time user predictions listener
  useEffect(() => {
    if (!user || !group) return;

    const unsubscribe = onSnapshot(
      doc(db, `groups/${group.id}/predictions`, user.uid),
      (doc) => {
        if (doc.exists() && doc.data()[`round${currentRound}`]) {
          setPredictions(doc.data()[`round${currentRound}`]);
          setUserHasPredictions(true);
          setIsEditing(false);
        } else {
          setPredictions({
            pole: "", sprintQualPole: "", sprintP1: "", sprintP2: "", sprintP3: "",
            raceP1: "", raceP2: "", raceP3: "", finisherPosition: "",
          });
          setUserHasPredictions(false);
        }
      },
      (error) => console.error("Error:", error)
    );

    return () => unsubscribe();
  }, [user, group, currentRound]);

  // Real-time random number listener
  useEffect(() => {
    if (!group) return;

    const unsubscribe = onSnapshot(
      doc(db, `groups/${group.id}/randomNumbers`, `round${currentRound}`),
      (doc) => {
        if (doc.exists()) {
          setRandomNumber(doc.data().number);
          setRandomGeneratedBy(doc.data().generatedBy);
        } else {
          setRandomNumber(null);
          setRandomGeneratedBy(null);
        }
      },
      (error) => console.error("Error:", error)
    );

    return () => unsubscribe();
  }, [group, currentRound]);

  // Real-time all predictions listener
  useEffect(() => {
    if (!group) return;

    const loadAllPredictions = (snapshot) => {
      const allPreds = [];
      snapshot.docs.forEach((doc) => {
        const roundData = doc.data()[`round${currentRound}`];
        if (roundData) {
          allPreds.push({
            userId: doc.id,
            nickname: doc.data().nickname || memberNicknames[doc.id] || "Unknown",
            ...roundData
          });
        }
      });
      setAllPredictions(allPreds.sort((a, b) => a.nickname.localeCompare(b.nickname)));
    };

    const unsubscribe = onSnapshot(
      collection(db, `groups/${group.id}/predictions`),
      loadAllPredictions,
      (error) => console.error("Error loading predictions:", error)
    );

    return () => unsubscribe();
  }, [group, currentRound, memberNicknames]);

  // Real-time results listener
  useEffect(() => {
    if (!group) return;

    const unsubscribe = onSnapshot(
      doc(db, `groups/${group.id}/results`, `round${currentRound}`),
      (doc) => {
        setAllResults(doc.exists() ? doc.data() : null);
      },
      (error) => console.error("Error:", error)
    );

    return () => unsubscribe();
  }, [group, currentRound]);

  const generateRandomNumber = async () => {
    try {
      const num = Math.floor(Math.random() * (22 - 4 + 1)) + 4;
      const randomRef = doc(db, `groups/${group.id}/randomNumbers`, `round${currentRound}`);
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      const nickname = getDisplayName(userDoc.data()?.nickname, userDoc.data()?.googleFirstName, userDoc.data()?.email);

      await setDoc(randomRef, {
        number: num,
        generatedBy: nickname,
        generatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handlePredictionChange = (field, value) => {
    setPredictions(prev => ({ ...prev, [field]: value }));
    setIsEditing(true);
  };

  const handleSavePredictions = async () => {
    try {
      if (!randomNumber) {
        setMessage("⚠️ Need random number first");
        setTimeout(() => setMessage(""), 3000);
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      const userNickname = getDisplayName(userDoc.data()?.nickname, userDoc.data()?.googleFirstName, userDoc.data()?.email);

      const predRef = doc(db, `groups/${group.id}/predictions`, user.uid);
      await setDoc(predRef, {
        nickname: userNickname,
        [`round${currentRound}`]: {
          ...predictions,
          randomNumber: randomNumber,
          lastEditTime: new Date().toISOString(),
          createdAt: serverTimestamp()
        }
      }, { merge: true });

      // Audit trail — write a record every time predictions are saved/edited
      const raceName = race?.name || `Round ${currentRound}`;
      await setDoc(doc(collection(db, `groups/${group.id}/auditLog`)), {
        userId: user.uid,
        nickname: userNickname,
        round: currentRound,
        raceName,
        action: "prediction_save",
        predictions: { ...predictions },
        timestamp: serverTimestamp(),
        timestampIso: new Date().toISOString(),
      });

      setUserHasPredictions(true);
      setIsEditing(false);
      setMessage("✅ Predictions saved!");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      console.error("Error:", error);
      setMessage("❌ Error saving");
    }
  };

  const formatTime = (iso) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  };

  // Calculate points for a prediction (competitive R# bonus)
  const calculatePredictionPoints = (pred) => {
    if (!allResults) return 0;
    let points = 0;

    if (pred.pole && pred.pole === allResults.pole) points += 1;
    if (race?.isSprint && pred.sprintQualPole && pred.sprintQualPole === allResults.sprintQualPole) points += 1;
    if (race?.isSprint && pred.sprintP1 && pred.sprintP1 === allResults.sprintP1) points += 1;
    if (race?.isSprint && pred.sprintP2 && pred.sprintP2 === allResults.sprintP2) points += 1;
    if (race?.isSprint && pred.sprintP3 && pred.sprintP3 === allResults.sprintP3) points += 1;

    if (pred.raceP1 && pred.raceP1 === allResults.raceP1) points += 1;
    if (pred.raceP2 && pred.raceP2 === allResults.raceP2) points += 1;
    if (pred.raceP3 && pred.raceP3 === allResults.raceP3) points += 1;

    // Competitive R# bonus: +1 only to player(s) with closest prediction
    const getRfDistanceForPlayer = (p) => {
      const posStr = allResults.rPredFinishPositions?.[p.userId];
      if (posStr) {
        if (posStr === "DNS" || posStr === "DNF") return Infinity;
        const pos = parseInt(posStr.replace("P", ""), 10);
        return isNaN(pos) || !randomNumber ? Infinity : Math.abs(pos - randomNumber);
      }
      // Fallback: F1_GRID_ORDER distance vs finisherAtPosition
      const actualIdx = allResults.finisherAtPosition ? F1_GRID_ORDER.indexOf(allResults.finisherAtPosition) : -1;
      const idx = p.finisherPosition ? F1_GRID_ORDER.indexOf(p.finisherPosition) : -1;
      return (p.finisherPosition && allResults.finisherAtPosition && idx !== -1 && actualIdx !== -1)
        ? Math.abs(idx - actualIdx) : Infinity;
    };
    const distances = allPredictions.map(getRfDistanceForPlayer).filter(d => d !== Infinity);
    const minDistance = distances.length > 0 ? Math.min(...distances) : Infinity;
    const myDistance = getRfDistanceForPlayer(pred);
    if (myDistance === minDistance && myDistance !== Infinity) {
      points += myDistance === 0 ? 2 : 1;
    }

    return points;
  };

  const editLocked = isEditLocked(race);

  // Get available drivers for each position (excluding OTHER selected positions)
  const getAvailableForP1 = () => {
    const selected = [];
    if (predictions.raceP2) selected.push(predictions.raceP2);
    if (predictions.raceP3) selected.push(predictions.raceP3);
    return F1_DRIVERS.filter(d => !selected.includes(d));
  };

  const getAvailableForP2 = () => {
    const selected = [];
    if (predictions.raceP1) selected.push(predictions.raceP1);
    if (predictions.raceP3) selected.push(predictions.raceP3);
    return F1_DRIVERS.filter(d => !selected.includes(d));
  };

  const getAvailableForP3 = () => {
    const selected = [];
    if (predictions.raceP1) selected.push(predictions.raceP1);
    if (predictions.raceP2) selected.push(predictions.raceP2);
    return F1_DRIVERS.filter(d => !selected.includes(d));
  };

  const getAvailableForFinisher = () => {
    // Exclude P1, P2, P3 - only show remaining 19 drivers
    const podium = [];
    if (predictions.raceP1) podium.push(predictions.raceP1);
    if (predictions.raceP2) podium.push(predictions.raceP2);
    if (predictions.raceP3) podium.push(predictions.raceP3);
    return F1_DRIVERS.filter(d => !podium.includes(d));
  };

  if (!race) return <div className="text-center py-20 text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-2 border-red-600 rounded-lg p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-black mb-2" style={{ fontFamily: "'Orbitron'" }}>{race.name.toUpperCase()}</h2>
            <p className="text-gray-400">Round {currentRound} • {race.location}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-red-600 animate-pulse">⏱️ {countdown}</p>
            <p className="text-sm text-gray-400">{race.isSprint ? "(Sprint)" : "Regular"}</p>
          </div>
        </div>
      </div>

      {/* Random Number */}
      <div className="bg-gray-900 border border-red-600/50 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">🎲 Random Finisher (P4-P22)</h3>
        {randomNumber ? (
          <div className="bg-black/50 p-4 rounded border border-red-600">
            <p className="text-sm text-gray-400 mb-2">Generated by: <span className="text-yellow-400 font-bold">{randomGeneratedBy}</span></p>
            <p className="text-5xl font-black text-red-600">P{randomNumber}</p>
          </div>
        ) : (
          <button onClick={generateRandomNumber} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg overflow-hidden text-center whitespace-nowrap">
            Generate Random Number
          </button>
        )}
      </div>

      {/* Predictions Form */}
      <div className="bg-gray-900 border border-red-600/50 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">YOUR PREDICTIONS</h3>
          {userHasPredictions && !editLocked && (
            <button onClick={() => setIsEditing(!isEditing)} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm font-bold flex items-center gap-2">
              <Edit size={16} /> {isEditing ? "Cancel" : "Edit"}
            </button>
          )}
          {editLocked && userHasPredictions && (
            <div className="px-3 py-1 bg-gray-700 rounded text-sm font-bold flex items-center gap-2">
              <Lock size={16} /> LOCKED
            </div>
          )}
        </div>

        {userHasPredictions && !isEditing && !editLocked ? (
          <p className="text-gray-400 text-sm">Saved. Click Edit to change.</p>
        ) : !userHasPredictions || isEditing ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-bold mb-2">Pole Position <InfoBtn fieldKey="pole" onOpen={setHelpField} /></label>
                <select value={predictions.pole} onChange={(e) => handlePredictionChange('pole', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                  <option value="">Select</option>
                  {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {race.isSprint && (
                <div>
                  <label className="block text-sm font-bold mb-2">Sprint Quali Pole <InfoBtn fieldKey="sprintQualPole" onOpen={setHelpField} /></label>
                  <select value={predictions.sprintQualPole} onChange={(e) => handlePredictionChange('sprintQualPole', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                    <option value="">Select</option>
                    {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}

              {race.isSprint && (
                <>
                  <div>
                    <label className="block text-sm font-bold mb-2">Sprint P1 <InfoBtn fieldKey="sprintP1" onOpen={setHelpField} /></label>
                    <select value={predictions.sprintP1} onChange={(e) => handlePredictionChange('sprintP1', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                      <option value="">Select</option>
                      {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Sprint P2 <InfoBtn fieldKey="sprintP2" onOpen={setHelpField} /></label>
                    <select value={predictions.sprintP2} onChange={(e) => handlePredictionChange('sprintP2', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                      <option value="">Select</option>
                      {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Sprint P3 <InfoBtn fieldKey="sprintP3" onOpen={setHelpField} /></label>
                    <select value={predictions.sprintP3} onChange={(e) => handlePredictionChange('sprintP3', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                      <option value="">Select</option>
                      {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-bold mb-2">Race P1 <InfoBtn fieldKey="raceP1" onOpen={setHelpField} /></label>
                <select value={predictions.raceP1} onChange={(e) => handlePredictionChange('raceP1', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                  <option value="">Select</option>
                  {getAvailableForP1().map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Race P2 <InfoBtn fieldKey="raceP2" onOpen={setHelpField} /></label>
                <select value={predictions.raceP2} onChange={(e) => handlePredictionChange('raceP2', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                  <option value="">Select</option>
                  {getAvailableForP2().map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Race P3 <InfoBtn fieldKey="raceP3" onOpen={setHelpField} /></label>
                <select value={predictions.raceP3} onChange={(e) => handlePredictionChange('raceP3', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                  <option value="">Select</option>
                  {getAvailableForP3().map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold mb-2">Driver at P{randomNumber || "?"} <InfoBtn fieldKey="finisherPosition" onOpen={setHelpField} /></label>
                <select value={predictions.finisherPosition} onChange={(e) => handlePredictionChange('finisherPosition', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                  <option value="">Select (excluding podium)</option>
                  {getAvailableForFinisher().map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <button onClick={handleSavePredictions} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg">SAVE</button>
          </>
        ) : null}

        {message && <p className="text-center text-sm mt-3 text-green-400">{message}</p>}
      </div>

      {/* ALL PREDICTIONS TABLE — dynamic: names-only before results, name/pts after */}
      <div className="bg-gray-900 border border-red-600/50 rounded-lg p-4 overflow-x-auto">
        <h3 className="text-lg font-bold mb-4">ALL PREDICTIONS & POINTS</h3>
        {allPredictions.length === 0 ? (
          <p className="text-gray-400 text-center py-6">Waiting for predictions... once players submit, they'll appear here</p>
        ) : (() => {
          const hasResults = !!(allResults && allResults.pole && allResults.raceP1);

          // Compute competitive R# distance for each prediction
          const getDist = (p) => {
            const posStr = allResults?.rPredFinishPositions?.[p.userId];
            if (posStr) {
              if (posStr === "DNS" || posStr === "DNF") return Infinity;
              const pos = parseInt(posStr.replace("P", ""), 10);
              return isNaN(pos) || !randomNumber ? Infinity : Math.abs(pos - randomNumber);
            }
            // Fallback: F1_GRID_ORDER distance vs finisherAtPosition
            const actualIdx = allResults?.finisherAtPosition ? F1_GRID_ORDER.indexOf(allResults.finisherAtPosition) : -1;
            const idx = p.finisherPosition ? F1_GRID_ORDER.indexOf(p.finisherPosition) : -1;
            return (p.finisherPosition && allResults?.finisherAtPosition && idx !== -1 && actualIdx !== -1)
              ? Math.abs(idx - actualIdx) : Infinity;
          };
          const allDists = allPredictions.map(getDist).filter(d => d !== Infinity);
          const minDist = allDists.length > 0 ? Math.min(...allDists) : Infinity;

          const getBreakdown = (p) => {
            if (!allResults) return {};
            const ex = (a, b) => (a && b && a === b) ? 1 : 0;
            const d = getDist(p);
            return {
              pole: ex(p.pole, allResults.pole),
              sprintQualPole: ex(p.sprintQualPole, allResults.sprintQualPole),
              sprintP1: ex(p.sprintP1, allResults.sprintP1),
              sprintP2: ex(p.sprintP2, allResults.sprintP2),
              sprintP3: ex(p.sprintP3, allResults.sprintP3),
              raceP1: ex(p.raceP1, allResults.raceP1),
              raceP2: ex(p.raceP2, allResults.raceP2),
              raceP3: ex(p.raceP3, allResults.raceP3),
              randomFinisher: (d === minDist && d !== Infinity) ? (d === 0 ? 2 : 1) : 0,
            };
          };

          const fn = (name) => name ? name.split(' ')[0] : '-';
          const PointCell = ({ name, pts }) => (
            <td className={`p-1 text-center font-semibold text-xs ${pts > 0 ? 'bg-green-900/60 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
              {fn(name)}/{pts ?? 0}
            </td>
          );

          if (!hasResults) {
            return (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-red-600">
                    <th className="text-left p-2 font-bold">Player</th>
                    <th className="text-center p-1 font-bold">Pole</th>
                    {race.isSprint && <th className="text-center p-1 font-bold text-yellow-400">SQ</th>}
                    {race.isSprint && <th className="text-center p-1 font-bold text-orange-400">SP1</th>}
                    {race.isSprint && <th className="text-center p-1 font-bold text-orange-400">SP2</th>}
                    {race.isSprint && <th className="text-center p-1 font-bold text-orange-400">SP3</th>}
                    <th className="text-center p-1 font-bold">P1</th>
                    <th className="text-center p-1 font-bold">P2</th>
                    <th className="text-center p-1 font-bold">P3</th>
                    <th className="text-center p-1 font-bold">R#</th>
                  </tr>
                </thead>
                <tbody>
                  {allPredictions.map((p) => (
                    <tr key={p.userId} className="border-b border-gray-700 hover:bg-gray-800">
                      <td className="p-2 font-bold text-white">{p.nickname}</td>
                      <td className="p-1 text-center text-gray-300">{fn(p.pole)}</td>
                      {race.isSprint && <td className="p-1 text-center text-gray-300">{fn(p.sprintQualPole)}</td>}
                      {race.isSprint && <td className="p-1 text-center text-gray-300">{fn(p.sprintP1)}</td>}
                      {race.isSprint && <td className="p-1 text-center text-gray-300">{fn(p.sprintP2)}</td>}
                      {race.isSprint && <td className="p-1 text-center text-gray-300">{fn(p.sprintP3)}</td>}
                      <td className="p-1 text-center text-gray-300">{fn(p.raceP1)}</td>
                      <td className="p-1 text-center text-gray-300">{fn(p.raceP2)}</td>
                      <td className="p-1 text-center text-gray-300">{fn(p.raceP3)}</td>
                      <td className="p-1 text-center text-gray-300">{fn(p.finisherPosition)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          }

          return (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-red-600">
                  <th className="text-left p-2 font-bold">Player</th>
                  <th className="text-center p-1 font-bold">Pole</th>
                  {race.isSprint && <th className="text-center p-1 font-bold text-yellow-400">SQ</th>}
                  {race.isSprint && <th className="text-center p-1 font-bold text-orange-400">SP1</th>}
                  {race.isSprint && <th className="text-center p-1 font-bold text-orange-400">SP2</th>}
                  {race.isSprint && <th className="text-center p-1 font-bold text-orange-400">SP3</th>}
                  <th className="text-center p-1 font-bold">P1</th>
                  <th className="text-center p-1 font-bold">P2</th>
                  <th className="text-center p-1 font-bold">P3</th>
                  <th className="text-center p-1 font-bold">R#</th>
                  <th className="text-center p-1 font-bold bg-yellow-900 text-yellow-300">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {allPredictions.map((p) => {
                  const bd = getBreakdown(p);
                  const total = Object.values(bd).reduce((sum, v) => sum + (v || 0), 0);
                  return (
                    <tr key={p.userId} className="border-b border-gray-700 hover:bg-gray-800">
                      <td className="p-2 font-bold text-white">{p.nickname}</td>
                      <PointCell name={p.pole} pts={bd.pole} />
                      {race.isSprint && <PointCell name={p.sprintQualPole} pts={bd.sprintQualPole} />}
                      {race.isSprint && <PointCell name={p.sprintP1} pts={bd.sprintP1} />}
                      {race.isSprint && <PointCell name={p.sprintP2} pts={bd.sprintP2} />}
                      {race.isSprint && <PointCell name={p.sprintP3} pts={bd.sprintP3} />}
                      <PointCell name={p.raceP1} pts={bd.raceP1} />
                      <PointCell name={p.raceP2} pts={bd.raceP2} />
                      <PointCell name={p.raceP3} pts={bd.raceP3} />
                      <PointCell name={p.finisherPosition} pts={bd.randomFinisher} />
                      <td className="p-1 text-center font-bold bg-yellow-900 text-yellow-300 text-sm">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })()}
      </div>

      {helpField && <FieldHelpModal fieldKey={helpField} onClose={() => setHelpField(null)} />}
    </div>
  );
}

// SEASON BOARD VIEW
function SeasonBoardView({ group, user }) {
  const [seasonPreds, setSeasonPreds] = useState([]);
  const [userSeasonPreds, setUserSeasonPreds] = useState({ wdc: "", wcc: "" });
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");
  const [memberNicknames, setMemberNicknames] = useState({});

  // Load member nicknames
  useEffect(() => {
    if (!group) return;

    const loadNicknames = async () => {
      const nicknames = {};
      if (group.members) {
        for (const memberId of group.members) {
          try {
            const userRef = doc(db, "users", memberId);
            const userDoc = await getDoc(userRef);
            nicknames[memberId] = getDisplayName(userDoc.data()?.nickname, userDoc.data()?.googleFirstName, userDoc.data()?.email);
          } catch (e) {
            nicknames[memberId] = "Unknown";
          }
        }
      }
      setMemberNicknames(nicknames);
    };

    loadNicknames();
  }, [group]);

  useEffect(() => {
    if (!group || !user) return;

    const unsubscribe = onSnapshot(collection(db, `groups/${group.id}/seasonPredictions`), (snapshot) => {
      const allPreds = [];
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        allPreds.push({
          userId: doc.id,
          nickname: data.nickname || memberNicknames[doc.id] || "Unknown",
          wdc: data.wdc || "-",
          wcc: data.wcc || "-"
        });

        if (doc.id === user.uid) {
          setUserSeasonPreds({ wdc: data.wdc || "", wcc: data.wcc || "" });
          setLocked(true);
        }
      });
      setSeasonPreds(allPreds.sort((a, b) => a.nickname.localeCompare(b.nickname)));
    });

    return () => unsubscribe();
  }, [group, user, memberNicknames]);

  const saveSeasonPredictions = async () => {
    if (!userSeasonPreds.wdc || !userSeasonPreds.wcc) {
      setMessage("⚠️ Select both WDC and WCC");
      setTimeout(() => setMessage(""), 3000);
      return;
    }
    try {
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      const userNickname = getDisplayName(userDoc.data()?.nickname, userDoc.data()?.googleFirstName, userDoc.data()?.email);

      const predRef = doc(db, `groups/${group.id}/seasonPredictions`, user.uid);
      await setDoc(predRef, {
        nickname: userNickname,
        wdc: userSeasonPreds.wdc,
        wcc: userSeasonPreds.wcc,
        createdAt: serverTimestamp()
      });
      setLocked(true);
      setMessage("✅ Season predictions saved!");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      console.error("Error:", error);
      setMessage("❌ Error saving");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-red-600/50 rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: "'Orbitron'" }}>⭐ SEASON BOARD</h2>

        {/* Your Predictions Section */}
        {!locked && (
          <div className="space-y-4 mb-8 bg-gray-800 p-4 rounded-lg border border-yellow-600/50">
            <h3 className="font-bold text-lg text-yellow-400">YOUR SEASON PREDICTIONS</h3>
            <select value={userSeasonPreds.wdc} onChange={(e) => setUserSeasonPreds({ ...userSeasonPreds, wdc: e.target.value })} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white mb-4">
              <option value="">Select World Drivers Champion</option>
              {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={userSeasonPreds.wcc} onChange={(e) => setUserSeasonPreds({ ...userSeasonPreds, wcc: e.target.value })} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white mb-4">
              <option value="">Select World Constructors Champion</option>
              {F1_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={saveSeasonPredictions} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded">Save Season Predictions</button>
            {message && <p className="text-center text-sm text-green-400 mt-2">{message}</p>}
          </div>
        )}
        {locked && (
          <div className="mb-8 bg-green-900/30 p-4 rounded-lg border border-green-600/50">
            <p className="text-green-400 font-bold">✅ Your season predictions are locked</p>
            <p className="text-gray-300 text-sm mt-2">WDC: <span className="font-bold">{userSeasonPreds.wdc}</span></p>
            <p className="text-gray-300 text-sm">WCC: <span className="font-bold">{userSeasonPreds.wcc}</span></p>
          </div>
        )}

        {/* All Players Table */}
        <h3 className="font-bold text-lg mb-4">ALL SEASON PREDICTIONS</h3>
        {seasonPreds.length === 0 ? (
          <p className="text-gray-400 text-center py-6">Waiting for season predictions...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-red-600">
                  <th className="text-left p-3 font-bold">Player</th>
                  <th className="text-left p-3 font-bold">WDC Pick</th>
                  <th className="text-left p-3 font-bold">WCC Pick</th>
                </tr>
              </thead>
              <tbody>
                {seasonPreds.map(p => (
                  <tr key={p.userId} className="border-b border-gray-700 hover:bg-gray-800">
                    <td className="p-3 font-bold">{p.nickname}</td>
                    <td className="p-3 text-yellow-400">{p.wdc}</td>
                    <td className="p-3 text-blue-400">{p.wcc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// HOW TO PLAY VIEW
function HowToPlayView() {
  const [tab, setTab] = useState("player");

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
      <h2 className="text-xl font-black mb-1 tracking-wider" style={{ fontFamily: 'Orbitron' }}>HOW TO PLAY</h2>
      <p className="text-xs text-gray-600 tracking-widest mb-5">GAME GUIDE</p>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("player")}
          className={`flex-1 py-2 rounded-full font-bold text-xs transition tracking-wide ${tab === "player" ? "bg-red-600 text-white" : "bg-gray-900 border border-gray-800 text-gray-500 hover:text-white"}`}
        >
          🏎 Player Rules
        </button>
        <button
          onClick={() => setTab("admin")}
          className={`flex-1 py-2 rounded-full font-bold text-xs transition tracking-wide ${tab === "admin" ? "bg-red-600 text-white" : "bg-gray-900 border border-gray-800 text-gray-500 hover:text-white"}`}
        >
          ⚙️ Admin Guide
        </button>
      </div>

      {tab === "player" && (
        <div className="space-y-6">

          <div>
            <h3 className="text-lg font-bold text-red-400 mb-3">🏁 What You Predict</h3>
            <p className="text-gray-400 text-sm mb-3">Before each race weekend, submit your predictions. Fields vary by race type:</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-800 rounded p-3">
                <p className="text-white font-bold mb-2">Normal Race</p>
                <ul className="text-gray-400 space-y-1">
                  <li>• Pole Position</li>
                  <li>• P1 — Race Winner</li>
                  <li>• P2 — 2nd Place</li>
                  <li>• P3 — 3rd Place</li>
                  <li>• R# — Random Finisher</li>
                </ul>
                <p className="text-yellow-400 text-xs mt-2 font-bold">Max 6 pts</p>
              </div>
              <div className="bg-gray-800 rounded p-3">
                <p className="text-white font-bold mb-2">Sprint Weekend</p>
                <ul className="text-gray-400 space-y-1">
                  <li>• Pole Position</li>
                  <li>• Sprint Quali Pole</li>
                  <li>• Sprint P1, P2, P3</li>
                  <li>• Race P1, P2, P3</li>
                  <li>• R# — Random Finisher</li>
                </ul>
                <p className="text-yellow-400 text-xs mt-2 font-bold">Max 10 pts</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-red-400 mb-3">📊 Points Breakdown</h3>
            <div className="bg-gray-800 rounded overflow-hidden text-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left p-3 text-gray-400 font-semibold">Category</th>
                    <th className="text-center p-3 text-gray-400 font-semibold">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  <tr><td className="p-3 text-gray-300">Pole Position</td><td className="p-3 text-center text-yellow-400 font-bold">+1</td></tr>
                  <tr><td className="p-3 text-gray-300">Sprint Quali Pole</td><td className="p-3 text-center text-yellow-400 font-bold">+1</td></tr>
                  <tr><td className="p-3 text-gray-300">Sprint P1 / P2 / P3</td><td className="p-3 text-center text-yellow-400 font-bold">+1 each</td></tr>
                  <tr><td className="p-3 text-gray-300">Race P1 / P2 / P3</td><td className="p-3 text-center text-yellow-400 font-bold">+1 each</td></tr>
                  <tr className="bg-gray-700/30">
                    <td className="p-3 text-gray-300">R# — Exact match <span className="text-gray-500 text-xs">(your driver finishes at the exact random position)</span></td>
                    <td className="p-3 text-center text-green-400 font-bold">+2</td>
                  </tr>
                  <tr className="bg-gray-700/30">
                    <td className="p-3 text-gray-300">R# — Closest prediction <span className="text-gray-500 text-xs">(your driver is closest to the random position)</span></td>
                    <td className="p-3 text-center text-green-400 font-bold">+1</td>
                  </tr>
                  <tr className="bg-gray-700/30">
                    <td className="p-3 text-gray-300">R# — DNS / DNF</td>
                    <td className="p-3 text-center text-red-400 font-bold">0</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-red-400 mb-3">🎲 How R# Works</h3>
            <div className="bg-gray-800 rounded p-4 text-sm space-y-2 text-gray-300">
              <p>Before each race, the admin rolls a random number (e.g. P10). You predict which driver will finish at that position.</p>
              <p>After the race, the admin records where your predicted driver <span className="text-white font-semibold">actually finished</span>. The player whose driver finished <span className="text-white font-semibold">closest to the target position</span> wins the bonus.</p>
              <div className="bg-gray-900 rounded p-3 mt-2 text-xs space-y-1 text-gray-400">
                <p className="text-white font-semibold mb-1">Example — Target: P10</p>
                <p>Player 1 predicted Hadjar → finished P8 → distance 2</p>
                <p>Player 2 predicted Bearman → finished P11 → distance 1 <span className="text-green-400 font-bold">← closest, +1 pt</span></p>
                <p>Player 3 predicted Bortoleto → DNS → distance ∞ → 0 pts</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-red-400 mb-3">🔒 Prediction Lock Window</h3>
            <div className="bg-gray-800 rounded p-4 text-sm text-gray-300 space-y-2">
              <div className="flex gap-3">
                <span className="text-yellow-400 font-bold w-28 shrink-0">Normal race:</span>
                <span>Lock at <span className="text-white font-semibold">30 minutes before FP2</span> (Friday afternoon)</span>
              </div>
              <div className="flex gap-3">
                <span className="text-yellow-400 font-bold w-28 shrink-0">Sprint weekend:</span>
                <span>Lock at <span className="text-white font-semibold">30 minutes before Sprint Qualifying</span> (Friday afternoon)</span>
              </div>
              <p className="text-red-400 text-xs pt-1">Once locked, no changes can be made — plan ahead.</p>
            </div>
          </div>

        </div>
      )}

      {tab === "admin" && (
        <div className="space-y-6">

          <div>
            <h3 className="text-lg font-bold text-red-400 mb-3">👥 Setting Up a Group</h3>
            <ol className="text-gray-300 text-sm space-y-2 ml-1">
              <li><span className="text-white font-bold">1.</span> Create a group from the Groups screen.</li>
              <li><span className="text-white font-bold">2.</span> Go to <span className="text-yellow-400">Invites</span> and generate an invite link.</li>
              <li><span className="text-white font-bold">3.</span> Share the link with players. They join by clicking it and signing in.</li>
              <li><span className="text-white font-bold">4.</span> Players will appear in the group once they have joined.</li>
            </ol>
          </div>

          <div>
            <h3 className="text-lg font-bold text-red-400 mb-3">🎲 Before Each Race — Generate R#</h3>
            <div className="bg-gray-800 rounded p-4 text-sm text-gray-300 space-y-2">
              <p>Go to <span className="text-yellow-400">Results</span>, select the round, and click <span className="text-white font-semibold">Generate Random Number</span>.</p>
              <p>This assigns a target finishing position (e.g. P10) for the round. Players will see this when making their predictions.</p>
              <p className="text-red-400 text-xs">Generate before predictions lock — players need it to make their R# pick.</p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-red-400 mb-3">🏁 After Each Race — Enter Results</h3>
            <ol className="text-gray-300 text-sm space-y-2 ml-1">
              <li><span className="text-white font-bold">1.</span> Go to <span className="text-yellow-400">Results</span> and select the round.</li>
              <li><span className="text-white font-bold">2.</span> Enter Pole, and Race P1 / P2 / P3 (plus Sprint fields if applicable).</li>
              <li><span className="text-white font-bold">3.</span> Enter the driver who actually finished at the random position (e.g. who finished P10).</li>
              <li><span className="text-white font-bold">4.</span> In the <span className="text-purple-400 font-semibold">R# Predictions</span> section, enter the actual finishing position of each player's predicted driver.</li>
              <li><span className="text-white font-bold">5.</span> Click <span className="text-green-400 font-semibold">Save & Calculate Points</span>. Scores update immediately.</li>
            </ol>
          </div>

          <div>
            <h3 className="text-lg font-bold text-red-400 mb-3">📊 Points Are Auto-Calculated</h3>
            <div className="bg-gray-800 rounded p-4 text-sm text-gray-300 space-y-2">
              <p>Saving results triggers automatic scoring for all players. The Leaderboard updates instantly.</p>
              <p>If you need to correct a result, re-enter the correct values and save again — scores overwrite cleanly.</p>
              <p>Use the <span className="text-yellow-400">Recalculate</span> button on the Calendar page if scores ever appear out of sync.</p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-red-400 mb-3">🔍 Audit Trail</h3>
            <div className="bg-gray-800 rounded p-4 text-sm text-gray-300 space-y-2">
              <p>Every prediction save is logged automatically. Go to <span className="text-yellow-400">Audit Log</span> to see who saved what and when.</p>
              <p>You can filter by player or round. Each entry shows a full field-by-field breakdown of the prediction at the time it was saved.</p>
              <p className="text-gray-500 text-xs">Only admins can view the audit log.</p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// Fetch 2026 schedule from Jolpica (Ergast replacement). Falls back to hardcoded silently.
function useF1ApiSchedule(season = 2026) {
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

// Session row: label + UTC time + live status badge
function SessionRow({ label, startIso, durationMs, nowTs }) {
  if (!startIso) return null;
  const startMs = new Date(startIso).getTime();
  const endMs = startMs + durationMs;
  const status = nowTs < startMs ? 'upcoming' : nowTs < endMs ? 'live' : 'done';
  const cfg = {
    upcoming: { text: 'Upcoming',   cls: 'bg-blue-900/40 text-blue-400' },
    live:     { text: '🔴 LIVE',    cls: 'bg-green-900/40 text-green-400' },
    done:     { text: 'Finished',   cls: 'bg-gray-700/50 text-gray-500' },
  }[status];
  const timeStr = new Date(startIso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
  }) + ' UTC';
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-gray-300 font-medium w-32">{label}</span>
      <span className="text-gray-400">{timeStr}</span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded ${cfg.cls}`}>{cfg.text}</span>
    </div>
  );
}

// RESULTS VIEW - ADMIN ENTRY
function ResultsView({ group, user, currentRound }) {
  const [selectedRound, setSelectedRound] = useState(currentRound);
  const race = F1_SCHEDULE_2026[selectedRound - 1];
  const { apiData, apiStatus } = useF1ApiSchedule(2026);

  // Merge: API times win, hardcoded as fallback
  const apiRound = apiData?.[selectedRound];
  const raceStartStr = apiRound?.raceStart ?? race?.raceStart ?? null;
  const sprintStartStr = apiRound?.sprintStart ?? null;
  const sprintQualifyingStartStr = apiRound?.sprintQualifyingStart ?? null;
  const usingApiData = apiStatus === 'ok' && apiRound?.raceStart != null;
  const [results, setResults] = useState({
    pole: "",
    sprintQualPole: "",
    sprintP1: "",
    sprintP2: "",
    sprintP3: "",
    raceP1: "",
    raceP2: "",
    raceP3: "",
    finisherAtPosition: "",
    rPredFinishPositions: {}
  });
  const [randomNumber, setRandomNumber] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [existingResults, setExistingResults] = useState(null);
  const [roundPredictions, setRoundPredictions] = useState([]); // [{uid, nickname, driver}]
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Update timestamp every minute for countdown accuracy
  useEffect(() => {
    const interval = setInterval(() => setNowTs(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Load existing results if any — resets whenever selected round changes
  useEffect(() => {
    if (!group) return;

    // Clear stale data from previous round
    setResults({ pole: "", sprintQualPole: "", sprintP1: "", sprintP2: "", sprintP3: "", raceP1: "", raceP2: "", raceP3: "", finisherAtPosition: "", rPredFinishPositions: {} });
    setExistingResults(null);
    setRandomNumber(null);
    setRoundPredictions([]);

    const unsubscribe = onSnapshot(
      doc(db, `groups/${group.id}/results`, `round${selectedRound}`),
      (snap) => {
        if (snap.exists()) {
          setExistingResults(snap.data());
          setResults(snap.data());
        }
      },
      (error) => console.error("Error:", error)
    );

    return () => unsubscribe();
  }, [group, selectedRound]);

  // Load random number for selected round
  useEffect(() => {
    if (!group) return;

    const unsubscribe = onSnapshot(
      doc(db, `groups/${group.id}/randomNumbers`, `round${selectedRound}`),
      (snap) => {
        if (snap.exists()) {
          setRandomNumber(snap.data().number);
        }
      }
    );

    return () => unsubscribe();
  }, [group, selectedRound]);

  // Load all players' R# predictions for selected round (to show finishing-position inputs)
  useEffect(() => {
    if (!group) return;
    getDocs(collection(db, `groups/${group.id}/predictions`)).then((snap) => {
      const roundKey = `round${selectedRound}`;
      const preds = snap.docs
        .map((d) => {
          const roundData = d.data()[roundKey];
          if (!roundData?.finisherPosition) return null;
          return {
            uid: d.id,
            nickname: d.data().nickname || d.id,
            driver: roundData.finisherPosition,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.nickname.localeCompare(b.nickname));
      setRoundPredictions(preds);
    });
  }, [group, selectedRound]);

  const handleSaveResults = async () => {
    // Hard lock guard — re-check at save time
    if (lockTimeMs !== null && Date.now() > lockTimeMs) {
      setMessage("⛔ Results editing locked — 24 hours have passed since race end");
      setTimeout(() => setMessage(""), 4000);
      return;
    }

    if (!results.pole || !results.raceP1 || !results.raceP2 || !results.raceP3) {
      setMessage("⚠️ All race results required (Pole, P1, P2, P3)");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setLoading(true);
    try {
      const resultsRef = doc(db, `groups/${group.id}/results`, `round${selectedRound}`);

      await setDoc(resultsRef, {
        ...(race.isSprint ? { sprintQualPole: results.sprintQualPole || null, sprintP1: results.sprintP1 || null, sprintP2: results.sprintP2 || null, sprintP3: results.sprintP3 || null } : {}),
        pole: results.pole,
        raceP1: results.raceP1,
        raceP2: results.raceP2,
        raceP3: results.raceP3,
        finisherAtPosition: results.finisherAtPosition || null,
        randomNumber: randomNumber,
        rPredFinishPositions: results.rPredFinishPositions || {},
        recordedBy: user.uid,
        recordedAt: new Date().toISOString(),
        createdAt: serverTimestamp()
      });

      // NOW CALCULATE POINTS FOR ALL PREDICTIONS
      await calculateAndSaveScores();

      // Race progression notification
      const nextRace = F1_SCHEDULE_2026[selectedRound]; // array is 0-indexed, so [selectedRound] = round+1
      const nextMsg = nextRace
        ? ` ${nextRace.name} (R${nextRace.round}) is now open for predictions!`
        : " Season complete!";
      setMessage(`✅ ${race.name} (R${selectedRound}) closed — points saved.${nextMsg}`);
      setTimeout(() => setMessage(""), 6000);
    } catch (error) {
      console.error("Error:", error);
      setMessage("❌ Error saving results");
    } finally {
      setLoading(false);
    }
  };

  const calculateAndSaveScores = async () => {
    try {
      // Get all predictions for this event
      const predictionsSnapshot = await getDocs(
        collection(db, `groups/${group.id}/predictions`)
      );

      const exact = (pred, result) => pred && result && pred === result ? 1 : 0;

      // Helper: get R# distance for a player using rPredFinishPositions (new method)
      // Falls back to F1_GRID_ORDER distance if rPredFinishPositions not set (old races)
      const getRfDistance = (userId, predicted) => {
        const posStr = results.rPredFinishPositions?.[userId];
        if (posStr) {
          if (posStr === "DNS" || posStr === "DNF") return Infinity;
          const pos = parseInt(posStr.replace("P", ""), 10);
          return isNaN(pos) ? Infinity : Math.abs(pos - randomNumber);
        }
        // Fallback: F1_GRID_ORDER distance vs finisherAtPosition
        const actualFinisher = results.finisherAtPosition;
        const actualIdx = actualFinisher ? F1_GRID_ORDER.indexOf(actualFinisher) : -1;
        const predIdx = predicted ? F1_GRID_ORDER.indexOf(predicted) : -1;
        return (predicted && actualFinisher && predIdx !== -1 && actualIdx !== -1)
          ? Math.abs(predIdx - actualIdx) : Infinity;
      };

      // First pass: collect all player data and compute R# distances
      const playerData = [];
      for (const predDoc of predictionsSnapshot.docs) {
        const userId = predDoc.id;
        const roundData = predDoc.data()[`round${selectedRound}`];
        if (!roundData) continue;
        const predicted = roundData.finisherPosition;
        const distance = getRfDistance(userId, predicted);
        playerData.push({ userId, roundData, distance });
      }

      // Determine closest distance for competitive R# bonus
      const validDistances = playerData.filter(p => p.distance !== Infinity).map(p => p.distance);
      const minDistance = validDistances.length > 0 ? Math.min(...validDistances) : Infinity;

      console.log(`Found ${playerData.length} players with predictions`);
      console.log(`R# Finishing Positions: ${JSON.stringify(results.rPredFinishPositions)}`);
      playerData.forEach(p => {
        console.log(`  ${p.userId}: predicted "${p.roundData.finisherPosition}" → distance ${p.distance === Infinity ? 'N/A' : p.distance}`);
      });
      console.log(`Closest distance: ${minDistance === Infinity ? 'N/A' : minDistance} positions`);
      const closestPlayers = playerData.filter(p => p.distance === minDistance).map(p => p.userId);
      console.log(`Closest player(s): ${closestPlayers.join(', ')}`);
      console.log(`SCORING EACH PLAYER:`);

      // Second pass: calculate and save scores
      for (const { userId, roundData, distance } of playerData) {
        let totalPoints = 0;
        const breakdown = {};

        breakdown.pole = exact(roundData.pole, results.pole);
        totalPoints += breakdown.pole;

        if (race.isSprint) {
          breakdown.sprintQualPole = exact(roundData.sprintQualPole, results.sprintQualPole);
          totalPoints += breakdown.sprintQualPole;
          breakdown.sprintP1 = exact(roundData.sprintP1, results.sprintP1);
          totalPoints += breakdown.sprintP1;
          breakdown.sprintP2 = exact(roundData.sprintP2, results.sprintP2);
          totalPoints += breakdown.sprintP2;
          breakdown.sprintP3 = exact(roundData.sprintP3, results.sprintP3);
          totalPoints += breakdown.sprintP3;
        }

        breakdown.raceP1 = exact(roundData.raceP1, results.raceP1);
        totalPoints += breakdown.raceP1;
        breakdown.raceP2 = exact(roundData.raceP2, results.raceP2);
        totalPoints += breakdown.raceP2;
        breakdown.raceP3 = exact(roundData.raceP3, results.raceP3);
        totalPoints += breakdown.raceP3;

        // Competitive R# bonus: exact=+2, closest non-exact=+1, others=0
        const isClosest = distance === minDistance && distance !== Infinity;
        const rfPts = !isClosest ? 0 : (distance === 0 ? 2 : 1);
        breakdown.randomFinisher = rfPts;
        totalPoints += breakdown.randomFinisher;

        if (rfPts === 2) {
          console.log(`- ${userId}: R# EXACT MATCH ✓ +2 points`);
        } else if (rfPts === 1) {
          console.log(`- ${userId}: R# CLOSEST (distance: ${distance}) ✓ +1 point`);
        } else {
          console.log(`- ${userId}: R# Not closest (distance: ${distance === Infinity ? 'N/A' : distance}) ✗ 0 points`);
        }

        const scoresRef = doc(db, `groups/${group.id}/scores`, userId);
        await setDoc(scoresRef, {
          [`round${selectedRound}`]: {
            totalPoints: totalPoints,
            breakdown: breakdown
          }
        }, { merge: true });
      }
    } catch (error) {
      console.error("Error calculating scores:", error);
      throw error;
    }
  };

  const handleEndWeekend = async () => {
    setShowEndConfirm(false);
    setLoading(true);
    try {
      const nextRound = selectedRound + 1;
      const statusRef = (round) => doc(db, `groups/${group.id}/raceStatus`, `round${round}`);

      await setDoc(statusRef(selectedRound), {
        status: 'PAST',
        isClosed: true,
        closedAt: new Date().toISOString(),
        closedBy: user.uid
      }, { merge: true });

      if (nextRound <= 24) {
        await setDoc(statusRef(nextRound), {
          status: 'CURRENT',
          isPredictionOpen: true,
          openedAt: new Date().toISOString()
        }, { merge: true });
      }

      // Log the event
      await setDoc(doc(db, `groups/${group.id}/systemLogs`, `endWeekend_${selectedRound}_${Date.now()}`), {
        event: 'END_WEEKEND',
        closedRound: selectedRound,
        openedRound: nextRound <= 24 ? nextRound : null,
        triggeredBy: user.uid,
        timestamp: new Date().toISOString()
      });

      const nextRaceName = nextRound <= 24 ? F1_SCHEDULE_2026[nextRound - 1]?.name : null;
      const nextMsg = nextRaceName ? ` ${nextRaceName} (R${nextRound}) is now open!` : " Season complete!";
      setMessage(`✅ Weekend closed: Round ${selectedRound} locked.${nextMsg}`);
      setTimeout(() => { setMessage(""); window.location.reload(); }, 3000);
    } catch (err) {
      console.error("End weekend error:", err);
      setMessage("❌ Error closing weekend");
      setLoading(false);
    }
  };

  const isAdmin = group && group.admin === user.uid;

  // 24-hour edit lock — uses merged raceStartStr (API wins, hardcoded fallback)
  const lockTimeMs = raceStartStr
    ? new Date(raceStartStr).getTime() + 24 * 60 * 60 * 1000
    : null;
  const lockTime = lockTimeMs ? new Date(lockTimeMs) : null;
  const isLocked = lockTimeMs !== null ? nowTs > lockTimeMs : false;
  const msUntilLock = lockTimeMs !== null ? Math.max(0, lockTimeMs - nowTs) : 0;
  const hoursUntilLock = Math.floor(msUntilLock / (1000 * 60 * 60));
  const minutesUntilLock = Math.floor((msUntilLock % (1000 * 60 * 60)) / (1000 * 60));
  const formatUTC = (date) => date
    ? date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
    : '';

  if (!race) {
    return (
      <div className="bg-gray-900 border border-red-600/50 rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: "'Orbitron'" }}>📊 RESULTS</h2>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-red-600/50 rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: "'Orbitron'" }}>📊 RACE RESULTS</h2>

        {/* Round Selector — always visible so admin can pick any completed/current race */}
        <div className="mb-5">
          <label className="block text-sm font-bold mb-2 text-gray-300">Select Race</label>
          <select
            value={selectedRound}
            onChange={(e) => setSelectedRound(parseInt(e.target.value))}
            className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white"
          >
            {F1_SCHEDULE_2026.filter(r => r.round <= currentRound).map(r => (
              <option key={r.round} value={r.round}>
                Round {r.round}: {r.name}{r.round === currentRound ? ' (Current)' : ' — Past'}
              </option>
            ))}
          </select>
        </div>

        <p className="text-gray-400 mb-4">{race?.name} — Round {selectedRound}{selectedRound < currentRound ? ' (Past Race)' : ''}</p>

        {/* Session schedule card */}
        {raceStartStr && (
          <div className="bg-gray-800 border border-gray-700 rounded p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-300 tracking-wide">SESSION SCHEDULE</p>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${usingApiData ? 'bg-green-900/40 text-green-500' : 'bg-gray-700 text-gray-500'}`}>
                {apiStatus === 'loading' ? '⏳ Fetching API...' : usingApiData ? '● Jolpica API' : '○ Hardcoded'}
              </span>
            </div>
            <div className="divide-y divide-gray-700/50">
              {sprintQualifyingStartStr && (
                <SessionRow label="Sprint Qualifying" startIso={sprintQualifyingStartStr} durationMs={60 * 60 * 1000} nowTs={nowTs} />
              )}
              {sprintStartStr && (
                <SessionRow label="Sprint Race" startIso={sprintStartStr} durationMs={45 * 60 * 1000} nowTs={nowTs} />
              )}
              <SessionRow label="Race" startIso={raceStartStr} durationMs={2 * 60 * 60 * 1000} nowTs={nowTs} />
            </div>
          </div>
        )}

        {/* Lock status banner */}
        {isAdmin && lockTime && (
          isLocked ? (
            <div className="bg-red-900/40 border border-red-500 p-4 rounded mb-5">
              <p className="text-red-400 font-bold text-base">⛔ RESULTS LOCKED</p>
              <p className="text-red-300 text-sm mt-1">
                The 24-hour editing window closed on {formatUTC(lockTime)}.
              </p>
            </div>
          ) : (
            <div className="bg-green-900/30 border border-green-600/50 p-4 rounded mb-5">
              <p className="text-green-400 font-bold text-base">✅ RESULTS EDITABLE</p>
              <p className="text-green-300 text-sm mt-1">
                Edit window closes {formatUTC(lockTime)}{' '}
                ({msUntilLock > 0 ? `${hoursUntilLock}h ${minutesUntilLock}m remaining` : 'closing soon'})
              </p>
            </div>
          )
        )}

        {selectedRound < currentRound && !isLocked && isAdmin && (
          <div className="bg-yellow-900/30 border border-yellow-600/50 p-3 rounded mb-5">
            <p className="text-yellow-300 text-sm font-bold">⚠️ Editing past race results</p>
            <p className="text-yellow-200 text-xs mt-1">Saving will recalculate and overwrite points for this round for all players.</p>
          </div>
        )}

        {!isAdmin ? (
          <div className="bg-gray-800 p-4 rounded border border-gray-700">
            <p className="text-gray-400">Only the league admin can enter race results.</p>
          </div>
        ) : (
          <>
            {!isLocked && (
              <div className="bg-blue-900/30 border border-blue-600/50 p-4 rounded mb-6">
                <p className="text-blue-300 font-bold mb-2">🔐 ADMIN MODE</p>
                <p className="text-sm text-blue-200">You can enter race results. Points will calculate automatically for all players.</p>
              </div>
            )}
            {isLocked && (
              <div className="bg-gray-800 border border-gray-700 p-4 rounded mb-6">
                <p className="text-gray-400 font-bold mb-1">🔒 VIEW ONLY</p>
                <p className="text-sm text-gray-500">Results can no longer be edited. The editing window has closed.</p>
              </div>
            )}

            {existingResults && (
              <div className="bg-green-900/30 border border-green-600/50 p-4 rounded mb-6">
                <p className="text-green-300 font-bold mb-2">✅ Results Already Entered</p>
                <p className="text-sm text-green-200">Current results are shown below. Edit and save to update.</p>
              </div>
            )}

            {randomNumber && (
              <div className="bg-gray-800 p-4 rounded mb-6 border border-gray-700">
                <p className="text-sm text-gray-400 mb-2">Random Finisher Position:</p>
                <p className="text-3xl font-black text-red-600">P{randomNumber}</p>
              </div>
            )}

            <div className="space-y-6 mb-6">
              <h3 className="font-bold text-lg">QUALIFYING & RACE RESULTS</h3>

              {/* Sprint sections — only for sprint weekends */}
              {race.isSprint && (
                <>
                  <div className="border border-yellow-600/50 rounded-lg p-4 bg-yellow-900/10">
                    <p className="text-xs font-bold text-yellow-400 mb-3 tracking-wide">🏁 SPRINT QUALIFYING</p>
                    <div>
                      <label className="block text-sm font-bold mb-2">SQ Pole (Sprint Qualifying Winner)</label>
                      <select
                        value={results.sprintQualPole}
                        onChange={(e) => setResults({ ...results, sprintQualPole: e.target.value })}
                        disabled={isLocked}
                        className="w-full bg-gray-800 border border-yellow-600/50 rounded p-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">Select Driver</option>
                        {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="border border-orange-600/50 rounded-lg p-4 bg-orange-900/10">
                    <p className="text-xs font-bold text-orange-400 mb-3 tracking-wide">🏁 SPRINT RACE</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-bold mb-2">Sprint P1 (Winner)</label>
                        <select
                          value={results.sprintP1}
                          onChange={(e) => setResults({ ...results, sprintP1: e.target.value })}
                          disabled={isLocked}
                          className="w-full bg-gray-800 border border-orange-600/50 rounded p-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="">Select Driver</option>
                          {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold mb-2">Sprint P2</label>
                        <select
                          value={results.sprintP2}
                          onChange={(e) => setResults({ ...results, sprintP2: e.target.value })}
                          disabled={isLocked}
                          className="w-full bg-gray-800 border border-orange-600/50 rounded p-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="">Select Driver</option>
                          {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold mb-2">Sprint P3</label>
                        <select
                          value={results.sprintP3}
                          onChange={(e) => setResults({ ...results, sprintP3: e.target.value })}
                          disabled={isLocked}
                          className="w-full bg-gray-800 border border-orange-600/50 rounded p-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="">Select Driver</option>
                          {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <hr className="border-gray-700" />
                </>
              )}

              {/* Main race sections — always visible */}
              <div className="border border-blue-600/50 rounded-lg p-4 bg-blue-900/10">
                <p className="text-xs font-bold text-blue-400 mb-3 tracking-wide">🏁 MAIN RACE QUALIFYING</p>
                <div>
                  <label className="block text-sm font-bold mb-2">Pole Position</label>
                  <select
                    value={results.pole}
                    onChange={(e) => setResults({ ...results, pole: e.target.value })}
                    disabled={isLocked}
                    className="w-full bg-gray-800 border border-blue-600/50 rounded p-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select Driver</option>
                    {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="border border-blue-600/50 rounded-lg p-4 bg-blue-900/10">
                <p className="text-xs font-bold text-blue-400 mb-3 tracking-wide">🏁 MAIN RACE</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">Race P1 (Winner)</label>
                    <select
                      value={results.raceP1}
                      onChange={(e) => setResults({ ...results, raceP1: e.target.value })}
                      disabled={isLocked}
                      className="w-full bg-gray-800 border border-blue-600/50 rounded p-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Select Driver</option>
                      {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Race P2</label>
                    <select
                      value={results.raceP2}
                      onChange={(e) => setResults({ ...results, raceP2: e.target.value })}
                      disabled={isLocked}
                      className="w-full bg-gray-800 border border-blue-600/50 rounded p-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Select Driver</option>
                      {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Race P3</label>
                    <select
                      value={results.raceP3}
                      onChange={(e) => setResults({ ...results, raceP3: e.target.value })}
                      disabled={isLocked}
                      className="w-full bg-gray-800 border border-blue-600/50 rounded p-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Select Driver</option>
                      {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {randomNumber && (
                <div>
                  <label className="block text-sm font-bold mb-2">🎲 Driver at P{randomNumber}</label>
                  <select
                    value={results.finisherAtPosition}
                    onChange={(e) => setResults({ ...results, finisherAtPosition: e.target.value })}
                    disabled={isLocked}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select Driver</option>
                    {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}

              {randomNumber && roundPredictions.length > 0 && (
                <div className="border border-purple-600/50 rounded-lg p-4 bg-purple-900/10">
                  <p className="text-xs font-bold text-purple-400 mb-1 tracking-wide">🎲 R# PREDICTIONS — ACTUAL FINISHING POSITIONS</p>
                  <p className="text-xs text-gray-400 mb-3">Where did each player's predicted driver actually finish? Select finishing position (or DNS/DNF). Scoring: exact P{randomNumber} = +2, closest = +1.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {roundPredictions.map(({ uid, nickname, driver }) => (
                      <div key={uid}>
                        <label className="block text-xs font-semibold text-gray-300 mb-1">
                          {nickname} → <span className="text-purple-300">{driver}</span>
                        </label>
                        <select
                          value={results.rPredFinishPositions?.[uid] || ""}
                          onChange={(e) => setResults(prev => ({
                            ...prev,
                            rPredFinishPositions: { ...prev.rPredFinishPositions, [uid]: e.target.value }
                          }))}
                          disabled={isLocked}
                          className="w-full bg-gray-800 border border-purple-600/40 rounded p-2 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="">— not entered —</option>
                          {Array.from({ length: 22 }, (_, i) => `P${i + 1}`).map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                          <option value="DNS">DNS</option>
                          <option value="DNF">DNF</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSaveResults}
                disabled={loading || isLocked}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg disabled:cursor-not-allowed"
                title={isLocked ? "Results editing locked — 24 hours have passed since race end" : "Save results and calculate points for all players"}
              >
                {loading ? "Saving..." : isLocked ? "🔒 RESULTS LOCKED" : "SAVE & CALCULATE POINTS"}
              </button>

              {isAdmin && existingResults && !isLocked && (
                <button
                  onClick={() => setShowEndConfirm(true)}
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-red-700 to-red-900 hover:from-red-800 hover:to-red-950 hover:-translate-y-0.5 disabled:bg-gray-600 disabled:transform-none text-white font-bold py-3 rounded-lg transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  🏁 END WEEKEND
                </button>
              )}
            </div>

            {message && (
              <p className="text-center text-sm mt-3 text-green-400">{message}</p>
            )}

            {/* End Weekend confirmation dialog */}
            {showEndConfirm && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
                <div className="bg-gray-900 border-2 border-red-600 rounded-lg p-6 w-full max-w-md">
                  <h3 className="text-xl font-bold text-white mb-3">Close Round {selectedRound}?</h3>
                  <p className="text-gray-300 text-sm mb-4">
                    This will close Round {selectedRound} ({race?.name}) and open Round {selectedRound + 1}{selectedRound + 1 <= 24 ? ` (${F1_SCHEDULE_2026[selectedRound]?.name})` : ""} for predictions.
                  </p>
                  <ul className="text-sm text-gray-400 space-y-1 mb-6 ml-2">
                    <li>✓ Lock Round {selectedRound} permanently</li>
                    <li>✓ Open Round {selectedRound + 1} for predictions</li>
                    <li>✓ Update calendar status</li>
                  </ul>
                  <div className="flex gap-3">
                    <button
                      onClick={handleEndWeekend}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setShowEndConfirm(false)}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// INVITES VIEW
function InvitesView({ group, user, generateInviteCode, inviteLink, inviteStats, onGroupUpdated }) {
  const [memberNicknames, setMemberNicknames] = useState({});
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [copied, setCopied] = useState(false);
  const isAdmin = group?.admin === user?.uid;

  useEffect(() => {
    if (!group) return;
    const loadMemberNicknames = async () => {
      try {
        const nicknames = {};
        for (const memberId of group.members) {
          const userRef = doc(db, "users", memberId);
          const userDoc = await getDoc(userRef);
          nicknames[memberId] = getDisplayName(userDoc.data()?.nickname, userDoc.data()?.googleFirstName, userDoc.data()?.email);
        }
        setMemberNicknames(nicknames);
      } catch (error) {
        console.error("Error:", error);
      }
    };
    loadMemberNicknames();
  }, [group]);

  const removePlayer = async (memberId) => {
    try {
      await updateDoc(doc(db, "groups", group.id), { members: arrayRemove(memberId) });
      setRemoveConfirm(null);
      if (onGroupUpdated) onGroupUpdated();
    } catch (error) {
      console.error("Error removing player:", error);
    }
  };

  const copyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareWhatsApp = () => {
    if (!inviteLink) return;
    const text = encodeURIComponent(`Join my F1 2026 Predictions League — ${group.name}!\n${inviteLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareEmail = () => {
    if (!inviteLink) return;
    const subject = encodeURIComponent(`Join my F1 Predictions League — ${group.name}`);
    const body = encodeURIComponent(`Hey!\n\nI'd like you to join my F1 2026 Predictions League: ${group.name}\n\nClick here to join:\n${inviteLink}\n\nSee you on the grid! 🏎️`);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
      <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: "'Orbitron'" }}>INVITE FRIENDS</h2>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        {inviteLink ? (
          <div>
            <p className="text-xs text-gray-400 mb-2">Invite link (single-use code):</p>
            <div className="flex gap-2 mb-3">
              <input type="text" value={inviteLink} readOnly className="flex-1 bg-gray-900 border border-gray-600 rounded p-2 text-white text-xs font-mono" />
              <button onClick={copyLink} className="bg-gray-700 hover:bg-gray-600 p-2 rounded transition shrink-0" title="Copy link">
                {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={shareWhatsApp} className="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm font-bold py-2 rounded transition">WhatsApp</button>
              <button onClick={shareEmail} className="flex-1 bg-blue-700 hover:bg-blue-600 text-white text-sm font-bold py-2 rounded transition">Email</button>
              <button onClick={generateInviteCode} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold py-2 rounded transition">New Code</button>
            </div>
            {inviteStats && (
              <p className="text-xs text-gray-500 mt-3 text-center">This code used by {inviteStats.usedCount} player{inviteStats.usedCount !== 1 ? 's' : ''}</p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-400 mb-3">Generate a unique invite link to share with friends.</p>
            <button onClick={generateInviteCode} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded transition">Generate Invite Link</button>
          </div>
        )}
      </div>

      <h3 className="font-bold mb-3">Members ({group.members?.length || 0})</h3>
      <div className="space-y-2">
        {group.members?.map(memberId => (
          <div key={memberId} className="bg-gray-800 p-3 rounded text-gray-300 flex items-center gap-2">
            <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
              {(memberNicknames[memberId] || "?").slice(0, 1).toUpperCase()}
            </div>
            <span className="flex-1">{memberNicknames[memberId] || "Unknown"}</span>
            {memberId === group.admin && <span className="text-xs bg-red-600 px-2 py-1 rounded">ADMIN</span>}
            {isAdmin && memberId !== group.admin && (
              <button
                onClick={() => setRemoveConfirm(memberId)}
                className="text-xs bg-gray-700 hover:bg-red-700 text-gray-400 hover:text-white px-2 py-1 rounded transition"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {removeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border-2 border-red-600 rounded-lg p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-white mb-2">Remove Player?</h2>
            <p className="text-gray-300 text-sm mb-6">
              Remove <span className="text-white font-bold">{memberNicknames[removeConfirm] || "this player"}</span> from the league?
            </p>
            <div className="flex gap-2">
              <button onClick={() => removePlayer(removeConfirm)} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded">Remove</button>
              <button onClick={() => setRemoveConfirm(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-2 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// CALENDAR VIEW
function CalendarView({ group, user, currentRound }) {
  const [loading, setLoading] = useState(true);
  const [allPredictions, setAllPredictions] = useState({});
  const [results, setResults] = useState({});
  const [scores, setScores] = useState({});
  const [memberNicknames, setMemberNicknames] = useState({});
  const [expandedRound, setExpandedRound] = useState(null);
  const [filter, setFilter] = useState('all');
  const [currentCountdown, setCurrentCountdown] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!group) return;
    const loadAllData = async () => {
      setLoading(true);
      try {
        const [predsSnap, scoresSnap] = await Promise.all([
          getDocs(collection(db, `groups/${group.id}/predictions`)),
          getDocs(collection(db, `groups/${group.id}/scores`)),
        ]);

        const predsMap = {};
        predsSnap.docs.forEach(d => { predsMap[d.id] = d.data(); });
        setAllPredictions(predsMap);

        const scoresMap = {};
        scoresSnap.docs.forEach(d => { scoresMap[d.id] = d.data(); });
        setScores(scoresMap);

        const pastRoundNums = F1_SCHEDULE_2026.filter(r => r.round < currentRound).map(r => r.round);
        const resultsArr = await Promise.all(
          pastRoundNums.map(n =>
            getDoc(doc(db, `groups/${group.id}/results`, `round${n}`))
              .then(d => [n, d.exists() ? d.data() : null])
          )
        );
        const resultsMap = {};
        resultsArr.forEach(([n, data]) => { if (data) resultsMap[n] = data; });
        setResults(resultsMap);

        const nicknames = {};
        await Promise.all((group.members || []).map(async memberId => {
          try {
            const ud = await getDoc(doc(db, "users", memberId));
            nicknames[memberId] = getDisplayName(ud.data()?.nickname, ud.data()?.googleFirstName, ud.data()?.email);
          } catch { nicknames[memberId] = '?'; }
        }));
        setMemberNicknames(nicknames);
      } catch (e) {
        console.error("Calendar load error:", e);
      } finally {
        setLoading(false);
      }
    };
    loadAllData();
  }, [group, currentRound, refreshTick]);

  useEffect(() => {
    const race = F1_SCHEDULE_2026[currentRound - 1];
    if (!race) return;
    const update = () => setCurrentCountdown(getTimeUntilLock(race));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [currentRound]);

  const getRaceStatus = (round) => {
    if (round < currentRound) return 'past';
    if (round === currentRound) return 'current';
    return 'upcoming';
  };

  const pastCount = F1_SCHEDULE_2026.filter(r => getRaceStatus(r.round) === 'past').length;
  const upcomingCount = F1_SCHEDULE_2026.filter(r => getRaceStatus(r.round) === 'upcoming').length;

  const [recalculatingRound, setRecalculatingRound] = useState(null);
  const [calcMsg, setCalcMsg] = useState({});

  const recalculatePoints = async (race) => {
    if (!group || !user) return;
    setRecalculatingRound(race.round);
    setCalcMsg(prev => ({ ...prev, [race.round]: '' }));
    try {
      const raceResults = results[race.round];
      if (!raceResults) throw new Error("No results entered for this race yet");
      const randSnap = await getDoc(doc(db, `groups/${group.id}/randomNumbers`, `round${race.round}`));
      const randomNumber = randSnap.exists() ? randSnap.data().number : null;
      const roundKey = `round${race.round}`;
      let saved = 0;
      const ex = (p, r) => p && r && p === r ? 1 : 0;

      // Helper: R# distance using rPredFinishPositions (new), fallback to F1_GRID_ORDER (old races)
      const getRfDist = (uid, predicted) => {
        const posStr = raceResults.rPredFinishPositions?.[uid];
        if (posStr) {
          if (posStr === "DNS" || posStr === "DNF") return Infinity;
          const pos = parseInt(posStr.replace("P", ""), 10);
          return isNaN(pos) ? Infinity : Math.abs(pos - randomNumber);
        }
        // Fallback: F1_GRID_ORDER distance vs finisherAtPosition
        const actualFinisher = raceResults.finisherAtPosition;
        const actualIdx = actualFinisher ? F1_GRID_ORDER.indexOf(actualFinisher) : -1;
        const predIdx = predicted ? F1_GRID_ORDER.indexOf(predicted) : -1;
        return (predicted && actualFinisher && predIdx !== -1 && actualIdx !== -1)
          ? Math.abs(predIdx - actualIdx) : Infinity;
      };

      // First pass: collect player data and compute R# distances
      const playerEntries = Object.entries(allPredictions)
        .map(([uid, predData]) => {
          const roundData = predData[roundKey];
          if (!roundData) return null;
          const predicted = roundData.finisherPosition;
          const distance = getRfDist(uid, predicted);
          return { uid, roundData, distance };
        })
        .filter(Boolean);

      // Determine closest distance for competitive R# bonus
      const validDistances = playerEntries.filter(p => p.distance !== Infinity).map(p => p.distance);
      const minDistance = validDistances.length > 0 ? Math.min(...validDistances) : Infinity;
      console.log(`[recalculate round${race.round}] Closest R# distance: ${minDistance === Infinity ? 'N/A' : minDistance}`);

      // Second pass: calculate and save scores
      for (const { uid, roundData, distance } of playerEntries) {
        let totalPoints = 0;
        const breakdown = {};
        breakdown.pole = ex(roundData.pole, raceResults.pole); totalPoints += breakdown.pole;
        breakdown.raceP1 = ex(roundData.raceP1, raceResults.raceP1); totalPoints += breakdown.raceP1;
        breakdown.raceP2 = ex(roundData.raceP2, raceResults.raceP2); totalPoints += breakdown.raceP2;
        breakdown.raceP3 = ex(roundData.raceP3, raceResults.raceP3); totalPoints += breakdown.raceP3;
        if (race.isSprint) {
          breakdown.sprintQualPole = ex(roundData.sprintQualPole, raceResults.sprintQualPole); totalPoints += breakdown.sprintQualPole;
          breakdown.sprintP1 = ex(roundData.sprintP1, raceResults.sprintP1); totalPoints += breakdown.sprintP1;
          breakdown.sprintP2 = ex(roundData.sprintP2, raceResults.sprintP2); totalPoints += breakdown.sprintP2;
          breakdown.sprintP3 = ex(roundData.sprintP3, raceResults.sprintP3); totalPoints += breakdown.sprintP3;
        }
        // Competitive R# bonus: exact=+2, closest non-exact=+1, others=0
        const isClosest = distance === minDistance && distance !== Infinity;
        const rfPts = !isClosest ? 0 : (distance === 0 ? 2 : 1);
        breakdown.randomFinisher = rfPts;
        totalPoints += breakdown.randomFinisher;
        console.log(`[recalculate] ${uid}: R# distance=${distance === Infinity ? 'N/A' : distance} → ${rfPts > 0 ? `+${rfPts}` : '0'}`);
        const scoresRef = doc(db, `groups/${group.id}/scores`, uid);
        await setDoc(scoresRef, { [roundKey]: { totalPoints, breakdown } }, { merge: true });
        saved++;
      }
      setCalcMsg(prev => ({ ...prev, [race.round]: `✅ Points saved for ${saved} players` }));
      setRefreshTick(t => t + 1);
    } catch (e) {
      console.error("Recalculate error:", e);
      setCalcMsg(prev => ({ ...prev, [race.round]: `❌ ${e.message}` }));
    } finally {
      setRecalculatingRound(null);
    }
  };

  const filteredRaces = F1_SCHEDULE_2026.filter(race => {
    if (filter === 'all') return true;
    return getRaceStatus(race.round) === filter;
  });

  const renderPastDetails = (race) => {
    const raceResults = results[race.round];
    const roundKey = `round${race.round}`;
    const roundPreds = Object.entries(allPredictions)
      .filter(([, data]) => data[roundKey])
      .map(([uid, data]) => ({
        userId: uid,
        nickname: data.nickname || memberNicknames[uid] || "Unknown",
        pred: data[roundKey],
        points: scores[uid]?.[roundKey]?.totalPoints ?? null,
        breakdown: scores[uid]?.[roundKey]?.breakdown ?? null,
      }))
      .sort((a, b) => (b.points ?? -1) - (a.points ?? -1));

    const lastName = (name) => name ? name.split(' ').slice(-1)[0] : '—';
    const mkCell = (predVal, resultVal) => {
      if (!predVal) return <span className="text-gray-600">—</span>;
      const hit = raceResults && predVal === resultVal;
      return <span className={hit ? "text-green-400 font-bold" : "text-gray-300"}>{lastName(predVal)}</span>;
    };

    return (
      <div className="mt-3 pt-3 border-t border-gray-700 space-y-3">
        {raceResults ? (
          <div className="bg-gray-900 rounded p-3">
            <p className="text-xs font-bold text-yellow-400 mb-2">OFFICIAL RESULTS</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <span className="text-gray-400">Pole:</span><span className="text-white font-semibold">{raceResults.pole || "—"}</span>
              <span className="text-gray-400">P1:</span><span className="text-white font-semibold">{raceResults.raceP1 || "—"}</span>
              <span className="text-gray-400">P2:</span><span className="text-white font-semibold">{raceResults.raceP2 || "—"}</span>
              <span className="text-gray-400">P3:</span><span className="text-white font-semibold">{raceResults.raceP3 || "—"}</span>
              {raceResults.randomNumber && (
                <>
                  <span className="text-gray-400">P{raceResults.randomNumber}:</span>
                  <span className="text-white font-semibold">{raceResults.finisherAtPosition || "—"}</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-gray-900 rounded p-3 text-center">
            <p className="text-gray-500 text-xs">No results entered yet</p>
          </div>
        )}

        {roundPreds.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-2">No predictions for this race</p>
        ) : (
          <div>
            <p className="text-xs font-bold text-gray-300 mb-2">PREDICTIONS & POINTS</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="text-left py-1 pr-3">Player</th>
                    <th className="text-center py-1 px-1">Pole</th>
                    {race.isSprint && <th className="text-center py-1 px-1">SQ</th>}
                    {race.isSprint && <th className="text-center py-1 px-1">SP1</th>}
                    {race.isSprint && <th className="text-center py-1 px-1">SP2</th>}
                    {race.isSprint && <th className="text-center py-1 px-1">SP3</th>}
                    <th className="text-center py-1 px-1">P1</th>
                    <th className="text-center py-1 px-1">P2</th>
                    <th className="text-center py-1 px-1">P3</th>
                    <th className="text-center py-1 px-1">Fin</th>
                    <th className="text-center py-1 px-1 text-yellow-400 font-bold">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {roundPreds.map(({ userId, nickname, pred, points, breakdown }) => (
                    <tr key={userId} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="py-1 pr-3 font-semibold text-white whitespace-nowrap">{nickname}</td>
                      <td className="py-1 px-1 text-center">{mkCell(pred.pole, raceResults?.pole)}</td>
                      {race.isSprint && <td className="py-1 px-1 text-center">{mkCell(pred.sprintQualPole, raceResults?.sprintQualPole)}</td>}
                      {race.isSprint && <td className="py-1 px-1 text-center">{mkCell(pred.sprintP1, raceResults?.sprintP1)}</td>}
                      {race.isSprint && <td className="py-1 px-1 text-center">{mkCell(pred.sprintP2, raceResults?.sprintP2)}</td>}
                      {race.isSprint && <td className="py-1 px-1 text-center">{mkCell(pred.sprintP3, raceResults?.sprintP3)}</td>}
                      <td className="py-1 px-1 text-center">{mkCell(pred.raceP1, raceResults?.raceP1)}</td>
                      <td className="py-1 px-1 text-center">{mkCell(pred.raceP2, raceResults?.raceP2)}</td>
                      <td className="py-1 px-1 text-center">{mkCell(pred.raceP3, raceResults?.raceP3)}</td>
                      <td className="py-1 px-1 text-center">
                        {pred.finisherPosition ? (() => {
                          const rfPts = breakdown?.randomFinisher ?? null;
                          const color = rfPts > 0 ? "text-green-400 font-bold" : "text-gray-300";
                          return <span className={color}>{lastName(pred.finisherPosition)}{rfPts !== null ? `/${rfPts}` : ''}</span>;
                        })() : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-1 px-1 text-center font-black text-base">
                        <span className={points !== null ? "text-yellow-400" : "text-gray-500"}>
                          {points !== null ? points : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {user && group && user.uid === group.admin && raceResults && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700/50">
            <span className="text-xs text-gray-500">
              {calcMsg[race.round] || (roundPreds.some(p => p.points !== null) ? '' : 'No scores calculated yet')}
            </span>
            <button
              onClick={() => recalculatePoints(race)}
              disabled={recalculatingRound === race.round}
              className="px-3 py-1 bg-blue-800 hover:bg-blue-700 text-white text-xs rounded font-bold transition disabled:opacity-50 shrink-0 ml-2"
            >
              {recalculatingRound === race.round ? 'Calculating...' : roundPreds.some(p => p.points !== null) ? '↻ Recalculate' : '⚡ Calculate Points'}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderCurrentDetails = (race) => {
    const locked = isEditLocked(race);
    return (
      <div className="mt-3 pt-3 border-t border-gray-700">
        {locked ? (
          <div className="bg-orange-900/30 border border-orange-600/50 rounded p-3 text-center">
            <p className="text-orange-400 font-bold text-sm">🔒 Predictions Locked — Race Underway</p>
          </div>
        ) : (
          <div className="bg-green-900/30 border border-green-600/50 rounded p-3 space-y-1">
            <p className="text-green-400 font-bold text-sm">🟢 Open for Predictions</p>
            <p className="text-xs text-gray-300">Locks in: <span className="text-red-400 font-bold">{currentCountdown}</span> (5 hrs before race start)</p>
            <p className="text-xs text-gray-500">Go to Predictions tab to submit</p>
          </div>
        )}
      </div>
    );
  };

  const renderUpcomingDetails = (race) => {
    const lockTime = getPredictionLockTime(race);
    const fmtOpts = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
    const lockLabel = race.isSprint ? '30 min before Sprint Qualifying' : '30 min before FP2';
    return (
      <div className="mt-3 pt-3 border-t border-gray-700">
        <div className="bg-gray-900 rounded p-3 text-xs text-gray-400 space-y-1">
          <p>Race start: <span className="text-gray-200">{new Date(race.raceStart).toLocaleString('en-US', fmtOpts)}</span></p>
          <p>Predictions lock: <span className="text-gray-200">{lockTime ? lockTime.toLocaleString('en-US', fmtOpts) : '—'}</span> <span className="text-gray-500">({lockLabel})</span></p>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-gray-900 border border-red-600/50 rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: "'Orbitron'" }}>🗓️ 2026 F1 CALENDAR</h2>
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin inline-block text-4xl mb-4">⏳</div>
          <p>Loading race data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-red-600/50 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold" style={{ fontFamily: "'Orbitron'" }}>🗓️ 2026 F1 CALENDAR</h2>
        <button
          onClick={() => setRefreshTick(t => t + 1)}
          className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700 transition"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: 'all', label: 'All (24)' },
          { key: 'past', label: `Past (${pastCount})` },
          { key: 'current', label: 'Current' },
          { key: 'upcoming', label: `Upcoming (${upcomingCount})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1 rounded text-sm font-bold transition ${filter === key ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filteredRaces.map((race) => {
          const status = getRaceStatus(race.round);
          const isExpanded = expandedRound === race.round;
          const myPoints = user ? scores[user.uid]?.[`round${race.round}`]?.totalPoints : null;

          const statusBadge = {
            past: <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-700 text-gray-300">PAST</span>,
            current: <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-700 text-green-200 animate-pulse">CURRENT</span>,
            upcoming: <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-900 text-blue-300">UPCOMING</span>,
          }[status];

          const borderClass = status === 'current' ? 'border-red-500' : 'border-gray-700';
          const bgClass = status === 'current' ? 'bg-red-950/20' : 'bg-gray-800';

          return (
            <div key={race.round} className={`border rounded-lg overflow-hidden ${borderClass} ${bgClass}`}>
              <button
                onClick={() => setExpandedRound(prev => prev === race.round ? null : race.round)}
                className="w-full text-left p-4 flex items-center gap-3 hover:bg-white/5 transition"
              >
                <span className="text-red-600 font-black text-base w-8 shrink-0">R{race.round}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white">{race.name}</span>
                    {race.isSprint && <span className="px-1.5 py-0.5 bg-yellow-600 text-white text-xs rounded font-bold">SPRINT</span>}
                    {statusBadge}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {race.location} · {new Date(race.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                {status === 'past' && myPoints !== null && myPoints !== undefined && (
                  <div className="text-right shrink-0 mr-1">
                    <span className="text-yellow-400 font-black text-lg">{myPoints}</span>
                    <span className="text-gray-500 text-xs ml-0.5">pts</span>
                  </div>
                )}
                {status === 'current' && (
                  <div className="text-right shrink-0 mr-1">
                    <span className="text-green-400 text-xs font-bold">{currentCountdown}</span>
                  </div>
                )}
                <span className="text-gray-500 shrink-0 text-xs">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4">
                  {status === 'past' && renderPastDetails(race)}
                  {status === 'current' && renderCurrentDetails(race)}
                  {status === 'upcoming' && renderUpcomingDetails(race)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// AUDIT LOG VIEW — admin only
function AuditView({ group }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filterPlayer, setFilterPlayer] = useState("all");
  const [filterRound, setFilterRound] = useState("all");

  useEffect(() => {
    if (!group) return;
    getDocs(collection(db, `groups/${group.id}/auditLog`)).then((snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.timestampIso || "";
          const tb = b.timestampIso || "";
          return tb.localeCompare(ta); // newest first
        });
      setEntries(rows);
      setLoading(false);
    });
  }, [group]);

  const fmt = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: "UTC",
    }) + " UTC";
  };

  const players = [...new Set(entries.map((e) => e.nickname))].sort();
  // Always show all scheduled rounds, not just ones with audit entries
  const rounds = F1_SCHEDULE_2026.map((r) => ({ round: r.round, name: r.name }));

  const filtered = entries.filter((e) => {
    if (filterPlayer !== "all" && e.nickname !== filterPlayer) return false;
    if (filterRound  !== "all" && String(e.round) !== filterRound) return false;
    return true;
  });

  const predFields = [
    ["pole",          "Pole"],
    ["sprintQualPole","SQ Pole"],
    ["sprintP1",      "Sprint P1"],
    ["sprintP2",      "Sprint P2"],
    ["sprintP3",      "Sprint P3"],
    ["raceP1",        "Race P1"],
    ["raceP2",        "Race P2"],
    ["raceP3",        "Race P3"],
    ["finisherPosition", "R# Pick"],
  ];

  return (
    <div className="space-y-4">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
        <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Orbitron'" }}>🔍 AUDIT LOG</h2>
        <p className="text-gray-400 text-sm mb-5">Every prediction save by every player, in order. Admin eyes only.</p>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <select
            value={filterPlayer}
            onChange={(e) => setFilterPlayer(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-xl p-2 text-white text-sm"
          >
            <option value="all">All players</option>
            {players.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={filterRound}
            onChange={(e) => setFilterRound(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-xl p-2 text-white text-sm"
          >
            <option value="all">All rounds</option>
            {rounds.map((r) => <option key={r.round} value={String(r.round)}>R{r.round} — {r.name}</option>)}
          </select>
          <span className="text-gray-500 text-sm self-center">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-10">Loading audit log...</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-center py-10">No audit entries yet.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <div key={entry.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {/* Row header */}
                <button
                  onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-700/50 transition"
                >
                  <span className="text-red-500 font-black text-sm w-8 shrink-0">R{entry.round}</span>
                  <span className="font-bold text-white text-sm flex-1">{entry.nickname}</span>
                  <span className="text-gray-400 text-xs shrink-0 hidden sm:block">{entry.raceName}</span>
                  <span className="text-yellow-300 text-xs shrink-0 ml-2">{fmt(entry.timestampIso)}</span>
                  <span className="text-gray-500 text-xs ml-2">{expanded === entry.id ? "▲" : "▼"}</span>
                </button>

                {/* Expanded prediction detail */}
                {expanded === entry.id && (
                  <div className="px-4 pb-4 border-t border-gray-700 pt-3">
                    <p className="text-xs text-gray-500 mb-2 font-semibold tracking-wide">PREDICTIONS SUBMITTED</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
                      {predFields.map(([key, label]) =>
                        entry.predictions?.[key] ? (
                          <div key={key} className="flex justify-between gap-2">
                            <span className="text-gray-400">{label}:</span>
                            <span className="text-white font-semibold">{entry.predictions[key]}</span>
                          </div>
                        ) : null
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-3">User ID: {entry.userId}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
