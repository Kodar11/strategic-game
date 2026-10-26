import { CircleCheck, CircleX, Crosshair } from '@/src/components/ui/icons';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { colors, radius, space } from '@/src/theme/tokens';
import { useEnter } from './motion';
import { FeedbackPanel } from './Panels';
import type { Verdict } from './verdict';

export interface PredictionOption<T extends string> {
  id: T;
  label: string;
  description?: string;
}

/**
 * Ask the learner to commit to a prediction before anything is revealed. Styled in cyan with a crosshair
 * so it never reads as a decision (blue/orange) or as an explanation (amber).
 * Once locked, only the chosen answer is shown, so it stays legible for the comparison that follows.
 */
export function PredictionPrompt<T extends string>({
  label = 'Your prediction',
  question,
  options,
  value,
  onChange,
  locked,
  layout = 'column',
  delay = 0,
}: {
  label?: string;
  question: string;
  options: readonly PredictionOption<T>[];
  value: T | null;
  onChange: (id: T) => void;
  locked?: boolean;
  layout?: 'row' | 'column';
  delay?: number;
}) {
  const enter = useEnter();
  const chosen = options.find((o) => o.id === value);
  return (
    <Animated.View entering={enter(delay)} style={styles.prompt}>
      <View style={styles.head}>
        <Crosshair size={16} color={colors.accent} strokeWidth={2.2} />
        <AppText variant="overline" color={colors.accent}>
          {label}
        </AppText>
      </View>
      <AppText variant="bodyStrong">{question}</AppText>
      {locked && chosen ? (
        <View style={styles.locked}>
          <AppText variant="body">{chosen.label}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            Locked in — you&apos;ll compare it with what happens.
          </AppText>
        </View>
      ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel={question} style={{ flexDirection: layout, gap: space.sm }}>
          {options.map((o) => (
            <View key={o.id} style={{ flexDirection: 'row', flex: layout === 'row' ? 1 : undefined }}>
              <ChoiceCard compact title={o.label} description={o.description} selected={value === o.id} onSelect={() => onChange(o.id)} />
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

/** Side-by-side comparison of a locked prediction with what actually happened, plus feedback on it. */
export function PredictionResult({
  predicted,
  actual,
  verdict,
  title,
  children,
  delay = 0,
}: {
  predicted: string;
  actual: string;
  verdict: Verdict;
  title?: string;
  children?: ReactNode;
  delay?: number;
}) {
  const enter = useEnter();
  const hit = verdict === 'match';
  const Icon = hit ? CircleCheck : CircleX;
  return (
    <Animated.View entering={enter(delay)} style={{ gap: space.sm }}>
      <View style={styles.compare} accessible accessibilityLabel={`You predicted ${predicted}. What happened: ${actual}.`}>
        <View style={styles.half}>
          <AppText variant="caption" color={colors.accent}>
            You predicted
          </AppText>
          <AppText variant="bodyStrong">{predicted}</AppText>
        </View>
        <Icon size={20} color={hit ? colors.success : colors.textMuted} strokeWidth={2.2} />
        <View style={styles.half}>
          <AppText variant="caption" color={colors.textMuted}>
            What happened
          </AppText>
          <AppText variant="bodyStrong">{actual}</AppText>
        </View>
      </View>
      {children ? (
        <FeedbackPanel verdict={verdict} title={title}>
          {children}
        </FeedbackPanel>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  prompt: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.3)',
    backgroundColor: colors.bgRaised,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  locked: {
    gap: space.xs,
    paddingLeft: space.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  compare: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgRaised,
  },
  half: { flex: 1, gap: 2 },
});
