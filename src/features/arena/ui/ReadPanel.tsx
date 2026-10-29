import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ArrowRight, Crosshair, Eye, Pencil } from '@/src/components/ui/icons';
import { ARENA } from '@/src/arena/catalog';
import type { ArenaGameId } from '@/src/arena/core';
import { READ_RULES } from '@/src/arena/reads';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import type { OpponentRead } from '../useOpponentRead';

/**
 * "Think you've figured them out?" — a compact, optional prediction of the hidden personality. Never blocks a move:
 * it sits below the board and folds to one line. The options are the game's four personalities in a fixed order (the
 * catalog's), so nothing on the panel hints at which one is playing.
 */
export function ReadPanel({ game, read, played }: { game: ArenaGameId; read: OpponentRead; played: number }) {
  const reduced = useMotionReduced();
  const [choosing, setChoosing] = useState(false);
  const [pick, setPick] = useState<string | null>(read.guess);
  if (!read.mystery) return null;
  const rule = READ_RULES[game];
  const opponents = ARENA[game].opponents;
  const name = (id: string | null) => opponents.find((o) => o.id === id)?.name ?? '';

  if (!read.open && !read.awaiting) {
    if (read.revealed) return null;
    const left = Math.max(0, read.after - played);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessible accessibilityLabel={`Mystery opponent. You can guess ${rule.target}’s personality after ${left} more rounds.`}>
        <Eye size={14} color={colors.textMuted} />
        <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
          Mystery personality · you can guess {rule.target}’s style after {left} more {left === 1 ? 'round' : 'rounds'} — watch {rule.evidence}.
        </AppText>
      </View>
    );
  }

  const confirm = () => {
    if (!pick) return;
    haptic.select();
    read.guessAs(pick);
    setChoosing(false);
  };

  if (read.guess && !choosing && !read.awaiting) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.insightSoft }} accessible accessibilityLabel={`Your guess: ${name(read.guess)}. You can change it until the match ends.`}>
        <Crosshair size={14} color={colors.insight} />
        <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
          Your guess: <AppText variant="small" weight="semibold">{name(read.guess)}</AppText>
        </AppText>
        <Button label="Change" variant="ghost" compact icon={Pencil} iconPosition="left" onPress={() => setChoosing(true)} />
      </View>
    );
  }

  const end = read.awaiting;
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} style={{ gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.insightSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Crosshair size={16} color={colors.insight} />
        <AppText variant="overline" color={colors.insight} accessibilityRole={end ? 'header' : undefined}>
          {end ? 'Before the reveal' : 'Think you’ve figured them out?'}
        </AppText>
      </View>
      <AppText variant="small" color={colors.textBody} accessibilityLiveRegion={end ? 'polite' : undefined}>
        {end
          ? `The match is over. Name ${rule.target}’s personality before it’s revealed — or just see the results.`
          : `Guess ${rule.target}’s personality from what you’ve seen. It’s optional, changes nothing in the match, and you can change it until the end.`}
      </AppText>
      {choosing || end ? (
        <View style={{ gap: space.sm }}>
          {opponents.map((o) => (
            <ChoiceCard key={o.id} compact tone="orange" title={o.name} description={o.summary} selected={pick === o.id} onSelect={() => setPick(o.id)} />
          ))}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label={end ? 'Skip' : 'Not yet'} variant="secondary" compact onPress={end ? read.skip : () => setChoosing(false)} style={{ flex: 1 }} />
            <Button label={end ? 'Reveal' : 'Lock in guess'} compact icon={end ? ArrowRight : Crosshair} iconPosition={end ? 'right' : 'left'} disabled={!pick} onPress={confirm} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Button label="Make a guess" variant="secondary" compact onPress={() => setChoosing(true)} style={{ alignSelf: 'flex-start' }} />
      )}
    </Animated.View>
  );
}
