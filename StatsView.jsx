import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db, functions } from './shared.js';

const COLORS = ['#e10600', '#00d2be', '#ff8700', '#3671c6', '#52e252', '#6692ff', '#ff8000', '#f596c8'];
const card = 'bg-gray-950 border border-gray-800 rounded-2xl p-5';

function Select({ value, onChange, children, className = '' }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className={`bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white ${className}`}>{children}</select>;
}

export default function StatsView({ series }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [chartType, setChartType] = useState('drivers');
  const [selectedDrivers, setSelectedDrivers] = useState([]);
  const [firstDriver, setFirstDriver] = useState('');
  const [secondDriver, setSecondDriver] = useState('');
  const [historyDriver, setHistoryDriver] = useState('');
  const [historyCircuit, setHistoryCircuit] = useState('');
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // FIX (post-buildplan-stats audit): 'system/driverStats/{series}' is a
  // 3-segment (odd) path — Firestore resolves that to a collection, not a
  // document; this doc() call would throw. Matches the driverStats/{series}
  // top-level-collection fix in functions/index.js and firestore.rules.
  useEffect(() => onSnapshot(doc(db, 'driverStats', series),
    (snapshot) => { setStats(snapshot.exists() ? snapshot.data() : null); setError(''); },
    () => setError('Performance stats could not be loaded.')), [series]);

  const rounds = stats?.rounds || [];
  const drivers = useMemo(() => {
    const entries = new Map();
    rounds.forEach((round) => round.drivers?.forEach((driver) => entries.set(driver.driverId, driver.driverName)));
    return [...entries.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rounds]);
  const constructors = useMemo(() => {
    const entries = new Map();
    rounds.forEach((round) => round.drivers?.forEach((driver) => entries.set(driver.constructorId, driver.constructorName)));
    return [...entries.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rounds]);
  const circuits = useMemo(() => [...new Map(rounds.filter((round) => round.circuitId).map((round) => [round.circuitId, round.circuitName])).entries()]
    .map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), [rounds]);

  useEffect(() => {
    if (!selectedDrivers.length && drivers.length) setSelectedDrivers(drivers.slice(0, 4).map((driver) => driver.id));
    if (!firstDriver && drivers.length) setFirstDriver(drivers[0].id);
    if (!secondDriver && drivers.length > 1) setSecondDriver(drivers[1].id);
    if (!historyDriver && drivers.length) setHistoryDriver(drivers[0].id);
    if (!historyCircuit && circuits.length) setHistoryCircuit(circuits[0].id);
  }, [drivers, circuits, selectedDrivers.length, firstDriver, secondDriver, historyDriver, historyCircuit]);

  const progression = useMemo(() => rounds.map((round) => {
    const standings = chartType === 'drivers' ? round.driverStandings : round.constructorStandings;
    return (standings || []).reduce((row, standing) => ({ ...row, [standing.id]: standing.points }), { round: `R${round.round}` });
  }), [rounds, chartType]);
  const chartOptions = chartType === 'drivers' ? drivers : constructors;
  const selectedChartEntries = chartOptions.filter((entry) => selectedDrivers.includes(entry.id));
  const summary = useMemo(() => drivers.map((driver) => {
    const results = rounds.flatMap((round) => round.drivers?.filter((entry) => entry.driverId === driver.id) || []);
    return { ...driver, wins: results.filter((result) => result.position === 1).length, podiums: results.filter((result) => result.position && result.position <= 3).length, dnfs: results.filter((result) => result.dnf).length };
  }), [drivers, rounds]);
  const deltas = useMemo(() => summary.map((driver) => {
    const results = rounds.flatMap((round) => round.drivers?.filter((entry) => entry.driverId === driver.id) || []).filter((result) => result.position !== null && Number.isFinite(result.grid));
    const total = results.reduce((sum, result) => sum + (result.grid - result.position), 0);
    return { ...driver, delta: total, average: results.length ? total / results.length : 0 };
  }).sort((a, b) => b.average - a.average), [summary, rounds]);
  // FIX (post-buildplan-stats audit): the spec's frontend requirement is
  // "select two drivers, compare current-season results" — any two drivers,
  // not only when they happened to share a constructor that round. The
  // teammate flag is still surfaced per-race (see `teammates` below) since
  // the spec separately calls out identifying teammate pairs as useful
  // context, but it no longer gates whether a comparison is shown at all —
  // restricting to teammates-only made the picker return nothing for most
  // interesting pairings (e.g. two title rivals on different teams).
  const headToHead = useMemo(() => rounds.map((round) => {
    const first = round.drivers?.find((driver) => driver.driverId === firstDriver);
    const second = round.drivers?.find((driver) => driver.driverId === secondDriver);
    if (!first || !second) return null;
    return { round: round.round, raceName: round.raceName, first, second, teammates: first.constructorId === second.constructorId };
  }).filter(Boolean), [rounds, firstDriver, secondDriver]);
  const h2hWins = headToHead.reduce((totals, race) => {
    if (race.first.position && race.second.position) return race.first.position < race.second.position ? { ...totals, first: totals.first + 1 } : { ...totals, second: totals.second + 1 };
    if (race.first.position && !race.second.position) return { ...totals, first: totals.first + 1 };
    if (race.second.position && !race.first.position) return { ...totals, second: totals.second + 1 };
    return totals;
  }, { first: 0, second: 0 });

  const loadHistory = async () => {
    if (!historyDriver || !historyCircuit) return;
    setHistoryLoading(true); setError('');
    try {
      const call = httpsCallable(functions, 'getDriverCircuitHistory');
      const result = await call({ series, driverId: historyDriver, circuitId: historyCircuit });
      setHistory(result.data);
    } catch (err) { setError('Track history is temporarily unavailable.'); }
    finally { setHistoryLoading(false); }
  };

  if (!stats && !error) return <div className={`${card} text-gray-500 py-16 text-center`}>Loading performance stats…</div>;
  if (!stats) return <div className={`${card} text-red-400`}>{error}</div>;

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-black text-white">Performance Stats</h1><p className="text-sm text-gray-500 mt-1">{stats.season} season · through round {stats.lastCachedRound}</p></div>
    {error && <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>}

    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h2 className="font-bold text-white">Points progression</h2><div className="flex gap-2"><button onClick={() => { setChartType('drivers'); setSelectedDrivers(drivers.slice(0, 4).map((driver) => driver.id)); }} className={`px-3 py-1.5 rounded-lg text-sm ${chartType === 'drivers' ? 'bg-red-600 text-white' : 'bg-gray-900 text-gray-400'}`}>Drivers</button><button onClick={() => { setChartType('constructors'); setSelectedDrivers(constructors.slice(0, 4).map((team) => team.id)); }} className={`px-3 py-1.5 rounded-lg text-sm ${chartType === 'constructors' ? 'bg-red-600 text-white' : 'bg-gray-900 text-gray-400'}`}>Constructors</button></div></div>
      <div className="flex flex-wrap gap-2 mb-4">{chartOptions.map((entry) => <button key={entry.id} onClick={() => setSelectedDrivers((selected) => selected.includes(entry.id) ? selected.filter((id) => id !== entry.id) : [...selected, entry.id])} className={`text-xs px-2 py-1 rounded ${selectedDrivers.includes(entry.id) ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-500'}`}>{entry.name}</button>)}</div>
      <div className="h-72"><ResponsiveContainer><LineChart data={progression}><CartesianGrid stroke="#262626" /><XAxis dataKey="round" stroke="#737373" /><YAxis stroke="#737373" /><Tooltip contentStyle={{ background: '#171717', border: '1px solid #404040' }} /><Legend />{selectedChartEntries.map((entry, index) => <Line key={entry.id} type="monotone" dataKey={entry.id} name={entry.name} stroke={COLORS[index % COLORS.length]} strokeWidth={2} connectNulls />)}</LineChart></ResponsiveContainer></div>
    </section>

    <section className={card}><h2 className="font-bold text-white mb-4">Qualifying vs race</h2><p className="text-xs text-gray-500 mb-3">Positive values indicate positions gained from the grid to the classified race finish.</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-gray-500"><tr><th className="pb-2">Driver</th><th className="pb-2">Total delta</th><th className="pb-2">Avg / classified race</th></tr></thead><tbody>{deltas.map((driver) => <tr key={driver.id} className="border-t border-gray-900"><td className="py-2 text-white">{driver.name}</td><td className={driver.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}>{driver.delta > 0 ? '+' : ''}{driver.delta}</td><td className="text-gray-300">{driver.average > 0 ? '+' : ''}{driver.average.toFixed(1)}</td></tr>)}</tbody></table></div></section>

    <section className={card}><h2 className="font-bold text-white mb-4">Wins, podiums & DNFs</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-gray-500"><tr><th className="pb-2">Driver</th><th className="pb-2">Wins</th><th className="pb-2">Podiums</th><th className="pb-2">DNFs</th></tr></thead><tbody>{[...summary].sort((a, b) => b.wins - a.wins || b.podiums - a.podiums).map((driver) => <tr key={driver.id} className="border-t border-gray-900"><td className="py-2 text-white">{driver.name}</td><td>{driver.wins}</td><td>{driver.podiums}</td><td className={driver.dnfs ? 'text-red-400' : 'text-gray-300'}>{driver.dnfs}</td></tr>)}</tbody></table></div></section>

    <section className={card}><h2 className="font-bold text-white mb-4">Head-to-head</h2><div className="flex flex-wrap gap-3 mb-4"><Select value={firstDriver} onChange={setFirstDriver}>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</Select><Select value={secondDriver} onChange={setSecondDriver}>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</Select></div>{headToHead.length ? <><p className="text-sm text-gray-300 mb-3"><span className="text-white font-bold">{drivers.find((driver) => driver.id === firstDriver)?.name}: {h2hWins.first}</span> · <span className="text-white font-bold">{drivers.find((driver) => driver.id === secondDriver)?.name}: {h2hWins.second}</span> race finishes ahead</p><div className="space-y-2">{headToHead.map((race) => <div key={race.round} className="text-sm flex justify-between border-t border-gray-900 pt-2"><span className="text-gray-400">R{race.round} · {race.raceName}{race.teammates ? ' · teammates' : ''}</span><span className="text-white">{race.first.positionText} — {race.second.positionText}</span></div>)}</div></> : <p className="text-sm text-gray-500">These drivers haven't both raced in a cached round this season.</p>}</section>

    <section className={card}><h2 className="font-bold text-white mb-4">Track history</h2><div className="flex flex-wrap gap-3"><Select value={historyDriver} onChange={setHistoryDriver}>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</Select><Select value={historyCircuit} onChange={setHistoryCircuit}>{circuits.map((circuit) => <option value={circuit.id} key={circuit.id}>{circuit.name}</option>)}</Select><button onClick={loadHistory} disabled={historyLoading} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{historyLoading ? 'Loading…' : 'Look up history'}</button></div>{history && <div className="mt-4 text-sm text-gray-300"><p className="mb-2">{history.races.length} starts at this circuit</p><div className="space-y-1">{history.races.map((race) => <div key={`${race.season}-${race.round}`} className="flex justify-between border-t border-gray-900 pt-1"><span>{race.season} · {race.raceName}</span><span>{race.positionText} (grid {race.grid})</span></div>)}</div></div>}</section>
  </div>;
}
