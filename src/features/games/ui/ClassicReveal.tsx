import { View } from 'react-native';

import { MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { CircleCheck, CircleX, Crosshair } from '@/src/components/ui/icons';
import { DIFFICULTY_LABEL, personality } from '@/src/games/catalog';
import type { GameId } from '@/src/games/core';
import { CLASSIC_READ, classicEvidence, classicTakeaway, readPoints } from '@/src/games/reads';
import { colors, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';
import { Panel } from './parts';

/**
 * The opponent revealed, for the practice games other than Rock, Paper, Scissors (which has RpsReveal): the real
 * personality and its rule at this difficulty and the read's verdict; the evidence and one thing to try a tap away.
 */
export function ClassicReveal({ view, onPractise }: { view: MatchView; onPractise?: (bot: string) => void }) {
  const game = view.game as Exclude<GameId, 'rps'>;
  if (!view.done || !CLASSIC_READ[game]) return null;
  const name = personality(game, view.bot)?.name ?? view.bot;
  const read = view.read?.current ?? null;
  const verdict = readPoints(read, view.bot);
  const mystery = view.opponent === 'mystery';
  return (
    <Panel tone="insight">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {verdict ? verdict.correct ? <CircleCheck size={16} color={colors.success} /> : <CircleX size={16} color={colors.rivalText} /> : <Crosshair size={16} color={colors.insight} />}
        <AppText variant="overline" color={verdict?.correct ? colors.success : colors.insight}>
          {mystery ? (verdict ? (verdict.correct ? `Read right · +${verdict.points} Insight Points` : 'Read missed') : 'Opponent revealed') : 'Your opponent'}
        </AppText>
      </View>
      <AppText variant="bodyStrong">
        {CLASSIC_READ[game].target === 'the crowd' ? `The crowd was mostly ${name}` : name} · {DIFFICULTY_LABEL[view.difficulty]}
      </AppText>
      <AppText variant="small" color={colors.textBody}>
        {CLASSIC_READ[game].describe[view.bot]?.[view.difficulty]}
      </AppText>
      {read ? (
        <AppText variant="caption" color={colors.textMuted}>
          You read it as {personality(game, read.guess)?.name ?? read.guess} after round {read.round}.
        </AppText>
      ) : mystery ? (
        <AppText variant="caption" color={colors.textMuted}>
          You didn’t make a read this time.
        </AppText>
      ) : null}
      <MatchLog title="The evidence" summary="Counted from this match">
        {classicEvidence(game, view.rounds).map((e, i) => (
          <AppText key={i} variant="small" color={colors.textBody}>
            • {e}
          </AppText>
        ))}
        <AppText variant="small" weight="semibold">
          {classicTakeaway(game, view.bot)}
        </AppText>
        {onPractise && mystery ? <Button label={`Practise against ${name.replace(/^The /, 'the ')}`} variant="secondary" compact onPress={() => onPractise(view.bot)} /> : null}
      </MatchLog>
    </Panel>
  );
}
