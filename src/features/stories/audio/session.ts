import AsyncStorage from '@react-native-async-storage/async-storage';
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { narration } from '@/src/features/audio/narration';
import { STORY_SOUNDS, type StorySound } from './assets';
import { DEFAULT_LEVELS, type MixCue, type MixerVoice, StoryMixer } from './mixer';
import { DEFAULT_PREFS as PREF_DEFAULTS, type StoryAudioPrefs, sanitizePrefs } from './prefs';

/**
 * One story's sound, from opening it to leaving it: creates the mixer, keeps it under the narration, and makes sure no
 * player outlives the screen. The voice on/off preference is the app's existing one (Settings → Narration), so lessons
 * and stories can't disagree; the levels here only apply inside stories.
 */

const KEY = 'tactiqo/story-audio/v1';

interface StoryAudioState extends StoryAudioPrefs {
  /** The story's sound is paused by the player. */
  paused: boolean;
  /** A voice is playing now. */
  speaking: boolean;
  /** The sound settings are open; the story waits. */
  sheetOpen: boolean;
  setPrefs: (patch: Partial<StoryAudioPrefs>) => void;
  setPaused: (paused: boolean) => void;
  replayLine: () => void;
}

let mixer: StoryMixer | null = null;
let endTimer: ReturnType<typeof setTimeout> | null = null;
let lastCue: MixCue | null = null;

export const useStoryAudio = create<StoryAudioState>()((set, get) => ({
  ...PREF_DEFAULTS,
  paused: false,
  speaking: false,
  sheetOpen: false,
  setPrefs: (patch) => {
    set(patch);
    const { voice, music, ambience, sfx, muted } = get();
    AsyncStorage.setItem(KEY, JSON.stringify({ voice, music, ambience, sfx, muted })).catch(() => undefined);
    applyLevels();
  },
  setPaused: (paused) => {
    if (paused === get().paused) return;
    set({ paused });
    if (paused) {
      narration.pause();
      mixer?.pause();
    } else {
      mixer?.resume();
      narration.resume();
    }
  },
  replayLine: () => {
    get().setPaused(false);
    narration.replay();
  },
}));

function applyLevels() {
  const { voice, music, ambience, sfx, muted } = useStoryAudio.getState();
  mixer?.setLevels({ music, ambience, sfx, muted });
  narration.setVolume(muted ? 0 : voice);
}

function createVoice(sound: string): MixerVoice | null {
  const entry = STORY_SOUNDS[sound as StorySound];
  if (!entry) return null;
  // Nothing here needs progress events; a long interval keeps these players from waking the JS thread.
  const player: AudioPlayer = createAudioPlayer(entry.source, { updateInterval: 2000 });
  return {
    setVolume: (v) => {
      player.volume = v;
    },
    play: () => player.play(),
    pause: () => player.pause(),
    release: () => player.remove(),
  };
}

function newMixer() {
  const m = new StoryMixer(
    { create: createVoice, durationMs: (s) => STORY_SOUNDS[s as StorySound]?.durationMs ?? 0 },
    { every: (ms, fn) => setInterval(fn, ms), clear: (h) => clearInterval(h as ReturnType<typeof setInterval>) },
  );
  m.setLevels(DEFAULT_LEVELS);
  return m;
}

/** Start or restart a story's sound. Cancels a pending end, so a quick remount doesn't cut it. */
function begin() {
  if (endTimer) {
    clearTimeout(endTimer);
    endTimer = null;
    return;
  }
  mixer?.dispose();
  mixer = newMixer();
  lastCue = null;
  useStoryAudio.setState({ paused: false, speaking: !!narration.playing });
  setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'duckOthers' }).catch(() => undefined);
  applyLevels();
}

/** The story is going away. Deferred by a tick (Strict Mode remounts), then a short fade, then every player is freed. */
function end() {
  if (endTimer) clearTimeout(endTimer);
  endTimer = setTimeout(() => {
    endTimer = null;
    const leaving = mixer;
    mixer = null;
    lastCue = null;
    narration.resume();
    narration.setVolume(1);
    useStoryAudio.setState({ paused: false });
    leaving?.fadeOut(700);
    setTimeout(() => leaving?.dispose(), 900);
  }, 0);
}

const sameBeds = (a: MixCue['beds'], b: MixCue['beds']) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/** Moves the mix. Safe to call on every beat: an unchanged cue does nothing. */
export function storyCue(cue: MixCue) {
  if (!mixer) return;
  if (lastCue && lastCue.music === cue.music && lastCue.musicLevel === cue.musicLevel && sameBeds(lastCue.beds, cue.beds)) return;
  lastCue = cue;
  mixer.setCue(cue);
}

export function storySfx(sound: StorySound, gain = 1) {
  mixer?.sfx(sound, gain);
}

// Under the voice, the world steps back a little.
narration.subscribe(() => {
  const speaking = !!narration.playing && !narration.isPaused;
  if (useStoryAudio.getState().speaking !== speaking) useStoryAudio.setState({ speaking });
  mixer?.setDucked(!!narration.playing);
});

// Leaving the app: hold everything (narration.ts stops the voice), and pick up where it left off on return.
if (Platform.OS !== 'web' || typeof window !== 'undefined') {
  AppState.addEventListener('change', (status) => {
    if (!mixer) return;
    if (status !== 'active') mixer.pause();
    else if (!useStoryAudio.getState().paused) {
      mixer.resume();
      narration.resumeInterrupted();
    }
  });
}

/** Keeps a story's sound alive while the calling screen is mounted, and loads the saved levels. */
export function useStoryAudioSession() {
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (live && raw) useStoryAudio.setState(sanitizePrefs(JSON.parse(raw)));
        applyLevels();
      })
      .catch(() => undefined);
    begin();
    return () => {
      live = false;
      end();
    };
  }, []);
}
