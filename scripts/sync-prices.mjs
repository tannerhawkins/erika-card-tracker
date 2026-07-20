#!/usr/bin/env node
/**
 * Sync market prices from the JustTCG API (https://justtcg.com) into the
 * Google Sheet's `price` / `price_updated_at` columns, one price per printing.
 * Meant to run on a schedule (see .github/workflows/price-sync.yml) — pricing
 * drifts over time independently of the card list, so this is a separate job
 * from sync-sheet.mjs.
 *
 * Two lookup strategies, tried per row:
 *   1. Precise: rows with a `tcgplayer_id` (sheet-seed/cards.csv) are looked
 *      up directly by TCGPlayer product ID, batched up to 20 per request
 *      (the free-tier cap). This is exact — no name/number guessing.
 *   2. Fallback: rows without a `tcgplayer_id` are looked up by name + game
 *      (game is derived from the `language` column: EN -> "pokemon",
 *      JP -> "pokemon-japan" — JustTCG added full Japanese OCG pricing in
 *      2025). One request per row, since JustTCG's search endpoint takes a
 *      single query rather than a batch.
 *
 * Either way, once a candidate card is found, its `variants[]` array (each
 * `{condition, printing, price, lastUpdated}`) is matched against our
 * variant label. A card with sibling printings (1st Edition / Unlimited,
 * Normal / Reverse Holo) requires an EXACT printing match — no falling back
 * to a generic/different printing's price, since that would make distinct
 * printings look identically priced. Single-printing cards accept the best
 * available variant (preferring Near Mint), since there's no sibling to
 * misattribute a price to.
 *
 * Config (from the GitHub `production` environment, or your local env):
 *   SHEETS_API_URL      the Apps Script Web App URL (…/exec). Same value as
 *                       the VITE_SHEETS_API_URL secret.
 *   SHEETS_SYNC_TOKEN    the admin token; must match ADMIN_TOKEN in Code.gs.
 *                       Same secret the card-list sync already uses.
 *   JUSTTCG_API_KEY     required. Free at https://justtcg.com — 100
 *                       requests/day, 20 cards per batch request.
 *
 * If any of these are missing or SHEETS_API_URL is still the placeholder,
 * the script exits 0 (skips) so scheduled runs don't fail before things are
 * connected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.join(__dirname, '..', 'sheet-seed', 'cards.csv');
const PLACEHOLDER = 'REPLACE_WITH_DEPLOYMENT_ID';
// Overridable for local testing against a mock server; defaults to the real API.
const API_BASE = (process.env.JUSTTCG_API_BASE || 'https://api.justtcg.com/v1/cards').trim();

const sheetsUrl = (process.env.SHEETS_API_URL || '').trim();
const token = (process.env.SHEETS_SYNC_TOKEN || '').trim();
const apiKey = (process.env.JUSTTCG_API_KEY || '').trim();

function skip(reason) {
  console.log(`sync-prices: skipping — ${reason}.`);
  process.exit(0);
}

if (!sheetsUrl || sheetsUrl.includes(PLACEHOLDER)) skip('SHEETS_API_URL is not configured');
if (!token) skip('SHEETS_SYNC_TOKEN is not set');
if (!apiKey) skip('JUSTTCG_API_KEY is not set (get a free key at https://justtcg.com)');

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
const allCards = rows.slice(1).filter((r) => r[col('id')]).map((r) => ({
  id: r[col('id')],
  name: r[col('name')],
  set: r[col('set')],
  number: r[col('number')],
  variant: r[col('variant')] || '',
  language: r[col('language')] || 'EN',
  tcgplayerId: r[col('tcgplayer_id')] || '',
}));

if (allCards.length === 0) {
  console.log('sync-prices: no cards found in the CSV — nothing to do.');
  process.exit(0);
}

// A card "has siblings" when more than one row shares its set + name (e.g. a
// 1st Edition row and an Unlimited row for the same card) — those require an
// exact printing match (see pickVariant's `strict` behavior below).
const cardKey = (c) => `${c.set}::${c.name}`;
const siblingCounts = new Map();
for (const c of allCards) {
  const k = cardKey(c);
  siblingCounts.set(k, (siblingCounts.get(k) || 0) + 1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callApi(url, options) {
  const attempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers: { 'x-api-key': apiKey, ...options?.headers } });
      if (res.ok) return await res.json();
      lastError = `HTTP ${res.status}`;
      if (res.status === 429 && attempt < attempts) await sleep(attempt * 3000); // back off harder on rate limit
    } catch (err) {
      lastError = `network error (${err instanceof Error ? err.message : 'unknown'})`;
    }
    if (attempt < attempts) await sleep(attempt * 1500);
  }
  throw new Error(lastError || 'unknown fetch failure');
}

// Which printing labels count as a match for our variant label. A card with
// sibling printings must match one of these exactly (case-insensitive
// substring) — no falling back to "whatever's available" (see pickVariant).
function printingMatches(justtcgPrinting, ourVariant) {
  const p = String(justtcgPrinting || '').toLowerCase();
  const v = ourVariant.toLowerCase();
  if (v.includes('1st')) return p.includes('1st edition');
  if (v.includes('unlimited')) return p.includes('unlimited') || (!p.includes('1st edition') && !p.includes('reverse'));
  if (v.includes('reverse')) return p.includes('reverse');
  if (v === 'normal') return p === 'normal' || (!p.includes('reverse') && !p.includes('1st edition') && !p.includes('unlimited'));
  return true; // unrecognized label (promo pattern names etc.) — accept any printing
}

const CONDITION_PRIORITY = ['near mint', 'nm', 'lightly played', 'lp'];
function conditionRank(condition) {
  const c = String(condition || '').toLowerCase();
  const i = CONDITION_PRIORITY.findIndex((p) => c.includes(p));
  return i === -1 ? CONDITION_PRIORITY.length : i;
}

/**
 * @param strict When true (card has sibling printings), only variants whose
 *   printing matches our label are considered — never "any available
 *   variant" — so a card missing data for this exact printing is left blank
 *   rather than borrowing a sibling printing's price.
 */
function pickVariant(variants, ourVariant, strict) {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const usable = variants.filter((v) => typeof v?.price === 'number' && Number.isFinite(v.price));
  const matching = usable.filter((v) => printingMatches(v.printing, ourVariant));
  const pool = matching.length > 0 ? matching : strict ? [] : usable;
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => conditionRank(a.condition) - conditionRank(b.condition))[0];
}

/** Unix seconds -> "YYYY-MM-DD"; falls back to today if missing/invalid. */
function normalizeDate(unixSeconds) {
  const n = Number(unixSeconds);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString().slice(0, 10);
  return new Date(n * 1000).toISOString().slice(0, 10);
}

const results = []; // { id, price, updatedAt }
let unresolved = 0;
let requestCount = 0;
const failures = [];

// ── Strategy 1: precise batch lookup by tcgplayer_id ────────────────────────
const withId = allCards.filter((c) => c.tcgplayerId);
const BATCH_SIZE = 20; // free-tier cap on cards per request
for (let i = 0; i < withId.length; i += BATCH_SIZE) {
  const batch = withId.slice(i, i + BATCH_SIZE);
  if (i > 0) await sleep(500);
  requestCount++;
  let data;
  try {
    data = await callApi(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map((c) => ({ tcgplayerId: c.tcgplayerId }))),
    });
  } catch (err) {
    failures.push(`batch lookup (${batch.length} ids): ${err instanceof Error ? err.message : 'unknown error'}`);
    continue;
  }
  const found = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  const byTcgplayerId = new Map(found.map((f) => [String(f.tcgplayerId), f]));
  for (const c of batch) {
    const card = byTcgplayerId.get(String(c.tcgplayerId));
    if (!card) { unresolved++; continue; }
    const strict = (siblingCounts.get(cardKey(c)) || 0) > 1;
    const variant = pickVariant(card.variants, c.variant, strict);
    if (!variant) { unresolved++; continue; }
    results.push({ id: c.id, price: variant.price, updatedAt: normalizeDate(variant.lastUpdated) });
  }
}

// ── Strategy 2: name-search fallback for rows without a tcgplayer_id ────────
const needsSearch = allCards.filter((c) => !c.tcgplayerId);
for (const c of needsSearch) {
  await sleep(350); // pace individual search requests
  requestCount++;
  const game = c.language === 'JP' ? 'pokemon-japan' : 'pokemon';
  const url = `${API_BASE}?q=${encodeURIComponent(c.name)}&game=${game}`;
  let data;
  try {
    data = await callApi(url);
  } catch (err) {
    failures.push(`search "${c.name}" (${c.id}): ${err instanceof Error ? err.message : 'unknown error'}`);
    continue;
  }
  const found = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  // Prefer an exact (case-insensitive) name match; otherwise the top result.
  const card = found.find((f) => String(f?.name || '').toLowerCase() === c.name.toLowerCase()) || found[0];
  if (!card) { unresolved++; continue; }
  const strict = (siblingCounts.get(cardKey(c)) || 0) > 1;
  const variant = pickVariant(card.variants, c.variant, strict);
  if (!variant) { unresolved++; continue; }
  results.push({ id: c.id, price: variant.price, updatedAt: normalizeDate(variant.lastUpdated) });
}

console.log(`sync-prices: made ${requestCount} API request(s) for ${allCards.length} printing(s) (${withId.length} by id, ${needsSearch.length} by search).`);
if (failures.length > 0) {
  console.warn(`sync-prices: ${failures.length} request issue(s):\n  ${failures.slice(0, 10).join('\n  ')}${failures.length > 10 ? `\n  …and ${failures.length - 10} more` : ''}`);
}
if (unresolved > 0) {
  console.log(`sync-prices: ${unresolved} row(s) had no exact-enough match and were left blank.`);
}

if (results.length === 0) {
  console.log('sync-prices: no prices resolved — nothing to push.');
  process.exit(failures.length >= requestCount && requestCount > 0 ? 1 : 0);
}

console.log(`sync-prices: pushing ${results.length} price(s)…`);

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

const sheetData = await res.json().catch(() => ({}));
if (!sheetData.ok) {
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
  const hint = hints[sheetData.error];
  console.error(`sync-prices: update rejected — ${sheetData.error || 'unknown error'}.${hint ? ' ' + hint : ''}`);
  process.exit(1);
}

console.log(`sync-prices: done. ${sheetData.updated} row(s) updated, ${sheetData.skipped} id(s) not found in the sheet.`);
