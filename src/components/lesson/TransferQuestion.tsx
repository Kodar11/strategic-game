import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { Button } from '@/src/components/ui/Button';
import type { ClipId } from '@/src/features/audio/clips';
import { NarrateOn } from '@/src/features/audio/useNarration';
import { colors, space } from '@/src/theme/tokens';
import { FeedbackPanel, Panel } from './Panels';

export interface TransferOption {
  id: string;
  label: string;
  /** Feedback shown after the learner checks this option. */
  feedback: string;
  /**
   * How this answer relates to the lesson's reasoning. Exactly one option per question is `strong`;
   * `defensible` answers are reasonable but miss something, `misconception` answers misread the situation.
   */
  verdict: 'strong' | 'defensible' | 'misconception';
  /** Narration of `feedback`, spoken when the learner checks their answer. */
  clip?: ClipId;
}

/** What carries over from the lesson's model to the new situation, and where the comparison stops working. */
export interface Analogy {
  holds: string;
  differs: string;
}

const TITLE: Record<TransferOption['verdict'], string> = {
  strong: 'Strong reasoning',
  defensible: 'Defensible — but something is missing',
  misconception: 'Worth a second look',
};

/**
 * Apply-the-idea question in an unfamiliar situation. The question never names the concept; the learner
 * picks an answer, checks it, and only then sees feedback, the strongest line of reasoning, and how far
 * the analogy with the lesson goes. No score, no shaming.
 */
export function TransferQuestion({
  question,
  options,
  picked,
  checked,
  onPick,
  onCheck,
  analogy,
}: {
  question: string;
  options: TransferOption[];
  picked: string | null;
  checked: boolean;
  onPick: (id: string) => void;
  onCheck: () => void;
  analogy?: Analogy;
}) {
  const chosen = options.find((o) => o.id === picked);
  const strongest = options.find((o) => o.verdict === 'strong');
  const isStrong = chosen?.verdict === 'strong';
  return (
    <View style={{ gap: space.md }}>
      <AppText variant="bodyStrong">{question}</AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={question} style={{ gap: space.sm }}>
        {options.map((o) => (
          <View key={o.id} style={{ flexDirection: 'row' }}>
            <ChoiceCard compact title={o.label} selected={picked === o.id} onSelect={() => onPick(o.id)} disabled={checked && picked !== o.id} />
          </View>
        ))}
      </View>
      {!checked ? (
        <Button label="Check my reasoning" variant="secondary" onPress={onCheck} disabled={!picked} />
      ) : chosen ? (
        <View style={{ gap: space.sm }}>
          <FeedbackPanel verdict={isStrong ? 'match' : chosen.verdict === 'defensible' ? 'defensible' : 'misconception'} title={TITLE[chosen.verdict]}>
            {chosen.feedback}
          </FeedbackPanel>
          {!isStrong && strongest ? (
            <Panel tone="insight" title={`Stronger reasoning: ${strongest.label}`}>
              {strongest.feedback}
            </Panel>
          ) : null}
          <NarrateOn clip={chosen.clip} trigger={checked} />
          {!isStrong && strongest ? <NarrateOn clip={strongest.clip} trigger={checked} mode="queue" /> : null}
          {analogy ? (
            <View style={{ gap: space.sm, paddingTop: space.xs }}>
              <AppText variant="small">
                <AppText variant="small" weight="semibold" color={colors.insight}>
                  What carries over:{' '}
                </AppText>
                {analogy.holds}
              </AppText>
              <AppText variant="small">
                <AppText variant="small" weight="semibold" color={colors.rivalText}>
                  Where the analogy stops:{' '}
                </AppText>
                {analogy.differs}
              </AppText>
            </View>
          ) : (
            <AppText variant="caption" color={colors.textMuted}>
              Real situations add details this model leaves out — the point is the shape of the reasoning.
            </AppText>
          )}
        </View>
      ) : null}
    </View>
  );
}
