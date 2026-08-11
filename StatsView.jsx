import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db, functions } from './shared.js';

// Real 2026-grid team colors, keyed by Jolpica's constructorId, so the
// points-progression chart reads at a glance the way real F1 graphics do.
// Two drivers on the same team intentionally share their team's color —
// the legend/toggle buttons already disambiguate by name, and matching
// colors is the whole point of this fix (a driver's line should read as
// "that team's color", not an arbitrary palette slot).
const TEAM_COLORS = {
  ferrari: '#E8002D',
  mclaren: '#FF8000',
  mercedes: '#00D7B6',
  red_bull: '#1E41FF',
  aston_martin: '#229971',
  alpine: '#FF87BC',
  williams: '#00A0DE',
  rb: '#6692FF',
  haas: '#B6BABD',
  audi: '#8B1E3F',
  cadillac: '#C9A44C',
};
const FALLBACK_COLOR = '#9CA3AF';

// Picks readable black/white text against an arbitrary team color background
// (relative luminance) rather than hardcoding one text color that would be
// illegible against roughly half of an 11-color, largely-saturated palette.
function readableTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#0a0a0a' : '#ffffff';
}

const card = 'bg-gray-950 border border-gray-800 rounded-2xl p-5';

function Select({ value, onChange, children, className = '', disabled = false }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={`bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50 ${className}`}>{children}</select>;
}

// FIX (post-user-feedback): every section used to always render — user
// asked for each data section to be individually hideable, both to declutter
// and specifically because "Qualifying vs race" wasn't reading as clearly
// useful to them. `headerExtra` (the Drivers/Constructors toggle on Points
// progression) is a sibling of the collapse button, not a child of it, so
// clicking those controls doesn't also collapse the section.
function CollapsibleSection({ title, headerExtra, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left">
          <span className={`text-gray-500 text-xs inline-block transition-transform ${open ? '' : '-rotate-90'}`}>▼</span>
          <h2 className="font-bold text-white">{title}</h2>
        </button>
        {headerExtra}
      </div>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
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
  const [allCircuits, setAllCircuits] = useState([]);

  // FIX (post-buildplan-stats audit): 'system/driverStats/{series}' is a
  // 3-segment (odd) path — Firestore resolves that to a collection, not a
  // document; this doc() call would throw. Matches the driverStats/{series}
  // top-level-collection fix in functions/index.js and firestore.rules.
  useEffect(() => onSnapshot(doc(db, 'driverStats', series),
    (snapshot) => { setStats(snapshot.exists() ? snapshot.data() : null); setError(''); },
    () => setError('Performance stats could not be loaded.')), [series]);

  // FIX: Track history's circuit picker used to be derived from this
  // season's cached rounds — capped at whatever refreshDriverStatsCache had
  // backfilled so far (as few as 5), and identical for every driver since
  // it was never actually driver-specific to begin with. First fix pulled
  // from Jolpica's full ~78-circuit all-time list, but that's overkill for
  // a fan-facing picker — nobody needs 1950s-era defunct circuits in the
  // dropdown. Settled on the current season's actual calendar instead (23
  // circuits, plus each one's country): fetches the season schedule
  // directly (same endpoint refreshDriverStatsCache uses to find candidate
  // rounds), independent of driverStats' own backlog state, and lists
  // every round on the calendar — including ones that haven't happened
  // yet — since the lookup itself (getDriverCircuitHistory) is all-time
  // regardless of what's cached.
  useEffect(() => {
    if (!stats?.season) return;
    let cancelled = false;
    // FIX (post-Stats-v1 audit, round 3): didn't check res.ok before
    // parsing — a non-2xx (e.g. a 429 from Jolpica) with a JSON error body
    // parsed "successfully" into a shape with no Races array, silently
    // degrading to an empty circuit list (permanently stuck on "Loading
    // circuits…") instead of surfacing as the fetch failure it actually is.
    fetch(`https://api.jolpi.ca/ergast/f1/${stats.season}.json?limit=100`)
      .then((res) => { if (!res.ok) throw new Error(`Jolpica HTTP ${res.status}`); return res.json(); })
      .then((data) => {
        if (cancelled) return;
        const races = data?.MRData?.RaceTable?.Races || [];
        const list = [...new Map(races.filter((race) => race.Circuit).map((race) => [race.Circuit.circuitId, { name: race.Circuit.circuitName, country: race.Circuit.Location?.country }])).entries()]
          .map(([id, { name, country }]) => ({ id, name, country }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setAllCircuits(list);
        // FIX: this effect only ever set `error`, never cleared it on a
        // later successful retry — asymmetric with the sibling driverStats
        // listener, which clears error on every successful snapshot.
        setError('');
      })
      .catch(() => { if (!cancelled) setError((prev) => prev || 'Could not load the circuit list.'); });
    return () => { cancelled = true; };
  }, [stats?.season]);

  const rounds = stats?.rounds || [];
  // FIX (post-user-feedback): these used to sort alphabetically by name.
  // Sorted by each entry's position in the latest cached round's official
  // standings instead, so the graph's toggle list (and every dropdown that
  // shares this array) reads in current championship order — leaders
  // first, matching how every real F1 standings table reads.
  const drivers = useMemo(() => {
    const entries = new Map();
    rounds.forEach((round) => round.drivers?.forEach((driver) => entries.set(driver.driverId, { name: driver.driverName, constructorId: driver.constructorId })));
    const latest = rounds[rounds.length - 1];
    const order = new Map((latest?.driverStandings || []).map((standing) => [standing.id, standing.position]));
    return [...entries.entries()]
      .map(([id, { name, constructorId }]) => ({ id, name, constructorId }))
      .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }, [rounds]);
  const constructors = useMemo(() => {
    const entries = new Map();
    rounds.forEach((round) => round.drivers?.forEach((driver) => entries.set(driver.constructorId, driver.constructorName)));
    const latest = rounds[rounds.length - 1];
    const order = new Map((latest?.constructorStandings || []).map((standing) => [standing.id, standing.position]));
    return [...entries.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }, [rounds]);

  // FIX (post-user-feedback): this used to key its "default to first 4" line
  // off `selectedDrivers.length`, which meant clicking Clear (selectedDrivers
  // -> []) immediately re-triggered the same effect, saw an empty array, and
  // refilled it right back — Clear could never actually clear anything. Same
  // bug already existed for a user manually deselecting all 4 by hand, just
  // less likely to be hit than a single Clear click. `initializedDriversRef`
  // makes the default-selection a true one-time-on-load behavior instead of
  // "whenever the array happens to be empty."
  const initializedDriversRef = useRef(false);
  useEffect(() => {
    if (!initializedDriversRef.current && drivers.length) {
      setSelectedDrivers(drivers.slice(0, 4).map((driver) => driver.id));
      initializedDriversRef.current = true;
    }
    if (!firstDriver && drivers.length) setFirstDriver(drivers[0].id);
    if (!secondDriver && drivers.length > 1) setSecondDriver(drivers[1].id);
    if (!historyDriver && drivers.length) setHistoryDriver(drivers[0].id);
    if (!historyCircuit && allCircuits.length) setHistoryCircuit(allCircuits[0].id);
  }, [drivers, allCircuits, firstDriver, secondDriver, historyDriver, historyCircuit]);

  const progression = useMemo(() => rounds.map((round) => {
    const standings = chartType === 'drivers' ? round.driverStandings : round.constructorStandings;
    return (standings || []).reduce((row, standing) => ({ ...row, [standing.id]: standing.points }), { round: `R${round.round}` });
  }), [rounds, chartType]);
  const chartOptions = chartType === 'drivers' ? drivers : constructors;
  const selectedChartEntries = chartOptions.filter((entry) => selectedDrivers.includes(entry.id));
  const colorFor = (entry) => TEAM_COLORS[chartType === 'drivers' ? entry.constructorId : entry.id] || FALLBACK_COLOR;
  const dashFor = (entry) => {
    if (chartType !== 'drivers') return undefined;
    const teammates = drivers.filter((driver) => driver.constructorId === entry.constructorId);
    if (teammates.length < 2) return undefined;
    return teammates[0].id === entry.id ? undefined : '6 4';
  };
  const summary = useMemo(() => drivers.map((driver) => {
    const results = rounds.flatMap((round) => round.drivers?.filter((entry) => entry.driverId === driver.id) || []);
    return { ...driver, wins: results.filter((result) => result.position === 1).length, podiums: results.filter((result) => result.position && result.position <= 3).length, dnfs: results.filter((result) => result.dnf).length };
  }), [drivers, rounds]);
  const deltas = useMemo(() => summary.map((driver) => {
    const perRound = rounds.map((round) => {
      const own = round.drivers?.find((entry) => entry.driverId === driver.id);
      if (!own || own.position === null || !Number.isFinite(own.grid)) return null;
      const attritionAhead = (round.drivers || []).filter((entry) =>
        entry.dnf && Number.isFinite(entry.grid) && entry.grid < own.grid
      ).length;
      return (own.grid - own.position) - attritionAhead;
    }).filter((value) => value !== null);
    const total = perRound.reduce((sum, value) => sum + value, 0);
    return { ...driver, delta: total, average: perRound.length ? total / perRound.length : 0 };
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

  // FIX (post-Stats-v1 audit, round 3): `history` used to only ever be set
  // inside loadHistory(), never cleared when the driver/circuit selection
  // changed — changing either dropdown without re-clicking "Look up
  // history" left the *previous* pair's results on screen, visually
  // attributed to whichever driver/circuit happened to be selected now.
  useEffect(() => setHistory(null), [historyDriver, historyCircuit]);

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

    <CollapsibleSection
      title="Points progression"
      headerExtra={<div className="flex gap-2"><button onClick={() => { setChartType('drivers'); setSelectedDrivers(drivers.slice(0, 4).map((driver) => driver.id)); }} className={`px-3 py-1.5 rounded-lg text-sm ${chartType === 'drivers' ? 'bg-red-600 text-white' : 'bg-gray-900 text-gray-400'}`}>Drivers</button><button onClick={() => { setChartType('constructors'); setSelectedDrivers(constructors.slice(0, 4).map((team) => team.id)); }} className={`px-3 py-1.5 rounded-lg text-sm ${chartType === 'constructors' ? 'bg-red-600 text-white' : 'bg-gray-900 text-gray-400'}`}>Constructors</button></div>}
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setSelectedDrivers(chartOptions.map((entry) => entry.id))} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 font-semibold">Select All</button>
        <button onClick={() => setSelectedDrivers([])} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 font-semibold">Clear</button>
        <span className="w-px h-4 bg-gray-800" />
        {chartOptions.map((entry) => <button key={entry.id} onClick={() => setSelectedDrivers((selected) => selected.includes(entry.id) ? selected.filter((id) => id !== entry.id) : [...selected, entry.id])} style={selectedDrivers.includes(entry.id) ? { background: colorFor(entry), color: readableTextColor(colorFor(entry)) } : undefined} className={`text-xs px-2 py-1 rounded font-semibold ${selectedDrivers.includes(entry.id) ? '' : 'bg-gray-900 text-gray-500'}`}>{entry.name}</button>)}
      </div>
      {/* FIX: explicit w-full alongside the fixed h-72 so ResponsiveContainer
          always has an unambiguous, non-zero size to measure — reported
          flatlining on mobile that didn't reproduce under Playwright's
          device emulation (real recharts SVG paths with real data, checked
          directly, both there and on desktop); this is the standard
          defensive fix for this exact class of ResponsiveContainer sizing
          issue and is harmless either way, but flagging it's unconfirmed on
          an actual device. */}
      <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%" minWidth={280}><LineChart data={progression}><CartesianGrid stroke="#262626" /><XAxis dataKey="round" stroke="#737373" /><YAxis stroke="#737373" /><Tooltip contentStyle={{ background: '#171717', border: '1px solid #404040' }} /><Legend />{selectedChartEntries.map((entry) => <Line key={entry.id} type="monotone" dataKey={entry.id} name={entry.name} stroke={colorFor(entry)} strokeDasharray={dashFor(entry)} strokeWidth={2} connectNulls />)}</LineChart></ResponsiveContainer></div>
    </CollapsibleSection>

    {/* Defaults collapsed — flagged by the user as the one metric on this
        page that wasn't reading as clearly useful; still available on
        demand rather than removed outright. */}
    <CollapsibleSection title="Grid-to-finish movement" defaultOpen={false}>
      <p className="text-xs text-gray-500 mb-3">Adjusted for cars that retired ahead of this driver — not a count of on-track overtakes.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-gray-500"><tr><th className="pb-2">Driver</th><th className="pb-2">Total delta</th><th className="pb-2">Avg / classified race</th></tr></thead><tbody>{deltas.map((driver) => <tr key={driver.id} className="border-t border-gray-900"><td className="py-2 text-white">{driver.name}</td><td className={driver.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}>{driver.delta > 0 ? '+' : ''}{driver.delta}</td><td className="text-gray-300">{driver.average > 0 ? '+' : ''}{driver.average.toFixed(1)}</td></tr>)}</tbody></table></div>
    </CollapsibleSection>

    <CollapsibleSection title="Wins, podiums & DNFs">
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-gray-500"><tr><th className="pb-2">Driver</th><th className="pb-2">Wins</th><th className="pb-2">Podiums</th><th className="pb-2">DNFs</th></tr></thead><tbody>{[...summary].sort((a, b) => b.wins - a.wins || b.podiums - a.podiums).map((driver) => <tr key={driver.id} className="border-t border-gray-900"><td className="py-2 text-white">{driver.name}</td><td>{driver.wins}</td><td>{driver.podiums}</td><td className={driver.dnfs ? 'text-red-400' : 'text-gray-300'}>{driver.dnfs}</td></tr>)}</tbody></table></div>
    </CollapsibleSection>

    <CollapsibleSection title="Head-to-head">
      <div className="flex flex-wrap gap-3 mb-4"><Select value={firstDriver} onChange={setFirstDriver}>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</Select><Select value={secondDriver} onChange={setSecondDriver}>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</Select></div>
      {headToHead.length ? <><p className="text-sm text-gray-300 mb-3"><span className="text-white font-bold">{drivers.find((driver) => driver.id === firstDriver)?.name}: {h2hWins.first}</span> · <span className="text-white font-bold">{drivers.find((driver) => driver.id === secondDriver)?.name}: {h2hWins.second}</span> race finishes ahead</p><div className="space-y-2">{headToHead.map((race) => <div key={race.round} className="text-sm flex justify-between border-t border-gray-900 pt-2"><span className="text-gray-400">R{race.round} · {race.raceName}{race.teammates ? ' · teammates' : ''}</span><span className="text-white">{race.first.positionText} — {race.second.positionText}</span></div>)}</div></> : <p className="text-sm text-gray-500">These drivers haven't both raced in a cached round this season.</p>}
    </CollapsibleSection>

    <CollapsibleSection title="Track history">
      <div className="flex flex-wrap gap-3"><Select value={historyDriver} onChange={setHistoryDriver}>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</Select><Select value={historyCircuit} onChange={setHistoryCircuit} disabled={!allCircuits.length}>{allCircuits.length ? allCircuits.map((circuit) => <option value={circuit.id} key={circuit.id}>{circuit.name}{circuit.country ? ` (${circuit.country})` : ''}</option>) : <option>Loading circuits…</option>}</Select><button onClick={loadHistory} disabled={historyLoading || !allCircuits.length} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{historyLoading ? 'Loading…' : 'Look up history'}</button></div>
      {history && <div className="mt-4 text-sm text-gray-300"><p className="mb-2">{history.races.length} starts at this circuit</p><div className="space-y-1">{history.races.map((race) => <div key={`${race.season}-${race.round}`} className="flex justify-between border-t border-gray-900 pt-1"><span>{race.season} · {race.raceName}</span><span>{race.positionText} (grid {race.grid})</span></div>)}</div></div>}
    </CollapsibleSection>
  </div>;
}
