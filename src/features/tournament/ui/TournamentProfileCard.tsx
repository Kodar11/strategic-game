import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { ChevronRight, Trophy } from '@/src/components/ui/icons';
import { LESSON_IDS } from '@/src/content/lessons';
import { STYLE_LINE, STYLE_MIN_GAMES, STYLE_NAME, cardSet } from '@/src/tournament/progress';
import { colors, radius, space } from '@/src/theme/tokens';
import { useLoadTournament, useTournamentStatus } from '../useStatus';

/** Profile: the tournament standing — rating and title, play style once there's a pattern, rivals beaten, cards. */
export function TournamentProfileCard() {
  useLoadTournament();
  const t = useTournamentStatus();
  const bracket = t.stages.filter((s) => s.stage.kind !== 'side');
  const beaten = bracket.filter((s) => s.cleared).length;
  const cards = cardSet(t.season, LESSON_IDS, t.completed, t.progress);
  const owned = cards.filter((c) => c.owned).length;
  const games = t.progress.history.length;

  return (
    <Pressable onPress={() => router.navigate('/')} accessibilityRole="button" accessibilityLabel={`Tournament. Strategist rating ${t.rating}, ${t.title}. ${beaten} of ${bracket.length} stages cleared. ${owned} of ${cards.length} cards.`} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={styles.icon}>
          <Trophy size={18} color={colors.insight} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="overline" color={colors.insight}>
            Tournament · {t.season.title}
          </AppText>
          <AppText variant="heading" tabular>
            {t.rating} · {t.title}
          </AppText>
        </View>
        <ChevronRight size={18} color={colors.textMuted} />
      </View>
      <View style={styles.stats}>
        <Stat value={`${beaten}/${bracket.length}`} label="stages cleared" />
        <Stat value={`${owned}/${cards.length}`} label="cards" />
        <Stat value={String(games)} label="games played" />
      </View>
      <AppText variant="small" color={colors.textBody}>
        {t.style ? `${STYLE_NAME[t.style]}. ${STYLE_LINE[t.style]}` : `Your play style appears after ${STYLE_MIN_GAMES} tournament games.`}
      </AppText>
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <AppText variant="bodyStrong" tabular>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.surface },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.insightSoft, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: space.md },
});
