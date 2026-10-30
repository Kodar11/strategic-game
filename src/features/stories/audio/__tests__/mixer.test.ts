/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_LEVELS, type MixerClock, type MixerVoice, StoryMixer } from '../mixer.ts';
import { DEFAULT_PREFS, sanitizePrefs } from '../prefs.ts';

class FakeVoice implements MixerVoice {
  volume = -1;
  playing = false;
  released = false;
  history: number[] = [];
  sound: string;
  constructor(sound: string) {
    this.sound = sound;
  }
  setVolume(v: number) {
    this.volume = v;
    this.history.push(v);
  }
  play() {
    assert.ok(!this.released, 'played after release');
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  release() {
    this.released = true;
  }
}

function rig(durations: Record<string, number> = {}) {
  const voices: FakeVoice[] = [];
  let tick: (() => void) | null = null;
  const clock: MixerClock = {
    every: (_ms, fn) => {
      tick = fn;
      return 1;
    },
    clear: () => {
      tick = null;
    },
  };
  const mixer = new StoryMixer(
    {
      create: (sound) => {
        if (sound === 'missing') return null;
        if (sound === 'throws') throw new Error('load failed');
        const v = new FakeVoice(sound);
        voices.push(v);
        return v;
      },
      durationMs: (s) => durations[s] ?? 60_000,
    },
    clock,
  );
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 60) tick?.();
  };
  const live = () => voices.filter((v) => !v.released);
  return { mixer, voices, run, live, ticking: () => tick !== null };
}

const maxStep = (xs: number[]) => xs.slice(1).reduce((m, x, i) => Math.max(m, Math.abs(x - xs[i])), 0);

describe('saved levels', () => {
  it('keeps valid values, clamps the rest, and survives garbage', () => {
    assert.deepEqual(sanitizePrefs(null), DEFAULT_PREFS);
    assert.deepEqual(sanitizePrefs('x'), DEFAULT_PREFS);
    assert.deepEqual(sanitizePrefs({ voice: 0.5, music: 7, ambience: -1, sfx: 'loud', muted: true }), { voice: 0.5, music: 1, ambience: 0, sfx: DEFAULT_PREFS.sfx, muted: true });
  });
});

describe('cues and fades', () => {
  it('starts silent and fades up to the level, never jumping', () => {
    const { mixer, voices, run } = rig();
    mixer.setCue({ music: 'm', beds: {}, fadeMs: 2000 });
    assert.equal(voices[0].volume, 0);
    assert.equal(voices[0].playing, true);
    run(2200);
    assert.ok(Math.abs(voices[0].volume - DEFAULT_LEVELS.music) < 1e-6);
    assert.ok(maxStep(voices[0].history) < 0.05, 'no audible step');
  });

  it('crossfades a music change and releases the old player', () => {
    const { mixer, voices, run, live } = rig();
    mixer.setCue({ music: 'a', beds: {}, fadeMs: 1000 });
    run(1200);
    mixer.setCue({ music: 'b', beds: {}, fadeMs: 1000 });
    assert.equal(voices.length, 2);
    run(500);
    assert.ok(voices[0].volume > 0 && voices[1].volume > 0, 'both audible mid-fade');
    run(800);
    assert.equal(voices[0].released, true);
    assert.deepEqual(live().map((v) => v.sound), ['b']);
  });

  it('repeating a cue on every beat starts nothing new', () => {
    const { mixer, voices, run } = rig();
    const cue = { music: 'm', beds: { wind: 0.6, river: 0.4 } };
    for (let i = 0; i < 20; i++) {
      mixer.setCue(cue);
      run(100);
    }
    assert.equal(voices.length, 3);
  });

  it('silence is a cue: null music fades out and releases, beds carry on', () => {
    const { mixer, voices, run, live } = rig();
    mixer.setCue({ music: 'm', beds: { wind: 0.5 } });
    run(3000);
    mixer.setCue({ music: null, beds: { wind: 0.5 }, fadeMs: 1500 });
    run(1700);
    assert.equal(voices[0].released, true);
    assert.deepEqual(live().map((v) => v.sound), ['wind']);
  });

  it('changes a bed’s level without restarting it', () => {
    const { mixer, voices, run } = rig();
    mixer.setCue({ music: null, beds: { rain: 0.2 }, fadeMs: 100 });
    run(200);
    mixer.setCue({ music: null, beds: { rain: 1 }, fadeMs: 1000 });
    run(1100);
    assert.equal(voices.length, 1);
    assert.ok(Math.abs(voices[0].volume - DEFAULT_LEVELS.ambience) < 1e-6);
  });

  it('skips sounds that can’t load, without disturbing the rest', () => {
    const { mixer, voices, run } = rig();
    mixer.setCue({ music: 'missing', beds: { throws: 1, wind: 1 } });
    mixer.sfx('throws');
    run(100);
    assert.deepEqual(voices.map((v) => v.sound), ['wind']);
  });
});

describe('loops overlap instead of gapping', () => {
  it('hands over to a fresh player before the end, then releases the old one', () => {
    const { mixer, voices, run, live } = rig({ wind: 20_000 });
    mixer.setCue({ music: null, beds: { wind: 1 }, fadeMs: 500 });
    run(15_900);
    assert.equal(voices.length, 1);
    run(300);
    assert.equal(voices.length, 2, 'second player started during the overlap');
    run(2000);
    assert.ok(voices[0].volume > 0 && voices[1].volume > 0, 'both sounding during the overlap');
    run(2500);
    assert.equal(voices[0].released, true);
    assert.equal(live().length, 1);
  });

  it('can loop indefinitely without accumulating players', () => {
    const { mixer, voices, run, live } = rig({ wind: 20_000, m: 30_000 });
    mixer.setCue({ music: 'm', beds: { wind: 1 } });
    for (let i = 0; i < 40; i++) {
      run(10_000);
      assert.ok(live().length <= 4, `live ${live().length}`);
    }
    assert.ok(voices.length > 10);
  });
});

describe('ducking under the voice', () => {
  it('lowers music more than ambience, smoothly, and recovers', () => {
    const { mixer, voices, run } = rig();
    mixer.setCue({ music: 'm', beds: { wind: 1 }, fadeMs: 100 });
    run(200);
    const [music, wind] = voices;
    const full = [music.volume, wind.volume];
    music.history.length = 0;
    mixer.setDucked(true);
    run(600);
    assert.ok(Math.abs(music.volume - full[0] * 0.42) < 1e-6);
    assert.ok(Math.abs(wind.volume - full[1] * 0.72) < 1e-6);
    assert.ok(maxStep(music.history) < 0.1);
    mixer.setDucked(false);
    run(600);
    assert.ok(music.volume < full[0], 'recovers more slowly than it ducks, so gaps between lines do not pump');
    run(1200);
    assert.ok(Math.abs(music.volume - full[0]) < 1e-6);
  });
});

describe('levels, mute and effects', () => {
  it('layers have independent levels, and mute silences all without stopping', () => {
    const { mixer, voices, run } = rig();
    mixer.setCue({ music: 'm', beds: { wind: 1 }, fadeMs: 100 });
    run(200);
    mixer.setLevels({ ...DEFAULT_LEVELS, music: 0.25, ambience: 1 });
    assert.ok(Math.abs(voices[0].volume - 0.25) < 1e-6);
    assert.ok(Math.abs(voices[1].volume - 1) < 1e-6);
    mixer.setLevels({ ...DEFAULT_LEVELS, muted: true });
    assert.deepEqual(voices.map((v) => v.volume), [0, 0]);
    assert.ok(voices.every((v) => v.playing));
  });

  it('an effect plays once at its gain and releases itself', () => {
    const { mixer, voices, run, live } = rig({ rope: 3000 });
    mixer.sfx('rope', 0.5);
    assert.equal(voices[0].volume, 0.5 * DEFAULT_LEVELS.sfx);
    run(3400);
    assert.equal(live().length, 0);
  });

  it('caps simultaneous effects, and plays none while muted or paused', () => {
    const { mixer, voices } = rig();
    for (let i = 0; i < 10; i++) mixer.sfx('tick');
    assert.equal(voices.length, 4);
    const b = rig();
    b.mixer.setLevels({ ...DEFAULT_LEVELS, muted: true });
    b.mixer.sfx('tick');
    b.mixer.setLevels(DEFAULT_LEVELS);
    b.mixer.pause();
    b.mixer.sfx('tick');
    assert.equal(b.voices.length, 0);
  });
});

describe('interruptions and cleanup', () => {
  it('pause holds everything, including fades and the loop clock; resume continues', () => {
    const { mixer, voices, run, ticking } = rig({ wind: 20_000 });
    mixer.setCue({ music: null, beds: { wind: 1 }, fadeMs: 1000 });
    run(500);
    const level = voices[0].volume;
    mixer.pause();
    assert.equal(voices[0].playing, false);
    assert.equal(ticking(), false);
    run(60_000);
    assert.equal(voices[0].volume, level);
    assert.equal(voices.length, 1);
    mixer.resume();
    assert.equal(voices[0].playing, true);
    run(600);
    assert.ok(voices[0].volume > level);
  });

  it('a cue that arrives while paused doesn’t start anything playing', () => {
    const { mixer, voices } = rig();
    mixer.pause();
    mixer.setCue({ music: 'm', beds: {} });
    assert.equal(voices[0].playing, false);
    mixer.resume();
    assert.equal(voices[0].playing, true);
  });

  it('dispose releases every player, and nothing can play afterwards', () => {
    const { mixer, voices, live, ticking } = rig();
    mixer.setCue({ music: 'm', beds: { wind: 1, river: 1 } });
    mixer.sfx('rope');
    mixer.dispose();
    assert.equal(live().length, 0);
    assert.equal(ticking(), false);
    mixer.setCue({ music: 'x', beds: {} });
    mixer.sfx('y');
    mixer.resume();
    assert.equal(voices.length, 4);
  });

  it('fading out releases everything and stops the clock', () => {
    const { mixer, run, live, ticking } = rig();
    mixer.setCue({ music: 'm', beds: { wind: 1 } });
    run(3000);
    mixer.fadeOut(1000);
    run(1200);
    assert.equal(live().length, 0);
    assert.equal(ticking(), false);
  });

  it('a player that throws doesn’t break the mix', () => {
    const { mixer, voices, run } = rig();
    mixer.setCue({ music: 'm', beds: { wind: 1 } });
    voices[0].setVolume = () => {
      throw new Error('native player gone');
    };
    assert.doesNotThrow(() => run(1000));
    assert.ok(voices[1].volume > 0);
  });
});
