import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Badge } from '@/src/components/ui/Card';
import { Drama } from '@/src/components/ui/icons';
import { summarizeStyle } from '@/src/style/traits';
import { colors, radius, space } from '@/src/theme/tokens';
import { useStyle } from './store';

/**
 * "How you play" on the Profile: one sentence and up to three habit chips, readable at a glance. The counts behind
 * each habit are folded underneath for anyone who wants them. It describes habits, never ability.
 */
export function PlayStyleCard() {
  const counts = useStyle((s) => s.counts);
  const load = useStyle((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  const style = useMemo(() => summarizeStyle(counts), [counts]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Drama size={16} color={colors.insight} strokeWidth={2.2} />
        </View>
        <AppText variant="overline" color={colors.insight}>
          How you play
        </AppText>
      </View>

      {style.headline ? (
        <>
          <AppText variant="heading">{style.headline}</AppText>
          <View style={styles.chips}>
            {style.habits.map((h) => (
              <Badge key={h.habit} label={h.label} tone="amber" />
            ))}
          </View>
          <MatchLog title="Why we think so" summary={`From your moves in ${style.matches} match${style.matches === 1 ? '' : 'es'}`}>
            <View style={{ gap: space.sm }}>
              {style.habits.map((h) => (
                <View key={h.habit} style={{ gap: 2 }}>
                  <AppText variant="small" weight="semibold">
                    {h.label}
                  </AppText>
                  <AppText variant="small" color={colors.textBody}>
                    {h.evidence}
                  </AppText>
                </View>
              ))}
              <AppText variant="caption" color={colors.textFaint}>
                Read from the Cooperation Game, Split or Steal, Stag Hunt and the Ultimatum games. It describes habits, not skill, and changes as you play.
              </AppText>
            </View>
          </MatchLog>
        </>
      ) : (
        <AppText variant="small" color={colors.textBody}>
          Play a few matches of the Cooperation Game, Split or Steal or an Ultimatum game, and your style appears here.
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(253,186,116,0.28)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.insightSoft, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
});
