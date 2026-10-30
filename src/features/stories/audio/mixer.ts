/**
 * The Stories mixer: music, ambience and effects as separate layers under the narration.
 *
 * Everything is a *track* with a target level; a tick moves each level towards its target, so nothing ever starts or
 * stops abruptly. Looping beds are played by two overlapping players rather than the player's own loop: an MP3 has
 * padding at both ends, so a native loop has an audible gap, while an overlap has none and also hides the seam of a
 * field recording. Durations come from the generated asset list.
 *
 * Pure: the player and the clock are injected, so fades, loops, ducking and cleanup are tested without a device.
 */

export interface MixerVoice {
  setVolume(volume: number): void;
  play(): void;
  pause(): void;
  release(): void;
}

export interface MixerBackend {
  /** Create a player for a sound, or return null if it can't be loaded (the sound is then simply skipped). */
  create(sound: string): MixerVoice | null;
  durationMs(sound: string): number;
}

export interface MixerClock {
  every(ms: number, fn: () => void): unknown;
  clear(handle: unknown): void;
}

export interface MixLevels {
  /** 0–1 per layer. */
  music: number;
  ambience: number;
  sfx: number;
  /** Silences all three (and, in the session, the voice). */
  muted: boolean;
}

export const DEFAULT_LEVELS: MixLevels = { music: 0.6, ambience: 0.75, sfx: 0.8, muted: false };

export interface MixCue {
  /** The music to be playing, or null for silence. A change crossfades. */
  music: string | null;
  /** The ambience beds to be playing, each with its level (0–1). Beds not listed fade out. */
  beds: Readonly<Record<string, number>>;
  /** How quickly this change lands. A slow fade is itself direction; a storm arriving should not be instant. */
  fadeMs?: number;
  /** Scales the music, for moments that should sit lower without changing the piece. */
  musicLevel?: number;
}

type Layer = 'music' | 'ambience';

interface Track {
  sound: string;
  layer: Layer;
  voice: MixerVoice;
  level: number;
  target: number;
  /** Level units per millisecond. */
  rate: number;
  elapsed: number;
  duration: number;
  /** Set once this track's overlap partner has started. */
  handedOver: boolean;
}

interface OneShot {
  voice: MixerVoice;
  gain: number;
  left: number;
}

const TICK_MS = 60;
/** How long consecutive plays of a looped sound overlap. */
const LOOP_OVERLAP_MS: Record<Layer, number> = { music: 6000, ambience: 4000 };
/** While someone is speaking, the layers beneath sit lower. Effects keep their level: they mark events. */
const DUCK: Record<Layer, number> = { music: 0.42, ambience: 0.72 };
/** Quick to step back for a voice, slow to return, so the gaps between lines don't pump. */
const DUCK_ATTACK = 1 / 350;
const DUCK_RELEASE = 1 / 1600;
const DEFAULT_FADE_MS = 2200;
/** A hard limit on simultaneous players, far above normal use: nothing should ever be able to pile up. */
const MAX_TRACKS = 8;
const MAX_ONE_SHOTS = 4;

export class StoryMixer {
  private tracks: Track[] = [];
  private shots: OneShot[] = [];
  private levels: MixLevels = DEFAULT_LEVELS;
  private cue: MixCue = { music: null, beds: {} };
  private ducked = false;
  private duck = 1;
  private paused = false;
  private disposed = false;
  private timer: unknown = null;
  private readonly backend: MixerBackend;
  private readonly clock: MixerClock;

  constructor(backend: MixerBackend, clock: MixerClock) {
    this.backend = backend;
    this.clock = clock;
  }

  get activeSounds(): string[] {
    return this.tracks.filter((t) => t.target > 0).map((t) => t.sound);
  }
  get voiceCount() {
    return this.tracks.length + this.shots.length;
  }
  get isPaused() {
    return this.paused;
  }

  /** Moves the mix to a new cue. Repeating the current cue changes nothing, so it is safe to call on every beat. */
  setCue(cue: MixCue) {
    if (this.disposed) return;
    this.cue = cue;
    const fade = Math.max(1, cue.fadeMs ?? DEFAULT_FADE_MS);
    const wanted = new Map<string, { layer: Layer; level: number }>();
    if (cue.music) wanted.set(cue.music, { layer: 'music', level: cue.musicLevel ?? 1 });
    for (const [sound, level] of Object.entries(cue.beds)) if (level > 0) wanted.set(sound, { layer: 'ambience', level });

    for (const track of this.tracks) {
      const w = wanted.get(track.sound);
      if (w) {
        if (!track.handedOver) this.aim(track, w.level, fade);
      } else this.aim(track, 0, fade);
    }
    for (const [sound, w] of wanted) {
      if (!this.tracks.some((t) => t.sound === sound && !t.handedOver)) this.start(sound, w.layer, w.level, fade);
    }
    this.ensureTicking();
    this.apply();
  }

  /** Plays an effect once, at `gain` of the effects level. Dropped while paused: an effect belongs to its moment. */
  sfx(sound: string, gain = 1) {
    if (this.disposed || this.paused || this.levels.muted || this.shots.length >= MAX_ONE_SHOTS) return;
    let voice: MixerVoice | null = null;
    try {
      voice = this.backend.create(sound);
    } catch {
      voice = null;
    }
    if (!voice) return;
    const shot = { voice, gain, left: this.backend.durationMs(sound) + 200 };
    this.shots.push(shot);
    this.safely(() => voice.setVolume(gain * this.levels.sfx));
    this.safely(() => voice.play());
    this.ensureTicking();
  }

  setLevels(levels: MixLevels) {
    this.levels = levels;
    this.apply();
  }

  /** Someone started or stopped speaking. */
  setDucked(ducked: boolean) {
    if (ducked === this.ducked) return;
    this.ducked = ducked;
    this.ensureTicking();
  }

  pause() {
    if (this.paused || this.disposed) return;
    this.paused = true;
    for (const t of this.tracks) this.safely(() => t.voice.pause());
    for (const s of this.shots) this.safely(() => s.voice.pause());
    this.stopTicking();
  }

  resume() {
    if (!this.paused || this.disposed) return;
    this.paused = false;
    for (const t of this.tracks) this.safely(() => t.voice.play());
    for (const s of this.shots) this.safely(() => s.voice.play());
    this.ensureTicking();
  }

  /** Fade everything out; players are released as they reach silence. */
  fadeOut(ms = 1200) {
    this.setCue({ music: null, beds: {}, fadeMs: ms });
  }

  /** Stop and release everything now. Nothing plays after this, and the mixer can't be restarted. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopTicking();
    for (const t of this.tracks) this.release(t.voice);
    for (const s of this.shots) this.release(s.voice);
    this.tracks = [];
    this.shots = [];
  }

  private start(sound: string, layer: Layer, target: number, fade: number) {
    if (this.tracks.length >= MAX_TRACKS) return;
    let voice: MixerVoice | null = null;
    try {
      voice = this.backend.create(sound);
    } catch {
      voice = null;
    }
    if (!voice) return;
    const track: Track = { sound, layer, voice, level: 0, target, rate: target / fade, elapsed: 0, duration: this.backend.durationMs(sound), handedOver: false };
    this.tracks.push(track);
    this.safely(() => voice.setVolume(0));
    if (!this.paused) this.safely(() => voice.play());
  }

  private aim(track: Track, target: number, fade: number) {
    if (track.target === target) return;
    track.target = target;
    track.rate = Math.max(Math.abs(target - track.level) / fade, 1e-6);
  }

  private tick = () => {
    const dt = TICK_MS;
    const duckTarget = this.ducked ? 0 : 1;
    this.duck += Math.max(-DUCK_ATTACK * dt, Math.min(DUCK_RELEASE * dt, duckTarget - this.duck));

    for (const track of [...this.tracks]) {
      track.elapsed += dt;
      const delta = track.target - track.level;
      track.level += Math.sign(delta) * Math.min(Math.abs(delta), track.rate * dt);
      const overlap = LOOP_OVERLAP_MS[track.layer];
      // Hand over to a fresh player before this one ends, unless it's already on its way out.
      if (!track.handedOver && track.target > 0 && track.duration > overlap * 2 && track.elapsed >= track.duration - overlap) {
        track.handedOver = true;
        const level = track.target;
        this.aim(track, 0, overlap);
        this.start(track.sound, track.layer, level, overlap);
      }
      const finished = track.elapsed >= track.duration + 400;
      if ((track.level <= 0 && track.target <= 0) || finished) {
        this.release(track.voice);
        this.tracks.splice(this.tracks.indexOf(track), 1);
      }
    }
    for (const shot of [...this.shots]) {
      shot.left -= dt;
      if (shot.left <= 0) {
        this.release(shot.voice);
        this.shots.splice(this.shots.indexOf(shot), 1);
      }
    }
    this.apply();
    const settled = this.tracks.length === 0 && this.shots.length === 0 && this.duck === duckTarget;
    if (settled) this.stopTicking();
  };

  private apply() {
    const master = this.levels.muted ? 0 : 1;
    for (const t of this.tracks) {
      const duck = 1 - (1 - DUCK[t.layer]) * (1 - this.duck);
      const layer = t.layer === 'music' ? this.levels.music : this.levels.ambience;
      this.safely(() => t.voice.setVolume(Math.max(0, Math.min(1, t.level * layer * duck * master))));
    }
    for (const s of this.shots) this.safely(() => s.voice.setVolume(s.gain * this.levels.sfx * master));
  }

  private ensureTicking() {
    if (this.timer === null && !this.paused && !this.disposed) this.timer = this.clock.every(TICK_MS, this.tick);
  }

  private stopTicking() {
    if (this.timer !== null) this.clock.clear(this.timer);
    this.timer = null;
  }

  private release(voice: MixerVoice) {
    this.safely(() => voice.pause());
    this.safely(() => voice.release());
  }

  /** A failed player must never take the story down: audio is an enhancement, the story works without it. */
  private safely(fn: () => void) {
    try {
      fn();
    } catch {
      // Skipped: the rest of the mix carries on.
    }
  }
}
