import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'erika-tracker-collection-v1';

function loadOwned(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((x): x is string => typeof x === 'string'));
    }
  } catch {
    // corrupted storage — start fresh
  }
  return new Set();
}

export function useCollection() {
  const [owned, setOwned] = useState<Set<string>>(loadOwned);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...owned]));
    } catch {
      // storage full or unavailable — checkbox state still works for the session
    }
  }, [owned]);

  const toggle = useCallback((id: string) => {
    setOwned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const replaceAll = useCallback((ids: string[]) => {
    setOwned(new Set(ids));
  }, []);

  return { owned, toggle, replaceAll };
}
