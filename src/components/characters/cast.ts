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
  id: CharacterId;
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

export const CAST: Record<CharacterId, CharacterSpec> = {
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
};
