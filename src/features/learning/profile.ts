import { LESSONS, type LessonId } from '../../content/lessons.ts';
import { GOALS, type GoalId, type LearningAttempt, PREDICTIONS, type PredictionKey, SKILLS, type SkillArea } from './records.ts';

/**
 * The Strategic Thinking Profile, derived only from the learning record and lesson progress. Deterministic and
 * deliberately conservative:
 * - Only the latest attempt at each prediction counts, so replays update a result rather than pile up.
 * - Skill and confidence observations use only *calculable* predictions — ones whose answer followed from what was
 *   on screen. Predictions about hidden rules are never treated as evidence of good or poor reasoning.
 * - Every observation needs a minimum number of predictions; otherwise the page says so instead of guessing.
 * - There is no overall score.
 */

/** Predictions needed in an area before saying anything about it. */
export const MIN_AREA_EVIDENCE = 2;
/** Predictions needed in a confidence group before comparing it with results. */
export const MIN_CONFIDENCE_GROUP = 3;
/** Calculable predictions needed before the confidence section appears at all. */
export const MIN_CONFIDENCE_TOTAL = 4;

export interface ProfileInput {
  attempts: readonly LearningAttempt[];
  completed: readonly LessonId[];
  inProgress: readonly LessonId[];
  goal: GoalId | null;
}

export interface SkillSummary {
  id: SkillArea;
  label: string;
  description: string;
  lesson: LessonId;
  status: 'not-started' | 'exploring' | 'observed';
  /** Calculable predictions in this area (latest attempt each). */
  judged: number;
  matched: number;
  /** One plain-language line about this area. */
  text: string;
}

export interface Insight {
  id: 'gap' | 'overconfident' | 'practice' | 'uncertain-misses' | 'underconfident' | 'strength';
  /** The area the insight is about (drives goal priority), if any. */
  skill: SkillArea | null;
  /** Every area the insight talks about, so a secondary insight never repeats one. */
  mentions: SkillArea[];
  title: string;
  body: string;
  /** Why the app is saying this — the evidence behind it. */
  evidence: string;
  lesson: LessonId | null;
}

export interface ConfidenceGroup {
  label: string;
  count: number;
  matched: number;
  text: string;
}

export interface ConfidenceSummary {
  /** Calculable predictions with a confidence rating (all supported predictions have one). */
  judged: number;
  ready: boolean;
  groups: ConfidenceGroup[];
  message: string;
}

export interface NextStep {
  lesson: LessonId;
  title: string;
  body: string;
  reason: 'goal' | 'gap' | 'next-lesson' | 'replay';
  cta: string;
}

export interface Profile {
  progress: { completed: number; total: number; inProgress: number; predictions: number };
  skills: SkillSummary[];
  primary: Insight | null;
  secondary: Insight | null;
  confidence: ConfidenceSummary;
  next: NextStep;
  goal: GoalId | null;
}

const lessonTitle = (id: LessonId) => LESSONS.find((l) => l.id === id)!.title;
/** How each area reads inside a sentence. */
const TOPIC: Record<SkillArea, string> = {
  anticipating: 'anticipating others',
  incentives: 'incentives',
  coordination: 'coordination',
  uncertainty: 'uncertain outcomes',
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The most recent attempt at each prediction. */
export function latestAttempts(attempts: readonly LearningAttempt[]): LearningAttempt[] {
  const latest = new Map<PredictionKey, LearningAttempt>();
  for (const a of attempts) {
    const prev = latest.get(a.prediction);
    if (!prev || a.lockedAt >= prev.lockedAt) latest.set(a.prediction, a);
  }
  return [...latest.values()].sort((a, b) => a.lockedAt - b.lockedAt);
}

const judgedOf = (attempts: readonly LearningAttempt[]) => attempts.filter((a) => a.basis === 'calculable');
const matchedOf = (attempts: readonly LearningAttempt[]) => attempts.filter((a) => a.evaluation === 'correct').length;
const isWeak = (s: SkillSummary) => s.judged >= MIN_AREA_EVIDENCE && s.matched * 2 <= s.judged;
const isStrong = (s: SkillSummary, min = MIN_AREA_EVIDENCE) => s.judged >= min && s.matched * 4 >= s.judged * 3;

export function summariseSkills(latest: readonly LearningAttempt[]): SkillSummary[] {
  return SKILLS.map((s) => {
    const inArea = latest.filter((a) => a.skill === s.id);
    const judged = judgedOf(inArea);
    const matched = matchedOf(judged);
    const status: SkillSummary['status'] = inArea.length === 0 ? 'not-started' : judged.length < MIN_AREA_EVIDENCE ? 'exploring' : 'observed';
    const text =
      status === 'not-started'
        ? 'Not tried yet.'
        : status === 'exploring'
          ? `Still exploring — ${plural(inArea.length, 'prediction')} so far.`
          : `Matched the model in ${matched} of ${judged.length} predictions you could work out from the screen.`;
    return { ...s, status, judged: judged.length, matched, text };
  });
}

export function summariseConfidence(latest: readonly LearningAttempt[]): ConfidenceSummary {
  const judged = judgedOf(latest);
  if (judged.length < MIN_CONFIDENCE_TOTAL) {
    const more = MIN_CONFIDENCE_TOTAL - judged.length;
    return {
      judged: judged.length,
      ready: false,
      groups: [],
      message: `Make ${plural(more, 'more prediction')} you can work out from the information given, and this section will compare your confidence with how they turned out.`,
    };
  }
  const group = (label: string, describe: string, list: LearningAttempt[]): ConfidenceGroup => {
    const matched = matchedOf(list);
    return { label, count: list.length, matched, text: `Your ${describe} predictions matched the model ${matched} of ${list.length} times.` };
  };
  const groups = [
    group('Very or extremely confident (4–5)', 'confident', judged.filter((a) => a.confidence >= 4)),
    group('Guessing or slightly confident (1–2)', 'least confident', judged.filter((a) => a.confidence <= 2)),
  ].filter((g) => g.count >= MIN_CONFIDENCE_GROUP);
  return {
    judged: judged.length,
    ready: true,
    groups,
    message: groups.length
      ? 'A reflection aid, not a test: a handful of predictions can only hint at a pattern.'
      : 'Your confidence ratings are spread out, so there is no group large enough to compare yet. Keep rating your predictions.',
  };
}

function candidateInsights(latest: readonly LearningAttempt[], skills: readonly SkillSummary[]): Insight[] {
  const out: Insight[] = [];
  const judged = judgedOf(latest);
  const strong = skills.filter((s) => isStrong(s));
  const weak = skills.filter(isWeak);

  for (const b of weak) {
    const a = strong.find((s) => s.id !== b.id);
    if (!a) continue;
    out.push({
      id: 'gap',
      skill: b.id,
      mentions: [a.id, b.id],
      title: `Strong on ${TOPIC[a.id]}; ${TOPIC[b.id]} ${b.id === 'uncertainty' ? 'are' : 'is'} worth practising`,
      body: `Your predictions about ${TOPIC[a.id]} mostly matched the model, while ${TOPIC[b.id]} ${b.id === 'uncertainty' ? 'are' : 'is'} still settling. A second pass at ${lessonTitle(b.lesson)} is a good way to compare the two.`,
      evidence: `${a.label}: ${a.matched} of ${a.judged}. ${b.label}: ${b.matched} of ${b.judged}.`,
      lesson: b.lesson,
    });
  }

  const confident = judged.filter((x) => x.confidence >= 4);
  if (confident.length >= MIN_CONFIDENCE_GROUP && matchedOf(confident) * 2 <= confident.length) {
    const missedIn = confident.find((x) => x.evaluation !== 'correct');
    out.push({
      id: 'overconfident',
      skill: null,
      mentions: [],
      title: 'Your most confident calls were often off',
      body: 'Before locking in a confident answer, pause and ask what information you might be missing — or what the other side sees that you don’t.',
      evidence: `${matchedOf(confident)} of ${confident.length} predictions you rated very or extremely confident matched the model.`,
      lesson: missedIn ? missedIn.lesson : null,
    });
  }

  for (const b of weak) {
    if (out.some((i) => i.id === 'gap' && i.skill === b.id)) continue;
    out.push({
      id: 'practice',
      skill: b.id,
      mentions: [b.id],
      title: `${b.label} is worth another look`,
      body: `${b.description} Replaying ${lessonTitle(b.lesson)} lets you test your reasoning against the same model again.`,
      evidence: `${b.matched} of ${b.judged} predictions in this area matched the model.`,
      lesson: b.lesson,
    });
  }

  const reasonable = latest.filter((x) => x.evaluation === 'reasonable-miss');
  if (reasonable.length >= MIN_AREA_EVIDENCE) {
    out.push({
      id: 'uncertain-misses',
      skill: 'uncertainty',
      mentions: [],
      title: 'Reasonable calls, uncertain outcomes',
      body: 'Some of your predictions missed only because the outcome depended on something you couldn’t know yet. That isn’t poor reasoning — it’s worth noticing what information would have changed your call.',
      evidence: `${reasonable.length} predictions were reasonable but didn’t match an outcome you had no way to see coming.`,
      lesson: reasonable[reasonable.length - 1].lesson,
    });
  }

  const unsure = judged.filter((x) => x.confidence <= 2);
  if (unsure.length >= MIN_CONFIDENCE_GROUP && matchedOf(unsure) * 4 >= unsure.length * 3) {
    out.push({
      id: 'underconfident',
      skill: null,
      mentions: [],
      title: 'You may know more than you think',
      body: 'Predictions you marked as guesses often matched the model. Your reasoning may be ahead of your confidence.',
      evidence: `${matchedOf(unsure)} of ${unsure.length} predictions you rated as guessing or slightly confident matched the model.`,
      lesson: null,
    });
  }

  for (const a of skills.filter((s) => isStrong(s, MIN_AREA_EVIDENCE + 1))) {
    out.push({
      id: 'strength',
      skill: a.id,
      mentions: [a.id],
      title: `A strength: ${TOPIC[a.id]}`,
      body: `${a.description} Your predictions here have consistently matched the model.`,
      evidence: `${a.matched} of ${a.judged} predictions in this area matched the model.`,
      lesson: a.lesson,
    });
  }
  return out;
}

/** Insights about the learner's chosen goal come first; otherwise the fixed priority order above holds. */
export function pickInsights(candidates: readonly Insight[], goal: GoalId | null): { primary: Insight | null; secondary: Insight | null } {
  const ordered = goal && goal !== 'none' ? [...candidates.filter((c) => c.skill === goal), ...candidates.filter((c) => c.skill !== goal)] : [...candidates];
  const primary = ordered[0] ?? null;
  // A secondary insight must add something: a different kind of observation about areas the primary didn't mention.
  const secondary = primary
    ? (ordered.find((c) => c.id !== primary.id && (c.skill === null || c.skill !== primary.skill) && !c.mentions.some((m) => primary.mentions.includes(m))) ?? null)
    : null;
  return { primary, secondary };
}

export function nextStep(input: ProfileInput, skills: readonly SkillSummary[]): NextStep {
  const done = (id: LessonId) => input.completed.includes(id);
  const step = (lesson: LessonId, reason: NextStep['reason'], body: string): NextStep => {
    const title = lessonTitle(lesson);
    const verb = input.inProgress.includes(lesson) ? 'Continue' : done(lesson) ? 'Replay' : 'Try';
    return { lesson, reason, body, title: `${verb} ${title}`, cta: `${verb} lesson` };
  };

  if (input.goal && input.goal !== 'none') {
    const skill = SKILLS.find((s) => s.id === input.goal)!;
    const goalLabel = GOALS.find((g) => g.id === input.goal)!.label.toLowerCase();
    return step(
      skill.lesson,
      'goal',
      done(skill.lesson)
        ? `You want to get better at ${goalLabel}. Play it again and see whether your predictions — and your confidence — line up with the model.`
        : `You want to get better at ${goalLabel}. This lesson is built around exactly that.`,
    );
  }
  const weakest = skills.filter(isWeak).sort((a, b) => a.matched / a.judged - b.matched / b.judged)[0];
  if (weakest) {
    return step(weakest.lesson, 'gap', `Practise ${TOPIC[weakest.id]}: ${weakest.description.toLowerCase()}`);
  }
  const resume = LESSONS.find((l) => input.inProgress.includes(l.id)) ?? LESSONS.find((l) => !done(l.id));
  if (resume) {
    return step(resume.id, 'next-lesson', resume.description);
  }
  const leastSeen = [...skills].sort((a, b) => a.judged - b.judged)[0];
  return step(leastSeen.lesson, 'replay', 'Try another round of predictions and see whether your confidence matches the result.');
}

export function buildProfile(input: ProfileInput): Profile {
  const latest = latestAttempts(input.attempts);
  const skills = summariseSkills(latest);
  const { primary, secondary } = pickInsights(candidateInsights(latest, skills), input.goal);
  return {
    progress: { completed: input.completed.length, total: LESSONS.length, inProgress: input.inProgress.length, predictions: input.attempts.length },
    skills,
    primary,
    secondary,
    confidence: summariseConfidence(latest),
    next: nextStep(input, skills),
    goal: input.goal,
  };
}

/** The lessons that ask predictions in an area — for "where does this come from?" copy. */
export function lessonsForSkill(skill: SkillArea): LessonId[] {
  return [...new Set(Object.values(PREDICTIONS).filter((p) => p.skill === skill).map((p) => p.lesson))];
}
