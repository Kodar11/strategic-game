/**
 * When may a story move on by itself? The one rule behind autoplay, shared by both stories and tested without a device.
 *
 * A gate is armed for one beat. It fires once, when the beat has been on screen for its minimum time *and* nobody is
 * speaking *and* a short breath has passed since they stopped. If a voice starts or a queued line follows, it waits
 * again. It is the only thing that can advance a story automatically, it holds at most one timer of each kind, and
 * cancelling it (a new beat, a pause, leaving the story, leaving the app) means nothing stale can ever fire.
 */

export interface GateTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

export interface GateTiming {
  /** The least time this beat stays on screen: enough to read it, and for its animation to settle. */
  minMs: number;
  /** The pause after a voice stops, before moving on. */
  breathMs: number;
}

export class AdvanceGate {
  private armed = false;
  private minDone = false;
  private minTimer: unknown = null;
  private breathTimer: unknown = null;
  private timing: GateTiming = { minMs: 0, breathMs: 0 };
  private readonly isSpeaking: () => boolean;
  private readonly onAdvance: () => void;
  private readonly timers: GateTimers;

  constructor(isSpeaking: () => boolean, onAdvance: () => void, timers: GateTimers) {
    this.isSpeaking = isSpeaking;
    this.onAdvance = onAdvance;
    this.timers = timers;
  }

  get isArmed() {
    return this.armed;
  }

  /** Start waiting on the current beat. Replaces anything already pending. */
  arm(timing: GateTiming) {
    this.cancel();
    this.armed = true;
    this.timing = timing;
    this.minTimer = this.timers.set(() => {
      this.minTimer = null;
      this.minDone = true;
      this.check();
    }, timing.minMs);
  }

  cancel() {
    this.armed = false;
    this.minDone = false;
    if (this.minTimer !== null) this.timers.clear(this.minTimer);
    this.minTimer = null;
    this.clearBreath();
  }

  /** Whoever is speaking changed. */
  speechChanged() {
    if (!this.armed) return;
    if (this.isSpeaking()) this.clearBreath();
    else this.check();
  }

  private check() {
    if (!this.armed || !this.minDone || this.breathTimer !== null || this.isSpeaking()) return;
    this.breathTimer = this.timers.set(() => {
      this.breathTimer = null;
      // A voice may have started in the same tick as the timer; never talk over it.
      if (!this.armed || this.isSpeaking()) return;
      this.armed = false;
      this.minDone = false;
      this.onAdvance();
    }, this.timing.breathMs);
  }

  private clearBreath() {
    if (this.breathTimer !== null) this.timers.clear(this.breathTimer);
    this.breathTimer = null;
  }
}

/** About how long a line takes to read silently on a phone, in milliseconds. */
export function readingMs(text: string, { perChar = 62, floor = 2000, cap = 16000 } = {}): number {
  return Math.max(floor, Math.min(cap, text.length * perChar));
}
