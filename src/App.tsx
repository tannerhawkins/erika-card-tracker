import { useMemo, useState } from 'react';
import './App.css';
import { SET_ORDER } from './data/cards';
import type { ErikaCard } from './types';
import { useCollection } from './useCollection';

type OwnershipFilter = 'all' | 'owned' | 'missing';
type LanguageFilter = 'all' | 'EN' | 'JP';

/** One tile = one card; its variant rows share set + number + name. */
interface CardGroup {
  key: string;
  base: ErikaCard;
  variants: ErikaCard[];
}

/** Group variant rows (same set + number + name) into one card, preserving order. */
function buildGroups(cards: ErikaCard[]): CardGroup[] {
  const groups: CardGroup[] = [];
  const byKey = new Map<string, CardGroup>();
  for (const card of cards) {
    const key = `${card.set}|||${card.number}|||${card.name}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, base: card, variants: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.variants.push(card);
  }
  return groups;
}

const groupOwned = (g: CardGroup, owned: Set<string>) =>
  g.variants.some((v) => owned.has(v.id));

interface ValueStats {
  value: number;
  costToComplete: number;
  missingPriceGroups: number;
}

/** Owned value (sum of owned variants' prices) and cost to complete (cheapest missing variant per unowned card). */
function computeValueStats(groups: CardGroup[], owned: Set<string>): ValueStats {
  let value = 0;
  let costToComplete = 0;
  let missingPriceGroups = 0;
  for (const g of groups) {
    if (groupOwned(g, owned)) {
      for (const v of g.variants) {
        if (owned.has(v.id) && v.price != null) value += v.price;
      }
    } else {
      const prices = g.variants.map((v) => v.price).filter((p): p is number => p != null);
      if (prices.length === 0) {
        missingPriceGroups += 1;
      } else {
        costToComplete += Math.min(...prices);
      }
    }
  }
  return { value, costToComplete, missingPriceGroups };
}

/** Leading integer of a card number ("003/217" → 3); non-numeric sorts last. */
function cardNumberValue(number: string): number {
  const match = number.match(/\d+/);
  return match ? parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
}

/** Order card groups within a section by card number, then name as a tiebreak. */
function byNumber(a: CardGroup, b: CardGroup): number {
  const na = cardNumberValue(a.base.number);
  const nb = cardNumberValue(b.base.number);
  if (na !== nb) return na - nb;
  return a.base.number.localeCompare(b.base.number) || a.base.name.localeCompare(b.base.name);
}

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
  group,
  owned,
  onToggle,
}: {
  group: CardGroup;
  owned: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { base, variants } = group;
  const isOwned = groupOwned(group, owned);
  const single = variants.length === 1 && !variants[0].variant;
  const ownedCount = variants.filter((v) => owned.has(v.id)).length;
  const meta = [base.set, `#${base.number}`, base.rarity, base.year ?? undefined]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className={`card-tile${isOwned ? ' owned' : ''}`}>
      <CardImage card={base} />
      <div className="card-body">
        <h3 className="card-name">{base.name}</h3>
        <p className="card-meta">{meta}</p>
        <p className="card-badges">
          {base.category && <span className="badge">{base.category}</span>}
          {base.language === 'JP' && <span className="badge badge-jp">Japanese exclusive</span>}
        </p>
        {base.notes && <p className="card-notes">{base.notes}</p>}
        {base.links.length > 0 && (
          <p className="card-links">
            {base.links.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noreferrer noopener">
                {link.label} ↗
              </a>
            ))}
          </p>
        )}

        <div className="variants">
          {!single && (
            <p className="variants-title">
              Printings <span className="variants-count">{ownedCount}/{variants.length}</span>
            </p>
          )}
          {variants.map((v) => {
            const vOwned = owned.has(v.id);
            const cbId = `own-${v.id}`;
            const label = single
              ? vOwned
                ? 'In my collection'
                : 'I have this card'
              : v.variant || 'Standard';
            return (
              <label
                key={v.id}
                className={`variant-row${vOwned ? ' owned' : ''}`}
                htmlFor={cbId}
              >
                <input
                  id={cbId}
                  type="checkbox"
                  checked={vOwned}
                  onChange={() => onToggle(v.id)}
                />
                <span className="variant-label">{label}</span>
                {v.price != null && (
                  <span
                    className="variant-price"
                    title={
                      v.priceUpdatedAt
                        ? `TCGPlayer market price as of ${v.priceUpdatedAt}`
                        : 'TCGPlayer market price'
                    }
                  >
                    ${v.price.toFixed(2)}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </article>
  );
}

/** SET_ORDER first, then any sets present in the sheet but not listed, first-seen. */
function orderedSets(groups: CardGroup[]): string[] {
  const seen = groups.map((g) => g.base.set);
  const known = SET_ORDER.filter((s) => seen.includes(s));
  const extras = [...new Set(seen.filter((s) => s && !SET_ORDER.includes(s as never)))];
  return [...known, ...extras];
}

export default function App() {
  const { cards, owned, status, error, toggle, refresh, dismissError } = useCollection();
  const [query, setQuery] = useState('');
  const [ownership, setOwnership] = useState<OwnershipFilter>('all');
  const [language, setLanguage] = useState<LanguageFilter>('all');

  const groups = useMemo(() => buildGroups(cards), [cards]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      const b = g.base;
      if (q && !`${b.name} ${b.set} ${b.number}`.toLowerCase().includes(q)) return false;
      const isOwned = groupOwned(g, owned);
      if (ownership === 'owned' && !isOwned) return false;
      if (ownership === 'missing' && isOwned) return false;
      if (language !== 'all' && b.language !== language) return false;
      return true;
    });
  }, [groups, query, ownership, language, owned]);

  const sections = useMemo(() => {
    const order = orderedSets(groups);
    return order
      .map((set) => {
        const setGroups = groups.filter((g) => g.base.set === set);
        return {
          set,
          groups: filtered.filter((g) => g.base.set === set).sort(byNumber),
          total: setGroups.length,
          ownedCount: setGroups.filter((g) => groupOwned(g, owned)).length,
          ...computeValueStats(setGroups, owned),
        };
      })
      .filter((s) => s.groups.length > 0);
  }, [groups, filtered, owned]);

  const totalCards = groups.length;
  const ownedCards = groups.filter((g) => groupOwned(g, owned)).length;
  const pct = totalCards === 0 ? 0 : Math.round((ownedCards / totalCards) * 100);
  const totalPrintings = cards.length;
  const ownedPrintings = owned.size;
  const jpTotal = groups.filter((g) => g.base.language === 'JP').length;
  const jpOwned = groups.filter((g) => g.base.language === 'JP' && groupOwned(g, owned)).length;

  const {
    value: collectionValue,
    costToComplete,
    missingPriceGroups,
  } = useMemo(() => computeValueStats(groups, owned), [groups, owned]);

  const currency = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

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
              {ownedCards} <span className="progress-of">of {totalCards} cards</span>
            </span>
            <span className="progress-pct">{pct}%</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalCards}
            aria-valuenow={ownedCards}
            aria-label="Collection progress"
          >
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="progress-detail">
            {ownedPrintings} of {totalPrintings} printings collected · {jpOwned} of {jpTotal}{' '}
            Japanese exclusives · synced with Google Sheets
          </p>
        </div>

        <div className="value-stats">
          <div className="value-stat">
            <span className="value-stat-label">Collection value</span>
            <span className="value-stat-amount">{currency(collectionValue)}</span>
          </div>
          <div className="value-stat">
            <span className="value-stat-label">To complete collection</span>
            <span className="value-stat-amount">{currency(costToComplete)}</span>
            {missingPriceGroups > 0 && (
              <span className="value-stat-note">
                {missingPriceGroups} missing card{missingPriceGroups === 1 ? '' : 's'} have no
                price data
              </span>
            )}
          </div>
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
          <details key={section.set} className="set-section" open>
            <summary className="set-title">
              {section.set}
              <span className="set-progress">
                {section.ownedCount} / {section.total}
              </span>
            </summary>
            <p className="set-value-line">
              {currency(section.value)} owned · {currency(section.costToComplete)} to complete
              {section.missingPriceGroups > 0 && (
                <span className="set-value-note">
                  {' '}
                  · {section.missingPriceGroups} missing card
                  {section.missingPriceGroups === 1 ? '' : 's'} have no price data
                </span>
              )}
            </p>
            <div className="card-grid">
              {section.groups.map((group) => (
                <CardTile key={group.key} group={group} owned={owned} onToggle={toggle} />
              ))}
            </div>
          </details>
        ))}
      </main>

      <footer className="footer">
        <p>
          Cards and owned status are stored in a Google Sheet and synced across your devices. Each
          card lists its printings — check the ones you own and it saves straight to the sheet.
          Prices are TCGPlayer market prices, synced weekly where available (not every printing has
          pricing data). Card images © The Pokémon Company — served from public card databases.
        </p>
      </footer>
    </div>
  );
}
