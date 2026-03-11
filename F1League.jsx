import React, { useState, useEffect } from 'react';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, updateDoc, serverTimestamp, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';
import { Menu, X, LogOut, Plus, Users, Trophy, BarChart3, Settings, Copy, Check, Calendar, Lock, Edit } from 'lucide-react';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(e => console.error("Auth error:", e));
const db = getFirestore(app);

const F1_SCHEDULE_2026 = [
  { round: 1, name: "Australia", location: "Melbourne", date: "2026-03-08", fp1: "2026-03-06T09:30:00", isSprint: false },
  { round: 2, name: "China", location: "Shanghai", date: "2026-03-15", fp1: "2026-03-13T10:00:00", isSprint: true },
  { round: 3, name: "Japan", location: "Suzuka", date: "2026-03-29", fp1: "2026-03-27T10:00:00", isSprint: false },
  { round: 4, name: "Bahrain", location: "Sakhir", date: "2026-04-12", fp1: "2026-04-10T14:00:00", isSprint: false },
  { round: 5, name: "Saudi Arabia", location: "Jeddah", date: "2026-04-19", fp1: "2026-04-17T17:00:00", isSprint: false },
  { round: 6, name: "Miami", location: "Miami", date: "2026-05-03", fp1: "2026-05-01T13:00:00", isSprint: true },
  { round: 7, name: "Canada", location: "Montreal", date: "2026-05-24", fp1: "2026-05-22T14:00:00", isSprint: true },
  { round: 8, name: "Monaco", location: "Monte Carlo", date: "2026-06-07", fp1: "2026-06-05T14:00:00", isSprint: false },
  { round: 9, name: "Barcelona-Catalunya", location: "Barcelona", date: "2026-06-14", fp1: "2026-06-12T13:00:00", isSprint: false },
  { round: 10, name: "Austria", location: "Spielberg", date: "2026-06-28", fp1: "2026-06-26T14:00:00", isSprint: false },
  { round: 11, name: "Great Britain", location: "Silverstone", date: "2026-07-05", fp1: "2026-07-03T13:00:00", isSprint: true },
  { round: 12, name: "Belgium", location: "Spa", date: "2026-07-19", fp1: "2026-07-17T14:00:00", isSprint: false },
  { round: 13, name: "Hungary", location: "Budapest", date: "2026-07-26", fp1: "2026-07-24T14:00:00", isSprint: false },
  { round: 14, name: "Netherlands", location: "Zandvoort", date: "2026-08-23", fp1: "2026-08-21T14:00:00", isSprint: true },
  { round: 15, name: "Italy", location: "Monza", date: "2026-09-06", fp1: "2026-09-04T13:00:00", isSprint: false },
  { round: 16, name: "Spain", location: "Madrid", date: "2026-09-13", fp1: "2026-09-11T14:00:00", isSprint: false },
  { round: 17, name: "Azerbaijan", location: "Baku", date: "2026-09-27", fp1: "2026-09-25T12:00:00", isSprint: false },
  { round: 18, name: "Singapore", location: "Singapore", date: "2026-10-11", fp1: "2026-10-09T14:00:00", isSprint: true },
  { round: 19, name: "United States", location: "Austin", date: "2026-10-25", fp1: "2026-10-23T12:00:00", isSprint: false },
  { round: 20, name: "Mexico", location: "Mexico City", date: "2026-11-01", fp1: "2026-10-30T18:00:00", isSprint: false },
  { round: 21, name: "Brazil", location: "São Paulo", date: "2026-11-08", fp1: "2026-11-06T11:00:00", isSprint: false },
  { round: 22, name: "Las Vegas", location: "Las Vegas", date: "2026-11-21", fp1: "2026-11-19T22:00:00", isSprint: false },
  { round: 23, name: "Qatar", location: "Lusail", date: "2026-11-29", fp1: "2026-11-27T15:00:00", isSprint: false },
  { round: 24, name: "Abu Dhabi", location: "Yas Island", date: "2026-12-06", fp1: "2026-12-04T08:00:00", isSprint: false },
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

function getTimeUntilLock(race) {
  if (!race || !race.fp1) return "N/A";

  // FP1 time minus 5 hours = lock time
  const fp1Time = new Date(race.fp1);
  const lockTime = new Date(fp1Time.getTime() - (5 * 60 * 60 * 1000));

  const now = new Date();
  const diff = lockTime - now;

  if (diff <= 0) return "LOCKED";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function isEditLocked(race) {
  if (!race || !race.fp1) return false;

  // FP1 time minus 5 hours = lock time
  const fp1Time = new Date(race.fp1);
  const lockTime = new Date(fp1Time.getTime() - (5 * 60 * 60 * 1000));

  return new Date() >= lockTime;
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
  const [inviteLink, setInviteLink] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (authUser) => {
      if (authUser) {
        setUser(authUser);
        const profileRef = doc(db, "users", authUser.uid);
        const profileDoc = await getDoc(profileRef);
        if (profileDoc.exists()) {
          setNickname(profileDoc.data().nickname || "");
        }
        await loadUserGroups(authUser.uid);

        const params = new URLSearchParams(window.location.search);
        const groupId = params.get('join');
        if (groupId) {
          const groupRef = doc(db, "groups", groupId);
          const groupDoc = await getDoc(groupRef);
          if (groupDoc.exists()) {
            const groupData = groupDoc.data();
            const members = groupData.members || [];
            if (!members.includes(authUser.uid)) {
              members.push(authUser.uid);
              await updateDoc(groupRef, { members });
            }
            setSelectedGroup({ id: groupId, ...groupData, members });
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
    } catch (error) {
      console.error("Error loading groups:", error);
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

  const generateInviteLink = async () => {
    if (!selectedGroup || !user) return;
    const link = `${window.location.origin}?join=${selectedGroup.id}`;
    setInviteLink(link);
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-red-950 to-gray-950 flex items-center justify-center p-4">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');`}</style>
        <div className="text-center max-w-md">
          <div className="text-6xl font-black mb-4" style={{ fontFamily: "'Orbitron'", color: '#ff0000' }}>F1</div>
          <h1 className="text-4xl font-bold text-white mb-2" style={{ fontFamily: "'Orbitron'" }}>2026 PREDICTIONS</h1>
          <p className="text-gray-300 mb-8">Compete with friends. Predict the championship.</p>
          <button onClick={handleGoogleSignIn} className="w-full bg-white text-gray-900 font-bold py-3 px-6 rounded-lg hover:bg-gray-100 transition">
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (!selectedGroup) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-red-950 to-gray-950 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-black text-white" style={{ fontFamily: "'Orbitron'", color: '#ff0000' }}>F1 LEAGUE</h1>
            <div className="flex gap-2">
              <button onClick={() => setShowSettings(true)} className="text-gray-400 hover:text-white p-2"><Settings size={24} /></button>
              <button onClick={handleSignOut} className="text-gray-400 hover:text-white p-2"><LogOut size={24} /></button>
            </div>
          </div>

          <div className="space-y-4">
            {groups.map(group => (
              <div key={group.id} className="bg-gray-900 border-2 border-red-600 p-4 rounded-lg flex justify-between items-center">
                <button onClick={() => setSelectedGroup(group)} className="text-left flex-1">
                  <h3 className="text-xl font-bold text-white mb-1">{group.name}</h3>
                  <p className="text-sm text-gray-400">{group.members.length} members</p>
                </button>
                <button onClick={() => setDeleteConfirm(group.id)} className="ml-4 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-bold">Delete</button>
              </div>
            ))}
          </div>

          <button onClick={() => setShowCreateGroup(true)} className="w-full mt-6 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2">
            <Plus size={20} /> Create New League
          </button>

          {showCreateGroup && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-gray-900 border-2 border-red-600 rounded-lg p-6 w-full max-w-md">
                <h2 className="text-2xl font-bold text-white mb-4">Create League</h2>
                <input type="text" placeholder="League name" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white mb-4 focus:outline-none focus:border-red-600" />
                <div className="flex gap-2">
                  <button onClick={createNewGroup} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded">Create</button>
                  <button onClick={() => setShowCreateGroup(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-2 rounded">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {showSettings && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-gray-900 border-2 border-red-600 rounded-lg p-6 w-full max-w-md">
                <h2 className="text-2xl font-bold text-white mb-4">Settings</h2>
                <input type="text" placeholder="Enter your nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white mb-4 focus:outline-none focus:border-red-600" />
                <div className="flex gap-2">
                  <button onClick={saveNickname} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded">Save</button>
                  <button onClick={() => setShowSettings(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-2 rounded">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {deleteConfirm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-gray-900 border-2 border-red-600 rounded-lg p-6 w-full max-w-md">
                <h2 className="text-2xl font-bold text-white mb-4">Delete League?</h2>
                <p className="text-gray-300 mb-6">Are you sure you want to leave this league?</p>
                <div className="flex gap-2">
                  <button onClick={() => deleteLeague(deleteConfirm)} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded">Delete</button>
                  <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-2 rounded">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const race = F1_SCHEDULE_2026[currentRound - 1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-red-950 to-gray-950 text-white">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');`}</style>

      <div className="bg-black/40 border-b border-red-600/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black" style={{ fontFamily: "'Orbitron'", color: '#ff0000' }}>F1 2026</h1>
            <p className="text-sm text-gray-400">{selectedGroup.name}</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-gray-900 border border-red-600/50 rounded-lg p-4 space-y-2">
              <button onClick={() => setCurrentView("leaderboard")} className={`w-full text-left p-3 rounded flex items-center gap-2 transition ${currentView === "leaderboard" ? "bg-red-600" : "hover:bg-gray-800"}`}>
                <Trophy size={18} /> Leaderboard
              </button>
              <button onClick={() => setCurrentView("predict")} className={`w-full text-left p-3 rounded flex items-center gap-2 transition ${currentView === "predict" ? "bg-red-600" : "hover:bg-gray-800"}`}>
                <BarChart3 size={18} /> Predictions
              </button>
              <button onClick={() => setCurrentView("seasonBoard")} className={`w-full text-left p-3 rounded flex items-center gap-2 transition ${currentView === "seasonBoard" ? "bg-red-600" : "hover:bg-gray-800"}`}>
                ⭐ Season Board
              </button>
              <button onClick={() => setCurrentView("howToPlay")} className={`w-full text-left p-3 rounded flex items-center gap-2 transition ${currentView === "howToPlay" ? "bg-red-600" : "hover:bg-gray-800"}`}>
                ❓ How to Play
              </button>
              <button onClick={() => setCurrentView("calendar")} className={`w-full text-left p-3 rounded flex items-center gap-2 transition ${currentView === "calendar" ? "bg-red-600" : "hover:bg-gray-800"}`}>
                <Calendar size={18} /> Calendar
              </button>
              <button onClick={() => setCurrentView("results")} className={`w-full text-left p-3 rounded flex items-center gap-2 transition ${currentView === "results" ? "bg-red-600" : "hover:bg-gray-800"}`}>
                📊 Results
              </button>
              <button onClick={() => setCurrentView("invites")} className={`w-full text-left p-3 rounded flex items-center gap-2 transition ${currentView === "invites" ? "bg-red-600" : "hover:bg-gray-800"}`}>
                <Users size={18} /> Invite
              </button>
              <hr className="border-red-600/30 my-4" />
              <button onClick={() => setShowSettings(true)} className="w-full text-left p-3 rounded hover:bg-gray-800 flex items-center gap-2 transition text-gray-400"><Settings size={18} /> Settings</button>
              <button onClick={() => setSelectedGroup(null)} className="w-full text-left p-3 rounded hover:bg-gray-800 flex items-center gap-2 transition text-gray-400">← Back</button>
              <button onClick={handleSignOut} className="w-full text-left p-3 rounded hover:bg-gray-800 flex items-center gap-2 transition text-gray-400"><LogOut size={18} /> Sign out</button>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {currentView === "leaderboard" && <LeaderboardView group={selectedGroup} currentRound={currentRound} />}
            {currentView === "predict" && <PredictionView group={selectedGroup} race={race} currentRound={currentRound} countdown={countdown} user={user} />}
            {currentView === "calendar" && <CalendarView currentRound={currentRound} />}
            {currentView === "seasonBoard" && <SeasonBoardView group={selectedGroup} user={user} />}
            {currentView === "howToPlay" && <HowToPlayView />}
            {currentView === "results" && <ResultsView group={selectedGroup} user={user} currentRound={currentRound} />}
            {currentView === "invites" && <InvitesView group={selectedGroup} generateInviteLink={generateInviteLink} inviteLink={inviteLink} copiedLink={copiedLink} />}
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border-2 border-red-600 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-white mb-4">Settings</h2>
            <input type="text" placeholder="Enter your nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white mb-4 focus:outline-none focus:border-red-600" />
            <div className="flex gap-2">
              <button onClick={saveNickname} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded">Save</button>
              <button onClick={() => setShowSettings(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-2 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// LEADERBOARD VIEW
function LeaderboardView({ group, currentRound }) {
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    if (!group) return;

    const unsubscribe = onSnapshot(collection(db, `groups/${group.id}/scores`), async (snapshot) => {
      try {
        const leaderboardData = await Promise.all(snapshot.docs.map(async (doc) => {
          const userRef = doc(db, "users", doc.id);
          const userDoc = await getDoc(userRef);
          const nickname = userDoc.data()?.nickname || "Unknown";
          let totalPoints = 0;
          for (let i = 1; i <= currentRound; i++) {
            totalPoints += doc.data()[`round${i}`]?.totalPoints || 0;
          }
          return { userId: doc.id, nickname, totalPoints };
        }));
        setLeaderboard(leaderboardData.sort((a, b) => b.totalPoints - a.totalPoints));
      } catch (error) {
        console.error("Error loading leaderboard:", error);
      }
    });

    return () => unsubscribe();
  }, [group, currentRound]);

  return (
    <div className="bg-gray-900 border border-red-600/50 rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: "'Orbitron'" }}>CHAMPIONSHIP STANDINGS</h2>
      {leaderboard.length === 0 ? (
        <p className="text-gray-400 text-center py-8">No predictions yet</p>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((entry, index) => (
            <div key={entry.userId} className="bg-gray-800 p-4 rounded flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-2xl font-black text-red-600 w-8 text-center">{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}</span>
                <p className="font-bold">{entry.nickname}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-red-600">{entry.totalPoints}</p>
                <p className="text-xs text-gray-400">PTS</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
            nicknames[memberId] = userDoc.data()?.nickname || "Unknown";
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
      const nickname = userDoc.data()?.nickname || "Unknown";

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
      const userNickname = userDoc.data()?.nickname || "Unknown";

      const predRef = doc(db, `groups/${group.id}/predictions`, user.uid);
      await setDoc(predRef, {
        nickname: userNickname,
        [`round${currentRound}`]: {
          ...predictions,
          randomNumber: randomNumber,
          createdAt: serverTimestamp()
        }
      }, { merge: true });

      setUserHasPredictions(true);
      setIsEditing(false);
      setMessage("✅ Predictions saved!");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      console.error("Error:", error);
      setMessage("❌ Error saving");
    }
  };

  // Calculate points for a prediction
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

    if (pred.finisherPosition === allResults.finisherAtPosition) points += 2;
    else if (pred.finisherPosition && allResults.finisherAtPosition) points += 1;

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
                <label className="block text-sm font-bold mb-2">Pole Position</label>
                <select value={predictions.pole} onChange={(e) => handlePredictionChange('pole', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                  <option value="">Select</option>
                  {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {race.isSprint && (
                <div>
                  <label className="block text-sm font-bold mb-2">Sprint Quali Pole</label>
                  <select value={predictions.sprintQualPole} onChange={(e) => handlePredictionChange('sprintQualPole', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                    <option value="">Select</option>
                    {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}

              {race.isSprint && (
                <>
                  <div>
                    <label className="block text-sm font-bold mb-2">Sprint P1</label>
                    <select value={predictions.sprintP1} onChange={(e) => handlePredictionChange('sprintP1', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                      <option value="">Select</option>
                      {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Sprint P2</label>
                    <select value={predictions.sprintP2} onChange={(e) => handlePredictionChange('sprintP2', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                      <option value="">Select</option>
                      {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Sprint P3</label>
                    <select value={predictions.sprintP3} onChange={(e) => handlePredictionChange('sprintP3', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                      <option value="">Select</option>
                      {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-bold mb-2">Race P1</label>
                <select value={predictions.raceP1} onChange={(e) => handlePredictionChange('raceP1', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                  <option value="">Select</option>
                  {getAvailableForP1().map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Race P2</label>
                <select value={predictions.raceP2} onChange={(e) => handlePredictionChange('raceP2', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                  <option value="">Select</option>
                  {getAvailableForP2().map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Race P3</label>
                <select value={predictions.raceP3} onChange={(e) => handlePredictionChange('raceP3', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm">
                  <option value="">Select</option>
                  {getAvailableForP3().map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold mb-2">Driver at P{randomNumber || "?"}</label>
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

      {/* ALL PREDICTIONS TABLE WITH POINTS */}
      <div className="bg-gray-900 border border-red-600/50 rounded-lg p-4 overflow-x-auto">
        <h3 className="text-lg font-bold mb-4">ALL PREDICTIONS & POINTS</h3>
        {allPredictions.length === 0 ? (
          <p className="text-gray-400 text-center py-6">Waiting for predictions... once players submit, they'll appear here</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-red-600">
                <th className="text-left p-2 font-bold">Player</th>
                <th className="text-center p-1 font-bold">Pole</th>
                {race.isSprint && <th className="text-center p-1 font-bold">SQ</th>}
                <th className="text-center p-1 font-bold">P1</th>
                <th className="text-center p-1 font-bold">P2</th>
                <th className="text-center p-1 font-bold">P3</th>
                <th className="text-center p-1 font-bold">R#</th>
                <th className="text-center p-1 font-bold bg-green-900">PTS</th>
                <th className="text-center p-1 font-bold bg-yellow-900">TOT</th>
              </tr>
            </thead>
            <tbody>
              {allPredictions.map((p) => {
                const pts = calculatePredictionPoints(p);
                return (
                  <tr key={p.userId} className="border-b border-gray-700 hover:bg-gray-800">
                    <td className="p-2 font-bold text-white">{p.nickname}</td>
                    <td className="p-1 text-center text-yellow-300">{p.pole ? p.pole.split(' ')[0] : "-"}</td>
                    {race.isSprint && <td className="p-1 text-center text-yellow-300">{p.sprintQualPole ? p.sprintQualPole.split(' ')[0] : "-"}</td>}
                    <td className="p-1 text-center text-blue-300">{p.raceP1 ? p.raceP1.split(' ')[0] : "-"}</td>
                    <td className="p-1 text-center text-blue-300">{p.raceP2 ? p.raceP2.split(' ')[0] : "-"}</td>
                    <td className="p-1 text-center text-blue-300">{p.raceP3 ? p.raceP3.split(' ')[0] : "-"}</td>
                    <td className="p-1 text-center text-green-300">{p.finisherPosition ? p.finisherPosition.split(' ')[0] : "-"}</td>
                    <td className="p-1 text-center font-bold bg-green-900 text-white">{pts}</td>
                    <td className="p-1 text-center font-bold bg-yellow-900 text-white">{pts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
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
            nicknames[memberId] = userDoc.data()?.nickname || "Unknown";
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
      const userNickname = userDoc.data()?.nickname || "Unknown";

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
  return (
    <div className="bg-gray-900 border border-red-600/50 rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: "'Orbitron'" }}>❓ HOW TO PLAY</h2>

      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold text-red-600 mb-3">🏁 Race Predictions</h3>
          <p className="text-gray-300 mb-2">Predict each race weekend:</p>
          <ul className="text-gray-400 space-y-1 ml-4 text-sm">
            <li>• Pole Position</li>
            <li>• Sprint Quali Pole (sprint weekends)</li>
            <li>• Race Podium (P1, P2, P3)</li>
            <li>• Random Finisher (P4-P22)</li>
          </ul>
        </div>

        <div>
          <h3 className="text-lg font-bold text-red-600 mb-3">📊 Points System</h3>
          <div className="bg-gray-800 p-4 rounded space-y-2 text-sm">
            <p><span className="text-yellow-400 font-bold">Pole:</span> 1 pt</p>
            <p><span className="text-yellow-400 font-bold">Sprint Quali:</span> 1 pt</p>
            <p><span className="text-yellow-400 font-bold">Each Podium:</span> 1 pt (max 3)</p>
            <p><span className="text-yellow-400 font-bold">Random - Exact:</span> 2 pts | <span>Closest: 1 pt</span></p>
            <p><span className="text-green-400 font-bold">WDC/WCC Correct:</span> 5 pts each</p>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-red-600 mb-3">🔒 Edit Window</h3>
          <p className="text-gray-300 text-sm">Predictions lock <span className="font-bold">5 hours before FP1</span>. Edit anytime until then.</p>
        </div>
      </div>
    </div>
  );
}

// RESULTS VIEW - ADMIN ENTRY
function ResultsView({ group, user, currentRound }) {
  const race = F1_SCHEDULE_2026[currentRound - 1];
  const [results, setResults] = useState({
    pole: "",
    raceP1: "",
    raceP2: "",
    raceP3: "",
    fastestLap: "",
    finisherAtPosition: ""
  });
  const [randomNumber, setRandomNumber] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [existingResults, setExistingResults] = useState(null);

  // Load existing results if any
  useEffect(() => {
    if (!group) return;

    const unsubscribe = onSnapshot(
      doc(db, `groups/${group.id}/results`, `round${currentRound}`),
      (doc) => {
        if (doc.exists()) {
          setExistingResults(doc.data());
          setResults(doc.data());
        }
      },
      (error) => console.error("Error:", error)
    );

    return () => unsubscribe();
  }, [group, currentRound]);

  // Load random number
  useEffect(() => {
    if (!group) return;

    const unsubscribe = onSnapshot(
      doc(db, `groups/${group.id}/randomNumbers`, `round${currentRound}`),
      (doc) => {
        if (doc.exists()) {
          setRandomNumber(doc.data().number);
        }
      }
    );

    return () => unsubscribe();
  }, [group, currentRound]);

  const handleSaveResults = async () => {
    if (!results.pole || !results.raceP1 || !results.raceP2 || !results.raceP3) {
      setMessage("⚠️ All race results required (Pole, P1, P2, P3)");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setLoading(true);
    try {
      const resultsRef = doc(db, `groups/${group.id}/results`, `round${currentRound}`);

      await setDoc(resultsRef, {
        pole: results.pole,
        raceP1: results.raceP1,
        raceP2: results.raceP2,
        raceP3: results.raceP3,
        fastestLap: results.fastestLap || null,
        finisherAtPosition: results.finisherAtPosition || null,
        randomNumber: randomNumber,
        recordedBy: user.uid,
        recordedAt: new Date().toISOString(),
        createdAt: serverTimestamp()
      });

      // NOW CALCULATE POINTS FOR ALL PREDICTIONS
      await calculateAndSaveScores();

      setMessage("✅ Results saved! Points calculated for all players.");
      setTimeout(() => setMessage(""), 3000);
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

      // For each user with predictions
      for (const predDoc of predictionsSnapshot.docs) {
        const userId = predDoc.id;
        const roundData = predDoc.data()[`round${currentRound}`];

        if (!roundData) continue; // Skip if no predictions for this round

        // Calculate points for this user
        let totalPoints = 0;
        const breakdown = {};

        // Pole
        if (roundData.pole === results.pole) {
          breakdown.pole = 1;
          totalPoints += 1;
        } else {
          breakdown.pole = 0;
        }

        // Race Podium
        if (roundData.raceP1 === results.raceP1) {
          breakdown.raceP1 = 1;
          totalPoints += 1;
        } else {
          breakdown.raceP1 = 0;
        }

        if (roundData.raceP2 === results.raceP2) {
          breakdown.raceP2 = 1;
          totalPoints += 1;
        } else {
          breakdown.raceP2 = 0;
        }

        if (roundData.raceP3 === results.raceP3) {
          breakdown.raceP3 = 1;
          totalPoints += 1;
        } else {
          breakdown.raceP3 = 0;
        }

        // Fastest Lap
        if (results.fastestLap && roundData.fastestLap === results.fastestLap) {
          breakdown.fastestLap = 1;
          totalPoints += 1;
        } else {
          breakdown.fastestLap = 0;
        }

        // Random Finisher
        if (results.finisherAtPosition && randomNumber) {
          if (roundData.finisherPosition === results.finisherAtPosition) {
            breakdown.randomFinisherExact = 2;
            totalPoints += 2;
          } else if (roundData.finisherPosition) {
            // Closest guess (within 2 positions)
            const diff = Math.abs(
              parseInt(roundData.finisherPosition.split(' ')[0]) -
              parseInt(results.finisherAtPosition.split(' ')[0])
            );
            breakdown.randomFinisherClosest = diff <= 2 ? 1 : 0;
            totalPoints += breakdown.randomFinisherClosest;
          } else {
            breakdown.randomFinisherExact = 0;
            breakdown.randomFinisherClosest = 0;
          }
        } else {
          breakdown.randomFinisherExact = 0;
          breakdown.randomFinisherClosest = 0;
        }

        // Save scores
        const scoresRef = doc(db, `groups/${group.id}/scores`, userId);
        await setDoc(scoresRef, {
          [`round${currentRound}`]: {
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

  const isAdmin = group && group.admin === user.uid;

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
        <p className="text-gray-400 mb-6">{race.name} - Round {currentRound}</p>

        {!isAdmin ? (
          <div className="bg-gray-800 p-4 rounded border border-gray-700">
            <p className="text-gray-400">Only the league admin can enter race results.</p>
          </div>
        ) : (
          <>
            <div className="bg-blue-900/30 border border-blue-600/50 p-4 rounded mb-6">
              <p className="text-blue-300 font-bold mb-2">🔐 ADMIN MODE</p>
              <p className="text-sm text-blue-200">You can enter race results. Points will calculate automatically for all players.</p>
            </div>

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

            <div className="space-y-4 mb-6">
              <h3 className="font-bold text-lg">QUALIFYING & RACE RESULTS</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Pole Position</label>
                  <select
                    value={results.pole}
                    onChange={(e) => setResults({ ...results, pole: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                  >
                    <option value="">Select Driver</option>
                    {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2">Race P1 (Winner)</label>
                  <select
                    value={results.raceP1}
                    onChange={(e) => setResults({ ...results, raceP1: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
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
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
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
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                  >
                    <option value="">Select Driver</option>
                    {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2">Fastest Lap (Optional)</label>
                  <select
                    value={results.fastestLap}
                    onChange={(e) => setResults({ ...results, fastestLap: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                  >
                    <option value="">Select Driver</option>
                    {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                {randomNumber && (
                  <div>
                    <label className="block text-sm font-bold mb-2">Driver at P{randomNumber}</label>
                    <select
                      value={results.finisherAtPosition}
                      onChange={(e) => setResults({ ...results, finisherAtPosition: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                    >
                      <option value="">Select Driver</option>
                      {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleSaveResults}
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg"
            >
              {loading ? "Saving..." : "SAVE RESULTS & CALCULATE POINTS"}
            </button>

            {message && (
              <p className="text-center text-sm mt-3 text-green-400">{message}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// INVITES VIEW
function InvitesView({ group, generateInviteLink, inviteLink, copiedLink }) {
  const [memberNicknames, setMemberNicknames] = useState({});

  useEffect(() => {
    if (!group) return;

    const loadMemberNicknames = async () => {
      try {
        const nicknames = {};
        for (const memberId of group.members) {
          const userRef = doc(db, "users", memberId);
          const userDoc = await getDoc(userRef);
          nicknames[memberId] = userDoc.data()?.nickname || "Unknown";
        }
        setMemberNicknames(nicknames);
      } catch (error) {
        console.error("Error:", error);
      }
    };
    loadMemberNicknames();
  }, [group]);

  return (
    <div className="bg-gray-900 border border-red-600/50 rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: "'Orbitron'" }}>INVITE FRIENDS</h2>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
        <p className="text-sm text-gray-400 mb-4">Share this link:</p>
        {inviteLink ? (
          <div className="flex gap-2">
            <input type="text" value={inviteLink} readOnly className="flex-1 bg-gray-900 border border-gray-600 rounded p-2 text-white text-sm" />
            <button onClick={() => generateInviteLink()} className="bg-red-600 hover:bg-red-700 p-2 rounded transition">
              {copiedLink ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
        ) : (
          <button onClick={generateInviteLink} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded">Generate Link</button>
        )}
      </div>

      <h3 className="font-bold mb-3">Members ({group.members?.length || 0})</h3>
      <div className="space-y-2">
        {group.members?.map(memberId => (
          <div key={memberId} className="bg-gray-800 p-3 rounded text-gray-300 flex items-center gap-2">
            <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
              {(memberNicknames[memberId] || "Unknown").slice(0, 1).toUpperCase()}
            </div>
            <span className="flex-1">{memberNicknames[memberId] || "Unknown"}</span>
            {memberId === group.admin && <span className="text-xs bg-red-600 px-2 py-1 rounded">ADMIN</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// CALENDAR VIEW
function CalendarView({ currentRound }) {
  return (
    <div className="bg-gray-900 border border-red-600/50 rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: "'Orbitron'" }}>🗓️ 2026 F1 CALENDAR</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {F1_SCHEDULE_2026.map((race) => {
          const isActive = race.round === currentRound;
          return (
            <div
              key={race.round}
              className={`p-4 rounded-lg border-2 transition ${isActive
                ? 'border-red-600 bg-red-950/30'
                : 'border-gray-700 bg-gray-800 hover:border-red-600/50'
                }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-white text-lg">{race.name}</h3>
                  <p className="text-sm text-gray-400">{race.location}, {race.country}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-red-600">R{race.round}</p>
                  {race.isSprint && <p className="text-xs bg-yellow-600 text-white px-2 py-1 rounded mt-1">SPRINT</p>}
                  {isActive && <p className="text-xs bg-red-600 text-white px-2 py-1 rounded mt-1">ACTIVE</p>}
                </div>
              </div>

              <div className="border-t border-gray-700 pt-2 mt-2">
                <p className="text-xs text-gray-400">
                  Race: {new Date(race.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
                <p className="text-xs text-gray-400">
                  FP1: {new Date(race.fp1).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
