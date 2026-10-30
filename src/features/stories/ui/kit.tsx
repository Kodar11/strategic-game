import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, BookOpen, RotateCcw, X } from '@/src/components/ui/icons';
import { MAX_CONTENT_WIDTH, radius, space } from '@/src/theme/tokens';
import { haptic } from '@/src/utils/feedback';

/**
 * Pieces shared by both stories. Each story passes its own palette, so the two keep their own atmosphere while
 * controls behave identically (sizes, labels, haptics, reduced motion).
 */

export interface StoryTone {
  bg: string;
  panel: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
}

export function leaveStory() {
  if (router.canGoBack()) router.back();
  else router.replace('/stories');
}

/** Close button and the current chapter, laid over the top of the story. */
export function StoryTopBar({ tone, title, progress, total }: { tone: StoryTone; title: string; progress: number; total: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.top, { paddingTop: insets.top + space.xs }]} pointerEvents="box-none">
      <Pressable
        onPress={leaveStory}
        accessibilityRole="button"
        accessibilityLabel="Leave the story. Your place is saved."
        hitSlop={8}
        style={({ pressed }) => [styles.close, { backgroundColor: pressed ? tone.panel : 'rgba(0,0,0,0.35)', borderColor: tone.border }]}>
        <X size={18} color={tone.text} />
      </Pressable>
      <View style={[styles.chip, { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: tone.border }]} accessibilityRole="header">
        <AppText variant="caption" color={tone.text} numberOfLines={1}>
          {title}
        </AppText>
      </View>
      <View style={styles.dots} accessible accessibilityLabel={`Part ${progress + 1} of ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i <= progress ? tone.accent : 'rgba(255,255,255,0.22)' }]} />
        ))}
      </View>
    </View>
  );
}

/** A large, two-line choice: what you do, and what it means. */
export function OptionButton({ tone, label, detail, onPress, selected, disabled }: { tone: StoryTone; label: string; detail?: string; onPress: () => void; selected?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        haptic.commit();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: selected ? tone.accent : pressed ? tone.border : tone.panel, borderColor: selected ? tone.accent : tone.border, opacity: disabled && !selected ? 0.5 : 1 },
      ]}>
      <AppText variant="bodyStrong" color={selected ? tone.bg : tone.text}>
        {label}
      </AppText>
      {detail ? (
        <AppText variant="small" color={selected ? tone.bg : tone.muted}>
          {detail}
        </AppText>
      ) : null}
    </Pressable>
  );
}

export function ContinueButton({ tone, label = 'Continue', onPress, disabled }: { tone: StoryTone; label?: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.continue, { backgroundColor: pressed ? tone.border : tone.panel, borderColor: tone.border, opacity: disabled ? 0.4 : 1 }]}>
      <AppText variant="bodyStrong" color={tone.accentText}>
        {label}
      </AppText>
      <ArrowRight size={18} color={tone.accentText} />
    </Pressable>
  );
}

export interface ReflectionContent {
  /** The quiet closing paragraphs. */
  message: string[];
  takeaways: { title: string; body: string }[];
  question: string;
}

/**
 * The shared closing reflection: a quiet message, three takeaways, one open question, then replay or the library.
 * Nothing is scored or asked of the player. `before` is the story's own look back (its ledger or its results).
 */
export function Reflection({ tone, content, before, onReplay }: { tone: StoryTone; content: ReflectionContent; before?: ReactNode; onReplay: () => void }) {
  const insets = useSafeAreaInsets();
  const enter = useEnter();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: tone.bg }} contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + space.huge, paddingBottom: insets.bottom + space.huge }}>
      <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: space.xl }}>
        {before}
        <View style={{ gap: space.lg }}>
          {content.message.map((p, i) => (
            <Animated.View key={i} entering={enter(200 + i * 500, 'fade')}>
              <AppText variant={i === 0 ? 'heading' : 'body'} color={i === 0 ? tone.text : tone.muted} style={i === 0 ? { lineHeight: 28 } : undefined}>
                {p}
              </AppText>
            </Animated.View>
          ))}
        </View>
        <Animated.View entering={enter(200 + content.message.length * 500, 'fade')} style={{ gap: space.md }}>
          {content.takeaways.map((t, i) => (
            <View key={t.title} style={[styles.takeaway, { borderColor: tone.border, backgroundColor: tone.panel }]}>
              <AppText variant="overline" color={tone.accentText}>
                {i + 1}
              </AppText>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong" color={tone.text}>
                  {t.title}
                </AppText>
                <AppText variant="small" color={tone.muted}>
                  {t.body}
                </AppText>
              </View>
            </View>
          ))}
        </Animated.View>
        <Animated.View entering={enter(400 + content.message.length * 500, 'fade')} style={[styles.question, { borderColor: tone.accent }]}>
          <AppText variant="overline" color={tone.accentText}>
            Something to carry with you
          </AppText>
          <AppText variant="heading" color={tone.text} style={{ lineHeight: 28 }}>
            {content.question}
          </AppText>
          <AppText variant="small" color={tone.muted}>
            No need to answer here. It’s only for you.
          </AppText>
        </Animated.View>
        <View style={{ gap: space.sm }}>
          <Button label="Back to Stories" icon={BookOpen} iconPosition="left" onPress={leaveStory} />
          <Button label="Play it again" variant="secondary" icon={RotateCcw} iconPosition="left" onPress={onReplay} accessibilityHint="Starts the story from the beginning. Different choices lead somewhere different." />
        </View>
      </View>
    </ScrollView>
  );
}

/** Opening card for a story: title, a line of premise, begin / resume / start over. */
export function StoryIntro({ tone, kicker, title, premise, art, resumeLabel, onBegin, onRestart }: { tone: StoryTone; kicker: string; title: string; premise: string; art: ReactNode; resumeLabel?: string; onBegin: () => void; onRestart?: () => void }) {
  const insets = useSafeAreaInsets();
  const enter = useEnter();
  return (
    <View style={{ flex: 1, backgroundColor: tone.bg }}>
      {art}
      <View style={[styles.introText, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: space.md }}>
          <Animated.View entering={enter(150, 'fade')} style={{ gap: space.xs }}>
            <AppText variant="overline" color={tone.accentText}>
              {kicker}
            </AppText>
            <AppText variant="display" color={tone.text} accessibilityRole="header">
              {title}
            </AppText>
            <AppText color={tone.muted}>{premise}</AppText>
          </Animated.View>
          <Animated.View entering={enter(450, 'fade')} style={{ gap: space.sm, marginTop: space.sm }}>
            <Button label={resumeLabel ? 'Continue' : 'Begin'} kicker={resumeLabel} onPress={onBegin} />
            {onRestart ? <Button label="Start over" variant="ghost" onPress={onRestart} /> : null}
          </Animated.View>
        </View>
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }} pointerEvents="box-none">
        <View style={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.lg }}>
          <Pressable onPress={leaveStory} accessibilityRole="button" accessibilityLabel="Back to Stories" hitSlop={8} style={[styles.close, { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: tone.border }]}>
            <X size={18} color={tone.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, zIndex: 10 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  chip: { flexShrink: 1, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  dots: { marginLeft: 'auto', flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  option: { minHeight: 56, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: space.lg, paddingVertical: space.md, gap: 2, justifyContent: 'center' },
  continue: { minHeight: 52, borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg },
  takeaway: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  question: { borderLeftWidth: 3, paddingLeft: space.lg, gap: space.sm, paddingVertical: space.xs },
  introText: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.xl },
});
