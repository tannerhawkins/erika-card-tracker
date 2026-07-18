/**
 * Display order for the set sections. Cards themselves now live in the Google
 * Sheet and are fetched at runtime (see src/api.ts / SETUP.md) — the sheet's
 * `set` column values should match the names below to control section order.
 * Any set found in the sheet but not listed here is appended after these, in
 * first-seen order.
 */
export const SET_ORDER = [
  'Gym Heroes',
  'Gym Challenge',
  'Team Up',
  'Cosmic Eclipse',
  'Scarlet & Violet — 151',
  'Pokémon VS (Japan)',
  'Tag All Stars (Japan)',
  'Japanese Promos',
] as const;
