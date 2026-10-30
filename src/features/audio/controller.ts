/**
 * Narration controller: one clip at a time, through one player.
 *
 * Playback rules
 * - Requests belong to a *context* (one lesson step). A request from a newer context stops whatever is playing
 *   and clears the queue; a request from an older context is ignored as stale.
 * - Within a context, `queue` requests play in order (several speakers on one screen) and `replace` requests
 *   (reactions to a choice) cut in immediately.
 * - Each line plays at most once per *run* (one mount of a lesson, or one replay of it), keyed by `key`.
 *   Re-renders, React Strict Mode double effects and revisiting a step therefore never repeat a line.
 * - While muted, requests are recorded as heard but not played, so unmuting never replays a backlog.
 * - Every backend callback carries the generation it was started with; callbacks from a clip that has since
 *   been stopped or replaced are dropped.
 *
 * Gameplay never waits on any of this: requests return immediately and failures only skip the line.
 */

export type AudioAsset = number | string | { uri: string };

export interface AudioBackend {
  /** Stop anything current and start `asset`. Call exactly one of the callbacks when it ends or fails. */
  play(asset: AudioAsset, onEnd: () => void, onError: (error: unknown) => void): void;
  stop(): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

export interface NarrationRequest {
  clip: string;
  /** Dedupe key; defaults to the clip id. Use a distinct key to allow the same clip again (e.g. per shot). */
  key?: string;
  run: number;
  context: number;
  mode?: 'queue' | 'replace';
}

interface ControllerOptions {
  createBackend: () => AudioBackend;
  resolveAsset: (clip: string) => AudioAsset | undefined;
  /** Safety net in case a backend never reports the end of a clip. */
  maxClipMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  onWarn?: (message: string) => void;
}

export class NarrationController {
  private backend: AudioBackend | null = null;
  private muted = false;
  private run = 0;
  private context = 0;
  private heard = new Set<string>();
  private queue: string[] = [];
  private current: string | null = null;
  private last: string | null = null;
  private paused = false;
  private generation = 0;
  private watchdog: unknown = null;
  private pendingEnd: { run: number; handle: unknown } | null = null;
  private warned = new Set<string>();
  private readonly opts: Required<Omit<ControllerOptions, 'onWarn'>> & Pick<ControllerOptions, 'onWarn'>;

  constructor(options: ControllerOptions) {
    this.opts = {
      maxClipMs: 45_000,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      ...options,
    };
  }

  get isMuted() {
    return this.muted;
  }
  get playing() {
    return this.current;
  }
  get queued(): readonly string[] {
    return this.queue;
  }

  /** Returns true if the clip started or was queued. */
  request(req: NarrationRequest): boolean {
    if (req.run !== this.run) {
      // A new lesson mount or replay: forget what was heard in the previous run.
      if (req.run < this.run) return false;
      this.run = req.run;
      this.heard.clear();
      this.halt();
    }
    if (req.context < this.context) return false;
    if (req.context > this.context) this.enterContext(req.context);

    const key = req.key ?? req.clip;
    if (this.heard.has(key)) return false;
    this.heard.add(key);
    if (this.muted) return false;

    if (!this.opts.resolveAsset(req.clip)) {
      this.warnOnce(req.clip, `[narration] No bundled audio for "${req.clip}"; showing the line without audio.`);
      return false;
    }

    if (req.mode === 'replace' || !this.current) {
      this.queue = [];
      this.start(req.clip);
    } else {
      this.queue.push(req.clip);
    }
    return true;
  }

  /** A new step became current. Stops narration that belonged to the previous step. */
  enterContext(context: number) {
    if (context <= this.context) return;
    this.context = context;
    this.halt();
  }

  /** Replay a specific line on request (e.g. tapping a dialogue). Ignores dedupe; respects mute. */
  replay(clip?: string): boolean {
    const target = clip ?? this.current ?? this.last;
    if (!target || this.muted || !this.opts.resolveAsset(target)) return false;
    this.queue = [];
    this.start(target);
    return true;
  }

  pause() {
    if (!this.current || this.paused) return;
    this.paused = true;
    this.clearWatchdog();
    this.safely(() => this.backend?.pause());
  }

  resume() {
    if (!this.current || !this.paused || this.muted) return;
    this.paused = false;
    this.armWatchdog(this.generation);
    this.safely(() => this.backend?.resume());
  }

  setMuted(muted: boolean) {
    if (muted === this.muted) return;
    this.muted = muted;
    if (muted) this.halt();
  }

  /** Allow every line of the current run to play again (used when the learner replays a lesson). */
  forgetHeard() {
    this.heard.clear();
  }

  /** Begin a run. Cancels a pending end from a Strict Mode remount of the same run. */
  beginRun(run: number) {
    if (this.pendingEnd && this.pendingEnd.run === run) {
      this.opts.clearTimer(this.pendingEnd.handle);
      this.pendingEnd = null;
    }
  }

  /**
   * The lesson for `run` is going away. Stopping is deferred by a tick so a Strict Mode unmount/remount
   * doesn't cut its own narration; it only stops audio still owned by that run.
   */
  endRun(run: number) {
    if (this.pendingEnd) this.opts.clearTimer(this.pendingEnd.handle);
    const handle = this.opts.setTimer(() => {
      this.pendingEnd = null;
      if (this.run === run) {
        this.context += 1;
        this.halt();
      }
    }, 0);
    this.pendingEnd = { run, handle };
  }

  /** Stop and clear everything now (app backgrounded, etc.). */
  stop() {
    this.halt();
  }

  dispose() {
    this.halt();
    this.safely(() => this.backend?.dispose());
    this.backend = null;
  }

  private start(clip: string) {
    const asset = this.opts.resolveAsset(clip);
    if (!asset) return this.advance();
    const gen = ++this.generation;
    this.current = clip;
    this.last = clip;
    this.paused = false;
    this.armWatchdog(gen);
    try {
      this.backend ??= this.opts.createBackend();
      this.backend.play(
        asset,
        () => this.finished(gen),
        (error) => {
          this.warnOnce(`error:${clip}`, `[narration] Could not play "${clip}": ${String(error)}`);
          this.finished(gen);
        },
      );
    } catch (error) {
      this.warnOnce(`error:${clip}`, `[narration] Could not play "${clip}": ${String(error)}`);
      this.finished(gen);
    }
  }

  private finished(gen: number) {
    if (gen !== this.generation) return;
    this.clearWatchdog();
    this.current = null;
    this.advance();
  }

  private advance() {
    const next = this.queue.shift();
    if (next && !this.muted) this.start(next);
  }

  private halt() {
    this.generation += 1;
    this.queue = [];
    this.clearWatchdog();
    if (this.current) {
      this.current = null;
      this.paused = false;
      this.safely(() => this.backend?.stop());
    }
  }

  private armWatchdog(gen: number) {
    this.clearWatchdog();
    this.watchdog = this.opts.setTimer(() => this.finished(gen), this.opts.maxClipMs);
  }

  private clearWatchdog() {
    if (this.watchdog !== null) this.opts.clearTimer(this.watchdog);
    this.watchdog = null;
  }

  private safely(fn: () => void) {
    try {
      fn();
    } catch (error) {
      this.warnOnce(`backend:${String(error)}`, `[narration] Audio backend error: ${String(error)}`);
    }
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.opts.onWarn?.(message);
  }
}

let counter = 0;
/** Monotonic ids for runs and contexts, shared so ordering holds across lessons. */
export function nextNarrationId(): number {
  counter += 1;
  return counter;
}
