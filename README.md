# ✿ Erika Card Tracker

A checklist web app for tracking a collection of **Erika-related Pokémon TCG cards** —
every English release plus the Japanese exclusives.

**Live site:** https://tannerhawkins.github.io/erika-card-tracker/

## What's tracked

57 cards (104 collectible printings) across:

| Set | Year | Cards |
|---|---|---|
| Gym Heroes | 2000 | 22 (incl. Erika, Erika's Maids, Erika's Perfume, Celadon City Gym) |
| Gym Challenge | 2000 | 9 (incl. Erika's Venusaur, Erika's Kindness) |
| Team Up | 2019 | 2 (Erika's Hospitality + Full Art) |
| Cosmic Eclipse | 2019 | 4 (Erika supporter + the Vileplume-GX trio that pictures Erika) |
| Scarlet & Violet — 151 | 2023 | 3 (Erika's Invitation: regular, Full Art, Special Illustration Rare) |
| Ascended Heroes | 2026 | 8 (Erika's Oddish→Victreebel line, Vileplume ex, Tangela IR) |
| Pokémon VS (Japan) | 2001 | 2 (Erika's Bellossom, Erika's Jumpluff) |
| Dream League (Japan) | 2019 | 3 (Erika's Vileplume-GX: RR, Character SR, Hyper Rare) |
| Tag All Stars (Japan) | 2019 | 1 (Erika's Hospitality SR) |
| Japanese Promos | 1999–2019 | 3 (CoroCoro Erika's Bulbasaur, SM-P 324 & 362) |

Coverage is every physical card whose name contains "Erika," plus a few art-cameo cards
that picture Erika without naming her (the Cosmic Eclipse Vileplume-GX prints). Digital
Pokémon TCG Pocket cards are intentionally excluded.

**Printings/variants.** Each card is one tile, but lists its distinct printings with a
separate "owned" checkbox for each: WOTC cards (Gym Heroes/Challenge) have *1st Edition* +
*Unlimited*; modern base cards have *Normal* + *Reverse Holo* (Ascended Heroes base cards
also carry the two Scarlet & Violet reverse patterns, *Energy Symbol* + *Poké Ball*, and
Erika's Tangela adds its *Cosmos Holo* promo). Secret rares, full arts, illustration/
special-illustration rares, ex/GX rainbow, and promos have a single printing. That's
104 printings across the 57 cards. Each card shows its picture, set, number, rarity, year,
collector notes, links to TCGPlayer and Bulbapedia/TCG Collector, and — where the pricing
sync has coverage — a live TCGPlayer market price per printing (see below).

## How data is stored — Google Sheets

Both the **card list** and your **owned status** live in a Google Sheet, so the
collection is editable from the sheet and synced across all your devices.

- A small **Google Apps Script Web App** (deployed from your own Google account) is the
  bridge. It runs as you and is the only thing that touches the sheet, so **no Google
  credentials ever reach the browser**.
- The sheet has **one row per printing**: the `variant` column labels it (e.g. "1st
  Edition", "Reverse Holo (Poké Ball)"; blank for single-printing cards), and rows that
  share the same set + number + name are grouped into one tile on the site. Add a printing
  by adding a row with the same set/number/name and a new `variant` + `id`.
- The site fetches cards live from the sheet on load, and ticking a printing writes
  `TRUE`/`FALSE` straight back to that row's `owned` column.
- A localStorage cache gives instant paint and keeps the last-known list visible if the
  sheet is briefly unreachable.
- Every deploy runs a `sync-sheet` job that upserts the repo's card list
  ([`sheet-seed/cards.csv`](sheet-seed/cards.csv)) into your sheet — adding newly
  discovered cards and refreshing details — while **preserving the `owned` status of
  cards you already have** (matched by id). So new cards appear automatically and your
  progress is never lost. It's gated by an admin token and skips itself until configured.
- A separate scheduled `sync-prices` workflow ([`price-sync.yml`](.github/workflows/price-sync.yml))
  runs weekly (and on demand) to pull market prices from the [JustTCG API](https://justtcg.com)
  into the sheet's `price` / `price_updated_at` columns — one price per printing. Rows
  with a `tcgplayer_id` (in [`sheet-seed/cards.csv`](sheet-seed/cards.csv)) are looked up
  exactly by TCGPlayer product id; everything else is looked up by name, including
  Japanese-exclusive cards via JustTCG's `pokemon-japan` catalog. A card with sibling
  printings (1st Edition vs. Unlimited, Normal vs. Reverse Holo) only gets a price when
  there's an exact printing-level match — it never falls back to a generic/sibling price,
  since that risks making two different printings look identically priced. A blank price
  means the source doesn't track that exact printing, not that the sync failed. It reuses
  the same admin token, touches only those two columns on rows that already exist, and
  never affects `owned`.

**One-time connection steps are in [`SETUP.md`](SETUP.md).** Until it's connected, the
site shows a "connect your sheet" screen. The full card list is provided as
[`sheet-seed/cards.csv`](sheet-seed/cards.csv) for the initial import (after that, the
deploy sync keeps it up to date).

### Secrets

The site itself needs only the Apps Script Web App URL, provided as a **GitHub
environment secret** (`VITE_SHEETS_API_URL`) on the `production` environment and injected
at build. `.env.example` documents it with a dummy placeholder; `.env` is git-ignored.
The card-list and price syncs additionally use `SHEETS_SYNC_TOKEN` and `JUSTTCG_API_KEY`
(both real, CI-only secrets — never shipped to the browser; `JUSTTCG_API_KEY` is free at
[justtcg.com](https://justtcg.com)). No sensitive keys are committed. Because this is a static site,
`VITE_SHEETS_API_URL` ends up in the shipped page by design — the Apps Script only
exposes reading cards, toggling one owned flag, and (gated by the admin token) the two
sync actions.

## Development

```bash
cp .env.example .env   # then set VITE_SHEETS_API_URL to your Web app URL
npm install
npm run dev            # local dev server
npm run build          # production build to dist/
```

Built with React + TypeScript + Vite. Deployed automatically to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`.

The set display order lives in [`src/data/cards.ts`](src/data/cards.ts); the cards
themselves come from the sheet. The bridge script is [`apps-script/Code.gs`](apps-script/Code.gs).

*Card images © The Pokémon Company / Nintendo / Creatures / GAME FREAK, served from
public card-database CDNs. This is an unofficial fan project.*
