import { LESSONS, type LessonId } from '../../content/lessons.ts';
import { CHALLENGES } from '../challenges/content.ts';
import { GOALS, type GoalId, type LearningAttempt, PREDICTIONS, SKILLS, type SkillArea, firstAttempts } from './records.ts';

/**
 * The Strategic Thinking Profile, derived only from the learning record and lesson progress. Deterministic and
 * deliberately conservative:
 * - Evidence comes from **first attempts**. A retry or replay never adds evidence or upgrades a result — otherwise
 *   repeating a question until it turned green would look like mastery. Retries appear only under "practice".
 * - Skill, confidence and transfer observations use only *calculable* answers — ones that followed from the
 *   information given. Answers about hidden rules or unknowable outcomes are never evidence of good or poor reasoning.
 * - Every observation needs a minimum amount of evidence; otherwise the page says so instead of guessing.
 * - There is no overall score.
 */

/** First answers needed in an area before saying anything about it. */
export const MIN_AREA_EVIDENCE = 2;
/** First answers needed in a confidence group before comparing it with results. */
export const MIN_CONFIDENCE_GROUP = 3;
/** Calculable first answers needed before the confidence section appears at all. */
export const MIN_CONFIDENCE_TOTAL = 4;
/** Calculable first answers needed before summarising first tries. */
export const MIN_FIRST_ATTEMPTS = 4;
/** Retried questions (first answer not matching, same content version) needed before summarising practice. */
export const MIN_RETRIED = 2;
/** Different challenges for one concept needed before saying anything about transfer. */
export const MIN_TRANSFER_SCENARIOS = 2;

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
  /** Calculable first answers in this area (lessons and challenges). */
  judged: number;
  matched: number;
  /** One plain-language line about this area. */
  text: string;
}

export interface Insight {
  id: 'gap' | 'overconfident' | 'transfer' | 'practice' | 'uncertain-misses' | 'underconfident' | 'strength';
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
  judged: number;
  ready: boolean;
  groups: ConfidenceGroup[];
  message: string;
}

export interface TransferLine {
  lesson: LessonId;
  tried: number;
  matchedFirst: number;
  /** How many of those first tries came before the learner had completed the lesson. */
  beforeLesson: number;
  text: string;
}

export interface PracticeSummary {
  first: { ready: boolean; judged: number; matched: number; text: string };
  improvement: { ready: boolean; retried: number; nowMatch: number; repeated: number; text: string };
  transfer: { ready: boolean; lines: TransferLine[]; text: string };
}

export interface NextStep {
  kind: 'lesson' | 'challenges';
  lesson: LessonId;
  title: string;
  body: string;
  reason: 'goal' | 'gap' | 'next-lesson' | 'practice' | 'replay';
  cta: string;
}

export interface Profile {
  progress: { completed: number; total: number; inProgress: number; predictions: number; challengesTried: number; challengesTotal: number };
  skills: SkillSummary[];
  primary: Insight | null;
  secondary: Insight | null;
  confidence: ConfidenceSummary;
  practice: PracticeSummary;
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

/** The most recent attempt at each item (used only for practice, never as evidence). */
export function latestAttempts(attempts: readonly LearningAttempt[]): LearningAttempt[] {
  const latest = new Map<string, LearningAttempt>();
  for (const a of attempts) {
    const prev = latest.get(a.prediction);
    if (!prev || a.attempt > prev.attempt || (a.attempt === prev.attempt && a.lockedAt >= prev.lockedAt)) latest.set(a.prediction, a);
  }
  return [...latest.values()].sort((a, b) => a.lockedAt - b.lockedAt);
}

const judgedOf = (attempts: readonly LearningAttempt[]) => attempts.filter((a) => a.basis === 'calculable');
const matchedOf = (attempts: readonly LearningAttempt[]) => attempts.filter((a) => a.evaluation === 'correct').length;
const isWeak = (s: SkillSummary) => s.judged >= MIN_AREA_EVIDENCE && s.matched * 2 <= s.judged;
const isStrong = (s: SkillSummary, min = MIN_AREA_EVIDENCE) => s.judged >= min && s.matched * 4 >= s.judged * 3;

const challengesOf = (lesson: LessonId) => CHALLENGES.filter((c) => c.lesson === lesson);
const untriedChallenges = (lesson: LessonId, attempts: readonly LearningAttempt[]) =>
  challengesOf(lesson).filter((c) => !attempts.some((a) => a.prediction === c.id)).length;

export function summariseSkills(first: readonly LearningAttempt[]): SkillSummary[] {
  return SKILLS.map((s) => {
    const inArea = first.filter((a) => a.skill === s.id);
    const judged = judgedOf(inArea);
    const matched = matchedOf(judged);
    const status: SkillSummary['status'] = inArea.length === 0 ? 'not-started' : judged.length < MIN_AREA_EVIDENCE ? 'exploring' : 'observed';
    const text =
      status === 'not-started'
        ? 'Not tried yet.'
        : status === 'exploring'
          ? `Still exploring — ${plural(inArea.length, 'answer')} so far.`
          : `Matched the model on ${matched} of ${judged.length} first tries you could work out from the information given.`;
    return { ...s, status, judged: judged.length, matched, text };
  });
}

export function summariseConfidence(first: readonly LearningAttempt[]): ConfidenceSummary {
  const judged = judgedOf(first);
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
    return { label, count: list.length, matched, text: `Your ${describe} first answers matched the model ${matched} of ${list.length} times.` };
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
      ? 'A reflection aid, not a test: a handful of answers can only hint at a pattern.'
      : 'Your confidence ratings are spread out, so there is no group large enough to compare yet. Keep rating your answers.',
  };
}

export function summarisePractice(attempts: readonly LearningAttempt[], first: readonly LearningAttempt[]): PracticeSummary {
  // First tries.
  const judged = judgedOf(first);
  const matched = matchedOf(judged);
  const firstReady = judged.length >= MIN_FIRST_ATTEMPTS;
  const firstText = firstReady
    ? `On your first tries, ${matched} of ${judged.length} answers you could work out from the information given matched the model.`
    : `Not enough evidence yet — ${plural(MIN_FIRST_ATTEMPTS - judged.length, 'more first answer')} you can work out from the information given will start this summary.`;

  // Practice: only questions first missed, retried on the same content, and fairly evaluable.
  const latest = new Map(latestAttempts(attempts).map((a) => [a.prediction, a]));
  const retried = judged.filter((f) => {
    const l = latest.get(f.prediction)!;
    return l.attempt > f.attempt && f.evaluation !== 'correct' && f.contentVersion === l.contentVersion;
  });
  const nowMatch = retried.filter((f) => latest.get(f.prediction)!.evaluation === 'correct').length;
  const repeated = retried.filter((f) => {
    const l = latest.get(f.prediction)!;
    return f.evaluation === 'misconception' && l.answer === f.answer;
  }).length;
  const improvementReady = retried.length >= MIN_RETRIED;
  const improvementText = improvementReady
    ? `After feedback, you moved to the model’s answer on ${nowMatch} of ${retried.length} questions you first missed. That shows you followed the reasoning — your first tries are the better guide to what you’d spot on your own.` +
      (repeated ? ` On ${plural(repeated, 'question')} you gave the same answer again; that idea may need another look.` : '')
    : 'Not enough evidence yet — retry a question you first missed to see what changes.';

  // Transfer: first tries at different challenges, per lesson concept.
  const lines: TransferLine[] = LESSONS.flatMap((l) => {
    const tries = judged.filter((a) => a.kind === 'challenge' && a.lesson === l.id);
    if (tries.length < MIN_TRANSFER_SCENARIOS) return [];
    const m = matchedOf(tries);
    const before = tries.filter((a) => a.lessonCompleted === false).length;
    return [
      {
        lesson: l.id,
        tried: tries.length,
        matchedFirst: m,
        beforeLesson: before,
        text: `${l.title}: matched the model on your first try in ${m} of ${tries.length} new situations${before ? ` (${before} before taking the lesson)` : ''}.`,
      },
    ];
  });
  return {
    first: { ready: firstReady, judged: judged.length, matched, text: firstText },
    improvement: { ready: improvementReady, retried: retried.length, nowMatch, repeated, text: improvementText },
    transfer: {
      ready: lines.length > 0,
      lines,
      text: lines.length ? 'Each counts one first try per challenge — retries aren’t included.' : 'Not enough evidence yet — try at least two challenges for a concept to see how it carries over.',
    },
  };
}

function candidateInsights(first: readonly LearningAttempt[], skills: readonly SkillSummary[], practice: PracticeSummary): Insight[] {
  const out: Insight[] = [];
  const judged = judgedOf(first);
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
      body: `Your first answers about ${TOPIC[a.id]} mostly matched the model, while ${TOPIC[b.id]} ${b.id === 'uncertainty' ? 'are' : 'is'} still settling. ${lessonTitle(b.lesson)} and its challenges are a good way to compare the two.`,
      evidence: `First tries — ${a.label}: ${a.matched} of ${a.judged}. ${b.label}: ${b.matched} of ${b.judged}.`,
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
      evidence: `${matchedOf(confident)} of ${confident.length} first answers you rated very or extremely confident matched the model.`,
      lesson: missedIn ? missedIn.lesson : null,
    });
  }

  for (const line of practice.transfer.lines) {
    if (line.matchedFirst < MIN_TRANSFER_SCENARIOS || line.matchedFirst * 3 < line.tried * 2) continue;
    const skill = mainSkill(line.lesson);
    out.push({
      id: 'transfer',
      skill,
      mentions: [skill],
      title: `You carried “${lessonTitle(line.lesson)}” into new situations`,
      body:
        line.beforeLesson === line.tried
          ? 'Your first answers in unfamiliar scenarios matched the model, even before taking the lesson — the lesson may sharpen an instinct you already have.'
          : 'Your first answers in unfamiliar scenarios matched the model — evidence that the idea travels, not just that you remember the lesson.',
      evidence: `First tries on ${line.tried} different challenges: ${line.matchedFirst} matched the model. Retries aren’t counted.`,
      lesson: line.lesson,
    });
  }

  for (const b of weak) {
    if (out.some((i) => i.id === 'gap' && i.skill === b.id)) continue;
    out.push({
      id: 'practice',
      skill: b.id,
      mentions: [b.id],
      title: `${b.label} is worth another look`,
      body: `${b.description} ${lessonTitle(b.lesson)} and its challenges let you test your reasoning on this again.`,
      evidence: `${b.matched} of ${b.judged} first answers in this area matched the model.`,
      lesson: b.lesson,
    });
  }

  const reasonable = first.filter((x) => x.kind === 'lesson' && x.evaluation === 'reasonable-miss');
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
      body: 'Answers you marked as guesses often matched the model. Your reasoning may be ahead of your confidence.',
      evidence: `${matchedOf(unsure)} of ${unsure.length} first answers you rated as guessing or slightly confident matched the model.`,
      lesson: null,
    });
  }

  for (const a of skills.filter((s) => isStrong(s, MIN_AREA_EVIDENCE + 1))) {
    out.push({
      id: 'strength',
      skill: a.id,
      mentions: [a.id],
      title: `A strength: ${TOPIC[a.id]}`,
      body: `${a.description} Your first answers here have consistently matched the model.`,
      evidence: `${a.matched} of ${a.judged} first answers in this area matched the model.`,
      lesson: a.lesson,
    });
  }
  return out;
}

/** The area most of a lesson's challenges practise. */
function mainSkill(lesson: LessonId): SkillArea {
  const counts = new Map<SkillArea, number>();
  for (const c of challengesOf(lesson)) counts.set(c.skill, (counts.get(c.skill) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
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
  const lessonStep = (lesson: LessonId, reason: NextStep['reason'], body: string): NextStep => {
    const verb = input.inProgress.includes(lesson) ? 'Continue' : done(lesson) ? 'Replay' : 'Try';
    return { kind: 'lesson', lesson, reason, body, title: `${verb} ${lessonTitle(lesson)}`, cta: `${verb} lesson` };
  };
  const challengeStep = (lesson: LessonId, reason: NextStep['reason'], body: string): NextStep => ({
    kind: 'challenges',
    lesson,
    reason,
    body,
    title: `Try the challenges for ${lessonTitle(lesson)}`,
    cta: 'Start challenges',
  });
  // A completed lesson with untried challenges is best practised in new situations; otherwise the lesson itself.
  const practiceOrLesson = (lesson: LessonId, reason: NextStep['reason'], lessonBody: string) => {
    const left = untriedChallenges(lesson, input.attempts);
    return done(lesson) && left
      ? challengeStep(lesson, reason, `${plural(left, 'short challenge')} apply this idea to new situations.`)
      : lessonStep(lesson, reason, lessonBody);
  };

  if (input.goal && input.goal !== 'none') {
    const skill = SKILLS.find((s) => s.id === input.goal)!;
    const goalLabel = GOALS.find((g) => g.id === input.goal)!.label.toLowerCase();
    return practiceOrLesson(
      skill.lesson,
      'goal',
      done(skill.lesson)
        ? `You want to get better at ${goalLabel}. Play it again and see whether your predictions — and your confidence — line up with the model.`
        : `You want to get better at ${goalLabel}. This lesson is built around exactly that.`,
    );
  }
  const weakest = skills.filter(isWeak).sort((a, b) => a.matched / a.judged - b.matched / b.judged)[0];
  if (weakest) {
    return practiceOrLesson(weakest.lesson, 'gap', `Practise ${TOPIC[weakest.id]}: ${weakest.description.toLowerCase()}`);
  }
  const resume = LESSONS.find((l) => input.inProgress.includes(l.id)) ?? LESSONS.find((l) => !done(l.id));
  if (resume) {
    return lessonStep(resume.id, 'next-lesson', resume.description);
  }
  const practise = LESSONS.find((l) => untriedChallenges(l.id, input.attempts) > 0);
  if (practise) {
    return challengeStep(practise.id, 'practice', `${plural(untriedChallenges(practise.id, input.attempts), 'short challenge')} apply this idea to new situations.`);
  }
  const leastSeen = [...skills].sort((a, b) => a.judged - b.judged)[0];
  return lessonStep(leastSeen.lesson, 'replay', 'Try another round of predictions and see whether your confidence matches the result.');
}

export function buildProfile(input: ProfileInput): Profile {
  const first = firstAttempts(input.attempts);
  const skills = summariseSkills(first);
  const practice = summarisePractice(input.attempts, first);
  const { primary, secondary } = pickInsights(candidateInsights(first, skills, practice), input.goal);
  const tried = new Set(input.attempts.filter((a) => a.kind === 'challenge').map((a) => a.prediction));
  return {
    progress: {
      completed: input.completed.length,
      total: LESSONS.length,
      inProgress: input.inProgress.length,
      predictions: input.attempts.filter((a) => a.kind === 'lesson').length,
      challengesTried: tried.size,
      challengesTotal: CHALLENGES.length,
    },
    skills,
    primary,
    secondary,
    confidence: summariseConfidence(first),
    practice,
    next: nextStep(input, skills),
    goal: input.goal,
  };
}

/** The lessons whose predictions or challenges inform an area — for "where does this come from?" copy. */
export function lessonsForSkill(skill: SkillArea): LessonId[] {
  const fromLessons = Object.values(PREDICTIONS).filter((p) => p.skill === skill).map((p) => p.lesson);
  const fromChallenges = CHALLENGES.filter((c) => c.skill === skill).map((c) => c.lesson);
  return LESSONS.map((l) => l.id).filter((id) => fromLessons.includes(id) || fromChallenges.includes(id));
}
