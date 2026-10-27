import { type MatrixGame, colBestResponses, isEquilibrium, payoffAt, rowBestResponses } from '../../game/payoff-matrix.ts';
import { type Rng, createRng } from '../../game/rng.ts';
import { type GameTree, type TreeNode, backwardInduction, equilibriumPath, walk } from '../../game/sequential.ts';
import type { DecisionPrompt, Input, ScenarioPlay, ScenarioResult, StatLine } from './types.ts';

/** Reusable game mechanics. Each returns a `ScenarioPlay` whose results are computed from the engine. */

export const fmt = (n: number, decimals = 2): string => {
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(decimals);
  return s.replace(/\.?0+$/, '');
};
export const pct = (p: number, decimals = 0): string => `${(p * 100).toFixed(decimals)}%`;
export const signed = (n: number): string => (n > 0 ? `+${fmt(n)}` : fmt(n));

function expectString(input: Input, allowed: readonly string[]): string {
  if (typeof input !== 'string' || !allowed.includes(input)) throw new Error(`Illegal choice: ${String(input)}`);
  return input;
}

function expectNumber(input: Input, min: number, max: number, step: number): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < min - 1e-9 || input > max + 1e-9) throw new Error(`Illegal number: ${String(input)}`);
  const k = Math.round((input - min) / step);
  if (Math.abs(min + k * step - input) > 1e-6) throw new Error(`Off-grid number: ${input}`);
  return input;
}

// ── One simultaneous move in a two-player matrix game ────────────────────────

export interface MatrixPlayOptions {
  game: MatrixGame;
  /** Which side the learner plays. */
  learner: 'row' | 'col';
  labels: { row: Record<string, string>; col: Record<string, string> };
  names: { you: string; them: string };
  prompt: string;
  /** The simulated player's action, possibly random (from the seeded RNG). */
  opponent: (rng: Rng) => string;
  /** One sentence stating the simulated player's rule, revealed with the result. */
  opponentRule: string;
  unit?: string;
  extraLines?: (you: string, them: string) => string[];
}

export function matrixPlay(o: MatrixPlayOptions): ScenarioPlay<{ seed: number; choice: string | null }> {
  const mine = o.learner === 'row' ? o.game.rows : o.game.cols;
  const myLabels = o.learner === 'row' ? o.labels.row : o.labels.col;
  const theirLabels = o.learner === 'row' ? o.labels.col : o.labels.row;
  const unit = o.unit ? ` ${o.unit}` : '';
  return {
    init: (seed) => ({ seed, choice: null }),
    prompt: (s) => (s.choice ? null : { kind: 'choice', prompt: o.prompt, options: mine.map((id) => ({ id, label: myLabels[id] })) }),
    apply: (s, input) => {
      if (s.choice) throw new Error('Already chosen');
      return { ...s, choice: expectString(input, mine) };
    },
    result: (s) => {
      const you = s.choice!;
      const them = o.opponent(createRng(s.seed));
      const row = o.learner === 'row' ? you : them;
      const col = o.learner === 'row' ? them : you;
      const [a, b] = payoffAt(o.game, row, col);
      const [mineP, theirsP] = o.learner === 'row' ? [a, b] : [b, a];
      const best = o.learner === 'row' ? rowBestResponses(o.game, them) : colBestResponses(o.game, them);
      const bestPay = o.learner === 'row' ? payoffAt(o.game, best[0], them)[0] : payoffAt(o.game, them, best[0])[1];
      const eq = isEquilibrium(o.game, row, col);
      const lines = [
        `${o.names.them} chose ${theirLabels[them]}. ${o.opponentRule}`,
        best.includes(you)
          ? `Against ${theirLabels[them]}, ${myLabels[you]} was a best reply (${fmt(mineP)}${unit}).`
          : `Against ${theirLabels[them]}, your best reply was ${best.map((x) => myLabels[x]).join(' or ')} (${fmt(bestPay)}${unit}, not ${fmt(mineP)}).`,
        eq ? 'Neither side could have done better by changing only its own choice: this cell is a Nash equilibrium.' : 'At least one side would gain by changing its own choice alone: this cell is not an equilibrium.',
        ...(o.extraLines?.(you, them) ?? []),
      ];
      return {
        headline: `You: ${myLabels[you]}. ${o.names.them}: ${theirLabels[them]}.`,
        stats: [
          { label: 'You', value: `${fmt(mineP)}${unit}`, tone: 'blue' },
          { label: o.names.them, value: `${fmt(theirsP)}${unit}`, tone: 'orange' },
        ],
        lines,
        cell: { row, col },
      };
    },
  };
}

// ── Single decisions with a computed outcome ─────────────────────────────────

export function choicePlay(
  prompt: Extract<DecisionPrompt, { kind: 'choice' }>,
  resolve: (choice: string, rng: Rng) => ScenarioResult,
): ScenarioPlay<{ seed: number; choice: string | null }> {
  const ids = prompt.options.map((o) => o.id);
  return {
    init: (seed) => ({ seed, choice: null }),
    prompt: (s) => (s.choice ? null : prompt),
    apply: (s, input) => {
      if (s.choice) throw new Error('Already chosen');
      return { ...s, choice: expectString(input, ids) };
    },
    result: (s) => resolve(s.choice!, createRng(s.seed)),
  };
}

export function numberPlay(
  prompt: Extract<DecisionPrompt, { kind: 'number' }>,
  resolve: (x: number, rng: Rng) => ScenarioResult,
): ScenarioPlay<{ seed: number; x: number | null }> {
  return {
    init: (seed) => ({ seed, x: null }),
    prompt: (s) => (s.x !== null ? null : prompt),
    apply: (s, input) => {
      if (s.x !== null) throw new Error('Already chosen');
      return { ...s, x: expectNumber(input, prompt.min, prompt.max, prompt.step) };
    },
    result: (s) => resolve(s.x!, createRng(s.seed)),
  };
}

export function allocationPlay(
  prompt: Extract<DecisionPrompt, { kind: 'allocation' }>,
  resolve: (alloc: Record<string, number>) => ScenarioResult,
): ScenarioPlay<{ alloc: number[] | null }> {
  return {
    init: () => ({ alloc: null }),
    prompt: (s) => (s.alloc ? null : prompt),
    apply: (s, input) => {
      if (s.alloc) throw new Error('Already chosen');
      if (!Array.isArray(input) || input.length !== prompt.parties.length) throw new Error('Allocation has the wrong shape');
      input.forEach((x) => expectNumber(x, 0, prompt.total, prompt.step));
      const sum = input.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - prompt.total) > 1e-6) throw new Error(`Allocation must add up to ${prompt.total}`);
      return { alloc: [...input] };
    },
    result: (s) => resolve(Object.fromEntries(prompt.parties.map((p, i) => [p.id, s.alloc![i]]))),
  };
}

// ── Sequential games on an explicit tree ─────────────────────────────────────

export interface TreePlayOptions {
  tree: GameTree;
  /** Index of the learner in `tree.players`. */
  you: number;
  /** Simulated players' choice at a node. Defaults to the backward-induction (subgame-perfect) choice. */
  policy?: (node: TreeNode & { kind: 'decision' }, path: readonly string[]) => string;
  prompt?: (node: TreeNode & { kind: 'decision' }) => string;
  unit?: string;
  /** One sentence stating the simulated player's rule, shown with the result. */
  opponentRule: string;
  extraLines?: (path: readonly string[]) => string[];
}

/** Advance through every simulated player's move until it's the learner's turn or the game ends. */
function autoAdvance(o: TreePlayOptions, path: string[]): string[] {
  const sol = backwardInduction(o.tree);
  let p = path;
  for (;;) {
    const node = walk(o.tree, p);
    if (node.kind === 'leaf' || node.player === o.you) return p;
    p = [...p, o.policy ? o.policy(node, p) : sol.choice[node.id]];
  }
}

export function actionLabel(tree: GameTree, path: readonly string[], i: number): string {
  const node = walk(tree, path.slice(0, i));
  if (node.kind === 'leaf') return path[i];
  return node.actions.find((a) => a.id === path[i])?.label ?? path[i];
}

export function treePlay(o: TreePlayOptions): ScenarioPlay<{ path: string[] }> {
  const unit = o.unit ? ` ${o.unit}` : '';
  return {
    init: () => ({ path: autoAdvance(o, []) }),
    prompt: (s) => {
      const node = walk(o.tree, s.path);
      if (node.kind === 'leaf') return null;
      return {
        kind: 'choice',
        prompt: o.prompt?.(node) ?? node.label ?? 'Your move',
        options: node.actions.map((a) => ({ id: a.id, label: a.label })),
      };
    },
    apply: (s, input) => {
      const node = walk(o.tree, s.path);
      if (node.kind === 'leaf' || node.player !== o.you) throw new Error('Not your move');
      const id = expectString(input, node.actions.map((a) => a.id));
      return { path: autoAdvance(o, [...s.path, id]) };
    },
    log: (s) =>
      s.path.map((_, i) => {
        const node = walk(o.tree, s.path.slice(0, i));
        const who = node.kind === 'decision' ? (node.player === o.you ? 'You' : o.tree.players[node.player]) : '';
        return `${who}: ${actionLabel(o.tree, s.path, i)}`;
      }),
    result: (s) => {
      const end = walk(o.tree, s.path);
      if (end.kind !== 'leaf') throw new Error('Game not over');
      const sol = backwardInduction(o.tree);
      const spePath = equilibriumPath(o.tree, sol);
      const speLeaf = walk(o.tree, spePath);
      const onPath = spePath.join('>') === s.path.join('>');
      const others = o.tree.players.map((name, i) => ({ name, i })).filter((p) => p.i !== o.you);
      const stats: StatLine[] = [
        { label: 'You', value: `${fmt(end.payoffs[o.you])}${unit}`, tone: 'blue' },
        ...others.map((p) => ({ label: p.name, value: `${fmt(end.payoffs[p.i])}${unit}`, tone: 'orange' as const })),
      ];
      const speText = spePath.map((_, i) => actionLabel(o.tree, spePath, i)).join(' → ');
      return {
        headline: s.path.map((_, i) => actionLabel(o.tree, s.path, i)).join(' → '),
        stats,
        lines: [
          o.opponentRule,
          onPath
            ? `You followed the backward-induction path (${speText}).`
            : `Backward induction predicts ${speText}, which pays you ${fmt(speLeaf.kind === 'leaf' ? speLeaf.payoffs[o.you] : 0)}${unit}.`,
          ...(o.extraLines?.(s.path) ?? []),
        ],
        path: s.path,
      };
    },
  };
}
