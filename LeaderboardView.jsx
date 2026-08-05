import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { X } from 'lucide-react';
import { db, F1_SCHEDULE_2026 } from './shared.js';

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
            const rawActual = results[scoreKey === 'randomFinisher' ? 'finisherAtPosition' : key];
            const actual = rawActual === 'NC' ? 'Not Classified' : rawActual;
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
          // Read nickname from predictions doc (readable by all members) instead of
          // users doc (restricted to own doc only after FIX 2)
          let nickname = "?";
          try {
            const predDoc = await getDoc(doc(db, `groups/${group.id}/predictions`, scoreDoc.id));
            nickname = predDoc.data()?.nickname || "?";
          } catch {
            // Leave as "?"
          }
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
export default LeaderboardView;
