# ✿ Erika Card Tracker

A checklist web app for tracking a collection of **Erika-related Pokémon TCG cards** —
every English release plus the Japanese exclusives.

**Live site:** https://tannerhawkins.github.io/erika-card-tracker/

## What's tracked

57 cards across:

| Set | Year | Cards |
|---|---|---|
| Gym Heroes | 2000 | 22 (incl. Erika, Erika's Maids, Erika's Perfume, Celadon City Gym) |
| Gym Challenge | 2000 | 9 (incl. Erika's Venusaur, Erika's Kindness) |
| Team Up | 2019 | 2 (Erika's Hospitality + Full Art) |
| Cosmic Eclipse | 2019 | 4 (Erika supporter + the Vileplume-GX trio that pictures Erika) |
| Scarlet & Violet — 151 | 2023 | 3 (Erika's Invitation: regular, Full Art, Special Illustration Rare) |
| Ascended Heroes | 2026 | 8 (Erika's Oddish→Victreebel line, Vileplume ex, + Tangela IR) |
| Pokémon VS (Japan) | 2001 | 2 (Erika's Bellossom, Erika's Jumpluff) |
| Dream League (Japan) | 2019 | 3 (Erika's Vileplume-GX: RR, Character SR, Hyper Rare) |
| Tag All Stars (Japan) | 2019 | 1 (Erika's Hospitality SR) |
| Japanese Promos | 1999–2019 | 3 (CoroCoro Erika's Bulbasaur, SM-P 324 & 362) |

Coverage is every physical card whose name contains "Erika," plus a few art-cameo cards
that picture Erika without naming her (the Cosmic Eclipse Vileplume-GX prints). Digital
Pokémon TCG Pocket cards are intentionally excluded. Each card shows its picture, set,
number, rarity, year, collector notes, and links to TCGPlayer (pricing) and
Bulbapedia/TCG Collector (details). One checklist entry per unique card (set + number);
1st Edition / reverse-holo variants are noted in the card details.

## How data is stored — Google Sheets

Both the **card list** and your **owned status** live in a Google Sheet, so the
collection is editable from the sheet and synced across all your devices.

- A small **Google Apps Script Web App** (deployed from your own Google account) is the
  bridge. It runs as you and is the only thing that touches the sheet, so **no Google
  credentials ever reach the browser**.
- The site fetches cards live from the sheet on load, and ticking a card writes
  `TRUE`/`FALSE` straight back to the sheet's `owned` column.
- A localStorage cache gives instant paint and keeps the last-known list visible if the
  sheet is briefly unreachable.

**One-time connection steps are in [`SETUP.md`](SETUP.md).** Until it's connected, the
site shows a "connect your sheet" screen. The current 43 cards are provided as
[`sheet-seed/cards.csv`](sheet-seed/cards.csv) to import into the sheet.

### Secrets

The only value the site needs is the Apps Script Web App URL, provided as a **GitHub
environment secret** (`VITE_SHEETS_API_URL`) on the `production` environment and injected
at build. `.env.example` documents it with a dummy placeholder; `.env` is git-ignored.
No sensitive keys are committed. Because this is a static site, that URL ends up in the
shipped page by design — the Apps Script only exposes reading cards and toggling one
card's owned flag.

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
