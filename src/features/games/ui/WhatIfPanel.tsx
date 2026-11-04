import { useMemo } from 'react';
import { View } from 'react-native';

import { MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { personality } from '@/src/games/catalog';
import { whatIf } from '@/src/games/what-if';
import { colors, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';

const WORD = { win: 'win', loss: 'loss', draw: 'draw' } as const;

/**
 * After a practice match of Split or Steal or Stag Hunt: the same opponent and seed replayed against simple patterns,
 * so the player can see what a different approach would have scored. Folded by default; descriptive, not a verdict.
 */
export function WhatIfPanel({ view }: { view: MatchView }) {
  const lines = useMemo(
    () => (view.mode === 'practice' && view.done && view.seed !== null ? whatIf(view.game, { bot: view.bot, difficulty: view.difficulty, seed: view.seed }, view.rounds as never) : null),
    [view.mode, view.done, view.seed, view.game, view.bot, view.difficulty, view.rounds],
  );
  if (!lines?.length) return null;
  const name = personality(view.game, view.bot)?.name ?? 'this opponent';
  return (
    <MatchLog title="What if you’d played it differently?" summary={`Same opponent, same match, ${lines.length} other patterns`}>
      <AppText variant="small" color={colors.textBody}>
        {name} reacts to what you do, so a different pattern changes its moves too. Replayed exactly:
      </AppText>
      <View style={{ gap: space.xs }}>
        <Line label="What you did" you={view.totals.player} them={view.totals.bot} outcome={view.outcome ?? 'draw'} strong />
        {lines.map((l) => (
          <Line key={l.id} label={l.label} you={l.player} them={l.bot} outcome={l.outcome} />
        ))}
      </View>
    </MatchLog>
  );
}

function Line({ label, you, them, outcome, strong }: { label: string; you: number; them: number; outcome: 'win' | 'loss' | 'draw'; strong?: boolean }) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 2 }}
      accessible
      accessibilityLabel={`${label}: you ${you}, them ${them}, ${WORD[outcome]}`}>
      <AppText variant="small" weight={strong ? 'semibold' : undefined} color={strong ? colors.text : colors.textBody} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="small" tabular color={colors.textBody}>
        {you}–{them}
      </AppText>
      <AppText variant="caption" color={outcome === 'win' ? colors.success : outcome === 'loss' ? colors.rivalText : colors.textMuted} style={{ width: 34, textAlign: 'right' }}>
        {WORD[outcome]}
      </AppText>
    </View>
  );
}
