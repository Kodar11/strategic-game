import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Rabbit } from '@/src/components/ui/icons';
import { STAG_MOVES, type StagMove, type StagRound, stagPayoffs } from '@/src/games/stag-hunt';
import { colors, radius, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';
import { FadeInView, MiniMatrix, MoveTile, RevealChip } from './common';
import { Antlers } from './GameArt';
import { RoundTrack, trackDescription } from './parts';

const LABEL: Record<StagMove, string> = { stag: 'Stag', hare: 'Hare' };

function tone(m: StagMove) {
  return m === 'stag' ? { fg: colors.success, bg: colors.successSoft } : { fg: colors.textBody, bg: 'rgba(148,163,184,0.14)' };
}

function icon(m: StagMove, size = 28) {
  return m === 'stag' ? <Antlers size={size} color={tone(m).fg} /> : <Rabbit size={size} color={tone(m).fg} strokeWidth={2} />;
}

function verdict(r: StagRound): string {
  if (r.p === 'stag' && r.b === 'stag') return 'You hunted the stag together: 5 each.';
  if (r.p === 'stag') return 'You went for the stag alone and it escaped: 0 for you. The bot took a safe hare: 3.';
  if (r.b === 'stag') return 'You took the safe hare: 3. The bot hunted stag alone: 0.';
  return 'Both took the safe hare: 3 each.';
}

/** Two choices with very different risks, the payoff cell that applied, and the trust history. */
export function StagHuntBoard({ view }: { view: MatchView }) {
  const rounds = view.rounds as StagRound[];
  const last = rounds[rounds.length - 1];
  const marks = Array.from({ length: view.totalRounds }, (_, i) => (rounds[i] ? (rounds[i].ps > rounds[i].bs ? 'win' : rounds[i].ps < rounds[i].bs ? 'loss' : 'draw') : 'pending') as 'win' | 'loss' | 'draw' | 'pending');
  const together = rounds.filter((r) => r.p === 'stag' && r.b === 'stag').length;

  return (
    <View style={{ gap: space.lg }}>
      <RoundTrack marks={marks} describe={trackDescription(marks)} />

      {last ? (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <RevealChip revealKey={`p${rounds.length}`} who="You" label={LABEL[last.p]} icon={icon(last.p)} tint={tone(last.p).fg} bg={tone(last.p).bg} />
            <RevealChip revealKey={`b${rounds.length}`} who="Bot" label={LABEL[last.b]} icon={icon(last.b)} tint={tone(last.b).fg} bg={tone(last.b).bg} delay={200} />
          </View>
          <FadeInView revealKey={`v${rounds.length}`}>
            <AppText variant="bodyStrong" align="center" accessibilityLiveRegion="polite">
              {verdict(last)}
            </AppText>
          </FadeInView>
        </View>
      ) : null}

      {!view.done ? (
        <View style={{ gap: space.sm }}>
          <AppText variant="overline" color={colors.textMuted} align="center">
            What do you hunt?
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            {STAG_MOVES.map((m) => (
              <MoveTile
                key={m}
                label={LABEL[m]}
                hint={m === 'stag' ? '5 if the bot joins · 0 alone' : '3 for sure'}
                icon={icon(m, 34)}
                tint={m === 'stag' ? colors.success : colors.borderStrong}
                bg={tone(m).bg}
                disabled={view.busy}
                onPress={() => view.play(m)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <MiniMatrix moves={STAG_MOVES} labels={LABEL} payoff={stagPayoffs} played={last ? { p: last.p, b: last.b } : undefined} />

      {rounds.length > 0 ? (
        <View style={{ gap: space.xs }} accessible accessibilityLabel={`Stags caught together: ${together} of ${rounds.length} rounds. History: ${rounds.map((r, i) => `round ${i + 1}, you ${r.p}, bot ${r.b}`).join('; ')}.`}>
          <AppText variant="caption" color={colors.textMuted}>
            Caught together: {together} of {rounds.length} · you over bot
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {rounds.map((r, i) => (
              <View key={i} style={{ alignItems: 'center', gap: 2, padding: 4, borderRadius: radius.sm, backgroundColor: r.p === 'stag' && r.b === 'stag' ? colors.successSoft : colors.bgRaised }}>
                {icon(r.p, 14)}
                {icon(r.b, 14)}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
