# ✿ Erika Card Tracker

A checklist web app for tracking a collection of **Erika-related Pokémon TCG cards** —
every English release plus the Japanese exclusives.

**Live site:** https://tannerhawkins.github.io/erika-card-tracker/

## What's tracked

43 unique cards across:

| Set | Year | Cards |
|---|---|---|
| Gym Heroes | 2000 | 22 (incl. Erika, Erika's Maids, Erika's Perfume, Celadon City Gym) |
| Gym Challenge | 2000 | 9 (incl. Erika's Venusaur, Erika's Kindness) |
| Team Up | 2019 | 2 (Erika's Hospitality + Full Art) |
| Cosmic Eclipse | 2019 | 1 (Erika supporter) |
| Scarlet & Violet — 151 | 2023 | 3 (Erika's Invitation: regular, Full Art, Special Illustration Rare) |
| Pokémon VS (Japan) | 2001 | 2 (Erika's Bellossom, Erika's Jumpluff) |
| Tag All Stars (Japan) | 2019 | 1 (Erika's Hospitality SR) |
| Japanese Promos | 1999–2019 | 3 (CoroCoro Erika's Bulbasaur, SM-P 324 & 362) |

Each card shows its picture, set, number, rarity, year, collector notes, and links to
TCGPlayer (pricing) and Bulbapedia/TCG Collector (details). One checklist entry per
unique card (set + number); 1st Edition / holo variants are noted in the card details.

## How progress is saved

- Checked-off cards are stored in your browser's **localStorage** — no account, no
  backend, no secrets.
- Use **Export backup** to download your collection as a JSON file, and **Import
  backup** on another device/browser to restore it (import replaces the current
  selection after a confirmation).

## Development

```bash
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
```

Built with React + TypeScript + Vite. Deployed automatically to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main` (uses only the built-in
`GITHUB_TOKEN`).

Card data lives in [`src/data/cards.ts`](src/data/cards.ts) — add new cards there
as new Erika cards are released.

*Card images © The Pokémon Company / Nintendo / Creatures / GAME FREAK, served from
public card-database CDNs. This is an unofficial fan project.*
