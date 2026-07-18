import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import './App.css';
import { CARDS, SET_ORDER } from './data/cards';
import type { ErikaCard } from './types';
import { useCollection } from './useCollection';

type OwnershipFilter = 'all' | 'owned' | 'missing';
type LanguageFilter = 'all' | 'EN' | 'JP';

function CardImage({ card }: { card: ErikaCard }) {
  const [failed, setFailed] = useState(false);

  if (!card.image || failed) {
    return (
      <div className="card-image placeholder" aria-hidden="true">
        <span className="placeholder-flower">✿</span>
        <span className="placeholder-name">{card.name}</span>
        <span className="placeholder-hint">no image available</span>
      </div>
    );
  }
  return (
    <img
      className="card-image"
      src={card.image}
      alt={card.name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function CardTile({
  card,
  isOwned,
  onToggle,
}: {
  card: ErikaCard;
  isOwned: boolean;
  onToggle: (id: string) => void;
}) {
  const checkboxId = `own-${card.id}`;
  return (
    <article className={`card-tile${isOwned ? ' owned' : ''}`}>
      <CardImage card={card} />
      <div className="card-body">
        <h3 className="card-name">{card.name}</h3>
        <p className="card-meta">
          {card.set} · #{card.number} · {card.rarity} · {card.year}
        </p>
        <p className="card-badges">
          <span className="badge">{card.category}</span>
          {card.language === 'JP' && <span className="badge badge-jp">Japanese exclusive</span>}
        </p>
        {card.notes && <p className="card-notes">{card.notes}</p>}
        <p className="card-links">
          {card.links.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noreferrer noopener">
              {link.label} ↗
            </a>
          ))}
        </p>
        <label className="own-toggle" htmlFor={checkboxId}>
          <input
            id={checkboxId}
            type="checkbox"
            checked={isOwned}
            onChange={() => onToggle(card.id)}
          />
          <span>{isOwned ? 'In my collection' : 'I have this card'}</span>
        </label>
      </div>
    </article>
  );
}

export default function App() {
  const { owned, toggle, replaceAll } = useCollection();
  const [query, setQuery] = useState('');
  const [ownership, setOwnership] = useState<OwnershipFilter>('all');
  const [language, setLanguage] = useState<LanguageFilter>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CARDS.filter((card) => {
      if (q && !`${card.name} ${card.set} ${card.number}`.toLowerCase().includes(q)) return false;
      if (ownership === 'owned' && !owned.has(card.id)) return false;
      if (ownership === 'missing' && owned.has(card.id)) return false;
      if (language !== 'all' && card.language !== language) return false;
      return true;
    });
  }, [query, ownership, language, owned]);

  const sections = useMemo(
    () =>
      SET_ORDER.map((set) => ({
        set,
        cards: filtered.filter((c) => c.set === set),
        total: CARDS.filter((c) => c.set === set).length,
        ownedCount: CARDS.filter((c) => c.set === set && owned.has(c.id)).length,
      })).filter((s) => s.cards.length > 0),
    [filtered, owned],
  );

  const ownedTotal = owned.size;
  const total = CARDS.length;
  const pct = total === 0 ? 0 : Math.round((ownedTotal / total) * 100);
  const jpTotal = CARDS.filter((c) => c.language === 'JP').length;
  const jpOwned = CARDS.filter((c) => c.language === 'JP' && owned.has(c.id)).length;

  function exportCollection() {
    const payload = {
      app: 'erika-card-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      owned: [...owned],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `erika-collection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importCollection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        const ids = Array.isArray(parsed) ? parsed : (parsed as { owned?: unknown })?.owned;
        if (!Array.isArray(ids)) throw new Error('missing owned list');
        const knownIds = new Set(CARDS.map((c) => c.id));
        const valid = ids.filter((id): id is string => typeof id === 'string' && knownIds.has(id));
        const ok = window.confirm(
          `Import backup with ${valid.length} owned card${valid.length === 1 ? '' : 's'}? ` +
            `This replaces your current selection (${owned.size} card${owned.size === 1 ? '' : 's'}).`,
        );
        if (ok) replaceAll(valid);
      } catch {
        window.alert('Sorry, that file does not look like an erika-card-tracker backup.');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="app">
      <header className="header">
        <h1>
          <span className="header-flower" aria-hidden="true">
            ✿
          </span>{' '}
          Erika Card Tracker
        </h1>
        <p className="subtitle">
          Every Erika-related Pokémon TCG card — English sets and Japanese exclusives.
        </p>
        <div className="progress-block">
          <div className="progress-stats">
            <span className="progress-count">
              {ownedTotal} <span className="progress-of">of {total} cards</span>
            </span>
            <span className="progress-pct">{pct}%</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={ownedTotal}
            aria-label="Collection progress"
          >
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="progress-detail">
            {jpOwned} of {jpTotal} Japanese exclusives collected
          </p>
        </div>
      </header>

      <div className="controls">
        <input
          type="search"
          className="search"
          placeholder="Search cards, sets, numbers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search cards"
        />
        <div className="control-group" role="group" aria-label="Filter by ownership">
          {(['all', 'owned', 'missing'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={ownership === value ? 'chip active' : 'chip'}
              onClick={() => setOwnership(value)}
            >
              {value === 'all' ? 'All' : value === 'owned' ? 'Owned' : 'Missing'}
            </button>
          ))}
        </div>
        <div className="control-group" role="group" aria-label="Filter by language">
          {(['all', 'EN', 'JP'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={language === value ? 'chip active' : 'chip'}
              onClick={() => setLanguage(value)}
            >
              {value === 'all' ? 'EN + JP' : value === 'EN' ? 'English' : 'Japanese'}
            </button>
          ))}
        </div>
        <div className="control-group">
          <button type="button" className="chip" onClick={exportCollection}>
            Export backup
          </button>
          <button type="button" className="chip" onClick={() => fileInputRef.current?.click()}>
            Import backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={importCollection}
            aria-label="Import collection backup file"
          />
        </div>
      </div>

      <main>
        {sections.length === 0 && (
          <p className="empty">No cards match the current search and filters.</p>
        )}
        {sections.map((section) => (
          <section key={section.set} className="set-section">
            <h2 className="set-title">
              {section.set}
              <span className="set-progress">
                {section.ownedCount} / {section.total}
              </span>
            </h2>
            <div className="card-grid">
              {section.cards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  isOwned={owned.has(card.id)}
                  onToggle={toggle}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="footer">
        <p>
          Progress is saved in this browser (localStorage). Use “Export backup” to move it to
          another device. Card images © The Pokémon Company — served from public card databases.
        </p>
      </footer>
    </div>
  );
}
