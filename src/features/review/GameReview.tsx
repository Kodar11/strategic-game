import { StyleSheet, View } from 'react-native';

import { MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { CircleCheck, ScanSearch } from '@/src/components/ui/icons';
import type { MatchReview, StepMark } from '@/src/review/review';
import { colors, radius, space } from '@/src/theme/tokens';

const DOT: Record<StepMark, { bg: string; border: string; label: string }> = {
  best: { bg: colors.successSoft, border: 'rgba(74,222,128,0.55)', label: 'good choice' },
  fine: { bg: colors.surfaceHigh, border: colors.borderStrong, label: 'slightly better existed' },
  costly: { bg: colors.rivalSoft, border: 'rgba(249,115,22,0.6)', label: 'a better choice existed' },
  key: { bg: colors.insight, border: colors.insight, label: 'the turning point' },
};

/**
 * Game Review, at a glance: the one decision that mattered most and what would have happened instead, then a strip of
 * every move. The move-by-move list is folded — there for whoever wants it, out of the way for everyone else.
 * The engine replays the match exactly (src/review/review.ts), so every "would have" here is a real result.
 */
export function GameReview({ review, unit }: { review: MatchReview; unit?: string }) {
  const u = unit ?? review.unit;
  const key = review.key;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <ScanSearch size={16} color={colors.accent} strokeWidth={2.2} />
        </View>
        <AppText variant="overline" color={colors.accent} style={{ flex: 1 }}>
          Game review
        </AppText>
      </View>

      {key && key.better ? (
        <View style={{ gap: space.xs }}>
          <AppText variant="bodyStrong">Move {key.n} was the turning point</AppText>
          <AppText variant="small" color={colors.textBody}>
            You chose <AppText variant="small" weight="semibold" color={colors.text}>{key.played}</AppText>. With{' '}
            <AppText variant="small" weight="semibold" color={colors.insight}>{key.better.label}</AppText> there, and the rest played the same, you’d have finished on {key.better.final} {u} instead of {review.final}.
          </AppText>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <CircleCheck size={18} color={colors.success} strokeWidth={2.4} />
          <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
            Well played: no single different move would have ended this match better.
          </AppText>
        </View>
      )}

      <View style={styles.strip} accessible accessibilityLabel={`Every move: ${review.steps.map((s) => `move ${s.n}, ${DOT[s.mark].label}`).join('; ')}`}>
        {review.steps.map((s) => (
          <View key={s.n} style={[styles.dot, { backgroundColor: DOT[s.mark].bg, borderColor: DOT[s.mark].border }]} />
        ))}
      </View>

      <MatchLog title="Every move" summary="What you chose, and the better choice where there was one">
        <View style={{ gap: space.xs }}>
          {review.steps.map((s) => (
            <View key={s.n} style={styles.row}>
              <View style={[styles.dotSmall, { backgroundColor: DOT[s.mark].bg, borderColor: DOT[s.mark].border }]} />
              <AppText variant="caption" color={colors.textMuted} style={{ width: 52 }} tabular>
                Move {s.n}
              </AppText>
              <View style={{ flex: 1 }}>
                <AppText variant="small" color={colors.text}>
                  {s.played}
                  <AppText variant="small" color={colors.textMuted}>
                    {'  '}
                    {s.you}–{s.rival}
                  </AppText>
                </AppText>
                {s.better ? (
                  <AppText variant="caption" color={s.mark === 'key' ? colors.insight : colors.rivalText}>
                    Better: {s.better.label} (+{s.better.gain} by the end)
                  </AppText>
                ) : null}
              </View>
            </View>
          ))}
          <AppText variant="caption" color={colors.textFaint}>
            Each “better” replays the same match with that one change and the rest of your moves kept.
          </AppText>
        </View>
      </MatchLog>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.bgRaised, borderWidth: 1, borderColor: 'rgba(34,211,238,0.28)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  dotSmall: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: 2 },
});
