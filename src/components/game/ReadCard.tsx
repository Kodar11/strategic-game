import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ArrowRight, Crosshair, Eye, Lock } from '@/src/components/ui/icons';
import { READ_POINTS, readCopy } from '@/src/games/read-rules';
import { colors, radius, space } from '@/src/theme/tokens';

export interface ReadOption {
  id: string;
  name: string;
  description: string;
}

/**
 * "Read your opponent", the same everywhere: one read per mystery match, open after enough rounds, locked when made,
 * checked at the reveal. It never blocks a move, and it never says whether a read is right before the reveal. The
 * options are listed in a fixed order, so the panel gives nothing away.
 */
export function ReadCard({ target, evidence, roundsLeft, open, awaiting, lockedName, options, onLock, onSkip }: { target: string; evidence?: string; roundsLeft: number; open: boolean; awaiting: boolean; lockedName: string | null; options: ReadOption[]; onLock: (id: string) => void; onSkip: () => void }) {
  const [choosing, setChoosing] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const copy = readCopy(target, evidence, roundsLeft);

  if (lockedName) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 }} accessible accessibilityLabel={`${copy.lockedPrefix} ${lockedName}. ${copy.lockedSuffix}`}>
        <Lock size={14} color={colors.insight} />
        <AppText variant="caption" color={colors.textBody} style={{ flex: 1 }}>
          {copy.lockedPrefix} <AppText variant="caption" weight="semibold">{lockedName}</AppText> · {copy.lockedSuffix}
        </AppText>
      </View>
    );
  }

  if (!open && !awaiting) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessible accessibilityLabel={copy.waiting}>
        <Eye size={14} color={colors.textMuted} />
        <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
          {copy.waiting}
        </AppText>
      </View>
    );
  }

  const showOptions = choosing || awaiting;
  return (
    <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.insightSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Crosshair size={16} color={colors.insight} />
        <AppText variant="overline" color={colors.insight} accessibilityRole={awaiting ? 'header' : undefined} style={{ flex: 1 }}>
          {awaiting ? copy.endTitle : copy.title}
        </AppText>
        {!showOptions ? <Button label={copy.open} variant="secondary" compact onPress={() => setChoosing(true)} /> : null}
      </View>
      {showOptions ? (
        <>
          <AppText variant="small" color={colors.textBody} accessibilityLiveRegion={awaiting ? 'polite' : undefined}>
            {awaiting ? copy.endBody : copy.body}
          </AppText>
          {options.map((o) => (
            <ChoiceCard key={o.id} compact tone="orange" title={o.name} description={o.description} selected={pick === o.id} onSelect={() => setPick(o.id)} />
          ))}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label={awaiting ? copy.skip : copy.later} variant="secondary" compact onPress={awaiting ? onSkip : () => setChoosing(false)} style={{ flex: 1 }} />
            <Button label={copy.lock} accessibilityHint={copy.lockHint} compact icon={awaiting ? ArrowRight : Lock} iconPosition={awaiting ? 'right' : 'left'} disabled={!pick} onPress={() => pick && onLock(pick)} style={{ flex: 1 }} />
          </View>
        </>
      ) : null}
    </View>
  );
}

export { READ_POINTS };
