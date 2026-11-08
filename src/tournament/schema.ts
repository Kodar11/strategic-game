import { z } from 'zod';

import { ARENA_ENGINES } from '../arena/registry.ts';
import { isArenaId } from '../arena/core.ts';
import { LESSON_IDS, type LessonId } from '../content/lessons.ts';
import { isGameId } from '../games/core.ts';

/**
 * The Tournament's content: rivals, stages and matches, as one published document (like the lesson catalog). The
 * app knows only the game engines; everything a season is made of lives here, so a new arc or season is data, not
 * code. The document is validated twice: its shape (zod) and its meaning (`validateTournament`: every match points
 * at a real game, level and variant, every lesson exists, ids are unique). A document that fails is never used.
 *
 * Ids are stable forever: progress is saved against them, so reordering matches never breaks a save.
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9.\-]{0,63}$/);
const text = z.string().min(1).max(400);
const lines = z.array(text).max(12);

export const TONES = ['blue', 'orange', 'amber', 'cyan', 'success'] as const;
export type RivalTone = (typeof TONES)[number];

/** The four play styles, from where a player wins most (see progress.ts `playStyle`). */
export const STYLES = ['diplomat', 'manipulator', 'reader', 'calculator'] as const;
export type PlayStyle = (typeof STYLES)[number];

const rival = z.object({
  id,
  name: z.string().min(1).max(40),
  /** "The Liar". */
  epithet: z.string().min(1).max(40),
  tone: z.enum(TONES),
  /** One line on how they play: shown on the stage screen. */
  bio: text,
  lines: z.object({
    /** Said when the player beats them in a match. */
    onPlayerWin: lines.min(1),
    /** Said when the player loses to them. */
    onPlayerLoss: lines.min(1),
    /** Said once, when their Rival Duel is lost. */
    defeated: text,
  }),
});

const match = z.object({
  id,
  game: z.object({ system: z.enum(['arena', 'classic']), id: z.string() }),
  level: z.enum(['easy', 'normal', 'hard']),
  /** Arena games only; the engine's first variant when absent. */
  variant: z.string().optional(),
  length: z.enum(['short', 'standard', 'long']).optional(),
  /** The rival's final match in the stage: needs the stage's key card, and every other match cleared. */
  duel: z.boolean().optional(),
  intel: z.object({
    /** How the rival plays this game. */
    tendency: text,
    /** The idea that beats it. */
    counter: text,
    /** The lesson the idea comes from. */
    lesson: z.string().optional(),
  }),
});

const stage = z.object({
  id,
  /** `side`: an optional trial, open once the first stage is cleared; it never blocks the bracket. */
  kind: z.enum(['qualifiers', 'arc', 'final', 'side']),
  title: z.string().min(1).max(60),
  /** What the stage is about: "Bluffing and signals". */
  theme: z.string().min(1).max(60),
  rival: id,
  /** The play style a win here counts towards. */
  style: z.enum(STYLES),
  /** Lessons that earn this stage's key card (finishing any one of them). Empty: no key card needed. */
  lessons: z.array(z.string()),
  /** The scene shown the first time the stage opens. */
  intro: lines,
  matches: z.array(match).min(1).max(8),
});

/** Mind Check themes: every form draws two questions from each. */
export const MIND_THEMES = ['signals', 'trust', 'evidence', 'deals', 'long'] as const;

const question = z.object({
  id,
  /** `key`: one of a stage's key-card check questions. `mind`: a Mind Check question. */
  use: z.enum(['key', 'mind']),
  stage: id.optional(),
  theme: z.enum(MIND_THEMES).optional(),
  situation: text.optional(),
  question: text,
  options: z.array(z.object({ id: z.string().min(1).max(8), label: text, correct: z.boolean() })).min(2).max(5),
  /** Shown after answering. */
  explanation: text,
});

const season = z.object({
  id,
  title: z.string().min(1).max(60),
  status: z.enum(['draft', 'live']),
  stages: z.array(stage).min(1).max(12),
});

export const tournamentSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  /**
   * Content revision. Raise it with every published change. The app never installs a document older than the one it
   * ships with, so an outdated server copy can't replace newer bundled content.
   */
  revision: z.number().int().min(1).default(1),
  title: z.string().min(1).max(60),
  tagline: text,
  /** The Host: introduces the tournament; may also be a stage rival. */
  host: id,
  /** What the Host says on a player's first launch, before the first match. */
  welcome: lines.default([]),
  rivals: z.array(rival).min(1).max(24),
  seasons: z.array(season).min(1).max(12),
  /** The Tournament's own questions (key-card checks and the Mind Check), separate from the lesson checkpoints. */
  questions: z.array(question).max(300).default([]),
});

export type TournamentDoc = z.infer<typeof tournamentSchema>;
export type Rival = z.infer<typeof rival>;
export type Season = z.infer<typeof season>;
export type Stage = z.infer<typeof stage>;
export type TournamentMatch = z.infer<typeof match>;
export type TournamentQuestion = z.input<typeof question>;

/** What a stage's match resolves to: the screen to open and the setup to open it with. */
export interface ResolvedMatch extends TournamentMatch {
  stage: Stage;
  variant: string;
  length: 'short' | 'standard' | 'long';
}

const isLesson = (x: string): x is LessonId => (LESSON_IDS as readonly string[]).includes(x);

/** Problems with the document's meaning (the shape has already passed). Empty = usable. */
export function validateTournament(doc: TournamentDoc): string[] {
  const problems: string[] = [];
  const rivals = new Set<string>();
  for (const r of doc.rivals) {
    if (rivals.has(r.id)) problems.push(`rival ${r.id}: duplicate id`);
    rivals.add(r.id);
  }
  if (!rivals.has(doc.host)) problems.push(`host ${doc.host}: not a rival`);
  const ids = new Set<string>();
  const seen = (x: string, what: string) => {
    if (ids.has(x)) problems.push(`${what} ${x}: duplicate id`);
    ids.add(x);
  };
  for (const s of doc.seasons) {
    seen(s.id, 'season');
    if (!s.stages.some((st) => st.kind !== 'side')) problems.push(`season ${s.id}: no bracket stage`);
    for (const st of s.stages) {
      seen(st.id, 'stage');
      if (!rivals.has(st.rival)) problems.push(`stage ${st.id}: unknown rival ${st.rival}`);
      for (const l of st.lessons) if (!isLesson(l)) problems.push(`stage ${st.id}: unknown lesson ${l}`);
      const duels = st.matches.filter((m) => m.duel);
      if (duels.length > 1) problems.push(`stage ${st.id}: more than one duel`);
      if (duels.length === 1 && st.matches[st.matches.length - 1] !== duels[0]) problems.push(`stage ${st.id}: the duel must be the last match`);
      for (const m of st.matches) {
        seen(m.id, 'match');
        if (m.intel.lesson !== undefined && !isLesson(m.intel.lesson)) problems.push(`match ${m.id}: unknown lesson ${m.intel.lesson}`);
        if (m.game.system === 'arena') {
          if (!isArenaId(m.game.id)) {
            problems.push(`match ${m.id}: unknown arena game ${m.game.id}`);
            continue;
          }
          const variants = ARENA_ENGINES[m.game.id].variants as readonly string[];
          if (m.variant !== undefined && !variants.includes(m.variant)) problems.push(`match ${m.id}: ${m.game.id} has no variant ${m.variant}`);
        } else {
          if (!isGameId(m.game.id)) problems.push(`match ${m.id}: unknown classic game ${m.game.id}`);
          if (m.variant !== undefined || m.length !== undefined) problems.push(`match ${m.id}: classic games have no variants or lengths`);
        }
      }
    }
  }
  const stageIds = new Set(doc.seasons.flatMap((s) => s.stages.map((st) => st.id)));
  for (const q of doc.questions) {
    seen(q.id, 'question');
    if (q.options.filter((o) => o.correct).length !== 1) problems.push(`question ${q.id}: needs exactly one correct option`);
    if (q.use === 'key' && (!q.stage || !stageIds.has(q.stage))) problems.push(`question ${q.id}: unknown stage ${q.stage}`);
    if (q.use === 'mind' && !q.theme) problems.push(`question ${q.id}: a Mind Check question needs a theme`);
  }
  return problems;
}

/** Parse and validate a downloaded or bundled document. Null when it can't be used. */
export function parseTournament(raw: unknown): TournamentDoc | null {
  const parsed = tournamentSchema.safeParse(raw);
  if (!parsed.success) return null;
  return validateTournament(parsed.data).length === 0 ? parsed.data : null;
}

/** The season the app plays: the first live one. */
export function liveSeason(doc: TournamentDoc): Season | null {
  return doc.seasons.find((s) => s.status === 'live') ?? null;
}

export function resolveMatch(stage: Stage, m: TournamentMatch): ResolvedMatch {
  const variant = m.variant ?? (m.game.system === 'arena' && isArenaId(m.game.id) ? ARENA_ENGINES[m.game.id].variants[0] : 'standard');
  return { ...m, stage, variant, length: m.length ?? 'standard' };
}
