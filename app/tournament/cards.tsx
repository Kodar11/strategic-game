import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { IconButton } from '@/src/components/ui/Button';
import { ArrowLeft, Lock } from '@/src/components/ui/icons';
import { LESSON_IDS, getLesson } from '@/src/content/lessons';
import { rivalOf } from '@/src/features/tournament/content';
import { RivalMark } from '@/src/features/tournament/ui/parts';
import { useLoadTournament, useTournamentStatus } from '@/src/features/tournament/useStatus';
import { cardSet } from '@/src/tournament/progress';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

/** The strategy card collection: one per lesson (owned once finished) and one per rival (owned once beaten). */
export default function CardsScreen() {
  const insets = useSafeAreaInsets();
  useLoadTournament();
  const t = useTournamentStatus();
  const cards = cardSet(t.season, LESSON_IDS, t.completed, t.progress);
  const owned = cards.filter((c) => c.owned).length;
  const lessons = cards.filter((c) => c.kind === 'lesson');
  const rivals = cards.filter((c) => c.kind === 'rival');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.xs, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <IconButton icon={ArrowLeft} label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
            <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              Strategy cards
            </AppText>
            <AppText variant="bodyStrong" color={colors.insight} tabular>
              {owned}/{cards.length}
            </AppText>
          </View>
          <AppText color={colors.textMuted}>Finish a lesson to earn its card. Beat a rival to earn theirs.</AppText>

          <AppText variant="overline" color={colors.textMuted}>
            Rivals
          </AppText>
          <View style={styles.grid}>
            {rivals.map((c) => {
              const r = rivalOf(t.doc, c.id);
              return (
                <View key={c.id} style={[styles.card, !c.owned && styles.locked]} accessible accessibilityLabel={`${r.name}, ${r.epithet}. ${c.owned ? 'Collected.' : 'Not yet.'}`}>
                  <RivalMark rival={r} size={40} dim={!c.owned} done={c.owned} />
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {r.name}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                    {r.epithet}
                  </AppText>
                </View>
              );
            })}
          </View>

          <AppText variant="overline" color={colors.textMuted}>
            Ideas
          </AppText>
          <View style={styles.grid}>
            {lessons.map((c) => {
              const l = getLesson(c.id);
              if (!l) return null;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: l.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${l.concept}, from lesson ${l.number}, ${l.title}. ${c.owned ? 'Collected.' : 'Finish the lesson to collect it.'}`}
                  style={({ pressed }) => [styles.card, !c.owned && styles.locked, pressed && { opacity: 0.85 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AppText variant="caption" color={colors.textMuted} tabular>
                      {String(l.number).padStart(2, '0')}
                    </AppText>
                    {c.owned ? null : <Lock size={12} color={colors.textFaint} />}
                  </View>
                  <AppText variant="bodyStrong" numberOfLines={2} color={c.owned ? colors.text : colors.textMuted}>
                    {l.concept}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>
                    {l.title}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: { flexBasis: '47%', flexGrow: 1, gap: space.xs, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(253,186,116,0.35)', backgroundColor: colors.surface },
  locked: { borderColor: colors.border, backgroundColor: colors.bgRaised },
});
