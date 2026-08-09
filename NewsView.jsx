import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { ExternalLink, Newspaper } from 'lucide-react';
import { db, F1_SCHEDULE_2026, getCurrentRound } from './shared.js';

// FIX (post-user-feedback): Formula1.com has a working RSS feed, but its own
// legal page (formula1.com's "RSS FEED TERMS OF USE") explicitly prohibits
// exactly the aggregation pattern the other 8 sources use here — "you may
// not publish a webpage that simply aggregates the RSS feeds of a specific
// type of content on the Site." No official embed/widget/API program exists
// either. A plain hyperlink doesn't touch their RSS feed at all, so it isn't
// covered by that restriction — this card is a static, non-aggregated
// link-out, not another source in NEWS_SOURCES.
function OfficialSourceCard() {
  return (
    <a
      href="https://www.formula1.com/en/latest"
      target="_blank"
      rel="noreferrer"
      className="group block rounded-2xl border border-red-600/50 bg-gradient-to-r from-red-950/40 via-gray-950 to-gray-950 p-5 transition hover:border-red-500"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-widest text-red-500">OFFICIAL SOURCE</p>
          <p className="mt-1 text-base font-bold text-white">Formula1.com</p>
          <p className="mt-1 text-sm text-gray-400">For official news, race coverage, and the latest from the sport's rightsholder, visit Formula1.com directly.</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition group-hover:bg-red-500">
          Visit Formula1.com <ExternalLink size={15} />
        </span>
      </div>
    </a>
  );
}

const card = 'bg-gray-950 border border-gray-800 rounded-2xl p-5';

function Select({ value, onChange, children }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">{children}</select>;
}

function formatPublishedDate(pubDate) {
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function NewsArticle({ item }) {
  return <article className={`${card} flex gap-4`}>
    {item.imageUrl && <img src={item.imageUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="hidden sm:block w-28 h-20 object-cover rounded-lg bg-gray-900" loading="lazy" />}
    <div className="min-w-0 flex-1">
      <a href={item.link} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1.5 text-base font-bold text-white hover:text-red-400 transition">
        <span>{item.title}</span><ExternalLink size={15} className="mt-1 shrink-0 opacity-60 group-hover:opacity-100" aria-label="Opens original article in a new tab" />
      </a>
      {item.excerpt && <p className="mt-2 text-sm leading-6 text-gray-400">{item.excerpt}</p>}
      <p className="mt-3 text-xs text-gray-600">via <span className="text-gray-400 font-semibold">{item.sourceName}</span> · {formatPublishedDate(item.pubDate)}</p>
    </div>
  </article>;
}

// FIX (post-user-feedback): the feed used to be one long, always-fully-
// expanded list of every cached item from every source — up to ~160 items,
// spanning weeks. Two changes: (1) a season filter, since this cache has no
// concept of "season" on its own (RSS items only carry a publish date) —
// derived from F1_SCHEDULE_2026's own year rather than hardcoded, so a
// future season rollover doesn't need a second place updated; (2) items
// since the last completed race are surfaced as "Most relevant" up front
// (this naturally covers both post-race reaction *and* next-race
// buildup/penalties/rule news, since that's everything published in the
// window between the last race and now — no fragile per-article
// classification needed, just the race calendar already in shared.js),
// with everything older collapsed by default instead of always rendered.
const SEASON_YEAR = new Date(F1_SCHEDULE_2026[0]?.date || Date.now()).getFullYear();
// FIX (post-user-feedback, round 2): "since the last race" alone wasn't
// actually short — 8 active sources publishing daily over a ~2-week
// race-to-race gap adds up to 100+ items, which didn't read as any shorter
// than the original unfiltered list. The date window stays as the
// *eligibility* rule (still the honest, robust definition — no fragile
// keyword/topic classification needed), but only a preview renders by
// default; the rest of that same relevant window is one click away, same
// pattern as the older-articles collapse below it.
const MOST_RELEVANT_PREVIEW_COUNT = 15;

export default function NewsView() {
  const [sourceDocs, setSourceDocs] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(String(SEASON_YEAR));
  const [showOlder, setShowOlder] = useState(false);
  const [showAllRelevant, setShowAllRelevant] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => onSnapshot(collection(db, 'news'),
    (snapshot) => {
      setSourceDocs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
      setError('');
    },
    () => {
      setLoading(false);
      setError('News could not be loaded.');
    }), []);

  const sources = useMemo(() => sourceDocs
    .filter((source) => Array.isArray(source.items) && source.items.length)
    .map(({ id, sourceName }) => ({ id, sourceName }))
    .sort((a, b) => a.sourceName.localeCompare(b.sourceName)), [sourceDocs]);

  // Always offer the current season even before any items have landed in it
  // yet, plus whichever other years actually show up in cached pubDates.
  const seasons = useMemo(() => {
    const years = new Set([SEASON_YEAR]);
    sourceDocs.forEach((source) => (source.items || []).forEach((item) => {
      const year = new Date(item.pubDate).getFullYear();
      if (!Number.isNaN(year)) years.add(year);
    }));
    return [...years].sort((a, b) => b - a);
  }, [sourceDocs]);

  // getCurrentRound() returns the next/currently-open round — the round
  // right before it (if any) is the last completed race. Using raceStart as
  // the cutoff rather than the bare date so items published on race day
  // itself, before lights out, don't get miscounted as "post-race."
  const { lastRace, nextRace } = useMemo(() => {
    const currentIndex = getCurrentRound() - 1;
    return {
      lastRace: F1_SCHEDULE_2026[currentIndex - 1] || null,
      nextRace: F1_SCHEDULE_2026[currentIndex] || null,
    };
  }, []);
  const relevanceCutoff = lastRace ? new Date(lastRace.raceStart).getTime() : null;

  const seasonItems = useMemo(() => sourceDocs
    .filter((source) => !selectedSources.length || selectedSources.includes(source.id))
    .flatMap((source) => Array.isArray(source.items) ? source.items : [])
    .filter((item) => item?.title && item?.link && String(new Date(item.pubDate).getFullYear()) === selectedSeason)
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()), [sourceDocs, selectedSources, selectedSeason]);

  const mostRelevantItems = useMemo(() => relevanceCutoff === null ? seasonItems
    : seasonItems.filter((item) => new Date(item.pubDate).getTime() >= relevanceCutoff), [seasonItems, relevanceCutoff]);
  const olderItems = useMemo(() => relevanceCutoff === null ? []
    : seasonItems.filter((item) => new Date(item.pubDate).getTime() < relevanceCutoff), [seasonItems, relevanceCutoff]);

  const toggleSource = (sourceId) => setSelectedSources((selected) => (
    selected.includes(sourceId) ? selected.filter((id) => id !== sourceId) : [...selected, sourceId]
  ));

  if (loading) return <div className={`${card} text-gray-500 py-16 text-center`}>Loading latest news…</div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black text-white">F1 News</h1>
        <p className="text-sm text-gray-500 mt-1">Headlines and RSS excerpts from selected publishers. Open an item to read the original article.</p>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Season</label>
        <Select value={selectedSeason} onChange={setSelectedSeason}>
          {seasons.map((year) => <option key={year} value={year}>{year}</option>)}
        </Select>
      </div>
    </div>

    {error && <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>}

    <OfficialSourceCard />

    {sources.length > 0 && <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-bold text-white">Sources</h2>
        <button onClick={() => setSelectedSources([])} disabled={!selectedSources.length} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40">All sources</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {sources.map((source) => {
          const selected = !selectedSources.length || selectedSources.includes(source.id);
          return <button key={source.id} onClick={() => toggleSource(source.id)} className={`text-xs px-3 py-1.5 rounded-full font-semibold transition ${selected ? 'bg-red-600 text-white' : 'bg-gray-900 text-gray-500 hover:text-white'}`}>{source.sourceName}</button>;
        })}
      </div>
    </section>}

    {!error && !seasonItems.length && <div className={`${card} py-16 text-center text-gray-500`}><Newspaper className="mx-auto mb-3" size={28} />No cached news for the {selectedSeason} season yet.</div>}

    {mostRelevantItems.length > 0 && <section>
      <h2 className="font-bold text-white mb-1">Most relevant</h2>
      <p className="text-xs text-gray-500 mb-3">
        {lastRace ? `Since the ${lastRace.name} Grand Prix` : 'Latest'}
        {nextRace ? ` — build-up, updates, and any penalties or rule changes ahead of the ${nextRace.name} Grand Prix` : ''}.
      </p>
      <div className="space-y-3">
        {(showAllRelevant ? mostRelevantItems : mostRelevantItems.slice(0, MOST_RELEVANT_PREVIEW_COUNT)).map((item, index) => <NewsArticle key={`${item.link}-${index}`} item={item} />)}
      </div>
      {mostRelevantItems.length > MOST_RELEVANT_PREVIEW_COUNT && <button onClick={() => setShowAllRelevant((open) => !open)} className="mt-3 flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-white transition">
        <span className={`inline-block text-xs transition-transform ${showAllRelevant ? '' : '-rotate-90'}`}>▼</span>
        {showAllRelevant ? 'Show fewer' : `Show all ${mostRelevantItems.length}`}
      </button>}
    </section>}

    {olderItems.length > 0 && <section>
      <button onClick={() => setShowOlder((open) => !open)} className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-white transition mb-3">
        <span className={`inline-block text-xs transition-transform ${showOlder ? '' : '-rotate-90'}`}>▼</span>
        {showOlder ? 'Hide' : 'Show'} {olderItems.length} earlier {selectedSeason} article{olderItems.length === 1 ? '' : 's'}
      </button>
      {showOlder && <div className="space-y-3">
        {olderItems.map((item, index) => <NewsArticle key={`${item.link}-${index}`} item={item} />)}
      </div>}
    </section>}
  </div>;
}
