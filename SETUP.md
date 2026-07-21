# Setup — connecting the tracker to Google Sheets

The app reads its card list and stores owned status in a **Google Sheet**. A tiny
**Google Apps Script Web App** (deployed from your own Google account) is the bridge —
it runs as you and is the only thing that touches the sheet, so **no Google credentials
ever reach the browser**. The website just calls one URL.

You'll do this once. ~10 minutes.

---

## 1. Create the sheet and import the cards

1. Go to <https://sheets.new> to create a new Google Sheet. Give it any name.
2. Rename the first tab to exactly **`Cards`** (double-click the tab at the bottom).
3. **File → Import → Upload**, and drop in [`sheet-seed/cards.csv`](sheet-seed/cards.csv)
   from this repo.
   - Import location: **Replace current sheet**
   - Separator type: **Comma**
   - Leave "Convert text to numbers/dates" on.
4. You should now have a header row plus one row per printing. The `owned` column is
   `FALSE` by default. (Tip: select the `owned` column → **Format → Number → Checkbox**
   to get real checkboxes you can also tick from inside the sheet.)

> To add a new card later, just add a row and fill in the columns. To manage links, use
> `link1_label` / `link1_url` and `link2_label` / `link2_url`. The `tcgplayer_id` column
> is only used by the price sync (step 7) — it's the numeric id from a
> `tcgplayer.com/product/<id>` URL, giving that row exact pricing. Leave it blank and the
> price sync will look the card up by name instead (slightly less precise, but automatic).

## 2. Add the Apps Script

1. In the sheet: **Extensions → Apps Script**.
2. Delete the sample `function myFunction() {}` and paste the entire contents of
   [`apps-script/Code.gs`](apps-script/Code.gs) from this repo.
3. Click **Save** (💾).

## 3. Deploy it as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Configure:
   - **Description**: `erika tracker` (anything)
   - **Execute as**: **Me**
   - **Who has access**: **Anyone**
4. Click **Deploy**. Approve the authorization prompt (choose your account →
   Advanced → "Go to … (unsafe)" → Allow — this is Google warning about your *own*
   script; it's fine).
5. Copy the **Web app URL**. It looks like:
   `https://script.google.com/macros/s/AKfy…long-id…/exec`

> Test it: paste the URL into a browser. You should see JSON starting with
> `{"cards":[…]}`.

## 4. Store the URL as a GitHub environment secret

1. In GitHub: **repo → Settings → Environments**.
2. Click **New environment**, name it exactly **`production`**, and create it.
3. In that environment, under **Environment secrets → Add secret**:
   - Name: **`VITE_SHEETS_API_URL`**
   - Value: the Web app URL from step 3.
4. *(Optional)* If you set a `SHARED_TOKEN` in `Code.gs` to gate writes, also add
   **`VITE_SHEETS_API_TOKEN`** with the same value. Leave it out for open access.

## 5. (Recommended) Turn on automatic card sync

This makes every deploy push the repo's card list into your sheet — adding newly
discovered cards and refreshing card details — **without touching the `owned`
status of cards you already have**. So you never re-import the CSV by hand.

1. Pick a strong random string as your admin token (e.g. from a password
   manager).
2. In the Apps Script editor, set `ADMIN_TOKEN` near the top of `Code.gs` to that
   string, **Save**, then **Deploy → Manage deployments → Edit → Version: New
   version → Deploy** (redeploys the same URL).
3. In GitHub → the **`production`** environment, add an environment secret:
   - Name: **`SHEETS_SYNC_TOKEN`**
   - Value: the same admin token.

`SHEETS_SYNC_TOKEN` is a **real secret** — it only ever runs inside GitHub
Actions and is never shipped to the browser (no `VITE_` prefix). Leave
`ADMIN_TOKEN` blank / the secret unset to keep auto-sync off; the deploy's
sync step then skips itself cleanly.

## 6. Redeploy the site

- **repo → Actions → "Deploy to GitHub Pages" → Run workflow** (or just push any
  commit to `main`). The build injects your secret and ships the connected app,
  and the `sync-sheet` job upserts the card list into your sheet.
- Visit <https://tannerhawkins.github.io/erika-card-tracker/>. Cards load from the
  sheet, and ticking a card writes `TRUE`/`FALSE` back to the `owned` column.

> First-time note: if you already imported an older `cards.csv` by hand, the first
> synced deploy will add the newer cards and keep your existing checkmarks. If you
> never imported, the sync populates the sheet from scratch (all unchecked).

## 7. Turn on the weekly price sync

A separate scheduled workflow, [`price-sync.yml`](.github/workflows/price-sync.yml),
fetches market prices from the [JustTCG API](https://justtcg.com) and writes them into
your sheet's `price` / `price_updated_at` columns — one price per printing (so 1st
Edition and Unlimited, or Normal and Reverse Holo, each get their own price, never a
shared/guessed one). It reuses the **same** `VITE_SHEETS_API_URL` and `SHEETS_SYNC_TOKEN`
secrets from step 5.

1. Sign up for a free account at <https://justtcg.com> and grab your API key (free tier:
   100 requests/day, which comfortably covers this collection's ~104 printings once a
   day).
2. In GitHub → the **`production`** environment, add an environment secret:
   - Name: **`JUSTTCG_API_KEY`**
   - Value: your key.

That's it — no other config needed. `JUSTTCG_API_KEY` is required (unlike the old
optional pokemontcg.io key); without it the sync just skips itself cleanly.

- Runs automatically once a day, and can be triggered manually any time from **Actions →
  "Sync card prices" → Run workflow**.
- Lookup strategy: rows with a `tcgplayer_id` (see step 1) are looked up exactly by
  TCGPlayer product id; everything else is looked up by card name (and, for
  Japanese-exclusive cards, the `pokemon-japan` game — JustTCG added full Japanese OCG
  pricing in 2025, so this is the one part of the pipeline that can price those cards at
  all). A row with sibling printings only gets a price when JustTCG has an exact
  printing-level match for it — never a generic/borrowed price from a sibling.
- Some rows will still come back blank — that means the source genuinely doesn't track a
  distinct price for that exact printing (common for lower-value Gym Heroes/Challenge
  commons), not that the sync failed. Those cards keep their TCGPlayer/PriceCharting
  links for manual lookup.

## 8. (Optional) Lock editing behind a passcode

By default anyone who loads the site can tick/untick owned status. If you'd rather keep
it browsable-but-locked until you enter a passcode (e.g. so a stranger — or your own
stray tap — can't flip your checkboxes), set one:

1. In GitHub → the **`production`** environment, add an environment secret:
   - Name: **`EDIT_PASSCODE`**
   - Value: any passcode you like.
2. Redeploy (push to `main`, or **Actions → "Deploy to GitHub Pages" → Run workflow**).

Once set, the site loads with an unlock icon (🔒) in the top-right corner of the header.
Tapping it opens a small passcode field; entering the correct value unlocks editing for
that browser and is remembered (`localStorage`) until you tap the icon again to re-lock.
Leave `EDIT_PASSCODE` unset (the default) and the lock is skipped entirely — editing
stays open, same as before.

**Note:** like every other `VITE_`-prefixed value in this project, this is a **static
site**, so the passcode ends up inside the shipped JavaScript and is visible to anyone
who inspects the page. It's a friction/deterrent against casual or accidental edits —
not real authentication. Don't reuse a passcode you use anywhere sensitive.

---

## Local development

```bash
cp .env.example .env
# edit .env and set VITE_SHEETS_API_URL to your Web app URL
npm install
npm run dev
```

## Where the values live

| Value | Placeholder in repo | Where you provide the real value |
|---|---|---|
| Apps Script Web App URL | `.env.example` → `REPLACE_WITH_DEPLOYMENT_ID` | GitHub environment secret `VITE_SHEETS_API_URL` (and `.env` locally) |
| Optional write token | `.env.example` → blank | GitHub environment secret `VITE_SHEETS_API_TOKEN` + `SHARED_TOKEN` in `Code.gs` |
| Deploy-sync admin token | `Code.gs` → `ADMIN_TOKEN = ''` | GitHub environment secret `SHEETS_SYNC_TOKEN` + `ADMIN_TOKEN` in `Code.gs` (also gates the price sync) |
| JustTCG API key (required for price sync) | — | GitHub environment secret `JUSTTCG_API_KEY` |
| Edit passcode (optional) | `.env.example` → blank | GitHub environment secret `EDIT_PASSCODE` (injected as `VITE_EDIT_PASSCODE`) |

**No sensitive keys are committed.** The Web App URL and the two tokens all live in
GitHub secrets / your own Apps Script, never in the repo. The Web App URL is injected at
build time and — because this is a static site — is visible in the shipped page by
design; the Apps Script only exposes reading cards, toggling one owned flag, and (gated
by the admin token) the deploy sync. The `SHEETS_SYNC_TOKEN` is the one genuinely secret
value, and it stays inside GitHub Actions — it is never bundled into the site.
