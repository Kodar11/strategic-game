import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Gavel, ScanEye, Search } from '@/src/components/ui/icons';
import { type MoleAction, type MoleState, SUSPECTS, molePrompt, suspectName } from '@/src/arena/mole';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row } from '../parts';
import { Avatar, Overline, Panel } from './kit';

/**
 * The evidence wall: one card per suspect with everything public about them (camera sightings, accusations received)
 * and your private interrogation notes. Nothing on a card hints at who the Mole is or at its style.
 */
export function MoleBoard({ state, act, over }: BoardProps<MoleState, MoleAction>) {
  const reduced = useMotionReduced();
  const p = molePrompt(state);
  const [pick, setPick] = useState<number | null>(null);
  const h = state.rounds;
  const last = h[h.length - 1];
  const sightings = (i: number) => h.filter((r) => r.clue.includes(i)).length;
  const accused = (i: number) => h.reduce((t, r) => t + r.accusations.filter((a) => a === i).length, 0);
  const notes = (i: number) => h.filter((r) => r.interrogated === i).map((r) => (r.nervous ? 'nervous' : 'calm'));
  const live = p?.phase === 'investigate' ? p.clue : null;

  const commit = () => {
    if (pick === null || !p) return;
    haptic.commit();
    act({ kind: p.phase === 'accuse' ? 'accuse' : 'interrogate', suspect: pick });
    setPick(null);
  };

  return (
    <View style={{ gap: space.lg }}>
      {last ? (
        <Reveal revealKey={h.length} tone="plain" overline={`Round ${h.length} · what happened`}>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            {suspectName(last.interrogated)} seemed {last.nervous ? 'nervous' : 'calm'} under questioning.
          </AppText>
          {last.accusations.map((t, i) => (
            <Animated.View key={i} entering={reduced ? undefined : FadeInDown.duration(160).delay(i * 60)}>
              <Row>
                <Avatar name={suspectName(i)} size={24} seat={i + 1} />
                <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
                  {suspectName(i)} accuses <AppText variant="small" weight="semibold">{suspectName(t)}</AppText>
                </AppText>
              </Row>
            </Animated.View>
          ))}
        </Reveal>
      ) : null}

      {p ? (
        <Panel accent={p.phase === 'accuse' ? colors.rival : 'rgba(249,115,22,0.35)'}>
          <Row>
            <ScanEye size={18} color={colors.rivalText} />
            <Overline color={colors.rivalText}>{p.phase === 'accuse' ? 'Final accusation' : `Round ${p.round} of ${state.investigation} · investigation`}</Overline>
          </Row>
          <AppText variant="bodyStrong">
            {p.phase === 'accuse' ? 'Who is the Mole? Choose one suspect.' : `The camera caught ${suspectName(p.clue[0])} and ${suspectName(p.clue[1])} near the vault.`}
          </AppText>
          <View style={styles.grid}>
            {Array.from({ length: SUSPECTS }, (_, i) => {
              const seen = live?.includes(i);
              const on = pick === i;
              const n = notes(i);
              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    haptic.select();
                    setPick(i);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${suspectName(i)}: caught on camera ${sightings(i) + (seen ? 1 : 0)} times${seen ? ', including this round' : ''}, accused ${accused(i)} times${n.length ? `, interrogations: ${n.join(', ')}` : ''}.`}
                  style={[styles.card, seen && { borderColor: colors.insight }, on && { borderColor: colors.rival, backgroundColor: colors.rivalSoft }]}>
                  <Row>
                    <Avatar name={suspectName(i)} seat={i + 1} />
                    <AppText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                      {suspectName(i)}
                    </AppText>
                  </Row>
                  <AppText variant="caption" color={seen ? colors.insight : colors.textMuted} tabular>
                    📷 {sightings(i) + (seen ? 1 : 0)}{seen ? ' · on camera now' : ''}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted} tabular>
                    👉 accused {accused(i)}×
                  </AppText>
                  <AppText variant="caption" color={n.includes('nervous') ? colors.rivalText : colors.textMuted} numberOfLines={1}>
                    {n.length ? `🗒 ${n.join(', ')}` : '🗒 not questioned'}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <Button
            label={pick === null ? (p.phase === 'accuse' ? 'Choose a suspect' : 'Choose whom to question') : p.phase === 'accuse' ? `Accuse ${suspectName(pick)}` : `Interrogate ${suspectName(pick)}`}
            icon={p.phase === 'accuse' ? Gavel : Search}
            iconPosition="left"
            disabled={pick === null}
            onPress={commit}
          />
          {p.phase === 'investigate' ? (
            <AppText variant="caption" color={colors.textMuted}>
              Camera pairs include the Mole {state.setup.variant === 'blurry' ? '60' : '75'}% of the time. The Mole seems nervous 75% of the time, innocents 25%.
            </AppText>
          ) : null}
        </Panel>
      ) : null}

      {over && state.accused !== null ? (
        <Reveal revealKey="end" tone={state.accused === state.mole ? 'good' : 'bad'} overline="Unmasked">
          <AppText variant="heading">The Mole was {suspectName(state.mole)}.</AppText>
          <AppText variant="small" color={colors.textBody}>
            You accused {suspectName(state.accused)}.
          </AppText>
        </Reveal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: { flexGrow: 1, flexBasis: '46%', minWidth: 130, gap: 4, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bgRaised },
});
