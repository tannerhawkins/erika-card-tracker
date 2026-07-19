/**
 * Erika Card Tracker — Google Sheets bridge (Google Apps Script Web App).
 *
 * This script is the ONLY thing that touches the Google Sheet. It runs as YOU
 * (the sheet owner), so no Google credentials are ever exposed to the website.
 * The site just calls this Web App's URL to read cards and toggle owned status.
 *
 * ── One-time setup (see SETUP.md for screenshots-level detail) ───────────────
 *  1. Create a Google Sheet. Rename the first tab to exactly:  Cards
 *  2. File → Import → Upload  sheet-seed/cards.csv  → "Replace current sheet".
 *     (Header row + 43 cards. The `owned` column is TRUE/FALSE.)
 *  3. Extensions → Apps Script. Delete the sample, paste THIS file, Save.
 *  4. Deploy → New deployment → type "Web app":
 *        - Execute as:            Me
 *        - Who has access:        Anyone
 *     Deploy, authorize, and COPY the Web app URL (…/exec).
 *  5. Put that URL in the GitHub environment secret VITE_SHEETS_API_URL.
 *
 * ── Optional soft write-gate ────────────────────────────────────────────────
 *  Set SHARED_TOKEN below to a passphrase and set the same value in the
 *  GitHub secret VITE_SHEETS_API_TOKEN. Leave both blank for open access.
 *  (Note: on a static site the token ships in the page, so it only deters
 *  casual visitors — it is not strong security.)
 *
 * ── Deploy-time card sync (ADMIN_TOKEN) ─────────────────────────────────────
 *  The GitHub Actions deploy posts the repo's card list here to keep the sheet
 *  in sync (add new cards, refresh card details) WITHOUT touching the `owned`
 *  column of cards you already have. This is gated by ADMIN_TOKEN — a REAL
 *  secret that only lives in CI (never shipped to the browser). Set it below to
 *  a strong random string and store the same value in the GitHub environment
 *  secret SHEETS_SYNC_TOKEN. Leave it blank to disable the sync endpoint.
 */

var SHEET_NAME = 'Cards';
var SHARED_TOKEN = ''; // '' = open. Must match VITE_SHEETS_API_TOKEN if set.
var ADMIN_TOKEN = ''; // Strong secret for the deploy sync. Must match SHEETS_SYNC_TOKEN.

var HEADERS = [
  'id', 'name', 'set', 'number', 'rarity', 'year', 'category', 'language',
  'notes', 'image', 'link1_label', 'link1_url', 'link2_label', 'link2_url', 'owned',
];

function getSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet tab "' + SHEET_NAME + '" not found.');
  return sheet;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function truthy_(v) {
  if (v === true) return true;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'x' || s === 'owned';
}

function rowToCard_(headerIndex, row) {
  function cell(name) {
    var i = headerIndex[name];
    return i === undefined ? '' : row[i];
  }
  var links = [];
  if (cell('link1_url')) links.push({ label: String(cell('link1_label') || 'Link'), url: String(cell('link1_url')) });
  if (cell('link2_url')) links.push({ label: String(cell('link2_label') || 'Link'), url: String(cell('link2_url')) });

  var yearNum = parseInt(cell('year'), 10);
  return {
    id: String(cell('id')),
    name: String(cell('name')),
    set: String(cell('set')),
    number: String(cell('number')),
    rarity: String(cell('rarity')),
    year: isNaN(yearNum) ? null : yearNum,
    category: String(cell('category')),
    language: String(cell('language')),
    notes: cell('notes') ? String(cell('notes')) : undefined,
    image: cell('image') ? String(cell('image')) : undefined,
    links: links,
    owned: truthy_(cell('owned')),
  };
}

function headerIndex_(headerRow) {
  var idx = {};
  for (var i = 0; i < headerRow.length; i++) {
    idx[String(headerRow[i]).trim()] = i;
  }
  return idx;
}

/** GET → { cards: [...] } */
function doGet() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return json_({ cards: [] });

  var idx = headerIndex_(values[0]);
  var cards = [];
  for (var r = 1; r < values.length; r++) {
    if (!values[r][idx['id']]) continue; // skip blank rows
    cards.push(rowToCard_(idx, values[r]));
  }
  return json_({ cards: cards });
}

/**
 * POST handler. Two shapes:
 *   { id, owned, token? }            → flip one card's owned cell.
 *   { action: 'sync', token, cards } → bulk-upsert the card list (deploy sync).
 */
function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }

  if (body.action === 'sync') return handleSync_(body);

  if (SHARED_TOKEN && body.token !== SHARED_TOKEN) {
    return json_({ ok: false, error: 'unauthorized' });
  }
  if (!body.id) return json_({ ok: false, error: 'missing_id' });

  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  var idx = headerIndex_(values[0]);
  var idCol = idx['id'];
  var ownedCol = idx['owned'];
  if (idCol === undefined || ownedCol === undefined) {
    return json_({ ok: false, error: 'missing_columns' });
  }

  var ownedBool = truthy_(body.owned);
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idCol]) === String(body.id)) {
      // getRange is 1-based; +1 for the header row.
      sheet.getRange(r + 1, ownedCol + 1).setValue(ownedBool);
      return json_({ ok: true, id: body.id, owned: ownedBool });
    }
  }
  return json_({ ok: false, error: 'id_not_found', id: body.id });
}

/**
 * Bulk-upsert the card list from the repo (called by the deploy workflow).
 * The sheet is rewritten to mirror the incoming cards. For each card the `owned`
 * value is chosen as:
 *   - the EXISTING sheet value if the card is already in the sheet (so your live
 *     checkmarks are never lost), otherwise
 *   - the incoming card's `owned` value (lets the seed CSV pre-mark a starting
 *     collection when a card is new to the sheet, e.g. first-time population).
 * Cards no longer in the repo list are dropped. The `owned` column's checkbox
 * formatting is preserved because only cell contents are rewritten.
 */
function handleSync_(body) {
  if (!ADMIN_TOKEN || body.token !== ADMIN_TOKEN) {
    return json_({ ok: false, error: 'unauthorized' });
  }
  var cards = body.cards;
  if (!Array.isArray(cards) || cards.length === 0) {
    // Refuse to wipe the sheet on an empty/malformed payload.
    return json_({ ok: false, error: 'no_cards' });
  }

  var sheet = getSheet_();

  // Snapshot existing owned status by id.
  var ownedById = {};
  var existing = sheet.getDataRange().getValues();
  if (existing.length > 1) {
    var eIdx = headerIndex_(existing[0]);
    if (eIdx['id'] !== undefined && eIdx['owned'] !== undefined) {
      for (var r = 1; r < existing.length; r++) {
        var eid = existing[r][eIdx['id']];
        if (eid !== '' && eid !== null && eid !== undefined) {
          ownedById[String(eid)] = existing[r][eIdx['owned']];
        }
      }
    }
  }

  // Build the new grid: header + one row per incoming card.
  var added = 0;
  var preserved = 0;
  var grid = [HEADERS.slice()];
  for (var c = 0; c < cards.length; c++) {
    var card = cards[c] || {};
    var id = String(card.id == null ? '' : card.id);
    var hasPrev = Object.prototype.hasOwnProperty.call(ownedById, id);
    if (hasPrev) preserved++;
    else added++;

    // Existing card → keep the sheet's owned value; new card → use payload's.
    var ownedVal = truthy_(hasPrev ? ownedById[id] : card.owned);

    var row = HEADERS.map(function (h) {
      if (h === 'owned') return ownedVal;
      return card[h] == null ? '' : card[h];
    });
    grid.push(row);
  }

  // Rewrite the sheet. clearContents keeps column formatting (checkboxes).
  sheet.clearContents();
  sheet.getRange(1, 1, grid.length, HEADERS.length).setValues(grid);

  return json_({ ok: true, total: cards.length, added: added, preserved: preserved });
}
