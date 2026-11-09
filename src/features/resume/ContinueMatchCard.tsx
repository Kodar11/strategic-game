import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Play } from '@/src/components/ui/icons';
import { colors, radius, space } from '@/src/theme/tokens';
import { type ResumeSystem, slotOf, useResume } from './store';

/**
 * On a game's setup screen: a practice match of this game left mid-way, with Continue and Discard. Tournament and
 * Gauntlet matches continue from their own screens, so only practice shows here.
 */
export function ContinueMatchCard({ system, game, roundWord = 'Round' }: { system: ResumeSystem; game: string; roundWord?: string }) {
  const slot = slotOf(system, game, 'practice');
  const loaded = useResume((s) => s.loaded);
  // Subscribed, so Discard (and a save made elsewhere) updates the card.
  useResume((s) => s.matches[slot]);
  useEffect(() => {
    void useResume.getState().load();
  }, []);
  const saved = loaded ? useResume.getState().get(slot) : null;
  if (!saved) return null;
  const cont = () => router.push({ pathname: system === 'arena' ? '/arena/play' : '/games/play', params: saved.params });
  return (
    <View style={styles.card} accessibilityRole="summary">
      <AppText variant="overline" color={colors.primaryText}>
        Match in progress
      </AppText>
      <AppText variant="small" color={colors.textBody}>
        {`${roundWord} ${Math.min(saved.played + 1, saved.total)} of ${saved.total}. It stays saved for a day.`}
      </AppText>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Discard" variant="secondary" compact onPress={() => useResume.getState().clear(slot)} style={{ flex: 1 }} />
        <Button label="Continue" icon={Play} compact onPress={cont} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** Starting a new practice match from the setup screen replaces any saved one, so it never resumes by surprise. */
export function discardPractice(system: ResumeSystem, game: string) {
  useResume.getState().clear(slotOf(system, game, 'practice'));
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
