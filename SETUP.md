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
> `link1_label` / `link1_url` and `link2_label` / `link2_url`. The `price_set_id` column
> is only used by the price sync (step 7) — leave it blank unless you know the card's
> [Pokémon TCG API](https://pokemontcg.io) set code.

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

## 7. (Optional) Turn on the nightly price sync

A separate scheduled workflow, [`price-sync.yml`](.github/workflows/price-sync.yml),
fetches TCGPlayer market prices from the [Pokémon TCG API](https://pokemontcg.io) and
writes them into your sheet's `price` / `price_updated_at` columns — one price per
printing (so 1st Edition and Unlimited, or Normal and Reverse Holo, each get their own
price). It reuses the **same** `VITE_SHEETS_API_URL` and `SHEETS_SYNC_TOKEN` secrets from
step 5 — nothing new to set up if you've already turned on card sync.

- Runs automatically once a day, and can be triggered manually any time from **Actions →
  "Sync card prices" → Run workflow**.
- Coverage: only sets the Pokémon TCG API has indexed — currently Gym Heroes, Gym
  Challenge, Team Up, Cosmic Eclipse, and Scarlet & Violet 151 (74 of the 104 printings).
  It's **English-only**, so Japanese-exclusive cards aren't priced this way, and a
  brand-new set (like Ascended Heroes at the time of writing) may not be indexed yet.
  Those cards keep their existing TCGPlayer/PriceCharting links for manual lookup — see
  the `price_set_id` column in [`sheet-seed/cards.csv`](sheet-seed/cards.csv) for exactly
  which sets are covered, and update it once a set gets added upstream.
- *(Optional)* A free API key from <https://pokemontcg.io> raises the rate limit; add it
  as the environment secret **`POKEMONTCG_API_KEY`**. Works fine without one, just slower.

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
| Pokémon TCG API key (optional) | — | GitHub environment secret `POKEMONTCG_API_KEY` |

**No sensitive keys are committed.** The Web App URL and the two tokens all live in
GitHub secrets / your own Apps Script, never in the repo. The Web App URL is injected at
build time and — because this is a static site — is visible in the shipped page by
design; the Apps Script only exposes reading cards, toggling one owned flag, and (gated
by the admin token) the deploy sync. The `SHEETS_SYNC_TOKEN` is the one genuinely secret
value, and it stays inside GitHub Actions — it is never bundled into the site.
