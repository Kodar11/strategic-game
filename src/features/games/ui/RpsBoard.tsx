import { View } from 'react-native';

import { MatchLog } from '@/src/components/game/MatchLog';
import { ChoiceTile } from '@/src/components/game/MatchChrome';
import { SealedPair } from '@/src/components/game/Reveal';
import { AppText } from '@/src/components/ui/AppText';
import { Hand, HandFist, type LucideIcon, Scissors } from '@/src/components/ui/icons';
import { RPS_MOVES, type RpsMove, type RpsRound } from '@/src/games/rps';
import { colors, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';
import { Panel, RoundTrack, trackDescription } from './parts';

const ICON: Record<RpsMove, LucideIcon> = { rock: HandFist, paper: Hand, scissors: Scissors };
const LABEL: Record<RpsMove, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
const VERB: Record<RpsMove, string> = { rock: 'crushes scissors', paper: 'covers rock', scissors: 'cut paper' };

function verdict(r: RpsRound): string {
  if (r.r === 0) return `Tie: you both threw ${LABEL[r.p].toLowerCase()}. 1 point each.`;
  if (r.r === 1) return `You win the round: ${LABEL[r.p].toLowerCase()} ${VERB[r.p]}. +3`;
  return `Your opponent wins the round: ${LABEL[r.b].toLowerCase()} ${VERB[r.b]}. +3 to them`;
}

const tally = (moves: RpsMove[]) => RPS_MOVES.map((m) => `${LABEL[m].toLowerCase()} ${moves.filter((x) => x === m).length}`).join(' · ');

function iconOf(m: RpsMove, color: string, size = 28) {
  const Icon = ICON[m];
  return <Icon size={size} color={color} strokeWidth={2} />;
}

function ThrowRow({ who, moves, tint, bg }: { who: string; moves: RpsMove[]; tint: string; bg: string }) {
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${who}: ${moves.map((m) => LABEL[m]).join(', ')}. In total: ${tally(moves)}.`}>
      <AppText variant="caption" color={tint}>
        {who} · {tally(moves)}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {moves.map((m, i) => (
          <View key={i} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            {iconOf(m, tint, 14)}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Three throws, two hands opening together, the track, and both sides' habits a tap away. */
export function RpsBoard({ view }: { view: MatchView }) {
  const rounds = view.rounds as RpsRound[];
  const last = rounds[rounds.length - 1];
  const marks = Array.from({ length: view.totalRounds }, (_, i) => (rounds[i] ? (rounds[i].r === 1 ? 'win' : rounds[i].r === -1 ? 'loss' : 'draw') : 'pending') as 'win' | 'loss' | 'draw' | 'pending');

  return (
    <View style={{ gap: space.md }}>
      <RoundTrack marks={marks} describe={trackDescription(marks)} />

      {last ? (
        <View style={{ gap: space.xs }}>
          <SealedPair
            compact
            beatMs={180}
            revealKey={rounds.length}
            left={{ who: 'You', label: LABEL[last.p], icon: iconOf(last.p, colors.primaryText, 22), tint: colors.primaryText, bg: colors.primarySoft }}
            right={{ who: 'Opponent', label: LABEL[last.b], icon: iconOf(last.b, colors.rivalText, 22), tint: colors.rivalText, bg: colors.rivalSoft }}
          />
          <AppText variant="small" weight="semibold" align="center" color={last.r === 1 ? colors.success : last.r === -1 ? colors.rivalText : colors.textBody} accessibilityLiveRegion="polite">
            {verdict(last)}
          </AppText>
        </View>
      ) : (
        <Panel>
          <AppText variant="small" color={colors.textBody}>
            Win 3 · tie 1 · loss 0. Your opponent chooses without seeing your throw, but it remembers every earlier round.
          </AppText>
        </Panel>
      )}

      {!view.done && !view.read?.awaiting ? (
        <View style={{ gap: space.xs }}>
          <AppText variant="overline" color={colors.textMuted} align="center">
            Your throw
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {RPS_MOVES.map((m) => (
              <ChoiceTile key={m} label={LABEL[m]} icon={iconOf(m, colors.primaryText, 26)} tint={colors.primary} bg={colors.primarySoft} disabled={view.busy} onPress={() => view.play(m)} />
            ))}
          </View>
        </View>
      ) : null}

      {rounds.length ? (
        <MatchLog title="Throws so far" summary={`Opponent: ${tally(rounds.map((r) => r.b))}`}>
          <ThrowRow who="You" moves={rounds.map((r) => r.p)} tint={colors.primaryText} bg={colors.primarySoft} />
          <ThrowRow who="Opponent" moves={rounds.map((r) => r.b)} tint={colors.rivalText} bg={colors.rivalSoft} />
        </MatchLog>
      ) : null}
    </View>
  );
}
