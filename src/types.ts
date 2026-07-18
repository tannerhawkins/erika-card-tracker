export interface CardLink {
  label: string;
  url: string;
}

export type CardCategory = 'Pokémon' | 'Trainer';
export type CardLanguage = 'EN' | 'JP';

export interface ErikaCard {
  id: string;
  name: string;
  set: string;
  number: string;
  rarity: string;
  year: number;
  category: CardCategory;
  language: CardLanguage;
  notes?: string;
  image?: string;
  links: CardLink[];
}
