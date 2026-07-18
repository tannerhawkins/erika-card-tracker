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
4. You should now have a header row plus 43 cards. The last column, **`owned`**, is
   `FALSE` for every card. (Tip: select the `owned` column → **Format → Number →
   Checkbox** to get real checkboxes you can also tick from inside the sheet.)

> To add a new card later, just add a row and fill in the columns. To manage links,
> use `link1_label` / `link1_url` and `link2_label` / `link2_url`.

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

## 5. Redeploy the site

- **repo → Actions → "Deploy to GitHub Pages" → Run workflow** (or just push any
  commit to `main`). The build injects your secret and ships the connected app.
- Visit <https://tannerhawkins.github.io/erika-card-tracker/>. Cards load from the
  sheet, and ticking a card writes `TRUE`/`FALSE` back to the `owned` column.

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

**No sensitive keys are committed.** The Web App URL is the only value the site needs,
and it is injected at build time from the environment secret. Because this is a static
site, that URL is visible in the shipped page — that's by design; the Apps Script only
allows reading cards and toggling a card's owned flag.
