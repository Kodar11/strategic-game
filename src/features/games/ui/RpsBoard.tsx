import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Hand, HandFist, type LucideIcon, Scissors } from '@/src/components/ui/icons';
import { RPS_MOVES, type RpsMove, type RpsRound } from '@/src/games/rps';
import { colors, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';
import { FadeInView, MoveTile, RevealChip } from './common';
import { Panel, RoundTrack, trackDescription } from './parts';

const ICON: Record<RpsMove, LucideIcon> = { rock: HandFist, paper: Hand, scissors: Scissors };
const LABEL: Record<RpsMove, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
const VERB: Record<RpsMove, string> = { rock: 'crushes scissors', paper: 'covers rock', scissors: 'cut paper' };

function verdict(r: RpsRound): string {
  if (r.r === 0) return `Tie — you both threw ${LABEL[r.p].toLowerCase()}. 1 point each.`;
  if (r.r === 1) return `You win the round: ${LABEL[r.p].toLowerCase()} ${VERB[r.p]}. +3`;
  return `The bot wins the round: ${LABEL[r.b].toLowerCase()} ${VERB[r.b]}. +3 to the bot`;
}

/** Large gestures, a quick reveal, the score track and the bot's recent throws (its habits are the puzzle). */
export function RpsBoard({ view }: { view: MatchView }) {
  const rounds = view.rounds as RpsRound[];
  const last = rounds[rounds.length - 1];
  const marks = Array.from({ length: view.totalRounds }, (_, i) => (rounds[i] ? (rounds[i].r === 1 ? 'win' : rounds[i].r === -1 ? 'loss' : 'draw') : 'pending') as 'win' | 'loss' | 'draw' | 'pending');

  return (
    <View style={{ gap: space.lg }}>
      <RoundTrack marks={marks} describe={trackDescription(marks)} />

      {last ? (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <RevealChip revealKey={`p${rounds.length}`} who="You" label={LABEL[last.p]} icon={iconOf(last.p, colors.primaryText)} tint={colors.primaryText} bg={colors.primarySoft} />
            <RevealChip revealKey={`b${rounds.length}`} who="Bot" label={LABEL[last.b]} icon={iconOf(last.b, colors.rivalText)} tint={colors.rivalText} bg={colors.rivalSoft} delay={120} />
          </View>
          <FadeInView revealKey={`v${rounds.length}`}>
            <AppText variant="bodyStrong" align="center" color={last.r === 1 ? colors.success : last.r === -1 ? colors.rivalText : colors.textBody} accessibilityLiveRegion="polite">
              {verdict(last)}
            </AppText>
          </FadeInView>
        </View>
      ) : (
        <Panel>
          <AppText variant="small" color={colors.textBody}>
            Win 3 · tie 1 · loss 0. The bot chooses without seeing your throw — but it remembers every earlier round.
          </AppText>
        </Panel>
      )}

      {!view.done ? (
        <View style={{ gap: space.sm }}>
          <AppText variant="overline" color={colors.textMuted} align="center">
            Your throw
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {RPS_MOVES.map((m) => (
              <MoveTile key={m} label={LABEL[m]} icon={iconOf(m, colors.primaryText, 34)} tint={colors.primary} bg={colors.primarySoft} disabled={view.busy} onPress={() => view.play(m)} />
            ))}
          </View>
        </View>
      ) : null}

      {rounds.length > 1 ? (
        <View style={{ gap: space.xs }} accessible accessibilityLabel={`The bot's throws so far: ${rounds.map((r) => LABEL[r.b]).join(', ')}.`}>
          <AppText variant="caption" color={colors.textMuted}>
            The bot&apos;s throws so far
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {rounds.map((r, i) => (
              <View key={i} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.rivalSoft, alignItems: 'center', justifyContent: 'center' }}>
                {iconOf(r.b, colors.rivalText, 16)}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function iconOf(m: RpsMove, color: string, size = 28) {
  const Icon = ICON[m];
  return <Icon size={size} color={color} strokeWidth={2} />;
}
