import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Badge } from '@/src/components/ui/Card';
import { DIFFICULTY_LABEL, personality } from '@/src/games/catalog';
import type { Difficulty, GameId } from '@/src/games/core';
import { colors, radius, space } from '@/src/theme/tokens';

/** "You 14 · 9 The Counter", with the round count. */
export function ScoreBar({
  you,
  bot,
  botName,
  round,
  total,
  unit,
}: {
  you: number;
  bot: number;
  botName: string;
  round: number;
  total: number;
  unit?: string;
}) {
  return (
    <View style={styles.score} accessible accessibilityLabel={`Round ${Math.min(round, total)} of ${total}. You ${you}${unit ? ` ${unit}` : ''}, ${botName} ${bot}.`}>
      <View style={styles.side}>
        <AppText variant="caption" color={colors.primaryText}>
          You
        </AppText>
        <AppText variant="title" tabular>
          {you}
        </AppText>
      </View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <AppText variant="overline" color={colors.textMuted}>
          Round
        </AppText>
        <AppText variant="bodyStrong" tabular>
          {Math.min(round, total)}/{total}
        </AppText>
      </View>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>
        <AppText variant="caption" color={colors.rivalText} numberOfLines={1}>
          {botName}
        </AppText>
        <AppText variant="title" tabular>
          {bot}
        </AppText>
      </View>
    </View>
  );
}

export type TrackMark = 'win' | 'loss' | 'draw' | 'pending';

const MARK: Record<TrackMark, { bg: string; fg: string; label: string }> = {
  win: { bg: colors.success, fg: colors.bg, label: 'W' },
  loss: { bg: colors.rival, fg: colors.bg, label: 'L' },
  draw: { bg: colors.textFaint, fg: colors.bg, label: '=' },
  pending: { bg: 'transparent', fg: colors.textFaint, label: '' },
};

/** One dot per round: won, lost, even, or still to play. */
export function RoundTrack({ marks, describe }: { marks: TrackMark[]; describe: string }) {
  return (
    <View style={styles.track} accessible accessibilityLabel={describe}>
      {marks.map((m, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: MARK[m].bg }, m === 'pending' && styles.dotPending]}>
          <AppText variant="caption" color={MARK[m].fg} style={{ fontSize: 10, lineHeight: 12 }}>
            {MARK[m].label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export function trackDescription(marks: TrackMark[]): string {
  const w = marks.filter((m) => m === 'win').length;
  const l = marks.filter((m) => m === 'loss').length;
  const d = marks.filter((m) => m === 'draw').length;
  return `Rounds so far: ${w} won, ${l} lost, ${d} even.`;
}

export function OpponentBadges({ game, bot, difficulty, mode }: { game: GameId; bot: string; difficulty: Difficulty; mode?: 'practice' | 'competition' | 'challenge' }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
      <Badge label={personality(game, bot)?.name ?? bot} tone="orange" />
      <Badge label={DIFFICULTY_LABEL[difficulty]} />
      {mode === 'competition' ? <Badge label="Game of the Week" tone="amber" /> : mode === 'challenge' ? <Badge label="Friend challenge" tone="cyan" /> : <Badge label="Practice" tone="blue" />}
    </View>
  );
}

/** A labelled panel inside a board. */
export function Panel({ children, tone }: { children: ReactNode; tone?: 'insight' | 'plain' }) {
  return <View style={[styles.panel, tone === 'insight' && { backgroundColor: colors.insightSoft, borderColor: 'rgba(253,186,116,0.35)' }]}>{children}</View>;
}

const styles = StyleSheet.create({
  score: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgRaised,
  },
  side: { flex: 1, gap: 2 },
  track: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dotPending: { borderWidth: 1.5, borderColor: colors.borderStrong },
  panel: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
