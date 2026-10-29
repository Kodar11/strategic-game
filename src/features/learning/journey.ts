import { type LessonId, allLessons, allModules, getLesson, lessonsInModule } from '../../content/lessons.ts';
import { GAMES } from '../../games/catalog.ts';
import type { GameId } from '../../games/core.ts';
import { allChallenges, getChallenge } from '../challenges/content.ts';
import { getScenario } from '../scenarios/index.ts';
import { EVIDENCE, type EvidenceLevel, evidenceLevel } from './evidence-policy.ts';
import { type NextStep, type Profile, TOPIC, latestAttempts, lessonsForSkill } from './profile.ts';
import { type LearningAttempt, type SkillArea, allSkills, itemMeta } from './records.ts';
import { type AttemptResult, type Observation, pickObservation, resultOf } from './summary.ts';

/**
 * The learning journey shown by the profile overview and the detailed report: progress through the lessons, one
 * growth snapshot, one recommendation, the four areas, accuracy, confidence, progress over time and the answer
 * history. Built only from an existing Profile (profile.ts holds every core rule) plus the raw record, lesson
 * progress and content; thresholds live in evidence-policy.ts. Pure, so every rule is tested without rendering.
 *
 * Activity (lessons, challenges answered) and agreement with the model (calculable first attempts) are kept apart
 * throughout: finishing a lesson is never presented as evidence of skill.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortTitle = (title: string) => title.split(':')[0];
const rate = (c: { matched: number; judged: number }) => (c.judged ? c.matched / c.judged : 0);
const judgedOf = (list: readonly LearningAttempt[]) => list.filter((a) => a.basis === 'calculable');
const matchedOf = (list: readonly LearningAttempt[]) => list.filter((a) => a.evaluation === 'correct').length;
const label = (skill: SkillArea) => allSkills().find((s) => s.id === skill)?.label ?? TOPIC[skill];

export interface Count {
  judged: number;
  matched: number;
}

// ── Learning progress ────────────────────────────────────────────────────────

export interface ModuleProgress {
  id: string;
  number: number;
  title: string;
  done: number;
  total: number;
}

export interface LearningProgress {
  completed: number;
  total: number;
  inProgress: number;
  /** 0–1, lessons completed. */
  fraction: number;
  modules: ModuleProgress[];
  modulesDone: number;
  /** A position in the curriculum, never a level of ability. */
  stage: string;
  /** One sentence from the actual completion state. */
  sentence: string;
  /** A finished module or the whole library, when there is one to mark. */
  milestone: string | null;
}

export function learningProgress(completed: readonly LessonId[], inProgress: readonly LessonId[]): LearningProgress {
  const lessons = allLessons();
  const done = (id: LessonId) => completed.includes(id);
  const doneCount = lessons.filter((l) => done(l.id)).length;
  const modules = allModules().map((m) => {
    const ls = lessonsInModule(m.id);
    return { id: m.id, number: m.number, title: shortTitle(m.title), done: ls.filter((l) => done(l.id)).length, total: ls.length };
  });
  const modulesDone = modules.filter((m) => m.total > 0 && m.done === m.total).length;
  const total = lessons.length;
  const base = { completed: doneCount, total, inProgress: inProgress.length, fraction: total ? doneCount / total : 0, modules, modulesDone };

  if (total > 0 && doneCount === total) {
    return { ...base, stage: 'Lesson library complete', sentence: 'You’ve completed every lesson. Practice challenges and games keep the ideas sharp.', milestone: null };
  }
  const milestone = modulesDone ? `${modulesDone} of ${plural(modules.length, 'module')} complete` : null;
  if (doneCount === 0) {
    const first = lessons[0];
    const resume = lessons.find((l) => inProgress.includes(l.id));
    return resume
      ? { ...base, stage: 'Getting started', sentence: `You’re partway through ${resume.title}. Pick it up where you left off.`, milestone }
      : { ...base, stage: 'Getting started', sentence: first ? `Start with ${first.title} — about ${first.minutes} minutes.` : 'Start your first lesson.', milestone };
  }
  const current = modules.find((m) => m.done < m.total)!;
  // Module titles are long; the number alone keeps the label to one line, and the sentence names the module.
  const stage = `Module ${current.number} of ${modules.length}`;
  const left = total - doneCount;
  if (left <= 2) return { ...base, stage, sentence: `You’re nearly through the lesson library — ${plural(left, 'lesson')} to go.`, milestone };
  if (current.done === 0 && current.number > 1) {
    return { ...base, stage, sentence: `Module ${current.number - 1} complete. Next up: ${current.title.toLowerCase()}.`, milestone };
  }
  return { ...base, stage, sentence: `You’re working through ${current.title.toLowerCase()} — ${current.done} of ${current.total} lessons in this module done.`, milestone };
}

// ── Areas ────────────────────────────────────────────────────────────────────

export interface AreaCard {
  id: SkillArea;
  label: string;
  description: string;
  /** Lessons that practise this area — activity, shown separately from answers. */
  lessons: { done: number; total: number };
  /** Answers of any kind in the area (first attempts and daily answers). */
  recorded: number;
  judged: number;
  matched: number;
  level: EvidenceLevel;
  /** One concise line. */
  summary: string;
  /** "Early evidence" when there is only tentative evidence; null otherwise. */
  qualifier: string | null;
}

/** All four areas, in curriculum order — including ones not explored yet, so the learner can see what's ahead. */
export function areaCards(profile: Profile, completed: readonly LessonId[]): AreaCard[] {
  return profile.skills.map((s) => {
    const ids = lessonsForSkill(s.id);
    const recorded = profile.evidence.filter((a) => a.skill === s.id).length;
    const level = evidenceLevel(recorded, s.judged, EVIDENCE.area);
    const summary =
      level === 'none'
        ? 'Not explored yet'
        : level === 'activity'
          ? s.judged
            ? `${plural(s.judged, 'first attempt')} so far`
            : `${plural(recorded, 'answer')} so far, none comparable yet`
          : `${s.matched} of ${s.judged} first attempts matched`;
    return {
      id: s.id,
      label: s.label,
      description: s.description,
      lessons: { done: ids.filter((id) => completed.includes(id)).length, total: ids.length },
      recorded,
      judged: s.judged,
      matched: s.matched,
      level,
      summary,
      qualifier: level === 'tentative' ? 'Early evidence' : null,
    };
  });
}

/**
 * Change within one area: its calculable first attempts in time order, earlier half against later half. Rough by
 * design (different questions land in each half), so it is ready only with EVIDENCE.areaTrend.perHalf in each half
 * and calls a gap of less than `minChange` "steady".
 */
export interface AreaTrend {
  ready: boolean;
  earlier: Count;
  later: Count;
  direction: 'higher' | 'lower' | 'steady' | null;
}

export function areaTrend(profile: Profile, skill: SkillArea): AreaTrend {
  const list = judgedOf(profile.evidence.filter((a) => a.skill === skill)).sort((a, b) => a.lockedAt - b.lockedAt);
  const half = Math.floor(list.length / 2);
  const earlier = { judged: half, matched: matchedOf(list.slice(0, half)) };
  const later = { judged: list.length - half, matched: matchedOf(list.slice(half)) };
  if (half < EVIDENCE.areaTrend.perHalf) return { ready: false, earlier, later, direction: null };
  const gap = rate(later) - rate(earlier);
  const direction = gap >= EVIDENCE.areaTrend.minChange ? 'higher' : gap <= -EVIDENCE.areaTrend.minChange ? 'lower' : 'steady';
  return { ready: true, earlier, later, direction };
}

// ── Growth snapshot ──────────────────────────────────────────────────────────

/**
 * The one observation on the overview: what the evidence suggests, what it may mean, and the evidence behind it.
 * - `improving`: later first attempts in an area matched clearly more often than earlier ones.
 * - `encouraging` / `exploring`: the existing observation (summary.ts `pickObservation`), never a fixed label.
 * - `started`: answers recorded but too few to describe — activity only, no judgement.
 */
export interface Growth {
  kind: 'improving' | 'encouraging' | 'exploring' | 'started';
  skill: SkillArea;
  title: string;
  meaning: string;
  /** The evidence, always visible. */
  caption: string;
  early: boolean;
}

export function growthSnapshot(profile: Profile, nextArea: SkillArea | null): Growth | null {
  const improving = profile.skills
    .map((s) => ({ s, t: areaTrend(profile, s.id) }))
    .filter((x) => x.t.direction === 'higher')
    .sort((a, b) => Number(a.s.id === nextArea) - Number(b.s.id === nextArea) || b.s.judged - a.s.judged)[0];
  if (improving) {
    const { s, t } = improving;
    return {
      kind: 'improving',
      skill: s.id,
      title: `Your recent answers on ${TOPIC[s.id]} are matching more often`,
      meaning: 'Your later first attempts here matched the model more often than your earlier ones.',
      caption: `Earlier: ${t.earlier.matched} of ${t.earlier.judged}. Recent: ${t.later.matched} of ${t.later.judged}. Different questions, so treat it as a rough signal.`,
      early: false,
    };
  }

  const observation: Observation | null = pickObservation(profile, nextArea);
  if (observation) {
    const early = observation.level === 'tentative';
    if (observation.tone === 'encouraging') {
      return {
        kind: 'encouraging',
        skill: observation.skill,
        title: early ? `An encouraging start with ${TOPIC[observation.skill]}` : `${label(observation.skill)} is going well`,
        meaning: observation.body,
        caption: observation.caption,
        early,
      };
    }
    return {
      kind: 'exploring',
      skill: observation.skill,
      title: `${label(observation.skill)} is an area to explore further`,
      meaning: observation.body,
      caption: observation.caption,
      early,
    };
  }

  const started = profile.skills
    .map((s) => ({ s, recorded: profile.evidence.filter((a) => a.skill === s.id).length }))
    .filter((x) => x.recorded > 0)
    .sort((a, b) => b.recorded - a.recorded)[0];
  if (started) {
    return {
      kind: 'started',
      skill: started.s.id,
      title: `You’ve started exploring ${TOPIC[started.s.id]}`,
      meaning: 'A few more predictions here will show how your thinking is developing.',
      caption: `${plural(started.recorded, 'answer')} so far — too few to describe a pattern.`,
      early: true,
    };
  }
  return null;
}

// ── Recommendation ───────────────────────────────────────────────────────────

/** The bot game that exercises each area's idea, where one does. Used once every lesson and challenge is done. */
export const GAME_FOR_AREA: Partial<Record<SkillArea, GameId>> = {
  anticipating: 'two-thirds',
  incentives: 'ultimatum',
  coordination: 'stag-hunt',
  uncertainty: 'rps',
};

export interface Recommendation {
  kind: 'lesson' | 'challenges' | 'game';
  reason: NextStep['reason'] | 'game';
  title: string;
  body: string;
  cta: string;
  /** "Lesson 3 · 6 min", "Lesson 3 · 3 challenges", "Game · practice"; null if unknown. */
  meta: string | null;
  lesson: LessonId | null;
  game: GameId | null;
}

const untried = (lesson: LessonId, attempts: readonly LearningAttempt[]) =>
  allChallenges().filter((c) => c.lesson === lesson && !attempts.some((a) => a.prediction === c.id)).length;

/**
 * One next action. The profile's existing `nextStep` (goal → weakest area → lesson in progress or next → untried
 * challenges) decides it; when it would only suggest a replay — every lesson and challenge done — a game that
 * exercises the least-practised area is suggested instead.
 */
export function recommendation(profile: Profile, attempts: readonly LearningAttempt[]): Recommendation {
  const next = profile.next;
  if (next.reason === 'replay') {
    const area = [...profile.skills].sort((a, b) => a.judged - b.judged).find((s) => GAME_FOR_AREA[s.id]);
    const game = area ? GAME_FOR_AREA[area.id]! : null;
    if (area && game) {
      const info = GAMES[game];
      return {
        kind: 'game',
        reason: 'game',
        title: `Play ${info.title}`,
        body: `Put ${TOPIC[area.id]} into practice against a bot. ${info.concept}`,
        cta: 'Play a game',
        meta: 'Game · practice',
        lesson: null,
        game,
      };
    }
  }
  const lesson = getLesson(next.lesson);
  if (next.kind === 'challenges') {
    const left = untried(next.lesson, attempts);
    return {
      kind: 'challenges',
      reason: next.reason,
      title: next.title,
      body: next.body,
      cta: left ? `Try ${plural(left, 'challenge')}` : next.cta,
      meta: lesson ? `Lesson ${lesson.number} · practice challenges` : null,
      lesson: next.lesson,
      game: null,
    };
  }
  return { kind: 'lesson', reason: next.reason, title: next.title, body: next.body, cta: next.cta, meta: lesson ? `Lesson ${lesson.number} · ${lesson.minutes} min` : null, lesson: next.lesson, game: null };
}

/**
 * The next thing to do inside one area: the area's lesson in progress, then its next unfinished lesson, then a
 * lesson with untried challenges in this area, then its game. Null when there is nothing left to suggest.
 */
export function areaNext(skill: SkillArea, input: { attempts: readonly LearningAttempt[]; completed: readonly LessonId[]; inProgress: readonly LessonId[] }): Recommendation | null {
  const ids = lessonsForSkill(skill);
  const resume = ids.find((id) => input.inProgress.includes(id) && !input.completed.includes(id)) ?? ids.find((id) => !input.completed.includes(id));
  if (resume) {
    const l = getLesson(resume)!;
    const verb = input.inProgress.includes(resume) ? 'Continue' : 'Start';
    return { kind: 'lesson', reason: 'next-lesson', title: l.title, body: l.description, cta: `${verb} lesson`, meta: `Lesson ${l.number} · ${l.minutes} min`, lesson: resume, game: null };
  }
  const challenge = allChallenges().find((c) => c.skill === skill && !input.attempts.some((a) => a.prediction === c.id));
  if (challenge) {
    const l = getLesson(challenge.lesson)!;
    const left = allChallenges().filter((c) => c.lesson === challenge.lesson && !input.attempts.some((a) => a.prediction === c.id)).length;
    return { kind: 'challenges', reason: 'practice', title: `Challenges for ${l.title}`, body: 'Apply the idea to scenarios you haven’t seen.', cta: `Try ${plural(left, 'challenge')}`, meta: `Lesson ${l.number} · practice challenges`, lesson: l.id, game: null };
  }
  const game = GAME_FOR_AREA[skill];
  if (game) {
    const info = GAMES[game];
    return { kind: 'game', reason: 'game', title: info.title, body: info.concept, cta: 'Play a game', meta: 'Game · practice', lesson: null, game };
  }
  return null;
}

// ── Prediction accuracy ──────────────────────────────────────────────────────

export interface Accuracy {
  /** Calculable first attempts: the only answers compared with the model. */
  comparable: number;
  matched: number;
  partly: number;
  /** Comparable first attempts that neither matched nor partly matched. */
  other: number;
  /** First attempts about unknowable outcomes — recorded, never compared. */
  excluded: number;
  /** Later submissions at questions already answered — never counted. */
  retries: number;
  /** Whole-number percentage of `comparable` that matched, once there are EVIDENCE.percent; otherwise null. */
  percent: number | null;
  /** Enough first attempts to summarise at all (EVIDENCE.firstAttempts). */
  ready: boolean;
}

export function accuracy(profile: Profile, attempts: readonly LearningAttempt[]): Accuracy {
  const judged = judgedOf(profile.evidence);
  const matched = matchedOf(judged);
  const partly = judged.filter((a) => a.evaluation === 'partial').length;
  return {
    comparable: judged.length,
    matched,
    partly,
    other: judged.length - matched - partly,
    excluded: profile.evidence.length - judged.length,
    retries: attempts.filter((a) => a.attempt > 1).length,
    percent: judged.length >= EVIDENCE.percent ? Math.round((matched / judged.length) * 100) : null,
    ready: judged.length >= EVIDENCE.firstAttempts.tentative,
  };
}

// ── Confidence and calibration ───────────────────────────────────────────────

export interface ConfidenceBand {
  id: 'low' | 'middle' | 'high';
  label: string;
  count: number;
  matched: number;
  /** Enough answers in the band to show its rate (EVIDENCE.confidence.group). */
  ready: boolean;
}

export interface Calibration {
  /** Enough rated, calculable first attempts for the section (EVIDENCE.confidence.total). */
  ready: boolean;
  rated: number;
  bands: ConfidenceBand[];
  /**
   * Comparing the most and least confident bands, when both are ready: `rises` (surer answers matched more often),
   * `inverted` (they matched less often), `level` (no clear gap). Null when they can't be compared.
   */
  pattern: 'rises' | 'level' | 'inverted' | null;
  text: string;
}

export function calibration(profile: Profile): Calibration {
  const judged = judgedOf(profile.evidence);
  const band = (id: ConfidenceBand['id'], text: string, list: LearningAttempt[]): ConfidenceBand => ({
    id,
    label: text,
    count: list.length,
    matched: matchedOf(list),
    ready: list.length >= EVIDENCE.confidence.group,
  });
  const bands = [
    band('low', 'Guessing or slightly sure (1–2)', judged.filter((a) => a.confidence <= 2)),
    band('middle', 'Fairly sure (3)', judged.filter((a) => a.confidence === 3)),
    band('high', 'Very or extremely sure (4–5)', judged.filter((a) => a.confidence >= 4)),
  ];
  if (judged.length < EVIDENCE.confidence.total) {
    return { ready: false, rated: judged.length, bands, pattern: null, text: profile.confidence.message };
  }
  const low = bands[0];
  const high = bands[2];
  if (!low.ready || !high.ready) {
    return {
      ready: true,
      rated: judged.length,
      bands,
      pattern: null,
      text: 'Most of your ratings sit in one part of the scale, so there isn’t yet a sure group and an unsure group to compare. Keep rating honestly — that’s what makes this useful.',
    };
  }
  const gap = rate({ matched: high.matched, judged: high.count }) - rate({ matched: low.matched, judged: low.count });
  const pattern = gap >= EVIDENCE.calibrationGap ? 'rises' : gap <= -EVIDENCE.calibrationGap ? 'inverted' : 'level';
  const text =
    pattern === 'rises'
      ? 'Answers you felt surer about matched the model more often than your guesses — your confidence seems to be tracking something real.'
      : pattern === 'inverted'
        ? 'Your surest answers didn’t match the model more often than your guesses. When you feel certain, it can help to ask what you’re assuming and what you can’t see.'
        : 'So far your sure and unsure answers have matched the model at similar rates.';
  return { ready: true, rated: judged.length, bands, pattern, text };
}

// ── Progress over time ───────────────────────────────────────────────────────

export interface SeriesPoint extends Count {
  /** First and last answer in the block (ms since epoch). */
  from: number;
  to: number;
}

export interface ProgressSeries {
  ready: boolean;
  points: SeriesPoint[];
  /** Answers per block (the last block may hold a few more). */
  blockSize: number;
  /** First block against the last, once ready. */
  direction: 'higher' | 'lower' | 'steady' | null;
  /** How many more comparable first attempts until the chart appears (0 once ready). */
  needed: number;
}

/**
 * Calculable first attempts in the order they were answered (by their real `lockedAt`), grouped into equal blocks.
 * Blocks, not calendar weeks, because learners often answer many questions in one sitting: each point then rests on
 * the same number of answers. A remainder smaller than a block joins the last block rather than standing alone.
 */
export function progressSeries(profile: Profile): ProgressSeries {
  const { perPoint, minPoints, maxPoints, minChange } = EVIDENCE.series;
  const list = judgedOf(profile.evidence).sort((a, b) => a.lockedAt - b.lockedAt);
  const minimum = perPoint * minPoints;
  if (list.length < minimum) return { ready: false, points: [], blockSize: perPoint, direction: null, needed: minimum - list.length };
  const blockSize = Math.max(perPoint, Math.ceil(list.length / maxPoints));
  const blocks: LearningAttempt[][] = [];
  for (let i = 0; i < list.length; i += blockSize) blocks.push(list.slice(i, i + blockSize));
  if (blocks.length > 1 && blocks[blocks.length - 1].length < perPoint) blocks[blocks.length - 2].push(...blocks.pop()!);
  const points = blocks.map((b) => ({ judged: b.length, matched: matchedOf(b), from: b[0].lockedAt, to: b[b.length - 1].lockedAt }));
  const gap = rate(points[points.length - 1]) - rate(points[0]);
  const direction = gap >= minChange ? 'higher' : gap <= -minChange ? 'lower' : 'steady';
  return { ready: points.length >= minPoints, points, blockSize, direction, needed: 0 };
}

// ── Answer history ───────────────────────────────────────────────────────────

export interface HistoryRow {
  id: string;
  item: string;
  question: string;
  lesson: LessonId;
  source: 'Lesson' | 'Challenge' | 'Scenario' | 'Daily challenge';
  skill: SkillArea;
  /** The first answer's option label, when this version of the content still has it. */
  answer: string | null;
  confidence: number;
  result: AttemptResult;
  outcome: string;
  /** Depended on something the learner couldn't know — never compared with the model. */
  uncertain: boolean;
  lockedAt: number;
  /** Later submissions at the same question; they never change `result`. */
  retries: number;
  /** The most recent retry's result, if retried. */
  latest: AttemptResult | null;
}

function answerLabel(a: LearningAttempt): string | null {
  const c = getChallenge(a.prediction);
  if (c) return c.options.find((o) => o.id === a.answer)?.label ?? null;
  const s = getScenario(a.prediction);
  if (s) return s.predict.options.find((o) => o.id === a.answer)?.label ?? null;
  return null;
}

/** Every first attempt (and daily answer), newest first; optionally one area only. */
export function answerHistory(profile: Profile, attempts: readonly LearningAttempt[], skill?: SkillArea): HistoryRow[] {
  const latest = new Map(latestAttempts(attempts).map((a) => [a.prediction, a]));
  return profile.evidence
    .filter((a) => !skill || a.skill === skill)
    .map((a): HistoryRow => {
      const meta = itemMeta(a.prediction);
      const daily = a.prediction.startsWith('daily/');
      const retries = attempts.filter((x) => x.prediction === a.prediction && x.attempt > a.attempt).length;
      const last = latest.get(a.prediction);
      return {
        id: a.id,
        item: a.prediction,
        question: meta?.question ?? (daily ? 'Daily challenge' : a.prediction),
        lesson: a.lesson,
        source: daily ? 'Daily challenge' : a.kind === 'challenge' ? 'Challenge' : a.kind === 'scenario' ? 'Scenario' : 'Lesson',
        skill: a.skill,
        answer: answerLabel(a),
        confidence: a.confidence,
        result: resultOf(a),
        outcome: a.outcome,
        uncertain: a.basis !== 'calculable',
        lockedAt: a.lockedAt,
        retries,
        latest: retries && last ? resultOf(last) : null,
      };
    })
    .reverse();
}
