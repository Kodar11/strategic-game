import { type ArenaEngine, type Debrief, LENGTH_ROUNDS, type Outcome, type Setup, draw, shuffled } from './core.ts';

/**
 * The Power Play — claim a role to act, and decide when the other side's claim is a lie.
 *
 * Deck: 12 role cards, three each of Treasurer, Thief, Guard and Oracle (shuffled by the seed). You and the opponent
 * hold two face-down cards each — your "influence" — and start with 2 coins. Turns alternate, you first.
 *
 * On your turn, one action:
 * - Income: +1 coin. Needs no role; can't be challenged.
 * - Treasury (claims Treasurer): +3 coins.
 * - Steal (claims Thief): take up to 2 coins from the other side. They may block it by claiming Guard.
 * - Foresight (claims Oracle): look at one of the other side's face-down cards (picked at random).
 * You don't need the role you claim. The other side may challenge any claim (and you may challenge a Guard block):
 * - The claim was true: the challenger loses one influence; the claimant shows the card, shuffles it back into the
 *   deck and draws a replacement. The action goes ahead.
 * - The claim was false: the claimant loses one influence and the action fails.
 * A lost influence is a random face-down card of the loser's, turned face up for good.
 *
 * Win: the other side loses both influence, or you reach WIN_COINS coins. If the turn limit is reached, more influence
 * wins, then more coins; otherwise a draw.
 *
 * Information: each side sees its own cards, every face-up card, every claim and challenge, and what its Foresight
 * revealed. Bots never see your face-down cards except through their own Foresight, and never see the deck order.
 */

export const POWER_PERSONAS = ['honest', 'bluffer', 'challenger', 'manipulator'] as const;
export type PowerPersona = (typeof POWER_PERSONAS)[number];
export const POWER_NAME: Record<PowerPersona, string> = { honest: 'The Honest Operator', bluffer: 'The Calculated Bluffer', challenger: 'The Suspicious Challenger', manipulator: 'The Strategic Manipulator' };

export type PowerVariant = 'standard';
export const POWER_VARIANTS: readonly PowerVariant[] = ['standard'];
export const powerTurns = LENGTH_ROUNDS(8, 12, 16);
export const ROLES = ['treasurer', 'thief', 'guard', 'oracle'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_NAME: Record<Role, string> = { treasurer: 'Treasurer', thief: 'Thief', guard: 'Guard', oracle: 'Oracle' };
export const COPIES = 3;
export const WIN_COINS = 10;
export const START_COINS = 2;

export type PowerMove = 'income' | 'treasury' | 'steal' | 'foresight';
export const CLAIM_OF: Record<Exclude<PowerMove, 'income'>, Role> = { treasury: 'treasurer', steal: 'thief', foresight: 'oracle' };

export interface Card {
  id: number;
  role: Role;
}

export interface Side {
  hand: Card[];
  lost: Card[];
  coins: number;
}

export interface PowerTurn {
  actor: 'player' | 'bot';
  move: PowerMove;
  challenged: boolean;
  /** Whether the claim was true (null for income). */
  truthful: boolean | null;
  blocked: boolean;
  blockChallenged: boolean;
  blockTruthful: boolean | null;
  succeeded: boolean;
  /** Influence lost this turn, by side. */
  lost: { player: Role[]; bot: Role[] };
  /** Foresight: the card seen. */
  seen: Role | null;
}

export interface PowerState {
  setup: Setup<PowerVariant, PowerPersona>;
  total: number;
  deck: Card[];
  player: Side;
  bot: Side;
  turns: PowerTurn[];
  /** Your steal waiting on your answer to its Guard block. */
  pendingBlock: boolean;
  /** Bot's Foresight knowledge: card id → role. */
  botSaw: Record<number, Role>;
  /** Your Foresight knowledge. */
  playerSaw: Record<number, Role>;
}

export type PowerAction =
  | { kind: 'act'; move: PowerMove }
  | { kind: 'respond'; answer: 'allow' | 'challenge' | 'block' }
  | { kind: 'block-answer'; answer: 'accept' | 'challenge' };

export const playerTurn = (n: number) => n % 2 === 0;
const has = (side: Side, r: Role) => side.hand.some((c) => c.role === r);

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/**
 * P(the player holds `role`), as the bot can work it out: its own cards, every face-up card and its Foresight are
 * accounted for; the rest of the player's hand is a random draw from the unseen cards.
 */
export function pHolds(s: PowerState, role: Role): number {
  const known = s.player.hand.filter((c) => s.botSaw[c.id] !== undefined);
  if (known.some((c) => s.botSaw[c.id] === role)) return 1;
  const unknownInHand = s.player.hand.length - known.length;
  if (unknownInHand <= 0) return 0;
  const seen = [...s.bot.hand, ...s.bot.lost, ...s.player.lost].filter((c) => c.role === role).length + known.filter((c) => s.botSaw[c.id] === role).length;
  const left = COPIES - seen;
  const pool = s.deck.length + unknownInHand;
  if (left <= 0) return 0;
  return 1 - choose(pool - left, unknownInHand) / choose(pool, unknownInHand);
}

/** The player's habits so far, from the public record. */
function habits(s: PowerState) {
  const botClaims = s.turns.filter((t) => t.actor === 'bot' && t.move !== 'income');
  const challenged = botClaims.filter((t) => t.challenged).length;
  const playerClaims = s.turns.filter((t) => t.actor === 'player' && t.move !== 'income');
  const caught = playerClaims.filter((t) => t.truthful === false).length;
  return { challengeRate: (challenged + 1) / (botClaims.length + 3), lieRate: (caught + 1) / (playerClaims.length + 4), claimsOf: (r: Role) => playerClaims.filter((t) => CLAIM_OF[t.move as Exclude<PowerMove, 'income'>] === r).length };
}

/**
 * The bot's action on its turn (u: this turn's seeded random number).
 *
 * Honest Operator — claims only roles it holds: Treasury with a Treasurer, Steal with a Thief when you have 2+ coins,
 *   Foresight with an Oracle if it hasn't seen your cards; otherwise Income.
 * Calculated Bluffer — uses its real roles first; without one, bluffs Treasury when the expected gain beats Income:
 *   (1 − your challenge rate) × 3 > 1 + your challenge rate × 5 (a lost influence counted as 5). Easy bluffs Treasury
 *   every other turn regardless.
 * Suspicious Challenger — plays honestly, bluffing Treasury only 15 % of the time.
 * Strategic Manipulator — real roles first; bluffs Steal (it is happy to be blocked) when you have coins and rarely
 *   challenge, otherwise Treasury when you challenge less than a third of the time; Hard switches to Income when your
 *   recent challenges were right.
 */
export function botAction(s: PowerState, u: number): PowerMove {
  const { persona, level } = s.setup;
  const me = s.bot;
  const h = habits(s);
  const real = (): PowerMove | null => {
    if (has(me, 'treasurer')) return 'treasury';
    if (has(me, 'thief') && s.player.coins >= 2) return 'steal';
    if (has(me, 'oracle') && s.player.hand.some((c) => s.botSaw[c.id] === undefined)) return 'foresight';
    return null;
  };
  const r = real();
  if (persona === 'honest') return r ?? 'income';
  if (persona === 'bluffer') {
    if (r) return r;
    if (level === 'easy') return s.turns.length % 4 === 1 ? 'treasury' : 'income';
    return (1 - h.challengeRate) * 3 > 1 + h.challengeRate * 5 ? 'treasury' : 'income';
  }
  if (persona === 'challenger') return r ?? (u < 0.15 ? 'treasury' : 'income');
  if (r) return r;
  if (level === 'hard') {
    const recent = s.turns.filter((t) => t.actor === 'bot' && t.challenged).slice(-2);
    if (recent.length === 2 && recent.every((t) => t.truthful === false)) return 'income';
  }
  if (s.player.coins >= 2 && h.challengeRate < 0.4) return 'steal';
  return h.challengeRate < 1 / 3 ? 'treasury' : 'income';
}

/**
 * Whether the bot challenges your claim of `role`. It weighs pHolds (exact card counting) by level: Easy compares a
 * fixed guess, Normal the counted odds, Hard the odds and how often you've claimed that role.
 *
 * Honest Operator — challenges only near-impossible claims (odds under 10 %; Easy never).
 * Calculated Bluffer — challenges below 25 % odds.
 * Suspicious Challenger — challenges below 45 % (Easy: any claim after you've made two of the same kind).
 * Strategic Manipulator — avoids confrontation: below 10 %, or when losing would not cost it the game and your claim
 *   would win you the game.
 */
export function botChallenges(s: PowerState, role: Role): boolean {
  const { persona, level } = s.setup;
  let p = pHolds(s, role);
  if (level === 'hard') {
    const repeats = habits(s).claimsOf(role);
    if (repeats >= 2) p *= 0.8;
  }
  const easyGuess = 0.5;
  const odds = level === 'easy' ? easyGuess : p;
  if (p === 0) return true; // every copy is accounted for: certainly a bluff
  if (persona === 'honest') return level !== 'easy' && odds < 0.1;
  if (persona === 'bluffer') return odds < 0.25;
  if (persona === 'challenger') return level === 'easy' ? habits(s).claimsOf(role) >= 2 : odds < 0.45;
  const decisive = role === 'treasurer' && s.player.coins + 3 >= WIN_COINS;
  return odds < 0.1 || (decisive && s.bot.hand.length > 1);
}

/**
 * Whether the bot blocks your Steal by claiming Guard. Honest: only with a real Guard. Bluffer: real Guard, or a bluff
 * when you rarely challenge. Challenger: real Guard only. Manipulator: real Guard, or a bluff 60 % of the time.
 */
export function botBlocks(s: PowerState, u: number): boolean {
  if (has(s.bot, 'guard')) return true;
  const { persona } = s.setup;
  if (persona === 'bluffer') return habits(s).challengeRate < 0.3;
  if (persona === 'manipulator') return u < 0.6;
  return false;
}

/** Whether the bot challenges your Guard block of its Steal. Same thresholds as challenging a claim. */
const botChallengesBlock = (s: PowerState) => botChallenges(s, 'guard');

// ── Resolution helpers (pure: they return new sides and deck) ───────────────────────────────

function loseOne(side: Side, seed: number, n: number, k: number): { side: Side; role: Role } {
  const i = Math.floor(draw(seed, n, k) * side.hand.length);
  const card = side.hand[i];
  return { side: { ...side, hand: side.hand.filter((_, j) => j !== i), lost: [...side.lost, card] }, role: card.role };
}

/** A proven claim: the card goes to the bottom of the deck and the claimant draws the top card. */
function swapProven(side: Side, deck: Card[], role: Role): { side: Side; deck: Card[] } {
  const i = side.hand.findIndex((c) => c.role === role);
  const card = side.hand[i];
  const [top, ...rest] = deck;
  return { side: { ...side, hand: side.hand.map((c, j) => (j === i ? top : c)) }, deck: [...rest, card] };
}

interface Draft {
  deck: Card[];
  player: Side;
  bot: Side;
  turn: PowerTurn;
  botSaw: Record<number, Role>;
  playerSaw: Record<number, Role>;
}

/** Resolves a claim and its challenge. Returns whether the action goes ahead. */
function settleClaim(d: Draft, actor: 'player' | 'bot', role: Role, challenged: boolean, seed: number, n: number): boolean {
  if (!challenged) return true;
  const claimant = actor === 'player' ? d.player : d.bot;
  const truthful = has(claimant, role);
  d.turn.challenged = true;
  d.turn.truthful = truthful;
  if (truthful) {
    const sw = swapProven(claimant, d.deck, role);
    d.deck = sw.deck;
    if (actor === 'player') d.player = sw.side;
    else d.bot = sw.side;
    const loser = actor === 'player' ? 'bot' : 'player';
    const l = loseOne(loser === 'bot' ? d.bot : d.player, seed, n, 70);
    if (loser === 'bot') d.bot = l.side;
    else d.player = l.side;
    d.turn.lost[loser].push(l.role);
    return true;
  }
  const l = loseOne(claimant, seed, n, 71);
  if (actor === 'player') d.player = l.side;
  else d.bot = l.side;
  d.turn.lost[actor].push(l.role);
  return false;
}

function performMove(d: Draft, actor: 'player' | 'bot', move: PowerMove, seed: number, n: number) {
  const me = actor === 'player' ? d.player : d.bot;
  const them = actor === 'player' ? d.bot : d.player;
  if (!me.hand.length) return;
  if (move === 'income' || move === 'treasury') {
    const next = { ...me, coins: me.coins + (move === 'income' ? 1 : 3) };
    if (actor === 'player') d.player = next;
    else d.bot = next;
  } else if (move === 'steal') {
    const take = Math.min(2, them.coins);
    const meNext = { ...me, coins: me.coins + take };
    const themNext = { ...them, coins: them.coins - take };
    if (actor === 'player') [d.player, d.bot] = [meNext, themNext];
    else [d.bot, d.player] = [meNext, themNext];
  } else if (them.hand.length) {
    const c = them.hand[Math.floor(draw(seed, n, 80) * them.hand.length)];
    d.turn.seen = c.role;
    if (actor === 'player') d.playerSaw = { ...d.playerSaw, [c.id]: c.role };
    else d.botSaw = { ...d.botSaw, [c.id]: c.role };
  }
  d.turn.succeeded = true;
}

const draft = (s: PowerState, actor: 'player' | 'bot', move: PowerMove): Draft => ({
  deck: s.deck,
  player: s.player,
  bot: s.bot,
  botSaw: s.botSaw,
  playerSaw: s.playerSaw,
  turn: { actor, move, challenged: false, truthful: null, blocked: false, blockChallenged: false, blockTruthful: null, succeeded: false, lost: { player: [], bot: [] }, seen: null },
});

const commit = (s: PowerState, d: Draft): PowerState => ({ ...s, deck: d.deck, player: d.player, bot: d.bot, botSaw: d.botSaw, playerSaw: d.playerSaw, turns: [...s.turns, d.turn], pendingBlock: false });

export const isOverPower = (s: PowerState) => !s.player.hand.length || !s.bot.hand.length || s.player.coins >= WIN_COINS || s.bot.coins >= WIN_COINS || s.turns.length >= s.total;

export type PowerPrompt = { phase: 'act'; turn: number } | { phase: 'respond'; turn: number; move: PowerMove } | { phase: 'block'; turn: number };

export function powerPrompt(s: PowerState): PowerPrompt | null {
  const n = s.turns.length;
  if (s.pendingBlock) return { phase: 'block', turn: n };
  if (isOverPower(s)) return null;
  if (playerTurn(n)) return { phase: 'act', turn: n + 1 };
  return { phase: 'respond', turn: n + 1, move: botAction(s, draw(s.setup.seed, n, 0)) };
}

function validate(s: PowerState, a: PowerAction): string | null {
  const p = powerPrompt(s);
  if (!p) return 'The game is over.';
  if (!a || typeof a !== 'object') return 'Choose an action.';
  if (p.phase === 'act') return a.kind === 'act' && ['income', 'treasury', 'steal', 'foresight'].includes(a.move) ? null : 'Choose your action for this turn.';
  if (p.phase === 'block') return a.kind === 'block-answer' && (a.answer === 'accept' || a.answer === 'challenge') ? null : 'Accept the Guard block or challenge it.';
  if (a.kind !== 'respond') return 'Answer the opponent’s action.';
  if (p.move === 'income') return a.answer === 'allow' ? null : 'Income can’t be challenged or blocked.';
  if (a.answer === 'block') return p.move === 'steal' ? null : 'Only a Steal can be blocked.';
  return a.answer === 'allow' || a.answer === 'challenge' ? null : 'Allow it, challenge it, or block it.';
}

function apply(s: PowerState, a: PowerAction): PowerState {
  const why = validate(s, a);
  if (why) throw new Error(`power-play: ${why}`);
  const n = s.turns.length;
  const seed = s.setup.seed;

  if (a.kind === 'act') {
    const d = draft(s, 'player', a.move);
    if (a.move === 'income') {
      performMove(d, 'player', 'income', seed, n);
      return commit(s, d);
    }
    const role = CLAIM_OF[a.move];
    // The bot answers your claim from the state before it: your cards stay hidden.
    const go = settleClaim(d, 'player', role, botChallenges(s, role), seed, n);
    if (!go || !d.player.hand.length || !d.bot.hand.length) return commit(s, d);
    if (a.move === 'steal' && d.bot.coins > 0 && botBlocks(s, draw(seed, n, 1))) {
      // Wait for your answer to the block; keep the claim's outcome in a provisional state.
      d.turn.blocked = true;
      return { ...s, deck: d.deck, player: d.player, bot: d.bot, pendingBlock: true, turns: [...s.turns, { ...d.turn, succeeded: false }] };
    }
    performMove(d, 'player', a.move, seed, n);
    return commit(s, d);
  }

  if (a.kind === 'block-answer') {
    const turns = s.turns.slice(0, -1);
    const prev = s.turns[s.turns.length - 1];
    const base: PowerState = { ...s, turns, pendingBlock: false };
    const d: Draft = { deck: s.deck, player: s.player, bot: s.bot, botSaw: s.botSaw, playerSaw: s.playerSaw, turn: { ...prev, lost: { player: [...prev.lost.player], bot: [...prev.lost.bot] } } };
    if (a.answer === 'accept') return commit(base, d);
    d.turn.blockChallenged = true;
    const real = has(d.bot, 'guard');
    d.turn.blockTruthful = real;
    if (real) {
      const sw = swapProven(d.bot, d.deck, 'guard');
      d.deck = sw.deck;
      d.bot = sw.side;
      const l = loseOne(d.player, seed, n, 72);
      d.player = l.side;
      d.turn.lost.player.push(l.role);
      return commit(base, d);
    }
    const l = loseOne(d.bot, seed, n, 73);
    d.bot = l.side;
    d.turn.lost.bot.push(l.role);
    d.turn.blocked = false;
    performMove(d, 'player', 'steal', seed, n);
    return commit(base, d);
  }

  // Responding to the bot's action.
  const move = botAction(s, draw(seed, n, 0));
  const d = draft(s, 'bot', move);
  if (move === 'income') {
    performMove(d, 'bot', 'income', seed, n);
    return commit(s, d);
  }
  const role = CLAIM_OF[move];
  if (a.answer === 'block') {
    d.turn.blocked = true;
    if (botChallengesBlock(s)) {
      d.turn.blockChallenged = true;
      const real = has(d.player, 'guard');
      d.turn.blockTruthful = real;
      if (real) {
        const sw = swapProven(d.player, d.deck, 'guard');
        d.deck = sw.deck;
        d.player = sw.side;
        const l = loseOne(d.bot, seed, n, 74);
        d.bot = l.side;
        d.turn.lost.bot.push(l.role);
      } else {
        const l = loseOne(d.player, seed, n, 75);
        d.player = l.side;
        d.turn.lost.player.push(l.role);
        d.turn.blocked = false;
        performMove(d, 'bot', move, seed, n);
      }
    }
    return commit(s, d);
  }
  const go = settleClaim(d, 'bot', role, a.answer === 'challenge', seed, n);
  if (go) performMove(d, 'bot', move, seed, n);
  return commit(s, d);
}

export function powerOutcome(s: PowerState): Outcome {
  if (!s.bot.hand.length || s.player.coins >= WIN_COINS) return s.player.hand.length ? 'win' : 'loss';
  if (!s.player.hand.length || s.bot.coins >= WIN_COINS) return 'loss';
  if (s.player.hand.length !== s.bot.hand.length) return s.player.hand.length > s.bot.hand.length ? 'win' : 'loss';
  return s.player.coins > s.bot.coins ? 'win' : s.player.coins < s.bot.coins ? 'loss' : 'draw';
}

const MOVE_TEXT: Record<PowerMove, string> = { income: 'took Income', treasury: 'claimed Treasurer for Treasury', steal: 'claimed Thief to Steal', foresight: 'claimed Oracle for Foresight' };
export const moveText = (m: PowerMove) => MOVE_TEXT[m];

function powerDebrief(s: PowerState): Debrief {
  const t = s.turns.map((x, i) => ({ x, i }));
  const moments: { at: number; text: string }[] = [];
  const yourCaught = t.find(({ x }) => x.actor === 'player' && x.truthful === false);
  if (yourCaught) moments.push({ at: yourCaught.i, text: `Turn ${yourCaught.i + 1}: you ${MOVE_TEXT[yourCaught.x.move]} without the card — challenged and caught. You lost your ${ROLE_NAME[yourCaught.x.lost.player[0]]}.` });
  const goodChallenge = t.find(({ x }) => x.actor === 'bot' && x.challenged && x.truthful === false);
  const badChallenge = t.find(({ x }) => x.actor === 'bot' && x.challenged && x.truthful === true);
  if (goodChallenge) moments.push({ at: goodChallenge.i, text: `Turn ${goodChallenge.i + 1}: you challenged its ${ROLE_NAME[CLAIM_OF[goodChallenge.x.move as Exclude<PowerMove, 'income'>]]} claim — a bluff. It lost a ${ROLE_NAME[goodChallenge.x.lost.bot[0]]}.` });
  else if (badChallenge) moments.push({ at: badChallenge.i, text: `Turn ${badChallenge.i + 1}: you challenged its ${ROLE_NAME[CLAIM_OF[badChallenge.x.move as Exclude<PowerMove, 'income'>]]} claim, but it had the card. You lost a ${ROLE_NAME[badChallenge.x.lost.player[0]]}.` });
  const bigBluff = t.find(({ x }) => x.actor === 'player' && x.move !== 'income' && x.truthful === null && x.succeeded);
  if (bigBluff && moments.length < 3) moments.push({ at: bigBluff.i, text: `Turn ${bigBluff.i + 1}: you ${MOVE_TEXT[bigBluff.x.move]} and nobody questioned it.` });
  if (!moments.length) moments.push({ at: 0, text: `Nobody was challenged: ${s.player.coins} coins to ${s.bot.coins}.` });
  const insight = 'A claim is only as credible as the cost of being caught. Count what you can see — three copies of each role, minus your own and every face-up card — before you challenge, and remember that a challenge costs you a card when the claim was true.';
  const theirs = t.filter(({ x }) => x.actor === 'bot');
  const claims = theirs.filter(({ x }) => x.move !== 'income');
  const exposed = claims.filter(({ x }) => x.truthful === false).length;
  const yourClaims = t.filter(({ x }) => x.actor === 'player' && x.move !== 'income');
  const theyChallenged = yourClaims.filter(({ x }) => x.challenged).length;
  const style: Record<PowerPersona, string> = {
    honest: 'claimed only roles it held and rarely challenged',
    bluffer: 'bluffed when the odds of being challenged were low',
    challenger: 'played straight and challenged claims the cards made unlikely',
    manipulator: 'mixed real roles, selective bluffs and Guard blocks, and avoided challenges',
  };
  return {
    headline: powerOutcome(s) === 'win' ? 'Power secured' : powerOutcome(s) === 'loss' ? 'Outplayed' : 'Stalemate',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${POWER_NAME[s.setup.persona]} ${style[s.setup.persona]}: it made ${claims.length} role claims (${exposed} exposed as bluffs) and challenged ${theyChallenged} of your ${yourClaims.length}. Its face-down cards at the end: ${s.bot.hand.map((c) => ROLE_NAME[c.role]).join(', ') || 'none'}.`,
  };
}

export const powerPlay: ArenaEngine<PowerState, PowerAction, PowerVariant> = {
  id: 'power-play',
  opponents: POWER_PERSONAS,
  variants: POWER_VARIANTS,
  rounds: powerTurns,
  endsEarly: true,
  create(setup) {
    const s = setup as Setup<PowerVariant, PowerPersona>;
    const cards: Card[] = ROLES.flatMap((role, r) => Array.from({ length: COPIES }, (_, k) => ({ id: r * COPIES + k, role })));
    const deck = shuffled(cards, s.seed, 900, 0);
    return {
      setup: s,
      total: powerTurns(s.length),
      deck: deck.slice(4),
      player: { hand: deck.slice(0, 2), lost: [], coins: START_COINS },
      bot: { hand: deck.slice(2, 4), lost: [], coins: START_COINS },
      turns: [],
      pendingBlock: false,
      botSaw: {},
      playerSaw: {},
    };
  },
  validate,
  apply,
  isOver: (s) => !s.pendingBlock && isOverPower(s),
  played: (s) => s.turns.length - (s.pendingBlock ? 1 : 0),
  result(s) {
    const outcome = powerOutcome(s);
    const score = (x: Side) => x.coins;
    return {
      outcome,
      par: null,
      note: s.turns.length >= s.total && s.player.hand.length && s.bot.hand.length && s.player.coins < WIN_COINS && s.bot.coins < WIN_COINS ? 'Turn limit reached: influence first, then coins.' : null,
      player: s.player.coins,
      rival: s.bot.coins,
      standings: [
        { id: 'you', name: 'You', score: score(s.player), isPlayer: true },
        { id: s.setup.persona, name: POWER_NAME[s.setup.persona], score: score(s.bot), isPlayer: false },
      ].sort((a, b) => b.score - a.score),
      unit: 'coins',
    };
  },
  debrief: powerDebrief,
  moves(s) {
    const p = powerPrompt(s);
    if (!p) return [];
    if (p.phase === 'act') return (['income', 'treasury', 'steal', 'foresight'] as const).map((move) => ({ kind: 'act', move }));
    if (p.phase === 'block') return [{ kind: 'block-answer', answer: 'accept' }, { kind: 'block-answer', answer: 'challenge' }];
    if (p.move === 'income') return [{ kind: 'respond', answer: 'allow' }];
    return [{ kind: 'respond', answer: 'allow' }, { kind: 'respond', answer: 'challenge' }, ...(p.move === 'steal' ? [{ kind: 'respond', answer: 'block' } as PowerAction] : [])];
  },
};
