import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ArrowRight, Crosshair, Lock } from '@/src/components/ui/icons';
import { personality } from '@/src/games/catalog';
import { readMinRounds, readOptions, readTarget } from '@/src/games/reads';
import { engineFor } from '@/src/games/registry';
import { RPS_INSIGHT } from '@/src/games/rps';
import { colors, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';
import { Panel } from './parts';

/**
 * "Read your opponent" during a mystery match (any practice game): one prediction, open after the game's minimum
 * rounds (src/games/reads.ts) and locked on submit. Nothing here says whether it's right — that waits for the reveal.
 */
export function ReadOpponentPanel({ view }: { view: MatchView }) {
  const [choosing, setChoosing] = useState(false);
  const [guess, setGuess] = useState<string | null>(null);
  const read = view.read;
  if (!read || view.done) return null;
  const pts = `+${RPS_INSIGHT.points} Insight Points`;
  const target = readTarget(view.game);
  const options = readOptions(view.game, engineFor(view.game).bots, view.difficulty);

  if (read.current) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessible accessibilityLabel={`Your read is locked in: ${personality(view.game, read.current.guess)?.name}. It is checked after the match.`}>
        <Lock size={14} color={colors.insight} />
        <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
          Your read: <AppText variant="small" weight="semibold">{personality(view.game, read.current.guess)?.name}</AppText> · locked, checked after the match
        </AppText>
      </View>
    );
  }

  if (!read.open) {
    return (
      <AppText variant="caption" color={colors.textMuted}>
        Read {target}: after round {readMinRounds(view.game)} you can name its personality once for {pts}.
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
          {end ? 'Match over · before the reveal' : `Read ${target}`}
        </AppText>
      </View>
      <AppText variant="small" color={colors.textBody} accessibilityLiveRegion={end ? 'polite' : undefined}>
        {end
          ? `All ${view.totalRounds} rounds are played. Want to name its habit first? A right read earns ${pts}; a wrong one costs nothing.`
          : `Spotted a habit? Name it once for ${pts}. A wrong read costs nothing, and match points aren’t affected.`}
      </AppText>
      {choosing ? (
        <View style={{ gap: space.sm }}>
          {options.map((o) => (
            <ChoiceCard key={o.id} compact tone="orange" title={o.name} description={o.description} selected={guess === o.id} onSelect={() => setGuess(o.id)} />
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
