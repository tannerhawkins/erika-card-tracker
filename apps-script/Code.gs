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
 */

var SHEET_NAME = 'Cards';
var SHARED_TOKEN = ''; // '' = open. Must match VITE_SHEETS_API_TOKEN if set.

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

/** POST { id, owned, token? } → { ok, id, owned } — flips the owned cell. */
function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }

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
