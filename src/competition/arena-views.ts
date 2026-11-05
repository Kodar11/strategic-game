import { auctionPrompt } from '../arena/auction.ts';
import { bluffPrompt } from '../arena/bluff.ts';
import { coalitionPrompt } from '../arena/coalition.ts';
import { type CodeState, codePrompt } from '../arena/codebreaker.ts';
import type { ArenaGameId, Served } from '../arena/core.ts';
import { type DefusalState, defusalPrompt, sharedClues } from '../arena/defusal.ts';
import { type DiceState, liveBids, roll } from '../arena/liars-dice.ts';
import { marketPrompt } from '../arena/market.ts';
import { type MoleState, molePrompt } from '../arena/mole.ts';
import { type Card, type PowerState, powerPrompt } from '../arena/power-play.ts';
import { type SaboteurState, saboteurPrompt } from '../arena/saboteur.ts';
import { signalPrompt } from '../arena/signal.ts';
import { ultPrompt } from '../arena/ultimatum-game.ts';

/**
 * What the device may see of a server-run Arena match that is still in play.
 *
 * Every Arena engine keeps its whole truth in one state object — the match seed, the Mole's identity, the live wires,
 * the opponent's dice and cards. In practice that is fine (the device runs the match). In a Game of the Week match the
 * server runs it, and the device receives `redact(game, state)`:
 *
 * - the seed is always replaced by 0, so no future draw (a lot's value, an ignition, a Dash roll, a bot's random
 *   choice) can be computed on the device;
 * - each game's private fields are masked (table below);
 * - whatever the board needs for this turn that the engine would have derived from the seed or the hidden fields is
 *   computed here from the *full* state and attached as `served` (see `Served` in src/arena/core.ts), and the
 *   engine's prompt helpers return it unchanged.
 *
 * | Game | Masked while in play | Served |
 * |---|---|---|
 * | Auction House | seed (lot values and every estimate but yours are drawn from it) | prompt (lot, your estimate, cash) |
 * | Bluff | seed (tokens) | prompt (your hand / their count and claim) |
 * | Coalition | seed | prompt (the bill on the table) |
 * | Codebreaker | seed; while you guess, the key of every word you haven't revealed | prompt (board with the masked key) |
 * | Defusal | seed; the live wires; every clue in the teammate's hand it hasn't shared | prompt (incl. the clue it shares now) |
 * | Liar's Dice | seed (both cups) | your dice; the bids in play (incl. its opening) |
 * | Market Rivals | seed | prompt (this round's conditions) |
 * | The Mole | seed; which suspect is the Mole | prompt (this round's camera pair) |
 * | Power Play | seed; the deck; the opponent's face-down cards you haven't seen | prompt (incl. the opponent's action) |
 * | The Saboteur | seed; who the saboteur is; every bot's individual cards and energy | prompt (target, bench) |
 * | Hidden Signal | seed (the venture's truth and the test) | prompt (prior, signal or your venture, test result) |
 * | Ultimatum Game | seed (pools and walk-aways of later rounds) | prompt (this round's terms, its offer) |
 * | Cooperation, Commons, Gambit, Inspector, Last Stand, Traveler's Dilemma | seed (bot noise, slips, luck, ignitions) | — |
 *
 * Rounds already resolved stay as the engine recorded them: each game's rules reveal them after the round (a called
 * claim, an auction's estimates, a finished dice round). A finished match is sent in full by the caller instead.
 */

type AnyState = { setup: { seed: number } } & Record<string, unknown>;

/** A redacted copy of an in-play state, with what its board needs served. Never mutates `state`. */
export function redact(game: ArenaGameId, state: AnyState): AnyState {
  const out: AnyState = { ...state, setup: { ...state.setup, seed: 0 } };
  const serve = (served: Served) => {
    out.served = served;
  };
  switch (game) {
    case 'auction':
      serve({ prompt: auctionPrompt(state as never) });
      break;
    case 'bluff':
      serve({ prompt: bluffPrompt(state as never) });
      break;
    case 'coalition':
      serve({ prompt: coalitionPrompt(state as never) });
      break;
    case 'market':
      serve({ prompt: marketPrompt(state as never) });
      break;
    case 'signal':
      serve({ prompt: signalPrompt(state as never) });
      break;
    case 'ultimatum-game':
      serve({ prompt: ultPrompt(state as never) });
      break;
    case 'codebreaker': {
      const p = codePrompt(state as unknown as CodeState);
      if (p && p.phase === 'guess') {
        const key = p.board.key.map((k, i) => (p.guesses.includes(i) ? k : 'neutral' as const));
        serve({ prompt: { ...p, board: { ...p.board, key } } });
      } else serve({ prompt: p });
      break;
    }
    case 'defusal': {
      const s = state as unknown as DefusalState;
      const p = defusalPrompt(s);
      const known = new Set([...sharedClues(s).bot, ...(p?.phase === 'cut' && p.shared !== null ? [p.shared] : [])]);
      out.live = [-1, -1];
      // Same length, so indices into the hand stay valid; unshared clues are replaced by a placeholder that the board
      // never renders (it only shows the teammate's shared clues).
      out.hands = { player: s.hands.player, bot: s.hands.bot.map((c, k) => (known.has(k) ? c : { kind: 'parity', p: 'mixed', hidden: true })) };
      serve({ prompt: p });
      break;
    }
    case 'liars-dice': {
      const s = state as unknown as DiceState;
      serve({ roll: { player: roll(s).player, bot: [] }, bids: liveBids(s) });
      break;
    }
    case 'mole': {
      const s = state as unknown as MoleState;
      out.mole = -1;
      serve({ prompt: molePrompt(s) });
      break;
    }
    case 'power-play': {
      const s = state as unknown as PowerState;
      // A card id encodes its role (role × copies + k), so unseen cards get opaque ids as well as a placeholder role.
      const mask = (c: Card, i: number, base: number): Card => ({ id: base + i, role: 'treasurer' });
      out.deck = s.deck.map((c, i) => mask(c, i, 1000));
      out.bot = { ...s.bot, hand: s.bot.hand.map((c, i) => (s.playerSaw[c.id] !== undefined ? c : mask(c, i, 2000))) };
      serve({ prompt: powerPrompt(s) });
      break;
    }
    case 'saboteur': {
      const s = state as unknown as SaboteurState;
      out.saboteur = -1;
      out.energy = s.energy.map((e, i) => (i === 0 ? e : 0));
      // Only each mission's total is public; your own card is yours.
      out.history = s.history.map((m) => ({ ...m, cards: m.cards.map((c, i) => (i === 0 ? c : null)) }));
      serve({ prompt: saboteurPrompt(s) });
      break;
    }
    default:
      // cooperation, commons, gambit, inspector, last-stand, travelers: nothing but the seed is private.
      break;
  }
  return out;
}

/**
 * Field paths that must never reach the device while a match is in play — used by the tests to check every view.
 * (`setup.seed` is checked for every game.)
 */
export const PRIVATE_FIELDS: Partial<Record<ArenaGameId, string[]>> = {
  defusal: ['live'],
  mole: ['mole'],
  saboteur: ['saboteur'],
};
