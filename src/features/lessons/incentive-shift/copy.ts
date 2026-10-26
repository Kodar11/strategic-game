import { emptyPrediction } from '../../../components/lesson/prediction-state.ts';
import type { Feedback } from '../../../components/lesson/verdict.ts';
import {
  BASE_CUT_ADVANTAGE,
  type IncentiveRules,
  type Regime,
  cutAdvantage,
  evaluatePolicy,
  regimeFor,
  sanitizeRules,
  withDetection,
} from '../../../game/incentives.ts';

/** Lesson 5 wording that depends on the learner's predictions and rules. Pure, so tests can pin it to the model. */

// Up to two decimals: half-detected penalties can land on quarters (e.g. 1.25).
const fmt = (n: number) => String(Number(n.toFixed(2)));

// ── The councillor's proposal ────────────────────────────────────────────────

/** A friendly-sounding rule that narrows the gap without closing it. */
export const PROPOSAL: IncentiveRules = { cutPenalty: 0, maintainReward: 1.5 };

export type ProposalPrediction = 'maintain' | 'cut' | 'split' | 'unclear';

export const PROPOSAL_PREDICTIONS: readonly { id: ProposalPrediction; label: string }[] = [
  { id: 'maintain', label: 'Both companies will keep their prices' },
  { id: 'cut', label: 'Both will still cut' },
  { id: 'split', label: 'One will keep prices, the other will cut' },
  { id: 'unclear', label: 'The table can’t tell us' },
];

export function proposalLabel(id: ProposalPrediction): string {
  return PROPOSAL_PREDICTIONS.find((p) => p.id === id)?.label ?? id;
}

/** What the model predicts under the proposal, as one of the prediction options. */
export function proposalOutcome(rules: IncentiveRules = PROPOSAL): ProposalPrediction {
  const o = evaluatePolicy(rules);
  if (!o.predicted) return 'unclear';
  if (o.predicted.row !== o.predicted.col) return 'split';
  return o.predicted.row;
}

/** Explanation of the proposal's effect, quoted from the engine. Shared with the narration manifest. */
export function proposalExplanation(rules: IncentiveRules = PROPOSAL): string {
  const o = evaluatePolicy(rules);
  const adv = cutAdvantage(rules);
  const each = o.companyPayoffs ? fmt(o.companyPayoffs[0]) : '—';
  return `The reward narrows cutting's edge from ${BASE_CUT_ADVANTAGE} to ${fmt(adv)} points, but doesn't close it. Cutting still pays more whatever the other company does, so both still cut and earn ${each} each. Since nobody maintains, the council pays out ${fmt(o.rewardsPaid)}. A rule can cost nothing and change nothing.`;
}

export function proposalFeedback(pick: ProposalPrediction): Feedback {
  const truth = proposalOutcome();
  if (pick === truth) return { verdict: 'match', text: 'You compared the reward with the gain from cutting, rather than with how generous it sounds.' };
  if (pick === 'maintain') return { verdict: 'misconception', text: 'A reward sounds persuasive, but it only works if it outweighs what cutting gains — here it falls short.' };
  if (pick === 'split') return { verdict: 'misconception', text: 'Both companies face the same table, so whatever is best for one is best for the other.' };
  return { verdict: 'defensible', text: 'The table can tell us here: there is no tie, so each company has a single best reply.' };
}

// ── Enforcement stress test ──────────────────────────────────────────────────

/** The stress-test question is asked at this detection rate. */
export const HALF_DETECTED = 0.5;

export type DetectionPrediction = 'yes' | 'no' | 'depends';

export const DETECTION_PREDICTIONS: readonly { id: DetectionPrediction; label: string }[] = [
  { id: 'yes', label: 'Yes — companies will still keep prices' },
  { id: 'no', label: 'No — the price war comes back' },
  { id: 'depends', label: 'Can’t tell — it could go either way' },
];

/** The regime once penalties are discounted by the detection rate (`detection` is a share, 0–1). */
export function detectionRegime(rules: IncentiveRules, detection = HALF_DETECTED): Regime {
  return regimeFor(withDetection(rules, detection));
}

export function detectionHolds(rules: IncentiveRules, detection = HALF_DETECTED): boolean {
  return detectionRegime(rules, detection) === 'maintain-dominant';
}

/** The answer the model gives: maintaining still dominant, cutting dominant again, or an exact tie. */
export function detectionOutcome(rules: IncentiveRules, detection = HALF_DETECTED): DetectionPrediction {
  const regime = detectionRegime(rules, detection);
  return regime === 'maintain-dominant' ? 'yes' : regime === 'cut-dominant' ? 'no' : 'depends';
}

const REGIME_CONCLUSION: Record<Regime, string> = {
  'maintain-dominant': 'Still below zero, so maintaining still wins.',
  'cut-dominant': 'Above zero, so cutting pays again.',
  tie: 'Exactly zero: cutting and maintaining now earn the same against either rival choice, so this model can’t say which way the companies go. Your rule no longer reliably keeps prices up.',
};

export function detectionFeedback(pick: DetectionPrediction, rules: IncentiveRules): Feedback {
  const regime = detectionRegime(rules);
  const truth = detectionOutcome(rules);
  const r = withDetection(rules, HALF_DETECTED);
  const why = `With half of cuts caught, your penalty of ${fmt(rules.cutPenalty)} works like ${fmt(r.cutPenalty)}. Cutting's edge becomes ${BASE_CUT_ADVANTAGE} − ${fmt(r.cutPenalty)} − ${fmt(r.maintainReward)} = ${fmt(cutAdvantage(r))}. ${REGIME_CONCLUSION[regime]}`;
  if (pick === truth) return { verdict: 'match', text: why };
  if (regime === 'tie') {
    return pick === 'no'
      ? { verdict: 'defensible', text: `Close: the rule stops working, but nothing pushes the companies to cut either. ${why}` }
      : { verdict: 'misconception', text: `Nothing in the payoffs favours maintaining any more. ${why}` };
  }
  if (pick === 'depends') {
    return {
      verdict: 'depends',
      text: `In general it depends on how much of your rule is penalty versus reward — rewards don't need anyone to be caught. For your rule the table does decide. ${why}`,
    };
  }
  return { verdict: 'misconception', text: why };
}

// ── Policy sandbox ───────────────────────────────────────────────────────────

/** Whether the rules currently make maintaining strictly dominant — the sandbox's goal. Always about the current rules. */
export function ruleWorks(rules: IncentiveRules): boolean {
  return regimeFor(rules) === 'maintain-dominant';
}

/** The stress test belongs to one set of rules, so it starts over whenever those rules change. */
export const ENFORCEMENT_RESET = {
  detectionPrediction: emptyPrediction<DetectionPrediction>(),
  detection: 100,
  detectionTouched: false,
};

/**
 * Apply a slider change or reset in the sandbox. If the rules actually change, the stress-test prediction and
 * results made for the old rules are cleared, so nothing stale carries forward.
 */
export function changeRules(
  current: { penalty: number; reward: number },
  patch: Partial<{ penalty: number; reward: number }>,
): { penalty: number; reward: number } & Partial<typeof ENFORCEMENT_RESET> {
  const next = sanitizeRules({ cutPenalty: patch.penalty ?? current.penalty, maintainReward: patch.reward ?? current.reward });
  const rules = { penalty: next.cutPenalty, reward: next.maintainReward };
  const changed = rules.penalty !== current.penalty || rules.reward !== current.reward;
  return changed ? { ...rules, ...ENFORCEMENT_RESET } : rules;
}

/** Which lever a working rule relies on. */
export function leverMix(rules: IncentiveRules): 'penalty' | 'reward' | 'both' {
  if (rules.maintainReward === 0) return 'penalty';
  if (rules.cutPenalty === 0) return 'reward';
  return 'both';
}

// ── Completion ───────────────────────────────────────────────────────────────

/**
 * Built from the current, locked state only: rule lines appear only while the rules actually work, and the
 * stress-test line only for a prediction locked against those same rules.
 */
export function incentiveRecap(d: {
  proposalPick: ProposalPrediction | null;
  rules: IncentiveRules;
  detectionPick: DetectionPrediction | null;
}): string[] {
  const lines: string[] = [];
  if (d.proposalPick) {
    lines.push(
      d.proposalPick === proposalOutcome()
        ? 'You predicted that a 1.5 reward would not end the price war — and it didn’t.'
        : `You expected the 1.5 reward to mean “${proposalLabel(d.proposalPick).toLowerCase()}”; both companies still cut.`,
    );
  }
  if (!ruleWorks(d.rules)) return lines;
  const p = fmt(d.rules.cutPenalty);
  const r = fmt(d.rules.maintainReward);
  lines.push(`Your final rules: penalty ${p}, reward ${r}.`);
  const mix = leverMix(d.rules);
  lines.push(
    mix === 'reward'
      ? 'Your rule relies on a reward, so the council keeps paying while it works — but it doesn’t depend on catching anyone.'
      : mix === 'penalty'
        ? 'Your rule relies on a penalty: free while it works, but only if cuts are actually caught.'
        : 'Your rule mixes both levers: the reward costs the council every week, and the penalty only bites if cuts are caught.',
  );
  if (d.detectionPick) {
    lines.push(
      detectionFeedback(d.detectionPick, d.rules).verdict === 'match'
        ? 'You predicted correctly how your rule would hold up with imperfect enforcement.'
        : 'Imperfect enforcement affected your rule differently from what you predicted.',
    );
  }
  return lines;
}
