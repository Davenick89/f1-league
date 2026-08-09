import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { ExternalLink, Newspaper } from 'lucide-react';
import { db } from './shared.js';

const card = 'bg-gray-950 border border-gray-800 rounded-2xl p-5';

function formatPublishedDate(pubDate) {
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function NewsView() {
  const [sourceDocs, setSourceDocs] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
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

  const visibleItems = useMemo(() => sourceDocs
    .filter((source) => !selectedSources.length || selectedSources.includes(source.id))
    .flatMap((source) => Array.isArray(source.items) ? source.items : [])
    .filter((item) => item?.title && item?.link)
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()), [sourceDocs, selectedSources]);

  const toggleSource = (sourceId) => setSelectedSources((selected) => (
    selected.includes(sourceId) ? selected.filter((id) => id !== sourceId) : [...selected, sourceId]
  ));

  if (loading) return <div className={`${card} text-gray-500 py-16 text-center`}>Loading latest news…</div>;

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-black text-white">F1 News</h1>
      <p className="text-sm text-gray-500 mt-1">Headlines and RSS excerpts from selected publishers. Open an item to read the original article.</p>
    </div>

    {error && <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>}

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

    {!error && !visibleItems.length && <div className={`${card} py-16 text-center text-gray-500`}><Newspaper className="mx-auto mb-3" size={28} />No cached news is available yet.</div>}

    <div className="space-y-3">
      {visibleItems.map((item, index) => <article key={`${item.link}-${index}`} className={`${card} flex gap-4`}>
        {item.imageUrl && <img src={item.imageUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="hidden sm:block w-28 h-20 object-cover rounded-lg bg-gray-900" loading="lazy" />}
        <div className="min-w-0 flex-1">
          <a href={item.link} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1.5 text-base font-bold text-white hover:text-red-400 transition">
            <span>{item.title}</span><ExternalLink size={15} className="mt-1 shrink-0 opacity-60 group-hover:opacity-100" aria-label="Opens original article in a new tab" />
          </a>
          {item.excerpt && <p className="mt-2 text-sm leading-6 text-gray-400">{item.excerpt}</p>}
          <p className="mt-3 text-xs text-gray-600">via <span className="text-gray-400 font-semibold">{item.sourceName}</span> · {formatPublishedDate(item.pubDate)}</p>
        </div>
      </article>)}
    </div>
  </div>;
}
