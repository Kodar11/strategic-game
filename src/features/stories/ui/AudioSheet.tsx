import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { type LucideIcon, Pause, Play, RotateCcw, Volume2, VolumeX } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { useProgress } from '@/src/store/progress';
import { radius, space } from '@/src/theme/tokens';
import { useStoryAudio } from '../audio/session';
import type { StoryTone } from './kit';

const percent = (v: number) => `${Math.round(v * 100)}%`;

/** A small speaker in the corner of the story. Everything else stays out of the way until it is asked for. */
export function AudioButton({ tone }: { tone: StoryTone }) {
  const [open, setOpen] = useState(false);
  const muted = useStoryAudio((s) => s.muted);
  const paused = useStoryAudio((s) => s.paused);
  const Icon = muted ? VolumeX : paused ? Pause : Volume2;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Sound settings.${muted ? ' Sound is muted.' : paused ? ' Sound is paused.' : ''}`}
        hitSlop={8}
        style={({ pressed }) => [styles.icon, { backgroundColor: pressed ? tone.panel : 'rgba(0,0,0,0.35)', borderColor: tone.border }]}>
        <Icon size={18} color={tone.text} />
      </Pressable>
      {open ? <AudioSheet tone={tone} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function AudioSheet({ tone, onClose }: { tone: StoryTone; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const audio = useStoryAudio();
  const narrationOn = useProgress((s) => s.settings.narration);
  const setSetting = useProgress((s) => s.setSetting);
  const row = (label: string, value: number, key: 'voice' | 'music' | 'ambience' | 'sfx') => (
    <Slider label={label} value={value} min={0} max={1} step={0.1} formatValue={percent} onChange={(v) => audio.setPrefs({ [key]: v })} />
  );
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close sound settings" />
      <View style={[styles.sheet, { backgroundColor: tone.bg, borderColor: tone.border, paddingBottom: insets.bottom + space.lg }]} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={{ gap: space.lg, padding: space.xl }}>
          <AppText variant="heading" color={tone.text} accessibilityRole="header">
            Sound
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Action tone={tone} icon={audio.paused ? Play : Pause} label={audio.paused ? 'Resume' : 'Pause'} onPress={() => audio.setPaused(!audio.paused)} />
            <Action tone={tone} icon={RotateCcw} label="Hear line again" onPress={audio.replayLine} disabled={!narrationOn} />
          </View>
          <Toggle tone={tone} label="Narration and voices" hint="Also in Settings. Applies to lessons too." value={narrationOn} onChange={(v) => setSetting('narration', v)} />
          <Toggle tone={tone} label="Mute all story sound" value={audio.muted} onChange={(v) => audio.setPrefs({ muted: v })} />
          <View style={{ gap: space.md, opacity: audio.muted ? 0.45 : 1 }} pointerEvents={audio.muted ? 'none' : 'auto'}>
            {row('Voice', audio.voice, 'voice')}
            {row('Music', audio.music, 'music')}
            {row('Surroundings', audio.ambience, 'ambience')}
            {row('Effects', audio.sfx, 'sfx')}
          </View>
          <AppText variant="caption" color={tone.muted}>
            Everything that happens is also shown on screen. The stories work with the sound off.
          </AppText>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Action({ tone, icon: Icon, label, onPress, disabled }: { tone: StoryTone; icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.action, { backgroundColor: pressed ? tone.border : tone.panel, borderColor: tone.border, opacity: disabled ? 0.45 : 1 }]}>
      <Icon size={18} color={tone.accentText} />
      <AppText variant="small" weight="semibold" color={tone.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Toggle({ tone, label, hint, value, onChange }: { tone: StoryTone; label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 }}>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" color={tone.text}>
          {label}
        </AppText>
        {hint ? (
          <AppText variant="caption" color={tone.muted}>
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: tone.accent, false: tone.border }} thumbColor={tone.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '86%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1 },
  action: { flex: 1, minHeight: 48, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.sm },
});
