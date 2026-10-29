/**
 * The first-session dilemma: one simultaneous, one-shot choice between the learner and Maya. Pure data and pure
 * functions, shared by the welcome screen and the tests, so every number and sentence on screen comes from these
 * rules. Nothing here reads or writes saved progress, and no existing game engine is involved.
 *
 * Rules (shown to the learner before they choose):
 * - You and Maya each secretly choose Share or Take. Neither sees the other's choice until both are locked in.
 * - Both share: 3 coins each. Both take: 1 coin each. One takes while the other shares: the taker gets 5, the sharer 0.
 *
 * Maya's rule: she plays only for her own coins, in this one meeting. She takes whichever move pays her more against
 * every move you could make (a dominant move). That is decided from the payoffs alone — `mayaDecides` has no access to
 * your choice — and it is sealed when the round starts. There is no randomness.
 */

export type Move = 'share' | 'take';
export const MOVES: readonly Move[] = ['share', 'take'];

export interface Payoff {
  you: number;
  maya: number;
}

/** PAYOFFS[yourMove][mayasMove]. */
export const PAYOFFS: Readonly<Record<Move, Readonly<Record<Move, Payoff>>>> = {
  share: { share: { you: 3, maya: 3 }, take: { you: 0, maya: 5 } },
  take: { share: { you: 5, maya: 0 }, take: { you: 1, maya: 1 } },
};

export const MOVE_LABEL: Record<Move, string> = { share: 'Share', take: 'Take' };

export function payoff(you: Move, maya: Move): Payoff {
  return PAYOFFS[you][maya];
}

/** Maya's best reply if she knew your move. Used to explain her reasoning, never to make her decision. */
export function mayaBestReply(yours: Move): Move {
  return payoff(yours, 'take').maya > payoff(yours, 'share').maya ? 'take' : 'share';
}

/** The move that pays Maya strictly more whatever you do, if there is one. */
export function mayaDominantMove(): Move | null {
  const replies = new Set(MOVES.map(mayaBestReply));
  if (replies.size !== 1) return null;
  const [move] = replies;
  return MOVES.every((yours) => payoff(yours, move).maya > payoff(yours, other(move)).maya) ? move : null;
}

/**
 * Maya's decision. Takes no arguments on purpose: it depends only on the published payoffs, so it cannot react to
 * the learner's choice. With these payoffs she takes; if the payoffs had no dominant move she would share.
 */
export function mayaDecides(): Move {
  return mayaDominantMove() ?? 'share';
}

export function other(move: Move): Move {
  return move === 'share' ? 'take' : 'share';
}

// ── One round ────────────────────────────────────────────────────────────────

/**
 * A round as a small state machine. Maya's move is committed when the round starts; while choosing, only
 * `visibleMayaMove` should be used to show it, and it reveals nothing.
 */
export type Round =
  | { phase: 'choosing'; sealed: Move; pick: Move | null }
  | { phase: 'revealed'; you: Move; maya: Move; result: Payoff };

export function startRound(): Round {
  return { phase: 'choosing', sealed: mayaDecides(), pick: null };
}

/** Select (or change) the learner's move. Ignored once revealed. */
export function pick(round: Round, move: Move): Round {
  return round.phase === 'choosing' ? { ...round, pick: move } : round;
}

/** Lock in the selected move and reveal both. Nothing changes if no move is selected or the round is over. */
export function lockIn(round: Round): Round {
  if (round.phase !== 'choosing' || round.pick === null) return round;
  return { phase: 'revealed', you: round.pick, maya: round.sealed, result: payoff(round.pick, round.sealed) };
}

/** What the screen may show of Maya's move: nothing until the reveal. */
export function visibleMayaMove(round: Round): Move | null {
  return round.phase === 'revealed' ? round.maya : null;
}

// ── Words ────────────────────────────────────────────────────────────────────

const coins = (n: number) => `${n} coin${n === 1 ? '' : 's'}`;

/** The rules as shown before choosing, one line per outcome, in a fixed order. */
export function outcomeRows(): { you: Move; maya: Move; label: string; result: Payoff }[] {
  const rows: [Move, Move, string][] = [
    ['share', 'share', 'You both share'],
    ['share', 'take', 'You share, Maya takes'],
    ['take', 'share', 'You take, Maya shares'],
    ['take', 'take', 'You both take'],
  ];
  return rows.map(([you, maya, label]) => ({ you, maya, label, result: payoff(you, maya) }));
}

/** "What happened?" and "What does it reveal?" for the outcome actually played. */
export function explainOutcome(you: Move, maya: Move): { happened: string; reveals: string } {
  const r = payoff(you, maya);
  if (you === 'share' && maya === 'take') {
    return {
      happened: `You chose to share, but Maya chose to take. She gets ${coins(r.maya)}; you get ${coins(r.you)}.`,
      reveals: 'When choices are made independently, the outcome depends on both players’ incentives — not just your intentions.',
    };
  }
  if (you === 'take' && maya === 'take') {
    const both = payoff('share', 'share');
    return {
      happened: `You both chose to take, so you get ${coins(r.you)} each.`,
      reveals: `Each of you made the move that paid best on its own — and together you ended up with less than the ${coins(both.you)} each you’d have had by both sharing.`,
    };
  }
  if (you === 'take' && maya === 'share') {
    return {
      happened: `You chose to take while Maya shared. You get ${coins(r.you)}; she gets ${coins(r.maya)}.`,
      reveals: 'Taking paid you more here, but only because Maya trusted you. Her result depended on your incentives.',
    };
  }
  return {
    happened: `You both chose to share, so you get ${coins(r.you)} each.`,
    reveals: 'Sharing worked because both of you did it. Either of you could have taken more by switching.',
  };
}

/** Why Maya took, computed from the payoffs: her best reply to each of your moves. */
export function mayaReasoning(): string[] {
  return MOVES.map((yours) => {
    const best = mayaBestReply(yours);
    const a = payoff(yours, best).maya;
    const b = payoff(yours, other(best)).maya;
    return `If you ${yours}, ${best === 'take' ? 'taking' : 'sharing'} gets her ${coins(a)} instead of ${coins(b)}.`;
  });
}

/** One sentence summing up Maya's reasoning. */
export function mayaSummary(): string {
  const d = mayaDominantMove();
  if (!d) return 'Neither move pays Maya more in every case, so her best move depends on what she expects from you.';
  return `${d === 'take' ? 'Taking' : 'Sharing'} pays her more whatever you do — so she never needed to guess your choice.`;
}

/**
 * Hypotheticals, clearly not what happened: the same rules with a different pair of moves. Always includes
 * "both share" (the outcome the trap is about) unless it was the actual outcome, then what your other move would
 * have changed against Maya's actual move.
 */
export function alternatives(you: Move, maya: Move): { you: Move; maya: Move; title: string; text: string }[] {
  const out: { you: Move; maya: Move; title: string; text: string }[] = [];
  if (!(you === 'share' && maya === 'share')) {
    const r = payoff('share', 'share');
    const actual = payoff(you, maya);
    out.push({
      you: 'share',
      maya: 'share',
      title: 'What if you had both shared?',
      text: `${coins(r.you)} each — ${r.you + r.maya} in total, against the ${actual.you + actual.maya} you two actually got. Better for both, but each of you could still gain by switching to take.`,
    });
  }
  const switched = other(you);
  const s = payoff(switched, maya);
  const actual = payoff(you, maya);
  out.push({
    you: switched,
    maya,
    title: `What if you had chosen to ${switched}?`,
    text: `Against Maya’s ${maya}, you’d get ${coins(s.you)} instead of ${coins(actual.you)}, and Maya ${coins(s.maya)}.`,
  });
  return out;
}
