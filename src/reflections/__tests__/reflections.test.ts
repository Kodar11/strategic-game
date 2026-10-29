/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { auctionPrompt } from '../../arena/auction.ts';
import { ARENA } from '../../arena/catalog.ts';
import { ARENA_IDS, type ArenaGameId, LENGTHS, LEVELS } from '../../arena/core.ts';
import { lastStand, teammatePlan } from '../../arena/last-stand.ts';
import { PRICE_MAX, PRICE_MIN } from '../../arena/market.ts';
import { ARENA_ENGINES } from '../../arena/registry.ts';
import { signalPrompt } from '../../arena/signal.ts';
import { ultPrompt, ultimatumGame } from '../../arena/ultimatum-game.ts';
import { LESSON_IDS } from '../../content/lessons.ts';
import { GAMES } from '../../games/catalog.ts';
import { DIFFICULTIES, GAME_IDS, type GameId, draw } from '../../games/core.ts';
import { ENGINES } from '../../games/registry.ts';
import type { RpsRound } from '../../games/rps.ts';
import type { SplitRound } from '../../games/split-steal.ts';
import type { StagRound } from '../../games/stag-hunt.ts';
import type { TwoThirdsRound } from '../../games/two-thirds.ts';
import type { UltimatumRound } from '../../games/ultimatum.ts';
import { RPS, SPLIT_STEAL, STAG_HUNT, TWO_THIRDS, ULTIMATUM } from '../classic.ts';
import { REFLECTIONS, type ReflectionGame, reflect } from '../registry.ts';
import { eligibleRules, selectReflection } from '../select.ts';
import type { Reflection } from '../types.ts';

// ── Driving real matches ────────────────────────────────────────────────────

/** A seeded random player: legal moves only, chosen without any strategy, so every kind of event can occur. */
function rng(seed: number) {
  let k = 0;
  return (lo: number, hi: number) => lo + Math.floor(draw(seed, 7777, k++) * (hi - lo + 1));
}

/**
 * Two kinds of player: `random` (any legal move) and `steady` (one consistent, simple strategy — the kind of player
 * random play never imitates: always split, always offer half, always the first listed move).
 */
type Policy = 'random' | 'steady';

function classicMatch(game: GameId, bot: string, difficulty: (typeof DIFFICULTIES)[number], seed: number, policy: Policy = 'random'): unknown[] {
  const engine = ENGINES[game];
  const spec = { bot, difficulty, seed };
  const r = rng(seed);
  const h: unknown[] = [];
  for (let i = 0; i < engine.rounds; i++) {
    const p = engine.prompt(spec, h) as { role?: string } | null;
    const steady = { rps: 'rock', 'two-thirds': 33, 'split-steal': 'split', 'stag-hunt': 'stag', ultimatum: p?.role === 'propose' ? 5 : 'accept' }[game];
    const move =
      policy === 'steady' ? steady
      : game === 'rps' ? ['rock', 'paper', 'scissors'][r(0, 2)]
      : game === 'two-thirds' ? r(0, 100)
      : game === 'split-steal' ? (r(0, 1) ? 'split' : 'steal')
      : game === 'stag-hunt' ? (r(0, 1) ? 'stag' : 'hare')
      : p?.role === 'propose' ? r(1, 9) : r(0, 2) ? 'accept' : 'reject';
    h.push(engine.resolve(spec, h, engine.parseMove(move, p)));
  }
  return h;
}

function steadyMove(id: ArenaGameId, s: any): unknown {
  switch (id) {
    case 'cooperation':
      return { move: 'C', round: s.rounds.length };
    case 'ultimatum-game': {
      const p = ultPrompt(s)!;
      return p.terms.proposer === 'player' ? Math.floor(p.terms.pool / 2) : 'reject';
    }
    case 'auction': {
      const p = auctionPrompt(s)!;
      return Math.min(p.cash, Math.round(p.estimate * 0.7));
    }
    case 'market':
      return 12;
    case 'signal': {
      const p = signalPrompt(s)!;
      return p.role === 'send' ? (p.strong ? 'stake' : 'warn') : p.signal === 'warn' ? 'pass' : 'invest';
    }
  }
  return ARENA_ENGINES[id].moves!(s)[0];
}

function arenaMove(id: ArenaGameId, s: any, r: (lo: number, hi: number) => number): unknown {
  switch (id) {
    case 'cooperation':
      return { move: r(0, 1) ? 'C' : 'D', round: s.rounds.length };
    case 'ultimatum-game': {
      const p = ultPrompt(s)!;
      return p.terms.proposer === 'player' ? r(0, p.terms.pool) : r(0, 1) ? 'accept' : 'reject';
    }
    case 'auction': {
      const p = auctionPrompt(s)!;
      return Math.min(p.cash, r(0, p.estimate + 12));
    }
    case 'market':
      return r(PRICE_MIN, PRICE_MAX);
    case 'signal': {
      const p = signalPrompt(s)!;
      if (p.role === 'send') return (['warn', 'pitch', 'stake'] as const)[r(0, 2)];
      if (p.test === null && r(0, 2) === 0) return 'investigate';
      return r(0, 1) ? 'invest' : 'pass';
    }
  }
  const ms = ARENA_ENGINES[id].moves!(s);
  return ms[r(0, ms.length - 1)];
}

function arenaMatch(id: ArenaGameId, persona: string, level: (typeof LEVELS)[number], length: (typeof LENGTHS)[number], variant: string, seed: number, policy: Policy = 'random'): any {
  const engine = ARENA_ENGINES[id];
  const r = rng(seed);
  let s = engine.create({ persona, level, length, variant, seed });
  for (let k = 0; !engine.isOver(s); k++) {
    if (k > 600) throw new Error(`${id} did not finish`);
    s = engine.apply(s, policy === 'steady' ? steadyMove(id, s) : arenaMove(id, s, r));
  }
  return s;
}

/** Every finished match in the sweep, per game. */
function* sweep(): Generator<{ game: ReflectionGame; record: unknown }> {
  for (const policy of ['random', 'steady'] as const) {
    for (const game of GAME_IDS)
      for (const bot of ENGINES[game].bots)
        for (const difficulty of DIFFICULTIES) for (let seed = 1; seed <= (policy === 'random' ? 12 : 3); seed++) yield { game, record: classicMatch(game, bot, difficulty, seed * 7919 + bot.length, policy) };
    for (const id of ARENA_IDS) {
      const engine = ARENA_ENGINES[id];
      for (const persona of engine.opponents)
        for (const level of LEVELS)
          for (const variant of engine.variants)
            for (const length of LENGTHS) for (let seed = 1; seed <= (policy === 'random' ? 4 : 2); seed++) yield { game: id, record: arenaMatch(id, persona, level, length, variant, seed * 104729 + persona.length * 31 + level.length, policy) };
    }
  }
  // Moves the UI allows but neither player above makes: dousing the district your teammate announced (the move list
  // only offers the hottest *other* district).
  for (let seed = 1; seed <= 20; seed++) {
    let s: any = lastStand.create({ persona: 'planner', level: 'normal', length: 'standard', variant: 'standard', seed });
    while (!lastStand.isOver(s)) {
      const mate = teammatePlan(s);
      const same = mate.kind === 'douse' && s.water >= 2 ? mate : null;
      s = lastStand.apply(s, same ?? lastStand.moves!(s)[0]);
    }
    yield { game: 'last-stand', record: s };
  }
  // A responder who takes anything above their walk-away and refuses the rest, against an opponent whose offers fall
  // while they're accepted — the only way an offer reaches the walk-away value.
  for (let seed = 1; seed <= 60; seed++) {
    let s: any = ultimatumGame.create({ persona: 'opportunist', level: 'normal', length: 'long', variant: 'outside-options', seed });
    while (!ultimatumGame.isOver(s)) {
      const p = ultPrompt(s)!;
      s = ultimatumGame.apply(s, p.terms.proposer === 'player' ? Math.floor(p.terms.pool / 2) : p.botOffer! > p.terms.walkPlayer ? 'accept' : 'reject');
    }
    yield { game: 'ultimatum-game', record: s };
  }
}

const MATCHES = [...sweep()];

function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}

// ── Copy rules ──────────────────────────────────────────────────────────────

/** Opponent display names: a reflection never names who the opponent was (the reveal does that). */
const OPPONENT_NAMES = [
  ...GAME_IDS.flatMap((g) => GAMES[g].personalities.map((p) => p.name)),
  ...ARENA_IDS.flatMap((g) => ARENA[g].opponents.map((o) => o.name)),
];
/** Words that describe the machinery or prescribe an answer. */
const BANNED = [/\bbots?\b/i, /personalit/i, /\bpolicy\b/i, /algorithm/i, /\boptimal\b/i, /best move/i, /should have/i, /well done/i, /great job/i, /played well/i, /\bmistake\b/i, /guarantee/i, /the answer is/i, /always wins/i];

const sentences = (t: string) => t.split(/(?<=[.?!])\s+/).filter(Boolean).length;

function checkCopy(r: Reflection, where: string) {
  const texts = [r.thought, r.idea, r.perspective, r.question];
  for (const t of texts) {
    assert.ok(t.trim().length > 10, `${where}: empty copy`);
    assert.doesNotMatch(t, /undefined|NaN|null|\[object/, `${where}: unfilled value in “${t}”`);
    for (const name of OPPONENT_NAMES) assert.ok(!t.includes(name), `${where}: names an opponent (${name}): “${t}”`);
    for (const b of BANNED) assert.doesNotMatch(t, b, `${where}: “${t}”`);
  }
  assert.ok(sentences(r.thought) <= 2, `${where}: thought is more than two sentences: “${r.thought}”`);
  assert.ok(r.thought.length <= 240, `${where}: thought is ${r.thought.length} characters: “${r.thought}”`);
  for (const t of [r.idea, r.perspective]) assert.ok(sentences(t) <= 2 && t.length <= 220, `${where}: deeper copy too long: “${t}”`);
  assert.ok(r.question.trim().endsWith('?') && sentences(r.question) === 1, `${where}: the question isn’t one question: “${r.question}”`);
  assert.ok(r.lesson === null || (LESSON_IDS as readonly string[]).includes(r.lesson), `${where}: unknown lesson ${r.lesson}`);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('reflection registry', () => {
  it('covers all 23 games in the library — 5 classic and 18 arena', () => {
    assert.deepEqual(Object.keys(REFLECTIONS).sort(), [...GAME_IDS, ...ARENA_IDS].sort());
    for (const [id, def] of Object.entries(REFLECTIONS)) {
      assert.equal(def.game, id);
      assert.ok(def.rules.length >= 4, `${id}: only ${def.rules.length} reflection opportunities`);
      assert.equal(new Set(def.rules.map((r) => r.id)).size, def.rules.length, `${id}: duplicate rule ids`);
      checkCopy({ ...def.general, id: `${id}.general`, lesson: def.lesson, evidence: {}, general: true }, `${id}.general`);
    }
  });

  it('never reuses a general fallback across games', () => {
    const thoughts = Object.values(REFLECTIONS).map((d) => d.general.thought);
    assert.equal(new Set(thoughts).size, thoughts.length);
  });
});

describe('reflections on real matches', () => {
  it(`produces concise, spoiler-free copy for every finished match (${MATCHES.length} matches)`, () => {
    for (const { game, record } of MATCHES) {
      const r = reflect(game, deepFreeze(record));
      checkCopy(r, r.id);
      assert.ok(r.id.startsWith(`${game}.`), r.id);
      // A personalized reflection always rests on facts from the match; the fallback says it is general.
      assert.equal(r.general, Object.keys(r.evidence).length === 0, r.id);
    }
  });

  it('never changes the match it reflects on', () => {
    for (const { game, record } of MATCHES.filter((_, i) => i % 5 === 0)) {
      const before = JSON.stringify(record);
      reflect(game, record);
      assert.equal(JSON.stringify(record), before, game);
    }
  });

  it('is deterministic for the same match and history', () => {
    for (const { game, record } of MATCHES.filter((_, i) => i % 7 === 0)) assert.deepEqual(reflect(game, record, ['x']), reflect(game, record, ['x']));
  });

  it('personalizes in every game: several different reflections appear across matches', () => {
    for (const id of [...GAME_IDS, ...ARENA_IDS]) {
      const seen = new Set(MATCHES.filter((m) => m.game === id).map((m) => reflect(m.game, m.record).id));
      const personal = [...seen].filter((s) => !s.endsWith('.general'));
      assert.ok(personal.length >= 2, `${id}: only ${[...seen].join(', ')}`);
    }
  });

  it('every rule’s event actually happens in real play', () => {
    const fired = new Set<string>();
    for (const { game, record } of MATCHES) for (const r of eligibleRules(REFLECTIONS[game], record)) fired.add(`${game}.${r}`);
    const never = Object.values(REFLECTIONS).flatMap((d) => d.rules.map((r) => `${d.game}.${r.id}`)).filter((id) => !fired.has(id));
    assert.deepEqual(never, []);
  });
});

describe('selection', () => {
  const steals = (moves: [string, string][]): SplitRound[] =>
    moves.map(([p, b]) => ({ p, b, ps: p === 'split' ? (b === 'split' ? 5 : 0) : b === 'split' ? 8 : 1, bs: b === 'split' ? (p === 'split' ? 5 : 0) : p === 'split' ? 8 : 1 }) as SplitRound);

  it('prefers a specific moment over a pattern, and rotates only between equally specific ones', () => {
    // Round 2: you split after their steal (tier 1). Rounds 3–6: a run of mutual splits (tier 2).
    const h = steals([['split', 'steal'], ['split', 'split'], ['split', 'split'], ['split', 'split'], ['split', 'split'], ['split', 'split']]);
    assert.deepEqual(eligibleRules(SPLIT_STEAL, h), ['split-after-steal', 'split-run']);
    assert.equal(selectReflection(SPLIT_STEAL, h).id, 'split-steal.split-after-steal');
    // Recently shown, but it is the only moment of its tier: still chosen, never swapped for a weaker pattern.
    assert.equal(selectReflection(SPLIT_STEAL, h, ['split-steal.split-after-steal']).id, 'split-steal.split-after-steal');
    // Two tier-1 moments: rotation picks the one not shown last time.
    const both = steals([['split', 'steal'], ['steal', 'split'], ['split', 'steal'], ['split', 'split']]);
    assert.deepEqual(eligibleRules(SPLIT_STEAL, both).slice(0, 2), ['split-after-steal', 'stole-back']);
    assert.equal(selectReflection(SPLIT_STEAL, both, ['split-steal.split-after-steal']).id, 'split-steal.stole-back');
  });

  it('falls back to the game’s general reflection when no event supports a personal one', () => {
    const h = steals([['split', 'split'], ['split', 'split']]);
    assert.deepEqual(eligibleRules(SPLIT_STEAL, h), []);
    const r = selectReflection(SPLIT_STEAL, h);
    assert.equal(r.id, 'split-steal.general');
    assert.equal(r.general, true);
    assert.deepEqual(r.evidence, {});
  });

  it('quotes the facts it was built from', () => {
    const h = steals([['split', 'split'], ['split', 'steal'], ['split', 'split']]);
    const r = selectReflection(SPLIT_STEAL, h);
    assert.equal(r.id, 'split-steal.split-after-steal');
    assert.deepEqual(r.evidence, { round: 3, prev: 2 });
    assert.match(r.thought, /stole in round 2, and you split anyway in round 3/);
  });
});

describe('eligibility needs the event (classic games)', () => {
  it('Rock, Paper, Scissors: streaks and leans only when they happened', () => {
    const h = (ps: string, rs: number[]) => [...ps].map((c, i) => ({ p: ({ r: 'rock', p: 'paper', s: 'scissors' } as const)[c as 'r'], b: 'rock', r: rs[i] }) as RpsRound);
    assert.deepEqual(eligibleRules(RPS, h('rpsrps', [1, -1, 0, 1, -1, 0])), []);
    assert.ok(eligibleRules(RPS, h('rpsrps', [-1, -1, -1, 1, 0, 1])).includes('losing-streak'));
    assert.ok(eligibleRules(RPS, h('rrrpsr', [0, 1, 0, 1, 0, 1])).includes('favourite-throw'));
    assert.match(reflect('rps', h('rpsrps', [-1, -1, -1, 1, 0, 1])).thought, /lost 3 rounds in a row, rounds 1 to 3/);
  });

  it('Two-Thirds: “higher than every other pick” needs exactly that', () => {
    const round = (p: number, bots: number[]): TwoThirdsRound => ({ p, bots, ps: 0, botWon: true });
    assert.ok(eligibleRules(TWO_THIRDS, [round(80, [30, 31, 32, 33, 34, 35, 36, 79])]).includes('highest-pick'));
    assert.ok(!eligibleRules(TWO_THIRDS, [round(80, [30, 31, 32, 33, 34, 35, 36, 81])]).includes('highest-pick'));
  });

  it('The Ultimatum: a rejection reflection only after a rejection', () => {
    const r = (proposer: 'player' | 'bot', offer: number, accepted: boolean): UltimatumRound => ({ proposer, offer, accepted, ps: 0, bs: 0 });
    assert.ok(!eligibleRules(ULTIMATUM, [r('player', 5, true), r('bot', 4, true)]).some((x) => x.includes('reject')));
    assert.ok(eligibleRules(ULTIMATUM, [r('player', 5, true), r('bot', 2, false)]).includes('you-rejected'));
    assert.ok(eligibleRules(ULTIMATUM, [r('player', 2, false), r('bot', 5, true)]).includes('offer-rejected'));
  });

  it('Stag Hunt: “hunted the stag alone” needs a lone stag', () => {
    const r = (p: 'stag' | 'hare', b: 'stag' | 'hare'): StagRound => ({ p, b, ps: 0, bs: 0 });
    assert.ok(!eligibleRules(STAG_HUNT, [r('stag', 'stag'), r('hare', 'hare')]).includes('stag-alone'));
    assert.ok(eligibleRules(STAG_HUNT, [r('stag', 'hare'), r('hare', 'hare')]).includes('stag-alone'));
  });
});

describe('eligibility needs the event (arena games)', () => {
  const setup = (persona: string) => ({ persona, level: 'normal', length: 'standard', variant: 'standard', seed: 1 });

  it('The Cooperation Game: “cooperated after a defection” only after a delivered defection', () => {
    const r = (pi: 'C' | 'D', b: 'C' | 'D', bi = b) => ({ pi, p: pi, bi, b, ps: 0, bs: 0 });
    const state = (rounds: any[]) => ({ setup: setup('collaborator'), total: rounds.length, rounds });
    assert.ok(!eligibleRules(REFLECTIONS.cooperation, state([r('C', 'C'), r('C', 'C')])).includes('coop-after-defection'));
    assert.ok(eligibleRules(REFLECTIONS.cooperation, state([r('C', 'D'), r('C', 'C')])).includes('coop-after-defection'));
    // The bot meant C but a slip delivered D: the player saw a defection, and a slip.
    assert.deepEqual(eligibleRules(REFLECTIONS.cooperation, state([r('C', 'D', 'C'), r('C', 'C')])).slice(0, 2), ['slip', 'coop-after-defection']);
  });

  it('The Inspector: an inspection that found nothing needs one', () => {
    const r = (operator: 'player' | 'bot', op: 'comply' | 'cut', ins: 'inspect' | 'trust') => ({ operator, op, ins, points: [0, 0] });
    const state = (rounds: any[]) => ({ setup: setup('strict'), total: rounds.length, rounds });
    assert.ok(!eligibleRules(REFLECTIONS.inspector, state([r('player', 'comply', 'trust'), r('bot', 'cut', 'inspect')])).includes('inspected-clean'));
    assert.match(reflect('inspector', state([r('player', 'comply', 'trust'), r('bot', 'comply', 'inspect')])).thought, /round 2 you paid to inspect and found an honest report/);
  });

  it('Bluff: a “called bluff” needs your claim to exceed your tokens and a call', () => {
    const r = (claim: number, tokens: (0 | 1 | 3)[], call: boolean) => ({ claimant: 'player', tokens, bust: false, claim, call, points: [0, 0] });
    const state = (rounds: any[]) => ({ setup: setup('cautious'), total: rounds.length, rounds, hand: [] });
    assert.deepEqual(eligibleRules(REFLECTIONS.bluff, state([r(4, [3, 1], true)])), ['honest-called']);
    assert.deepEqual(eligibleRules(REFLECTIONS.bluff, state([r(5, [3, 1], true)])), ['bluff-called']);
    assert.deepEqual(eligibleRules(REFLECTIONS.bluff, state([r(5, [3, 1], false)])), ['bluff-believed']);
  });

  it('Liar’s Dice: calling and losing is told apart from calling and winning', () => {
    const r = (caller: 'player' | 'bot', loser: 'player' | 'bot', count: number) => ({ opener: 'player', dice: { player: [], bot: [] }, bids: [{ by: 'bot', q: 3, f: 5 }], caller, count, loser });
    const state = (rounds: any[]) => ({ setup: setup('calculator'), count: { player: 1, bot: 0 }, rounds, bids: [] });
    assert.deepEqual(eligibleRules(REFLECTIONS['liars-dice'], state([r('player', 'player', 3)])), ['called-and-lost']);
    assert.match(reflect('liars-dice', state([r('player', 'bot', 1)])).thought, /called 3 fives, and there were only 1/);
  });

  it('The Gambit: a failed risk needs a Dash or Strike of yours that missed', () => {
    const t = (side: 'player' | 'bot', kind: 'step' | 'dash' | 'strike', success: boolean) => ({ side, move: { from: [0, 0], to: [1, 0], kind }, success, captured: false, home: false });
    const state = (turns: any[]) => ({ setup: setup('safe'), total: 10, turns, pieces: [], home: { player: 0, bot: 0 } });
    assert.ok(!eligibleRules(REFLECTIONS.gambit, state([t('player', 'step', true), t('bot', 'dash', false)])).includes('failed-risk'));
    assert.match(reflect('gambit', state([t('player', 'step', true), t('bot', 'step', true), t('player', 'dash', false)])).thought, /Your Dash on turn 2 didn’t come off/);
  });

  it('The Codebreaker: a trap reflection names the trap that was actually picked', () => {
    const board = { words: ['Shark', 'Anchor', 'Crown'], key: ['target', 'trap', 'neutral'] };
    const state = (guesses: number[]) => ({ setup: setup('literal'), total: 1, guessing: [], rounds: [{ giver: 'player', board, clue: { theme: 'ocean', n: 2 }, guesses, points: 0 }] });
    assert.ok(!eligibleRules(REFLECTIONS.codebreaker, state([0, 2])).includes('your-clue-trap'));
    assert.match(reflect('codebreaker', state([0, 1])).thought, /“Ocean” for 2 led your teammate to Anchor, a trap/);
  });
});

describe('spoilers and hidden state', () => {
  it('never reads the Ultimatum Game’s private acceptance threshold', () => {
    for (const { game, record } of MATCHES.filter((m) => m.game === 'ultimatum-game')) {
      const s = record as any;
      const masked = { ...s, rounds: s.rounds.map((r: any) => ({ ...r, botMin: -999 })) };
      assert.deepEqual(reflect(game, masked), reflect(game, s));
    }
  });

  it('never says who the Mole or the saboteur was', () => {
    for (const { game, record } of MATCHES.filter((m) => m.game === 'mole' || m.game === 'saboteur')) {
      const s = record as any;
      // Moving the hidden player to another seat changes nothing in the reflection: it isn't used.
      const other = game === 'mole' ? { ...s, mole: (s.mole + 1) % 4 } : { ...s, saboteur: (s.saboteur % 3) + 1 };
      assert.deepEqual(reflect(game, other), reflect(game, s), game);
    }
  });

  it('never depends on which personality the opponent was', () => {
    for (const { game, record } of MATCHES.filter((_, i) => i % 3 === 0)) {
      const s = record as any;
      if (!s.setup) continue;
      const opponents = ARENA_ENGINES[game as ArenaGameId].opponents;
      const swapped = { ...s, setup: { ...s.setup, persona: opponents.find((o) => o !== s.setup.persona) } };
      assert.deepEqual(reflect(game, swapped), reflect(game, s), game);
    }
  });

  it('says nothing about whether an unchallenged Power Play claim was true', () => {
    for (const { record } of MATCHES.filter((m) => m.game === 'power-play')) {
      const s = record as any;
      const r = reflect('power-play', s);
      const turn = r.evidence.turn as number | undefined;
      // Every Power Play rule that points at a turn is about a challenged claim, whose truth the challenge revealed.
      if (turn !== undefined) assert.equal(s.turns[turn - 1].challenged, true, r.id);
    }
  });
});
