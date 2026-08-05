import React, { useState } from 'react';

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
                    <td className="p-3 text-gray-300">R# — DNS / NC <span className="text-gray-500 text-xs">(no official classified finish)</span></td>
                    <td className="p-3 text-center text-red-400 font-bold">0</td>
                  </tr>
                  <tr className="bg-gray-700/30">
                    <td className="p-3 text-gray-300">R# — Retired but classified <span className="text-gray-500 text-xs">(scored normally at their official position)</span></td>
                    <td className="p-3 text-center text-gray-400 font-bold">as P#</td>
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
              <p className="text-xs text-gray-400">
                <span className="text-purple-300 font-semibold">Retirements still count:</span> if a driver retires but earns an official classified position
                (F1 still classifies a car that completes ≥90% of the race distance — e.g. "Retired, Classified P14"), that position is used and scored
                exactly like a normal finish. Only <span className="text-white font-semibold">DNS</span> (did not start) or <span className="text-white font-semibold">NC</span> (not
                classified — completed &lt;90% of the race) score zero.
              </p>
              <div className="bg-gray-900 rounded p-3 mt-2 text-xs space-y-1 text-gray-400">
                <p className="text-white font-semibold mb-1">Example — Target: P10</p>
                <p>Player 1 predicted Hadjar → finished P8 → distance 2</p>
                <p>Player 2 predicted Bearman → retired but classified P11 → distance 1 <span className="text-green-400 font-bold">← closest, +1 pt</span></p>
                <p>Player 3 predicted Bortoleto → crashed lap 2, Not Classified (NC) → distance ∞ → 0 pts</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-red-400 mb-3">🔒 Prediction Lock Window</h3>
            <div className="bg-gray-800 rounded p-4 text-sm text-gray-300 space-y-2">
              <div className="flex gap-3">
                <span className="text-yellow-400 font-bold w-28 shrink-0">Normal race:</span>
                <span>Lock at <span className="text-white font-semibold">1 hour before Qualifying</span> (Saturday)</span>
              </div>
              <div className="flex gap-3">
                <span className="text-yellow-400 font-bold w-28 shrink-0">Sprint weekend:</span>
                <span>Lock at <span className="text-white font-semibold">1 hour before Sprint Qualifying</span> (Friday afternoon)</span>
              </div>
              <div className="flex gap-3">
                <span className="text-yellow-400 font-bold w-28 shrink-0">Opens:</span>
                <span>Monday of the race week — unlimited edits until lock</span>
              </div>
              <p className="text-red-400 text-xs pt-1">Once locked, no changes can be made without admin override.</p>
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

export default HowToPlayView;
