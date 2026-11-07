import { ARENA } from '../../arena/catalog.ts';
import { type ArenaGameId, type Level, isArenaId } from '../../arena/core.ts';
import { GAMES } from '../../games/catalog.ts';
import { type Difficulty, type GameId, isGameId } from '../../games/core.ts';
import type { LessonId } from '../../content/lessons.ts';

/**
 * Lesson → game bridges: after a lesson, one game that tests the same idea against an opponent.
 * Lessons with no honest match (evolution, war of attrition, brinkmanship) have no bridge rather than a forced one.
 * The link opens the game's setup screen, so a first-time player still sees its rules before playing.
 */

type Target = { kind: 'game'; id: GameId; difficulty: Difficulty } | { kind: 'arena'; id: ArenaGameId; level: Level };

interface BridgeSpec {
  target: Target;
  /** One sentence: what from the lesson the player will meet in the game. */
  hook: string;
}

const game = (id: GameId, hook: string, difficulty: Difficulty = 'easy'): BridgeSpec => ({ target: { kind: 'game', id, difficulty }, hook });
const arena = (id: ArenaGameId, hook: string, level: Level = 'easy'): BridgeSpec => ({ target: { kind: 'arena', id, level }, hook });

export const LESSON_BRIDGES: Partial<Record<LessonId, BridgeSpec>> = {
  'cooperation-trap': game('split-steal', 'The same trap, ten rounds against one opponent. Does cooperating survive?'),
  'iterated-dominance': arena('travelers', 'Each claim beats the one above it. Watch how far the claims fall.'),
  'best-response': game('two-thirds', 'Your best guess depends on everyone else’s. Find the best response to the group.'),
  'coordination-problem': game('stag-hunt', 'Two good outcomes, one safe and one rewarding. Can you land on the better one together?'),
  'predictability-trap': game('rps', 'Any pattern you show can be exploited. Stay unpredictable for twelve rounds.'),
  'market-competition': arena('market', 'Set your price against two rival firms and see where competition pushes it.'),
  'sequential-moves': game('ultimatum', 'One side offers, the other answers. Think from the answer backwards.'),
  credibility: arena('power-play', 'Claims are cheap. Decide which ones to believe, and make your own believable.'),
  'incentive-shift': arena('inspector', 'Checking costs money and cheating pays when nobody looks. Find the balance from both sides.'),
  bargaining: game('ultimatum', 'Split the pot, take it or leave it. How low can an offer go before it is refused?'),
  'repeated-cooperation': arena('cooperation', 'The dilemma, repeated. Build trust, punish betrayal, and see what lasts.'),
  'strategy-detective': game('two-thirds', 'The group thinks several steps ahead. How many levels deep should you go?', 'hard'),
  'bayesian-uncertainty': arena('liars-dice', 'Hidden dice, bold bids. Update what you believe with every bid.'),
  signaling: arena('signal', 'One side knows the truth, the other has only the signal. Play both roles.'),
  auctions: arena('auction', 'Bid on lots of uncertain value. Win without overpaying.'),
  'market-quality': arena('bluff', 'When bluffs and honest claims look alike, when do you call?'),
  coalitions: arena('coalition', 'Four parties, one prize, and a majority needed. Who do you bring in, and at what price?'),
  voting: arena('coalition', 'Majorities decide who wins. Build one, or break one.'),
  'strategic-practice': arena('commons', 'Four boats, one lake. Everything from the course in one shared dilemma.'),
};

export interface LessonBridge {
  title: string;
  hook: string;
  /** Setup screen route with the preset difficulty. */
  href: { pathname: '/games/[gameId]'; params: { gameId: GameId; difficulty: Difficulty } } | { pathname: '/arena/[gameId]'; params: { gameId: ArenaGameId; level: Level } };
}

/** The game to try after a lesson, or undefined when the lesson has no bridge. */
export function lessonBridge(lesson: LessonId): LessonBridge | undefined {
  const spec = LESSON_BRIDGES[lesson];
  if (!spec) return undefined;
  const t = spec.target;
  if (t.kind === 'game' && isGameId(t.id)) return { title: GAMES[t.id].title, hook: spec.hook, href: { pathname: '/games/[gameId]', params: { gameId: t.id, difficulty: t.difficulty } } };
  if (t.kind === 'arena' && isArenaId(t.id)) return { title: ARENA[t.id].title, hook: spec.hook, href: { pathname: '/arena/[gameId]', params: { gameId: t.id, level: t.level } } };
  return undefined;
}
