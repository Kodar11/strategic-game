import { EPSILON } from './rng.ts';

/**
 * Finite games of perfect information as explicit trees. A decision node names the player who moves and the
 * actions available; a leaf holds one payoff per player (in the order of `players`). Chance is not modelled
 * here: games with hidden draws use their own modules.
 */
export interface TreeLeaf {
  kind: 'leaf';
  id: string;
  payoffs: readonly number[];
  label?: string;
}

export interface TreeDecision {
  kind: 'decision';
  id: string;
  /** Index into the game's players. */
  player: number;
  label?: string;
  actions: readonly { id: string; label: string; child: TreeNode }[];
}

export type TreeNode = TreeLeaf | TreeDecision;

export interface GameTree {
  players: readonly string[];
  root: TreeNode;
}

export function leaf(id: string, payoffs: readonly number[], label?: string): TreeLeaf {
  return { kind: 'leaf', id, payoffs, label };
}

export function decision(id: string, player: number, actions: TreeDecision['actions'], label?: string): TreeDecision {
  return { kind: 'decision', id, player, actions, label };
}

export function findNode(root: TreeNode, id: string): TreeNode | undefined {
  if (root.id === id) return root;
  if (root.kind === 'leaf') return undefined;
  for (const a of root.actions) {
    const f = findNode(a.child, id);
    if (f) return f;
  }
  return undefined;
}

export interface Solution {
  /** The action chosen at every decision node (subgame-perfect: on and off the equilibrium path). */
  choice: Record<string, string>;
  /** Payoffs reached from every node when everyone follows `choice`. */
  value: Record<string, readonly number[]>;
}

/**
 * Backward induction. At each decision node the mover picks the action whose continuation pays them most.
 * Ties are broken by `tieBreak` (default: the first listed action), which every scenario states in its rules.
 * With a unique choice everywhere, the result is the unique subgame-perfect equilibrium.
 */
export function backwardInduction(tree: GameTree, tieBreak?: (node: TreeDecision, tied: string[]) => string): Solution {
  const choice: Record<string, string> = {};
  const value: Record<string, readonly number[]> = {};
  const solve = (node: TreeNode): readonly number[] => {
    if (node.kind === 'leaf') {
      value[node.id] = node.payoffs;
      return node.payoffs;
    }
    const results = node.actions.map((a) => ({ id: a.id, v: solve(a.child) }));
    const best = Math.max(...results.map((r) => r.v[node.player]));
    const tied = results.filter((r) => r.v[node.player] >= best - EPSILON).map((r) => r.id);
    const pick = tied.length > 1 && tieBreak ? tieBreak(node, tied) : tied[0];
    choice[node.id] = pick;
    const v = results.find((r) => r.id === pick)!.v;
    value[node.id] = v;
    return v;
  };
  solve(tree.root);
  return { choice, value };
}

/** Nodes where the mover is indifferent between two or more actions (worth stating a tie rule for). */
export function tiedNodes(tree: GameTree): string[] {
  const out: string[] = [];
  const sol = backwardInduction(tree);
  const visit = (node: TreeNode) => {
    if (node.kind === 'leaf') return;
    const vals = node.actions.map((a) => sol.value[a.child.id][node.player]);
    const best = Math.max(...vals);
    if (vals.filter((v) => v >= best - EPSILON).length > 1) out.push(node.id);
    node.actions.forEach((a) => visit(a.child));
  };
  visit(tree.root);
  return out;
}

/** The equilibrium path: action ids from the root to a leaf under a solution. */
export function equilibriumPath(tree: GameTree, sol: Solution = backwardInduction(tree)): string[] {
  const path: string[] = [];
  let node = tree.root;
  while (node.kind === 'decision') {
    const a = node.actions.find((x) => x.id === sol.choice[node.id])!;
    path.push(a.id);
    node = a.child;
  }
  return path;
}

/** Follow a list of action ids from the root. Throws on an illegal action. */
export function walk(tree: GameTree, actions: readonly string[]): TreeNode {
  let node = tree.root;
  for (const id of actions) {
    if (node.kind === 'leaf') throw new Error(`Game already over before action ${id}`);
    const a = node.actions.find((x) => x.id === id);
    if (!a) throw new Error(`Illegal action ${id} at ${node.id}`);
    node = a.child;
  }
  return node;
}

/** Every leaf, with the path that reaches it. */
export function leaves(tree: GameTree): { path: string[]; leaf: TreeLeaf }[] {
  const out: { path: string[]; leaf: TreeLeaf }[] = [];
  const visit = (node: TreeNode, path: string[]) => {
    if (node.kind === 'leaf') out.push({ path, leaf: node });
    else node.actions.forEach((a) => visit(a.child, [...path, a.id]));
  };
  visit(tree.root, []);
  return out;
}
