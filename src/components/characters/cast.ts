import type { ImageSourcePropType } from 'react-native';

/**
 * Character reference system. Every appearance of a character is drawn from this one spec, so faces,
 * hair, clothing and colours stay identical across lessons.
 *
 * Artwork slots: when approved illustrated portraits exist, add them to `images` (keyed by expression,
 * `neutral` is required as the fallback). Until then the vector portrait in Portrait.tsx is used.
 * See docs/ASSETS.md for the full list of requested files.
 */
export type CharacterId = 'aarav' | 'maya' | 'rohan' | 'meera' | 'sen' | 'kavya' | 'arjun' | 'nina';

/** The Tournament's cast: portraits only, never narrated (src/tournament/season1.ts names them as rivals' portraits). */
export type TournamentRivalId = 'host' | 'vesper' | 'kade' | 'mirelle' | 'osric' | 'tamsin';

/** Anyone with a portrait. */
export type PortraitId = CharacterId | TournamentRivalId;

export type Expression =
  | 'neutral'
  | 'curious'
  | 'thinking'
  | 'surprised'
  | 'happy'
  | 'confused'
  | 'confident'
  | 'frustrated'
  | 'concerned'
  | 'skeptical'
  | 'explaining'
  | 'satisfied';

export type HairStyle = 'tousled' | 'long' | 'longSide' | 'short' | 'bun' | 'receding' | 'bob';
export type Outfit = 'hoodie' | 'blouse' | 'jacket' | 'blazer' | 'sweater' | 'cardigan' | 'shirt' | 'top';

export interface CharacterSpec {
  id: PortraitId;
  name: string;
  role: string;
  skin: string;
  skinShade: string;
  hair: string;
  hairStyle: HairStyle;
  outfit: Outfit;
  clothing: string;
  clothingShade: string;
  glasses?: boolean;
  beard?: boolean;
  /** Name-plate colour in dialogue. */
  accent: string;
  images?: Partial<Record<Expression, ImageSourcePropType>> & { neutral?: ImageSourcePropType };
}

export const CAST: Record<PortraitId, CharacterSpec> = {
  aarav: {
    id: 'aarav',
    name: 'Aarav',
    role: 'You',
    skin: '#C68B67',
    skinShade: '#A8704F',
    hair: '#1B1414',
    hairStyle: 'tousled',
    outfit: 'hoodie',
    clothing: '#2563EB',
    clothingShade: '#1D4ED8',
    accent: '#93B4F8',
  },
  maya: {
    id: 'maya',
    name: 'Maya',
    role: 'Rival strategist',
    skin: '#B97A5A',
    skinShade: '#9A6044',
    hair: '#120D0C',
    hairStyle: 'long',
    outfit: 'blouse',
    clothing: '#B4413A',
    clothingShade: '#8E302B',
    accent: '#FDA766',
  },
  rohan: {
    id: 'rohan',
    name: 'Rohan',
    role: 'Competitor',
    skin: '#A86E4E',
    skinShade: '#8A563A',
    hair: '#15100E',
    hairStyle: 'short',
    outfit: 'jacket',
    clothing: '#8F2D2D',
    clothingShade: '#6E2020',
    accent: '#FDA766',
  },
  meera: {
    id: 'meera',
    name: 'Dr. Meera',
    role: 'Analyst',
    skin: '#C08A68',
    skinShade: '#A06E4E',
    hair: '#1A1311',
    hairStyle: 'bun',
    outfit: 'blazer',
    clothing: '#1E4E8C',
    clothingShade: '#163B6B',
    glasses: true,
    accent: '#22D3EE',
  },
  sen: {
    id: 'sen',
    name: 'Prof. Sen',
    role: 'Mentor',
    skin: '#B98463',
    skinShade: '#9A6A4C',
    hair: '#B8BCC4',
    hairStyle: 'receding',
    outfit: 'sweater',
    clothing: '#2B2F3A',
    clothingShade: '#1E222B',
    glasses: true,
    accent: '#FDBA74',
  },
  kavya: {
    id: 'kavya',
    name: 'Kavya',
    role: 'Customer',
    skin: '#C9926E',
    skinShade: '#AB7554',
    hair: '#1C1210',
    hairStyle: 'longSide',
    outfit: 'cardigan',
    clothing: '#C2864F',
    clothingShade: '#9E6A3B',
    accent: '#FDBA74',
  },
  arjun: {
    id: 'arjun',
    name: 'Arjun',
    role: 'Market operator',
    skin: '#A87050',
    skinShade: '#8A573A',
    hair: '#17110F',
    hairStyle: 'short',
    outfit: 'shirt',
    clothing: '#2F6F6A',
    clothingShade: '#235450',
    beard: true,
    accent: '#5EEAD4',
  },
  nina: {
    id: 'nina',
    name: 'Nina',
    role: 'Your friend',
    skin: '#BF8562',
    skinShade: '#A06A4A',
    hair: '#1D1412',
    hairStyle: 'bob',
    outfit: 'top',
    clothing: '#9C5B4A',
    clothingShade: '#7C4537',
    accent: '#FDBA74',
  },
  // ── The Tournament ─────────────────────────────────────────────────────────────────────────────────────────────
  host: {
    id: 'host',
    name: 'The Host',
    role: 'Runs the Tournament',
    skin: '#B47E5E',
    skinShade: '#956347',
    hair: '#C9CCD3',
    hairStyle: 'receding',
    outfit: 'blazer',
    clothing: '#3A2E22',
    clothingShade: '#2A2118',
    glasses: true,
    accent: '#FDBA74',
  },
  vesper: {
    id: 'vesper',
    name: 'Vesper',
    role: 'The Liar',
    skin: '#C48E6C',
    skinShade: '#A57152',
    hair: '#2A1414',
    hairStyle: 'longSide',
    outfit: 'blouse',
    clothing: '#C2410C',
    clothingShade: '#9A3412',
    accent: '#FDA766',
  },
  kade: {
    id: 'kade',
    name: 'Kade',
    role: 'The Traitor',
    skin: '#9E6A4B',
    skinShade: '#80523A',
    hair: '#14100E',
    hairStyle: 'tousled',
    outfit: 'jacket',
    clothing: '#1D4ED8',
    clothingShade: '#1E3A8A',
    accent: '#93B4F8',
  },
  mirelle: {
    id: 'mirelle',
    name: 'Mirelle',
    role: 'The Puppeteer',
    skin: '#C99A7A',
    skinShade: '#AA7D5E',
    hair: '#0F0B0A',
    hairStyle: 'bob',
    outfit: 'top',
    clothing: '#0E7490',
    clothingShade: '#155E75',
    accent: '#22D3EE',
  },
  osric: {
    id: 'osric',
    name: 'Osric',
    role: 'The Kingmaker',
    skin: '#A97352',
    skinShade: '#8B5A3D',
    hair: '#2B211C',
    hairStyle: 'short',
    outfit: 'blazer',
    clothing: '#166534',
    clothingShade: '#14532D',
    beard: true,
    accent: '#4ADE80',
  },
  tamsin: {
    id: 'tamsin',
    name: 'Tamsin',
    role: 'The Architect',
    skin: '#B9805E',
    skinShade: '#9A6646',
    hair: '#3B2A22',
    hairStyle: 'bun',
    outfit: 'cardigan',
    clothing: '#334155',
    clothingShade: '#1E293B',
    glasses: true,
    accent: '#93B4F8',
  },
};
