import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { Check, Copy, Lock, Settings } from 'lucide-react';
import { db } from './shared.js';

const LOCK_OFFSET_OPTIONS = [
  { value: 30,  label: '30 min before Qualifying' },
  { value: 60,  label: '1 hour before Qualifying' },
  { value: 120, label: '2 hours before Qualifying' },
  { value: 180, label: '3 hours before Qualifying' },
  { value: 360, label: '6 hours before Qualifying' },
  { value: 720, label: '12 hours before Qualifying' },
];

function LeagueSettingsCard({ group }) {
  const currentOffset = group?.predictionLockOffsetMins ?? 60;
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  // pendingOffset holds the user's dropdown selection before they confirm.
  // Keeps the dropdown from snapping back to the old value while Firestore propagates.
  const [pendingOffset, setPendingOffset] = React.useState(null);

  // When the group doc updates (Firestore propagated), clear the pending state.
  React.useEffect(() => { setPendingOffset(null); }, [currentOffset]);

  const displayOffset = pendingOffset ?? currentOffset;
  const hasUnsavedChange = pendingOffset !== null && pendingOffset !== currentOffset;

  const handleOffsetChange = (e) => {
    setPendingOffset(parseInt(e.target.value));
  };

  const handleOffsetSave = async () => {
    if (pendingOffset === null) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "groups", group.id), { predictionLockOffsetMins: pendingOffset });
      setMsg('✅ Lock time updated');
      setTimeout(() => setMsg(''), 3000);
      // pendingOffset cleared by the useEffect above once Firestore echoes back
    } catch (err) {
      console.error(err);
      setMsg('❌ Error saving');
      setPendingOffset(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 bg-gray-900 border border-gray-700 rounded-xl p-4">
      <p className="text-xs font-black text-gray-500 tracking-widest mb-4">⚙️ LEAGUE SETTINGS</p>

      {/* Prediction lock offset */}
      <div className="mb-5">
        <label className="block text-sm font-bold text-gray-300 mb-1">Prediction Cut-off</label>
        <p className="text-xs text-gray-500 mb-2">
          How early predictions close before Qualifying / Sprint Qualifying each race. Applies to every round this season.
        </p>
        <div className="flex gap-2">
          <select
            value={displayOffset}
            onChange={handleOffsetChange}
            disabled={saving}
            className="flex-1 bg-gray-800 border border-gray-600 rounded p-2 text-white text-sm disabled:opacity-50"
          >
            {LOCK_OFFSET_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={handleOffsetSave}
            disabled={!hasUnsavedChange || saving}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded text-sm font-bold text-white transition-colors shrink-0"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {msg && <p className="text-xs text-center mt-2 text-green-400">{msg}</p>}
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

      {/* ── League Settings (admin only) ── */}
      {isAdmin && <LeagueSettingsCard group={group} />}

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
export default InvitesView;
