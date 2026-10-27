import { type GameEngine, type MatchSpec, clampInt, draw, outcomeOf, sumTotals } from './core.ts';

/**
 * The Ultimatum Game — 6 rounds, roles alternate. The player proposes in rounds 1, 3 and 5; the bot in 2, 4 and 6.
 *
 * Rules
 * - Each round divides 10 coins. The proposer offers the responder a whole number of coins from 1 to 9 (the
 *   proposer keeps the rest). Offers of 0 or 10 aren't allowed.
 * - Accept: the division happens. Reject: both get 0 that round.
 * - The responder sees the offer before deciding — that's the game — but the bot proposer never sees how the player
 *   would respond, and the bot responder decides only on the offer and earlier rounds.
 * - Score: coins. Match outcome: whoever has more coins after round 6.
 *
 * Maximizing money and preferring fairness are different policies, not difficulty levels: a money-maximizer accepts
 * any offer (1 coin beats 0), a hardliner pays to punish low offers.
 */

export type UltimatumBot = 'maximizer' | 'fair' | 'hardliner' | 'negotiator';
export const ULTIMATUM_BOTS: readonly UltimatumBot[] = ['maximizer', 'fair', 'hardliner', 'negotiator'];

export const ULT_ROUNDS = 6;
export const ULT_PIE = 10;
export const ULT_MIN_OFFER = 1;
export const ULT_MAX_OFFER = 9;

export type UltimatumRole = 'propose' | 'respond';
/** Propose: coins offered to the bot. Respond: accept or reject the bot's offer. */
export type UltimatumMove = number | 'accept' | 'reject';
export type UltimatumPrompt = { role: 'propose' } | { role: 'respond'; offer: number };

export interface UltimatumRound {
  proposer: 'player' | 'bot';
  /** Coins offered to the responder. */
  offer: number;
  accepted: boolean;
  ps: number;
  bs: number;
}

export const playerProposes = (round: number) => round % 2 === 0;

/** Per-difficulty numbers. `threshold` is the smallest offer the bot accepts. */
export const ULT_CONFIG = {
  maximizer: { easy: { threshold: 1 }, medium: { threshold: 1 }, hard: { threshold: 1 } },
  fair: { easy: { offer: 5, threshold: 3 }, medium: { offer: 5, threshold: 4 }, hard: { offer: 5, threshold: 4 } },
  hardliner: { easy: { offer: 4, threshold: 4 }, medium: { offer: 4, threshold: 5 }, hard: { offer: 3, threshold: 5 } },
  negotiator: {
    easy: { offer: 5, offerMin: 3, offerMax: 6, threshold: 3, thrMin: 2, thrMax: 4 },
    medium: { offer: 4, offerMin: 2, offerMax: 6, threshold: 4, thrMin: 3, thrMax: 5 },
    hard: { offer: 3, offerMin: 2, offerMax: 5, threshold: 5, thrMin: 3, thrMax: 6 },
  },
} as const;

const botProposals = (h: readonly UltimatumRound[]) => h.filter((r) => r.proposer === 'bot');
const playerProposals = (h: readonly UltimatumRound[]) => h.filter((r) => r.proposer === 'player');

/**
 * What the bot offers the player when it proposes (round `history.length`).
 * - Maximizer. Easy: 1–3 at random. Medium: starts at 2 and adds 1 after each rejection (it learns the player's
 *   floor, never gives more back). Hard: starts at 2; after a rejection offers 1 more, after an acceptance 1 less —
 *   always probing for the least the player takes (between 1 and 5).
 * - Fair Player: 5. Hard reciprocates: if the player's last offer to it was under 4, it offers 4.
 * - Hardliner: demands the larger share — 4 (easy, medium) or 3 (hard).
 * - Negotiator: starts at its opening offer, +1 after a rejection, −1 after an acceptance, within its bounds.
 */
export function botOffer(spec: MatchSpec<UltimatumBot>, history: readonly UltimatumRound[]): number {
  const { bot, difficulty, seed } = spec;
  const mine = botProposals(history);
  const lastMine = mine[mine.length - 1];
  switch (bot) {
    case 'maximizer':
      if (difficulty === 'easy') return 1 + Math.floor(draw(seed, history.length, 0) * 3);
      if (difficulty === 'medium') return Math.min(5, 2 + mine.filter((r) => !r.accepted).length);
      return lastMine ? clampInt(lastMine.offer + (lastMine.accepted ? -1 : 1), 1, 5) : 2;
    case 'fair': {
      const theirs = playerProposals(history);
      const lastTheirs = theirs[theirs.length - 1];
      if (difficulty === 'hard' && lastTheirs && lastTheirs.offer < 4) return 4;
      return ULT_CONFIG.fair[difficulty].offer;
    }
    case 'hardliner':
      return ULT_CONFIG.hardliner[difficulty].offer;
    case 'negotiator': {
      const c = ULT_CONFIG.negotiator[difficulty];
      let offer: number = c.offer;
      for (const r of mine) offer = clampInt(offer + (r.accepted ? -1 : 1), c.offerMin, c.offerMax);
      return offer;
    }
  }
}

/**
 * Whether the bot accepts the player's offer of `offer` coins.
 * - Maximizer: any allowed offer (1 coin beats nothing).
 * - Fair Player: at least 3 (easy) or 4.
 * - Hardliner: at least 4 (easy) or 5; hard raises its line to 6 for the rest of the match once the player has
 *   offered it 2 or less.
 * - Negotiator: starts at its threshold; each time it accepts it asks 1 more next time, each time it rejects it
 *   asks 1 less, within its bounds.
 */
export function botAccepts(spec: MatchSpec<UltimatumBot>, history: readonly UltimatumRound[], offer: number): boolean {
  const { bot, difficulty } = spec;
  switch (bot) {
    case 'maximizer':
      return offer >= ULT_CONFIG.maximizer[difficulty].threshold;
    case 'fair':
      return offer >= ULT_CONFIG.fair[difficulty].threshold;
    case 'hardliner': {
      const insulted = difficulty === 'hard' && playerProposals(history).some((r) => r.offer <= 2);
      return offer >= (insulted ? 6 : ULT_CONFIG.hardliner[difficulty].threshold);
    }
    case 'negotiator': {
      const c = ULT_CONFIG.negotiator[difficulty];
      let threshold: number = c.threshold;
      for (const r of playerProposals(history)) threshold = clampInt(threshold + (r.accepted ? 1 : -1), c.thrMin, c.thrMax);
      return offer >= threshold;
    }
  }
}

function split(proposer: 'player' | 'bot', offer: number, accepted: boolean): UltimatumRound {
  if (!accepted) return { proposer, offer, accepted, ps: 0, bs: 0 };
  return proposer === 'player' ? { proposer, offer, accepted, ps: ULT_PIE - offer, bs: offer } : { proposer, offer, accepted, ps: offer, bs: ULT_PIE - offer };
}

export const isValidOffer = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= ULT_MIN_OFFER && x <= ULT_MAX_OFFER;

export const ultimatum: GameEngine<UltimatumBot, UltimatumMove, UltimatumRound, UltimatumPrompt> = {
  id: 'ultimatum',
  rulesVersion: 1,
  rounds: ULT_ROUNDS,
  bots: ULTIMATUM_BOTS,
  prompt: (spec, history) => (playerProposes(history.length) ? { role: 'propose' } : { role: 'respond', offer: botOffer(spec, history) }),
  parseMove(raw, prompt) {
    if (prompt.role === 'propose') return isValidOffer(raw) ? raw : null;
    return raw === 'accept' || raw === 'reject' ? raw : null;
  },
  resolve(spec, history, move) {
    if (history.length >= ULT_ROUNDS) throw new Error('ultimatum: the match is over');
    if (playerProposes(history.length)) {
      if (!isValidOffer(move)) throw new Error('ultimatum: an offer must be a whole number from 1 to 9');
      return split('player', move, botAccepts(spec, history, move));
    }
    if (move !== 'accept' && move !== 'reject') throw new Error('ultimatum: respond with accept or reject');
    return split('bot', botOffer(spec, history), move === 'accept');
  },
  totals: (history) => sumTotals(history, (r) => r.ps, (r) => r.bs),
  outcome: (history) => outcomeOf(ultimatum.totals(history)),
};
