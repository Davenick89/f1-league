import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, setDoc, onSnapshot, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Edit, Info, Lock, X } from 'lucide-react';
import { db, functions, F1_DRIVERS, formatLockTimeIST, getDisplayName, getPredictionLockTime, getPredictionOpenTime, getValidatedApiSessionStr, gridToFinishDeltas, summarizeDriverSeason, track, useF1ApiSchedule, useOnlineStatus, waitForServerAck } from './shared.js';
import { rfDistance, rfPoints, scoreRace } from './scoring.js';
import { validatePredictions } from './validation.js';

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
    note: 'A retiring driver still scores normally if they earned an official classified finish (most DNFs do). Only DNS (did not start) or NC (not classified — completed <90% of race distance) score 0. Ties split the +1 — only one player can earn +2.',
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

// Read-only, best-effort form guide. It deliberately owns no prediction
// state and never exposes a loading/error UI, so an unavailable stats cache
// leaves the prediction form exactly as it was.
function RaceInsightPanel({ series, currentRound }) {
  const [stats, setStats] = useState(null);
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [circuit, setCircuit] = useState(null);
  const [histories, setHistories] = useState({});

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'driverStats', series),
      (snapshot) => setStats(snapshot.exists() ? snapshot.data() : null),
      () => setStats(null),
    );
    return () => unsubscribe();
  }, [series]);

  // The current round is not in the completed-round cache, so obtain its
  // circuit from Jolpica's season schedule. Failure intentionally means no
  // track-history calls or line items; season facts remain available.
  useEffect(() => {
    if (!stats?.season) return undefined;
    let cancelled = false;
    setCircuit(null);
    fetch(`https://api.jolpi.ca/ergast/f1/${stats.season}.json?limit=100`)
      .then((response) => { if (!response.ok) throw new Error('Schedule unavailable'); return response.json(); })
      .then((data) => {
        const race = (data?.MRData?.RaceTable?.Races || []).find((entry) => Number(entry.round) === Number(currentRound));
        if (!cancelled && race?.Circuit?.circuitId) {
          setCircuit({ id: race.Circuit.circuitId, name: race.Circuit.circuitName });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [stats?.season, currentRound]);

  const rounds = stats?.rounds || [];
  const latestRound = rounds[rounds.length - 1];
  const driverDetails = new Map();
  rounds.forEach((round) => round.drivers?.forEach((driver) => {
    if (!driverDetails.has(driver.driverId)) driverDetails.set(driver.driverId, driver);
  }));
  const drivers = (latestRound?.driverStandings || []).slice(0, 8)
    .map((standing) => {
      const detail = driverDetails.get(standing.id);
      return detail && { id: standing.id, name: standing.name || detail.driverName, constructorId: detail.constructorId };
    })
    .filter(Boolean);
  const summary = summarizeDriverSeason(drivers, rounds);
  const movements = new Map(gridToFinishDeltas(summary, rounds).map((driver) => [driver.id, driver]));

  // Populate each driver independently as its cached/on-call result arrives.
  // A rejected call is intentionally indistinguishable from no history.
  useEffect(() => {
    if (!circuit?.id || !drivers.length) return undefined;
    let cancelled = false;
    setHistories({});
    const getHistory = httpsCallable(functions, 'getDriverCircuitHistory');
    drivers.forEach((driver) => {
      getHistory({ series, driverId: driver.id, circuitId: circuit.id })
        .then((result) => {
          if (!cancelled && result.data?.races?.length) {
            setHistories((current) => ({ ...current, [driver.id]: result.data }));
          }
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [series, circuit?.id, drivers.map((driver) => driver.id).join(',')]);

  if (!rounds.length || !drivers.length) return null;

  const historyFact = (history) => {
    if (!history?.races?.length) return null;
    const classified = history.races.filter((race) => Number.isFinite(race.position));
    const best = classified.reduce((bestRace, race) => !bestRace || race.position < bestRace.position ? race : bestRace, null);
    return best ? `best P${best.position} (${best.season}), ${history.races.length} starts` : `${history.races.length} starts`;
  };

  return (
    <section className="bg-gray-900 border border-blue-700/40 rounded-lg p-4 sm:p-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div>
          <h3 className="text-xl font-bold text-white">Race insight</h3>
          <p className="text-xs text-gray-500 mt-1">Season facts through round {latestRound.round}</p>
        </div>
        <span className={`text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`}>▼</span>
      </button>
      {open && (
        <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-3">
          {drivers.map((driver) => {
            const season = summary.find((entry) => entry.id === driver.id);
            const recentRounds = rounds.slice(-3);
            const recentPoints = recentRounds.reduce((total, round) => total + (round.drivers?.find((entry) => entry.driverId === driver.id)?.points || 0), 0);
            const seasonPoints = rounds.reduce((total, round) => total + (round.drivers?.find((entry) => entry.driverId === driver.id)?.points || 0), 0);
            const averagePoints = seasonPoints / rounds.length;
            const recentAverage = recentPoints / recentRounds.length;
            const formComparison = recentAverage > averagePoints ? 'above' : recentAverage < averagePoints ? 'below' : 'at';
            const grids = rounds.slice(-5).map((round) => round.drivers?.find((entry) => entry.driverId === driver.id)?.grid).filter(Number.isFinite);
            const movement = movements.get(driver.id);
            const trackFact = historyFact(histories[driver.id]);
            return (
              <article key={driver.id} className="rounded-lg bg-black/25 border border-gray-800 p-4">
                <h4 className="font-bold text-white">{driver.name}</h4>
                <ul className="mt-2 space-y-1 text-sm text-gray-300">
                  <li>{recentPoints} pts in last {recentRounds.length} rounds ({formComparison} season avg {averagePoints.toFixed(1)}/round)</li>
                  {grids.length > 0 && <li>Avg grid P{(grids.reduce((total, grid) => total + grid, 0) / grids.length).toFixed(1)} over last {grids.length} rounds</li>}
                  <li>{season.wins} wins · {season.podiums} podiums · {season.dnfs} DNFs this season</li>
                  {movement && <li>Grid-to-finish movement: {movement.average > 0 ? '+' : ''}{movement.average.toFixed(1)} avg / classified race</li>}
                  {trackFact && <li>{circuit.name}: {trackFact}</li>}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// PREDICTION VIEW - COMPLETE REBUILD
function PredictionView({ group, race, currentRound, countdown, user }) {
  const isOnline = useOnlineStatus();
  const isOffline = !isOnline;
  const { apiData } = useF1ApiSchedule(2026);
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
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [helpField, setHelpField] = useState(null);
  const [userHasPredictions, setUserHasPredictions] = useState(false);
  const [allPredictions, setAllPredictions] = useState([]);
  const [allResults, setAllResults] = useState(null);
  const [memberNicknames, setMemberNicknames] = useState({});
  const [raceStatus, setRaceStatus] = useState(null);
  const [overrideSecsLeft, setOverrideSecsLeft] = useState(null);

  const isAdmin = group?.admin === user?.uid;

  // Subscribe to raceStatus — used to let admin override the time-based lock
  useEffect(() => {
    if (!group) return;
    const unsub = onSnapshot(
      doc(db, `groups/${group.id}/raceStatus`, `round${currentRound}`),
      (snap) => setRaceStatus(snap.exists() ? snap.data() : {})
    );
    return () => unsub();
  }, [group, currentRound]);

  const OVERRIDE_WINDOW_MINS = 15;

  // Live countdown for the override window + auto-lock when it expires
  useEffect(() => {
    const expiresRaw = raceStatus?.overrideExpiresAt;
    if (!raceStatus?.isPredictionOpen || !expiresRaw) {
      setOverrideSecsLeft(null);
      return;
    }
    const expiresMs = expiresRaw?.toDate ? expiresRaw.toDate().getTime() : new Date(expiresRaw).getTime();

    const tick = async () => {
      const secsLeft = Math.max(0, Math.round((expiresMs - Date.now()) / 1000));
      setOverrideSecsLeft(secsLeft);
      if (secsLeft === 0 && isAdmin) {
        // Auto-lock Firestore when the window expires — only the admin writes it
        try {
          await setDoc(doc(db, `groups/${group.id}/raceStatus`, `round${currentRound}`), {
            isPredictionOpen: false,
            autoLockedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (err) {
          console.error("Auto-lock failed:", err);
        }
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [raceStatus?.isPredictionOpen, raceStatus?.overrideExpiresAt, isAdmin, group, currentRound]);

  const handleUnlockPredictions = async () => {
    try {
      const nowIso = new Date().toISOString();
      const expiresAt = Timestamp.fromDate(new Date(Date.now() + OVERRIDE_WINDOW_MINS * 60 * 1000));
      // FIX (Track B #7): was three independent writes — a failure between
      // the raceStatus write and the currentOpenRound write left the UI
      // showing an open round while rules still enforced the old one.
      // Batched so all three land together or none do.
      const batch = writeBatch(db);
      batch.set(doc(db, `groups/${group.id}/raceStatus`, `round${currentRound}`), {
        status: 'CURRENT',
        isPredictionOpen: true,
        openedAt: nowIso,
        openedManuallyBy: user.uid,
        overrideExpiresAt: expiresAt,   // enforced by Firestore rule + frontend countdown
      }, { merge: true });
      batch.update(doc(db, "groups", group.id), {
        currentOpenRound: `round${currentRound}`,
      });
      // Audit: log admin unlock so there's a full record of when predictions were re-opened
      batch.set(doc(collection(db, `groups/${group.id}/auditLog`)), {
        userId: user.uid,
        nickname: user.displayName || user.email || user.uid,
        round: currentRound,
        raceName: race?.name || `Round ${currentRound}`,
        action: "admin_unlock",
        timestamp: serverTimestamp(),
        timestampIso: nowIso,
      });
      await batch.commit();
      setMessage("✅ Predictions opened");
      setTimeout(() => setMessage(""), 4000);
    } catch (err) {
      console.error("Unlock error:", err);
      setMessage("❌ Error unlocking");
    }
  };

  const handleLockPredictions = async () => {
    try {
      await setDoc(doc(db, `groups/${group.id}/raceStatus`, `round${currentRound}`), {
        isPredictionOpen: false,
        lockedAt: new Date().toISOString(),
        lockedManuallyBy: user.uid
      }, { merge: true });
      setMessage("🔒 Predictions locked");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error("Lock error:", err);
      setMessage("❌ Error locking");
    }
  };

  // Load member nicknames first
  useEffect(() => {
    if (!group) return;

    const loadNicknames = async () => {
      const nicknames = {};
      await Promise.all((group.members || []).map(async memberId => {
        try {
          const predDoc = await getDoc(doc(db, `groups/${group.id}/predictions`, memberId));
          nicknames[memberId] = predDoc.data()?.nickname || "?";
        } catch {
          nicknames[memberId] = "?";
        }
      }));
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
    if (isOffline) {
      setMessage('Reconnect to submit predictions');
      return;
    }
    try {
      const validation = validatePredictions(predictions, !!race?.isSprint);
      if (!validation.valid) {
        setMessage(`⚠️ ${validation.errors[0]}`);
        setTimeout(() => setMessage(""), 4000);
        return;
      }

      if (!randomNumber) {
        setMessage("⚠️ Need random number first");
        setTimeout(() => setMessage(""), 3000);
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      const userNickname = getDisplayName(userDoc.data()?.nickname, userDoc.data()?.googleFirstName, userDoc.data()?.email);

      const predRef = doc(db, `groups/${group.id}/predictions`, user.uid);
      setIsSaving(true);
      setMessage("⏳ Saving...");
      await setDoc(predRef, {
        nickname: userNickname,
        [`round${currentRound}`]: {
          ...predictions,
          lastEditTime: new Date().toISOString(),
          createdAt: serverTimestamp()
        }
      }, { merge: true });

      // FIX (post-Track-D audit): setDoc() above resolves as soon as the
      // write is durably queued to persistentLocalCache(), not once the
      // server has it — on a device that's "online" per navigator.onLine but
      // whose Firestore connection is actually dead (captive portal,
      // degraded uplink), that meant this code declared success for a write
      // that could still be silently rejected later by firestore.rules if it
      // doesn't sync until after the round locks. Wait for server
      // confirmation (or a timeout) before telling the player it's saved.
      const confirmed = await waitForServerAck(predRef);

      // Audit trail — distinguish first submission from subsequent edits
      const raceName = race?.name || `Round ${currentRound}`;
      await setDoc(doc(collection(db, `groups/${group.id}/auditLog`)), {
        userId: user.uid,
        nickname: userNickname,
        round: currentRound,
        raceName,
        action: userHasPredictions ? "prediction_edit" : "prediction_submit",
        predictions: { ...predictions },
        timestamp: serverTimestamp(),
        timestampIso: new Date().toISOString(),
      });

      track('prediction_made', {
        race_name: race?.name || `Round ${currentRound}`,
        round: currentRound,
        is_sprint: !!race?.isSprint,
        league_id: group.id,
      });
      setUserHasPredictions(true);
      setIsEditing(false);
      setIsSaving(false);
      if (confirmed) {
        setMessage("✅ Predictions saved!");
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage("⚠️ Saved on this device, but couldn't confirm with the server — check your connection. It will sync once you're back online, but won't count if the round locks first.");
        setTimeout(() => setMessage(""), 8000);
      }
    } catch (error) {
      console.error("Error:", error);
      setIsSaving(false);
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
        // DNS (did not start) / NC (not classified — <90% race distance, no official
        // position) score 0. A DNF that still earned an official classified position
        // (e.g. "Retired, Classified P14") is entered as that position and scored normally.
        if (posStr === "DNS" || posStr === "NC") return Infinity;
        const pos = parseInt(posStr.replace("P", ""), 10);
        return isNaN(pos) || !randomNumber ? Infinity : Math.abs(pos - randomNumber);
      }
      return Infinity; // no finish position data — 0 pts (F1_GRID_ORDER fallback removed)
    };
    const distances = allPredictions.map(getRfDistanceForPlayer).filter(d => d !== Infinity);
    const minDistance = distances.length > 0 ? Math.min(...distances) : Infinity;
    const myDistance = getRfDistanceForPlayer(pred);
    if (myDistance === minDistance && myDistance !== Infinity) {
      points += myDistance === 0 ? 2 : 1;
    }

    return points;
  };

  // ── Lock logic ──────────────────────────────────────────────────────────
  // Prefer Jolpica API qualifying time over hardcoded — more accurate for the
  // actual 2026 schedule. getValidatedApiSessionStr applies a 10-day sanity
  // check to catch round-number mismatches (e.g. a cancelled/rescheduled race).
  const lockOffsetMins = group?.predictionLockOffsetMins ?? 60;
  const validatedApiSessionStr = getValidatedApiSessionStr(race, apiData?.[currentRound]);
  const lockTime = getPredictionLockTime(race, lockOffsetMins, validatedApiSessionStr);
  const timeLocked = lockTime ? Date.now() >= lockTime.getTime() : false;
  const adminOverrideOpen = raceStatus?.isPredictionOpen === true;
  const adminForcedLock = raceStatus?.isPredictionOpen === false;
  // Override window: if overrideExpiresAt is set, the override expires when the countdown hits 0
  const overrideWindowActive = adminOverrideOpen && overrideSecsLeft !== null;
  const overrideWindowExpired = overrideWindowActive && overrideSecsLeft <= 0;
  const effectiveAdminOverrideOpen = adminOverrideOpen && !overrideWindowExpired;
  const editLocked = adminForcedLock || overrideWindowExpired || (timeLocked && !effectiveAdminOverrideOpen);

  // Predictions open on Monday of race week. Before that, the form is visible but saving is blocked.
  const predOpenTime = getPredictionOpenTime(race);
  const isNotYetOpen = predOpenTime && !adminOverrideOpen
    ? Date.now() < predOpenTime.getTime()
    : false;

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

      <RaceInsightPanel series="f1" currentRound={currentRound} />

      {/* Predictions Form */}
      <div className="bg-gray-900 border border-red-600/50 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">YOUR PREDICTIONS</h3>
          {userHasPredictions && !editLocked && (
            <button onClick={() => setIsEditing(!isEditing)} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm font-bold flex items-center gap-2">
              <Edit size={16} /> {isEditing ? "Cancel" : "Edit"}
            </button>
          )}
          {editLocked && (
            <div className="px-3 py-1 bg-gray-700 rounded text-sm font-bold flex items-center gap-2 text-gray-400">
              <Lock size={14} /> LOCKED
            </div>
          )}
        </div>

        {/* ── Pre-open banner: before Monday of race week ── */}
        {isNotYetOpen && (
          <div className="flex items-center gap-3 bg-gray-800/80 border border-gray-600/50 rounded-lg px-4 py-3 mb-5">
            <span className="text-xl shrink-0">🗓️</span>
            <div className="flex-1">
              <p className="text-gray-300 font-bold text-sm tracking-wide">PREDICTIONS NOT YET OPEN</p>
              <p className="text-gray-500 text-xs mt-0.5">
                Opens{' '}
                <span className="text-gray-200 font-semibold">
                  {predOpenTime
                    ? predOpenTime.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
                    : 'Monday of race week'}
                </span>{' '}— you can fill in your picks now but won't be able to save until then.
              </p>
            </div>
          </div>
        )}

        {/* ── Prediction status banner — always visible ── */}
        {raceStatus !== null && !isNotYetOpen && (
          editLocked ? (
            <div className="flex items-center gap-3 bg-red-950/60 border border-red-700/50 rounded-lg px-4 py-3 mb-5">
              <Lock size={16} className="text-red-400 shrink-0" />
              <div className="flex-1">
                <p className="text-red-400 font-bold text-sm tracking-wide">PREDICTIONS LOCKED</p>
                <p className="text-red-300/70 text-xs mt-0.5">
                  {adminForcedLock
                    ? "Locked by admin — contact the league admin if you need access."
                    : "The prediction window for this race has closed."}
                </p>
              </div>
              {isAdmin && (
                <button
                  onClick={handleUnlockPredictions}
                  className="shrink-0 px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-xs font-bold text-white transition-colors"
                >
                  🔓 Unlock
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-green-950/50 border border-green-700/40 rounded-lg px-4 py-3 mb-5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shrink-0" />
              <div className="flex-1">
                <p className="text-green-400 font-bold text-sm tracking-wide">PREDICTIONS OPEN</p>
                <p className="text-green-300/60 text-xs mt-0.5">
                  {overrideWindowActive ? (
                    <>
                      Override window —{' '}
                      <span className="text-yellow-300 font-bold">
                        {Math.floor(overrideSecsLeft / 60)}:{String(overrideSecsLeft % 60).padStart(2, '0')} remaining
                      </span>
                      {' '}then auto-locks
                    </>
                  ) : lockTime ? (
                    <>Cut-off: <span className="text-green-200 font-semibold">{formatLockTimeIST(lockTime)}</span></>
                  ) : (
                    "Submit before the lock time."
                  )}
                </p>
              </div>
              {isAdmin && timeLocked && !overrideWindowActive && (
                <button
                  onClick={handleLockPredictions}
                  className="shrink-0 px-3 py-1 bg-red-800 hover:bg-red-700 rounded text-xs font-bold text-white transition-colors"
                >
                  🔒 Lock
                </button>
              )}
            </div>
          )
        )}

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
            <button
              onClick={handleSavePredictions}
              disabled={isNotYetOpen || isOffline || isSaving}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
            >
              {isNotYetOpen ? '🗓️ Opens Monday' : isOffline ? 'RECONNECT TO SUBMIT PREDICTIONS' : isSaving ? 'SAVING...' : 'SAVE PREDICTIONS'}
            </button>
            {isOffline && <p className="text-center text-sm mt-3 text-yellow-400">Reconnect to submit predictions</p>}
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

          // FIX (Track B #12): this table used to reimplement scoreRace()'s
          // exact-match logic and rfPoints()'s R# bonus logic inline,
          // separately from the canonical versions in scoring.js that
          // calculateAndSaveScores() actually uses to save leaderboard
          // points. The two could silently drift — e.g. this duplicate
          // never checked p.finisherPosition (whether the player predicted
          // anything at all) before computing a distance, unlike the real
          // rfDistance(). Now calls the same functions the save path uses,
          // so what's displayed here is guaranteed to match saved scores.
          const getDist = (p) => rfDistance(p.userId, p.finisherPosition, allResults?.rPredFinishPositions, randomNumber);
          const allDists = allPredictions.map(getDist).filter(d => d !== Infinity);
          const minDist = allDists.length > 0 ? Math.min(...allDists) : Infinity;

          const getBreakdown = (p) => {
            if (!allResults) return {};
            const { breakdown } = scoreRace(p, allResults, race.isSprint);
            breakdown.randomFinisher = rfPoints(getDist(p), minDist);
            return breakdown;
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
export default PredictionView;
