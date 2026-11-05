import type { EventName, EventProps } from './events.ts';

/**
 * When a match or a lesson starts, finishes and is left — as small state machines, so every edge case is unit-tested
 * in Node (the hooks in hooks.ts only feed them React's renders and unmounts).
 */

export type Emit = <E extends EventName>(name: E, props: EventProps<E>) => void;

const seconds = (ms: number) => Math.max(0, Math.round(ms / 1000));

// ── Matches ───────────────────────────────────────────────────────────────────────────────────────────────────

export type MatchMeta = Pick<EventProps<'game_started'>, 'game_id' | 'system' | 'mode' | 'level' | 'variant' | 'length' | 'mystery' | 'attempt_number'>;

export interface MatchProgress {
  /** Rounds (or turns) played so far. */
  round: number;
  roundsTotal: number;
  /** The result is on screen. */
  finished: boolean;
  outcome: 'win' | 'draw' | 'loss' | null;
}

/**
 * One match screen instance (a rematch is a new instance — the screens remount with a new key).
 * - started: the first update with known meta. Rounds already played → `resumed` (a server match reopened). Already
 *   finished when first seen (looking back at a finished ranked match) → nothing is ever sent for it.
 * - finished: once, when the result shows.
 * - exited: on close, after starting and before the result.
 */
export class MatchTracker {
  private phase: 'waiting' | 'playing' | 'done' | 'ignored' = 'waiting';
  private startedAt = 0;
  private meta: MatchMeta | null = null;
  private progress: MatchProgress = { round: 0, roundsTotal: 0, finished: false, outcome: null };
  private readonly emit: Emit;
  private readonly now: () => number;

  constructor(emit: Emit, now: () => number = Date.now) {
    this.emit = emit;
    this.now = now;
  }

  update(meta: MatchMeta | null, progress: MatchProgress): void {
    if (meta) this.meta = meta;
    this.progress = progress;
    if (this.phase === 'waiting' && this.meta) {
      if (progress.finished) {
        this.phase = 'ignored';
        return;
      }
      this.phase = 'playing';
      this.startedAt = this.now();
      this.emit('game_started', { ...this.meta, resumed: progress.round > 0 });
    }
    if (this.phase === 'playing' && progress.finished) {
      this.phase = 'done';
      this.emit('game_finished', {
        ...this.meta!,
        ...(progress.outcome ? { outcome: progress.outcome } : {}),
        rounds: progress.round,
        duration_s: seconds(this.now() - this.startedAt),
      });
    }
  }

  close(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'done';
    this.emit('game_exited', { ...this.meta!, round: this.progress.round, rounds_total: this.progress.roundsTotal, duration_s: seconds(this.now() - this.startedAt) });
  }
}

// ── Lessons ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface LessonInfo {
  lesson_id: string;
  lesson_number?: number;
  module?: string;
}

/**
 * One lesson screen instance. A run starts when the screen opens (resumed when it opens part-way through) and again
 * when Restart begins a replay after the completion step. A run completes once, at the completion step. Closing the
 * screen during a run that hasn't completed is an exit, with the step reached.
 */
export class LessonTracker {
  private run: { startedAt: number; completed: boolean; isReplay: boolean } | null = null;
  private step = 0;
  private readonly emit: Emit;
  private readonly info: LessonInfo;
  private readonly totalSteps: number;
  /** Whether the lesson was completed before (from the progress store at the moment a run starts). */
  private readonly completedBefore: () => boolean;
  /** The screen the lesson was opened from, at the moment a run starts. */
  private readonly source: () => string | null;
  private readonly now: () => number;

  constructor(opts: { emit: Emit; info: LessonInfo; totalSteps: number; completedBefore: () => boolean; source: () => string | null; now?: () => number }) {
    this.emit = opts.emit;
    this.info = opts.info;
    this.totalSteps = opts.totalSteps;
    this.completedBefore = opts.completedBefore;
    this.source = opts.source;
    this.now = opts.now ?? Date.now;
  }

  private get last(): number {
    return this.totalSteps - 1;
  }

  private begin(resumed: boolean): void {
    const isReplay = this.completedBefore();
    this.run = { startedAt: this.now(), completed: false, isReplay };
    const source = this.source();
    this.emit('lesson_started', { ...this.info, is_replay: isReplay, resumed, ...(source ? { source } : {}) });
  }

  update(step: number): void {
    this.step = step;
    if (!this.run) this.begin(step > 0 && step < this.last);
    else if (this.run.completed && step === 0) this.begin(false);
    const r = this.run!;
    if (step === this.last && !r.completed) {
      r.completed = true;
      this.emit('lesson_completed', { ...this.info, is_replay: r.isReplay, duration_s: seconds(this.now() - r.startedAt) });
    }
  }

  close(): void {
    const r = this.run;
    if (!r || r.completed) return;
    r.completed = true;
    this.emit('lesson_exited', { ...this.info, step: this.step, total_steps: this.totalSteps, duration_s: seconds(this.now() - r.startedAt) });
  }
}
