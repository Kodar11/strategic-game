import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ArrowRight, Crown, Trophy } from '@/src/components/ui/icons';
import { Segmented } from '@/src/components/ui/Segmented';
import { competitionGame } from '@/src/competition/catalog';
import { gamesRepo } from '@/src/data/games-session';
import { ordinal, weekLabel } from '@/src/games/competition';
import { CompetitionArt } from '@/src/features/competition/CompetitionArt';
import { RemoteView, ScreenShell, shellStyles } from '@/src/features/competition/ScreenShell';
import { usePaged } from '@/src/features/competition/usePaged';
import { useRemote } from '@/src/features/competition/useRemote';
import { colors, space } from '@/src/theme/tokens';

const ANON = 'Anonymous player';

/**
 * Game of the Week history: every past competition, newest first, 20 at a time (each opens its final results), and
 * the all-time champions — weekly titles, weeks taken part in, best finish. Read-only records.
 */
export default function CompetitionsScreen() {
  const [tab, setTab] = useState<'weeks' | 'champions'>('weeks');
  return (
    <ScreenShell title="Past competitions">
      <Segmented
        options={[
          { value: 'weeks', label: 'Past weeks' },
          { value: 'champions', label: 'All-time champions' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'weeks' ? <Weeks /> : <Champions />}
    </ScreenShell>
  );
}

function Weeks() {
  const { items, next, error, loading, load } = usePaged((before: number | null) => gamesRepo.competitionHistory(before));

  if (!items) {
    return error ? (
      <View style={{ gap: space.md, alignItems: 'flex-start' }}>
        <AppText color={colors.textBody}>{error}</AppText>
        <Button label="Try again" variant="secondary" compact onPress={() => load(null)} />
      </View>
    ) : (
      <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} accessibilityLabel="Loading" />
    );
  }
  if (!items.length) return <EmptyState icon={Trophy} text="No finished weeks yet. Each week’s results are kept here." />;
  return (
    <View style={{ gap: space.sm }}>
      {items.map((c) => {
        const champs = c.champions.map((w) => `${w.nickname ?? ANON}${w.isMe ? ' (you)' : ''}`).join(' & ');
        return (
          <Pressable
            key={c.id}
            onPress={() => router.push({ pathname: '/competitions/[id]', params: { id: c.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Week ${c.number ?? ''}, ${competitionGame(c.game).title}. ${champs ? `Champion ${champs}` : c.state === 'cancelled' ? 'Cancelled' : 'No champion'}.${c.mine ? ` You finished ${ordinal(c.mine.rank)}.` : ''}`}
            style={({ pressed }) => [shellStyles.card, { flexDirection: 'row', alignItems: 'center', gap: space.md }, pressed && { backgroundColor: colors.surfaceHigh }]}>
            <CompetitionArt game={c.game} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="caption" color={colors.textMuted}>
                {c.number ? `#${c.number} · ` : ''}
                {weekLabel(c.startsAt, c.endsAt)}
              </AppText>
              <AppText variant="small" weight="semibold" numberOfLines={1}>
                {competitionGame(c.game).title}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {champs ? <Crown size={14} color={colors.insight} /> : null}
                <AppText variant="caption" color={champs ? colors.text : colors.textMuted} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {champs || (c.state === 'cancelled' ? 'Cancelled' : c.state === 'finalizing' ? 'Results being finalized' : 'No champion')}
                </AppText>
              </View>
              {c.mine ? (
                <AppText variant="caption" color={colors.primaryText}>
                  You: {ordinal(c.mine.rank)} of {c.mine.field} · {c.mine.scoreLabel ?? c.mine.score}
                </AppText>
              ) : null}
            </View>
            <ArrowRight size={16} color={colors.textMuted} />
          </Pressable>
        );
      })}
      {error ? <AppText color={colors.danger}>{error}</AppText> : null}
      {next ? <Button label={loading ? 'Loading…' : 'Show older weeks'} variant="secondary" compact disabled={loading} onPress={() => load(next)} /> : null}
    </View>
  );
}

function Champions() {
  const [state, reload] = useRemote(() => gamesRepo.champions(), "champions");
  return (
    <RemoteView state={state} onRetry={reload}>
      {(d) => (
        <View style={{ gap: space.sm }}>
          <AppText variant="small" color={colors.textMuted}>
            Weekly titles across {d.competitions} finished week{d.competitions === 1 ? '' : 's'}. A shared title counts for each holder.
          </AppText>
          {d.me ? (
            <View style={[shellStyles.card, { borderColor: colors.primary }]}>
              <AppText variant="caption" color={colors.textMuted}>
                You
              </AppText>
              <AppText variant="bodyStrong">
                {d.me.titles} title{d.me.titles === 1 ? '' : 's'} · {d.me.weeks} week{d.me.weeks === 1 ? '' : 's'} played · best finish {ordinal(d.me.bestRank)}
              </AppText>
            </View>
          ) : null}
          {d.entries.length ? (
            d.entries.map((e, i) => (
              <View key={i} style={[shellStyles.row, e.rank === 1 && shellStyles.rowLeader, e.isMe && shellStyles.rowMe]} accessible accessibilityLabel={`Rank ${e.rank}: ${e.nickname ?? ANON}, ${e.titles} titles in ${e.weeks} weeks.`}>
                <AppText variant="small" weight="semibold" tabular color={colors.textMuted} style={{ width: 32, textAlign: 'center' }}>
                  {e.rank}
                </AppText>
                <View style={{ flex: 1 }}>
                  <AppText variant="small" weight={e.isMe ? 'semibold' : 'regular'} numberOfLines={1}>
                    {e.nickname ?? ANON}
                    {e.isMe ? ' (you)' : ''}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    {e.weeks} week{e.weeks === 1 ? '' : 's'} · best {ordinal(e.bestRank)}
                  </AppText>
                </View>
                <Crown size={16} color={colors.insight} />
                <AppText variant="bodyStrong" tabular>
                  {e.titles}
                </AppText>
              </View>
            ))
          ) : (
            <EmptyState icon={Crown} text="No champions yet." />
          )}
        </View>
      )}
    </RemoteView>
  );
}
