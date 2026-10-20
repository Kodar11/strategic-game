import { router } from 'expo-router';
import { ArrowLeft, ArrowRight, X } from '@/src/components/ui/icons';
import { type ReactNode, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Backdrop } from '@/src/components/ui/Backdrop';
import { AppText } from '@/src/components/ui/AppText';
import { Button, IconButton } from '@/src/components/ui/Button';
import type { LessonMeta } from '@/src/content/lessons';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

export interface StepDef {
  key: string;
  render: () => ReactNode;
  /** Primary action label. Defaults to "Continue". */
  cta?: string;
  /** Whether the learner may advance. Defaults to true. */
  canContinue?: boolean;
  /** Short explanation shown when the primary action is disabled. */
  blockedHint?: string;
  /** Runs before advancing — used to commit a decision. Return false to stay on this step. */
  onContinue?: () => boolean | void;
  hideBack?: boolean;
}

export function exitLesson() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Shared lesson chrome: header, progress, animated step body and a single primary action. */
export function LessonShell({
  lesson,
  steps,
  step,
  goTo,
}: {
  lesson: LessonMeta;
  steps: StepDef[];
  step: number;
  goTo: (n: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useMotionReduced();
  const scrollRef = useRef<ScrollView>(null);
  const lock = useRef(false);
  const current = steps[Math.min(step, steps.length - 1)];
  const isFinal = step === steps.length - 1;
  const canContinue = current.canContinue ?? true;

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  const progress = useAnimatedStyle(() => ({
    transform: [{ scaleX: withTiming((step + 1) / steps.length, { duration: reduced ? 0 : 320 }) }],
  }));

  const advance = () => {
    // Guard against double taps committing a decision twice.
    if (lock.current || !canContinue) return;
    lock.current = true;
    setTimeout(() => (lock.current = false), 350);
    if (current.onContinue?.() === false) return;
    haptic.commit();
    goTo(step + 1);
  };

  return (
    <View style={styles.root}>
      <Backdrop warm={0.08} />
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.headerRow}>
          <IconButton icon={X} label="Leave lesson. Your progress is saved." onPress={exitLesson} />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
              Lesson {lesson.number} · {lesson.title}
            </AppText>
            <View
              style={styles.track}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`Step ${step + 1} of ${steps.length}`}
              accessibilityValue={{ min: 1, max: steps.length, now: step + 1 }}>
              <Animated.View style={[styles.fill, progress]} />
            </View>
          </View>
          <AppText variant="caption" color={colors.textMuted} tabular style={{ width: 44, textAlign: 'right' }}>
            {step + 1}/{steps.length}
          </AppText>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: space.xxxl }]}
        keyboardShouldPersistTaps="handled">
        <Animated.View key={current.key} entering={reduced ? undefined : FadeIn.duration(220)} style={styles.content}>
          {current.render()}
        </Animated.View>
      </ScrollView>

      {!isFinal ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <View style={styles.footerInner}>
            {!canContinue && current.blockedHint ? (
              <AppText variant="small" color={colors.textMuted} align="center" style={{ marginBottom: space.sm }}>
                {current.blockedHint}
              </AppText>
            ) : null}
            <View style={styles.footerRow}>
              {step > 0 && !current.hideBack ? (
                <Button label="Back" variant="secondary" icon={ArrowLeft} iconPosition="left" onPress={() => goTo(step - 1)} style={{ minWidth: 104 }} />
              ) : null}
              <Button
                label={current.cta ?? 'Continue'}
                icon={ArrowRight}
                onPress={advance}
                disabled={!canContinue}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceHigh, marginTop: 6, overflow: 'hidden' },
  fill: { height: '100%', width: '100%', backgroundColor: colors.primary, borderRadius: 2, transformOrigin: 'left' },
  body: { paddingHorizontal: space.lg, paddingTop: space.xl },
  content: { gap: space.lg, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(8,18,32,0.94)',
  },
  footerInner: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  footerRow: { flexDirection: 'row', gap: space.sm },
});
