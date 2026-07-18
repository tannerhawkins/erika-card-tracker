import { useMemo, useState } from 'react';
import './App.css';
import { SET_ORDER } from './data/cards';
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
  const meta = [card.set, `#${card.number}`, card.rarity, card.year ?? undefined]
    .filter(Boolean)
    .join(' · ');
  return (
    <article className={`card-tile${isOwned ? ' owned' : ''}`}>
      <CardImage card={card} />
      <div className="card-body">
        <h3 className="card-name">{card.name}</h3>
        <p className="card-meta">{meta}</p>
        <p className="card-badges">
          {card.category && <span className="badge">{card.category}</span>}
          {card.language === 'JP' && <span className="badge badge-jp">Japanese exclusive</span>}
        </p>
        {card.notes && <p className="card-notes">{card.notes}</p>}
        {card.links.length > 0 && (
          <p className="card-links">
            {card.links.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noreferrer noopener">
                {link.label} ↗
              </a>
            ))}
          </p>
        )}
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

/** SET_ORDER first, then any sets present in the sheet but not listed, first-seen. */
function orderedSets(cards: ErikaCard[]): string[] {
  const seen = cards.map((c) => c.set);
  const known = SET_ORDER.filter((s) => seen.includes(s));
  const extras = [...new Set(seen.filter((s) => s && !SET_ORDER.includes(s as never)))];
  return [...known, ...extras];
}

export default function App() {
  const { cards, owned, status, error, toggle, refresh, dismissError } = useCollection();
  const [query, setQuery] = useState('');
  const [ownership, setOwnership] = useState<OwnershipFilter>('all');
  const [language, setLanguage] = useState<LanguageFilter>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (q && !`${card.name} ${card.set} ${card.number}`.toLowerCase().includes(q)) return false;
      if (ownership === 'owned' && !owned.has(card.id)) return false;
      if (ownership === 'missing' && owned.has(card.id)) return false;
      if (language !== 'all' && card.language !== language) return false;
      return true;
    });
  }, [cards, query, ownership, language, owned]);

  const sections = useMemo(() => {
    const order = orderedSets(cards);
    return order
      .map((set) => ({
        set,
        cards: filtered.filter((c) => c.set === set),
        total: cards.filter((c) => c.set === set).length,
        ownedCount: cards.filter((c) => c.set === set && owned.has(c.id)).length,
      }))
      .filter((s) => s.cards.length > 0);
  }, [cards, filtered, owned]);

  const ownedTotal = owned.size;
  const total = cards.length;
  const pct = total === 0 ? 0 : Math.round((ownedTotal / total) * 100);
  const jpTotal = cards.filter((c) => c.language === 'JP').length;
  const jpOwned = cards.filter((c) => c.language === 'JP' && owned.has(c.id)).length;

  const showControls = cards.length > 0;

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
            {jpOwned} of {jpTotal} Japanese exclusives collected · synced with Google Sheets
          </p>
        </div>
      </header>

      {error && (
        <div className="banner banner-error" role="alert">
          <span>{error}</span>
          <div className="banner-actions">
            <button type="button" className="chip" onClick={refresh}>
              Retry
            </button>
            <button type="button" className="chip" onClick={dismissError} aria-label="Dismiss">
              ✕
            </button>
          </div>
        </div>
      )}

      {showControls && (
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
            <button type="button" className="chip" onClick={refresh}>
              Refresh
            </button>
          </div>
        </div>
      )}

      <main>
        {status === 'unconfigured' && (
          <div className="notice">
            <h2>Connect your Google Sheet</h2>
            <p>
              This tracker reads its cards and saves owned status in a Google Sheet. It isn’t
              connected yet.
            </p>
            <p>
              Follow <strong>SETUP.md</strong> in the repository: create the sheet, import{' '}
              <code>sheet-seed/cards.csv</code>, deploy the Apps Script Web App, and set the{' '}
              <code>VITE_SHEETS_API_URL</code> environment secret. Then re-run the deploy.
            </p>
          </div>
        )}

        {status === 'loading' && cards.length === 0 && (
          <p className="empty">Loading cards from your sheet…</p>
        )}

        {status === 'error' && cards.length === 0 && (
          <div className="notice">
            <h2>Couldn’t load the sheet</h2>
            <p>The card list couldn’t be fetched. Check the Apps Script deployment and try again.</p>
            <button type="button" className="chip" onClick={refresh}>
              Retry
            </button>
          </div>
        )}

        {showControls && sections.length === 0 && (
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
          Cards and owned status are stored in a Google Sheet and synced across your devices.
          Checking a card saves straight to the sheet. Card images © The Pokémon Company — served
          from public card databases.
        </p>
      </footer>
    </div>
  );
}
