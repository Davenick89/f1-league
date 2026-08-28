import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { Edit, Lock } from 'lucide-react';
import { db, F1_DRIVERS, F1_SCHEDULE_2026, saveRoundScores, useF1ApiSchedule } from './shared.js';

// LIVE INCIDENT (2026-08-27): both handleManualOpenPredictions and
// handleEndWeekend let admin act on ANY round via the selectedRound
// dropdown — including reviewing/backfilling old, already-finished
// rounds — and both unconditionally repointed the group's live
// currentOpenRound to that round. Backfilling round 7 after the season
// had already progressed to round 13 silently regressed the pointer
// backward, and firestore.rules' isRaceOpen() only ever checks the round
// currentOpenRound names — so real players were locked out of the
// actual current round's predictions until the pointer was manually
// corrected. This guard makes the pointer monotonic: it only ever moves
// to a round number >= wherever it already points, never backward.
// Equal is allowed (e.g. re-running the manual-open catch-up action for
// the same round auto-open already opened is a harmless no-op).
function isSafeToAdvancePointer(currentPointer, candidateRoundNum) {
  if (!currentPointer) return true; // legacy/unset group — always safe
  const currentNum = parseInt(currentPointer.replace('round', ''), 10);
  return !Number.isFinite(currentNum) || candidateRoundNum >= currentNum;
}

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

function ResultsView({ group, user, currentRound }) {
  // Default to the last completed race (currentRound - 1), not the upcoming race.
  // currentRound points at the NEXT race to predict; results are for the one just finished.
  const [selectedRound, setSelectedRound] = useState(() => Math.max(1, currentRound - 1));
  const race = F1_SCHEDULE_2026[selectedRound - 1];
  const { apiData, apiStatus } = useF1ApiSchedule(2026);

  // Merge: API times win, hardcoded as fallback.
  // IMPORTANT: validate API date against hardcoded before trusting it.
  // The Jolpica API uses the real-world 2026 calendar round numbers, which can
  // diverge from our hardcoded numbers if races are cancelled or rescheduled
  // mid-season. If the API's raceStart differs from hardcoded by more than 3
  // days, the round numbers have shifted — discard the API data for this round
  // and fall back to hardcoded so the 24-hour lock calculates correctly.
  // (Tightened from 10 to 3 days, session 2026-08-06 — see
  // getValidatedApiSessionStr in shared.js for why 10 days was unsafe.)
  const apiRound = apiData?.[selectedRound];
  const _hardcodedMs = race?.raceStart ? new Date(race.raceStart).getTime() : null;
  const _apiMs = apiRound?.raceStart ? new Date(apiRound.raceStart).getTime() : null;
  const apiRoundValid = _hardcodedMs && _apiMs
    ? Math.abs(_apiMs - _hardcodedMs) < 3 * 24 * 60 * 60 * 1000
    : false;
  const raceStartStr = (apiRoundValid ? apiRound?.raceStart : null) ?? race?.raceStart ?? null;
  const sprintStartStr = apiRoundValid ? (apiRound?.sprintStart ?? null) : null;
  const sprintQualifyingStartStr = apiRoundValid ? (apiRound?.sprintQualifyingStart ?? null) : null;
  const usingApiData = apiStatus === 'ok' && apiRoundValid && apiRound?.raceStart != null;
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
  const [raceStatus, setRaceStatus] = useState(null);

  // Subscribe to raceStatus for selected round (drives the manual-open button)
  useEffect(() => {
    if (!group) return;
    setRaceStatus(null);
    const unsub = onSnapshot(
      doc(db, `groups/${group.id}/raceStatus`, `round${selectedRound}`),
      (snap) => setRaceStatus(snap.exists() ? snap.data() : {})
    );
    return () => unsub();
  }, [group, selectedRound]);

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
    // Hard lock guard — re-check at save time (admin override bypasses this, same as isLocked)
    if (lockTimeMs !== null && Date.now() > lockTimeMs && !adminResultsOverride) {
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
      const predictionsSnapshot = await getDocs(
        collection(db, `groups/${group.id}/predictions`)
      );
      const playerEntries = predictionsSnapshot.docs.map((predDoc) => ({
        userId: predDoc.id,
        roundData: predDoc.data()[`round${selectedRound}`],
      }));
      await saveRoundScores({
        db, groupId: group.id, roundNum: selectedRound, playerEntries,
        results, randomNumber, isSprint: race.isSprint,
      });
    } catch (error) {
      console.error("Error calculating scores:", error);
      throw error;
    }
  };

  const handleResultsOverride = async (unlock) => {
    try {
      await setDoc(doc(db, `groups/${group.id}/raceStatus`, `round${selectedRound}`), {
        resultsEditOverride: unlock,
        resultsOverrideAt: new Date().toISOString(),
        resultsOverrideBy: user.uid
      }, { merge: true });
      setMessage(unlock ? "🔓 Results unlocked — you can now edit and save." : "🔒 Results re-locked.");
      setTimeout(() => setMessage(""), 4000);
    } catch (err) {
      console.error("Results override error:", err);
      setMessage("❌ Error updating lock");
    }
  };

  const handleManualOpenPredictions = async () => {
    setLoading(true);
    try {
      const groupSnap = await getDoc(doc(db, "groups", group.id));
      const currentPointer = groupSnap.data()?.currentOpenRound;
      const pointerSafe = isSafeToAdvancePointer(currentPointer, selectedRound);

      // FIX (Track B #7): batched — same reasoning as handleUnlockPredictions.
      const batch = writeBatch(db);
      batch.set(doc(db, `groups/${group.id}/raceStatus`, `round${selectedRound}`), {
        status: 'CURRENT',
        isPredictionOpen: true,
        openedAt: new Date().toISOString(),
        openedManuallyBy: user.uid
      }, { merge: true });
      if (pointerSafe) {
        batch.update(doc(db, "groups", group.id), { currentOpenRound: `round${selectedRound}` });
      }
      await batch.commit();
      setMessage(pointerSafe
        ? `✅ Predictions opened for Round ${selectedRound} — ${race?.name}`
        : `✅ Round ${selectedRound} reopened for review — did NOT move the live round pointer (currently ahead, at ${currentPointer}).`);
      setTimeout(() => setMessage(""), pointerSafe ? 4000 : 7000);
    } catch (err) {
      console.error("Error opening predictions:", err);
      setMessage("❌ Error opening predictions");
    } finally {
      setLoading(false);
    }
  };

  const handleEndWeekend = async () => {
    setShowEndConfirm(false);
    setLoading(true);
    try {
      const nextRound = selectedRound + 1;
      const statusRef = (round) => doc(db, `groups/${group.id}/raceStatus`, `round${round}`);

      const groupSnap = await getDoc(doc(db, "groups", group.id));
      const currentPointer = groupSnap.data()?.currentOpenRound;
      const pointerSafe = isSafeToAdvancePointer(currentPointer, nextRound);

      // FIX (Track B #7): was up to four independent writes — a failure
      // partway through (e.g. after closing the current round but before
      // updating currentOpenRound) left the group pointing at a closed
      // round, blocking every player. Batched: all writes land together.
      const batch = writeBatch(db);
      batch.set(statusRef(selectedRound), {
        status: 'PAST',
        isClosed: true,
        isPredictionOpen: false,  // explicit — isRaceOpen() must return false for this round
        closedAt: new Date().toISOString(),
        closedBy: user.uid
      }, { merge: true });

      if (nextRound <= F1_SCHEDULE_2026.length) {
        batch.set(statusRef(nextRound), {
          status: 'CURRENT',
          isPredictionOpen: true,
          openedAt: new Date().toISOString()
        }, { merge: true });
        // Update group's currentOpenRound so isRaceOpen() points at the right
        // document — but only moving forward; see isSafeToAdvancePointer.
        if (pointerSafe) {
          batch.update(doc(db, "groups", group.id), { currentOpenRound: `round${nextRound}` });
        }
      }

      // Log the event
      batch.set(doc(db, `groups/${group.id}/systemLogs`, `endWeekend_${selectedRound}_${Date.now()}`), {
        event: 'END_WEEKEND',
        closedRound: selectedRound,
        openedRound: nextRound <= F1_SCHEDULE_2026.length ? nextRound : null,
        pointerAdvanced: nextRound <= F1_SCHEDULE_2026.length && pointerSafe,
        triggeredBy: user.uid,
        timestamp: new Date().toISOString()
      });

      await batch.commit();

      const nextRaceName = nextRound <= F1_SCHEDULE_2026.length ? F1_SCHEDULE_2026[nextRound - 1]?.name : null;
      const nextMsg = !nextRaceName ? " Season complete!"
        : pointerSafe ? ` ${nextRaceName} (R${nextRound}) is now open!`
        : ` ${nextRaceName} (R${nextRound}) results saved — did NOT move the live round pointer (currently ahead, at ${currentPointer}).`;
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
  // Admin can override via resultsEditOverride on raceStatus (persisted in Firestore).
  const lockTimeMs = raceStartStr
    ? new Date(raceStartStr).getTime() + 24 * 60 * 60 * 1000
    : null;
  const lockTime = lockTimeMs ? new Date(lockTimeMs) : null;
  const adminResultsOverride = raceStatus?.resultsEditOverride === true;
  const isLocked = (lockTimeMs !== null ? nowTs > lockTimeMs : false) && !adminResultsOverride;
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

        {/* ── Results lock/edit status banner (always shown to admin) ── */}
        {isAdmin && lockTime && (
          isLocked ? (
            <div className="flex items-start gap-3 bg-red-950/60 border border-red-700/50 p-4 rounded mb-5">
              <Lock size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-400 font-bold text-sm">RESULTS LOCKED</p>
                <p className="text-red-300/70 text-xs mt-0.5">
                  {adminResultsOverride
                    ? "Override active — editing is allowed despite the 24-hour window closing."
                    : `24-hour edit window closed on ${formatUTC(lockTime)}.`}
                </p>
              </div>
              <button
                onClick={() => handleResultsOverride(true)}
                disabled={loading}
                className="shrink-0 px-3 py-1 bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-600 text-white text-xs font-bold rounded transition-colors"
              >
                🔓 Override
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-3 bg-green-950/50 border border-green-700/40 p-4 rounded mb-5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shrink-0 mt-1" />
              <div className="flex-1">
                <p className="text-green-400 font-bold text-sm">
                  RESULTS EDITABLE{adminResultsOverride ? ' — OVERRIDE ACTIVE' : ''}
                </p>
                <p className="text-green-300/60 text-xs mt-0.5">
                  {adminResultsOverride
                    ? "Manually unlocked. Re-lock when done to prevent accidental edits."
                    : `Edit window closes ${formatUTC(lockTime)} (${msUntilLock > 0 ? `${hoursUntilLock}h ${minutesUntilLock}m remaining` : 'closing soon'})`}
                </p>
              </div>
              {adminResultsOverride && (
                <button
                  onClick={() => handleResultsOverride(false)}
                  disabled={loading}
                  className="shrink-0 px-3 py-1 bg-red-800 hover:bg-red-700 disabled:bg-gray-600 text-white text-xs font-bold rounded transition-colors"
                >
                  🔒 Re-lock
                </button>
              )}
            </div>
          )
        )}

        {selectedRound < currentRound - 1 && !isLocked && isAdmin && (
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
            {/* Manual open predictions — shown when predictions are currently closed for this round */}
            {raceStatus !== null && raceStatus.isPredictionOpen !== true && raceStatus.isClosed !== true && (
              <div className="bg-green-950 border border-green-600/60 p-4 rounded mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-green-400 font-bold text-sm mb-1">🟢 OPEN PREDICTIONS MANUALLY</p>
                  <p className="text-green-200 text-xs">Predictions for Round {selectedRound} ({race?.name}) are currently closed. Use this to open them manually — useful when auto-open fires at odd hours.</p>
                </div>
                <button
                  onClick={handleManualOpenPredictions}
                  disabled={loading}
                  className="shrink-0 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  Open Now
                </button>
              </div>
            )}

            {!isLocked && (
              <div className="bg-blue-900/30 border border-blue-600/50 p-4 rounded mb-6">
                <p className="text-blue-300 font-bold mb-2">🔐 ADMIN MODE</p>
                <p className="text-sm text-blue-200">You can enter race results. Points will calculate automatically for all players.</p>
              </div>
            )}
            {isLocked && (
              <div className="bg-gray-800 border border-gray-700 p-4 rounded mb-6">
                <p className="text-gray-400 font-bold mb-1">🔒 VIEW ONLY</p>
                <p className="text-sm text-gray-500">Results editing locked. Use the Override button above to make changes.</p>
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
                  <p className="text-xs text-gray-500 mb-2">
                    If fewer than {randomNumber} cars were classified (e.g. a high-attrition race), there's no driver at this position — select <span className="text-white font-semibold">Not Classified</span> instead.
                  </p>
                  <select
                    value={results.finisherAtPosition}
                    onChange={(e) => setResults({ ...results, finisherAtPosition: e.target.value })}
                    disabled={isLocked}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select Driver</option>
                    {F1_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                    <option value="NC">Not Classified — fewer than {randomNumber} cars finished</option>
                  </select>
                </div>
              )}

              {randomNumber && roundPredictions.length > 0 && (
                <div className="border border-purple-600/50 rounded-lg p-4 bg-purple-900/10">
                  <p className="text-xs font-bold text-purple-400 mb-1 tracking-wide">🎲 R# PREDICTIONS — ACTUAL FINISHING POSITIONS</p>
                  <p className="text-xs text-gray-400 mb-3">
                    Where did each player's predicted driver actually finish? <span className="text-purple-300 font-semibold">If they retired but still earned an official classified position</span> (e.g. "Retired, Classified P14" — completed ≥90% of race distance), enter that position number — it scores normally against R#. Only use <span className="text-white font-semibold">DNS</span> (did not start) or <span className="text-white font-semibold">NC</span> (not classified — completed &lt;90% distance, no official position) when there's truly no finishing position. Scoring: exact P{randomNumber} = +2, closest = +1, DNS/NC = 0.
                  </p>
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
                          <option value="DNS">DNS — Did Not Start</option>
                          <option value="NC">NC — Not Classified</option>
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
                    This will close Round {selectedRound} ({race?.name}) and open Round {selectedRound + 1}{selectedRound + 1 <= F1_SCHEDULE_2026.length ? ` (${F1_SCHEDULE_2026[selectedRound]?.name})` : ""} for predictions.
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

// LEAGUE SETTINGS CARD — admin only, rendered inside InvitesView
export default ResultsView;
