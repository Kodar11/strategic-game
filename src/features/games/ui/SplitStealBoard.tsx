import { View } from 'react-native';

import { ChoiceTile } from '@/src/components/game/MatchChrome';
import { MatchLog } from '@/src/components/game/MatchLog';
import { SealedPair } from '@/src/components/game/Reveal';
import { AppText } from '@/src/components/ui/AppText';
import { Handshake, Swords } from '@/src/components/ui/icons';
import { SPLIT_MOVES, type SplitMove, type SplitRound, splitPayoffs } from '@/src/games/split-steal';
import { colors, radius, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';
import { MiniMatrix } from './common';
import { RoundTrack, trackDescription } from './parts';

const LABEL: Record<SplitMove, string> = { split: 'Split', steal: 'Steal' };

function tone(m: SplitMove) {
  return m === 'split' ? { fg: colors.primaryText, bg: colors.primarySoft } : { fg: colors.rivalText, bg: colors.rivalSoft };
}

function icon(m: SplitMove, size = 28) {
  const t = tone(m);
  return m === 'split' ? <Handshake size={size} color={t.fg} strokeWidth={2} /> : <Swords size={size} color={t.fg} strokeWidth={2} />;
}

function verdict(r: SplitRound): string {
  if (r.p === 'split' && r.b === 'split') return 'Both split: 5 coins each.';
  if (r.p === 'steal' && r.b === 'split') return 'You stole while your opponent split: 8 for you, 0 for them.';
  if (r.p === 'split' && r.b === 'steal') return 'They stole while you split: 0 for you, 8 for them.';
  return 'Both stole: 1 coin each.';
}

/** Two sealed choices that open together, the running count of what mutual splitting would have paid, and the history. */
export function SplitStealBoard({ view }: { view: MatchView }) {
  const rounds = view.rounds as SplitRound[];
  const last = rounds[rounds.length - 1];
  const marks = Array.from({ length: view.totalRounds }, (_, i) => (rounds[i] ? (rounds[i].ps > rounds[i].bs ? 'win' : rounds[i].ps < rounds[i].bs ? 'loss' : 'draw') : 'pending') as 'win' | 'loss' | 'draw' | 'pending');
  const joint = rounds.filter((r) => r.p === 'split' && r.b === 'split').length;

  return (
    <View style={{ gap: space.md }}>
      <RoundTrack marks={marks} describe={trackDescription(marks)} />

      {last ? (
        <View style={{ gap: space.xs }}>
          <SealedPair
            compact
            revealKey={rounds.length}
            left={{ who: 'You', label: LABEL[last.p], points: `+${last.ps}`, icon: icon(last.p, 20), tint: tone(last.p).fg, bg: tone(last.p).bg }}
            right={{ who: 'Opponent', label: LABEL[last.b], points: `+${last.bs}`, icon: icon(last.b, 20), tint: tone(last.b).fg, bg: tone(last.b).bg }}
          />
          <AppText variant="small" weight="semibold" align="center" accessibilityLiveRegion="polite">
            {verdict(last)}
          </AppText>
        </View>
      ) : null}

      {!view.done ? (
        <View style={{ gap: space.xs }}>
          <AppText variant="overline" color={colors.textMuted} align="center">
            Choose in secret
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {SPLIT_MOVES.map((m) => (
              <ChoiceTile key={m} label={LABEL[m]} hint={m === 'split' ? '5 each if they split too' : '8 if they split · 1 if they steal'} icon={icon(m, 26)} tint={m === 'split' ? colors.primary : colors.rival} bg={tone(m).bg} disabled={view.busy} onPress={() => view.play(m)} />
            ))}
          </View>
        </View>
      ) : null}

      {rounds.length ? (
        <AppText variant="caption" color={colors.textMuted} align="center">
          Both split in {joint} of {rounds.length} rounds. Splitting every round pays {rounds.length * 5} each so far.
        </AppText>
      ) : null}

      <MatchLog title="Payoffs and history" summary={rounds.length ? `${rounds.length} rounds played` : 'What each pair of choices pays'}>
        <MiniMatrix moves={SPLIT_MOVES} labels={LABEL} payoff={splitPayoffs} played={last ? { p: last.p, b: last.b } : undefined} />
        {rounds.length ? (
          <View style={{ gap: space.xs }} accessible accessibilityLabel={`History: ${rounds.map((r, i) => `round ${i + 1}, you ${r.p}, opponent ${r.b}`).join('; ')}.`}>
            <AppText variant="caption" color={colors.textMuted}>
              You over opponent
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {rounds.map((r, i) => (
                <View key={i} style={{ alignItems: 'center', gap: 2, padding: 4, borderRadius: radius.sm, backgroundColor: colors.surface }}>
                  {icon(r.p, 14)}
                  {icon(r.b, 14)}
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </MatchLog>
    </View>
  );
}
