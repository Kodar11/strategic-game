import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { type LucideIcon, Pause, Play, SkipBack, SkipForward } from '@/src/components/ui/icons';
import { narration } from '@/src/features/audio/narration';
import { AdvanceGate, type GateTiming } from '@/src/stories/playback';
import { radius, space } from '@/src/theme/tokens';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { useStoryAudio } from '../audio/session';
import type { StoryTone } from './kit';

/**
 * Autoplay for a story. `enabled` says the beat may move on when it's finished: the story decides what that means
 * (not at a decision, not before its animation is done), and the gate adds the rest (nobody speaking, sound not paused,
 * no sound sheet open, the app in front). Everything is cancelled when the beat changes or the screen goes away.
 */
export function useAutoAdvance({ beatKey, enabled, timing, onAdvance }: { beatKey: string; enabled: boolean; timing: GateTiming; onAdvance: () => void }) {
  const audioPaused = useStoryAudio((s) => s.paused);
  const sheetOpen = useStoryAudio((s) => s.sheetOpen);
  const latest = useRef(onAdvance);
  useEffect(() => {
    latest.current = onAdvance;
  });
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window === 'undefined') return;
    const sub = AppState.addEventListener('change', (status) => setActive(status === 'active'));
    return () => sub.remove();
  }, []);

  const live = enabled && active && !audioPaused && !sheetOpen;
  const { minMs, breathMs } = timing;
  useEffect(() => {
    if (!live) return;
    const gate = new AdvanceGate(
      // The voice stops when the app leaves the foreground; that must not read as the line having finished.
      () => !!narration.playing || AppState.currentState !== 'active',
      () => latest.current(),
      { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
    );
    const unsubscribe = narration.subscribe(() => gate.speechChanged());
    gate.arm({ minMs, breathMs });
    return () => {
      gate.cancel();
      unsubscribe();
    };
  }, [live, beatKey, minMs, breathMs]);
}

export interface PlaybackBarProps {
  tone: StoryTone;
  /** The arena's squarer, harder-edged control, or the Crossing's quiet round one. */
  variant: 'quiet' | 'arena';
  /** The player's wish: keep moving on when each beat finishes. */
  auto: boolean;
  /** A decision is waiting, so nothing moves for now. `auto` is kept for after it. */
  held: boolean;
  canPrevious: boolean;
  canNext: boolean;
  /** False at the end of the story, where autoplay has nowhere to go. */
  canPlay: boolean;
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
  /** What Next does here, for screen readers ("Submit your rule"). */
  nextLabel?: string;
}

/** Previous, Play or Pause, Next. It takes the place of the Continue button, and it's the same in both stories. */
export function PlaybackBar({ tone, variant, auto, held, canPrevious, canNext, canPlay, onPrevious, onToggle, onNext, nextLabel = 'Next' }: PlaybackBarProps) {
  const reduced = useMotionReduced();
  const moving = auto && !held && canPlay;
  const Icon = moving ? Pause : Play;
  // At a decision the control reads Play. A wish to carry on afterwards is kept, and shown in its colour.
  const waiting = auto && held;
  const label = !canPlay ? 'Autoplay is not available here' : moving ? 'Pause autoplay' : waiting ? 'Autoplay continues after you choose. Turn it off' : held ? 'Continue automatically after you choose' : 'Play automatically';
  const arena = variant === 'arena';
  return (
    <View style={styles.row} accessibilityRole="toolbar" accessibilityLabel="Story playback">
      <Side tone={tone} icon={SkipBack} label="Previous" disabled={!canPrevious} onPress={onPrevious} />
      <Pressable
        onPress={() => {
          haptic.select();
          onToggle();
        }}
        disabled={!canPlay}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !canPlay, checked: auto }}
        hitSlop={4}
        style={({ pressed }) => [
          styles.main,
          arena ? styles.mainArena : null,
          {
            borderColor: moving || waiting ? tone.accent : tone.border,
            backgroundColor: pressed ? tone.border : arena ? tone.panel : 'transparent',
            opacity: canPlay ? 1 : 0.35,
          },
        ]}>
        <Animated.View key={moving ? 'pause' : 'play'} entering={reduced ? undefined : FadeIn.duration(180)}>
          <Icon size={20} color={moving || waiting ? tone.accentText : tone.muted} fill={moving || waiting ? tone.accentText : tone.muted} strokeWidth={1.5} />
        </Animated.View>
      </Pressable>
      <Side tone={tone} icon={SkipForward} label={nextLabel} disabled={!canNext} onPress={onNext} strong />
    </View>
  );
}

function Side({ tone, icon: Icon, label, disabled, onPress, strong }: { tone: StoryTone; icon: LucideIcon; label: string; disabled: boolean; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed }) => [styles.side, pressed ? { backgroundColor: tone.border } : null, { opacity: disabled ? 0.28 : 1 }]}>
      <Icon size={20} color={strong ? tone.accentText : tone.muted} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Wide spacing keeps Previous and Next from being hit by mistake.
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxl, minHeight: 52 },
  main: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mainArena: { borderRadius: radius.md },
  side: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
