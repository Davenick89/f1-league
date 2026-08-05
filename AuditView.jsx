import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, F1_SCHEDULE_2026 } from './shared.js';

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
                  {/* Action badge */}
                  <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${
                    entry.action === 'prediction_submit' ? 'bg-green-900/60 text-green-400' :
                    entry.action === 'prediction_edit'   ? 'bg-blue-900/60 text-blue-400' :
                    entry.action === 'admin_unlock'      ? 'bg-yellow-900/60 text-yellow-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {entry.action === 'prediction_submit' ? '✅ Submit' :
                     entry.action === 'prediction_edit'   ? '✏️ Edit' :
                     entry.action === 'admin_unlock'      ? '🔓 Unlock' :
                     entry.action || 'Save'}
                  </span>
                  <span className="text-gray-400 text-xs shrink-0 hidden sm:block">{entry.raceName}</span>
                  <span className="text-yellow-300 text-xs shrink-0 ml-2">{fmt(entry.timestampIso)}</span>
                  <span className="text-gray-500 text-xs ml-2">{expanded === entry.id ? "▲" : "▼"}</span>
                </button>

                {/* Expanded detail */}
                {expanded === entry.id && (
                  <div className="px-4 pb-4 border-t border-gray-700 pt-3">
                    {entry.action === 'admin_unlock' ? (
                      <p className="text-xs text-yellow-400/80 py-1">
                        Admin manually unlocked predictions for this round at {fmt(entry.timestampIso)}.
                      </p>
                    ) : (
                    <>
                    <p className="text-xs text-gray-500 mb-2 font-semibold tracking-wide">
                      {entry.action === 'prediction_edit' ? 'PREDICTIONS EDITED' : 'PREDICTIONS SUBMITTED'}
                    </p>
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
                    </>
                    )}
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
export default AuditView;
