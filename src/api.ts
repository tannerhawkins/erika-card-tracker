import type { ErikaCard } from './types';

/**
 * Client for the Google Sheets bridge (a Google Apps Script Web App).
 *
 * The Web App URL and optional token are injected at build time from GitHub
 * environment secrets (see SETUP.md). On a static site these end up in the
 * shipped JS by nature — the token is only a soft gate, and the real access
 * control is that the Apps Script exposes just these two operations.
 */

const RAW_URL = import.meta.env.VITE_SHEETS_API_URL ?? '';
const TOKEN = import.meta.env.VITE_SHEETS_API_TOKEN ?? '';

/** The dummy placeholder shipped in .env.example — treated as "not configured". */
const PLACEHOLDER = 'REPLACE_WITH_DEPLOYMENT_ID';

const CACHE_KEY = 'erika-cards-cache-v1';

export const SHEETS_API_URL = RAW_URL.trim();

/** True when a real Apps Script URL has been provided. */
export const isConfigured =
  SHEETS_API_URL.length > 0 && !SHEETS_API_URL.includes(PLACEHOLDER);

interface CardsResponse {
  cards?: unknown;
}

function normalizeCard(raw: unknown): ErikaCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!r.id) return null;

  const links = Array.isArray(r.links)
    ? r.links
        .filter((l): l is { label?: unknown; url?: unknown } => !!l && typeof l === 'object')
        .filter((l) => typeof l.url === 'string' && l.url)
        .map((l) => ({ label: String(l.label ?? 'Link'), url: String(l.url) }))
    : [];

  const yearNum = Number(r.year);

  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    set: String(r.set ?? ''),
    number: String(r.number ?? ''),
    variant: r.variant ? String(r.variant) : '',
    rarity: String(r.rarity ?? ''),
    year: Number.isFinite(yearNum) && r.year !== '' && r.year != null ? yearNum : null,
    category: String(r.category ?? ''),
    language: String(r.language ?? ''),
    notes: r.notes ? String(r.notes) : undefined,
    image: r.image ? String(r.image) : undefined,
    links,
    owned: r.owned === true || String(r.owned).toLowerCase() === 'true',
  };
}

function readCache(): ErikaCard[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(normalizeCard).filter((c): c is ErikaCard => c !== null);
  } catch {
    return null;
  }
}

function writeCache(cards: ErikaCard[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cards));
  } catch {
    // storage unavailable — non-fatal
  }
}

/** Last-known cards from localStorage, for instant paint before the fetch lands. */
export function cachedCards(): ErikaCard[] | null {
  return readCache();
}

/** Fetch the full card list (with owned flags) from the sheet. */
export async function fetchCards(): Promise<ErikaCard[]> {
  if (!isConfigured) throw new Error('Sheets API URL is not configured.');

  const res = await fetch(SHEETS_API_URL, { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error(`Sheet request failed (${res.status}).`);

  const data = (await res.json()) as CardsResponse;
  if (!Array.isArray(data.cards)) throw new Error('Unexpected response from the sheet.');

  const cards = data.cards.map(normalizeCard).filter((c): c is ErikaCard => c !== null);
  writeCache(cards);
  return cards;
}

/** Set the owned status of one card in the sheet. */
export async function setOwned(id: string, owned: boolean): Promise<void> {
  if (!isConfigured) throw new Error('Sheets API URL is not configured.');

  // text/plain keeps this a CORS "simple request" (no preflight) — Apps Script
  // reads the raw body via e.postData.contents and does not answer OPTIONS.
  const res = await fetch(SHEETS_API_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ id, owned, token: TOKEN }),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status}).`);

  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(data.error || 'Save was rejected by the sheet.');
}
