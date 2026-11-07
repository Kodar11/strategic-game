import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { allAssessments, type AssessmentItem } from '@/src/features/assessments/content';
import { colors, radius, space } from '@/src/theme/tokens';

/** Single-answer assessment items (the checkpoint content), in catalog order. */
export function quizPool(lessons?: readonly string[]): AssessmentItem[] {
  return allAssessments()
    .flatMap((a) => a.items)
    .filter((i) => !i.multi && i.options.some((o) => o.verdict === 'match') && (!lessons || lessons.includes(i.lesson)));
}

/**
 * A short quiz over existing assessment items, one at a time: pick, check, see why, next. Calls `onDone` once with
 * the number answered as the model predicts. Nothing is recorded in the learning record: these are tournament checks.
 */
export function Quiz({ items, onDone }: { items: readonly AssessmentItem[]; onDone: (correct: number, total: number) => void }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(0);
  const item = items[index];
  if (!item) return null;
  const option = item.options.find((o) => o.id === picked);
  const right = option?.verdict === 'match';
  const last = index === items.length - 1;

  const check = () => {
    setChecked(true);
    if (right) setCorrect((n) => n + 1);
  };
  const next = () => {
    if (last) return onDone(correct, items.length);
    setIndex(index + 1);
    setPicked(null);
    setChecked(false);
  };

  return (
    <View style={{ gap: space.md }}>
      <AppText variant="caption" color={colors.textMuted} tabular>
        Question {index + 1} of {items.length}
      </AppText>
      {item.situation ? <AppText color={colors.textBody}>{item.situation}</AppText> : null}
      {item.table ? (
        <View style={{ gap: 2, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.bgRaised }}>
          <AppText variant="caption" color={colors.textMuted}>
            {item.table.head.join(' · ')}
          </AppText>
          {item.table.rows.map((r, i) => (
            <AppText key={i} variant="small" color={colors.textBody}>
              {r.join(' · ')}
            </AppText>
          ))}
        </View>
      ) : null}
      <AppText variant="bodyStrong">{item.question}</AppText>
      <View style={{ gap: space.sm }}>
        {item.options.map((o) => (
          <ChoiceCard key={o.id} title={o.label} selected={picked === o.id} onSelect={() => !checked && setPicked(o.id)} disabled={checked && picked !== o.id} compact />
        ))}
      </View>
      {checked && option ? (
        <View style={{ gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: right ? colors.successSoft : colors.rivalSoft }} accessibilityLiveRegion="polite">
          <AppText variant="bodyStrong" color={right ? colors.success : colors.rivalText}>
            {right ? 'Right' : 'Not quite'}
          </AppText>
          <AppText variant="small" color={colors.textBody}>
            {option.feedback}
          </AppText>
          <AppText variant="small" color={colors.textMuted}>
            {item.explanation}
          </AppText>
        </View>
      ) : null}
      {checked ? <Button label={last ? 'See result' : 'Next'} onPress={next} /> : <Button label="Check" disabled={!picked} onPress={check} />}
    </View>
  );
}
