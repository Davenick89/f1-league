import React, { useState } from 'react';
import { collection, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Copy } from 'lucide-react';
import { db, track } from './shared.js';

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
      // FIX (post-Track-D audit): currentOpenRound used to be set in this same
      // write, before raceStatus/round1 existed — a dropped second write left
      // isRaceOpen() seeing a currentOpenRound with no matching status doc,
      // which it treats as closed, permanently blocking the new league until
      // manually repaired. Reordered to match F1League.jsx's own creation
      // path: currentOpenRound is set last, once raceStatus/round1 is
      // confirmed to exist. isRaceOpen() treats a *missing* currentOpenRound
      // as legacy-open, so a failure partway leaves the group permissive
      // rather than blocked.
      await setDoc(doc(db, "groups", groupId), {
        name: leagueName.trim(),
        admin: user.uid,
        members: [user.uid],
        createdTimestamp: serverTimestamp(),
      });
      await setDoc(doc(db, `groups/${groupId}/raceStatus`, "round1"), {
        status: 'CURRENT',
        isPredictionOpen: true,
        openedAt: new Date().toISOString()
      });
      await updateDoc(doc(db, "groups", groupId), { currentOpenRound: "round1" });
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
export default AdminWizard;
