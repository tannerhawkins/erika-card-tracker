#!/usr/bin/env node
/**
 * Sync TCGPlayer market prices from the Pokémon TCG API (pokemontcg.io) into
 * the Google Sheet, for every row whose `price_set_id` (sheet-seed/cards.csv)
 * names a set that API covers. Meant to run on a schedule (see
 * .github/workflows/price-sync.yml) — pricing drifts over time independently
 * of the card list, so this is a separate job from sync-sheet.mjs.
 *
 * Coverage: the Pokémon TCG API is English-only, so `price_set_id` is blank
 * (and this script skips) for Japanese-exclusive cards and any set the API
 * hasn't indexed yet (e.g. a brand-new set). Those cards keep their existing
 * TCGPlayer/PriceCharting links for manual price lookup.
 *
 * Config (from the GitHub `production` environment, or your local env):
 *   SHEETS_API_URL       the Apps Script Web App URL (…/exec). Same value as
 *                        the VITE_SHEETS_API_URL secret.
 *   SHEETS_SYNC_TOKEN     the admin token; must match ADMIN_TOKEN in Code.gs.
 *                        Same secret the card-list sync already uses.
 *   POKEMONTCG_API_KEY   optional. A free key from pokemontcg.io raises the
 *                        rate limit; the script works without one, just slower.
 *
 * If SHEETS_API_URL/SHEETS_SYNC_TOKEN are missing or still the placeholder,
 * the script exits 0 (skips) so scheduled runs don't fail before the sheet is
 * connected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.join(__dirname, '..', 'sheet-seed', 'cards.csv');
const PLACEHOLDER = 'REPLACE_WITH_DEPLOYMENT_ID';
// Overridable for local testing against a mock server; defaults to the real API.
const API_BASE = (process.env.POKEMONTCG_API_BASE || 'https://api.pokemontcg.io/v2/cards').trim();

const sheetsUrl = (process.env.SHEETS_API_URL || '').trim();
const token = (process.env.SHEETS_SYNC_TOKEN || '').trim();
const apiKey = (process.env.POKEMONTCG_API_KEY || '').trim();

function skip(reason) {
  console.log(`sync-prices: skipping — ${reason}.`);
  process.exit(0);
}

if (!sheetsUrl || sheetsUrl.includes(PLACEHOLDER)) skip('SHEETS_API_URL is not configured');
if (!token) skip('SHEETS_SYNC_TOKEN is not set');

/** Minimal RFC-4180 CSV parser (handles quoted fields, commas, newlines). */
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); field = ''; row = []; }
    else if (ch === '\r') { /* ignore */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCsv(fs.readFileSync(CSV, 'utf8')).filter((r) => r.length > 1);
const header = rows[0];
const col = (name) => header.indexOf(name);
const cards = rows.slice(1).filter((r) => r[col('id')]).map((r) => ({
  id: r[col('id')],
  number: r[col('number')],
  variant: r[col('variant')] || '',
  priceSetId: r[col('price_set_id')] || '',
}));

const priceable = cards.filter((c) => c.priceSetId);
if (priceable.length === 0) {
  console.log('sync-prices: no rows have a price_set_id — nothing to do.');
  process.exit(0);
}

/** Leading integer of a card number ("003/217" → 3, "5/132" → 5). */
function leadingNumber(number) {
  const m = String(number || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// Finish keys to try, in priority order, per our variant label. The API's
// tcgplayer.prices object uses keys like "holofoil", "reverseHolofoil",
// "1stEditionHolofoil" — which finishes exist varies by card, so this always
// falls further back to "any available finish" rather than failing.
function finishCandidates(variant) {
  const v = variant.toLowerCase();
  if (v.includes('1st')) return ['1stEditionHolofoil', '1stEditionNormal'];
  if (v.includes('unlimited')) {
    return ['unlimitedHolofoil', 'holofoil', 'unlimitedNormal', 'normal', 'reverseHolofoil'];
  }
  if (v.includes('reverse')) return ['reverseHolofoil'];
  if (v === 'normal' || v === '') {
    return ['normal', 'unlimited', '1stEditionNormal', 'holofoil'];
  }
  // Unrecognized variant label (e.g. a promo pattern name) — try everything.
  return ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal', 'unlimitedHolofoil', 'unlimitedNormal'];
}

function pickPrice(prices, variant) {
  if (!prices || typeof prices !== 'object') return null;
  for (const key of finishCandidates(variant)) {
    const market = prices[key]?.market;
    if (typeof market === 'number' && Number.isFinite(market)) return market;
  }
  // Last resort: any finish with a usable market price.
  for (const key of Object.keys(prices)) {
    const market = prices[key]?.market;
    if (typeof market === 'number' && Number.isFinite(market)) return market;
  }
  return null;
}

/** "2026/07/15" → "2026-07-15"; passes through anything else unchanged. */
function normalizeDate(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  const m = String(d).match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(d);
}

const setIds = [...new Set(priceable.map((c) => c.priceSetId))];
console.log(`sync-prices: fetching ${setIds.length} set(s) for ${priceable.length} priceable printing(s)…`);

const headers = { Accept: 'application/json' };
if (apiKey) headers['X-Api-Key'] = apiKey;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The free/unauthenticated tier of the Pokémon TCG API appears to throttle
// bursts of requests (observed as HTTP 404 on later requests in a short
// sequence, not the 429 you'd expect from a typical rate limit). Retry with
// backoff and pace requests out to ride through that.
async function fetchSetWithRetry(setId) {
  const url = `${API_BASE}?q=${encodeURIComponent(`set.id:${setId}`)}&pageSize=250`;
  const attempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return res;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = `network error (${err instanceof Error ? err.message : 'unknown'})`;
    }
    if (attempt < attempts) await sleep(attempt * 1500); // 1.5s, then 3s
  }
  throw new Error(lastError || 'unknown fetch failure');
}

const results = []; // { id, price, updatedAt }
const failures = [];

for (const setId of setIds) {
  if (setIds.indexOf(setId) > 0) await sleep(500); // pace requests out
  let res;
  try {
    res = await fetchSetWithRetry(setId);
  } catch (err) {
    failures.push(`${setId}: ${err instanceof Error ? err.message : 'unknown error'}`);
    continue;
  }
  const data = await res.json().catch(() => null);
  const apiCards = Array.isArray(data?.data) ? data.data : [];
  if (apiCards.length === 0) {
    failures.push(`${setId}: no cards returned (set may not exist in the API yet)`);
    continue;
  }

  // Index by leading numeric card number for this set.
  const byNumber = new Map();
  for (const ac of apiCards) {
    const n = leadingNumber(ac.number);
    if (n != null) byNumber.set(n, ac);
  }

  for (const c of priceable.filter((x) => x.priceSetId === setId)) {
    const n = leadingNumber(c.number);
    const apiCard = n != null ? byNumber.get(n) : null;
    if (!apiCard) continue; // no matching card in this set — leave price untouched
    const price = pickPrice(apiCard.tcgplayer?.prices, c.variant);
    if (price == null) continue; // matched the card but no usable price for this finish
    results.push({ id: c.id, price, updatedAt: normalizeDate(apiCard.tcgplayer?.updatedAt) });
  }
}

if (failures.length > 0) {
  console.warn(`sync-prices: ${failures.length} set fetch issue(s):\n  ${failures.join('\n  ')}`);
}

if (results.length === 0) {
  console.log('sync-prices: no prices resolved — nothing to push.');
  process.exit(failures.length > 0 && failures.length === setIds.length ? 1 : 0);
}

console.log(`sync-prices: pushing ${results.length} price(s) (of ${priceable.length} priceable rows)…`);

const res = await fetch(sheetsUrl, {
  method: 'POST',
  redirect: 'follow',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ action: 'updatePrices', token, prices: results }),
});

if (!res.ok) {
  console.error(`sync-prices: HTTP ${res.status} from the Web App.`);
  process.exit(1);
}

const data = await res.json().catch(() => ({}));
if (!data.ok) {
  const hints = {
    // Reached the old single-toggle handler → the deployed Web App predates the updatePrices action.
    missing_id:
      'The Web App is running an older Code.gs without the updatePrices action. Re-paste the ' +
      'current apps-script/Code.gs, then update the EXISTING deployment: Deploy → Manage ' +
      'deployments → Edit → Version: New version → Deploy (do not create a new deployment).',
    missing_columns:
      'The sheet is missing the price / price_updated_at columns — run the card-list sync first ' +
      '(it adds them automatically), then redeploy the Apps Script (apps-script/Code.gs) if you ' +
      "haven't already.",
    unauthorized: 'SHEETS_SYNC_TOKEN does not match ADMIN_TOKEN in Code.gs.',
  };
  const hint = hints[data.error];
  console.error(`sync-prices: update rejected — ${data.error || 'unknown error'}.${hint ? ' ' + hint : ''}`);
  process.exit(1);
}

console.log(`sync-prices: done. ${data.updated} row(s) updated, ${data.skipped} id(s) not found in the sheet.`);
