#!/usr/bin/env node
/**
 * Push the repo's card list (sheet-seed/cards.csv) into the Google Sheet via
 * the Apps Script Web App's authenticated `sync` action. The Apps Script
 * upserts the cards and PRESERVES the `owned` value of every card already in
 * the sheet (matched by id), so running this on every deploy never loses your
 * collection progress.
 *
 * Config (from the GitHub `production` environment, or your local env):
 *   SHEETS_API_URL     the Apps Script Web App URL (…/exec). Reuses the value
 *                      of the VITE_SHEETS_API_URL secret.
 *   SHEETS_SYNC_TOKEN  the admin token; must match ADMIN_TOKEN in Code.gs.
 *
 * If either is missing or still the placeholder, the script exits 0 (skips) so
 * deploys don't fail before the sheet is connected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.join(__dirname, '..', 'sheet-seed', 'cards.csv');
const PLACEHOLDER = 'REPLACE_WITH_DEPLOYMENT_ID';

const url = (process.env.SHEETS_API_URL || '').trim();
const token = (process.env.SHEETS_SYNC_TOKEN || '').trim();

function skip(reason) {
  console.log(`sync-sheet: skipping — ${reason}.`);
  process.exit(0);
}

if (!url || url.includes(PLACEHOLDER)) skip('SHEETS_API_URL is not configured');
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
// Send every column, INCLUDING owned. The Apps Script keeps the sheet's own
// owned value for cards it already has (your live checkmarks are never lost),
// and uses this CSV `owned` value only to seed cards that are new to the sheet.
const cards = rows.slice(1)
  .filter((r) => r[0]) // must have an id
  .map((r) => {
    const card = {};
    header.forEach((h, i) => {
      card[h] = r[i] ?? '';
    });
    return card;
  });

if (cards.length === 0) {
  console.error('sync-sheet: refusing to sync an empty card list.');
  process.exit(1);
}

console.log(`sync-sheet: pushing ${cards.length} cards to the sheet…`);

const res = await fetch(url, {
  method: 'POST',
  redirect: 'follow',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ action: 'sync', token, cards }),
});

if (!res.ok) {
  console.error(`sync-sheet: HTTP ${res.status} from the Web App.`);
  process.exit(1);
}

const data = await res.json().catch(() => ({}));
if (!data.ok) {
  const hints = {
    // Reached the old single-toggle handler → the deployed Web App predates the sync endpoint.
    missing_id:
      'The Web App is running an older Code.gs without the sync endpoint. Re-paste the current ' +
      'apps-script/Code.gs, then update the EXISTING deployment: Deploy → Manage deployments → ' +
      'Edit → Version: New version → Deploy (do not create a new deployment — it mints a new URL).',
    bad_json: 'The Web App could not parse the request body.',
    unauthorized: 'SHEETS_SYNC_TOKEN does not match ADMIN_TOKEN in Code.gs.',
    no_cards: 'The payload contained no cards.',
    missing_columns: 'The sheet is missing required columns — re-import sheet-seed/cards.csv.',
  };
  const hint = hints[data.error];
  console.error(`sync-sheet: sync rejected — ${data.error || 'unknown error'}.${hint ? ' ' + hint : ''}`);
  process.exit(1);
}

console.log(
  `sync-sheet: done. ${data.total} cards in sheet — ${data.added} added, ${data.preserved} kept (owned preserved).`,
);
