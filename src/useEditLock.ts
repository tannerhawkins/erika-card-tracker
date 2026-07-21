import { useCallback, useState } from 'react';

const STORAGE_KEY = 'erika-edit-unlocked';
const PASSCODE = (import.meta.env.VITE_EDIT_PASSCODE ?? '').trim();

/** True when a real passcode has been configured for this deployment. */
export const editLockConfigured = PASSCODE.length > 0;

function readPersisted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export interface EditLock {
  locked: boolean;
  /** Checks `attempt` against the configured passcode; unlocks and persists on match. */
  unlock: (attempt: string) => boolean;
  lock: () => void;
}

/**
 * Soft, client-side edit gate for the owned checkboxes. NOT real security —
 * this is a static site, so the configured passcode ships inside the built JS
 * like any other VITE_ value. It just keeps casual taps on someone else's
 * device (or by a visitor) from flipping owned status by accident.
 */
export function useEditLock(): EditLock {
  const [locked, setLocked] = useState(() => editLockConfigured && !readPersisted());

  const unlock = useCallback((attempt: string) => {
    if (!editLockConfigured || attempt !== PASSCODE) return false;
    setLocked(false);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // storage unavailable — unlock still applies for this session
    }
    return true;
  }, []);

  const lock = useCallback(() => {
    setLocked(true);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { locked, unlock, lock };
}
