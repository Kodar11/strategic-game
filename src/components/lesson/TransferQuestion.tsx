import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { Button } from '@/src/components/ui/Button';
import { colors, space } from '@/src/theme/tokens';
import { Panel } from './Panels';

export interface TransferOption {
  id: string;
  label: string;
  /** Feedback shown after the learner checks this option. */
  feedback: string;
  /** Whether this answer reflects the lesson's reasoning. Others aren't "wrong", but miss the key idea. */
  strong: boolean;
}

/**
 * Apply-the-idea question. The learner picks an answer, checks it, and sees reasoning for their pick
 * plus the strongest line of reasoning — no score, no shaming.
 */
export function TransferQuestion({
  question,
  options,
  picked,
  checked,
  onPick,
  onCheck,
}: {
  question: string;
  options: TransferOption[];
  picked: string | null;
  checked: boolean;
  onPick: (id: string) => void;
  onCheck: () => void;
}) {
  const chosen = options.find((o) => o.id === picked);
  const strongest = options.find((o) => o.strong);
  return (
    <View style={{ gap: space.md }}>
      <AppText variant="bodyStrong">{question}</AppText>
      <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
        {options.map((o) => (
          <View key={o.id} style={{ flexDirection: 'row' }}>
            <ChoiceCard compact title={o.label} selected={picked === o.id} onSelect={() => onPick(o.id)} disabled={checked} />
          </View>
        ))}
      </View>
      {!checked ? (
        <Button label="Check my reasoning" variant="secondary" onPress={onCheck} disabled={!picked} />
      ) : chosen ? (
        <View style={{ gap: space.sm }}>
          <Panel tone={chosen.strong ? 'success' : 'caution'} title={chosen.strong ? 'That follows the logic' : 'Worth a second look'}>
            {chosen.feedback}
          </Panel>
          {!chosen.strong && strongest ? (
            <Panel tone="insight" title={`Stronger reasoning: ${strongest.label}`}>
              {strongest.feedback}
            </Panel>
          ) : null}
          <AppText variant="caption" color={colors.textMuted}>
            Real situations add details this model leaves out — the point is the shape of the reasoning.
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
