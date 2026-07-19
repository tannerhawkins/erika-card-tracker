export interface CardLink {
  label: string;
  url: string;
}

// Values come from a free-form Google Sheet, so keep these widened to string
// rather than a strict union — the sheet may hold values we haven't enumerated.
export type CardCategory = string;
export type CardLanguage = string;

export interface ErikaCard {
  id: string;
  name: string;
  set: string;
  number: string;
  /** Printing/variant label (e.g. "1st Edition", "Reverse Holo"). Empty = single printing. */
  variant: string;
  rarity: string;
  year: number | null;
  category: CardCategory;
  language: CardLanguage;
  notes?: string;
  image?: string;
  links: CardLink[];
  /** Whether this card is in the collection (from the sheet's `owned` column). */
  owned: boolean;
}
