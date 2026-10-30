import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import type { AudioAsset, AudioBackend } from './controller';

/**
 * The single expo-audio player behind all narration. Created lazily on the first clip and reused by
 * swapping its source, so there is never more than one player or more than one voice at a time.
 */
export function createExpoBackend(): AudioBackend {
  let player: AudioPlayer | null = null;
  let subscription: { remove: () => void } | null = null;
  let handlers: { onEnd: () => void; onError: (e: unknown) => void } | null = null;
  let volume = 1;

  setAudioModeAsync({
    // Narration is part of the lesson and has its own in-app mute.
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'duckOthers',
  }).catch(() => undefined);

  const ensure = () => {
    if (player) return player;
    player = createAudioPlayer(null, { updateInterval: 250 });
    player.volume = volume;
    subscription = player.addListener('playbackStatusUpdate', (status) => {
      // A late "finished" from the previous source would arrive near its start position; ignore it.
      const early = status.duration > 0 && status.currentTime + 0.5 < status.duration;
      if (status.didJustFinish && !early && handlers) {
        const h = handlers;
        handlers = null;
        h.onEnd();
      }
    });
    return player;
  };

  return {
    play(asset: AudioAsset, onEnd, onError) {
      const p = ensure();
      handlers = { onEnd, onError };
      try {
        p.replace(asset);
        p.play();
      } catch (error) {
        handlers = null;
        onError(error);
      }
    },
    stop() {
      handlers = null;
      player?.pause();
    },
    pause() {
      player?.pause();
    },
    resume() {
      player?.play();
    },
    setVolume(v) {
      volume = v;
      if (player) player.volume = v;
    },
    dispose() {
      handlers = null;
      subscription?.remove();
      subscription = null;
      player?.remove();
      player = null;
    },
  };
}
