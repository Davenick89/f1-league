import React, { Suspense, useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, getDocs, query, where, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getToken } from 'firebase/messaging';
import { registerSW } from 'virtual:pwa-register';
import { validateNickname, validateGroupName, validateInviteCode } from './validation.js';
import { LogOut, Menu, Plus, Users, Trophy, BarChart3, Settings, Calendar, Newspaper } from 'lucide-react';
import {
  auth, db, functions, VAPID_KEY, track, fcmSupported, getMessagingInstance,
  F1_SCHEDULE_2026, getCurrentRound, getTimeUntilLock, getValidatedApiSessionStr,
  syncScheduleWithAPI, useF1ApiSchedule, useOnlineStatus,
} from './shared.js';

const AdminWizard = React.lazy(() => import('./AdminWizard.jsx'));
const LeaderboardView = React.lazy(() => import('./LeaderboardView.jsx'));
const PredictionView = React.lazy(() => import('./PredictionView.jsx'));
const SeasonBoardView = React.lazy(() => import('./SeasonBoardView.jsx'));
const HowToPlayView = React.lazy(() => import('./HowToPlayView.jsx'));
const ResultsView = React.lazy(() => import('./ResultsView.jsx'));
const InvitesView = React.lazy(() => import('./InvitesView.jsx'));
const CalendarView = React.lazy(() => import('./CalendarView.jsx'));
const AuditView = React.lazy(() => import('./AuditView.jsx'));
const StatsView = React.lazy(() => import('./StatsView.jsx'));
const NewsView = React.lazy(() => import('./NewsView.jsx'));

function GroupStandingBadge({ groupId, userId }) {
  const [standing, setStanding] = React.useState(null);

  React.useEffect(() => {
    // FIX (Track C #15): this badge renders once per league in the
    // league-selector list, for every visitor, every visit — it used to
    // fetch every player's entire scores history just to show one user's
    // rank. Now reads a single precomputed summary doc (written whenever
    // scores are saved — see ResultsView.jsx / CalendarView.jsx) instead.
    // Falls back to the old full-collection computation only if no summary
    // exists yet (e.g. a league that hasn't had results saved since this
    // shipped) or doesn't have this user's entry, so the badge still works
    // correctly in that transitional case — just without the perf win
    // until the next results save populates the summary.
    const load = async () => {
      try {
        const summarySnap = await getDoc(doc(db, `groups/${groupId}/scores`, 'summary'));
        const entry = summarySnap.exists() ? summarySnap.data().players?.[userId] : null;
        if (entry) {
          setStanding({ rank: entry.rank, pts: entry.totalPoints });
          return;
        }

        const scoresSnap = await getDocs(collection(db, `groups/${groupId}/scores`));
        let userPts = 0;
        let rank = 1;
        let found = false;
        scoresSnap.docs.filter(d => d.id !== 'summary').forEach(d => {
          let pts = 0;
          for (let i = 1; i <= F1_SCHEDULE_2026.length; i++) pts += d.data()[`round${i}`]?.totalPoints || 0;
          if (d.id === userId) { userPts = pts; found = true; }
        });
        scoresSnap.docs.filter(d => d.id !== 'summary').forEach(d => {
          let pts = 0;
          for (let i = 1; i <= F1_SCHEDULE_2026.length; i++) pts += d.data()[`round${i}`]?.totalPoints || 0;
          if (pts > userPts) rank++;
        });
        if (found) setStanding({ rank, pts: userPts });
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

function SetNicknameModal({ googleFirstName, onSave, onSkip, message }) {
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
        {message && <p className="mt-3 text-sm text-yellow-400">{message}</p>}
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  const [message, setMessage] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateServiceWorker, setUpdateServiceWorker] = useState(null);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const updateSW = registerSW({
      onNeedRefresh() {
        setUpdateServiceWorker(() => updateSW);
        setUpdateAvailable(true);
      },
    });
  }, []);

  // Run schedule sync once on mount — diagnostic only (console.error on drift,
  // doesn't feed any user-visible state), so it's deferred off the critical
  // startup path rather than competing with auth/profile/group fetches.
  useEffect(() => {
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => syncScheduleWithAPI())
      : setTimeout(() => syncScheduleWithAPI(), 2000);
    return () => {
      if (window.requestIdleCallback && window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, []);

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
          track('sign_up', { method: 'google' });
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
        const inviteValidation = validateInviteCode(inviteCodeParam);
        if (inviteValidation.valid) {
          const inviteRef = doc(db, "invites", inviteValidation.value);
          const inviteDoc = await getDoc(inviteRef);
          if (inviteDoc.exists()) {
            const inviteData = inviteDoc.data();
            const alreadyMember = loadedGroups.some(g => g.id === inviteData.leagueId);
            setPendingInvite({
              code: inviteValidation.value,
              leagueId: inviteData.leagueId,
              leagueName: inviteData.leagueName || "F1 League",
              alreadyMember,
            });
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }

        // FIX (post-Track-D audit): the old ?join={groupId} direct-write flow
        // is removed — firestore.rules' groups match only permits a *member*
        // to read the group doc (line 143) and only permits a member update
        // that removes themselves, never a non-admin adding a new uid (line
        // 179+). For the one case this path existed for — a non-member
        // opening an old link — both the read and the write were already
        // silently denied, so it could never actually add anyone. Removed
        // rather than "fixed," since there's no old-groupId → invite-code
        // mapping to redirect through; anyone with a stale link needs a
        // fresh invite from the league admin.
      } else {
        setUser(null);
        setGroups([]);
        setSelectedGroup(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const { apiData: headerApiData } = useF1ApiSchedule(2026);

  useEffect(() => {
    const race = F1_SCHEDULE_2026[currentRound - 1];
    if (!race) return;
    const offsetMins = selectedGroup?.predictionLockOffsetMins ?? 60;
    const apiSessionStr = getValidatedApiSessionStr(race, headerApiData?.[currentRound]);
    const updateCountdown = () => setCountdown(getTimeUntilLock(race, offsetMins, apiSessionStr));
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [currentRound, selectedGroup?.predictionLockOffsetMins, headerApiData]);

  // Analytics: track screen views and league entry.
  // These MUST live here (before any conditional returns) — hooks must be
  // called unconditionally on every render (Rules of Hooks).
  useEffect(() => {
    if (!selectedGroup) return;
    track('screen_view', { screen_name: currentView, league_id: selectedGroup.id });
  }, [currentView, selectedGroup?.id]);

  useEffect(() => {
    if (!selectedGroup) return;
    track('select_content', { content_type: 'league', item_id: selectedGroup.id, item_name: selectedGroup.name });
  }, [selectedGroup?.id]);

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
      track('login', { method: 'google' });
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setSelectedGroup(null);
  };

  const saveNicknameSetup = async (name) => {
    if (!user) return;
    const validation = validateNickname(name);
    if (!validation.valid) {
      setMessage(`⚠️ ${validation.error}`);
      setTimeout(() => setMessage(""), 4000);
      return;
    }
    await setDoc(doc(db, "users", user.uid), { nickname: validation.value }, { merge: true });
    setNickname(validation.value);
    setShowNicknameSetup(false);
  };

  const saveNickname = async () => {
    if (!user) return;
    const validation = validateNickname(nickname);
    if (!validation.valid) {
      setMessage(`⚠️ ${validation.error}`);
      setTimeout(() => setMessage(""), 4000);
      return;
    }
    try {
      const profileRef = doc(db, "users", user.uid);
      await setDoc(profileRef, { nickname: validation.value }, { merge: true });
      setNickname(validation.value);
      setShowSettings(false);
    } catch (error) {
      console.error("Error saving nickname:", error);
    }
  };

  const enablePushNotifications = async () => {
    if (!fcmSupported || !user) return;
    const messagingInstance = getMessagingInstance();
    if (!messagingInstance) return;
    setNotifStatus('requesting');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotifStatus('denied');
        return;
      }
      // Register the service worker first so FCM can use it
      const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await getToken(messagingInstance, {
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
    if (!user) return;
    const validation = validateGroupName(groupName);
    if (!validation.valid) {
      setMessage(`⚠️ ${validation.error}`);
      setTimeout(() => setMessage(""), 4000);
      return;
    }
    try {
      const groupId = `group_${Date.now()}`;
      const groupRef = doc(db, "groups", groupId);
      // FIX (Track B #7): was two independent writes, with currentOpenRound
      // set on the FIRST one — if the second (raceStatus) failed, the group
      // was left with currentOpenRound pointing at a raceStatus doc that
      // didn't exist, and isRaceOpen() would permanently block predictions
      // until manually repaired.
      //
      // Not a writeBatch here despite that being the fix everywhere else in
      // this pass — verified empirically it can't work for this specific
      // pair: the raceStatus write's rule requires isAdmin(groupId), which
      // reads the group doc's state as it exists *before* the batch
      // commits. Since the group is being created in the same batch, that
      // read sees no group yet and the raceStatus write is rejected
      // outright — a Firestore rules-evaluation constraint (writes within
      // one batch can't see each other via get()), not a mistake in how
      // the batch was called. Rollback via delete isn't an option either —
      // this rules file has `allow delete: if false` on groups, always.
      //
      // Reordered instead: currentOpenRound is only set as the LAST step,
      // once raceStatus/round1 is confirmed to exist. isRaceOpen() already
      // treats a *missing* currentOpenRound as legacy-open (allowed) — so
      // if anything fails partway, the group is left permissive rather
      // than blocked, never in the broken state the audit flagged.
      await setDoc(groupRef, {
        name: validation.value,
        admin: user.uid,
        members: [user.uid],
        createdTimestamp: serverTimestamp()
      });
      await setDoc(doc(db, `groups/${groupId}/raceStatus`, "round1"), {
        status: 'CURRENT',
        isPredictionOpen: true,
        openedAt: new Date().toISOString()
      });
      await updateDoc(groupRef, { currentOpenRound: "round1" });
      track('league_created', { league_name: groupName.trim() });
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
    try {
      if (!pendingInvite.alreadyMember) {
        // FIX (invite-security follow-up): this used to be a direct client
        // write (updateDoc + arrayUnion on the group, then a transaction +
        // manual retry loop to atomically increment the invite's
        // usedCount — see git history for why the retry loop was needed).
        // Both writes now happen inside the acceptInvite Cloud Function,
        // which runs with Admin SDK privileges: it verifies the invite
        // actually exists before adding anyone, and it bypasses security
        // rules entirely, so FieldValue.increment() is genuinely atomic at
        // the storage layer with no client-side retry logic needed. The
        // group-update rule no longer has any branch that permits a direct
        // client join at all, so this Cloud Function is the only path.
        const acceptInviteFn = httpsCallable(functions, 'acceptInvite');
        await acceptInviteFn({ code: pendingInvite.code });
        await loadUserGroups(user.uid);
      }

      track('invite_accepted', { league_id: pendingInvite.leagueId, league_name: pendingInvite.leagueName });
      setShowOnboarding(false);
      setPendingInvite(null);
    } catch (e) {
      console.error("Error accepting invite:", e);
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
    return <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-gray-600">Loading...</div>}><AdminWizard user={user} onComplete={completeOnboarding} /></Suspense>;
  }

  if (showNicknameSetup) {
    return <SetNicknameModal googleFirstName={googleFirstName} onSave={saveNicknameSetup} onSkip={() => setShowNicknameSetup(false)} message={message} />;
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
                {message && <p className="-mt-3 mb-5 text-sm text-yellow-400">{message}</p>}
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
                  {message && <p className="mt-2 text-sm text-yellow-400">{message}</p>}
                  <button onClick={saveNickname} className="mt-2 w-full bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl transition">Save Nickname</button>
                </div>

                {/* Push Notifications */}
                <div className="border-t border-gray-800 pt-5">
                  <p className="text-xs font-black text-gray-600 tracking-widest mb-3">PUSH NOTIFICATIONS</p>
                  {!fcmSupported ? (
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

      {!isOnline && (
        <div className="sticky top-0 z-[60] bg-yellow-500 px-4 py-2 text-center text-sm font-bold text-black">
          You're offline — showing last-synced data. Reconnect to submit predictions.
        </div>
      )}
      {updateAvailable && (
        <div className="sticky top-0 z-[60] flex items-center justify-center gap-3 bg-red-600 px-4 py-2 text-sm font-bold text-white">
          <span>Update available.</span>
          <button onClick={() => updateServiceWorker?.(true)} className="rounded bg-white px-3 py-1 text-xs font-black text-red-700">Tap to refresh</button>
        </div>
      )}

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
          <button onClick={() => setMobileMenuOpen((open) => !open)} className="lg:hidden p-2 text-gray-300 hover:text-white" aria-label="Toggle navigation menu">
            <Menu size={22} />
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className={`${mobileMenuOpen ? 'block' : 'hidden'} lg:block lg:col-span-1`}>
            <div className="bg-gray-950 border border-gray-800 rounded-2xl p-3 space-y-1">
              {[
                { view: "leaderboard", icon: <Trophy size={16} />, label: "Leaderboard" },
                { view: "predict",     icon: <BarChart3 size={16} />, label: "Predictions" },
                { view: "seasonBoard", icon: <span className="text-sm">⭐</span>, label: "Season Board" },
                { view: "howToPlay",   icon: <span className="text-sm">📖</span>, label: "How to Play" },
                { view: "calendar",    icon: <Calendar size={16} />, label: "Calendar" },
                { view: "results",     icon: <span className="text-sm">📊</span>, label: "Results" },
                { view: "stats",       icon: <BarChart3 size={16} />, label: "Stats" },
                { view: "news",        icon: <Newspaper size={16} />, label: "News" },
                { view: "invites",     icon: <Users size={16} />, label: "Invite" },
              ].map(({ view, icon, label }) => (
                <button
                  key={view}
                  onClick={() => { setCurrentView(view); setMobileMenuOpen(false); }}
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
                  onClick={() => { setCurrentView("audit"); setMobileMenuOpen(false); }}
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
            <Suspense fallback={<div className="py-20 flex items-center justify-center text-gray-600">Loading...</div>}>
            {currentView === "leaderboard" && <LeaderboardView group={selectedGroup} currentRound={currentRound} user={user} />}
            {currentView === "predict" && <PredictionView group={selectedGroup} race={race} currentRound={currentRound} countdown={countdown} user={user} />}
            {currentView === "calendar" && <CalendarView group={selectedGroup} user={user} currentRound={currentRound} />}
            {currentView === "seasonBoard" && <SeasonBoardView group={selectedGroup} user={user} />}
            {currentView === "howToPlay" && <HowToPlayView />}
            {currentView === "results" && <ResultsView group={selectedGroup} user={user} currentRound={currentRound} />}
            {currentView === "stats" && <StatsView series="f1" />}
            {currentView === "news" && <NewsView />}
            {currentView === "invites" && <InvitesView group={selectedGroup} user={user} generateInviteCode={generateInviteCode} inviteLink={inviteLink} inviteStats={inviteStats} onGroupUpdated={() => loadUserGroups(user.uid)} />}
            {currentView === "audit" && selectedGroup.admin === user.uid && <AuditView group={selectedGroup} />}
            </Suspense>
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
            {message && <p className="-mt-2 mb-4 text-sm text-yellow-400">{message}</p>}
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
            {[[String(F1_SCHEDULE_2026.length),'RACES'],['22','DRIVERS'],['6','SPRINT WKS']].map(([v,l]) => (
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
                <p className="text-gray-500 text-xs mb-6">Opens Monday of race week · Locks 1 hour before Qualifying. Submit 5 predictions:</p>
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
                <p className="text-gray-500 text-xs mb-6">Opens Monday of race week · Locks 1 hour before Sprint Qualifying. Submit 9 predictions:</p>
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
