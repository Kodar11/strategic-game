import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, Eye, HandHeart, Sparkles } from '@/src/components/ui/icons';
import { type BoutOutcome, type GauntletRun, type Perk, PERKS, boutsWon } from '@/src/tournament/gauntlet';
import { colors, radius, space } from '@/src/theme/tokens';
import { boutToken, useGauntlet } from '../gauntlet-store';

export const PERK_ICON = { scout: Eye, life: HandHeart, calm: Sparkles } as const;

/**
 * On the play screen after a Gauntlet bout: the outcome for the run, the perk choice after a win, and the way back.
 * Reports the bout once, with the token the bout was opened with.
 */
export function GauntletResult({ token, outcome }: { token: string; outcome: BoutOutcome }) {
  const run = useGauntlet((s) => s.run);
  const best = useGauntlet((s) => s.best);
  // Reported once, on first render: the token makes a repeat (a remount, an old screen) a no-op.
  useEffect(() => {
    useGauntlet.getState().report(token, outcome);
  }, [token, outcome]);
  const shown: GauntletRun | null = run;
  const back = () => router.replace('/tournament/gauntlet');
  // The first frame, before the effect has recorded this bout.
  if (shown && !shown.over && !shown.choice && boutToken(shown) === token) return null;

  if (!shown) {
    return (
      <View style={styles.card}>
        <AppText variant="small" color={colors.textBody}>
          This bout isn’t part of a Gauntlet run any more.
        </AppText>
        <Button label="Open the Gauntlet" icon={ArrowRight} onPress={back} />
      </View>
    );
  }
  const n = shown.results.length;
  const headline = outcome === 'win' ? `Bout ${n} won` : outcome === 'draw' ? `Bout ${n} drawn — you’re through` : shown.over ? 'The run ends here' : `Bout ${n} lost — your second chance saved you`;
  const tone = outcome === 'win' ? colors.success : outcome === 'draw' ? colors.insight : colors.rivalText;

  return (
    <View style={[styles.card, { borderColor: tone }]}>
      <AppText variant="overline" color={colors.insight}>
        The Gauntlet
      </AppText>
      <AppText variant="heading" color={tone}>
        {headline}
      </AppText>
      {shown.over ? (
        <AppText variant="small" color={colors.textBody}>
          {boutsWon(shown)} of {shown.bouts.length} bouts won{boutsWon(shown) >= best ? ' — your best run' : ` · best ${best}`}.
        </AppText>
      ) : null}
      {shown.choice ? (
        <View style={{ gap: space.sm }}>
          <AppText variant="small" color={colors.textBody}>
            Pick a perk for the next bout:
          </AppText>
          {shown.choice.map((p) => (
            <PerkButton key={p} perk={p} onPress={() => useGauntlet.getState().pick(p)} />
          ))}
        </View>
      ) : (
        <Button label={shown.over ? 'See the run' : 'Next bout'} icon={ArrowRight} onPress={back} />
      )}
    </View>
  );
}

export function PerkButton({ perk, onPress }: { perk: Perk; onPress: () => void }) {
  const Icon = PERK_ICON[perk];
  return (
    <Button label={PERKS[perk].name} kicker={PERKS[perk].line} variant="secondary" icon={Icon} iconPosition="left" onPress={onPress} />
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
