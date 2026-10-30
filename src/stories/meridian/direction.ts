import type { Move, RoomId } from './engine.ts';
import type { StepId } from './run.ts';

/**
 * The sound of Story Two. Each step and hall has its own piece, built from the same materials; effects mark what the
 * simulation actually did. Pure, so a test can hold the sound to the mechanics.
 */

export type MeridianMusic = 'hall' | 'encounter' | 'echo' | 'trials' | 'garden' | 'iron' | 'fog' | 'discovery';
export type MeridianTheme = 'neutral' | 'garden' | 'iron' | 'fog';

export interface StepCue {
  music: MeridianMusic;
  musicLevel: number;
  beds: Record<string, number>;
  theme: MeridianTheme;
}

const air = (level = 0.8) => ({ room: level });

/** A hall's mood, on its own terms: open air in the Garden, a closed room in Iron, fog you can hear. */
export function roomCue(room: RoomId): StepCue {
  switch (room) {
    case 'friendly':
      return { music: 'garden', musicLevel: 1, beds: air(0.4), theme: 'garden' };
    case 'hostile':
      return { music: 'iron', musicLevel: 0.9, beds: air(1), theme: 'iron' };
    case 'noisy':
      return { music: 'fog', musicLevel: 1, beds: { room: 0.3, fog: 1 }, theme: 'fog' };
    default:
      return { music: 'trials', musicLevel: 1, beds: air(), theme: 'neutral' };
  }
}

export function stepCue(step: StepId): StepCue {
  switch (step) {
    case 'enter':
    case 'pick':
      return { music: 'hall', musicLevel: 1, beds: air(), theme: 'neutral' };
    case 'single':
    case 'repeat':
      return { music: 'encounter', musicLevel: 0.9, beds: air(), theme: 'neutral' };
    case 'echo':
      return { music: 'echo', musicLevel: 1, beds: air(0.6), theme: 'neutral' };
    case 'tournament':
      return { music: 'trials', musicLevel: 1, beds: air(), theme: 'neutral' };
    case 'rooms':
      return roomCue('friendly');
    case 'population':
      return { music: 'hall', musicLevel: 0.8, beds: air(0.6), theme: 'neutral' };
    case 'design':
      return { music: 'hall', musicLevel: 0.7, beds: air(0.6), theme: 'neutral' };
    case 'final':
      return { music: 'discovery', musicLevel: 1, beds: air(0.5), theme: 'neutral' };
  }
}

export const REFLECT_CUE: StepCue = { music: 'discovery', musicLevel: 0.55, beds: air(0.4), theme: 'neutral' };

/** The sound of one round: an accord when both share, a clash when both take, and a metallic strike when one does. */
export function encounterSound(you: Move, them: Move): 'accord' | 'clash' | 'take' {
  if (you === 'C' && them === 'C') return 'accord';
  if (you === 'D' && them === 'D') return 'clash';
  return 'take';
}
