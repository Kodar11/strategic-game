/**
 * How a match that was never zero-sum reads at the end. The engines, scores and recorded outcomes are untouched: who
 * scored more is reported as exactly that, next to what the two sides made together. Pure, and computed from the rounds.
 */
export interface SharedOutcomeInput {
  kind: 'split' | 'cooperate' | 'hunt';
  you: number;
  them: number;
  rounds: number;
  /** Rounds where both sides chose the shared option. */
  joint: number;
  /** What each side earns in such a round. */
  jointEach: number;
  /** The other side's name, as a sentence would use it ("the bot", "The Chameleon"). */
  themName: string;
}

export interface SharedOutcome {
  headline: string;
  /** Who scored what. */
  individual: string;
  /** What the two sides made together. */
  shared: string;
  /** The trade-off for you, from these numbers. */
  tradeoff: string;
  /** Every round was a joint one. */
  full: boolean;
}

const JOINT: Record<SharedOutcomeInput['kind'], string> = { split: 'splitting', cooperate: 'cooperating', hunt: 'hunting stag together' };

export function sharedOutcome({ kind, you, them, rounds, joint, jointEach, themName }: SharedOutcomeInput): SharedOutcome {
  const full = rounds > 0 && joint === rounds;
  const best = jointEach * rounds;
  const lead = you > them ? 'You out-scored' : you < them ? 'You were out-scored by' : 'Level with';
  const headline =
    kind === 'hunt'
      ? full
        ? `All ${rounds} stags caught together`
        : joint === 0
          ? 'No stag caught together'
          : `${joint} of ${rounds} stags caught together`
      : full
        ? 'A full partnership'
        : `${lead} ${themName}`;
  const verb = JOINT[kind];
  const tradeoff = full
    ? `That is the most you could both earn: ${best} each.`
    : you > best
      ? `You earned ${you - best} more than ${verb} every round would have paid you (${best}), and the other side paid for it.`
      : you === best
        ? `You earned what ${verb} every round would have paid you (${best}), and the pair of you left ${best * 2 - you - them} on the table.`
        : `${verb[0].toUpperCase()}${verb.slice(1)} every round would have paid you ${best}: ${best - you} more than you earned.`;
  return {
    headline,
    individual: `You ${you} · ${themName} ${them}`,
    shared: `Together ${you + them} of the ${best * 2} that ${verb} every round would have made.`,
    tradeoff,
    full,
  };
}
