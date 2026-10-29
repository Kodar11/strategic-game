import { type LessonId, allLessons, allModules, getLesson } from '../../content/lessons.ts';
import { EVIDENCE, type EvidenceLevel, evidenceLevel } from './evidence-policy.ts';
import { type Profile, type SkillSummary, TOPIC, isStrong, lessonsForSkill } from './profile.ts';
import { type Evaluation, type LearningAttempt, type SkillArea, itemMeta } from './records.ts';

/**
 * What the profile screens show, chosen from an already-built Profile (profile.ts holds every calculation). This
 * layer only decides *what is worth saying* and how cautiously, using the levels in evidence-policy.ts:
 * one snapshot, at most one observation, the areas with activity, and which detailed-report sections have
 * enough data to appear. Pure, so the display rules are tested without rendering.
 */

export interface Snapshot {
  /** Where the learner is in the curriculum — a position, never a level of ability. */
  stage: string;
  body: string;
  lessons: { completed: number; total: number; inProgress: number };
  /** The scoped "N of M first attempts matched" line, once there are enough first attempts to summarise. */
  firstAttempts: { matched: number; judged: number } | null;
}

export interface Observation {
  skill: SkillArea;
  /** `encouraging` uses the existing `isStrong` rule; everything else is described neutrally as still exploring. */
  tone: 'encouraging' | 'exploring';
  level: Extract<EvidenceLevel, 'tentative' | 'established'>;
  title: string;
  body: string;
  /** The sample behind it, always visible. */
  caption: string;
}

export interface AreaRow {
  id: SkillArea;
  label: string;
  level: EvidenceLevel;
  /** Answers of any kind in the area, including ones about unknowable outcomes. */
  recorded: number;
  judged: number;
  matched: number;
  /** One raw, scoped measure: counts only, no judgement. */
  measure: string;
  /** How much the measure can be read into. */
  caption: string;
}

/** Detailed-report sections that have enough data to say something; the rest are left out, not shown empty. */
export interface ReportSections {
  firstAttempts: boolean;
  feedback: boolean;
  transfer: boolean;
  confidence: boolean;
  trend: boolean;
}

export interface ProfileSummary {
  /** Anything at all to report — otherwise the profile is a starting point only. */
  hasActivity: boolean;
  snapshot: Snapshot;
  observation: Observation | null;
  /** The area the next step practises, when it was chosen for one (goal or gap). */
  nextArea: SkillArea | null;
  /** Only areas with recorded activity, in the curriculum's area order. */
  areas: AreaRow[];
  report: ReportSections;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

function areaRows(profile: Profile): AreaRow[] {
  return profile.skills.flatMap((s): AreaRow[] => {
    const recorded = profile.evidence.filter((a) => a.skill === s.id).length;
    const level = evidenceLevel(recorded, s.judged, EVIDENCE.area);
    if (level === 'none') return [];
    const measure = s.judged ? `${s.matched} of ${plural(s.judged, 'first attempt')} matched` : `${plural(recorded, 'answer')} so far`;
    const caption = level === 'established' ? 'More established' : level === 'tentative' ? 'Early evidence' : s.judged ? 'Just started' : 'Not yet comparable with the model';
    return [{ id: s.id, label: s.label, level, recorded, judged: s.judged, matched: s.matched, measure, caption }];
  });
}

function snapshot(profile: Profile, completed: readonly LessonId[], areas: readonly AreaRow[], hasActivity: boolean): Snapshot {
  const { progress, glance } = profile;
  const lessons = { completed: progress.completed, total: progress.total, inProgress: progress.inProgress };
  const firstAttempts = glance.ready ? { matched: glance.matched, judged: glance.judged } : null;
  if (!hasActivity) {
    return { stage: 'Getting started', body: 'Make a few predictions in a lesson and this page will reflect what you’ve explored.', lessons, firstAttempts };
  }
  const topics = list(areas.map((a) => TOPIC[a.id]));
  if (progress.completed >= progress.total) {
    return { stage: 'Every lesson completed', body: topics ? `You’ve worked through the whole curriculum, exploring ${topics}.` : 'You’ve worked through the whole curriculum.', lessons, firstAttempts };
  }
  // A neutral position: the module of the first lesson not yet completed.
  const first = allLessons().find((l) => !completed.includes(l.id));
  const module = allModules().find((m) => m.id === first?.module);
  const stage = module ? `Module ${module.number} · ${module.title.split(':')[0]}` : 'Getting started';
  const body = topics ? `You’ve begun exploring ${topics}.` : 'You’ve started learning — the predictions you make in lessons will show here.';
  return { stage, body, lessons, firstAttempts };
}

/** The area the next step was chosen for, if any: a goal, or the weakest area (whose lesson it opens). */
function nextAreaOf(profile: Profile): SkillArea | null {
  if (profile.next.reason === 'goal' && profile.goal && profile.goal !== 'none') return profile.goal;
  if (profile.next.reason === 'gap') return profile.skills.find((s) => s.lesson === profile.next.lesson)?.id ?? null;
  return null;
}

function describe(s: SkillSummary): Observation {
  const level = s.judged >= EVIDENCE.area.established ? 'established' : 'tentative';
  const topic = TOPIC[s.id];
  const caption =
    level === 'tentative'
      ? `Based on ${plural(s.judged, 'first attempt')} — a few more will show whether this pattern holds.`
      : `Based on ${plural(s.judged, 'first attempt')} you could work out from the information given.`;
  if (isStrong(s)) {
    const body =
      s.matched === s.judged
        ? s.judged === 2
          ? `You matched the model on both of your first attempts on ${topic}.`
          : `You matched the model on all ${s.judged} of your first attempts on ${topic}.`
        : `You matched the model on ${s.matched} of ${s.judged} first attempts on ${topic}.`;
    return { skill: s.id, tone: 'encouraging', level, title: level === 'tentative' ? 'An encouraging start' : `Going well: ${s.label}`, body, caption };
  }
  const body = s.matched === 0 ? `Your first ${s.judged} attempts on ${topic} haven’t matched the model yet.` : `Your first attempts on ${topic} have had mixed results so far: ${s.matched} of ${s.judged} matched.`;
  return { skill: s.id, tone: 'exploring', level, title: `Still exploring ${topic}`, body, caption };
}

/**
 * At most one observation, from areas with at least tentative evidence. An encouraging pattern comes first (it is
 * what the learner has demonstrated), preferring an area other than the one the next step already covers, so the
 * observation and the next step don't say the same thing; then more evidence, then curriculum order.
 */
export function pickObservation(profile: Profile, nextArea: SkillArea | null): Observation | null {
  const order = profile.skills.map((s) => s.id);
  const rank = (s: SkillSummary) => (isStrong(s) ? 0 : 2) + (s.id === nextArea ? 1 : 0);
  const best = profile.skills
    .filter((s) => s.judged >= EVIDENCE.area.tentative)
    .sort((a, b) => rank(a) - rank(b) || b.judged - a.judged || order.indexOf(a.id) - order.indexOf(b.id))[0];
  return best ? describe(best) : null;
}

export function summariseProfile(profile: Profile, completed: readonly LessonId[]): ProfileSummary {
  const { progress, practice, confidence, trend } = profile;
  const hasActivity = profile.evidence.length > 0 || progress.completed > 0 || progress.inProgress > 0 || progress.predictions > 0 || progress.challengesTried > 0;
  const areas = areaRows(profile);
  const nextArea = nextAreaOf(profile);
  return {
    hasActivity,
    snapshot: snapshot(profile, completed, areas, hasActivity),
    observation: pickObservation(profile, nextArea),
    nextArea,
    areas,
    report: {
      firstAttempts: profile.evidence.length > 0,
      feedback: practice.improvement.ready,
      transfer: practice.transfer.ready,
      confidence: confidence.ready && confidence.groups.length > 0,
      trend: trend.ready,
    },
  };
}

// ── One area in detail ───────────────────────────────────────────────────────

export type AttemptResult = 'matched' | 'partly' | 'reasonable' | 'different' | 'not-compared';

export interface AreaAttempt {
  id: string;
  question: string;
  lesson: LessonId;
  daily: boolean;
  result: AttemptResult;
  lockedAt: number;
}

export interface AreaDetail {
  skill: SkillSummary;
  row: AreaRow | null;
  /** First attempts in this area, newest first. */
  attempts: AreaAttempt[];
  /** Later submissions at questions in this area — shown so they are visibly not counted. */
  retries: number;
  /** The lessons that practise this area, by module, in curriculum order. */
  modules: { id: string; number: number; title: string; lessons: { id: LessonId; number: number; title: string; completed: boolean }[] }[];
}

const RESULT: Record<Evaluation, AttemptResult> = { correct: 'matched', partial: 'partly', 'reasonable-miss': 'reasonable', reasonable: 'reasonable', misconception: 'different' };

/** How one answer compares with the model; answers about unknowable outcomes are never compared. */
export const resultOf = (a: Pick<LearningAttempt, 'basis' | 'evaluation'>): AttemptResult => (a.basis === 'calculable' ? RESULT[a.evaluation] : 'not-compared');

export function areaDetail(profile: Profile, skill: SkillArea, input: { attempts: readonly LearningAttempt[]; completed: readonly LessonId[] }): AreaDetail | null {
  const s = profile.skills.find((x) => x.id === skill);
  if (!s) return null;
  const attempts = profile.evidence
    .filter((a) => a.skill === skill)
    .map((a) => ({
      id: a.id,
      question: itemMeta(a.prediction)?.question ?? 'Daily challenge',
      lesson: a.lesson,
      daily: a.prediction.startsWith('daily/'),
      result: resultOf(a),
      lockedAt: a.lockedAt,
    }))
    .reverse();
  const retries = input.attempts.filter((a) => a.skill === skill && a.attempt > 1).length;
  const ids = lessonsForSkill(skill);
  const modules = allModules()
    .map((m) => ({
      id: m.id,
      number: m.number,
      title: m.title.split(':')[0],
      lessons: ids
        .map((id) => getLesson(id)!)
        .filter((l) => l.module === m.id)
        .map((l) => ({ id: l.id, number: l.number, title: l.title, completed: input.completed.includes(l.id) })),
    }))
    .filter((m) => m.lessons.length > 0);
  return { skill: s, row: areaRows(profile).find((r) => r.id === skill) ?? null, attempts, retries, modules };
}
