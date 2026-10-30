import { type CommonsState, MAX_TAKE, SUSTAINABLE_SHARE } from '../arena/commons.ts';
import type { CoopAction, CoopState } from '../arena/cooperation.ts';
import type { ArenaGameId } from '../arena/core.ts';
import { type InspectAction, type InspectorMove, type InspectorState, type OperatorMove, playerOperates } from '../arena/inspector.ts';
import { CLAIM_MAX, CLAIM_MIN, type TravelerState } from '../arena/travelers.ts';
import type { RepeatGame, RepeatStrategy } from './plan.ts';

/**
 * Repeat strategies for the Strategy Arena games that have one simultaneous, structurally identical decision each
 * round. Each strategy reads the engine's state as the player sees it at that decision (only completed, revealed
 * rounds) and returns an action the engine's `validate` accepts. Opponents, payoffs and endings stay with the engines.
 *
 * Every other arena game is manual only — bids on fresh private estimates, negotiations, hidden roles, multi-step turns
 * and board positions all depend on information that changes every round. See docs/REPEAT_PLAY.md.
 */

export const cooperationRepeat: RepeatGame<CoopState, CoopAction> = {
  strategies: [
    { id: 'always-c', kind: 'fixed', label: () => 'Always Cooperate', detail: () => 'Cooperate every round.', next: (s) => ({ move: 'C', round: s.rounds.length }) },
    { id: 'always-d', kind: 'fixed', label: () => 'Always Defect', detail: () => 'Defect every round.', next: (s) => ({ move: 'D', round: s.rounds.length }) },
    {
      id: 'tit-for-tat',
      kind: 'conditional',
      label: () => 'Tit for Tat',
      // On the noisy line a slip is revealed to both sides; this answers what was actually delivered, like the reveal shows.
      detail: () => 'Cooperate first, then play whatever your opponent played last round.',
      next: (s) => ({ move: s.rounds.length ? s.rounds[s.rounds.length - 1].b : 'C', round: s.rounds.length }),
    },
  ],
};

const travelers: RepeatGame<TravelerState, number> = {
  strategies: [
    {
      id: 'same-claim',
      kind: 'fixed',
      amount: { label: 'Your claim', min: CLAIM_MIN, max: CLAIM_MAX, initial: CLAIM_MAX },
      label: (n) => `Always claim ${n}`,
      detail: (n) => `Claim ${n} every round.`,
      next: (_s, _step, n) => n,
    },
    {
      id: 'match',
      kind: 'conditional',
      amount: { label: 'Opening claim', min: CLAIM_MIN, max: CLAIM_MAX, initial: CLAIM_MAX },
      label: () => 'Match its last claim',
      detail: (n) => `Claim ${n} first, then claim whatever your opponent claimed last round.`,
      next: (s, _step, n) => (s.rounds.length ? s.rounds[s.rounds.length - 1].claims[1] : n),
    },
    {
      id: 'undercut',
      kind: 'conditional',
      amount: { label: 'Opening claim', min: CLAIM_MIN, max: CLAIM_MAX, initial: CLAIM_MAX },
      label: () => 'Undercut its last claim',
      detail: (n) => `Claim ${n} first, then one below your opponent’s last claim (never under ${CLAIM_MIN}).`,
      next: (s, _step, n) => (s.rounds.length ? Math.max(CLAIM_MIN, s.rounds[s.rounds.length - 1].claims[1] - 1) : n),
    },
  ],
};

const commons: RepeatGame<CommonsState, number> = {
  strategies: [
    {
      id: 'same-take',
      kind: 'fixed',
      amount: { label: 'Fish to request', min: 0, max: MAX_TAKE, initial: SUSTAINABLE_SHARE },
      label: (n) => `Always request ${n}`,
      detail: (n) => `Ask for ${n} fish every round, however the lake changes.`,
      next: (_s, _step, n) => n,
    },
    {
      id: 'match-ash',
      kind: 'conditional',
      amount: { label: 'Opening request', min: 0, max: MAX_TAKE, initial: SUSTAINABLE_SHARE },
      label: () => 'Match Ash',
      detail: (n) => `Ask for ${n} first, then ask for what Ash, the boat beside you, asked for last round.`,
      // Seat 1 is Ash, the boat the read is about (src/arena/commons.ts).
      next: (s, _step, n) => (s.rounds.length ?s.rounds[s.rounds.length - 1].requests[1] : n),
    },
  ],
};

const OP_LABEL: Record<OperatorMove, string> = { comply: 'Comply', cut: 'Cut corners' };
const INS_LABEL: Record<InspectorMove, string> = { inspect: 'Inspect', trust: 'Trust' };

/** The roles alternate, so a repeated plan names one choice for each role and plays the one this round's role needs. */
const inspectorPair = (op: OperatorMove, ins: InspectorMove): RepeatStrategy<InspectorState, InspectAction> => ({
  id: `${op}-${ins}`,
  kind: 'fixed',
  label: () => `${OP_LABEL[op]} · ${INS_LABEL[ins]}`,
  detail: () => `As operator: ${OP_LABEL[op].toLowerCase()}. As inspector: ${INS_LABEL[ins].toLowerCase()}.`,
  next: (s) => (playerOperates(s.rounds.length) ? op : ins),
});

const inspector: RepeatGame<InspectorState, InspectAction> = {
  strategies: [inspectorPair('comply', 'inspect'), inspectorPair('comply', 'trust'), inspectorPair('cut', 'inspect'), inspectorPair('cut', 'trust')],
};

/** Arena games that offer repeat play. A game missing here plays exactly as before. */
export const ARENA_REPEAT: Partial<Record<ArenaGameId, RepeatGame<unknown, unknown>>> = {
  cooperation: cooperationRepeat,
  travelers,
  commons,
  inspector,
};
