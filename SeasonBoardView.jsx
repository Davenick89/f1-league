import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, F1_DRIVERS, F1_TEAMS, getDisplayName } from './shared.js';

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
      const userNickname = getDisplayName(userDoc.data()?.nickname, userDoc.data()?.googleFirstName, userDoc.data()?.email);

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
        {message && <p className="text-center text-sm text-green-400 mb-4">{message}</p>}
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
export default SeasonBoardView;
