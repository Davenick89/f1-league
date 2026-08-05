import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db, F1_SCHEDULE_2026, getPredictionLockTime, getTimeUntilLock, isEditLocked } from './shared.js';
import { rfDistance, rfPoints, scoreRace } from './scoring.js';

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
        (group.members || []).forEach(memberId => {
          nicknames[memberId] = predsMap[memberId]?.nickname || "?";
        });
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
      const raceRandomNumber = randSnap.exists() ? randSnap.data().number : null;
      const roundKey = `round${race.round}`;
      let saved = 0;

      // First pass: collect player data and compute R# distances
      const playerEntries = Object.entries(allPredictions)
        .map(([uid, predData]) => {
          const roundData = predData[roundKey];
          if (!roundData) return null;
          const distance = rfDistance(uid, roundData.finisherPosition, raceResults.rPredFinishPositions, raceRandomNumber);
          return { uid, roundData, distance };
        })
        .filter(Boolean);

      // Determine closest distance for competitive R# bonus
      const validDistances = playerEntries.filter(p => p.distance !== Infinity).map(p => p.distance);
      const minDistance = validDistances.length > 0 ? Math.min(...validDistances) : Infinity;

      // Second pass: calculate and save scores
      for (const { uid, roundData, distance } of playerEntries) {
        const { totalPoints, breakdown } = scoreRace(roundData, raceResults, race.isSprint);
        const rfPts = rfPoints(distance, minDistance);
        breakdown.randomFinisher = rfPts;
        const scoresRef = doc(db, `groups/${group.id}/scores`, uid);
        await setDoc(scoresRef, { [roundKey]: { totalPoints: totalPoints + rfPts, breakdown } }, { merge: true });
        saved++;
      }

      // FIX (Track C #15): this is a second, independent score-writing path
      // (the "Recalculate" admin feature) from the one in ResultsView.jsx's
      // calculateAndSaveScores — keeping GroupStandingBadge's summary doc
      // fresh means both paths need to update it, or recalculating here
      // would silently leave the summary stale after the next results save
      // reads it. See ResultsView.jsx for the fuller explanation.
      const freshScoresSnap = await getDocs(collection(db, `groups/${group.id}/scores`));
      const totals = freshScoresSnap.docs
        .filter(d => d.id !== 'summary')
        .map(d => {
          let pts = 0;
          for (let i = 1; i <= 24; i++) pts += d.data()[`round${i}`]?.totalPoints || 0;
          return { userId: d.id, totalPoints: pts };
        })
        .sort((a, b) => b.totalPoints - a.totalPoints);
      const summary = {};
      totals.forEach((p, i) => { summary[p.userId] = { totalPoints: p.totalPoints, rank: i + 1 }; });
      await setDoc(doc(db, `groups/${group.id}/scores`, 'summary'), {
        players: summary,
        updatedAt: new Date().toISOString(),
      });

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
                  <span className="text-white font-semibold">
                    {raceResults.finisherAtPosition === 'NC' ? 'Not Classified' : (raceResults.finisherAtPosition || "—")}
                  </span>
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
    const offsetMins = group?.predictionLockOffsetMins ?? 60;
    const locked = isEditLocked(race, offsetMins);
    const offsetLabel = offsetMins >= 60 ? `${offsetMins / 60}h` : `${offsetMins}min`;
    return (
      <div className="mt-3 pt-3 border-t border-gray-700">
        {locked ? (
          <div className="bg-orange-900/30 border border-orange-600/50 rounded p-3 text-center">
            <p className="text-orange-400 font-bold text-sm">🔒 Predictions Locked — Race Underway</p>
          </div>
        ) : (
          <div className="bg-green-900/30 border border-green-600/50 rounded p-3 space-y-1">
            <p className="text-green-400 font-bold text-sm">🟢 Open for Predictions</p>
            <p className="text-xs text-gray-300">Locks in: <span className="text-red-400 font-bold">{currentCountdown}</span></p>
            <p className="text-xs text-gray-500">{offsetLabel} before {race.isSprint ? 'Sprint Qualifying' : 'Qualifying'} — go to Predictions tab to submit</p>
          </div>
        )}
      </div>
    );
  };

  const renderUpcomingDetails = (race) => {
    const offsetMins = group?.predictionLockOffsetMins ?? 60;
    const lockTime = getPredictionLockTime(race, offsetMins);
    const fmtOpts = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
    const offsetLabel = offsetMins >= 60 ? `${offsetMins / 60}h` : `${offsetMins}min`;
    const lockLabel = race.isSprint ? `${offsetLabel} before Sprint Qualifying` : `${offsetLabel} before Qualifying`;
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
export default CalendarView;
