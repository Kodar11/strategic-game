import { type ArenaEngine, type Debrief, LENGTH_ROUNDS, type Level, type Setup, shuffled } from './core.ts';

/**
 * The Codebreaker — one teammate sees which words are the targets; the other has only a one-word clue to go on.
 *
 * Each round a fresh board (seeded): TARGETS targets, a trap, the rest neutral. Difficulty is the board — Easy 8
 * words and one trap, Normal 9 and one, Hard 9 and two traps; your teammate reasons the same way on every level. Roles alternate:
 * your bot teammate gives the clue in odd rounds (you guess), you give it in even rounds (it guesses).
 *
 * The clue: one theme from the THEMES list and a number (1–3) — "how many targets fit". The clue-giver sees the key;
 * the guesser sees only the board and the clue. No other hints: the board never marks anything until it is guessed.
 *
 * Guessing: pick words one at a time, up to the number + 1. A target: +1, keep going (or stop). A neutral word: the
 * turn ends. The trap: −TRAP_PENALTY and the turn ends. Stopping early is always allowed.
 *
 * Shared score. Success: at least PAR_PER_ROUND targets per round on average, net of traps.
 *
 * How the bot reads words: every word has theme strengths 1–3 (ASSOC). People's associations differ — that is the
 * game. The teammate's personality is how it uses those links, as clue-giver (botClue) and as guesser (botGuesses).
 * It never sees the key when guessing.
 */

export const CODE_PERSONAS = ['literal', 'associative', 'risk-aware', 'creative'] as const;
export type CodePersona = (typeof CODE_PERSONAS)[number];
export const CODE_NAME: Record<CodePersona, string> = { literal: 'The Literal Clue-Giver', associative: 'The Associative Thinker', 'risk-aware': 'The Risk-Aware Communicator', creative: 'The Creative Connector' };

export type CodeVariant = 'standard';
export const CODE_VARIANTS: readonly CodeVariant[] = ['standard'];
export const codeRounds = LENGTH_ROUNDS(4, 6, 8);
export const BOARD_SIZE = 9;
export const TARGETS = 3;
export const TRAP_PENALTY = 3;

export const THEMES = ['ocean', 'fire', 'royalty', 'music', 'sky', 'forest', 'metal', 'speed', 'night', 'food', 'cold', 'war'] as const;
export type Theme = (typeof THEMES)[number];

type Links = Partial<Record<Theme, 1 | 2 | 3>>;
/** Theme strengths per word: 3 = obvious, 2 = clear, 1 = a stretch. */
export const ASSOC: Record<string, Links> = {
  Shark: { ocean: 3, speed: 1, war: 1 },
  Anchor: { ocean: 3, metal: 2 },
  Pearl: { ocean: 2, royalty: 2 },
  Lobster: { ocean: 3, food: 2 },
  Crown: { royalty: 3, metal: 2 },
  Throne: { royalty: 3 },
  Castle: { royalty: 2, war: 2, night: 1 },
  Knight: { war: 3, royalty: 2, metal: 1, night: 1 },
  Sword: { war: 3, metal: 3 },
  Cannon: { war: 3, metal: 2, ocean: 1 },
  Volcano: { fire: 3, sky: 1 },
  Dragon: { fire: 3, sky: 2, royalty: 1, war: 1 },
  Candle: { fire: 2, night: 2 },
  Torch: { fire: 3, night: 1 },
  Phoenix: { fire: 3, sky: 2 },
  Drum: { music: 3, war: 1 },
  Piano: { music: 3 },
  Violin: { music: 3, forest: 1 },
  Bell: { music: 2, metal: 2 },
  Thunder: { sky: 3, music: 1, night: 1 },
  Eagle: { sky: 3, speed: 2, royalty: 1 },
  Comet: { sky: 3, speed: 3, night: 2, fire: 1 },
  Moon: { night: 3, sky: 2, cold: 1 },
  Owl: { night: 3, forest: 2, sky: 1 },
  Bat: { night: 3, sky: 1 },
  Pine: { forest: 3, cold: 2 },
  Mushroom: { forest: 3, food: 2 },
  Bear: { forest: 3, cold: 1 },
  Wolf: { forest: 2, night: 2, cold: 1 },
  Rocket: { speed: 3, sky: 2, fire: 2, metal: 1 },
  Cheetah: { speed: 3, forest: 1 },
  Train: { speed: 2, metal: 3 },
  Iceberg: { cold: 3, ocean: 2 },
  Penguin: { cold: 3, ocean: 2 },
  Snow: { cold: 3, sky: 1 },
  Bread: { food: 3, fire: 1 },
  Honey: { food: 3, forest: 1 },
  Chili: { food: 2, fire: 2 },
  Coin: { metal: 3, royalty: 2 },
};
export const WORDS = Object.keys(ASSOC);
export const link = (word: string, t: Theme) => ASSOC[word]?.[t] ?? 0;

export type Key = 'target' | 'trap' | 'neutral';

export interface Board {
  words: string[];
  key: Key[];
}

export interface Clue {
  theme: Theme;
  n: number;
}

export interface CodeRound {
  giver: 'bot' | 'player';
  board: Board;
  clue: Clue;
  guesses: number[];
  points: number;
}

export interface CodeState {
  setup: Setup<CodeVariant, CodePersona>;
  total: number;
  rounds: CodeRound[];
  /** Your guesses so far in a round where the bot gave the clue. */
  guessing: number[];
}

export const boardSize = (level: Level) => (level === 'easy' ? 8 : BOARD_SIZE);
export const trapsOn = (level: Level) => (level === 'hard' ? 2 : 1);

export function boardFor(seed: number, n: number, level: Level): Board {
  const size = boardSize(level);
  const words = shuffled(WORDS, seed, n, 0).slice(0, size);
  const order = shuffled([...Array(size).keys()], seed, n, 100);
  const key: Key[] = Array.from({ length: size }, () => 'neutral');
  order.slice(0, TARGETS).forEach((i) => (key[i] = 'target'));
  order.slice(TARGETS, TARGETS + trapsOn(level)).forEach((i) => (key[i] = 'trap'));
  return { words, key };
}

export const botGives = (n: number) => n % 2 === 0;

/**
 * The bot's clue when it sees the key. It scores each theme on the targets it would cover, minus the risk of pointing
 * at the trap or neutral words, by style:
 *
 * Literal — only obvious links count (strength 3): covers targets that are unmistakable, and refuses any theme that
 *   touches the trap at all.
 * Associative — clear links count (2+): wider clues, avoiding only themes strongly tied to the trap (3).
 * Risk-Aware — clear links (2+), and a theme is penalised for every neutral word it also fits and heavily for the trap;
 *   it gives smaller numbers rather than ambiguous ones.
 * Creative — even a stretch counts (1+): it reaches for big numbers through unusual links, avoiding only a trap tied at
 *   2 or more.
 */
export function botClue(persona: CodePersona, board: Board): Clue {
  const min = persona === 'literal' ? 3 : persona === 'creative' ? 1 : 2;
  const trapLimit = persona === 'literal' ? 1 : persona === 'associative' ? 3 : persona === 'creative' ? 2 : 1;
  let best: Clue = { theme: THEMES[0], n: 1 };
  let bestScore = -Infinity;
  for (const t of THEMES) {
    let covered = 0;
    let risk = 0;
    board.words.forEach((w, i) => {
      const l = link(w, t);
      if (board.key[i] === 'target' && l >= min) covered++;
      if (board.key[i] === 'trap' && l >= trapLimit) risk += 10;
      if (board.key[i] === 'neutral' && l >= min) risk += persona === 'risk-aware' ? 1.5 : 0.4;
    });
    if (!covered) continue;
    const score = covered * (persona === 'creative' ? 1.3 : 1) - risk;
    if (score > bestScore) [best, bestScore] = [{ theme: t, n: covered }, score];
  }
  return best;
}

/**
 * The bot's guesses for your clue, in order, from the board and the clue only. Words are ranked by their link to the
 * theme (unrevealed words only); a guess stops the turn when it misses, so the list is what it *intends*:
 *
 * Literal — only words linked at 3, then 2; never a stretch; at most the number given.
 * Associative — any linked word, strongest first, up to the number.
 * Risk-Aware — only words linked at 2+; stops one short when the last candidate ties with an unlinked-looking word.
 * Creative — any linked word, strongest first, up to the number + 1 (it takes the bonus guess).
 */
export function botGuesses(persona: CodePersona, board: Board, clue: Clue): number[] {
  const min = persona === 'literal' || persona === 'risk-aware' ? 2 : 1;
  const ranked = board.words
    .map((w, i) => ({ i, l: link(w, clue.theme) }))
    .filter((x) => x.l >= min)
    .sort((a, b) => b.l - a.l || a.i - b.i);
  let n = persona === 'creative' ? clue.n + 1 : clue.n;
  if (persona === 'risk-aware' && ranked.length > n && ranked[n - 1] && ranked[n] && ranked[n - 1].l === ranked[n].l) n -= 1;
  return ranked.slice(0, Math.max(0, n)).map((x) => x.i);
}

/** Plays out a list of intended guesses: stops at the first miss. Returns the guesses made and the points. */
export function resolveGuesses(board: Board, intended: number[], cap: number): { guesses: number[]; points: number } {
  const guesses: number[] = [];
  let points = 0;
  for (const i of intended.slice(0, cap)) {
    guesses.push(i);
    if (board.key[i] === 'target') points += 1;
    else {
      if (board.key[i] === 'trap') points -= TRAP_PENALTY;
      break;
    }
  }
  return { guesses, points };
}

export type CodeAction = { kind: 'guess'; word: number } | { kind: 'stop' } | { kind: 'clue'; theme: Theme; n: number };

export type CodePrompt =
  | { phase: 'guess'; round: number; board: Board; clue: Clue; guesses: number[]; left: number }
  | { phase: 'clue'; round: number; board: Board };

export function codePrompt(s: CodeState): CodePrompt | null {
  const n = s.rounds.length;
  if (n >= s.total) return null;
  const board = boardFor(s.setup.seed, n, s.setup.level);
  if (botGives(n)) {
    const clue = botClue(s.setup.persona, board);
    return { phase: 'guess', round: n + 1, board, clue, guesses: s.guessing, left: clue.n + 1 - s.guessing.length };
  }
  return { phase: 'clue', round: n + 1, board };
}

function validate(s: CodeState, a: CodeAction): string | null {
  const p = codePrompt(s);
  if (!p) return 'The game is over.';
  if (!a || typeof a !== 'object') return 'Choose an action.';
  if (p.phase === 'clue') {
    if (a.kind !== 'clue') return 'Give your teammate a clue.';
    if (!(THEMES as readonly string[]).includes(a.theme)) return 'Choose a theme from the list.';
    return Number.isInteger(a.n) && a.n >= 1 && a.n <= TARGETS ? null : `The number is 1 to ${TARGETS}.`;
  }
  if (a.kind === 'stop') return p.guesses.length ? null : 'Make at least one guess first.';
  if (a.kind !== 'guess') return 'Guess a word, or stop.';
  if (!Number.isInteger(a.word) || a.word < 0 || a.word >= p.board.words.length) return 'Choose a word on the board.';
  return p.guesses.includes(a.word) ? 'That word is already revealed.' : null;
}

function apply(s: CodeState, a: CodeAction): CodeState {
  const why = validate(s, a);
  if (why) throw new Error(`codebreaker: ${why}`);
  const n = s.rounds.length;
  const board = boardFor(s.setup.seed, n, s.setup.level);
  if (a.kind === 'clue') {
    const clue = { theme: a.theme, n: a.n };
    // The bot reads only the board and your clue.
    const r = resolveGuesses(board, botGuesses(s.setup.persona, board, clue), clue.n + 1);
    return { ...s, rounds: [...s.rounds, { giver: 'player', board, clue, ...r }] };
  }
  const clue = botClue(s.setup.persona, board);
  const finish = (guesses: number[]) => {
    const points = guesses.reduce((t, i) => t + (board.key[i] === 'target' ? 1 : board.key[i] === 'trap' ? -TRAP_PENALTY : 0), 0);
    return { ...s, guessing: [], rounds: [...s.rounds, { giver: 'bot' as const, board, clue, guesses, points }] };
  };
  if (a.kind === 'stop') return finish(s.guessing);
  const guesses = [...s.guessing, a.word];
  const hit = board.key[a.word] === 'target';
  const found = guesses.filter((i) => board.key[i] === 'target').length;
  if (!hit || guesses.length >= clue.n + 1 || found >= TARGETS) return finish(guesses);
  return { ...s, guessing: guesses };
}

export const codeScore = (s: CodeState) => s.rounds.reduce((t, r) => t + r.points, 0);
/** Targets per round the team must average (net of traps) for a success. */
export const PAR_PER_ROUND = 1.15;
export const codePar = (s: CodeState) => Math.ceil(PAR_PER_ROUND * s.total);

function codeDebrief(s: CodeState): Debrief {
  const h = s.rounds.map((r, i) => ({ r, i }));
  const moments: { at: number; text: string }[] = [];
  const word = (r: CodeRound, i: number) => r.board.words[i];
  const trap = h.find(({ r }) => r.guesses.some((g) => r.board.key[g] === 'trap'));
  if (trap) {
    const t = trap.r.guesses.find((g) => trap.r.board.key[g] === 'trap')!;
    moments.push({ at: trap.i, text: `Round ${trap.i + 1}: “${trap.r.clue.theme.toUpperCase()} ${trap.r.clue.n}” led ${trap.r.giver === 'bot' ? 'you' : 'your teammate'} to ${word(trap.r, t)} — the trap.` });
  }
  const yourClues = h.filter(({ r }) => r.giver === 'player');
  const bestYours = yourClues.sort((a, b) => b.r.points - a.r.points)[0];
  if (bestYours) moments.push({ at: bestYours.i, text: `Round ${bestYours.i + 1}: your clue ${bestYours.r.clue.theme.toUpperCase()} ${bestYours.r.clue.n} — your teammate picked ${bestYours.r.guesses.map((g) => word(bestYours.r, g)).join(', ') || 'nothing'} (${bestYours.r.points >= 0 ? '+' : ''}${bestYours.r.points}).` });
  const miss = h.find(({ r }) => r.giver === 'bot' && r.points <= 0 && !r.guesses.some((g) => r.board.key[g] === 'trap'));
  if (miss && moments.length < 3) {
    const targets = miss.r.board.key.map((k, i) => (k === 'target' ? word(miss.r, i) : null)).filter(Boolean);
    moments.push({ at: miss.i, text: `Round ${miss.i + 1}: its clue was ${miss.r.clue.theme.toUpperCase()} ${miss.r.clue.n}; the targets were ${targets.join(', ')}.` });
  }
  if (!moments.length) moments.push({ at: 0, text: `${codeScore(s)} points over ${s.rounds.length} rounds.` });
  const insight = 'A clue means what the listener hears, not what the speaker meant. The same theme pulls different words for different people; good clues cover the targets while staying far from the trap — and a good guesser asks which words the clue-giver would have avoided.';
  const theirs = h.filter(({ r }) => r.giver === 'bot').map(({ r }) => r.clue);
  const avgN = theirs.length ? theirs.reduce((t, c) => t + c.n, 0) / theirs.length : 0;
  const reads = h.filter(({ r }) => r.giver === 'player');
  const style: Record<CodePersona, string> = {
    literal: 'gave direct, obvious clues and took only obvious readings',
    associative: 'linked words through broader themes',
    'risk-aware': 'kept clues safe and narrow, avoiding anything near the trap',
    creative: 'reached for unusual links to cover more words at once',
  };
  const ex = reads[0] ? ` From your ${reads[0].r.clue.theme.toUpperCase()} ${reads[0].r.clue.n} in round ${reads[0].i + 1} it picked ${reads[0].r.guesses.map((g) => reads[0].r.board.words[g]).join(', ') || 'nothing'}.` : '';
  return {
    headline: codeScore(s) >= codePar(s) ? 'Code cracked' : 'Signals crossed',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${CODE_NAME[s.setup.persona]} ${style[s.setup.persona]}: its clues averaged ${avgN.toFixed(1)} words (${theirs.map((c) => `${c.theme} ${c.n}`).join(', ') || 'none'}).${ex}`,
  };
}

export const codebreaker: ArenaEngine<CodeState, CodeAction, CodeVariant> = {
  id: 'codebreaker',
  opponents: CODE_PERSONAS,
  variants: CODE_VARIANTS,
  rounds: codeRounds,
  create: (setup) => ({ setup: setup as Setup<CodeVariant, CodePersona>, total: codeRounds(setup.length), rounds: [], guessing: [] }),
  validate,
  apply,
  isOver: (s) => s.rounds.length >= s.total,
  played: (s) => s.rounds.length,
  result(s) {
    const score = codeScore(s);
    const ok = score >= codePar(s);
    return {
      outcome: ok ? 'win' : 'loss',
      par: codePar(s),
      note: ok ? null : `The team needed ${codePar(s)} points.`,
      player: score,
      rival: 0,
      standings: [{ id: 'team', name: 'Your team', score, isPlayer: true }],
      unit: 'points',
      headline: ok ? 'Code cracked' : 'Signals crossed',
    };
  },
  debrief: codeDebrief,
  moves(s) {
    const p = codePrompt(s);
    if (!p) return [];
    if (p.phase === 'clue') {
      const c = botClue('associative', p.board);
      return [{ kind: 'clue', theme: c.theme, n: c.n }, { kind: 'clue', theme: 'ocean', n: 1 }];
    }
    const open = p.board.words.map((_, i) => i).filter((i) => !p.guesses.includes(i));
    const ranked = open.sort((a, b) => link(p.board.words[b], p.clue.theme) - link(p.board.words[a], p.clue.theme));
    return [{ kind: 'guess', word: ranked[0] }, ...(p.guesses.length ? [{ kind: 'stop' } as CodeAction] : [])];
  },
};
