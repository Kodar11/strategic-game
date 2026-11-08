import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import type { TournamentDoc } from '@/src/tournament/schema';
import { colors, radius, space } from '@/src/theme/tokens';

type Question = TournamentDoc['questions'][number];

/** A stage's key-card questions, in document order. */
export const keyQuestions = (doc: TournamentDoc, stageId: string) => doc.questions.filter((q) => q.use === 'key' && q.stage === stageId);

/** The Mind Check pool, in document order (forms are taken from it by `mindForm`). */
export const mindQuestions = (doc: TournamentDoc) => doc.questions.filter((q) => q.use === 'mind');

/**
 * A short quiz over the Tournament's own questions, one at a time: pick, check, see why, next. Calls `onDone` once
 * with the number answered correctly. Nothing goes into the learning record: these are tournament checks.
 */
export function Quiz({ items, onDone }: { items: readonly Question[]; onDone: (correct: number, total: number) => void }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(0);
  const item = items[index];
  if (!item) return null;
  const option = item.options.find((o) => o.id === picked);
  const right = option?.correct === true;
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
      <AppText variant="bodyStrong">{item.question}</AppText>
      <View style={{ gap: space.sm }}>
        {item.options.map((o) => (
          <ChoiceCard key={o.id} title={o.label} selected={picked === o.id} onSelect={() => !checked && setPicked(o.id)} disabled={checked && picked !== o.id} compact />
        ))}
      </View>
      {checked && option ? (
        <View style={{ gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: right ? colors.successSoft : colors.rivalSoft }} accessibilityLiveRegion="polite">
          <AppText variant="bodyStrong" color={right ? colors.success : colors.rivalText}>
            {right ? 'Right' : `Not quite. The answer: ${item.options.find((o) => o.correct)?.label ?? ''}`}
          </AppText>
          <AppText variant="small" color={colors.textBody}>
            {item.explanation}
          </AppText>
        </View>
      ) : null}
      {checked ? <Button label={last ? 'See result' : 'Next'} onPress={next} /> : <Button label="Check" disabled={!picked} onPress={check} />}
    </View>
  );
}
