import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ErikaCard } from './types';
import { cachedCards, fetchCards, isConfigured, setOwned as apiSetOwned } from './api';

export type CollectionStatus = 'loading' | 'ready' | 'error' | 'unconfigured';

export interface Collection {
  cards: ErikaCard[];
  owned: Set<string>;
  status: CollectionStatus;
  error: string | null;
  /** Non-null while a save is retried in the background after a failed toggle. */
  toggle: (id: string) => void;
  refresh: () => void;
  dismissError: () => void;
}

/**
 * Loads cards (and their owned flags) from the Google Sheet and persists owned
 * toggles back to it. Owned status lives on each card, so the sheet is the one
 * source of truth; a localStorage cache only provides instant paint + offline
 * fallback.
 */
export function useCollection(): Collection {
  const [cards, setCards] = useState<ErikaCard[]>(() => cachedCards() ?? []);
  const [status, setStatus] = useState<CollectionStatus>(
    isConfigured ? 'loading' : 'unconfigured',
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured) {
      setStatus('unconfigured');
      return;
    }
    try {
      const fresh = await fetchCards();
      setCards(fresh);
      setStatus('ready');
      setError(null);
    } catch (err) {
      // Keep any cached cards on screen; just flag the failure.
      setStatus((prev) => (prev === 'loading' && cards.length === 0 ? 'error' : 'ready'));
      setError(err instanceof Error ? err.message : 'Could not reach the sheet.');
    }
  }, [cards.length]);

  useEffect(() => {
    void load();
    // Load once on mount; refresh() re-runs it on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const owned = useMemo(
    () => new Set(cards.filter((c) => c.owned).map((c) => c.id)),
    [cards],
  );

  const toggle = useCallback(
    (id: string) => {
      const current = cards.find((c) => c.id === id);
      if (!current) return;
      const next = !current.owned;

      // Optimistic: flip locally now for a snappy checkbox.
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, owned: next } : c)));

      apiSetOwned(id, next).catch((err) => {
        // Revert on failure and surface a dismissible banner.
        setCards((prev) => prev.map((c) => (c.id === id ? { ...c, owned: current.owned } : c)));
        setError(
          `Couldn't save "${current.name}" to the sheet: ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        );
      });
    },
    [cards],
  );

  const refresh = useCallback(() => {
    if (isConfigured) setStatus('loading');
    void load();
  }, [load]);

  const dismissError = useCallback(() => setError(null), []);

  return { cards, owned, status, error, toggle, refresh, dismissError };
}
