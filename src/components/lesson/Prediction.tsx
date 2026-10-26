import { CircleCheck, CircleX, Crosshair, Lock } from '@/src/components/ui/icons';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { useEnter } from './motion';
import { FeedbackPanel } from './Panels';
import { CONFIDENCE_LEVELS, type Confidence, confidenceLabel } from './prediction-state';
import type { Verdict } from './verdict';

export interface PredictionOption<T extends string> {
  id: T;
  label: string;
  description?: string;
}

/**
 * Ask the learner to commit to a prediction before anything is revealed. Styled in cyan with a crosshair
 * so it never reads as a decision (blue/orange) or as an explanation (amber).
 *
 * While it is a draft the answer (and, with `onConfidence`, the confidence) can change freely. It locks either
 * through the step's own primary action or, with `onConfirm`, through a "Confirm prediction" button here.
 * Once locked, only the chosen answer and confidence are shown, so they stay legible for the comparison.
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
  confidence,
  onConfidence,
  onConfirm,
}: {
  label?: string;
  question: string;
  options: readonly PredictionOption<T>[];
  value: T | null;
  onChange: (id: T) => void;
  locked?: boolean;
  layout?: 'row' | 'column';
  delay?: number;
  /** The current attempt's confidence. Asked for once an answer is chosen, when `onConfidence` is given. */
  confidence?: Confidence | null;
  onConfidence?: (c: Confidence) => void;
  /** Lock from inside the prompt. Omit when the step's primary action locks the prediction. */
  onConfirm?: () => void;
}) {
  const enter = useEnter();
  const chosen = options.find((o) => o.id === value);
  const ready = value !== null && (!onConfidence || confidence != null);
  return (
    <Animated.View entering={enter(delay)} style={styles.prompt}>
      <View style={styles.head}>
        <Crosshair size={16} color={colors.accent} strokeWidth={2.2} />
        <AppText variant="overline" color={colors.accent} style={{ flex: 1 }}>
          {label}
        </AppText>
        {locked ? <Lock size={14} color={colors.textMuted} strokeWidth={2.2} /> : null}
      </View>
      <AppText variant="bodyStrong">{question}</AppText>
      {locked && chosen ? (
        <View style={styles.locked}>
          <AppText variant="body">{chosen.label}</AppText>
          {confidence ? (
            <AppText variant="small" color={colors.accent}>
              Confidence: {confidence} · {confidenceLabel(confidence)}
            </AppText>
          ) : null}
          <AppText variant="caption" color={colors.textMuted}>
            Locked in — you&apos;ll compare it with what happens.
          </AppText>
        </View>
      ) : (
        <>
          <View accessibilityRole="radiogroup" accessibilityLabel={question} style={{ flexDirection: layout, gap: space.sm }}>
            {options.map((o) => (
              <View key={o.id} style={{ flexDirection: 'row', flex: layout === 'row' ? 1 : undefined }}>
                <ChoiceCard compact title={o.label} description={o.description} selected={value === o.id} onSelect={() => onChange(o.id)} />
              </View>
            ))}
          </View>
          {value !== null && onConfidence ? <ConfidenceScale value={confidence ?? null} onChange={onConfidence} /> : null}
          {value !== null ? (
            <AppText variant="caption" color={colors.textMuted}>
              Draft — you can change {onConfidence ? 'either answer' : 'it'} until you lock it in.
            </AppText>
          ) : null}
          {onConfirm ? <Button label="Confirm prediction" variant="secondary" compact disabled={!ready} onPress={onConfirm} /> : null}
        </>
      )}
    </Animated.View>
  );
}

/**
 * "How confident are you?" on a 1–5 scale. Nothing is pre-selected, so an unrated attempt never looks rated.
 * Rating says nothing about correctness and reveals nothing.
 */
export function ConfidenceScale({ value, onChange }: { value: Confidence | null; onChange: (c: Confidence) => void }) {
  const question = 'How confident are you in your prediction?';
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="small" weight="semibold">
        {question}
      </AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={question} style={styles.scale}>
        {CONFIDENCE_LEVELS.map((l) => {
          const on = value === l.value;
          return (
            <Pressable
              key={l.value}
              accessibilityRole="radio"
              accessibilityLabel={`${l.value}: ${l.label}`}
              accessibilityState={{ checked: on }}
              onPress={() => {
                if (!on) haptic.select();
                onChange(l.value);
              }}
              style={({ pressed }) => [styles.level, on && styles.levelOn, pressed && !on && { backgroundColor: colors.surfaceHigh }]}>
              <AppText variant="bodyStrong" tabular color={on ? colors.text : colors.textMuted}>
                {l.value}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
        {value ? (
          <AppText variant="caption" color={colors.accent}>
            {value} · {confidenceLabel(value)}
          </AppText>
        ) : (
          <>
            <AppText variant="caption" color={colors.textMuted}>
              1 · {CONFIDENCE_LEVELS[0].label}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} align="right">
              5 · {CONFIDENCE_LEVELS[4].label}
            </AppText>
          </>
        )}
      </View>
    </View>
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
  confidence,
}: {
  predicted: string;
  actual: string;
  verdict: Verdict;
  title?: string;
  children?: ReactNode;
  delay?: number;
  /** How sure the learner said they were. Shown for reflection only; it never changes the verdict. */
  confidence?: Confidence | null;
}) {
  const enter = useEnter();
  const hit = verdict === 'match';
  const Icon = hit ? CircleCheck : CircleX;
  const sure = confidence ? ` (${confidenceLabel(confidence).toLowerCase()})` : '';
  return (
    <Animated.View entering={enter(delay)} style={{ gap: space.sm }}>
      <View style={styles.compare} accessible accessibilityLabel={`You predicted ${predicted}${sure}. What happened: ${actual}.`}>
        <View style={styles.half}>
          <AppText variant="caption" color={colors.accent}>
            You predicted
          </AppText>
          <AppText variant="bodyStrong">{predicted}</AppText>
          {confidence ? (
            <AppText variant="caption" color={colors.textMuted}>
              {confidenceLabel(confidence)}
            </AppText>
          ) : null}
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
  scale: { flexDirection: 'row', gap: space.xs },
  level: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelOn: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.accentSoft },
});
