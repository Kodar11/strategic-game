import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ArrowRight, Crosshair, Lock } from '@/src/components/ui/icons';
import { personality } from '@/src/games/catalog';
import { RPS_BOTS, RPS_INSIGHT, type RpsBot } from '@/src/games/rps';
import { RPS_READS } from '@/src/games/rps-insight';
import { colors, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';
import { Panel } from './parts';

/**
 * "Read your opponent" during a mystery match: one prediction, open after RPS_INSIGHT.minRounds rounds and locked on
 * submit. Nothing here says whether it's right — that waits for the reveal.
 */
export function ReadOpponentPanel({ view }: { view: MatchView }) {
  const [choosing, setChoosing] = useState(false);
  const [guess, setGuess] = useState<RpsBot | null>(null);
  const read = view.read;
  if (!read || view.done) return null;
  const pts = `+${RPS_INSIGHT.points} Insight Points`;

  if (read.current) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessible accessibilityLabel={`Your read is locked in: ${personality('rps', read.current.guess)?.name}. It is checked after the match.`}>
        <Lock size={14} color={colors.insight} />
        <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
          Your read: <AppText variant="small" weight="semibold">{personality('rps', read.current.guess)?.name}</AppText> · locked, checked after the match
        </AppText>
      </View>
    );
  }

  if (!read.open) {
    return (
      <AppText variant="caption" color={colors.textMuted}>
        Read your opponent: after round {RPS_INSIGHT.minRounds} you can name its habit once for {pts}.
      </AppText>
    );
  }

  // After the last round of a mystery match with no read yet: a pause before the reveal — read now, or see the results.
  const end = read.awaiting;
  return (
    <Panel tone="insight">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Crosshair size={16} color={colors.insight} />
        <AppText variant="overline" color={colors.insight} accessibilityRole={end ? 'header' : undefined}>
          {end ? 'Match over · before the reveal' : 'Read your opponent'}
        </AppText>
      </View>
      <AppText variant="small" color={colors.textBody} accessibilityLiveRegion={end ? 'polite' : undefined}>
        {end
          ? `All ${view.totalRounds} rounds are played. Want to name its habit first? A right read earns ${pts}; a wrong one costs nothing.`
          : `Spotted a habit? Name it once for ${pts}. A wrong read costs nothing, and match points aren’t affected.`}
      </AppText>
      {choosing ? (
        <View style={{ gap: space.sm }}>
          {RPS_BOTS.map((b) => (
            <ChoiceCard key={b} compact tone="orange" title={personality('rps', b)?.name ?? b} description={RPS_READS[b][view.difficulty]} selected={guess === b} onSelect={() => setGuess(b)} />
          ))}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label={end ? 'Skip' : 'Later'} variant="secondary" compact onPress={end ? read.skip : () => setChoosing(false)} style={{ flex: 1 }} />
            <Button label="Lock" accessibilityHint="Locks in your read. It can’t be changed." compact icon={Lock} iconPosition="left" disabled={!guess} onPress={() => guess && read.lock(guess)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : end ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label="Predict" compact onPress={() => setChoosing(true)} style={{ flex: 1 }} />
          <Button label="Results" accessibilityHint="Skips the read and reveals the opponent" variant="secondary" compact icon={ArrowRight} onPress={read.skip} style={{ flex: 1 }} />
        </View>
      ) : (
        <Button label="Predict" variant="secondary" compact onPress={() => setChoosing(true)} style={{ alignSelf: 'flex-start' }} />
      )}
    </Panel>
  );
}
