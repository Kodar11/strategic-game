import { View } from 'react-native';

import { ChoiceTile } from '@/src/components/game/MatchChrome';
import { MatchLog } from '@/src/components/game/MatchLog';
import { FadeInOnce } from '@/src/components/game/Reveal';
import { AppText } from '@/src/components/ui/AppText';
import { Rabbit, User } from '@/src/components/ui/icons';
import { STAG_MOVES, type StagMove, type StagRound, stagPayoffs } from '@/src/games/stag-hunt';
import { colors, radius, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';
import { MiniMatrix } from './common';
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
  if (r.p === 'stag' && r.b === 'stag') return 'You brought the stag down together: 5 each.';
  if (r.p === 'stag') return 'You went for the stag alone and it escaped: 0 for you, a safe 3 for your partner.';
  if (r.b === 'stag') return 'You took the safe hare: 3. Your partner hunted stag alone: 0.';
  return 'You each took a safe hare: 3 each.';
}

/** The hunt as a small scene: each hunter's choice, and the stag in the middle, caught only if both commit. */
function HuntScene({ r, n }: { r: StagRound; n: number }) {
  const caught = r.p === 'stag' && r.b === 'stag';
  const hunter = (who: string, m: StagMove, tint: string) => (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: who === 'You' ? 'flex-start' : 'flex-end' }}>
      {who === 'You' ? <User size={20} color={tint} /> : null}
      <View style={{ alignItems: who === 'You' ? 'flex-start' : 'flex-end' }}>
        <AppText variant="caption" color={tint}>
          {who}
        </AppText>
        <AppText variant="small" weight="semibold">
          {LABEL[m]}
        </AppText>
      </View>
      {who === 'You' ? null : <User size={20} color={tint} />}
    </View>
  );
  return (
    <FadeInOnce revealKey={n}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 64, padding: space.sm, borderRadius: radius.lg, borderWidth: 1.5, borderColor: caught ? colors.success : colors.border, backgroundColor: caught ? colors.successSoft : colors.bgRaised }}>
        {hunter('You', r.p, colors.primaryText)}
        <View style={{ alignItems: 'center', width: 76, opacity: caught ? 1 : 0.55 }}>
          <Antlers size={30} color={caught ? colors.success : colors.textMuted} />
          <AppText variant="caption" color={caught ? colors.success : colors.textMuted}>
            {caught ? 'Caught' : 'Got away'}
          </AppText>
        </View>
        {hunter('Partner', r.b, colors.rivalText)}
      </View>
    </FadeInOnce>
  );
}

/** Two choices with very different risks, one shared stag, and how often you have actually caught it together. */
export function StagHuntBoard({ view }: { view: MatchView }) {
  const rounds = view.rounds as StagRound[];
  const last = rounds[rounds.length - 1];
  const marks = Array.from({ length: view.totalRounds }, (_, i) => (rounds[i] ? (rounds[i].ps > rounds[i].bs ? 'win' : rounds[i].ps < rounds[i].bs ? 'loss' : 'draw') : 'pending') as 'win' | 'loss' | 'draw' | 'pending');
  const together = rounds.filter((r) => r.p === 'stag' && r.b === 'stag').length;

  return (
    <View style={{ gap: space.md }}>
      <RoundTrack marks={marks} describe={trackDescription(marks)} />

      {last ? (
        <View style={{ gap: space.xs }}>
          <HuntScene r={last} n={rounds.length} />
          <AppText variant="small" weight="semibold" align="center" accessibilityLiveRegion="polite">
            {verdict(last)}
          </AppText>
        </View>
      ) : null}

      {!view.done ? (
        <View style={{ gap: space.xs }}>
          <AppText variant="overline" color={colors.textMuted} align="center">
            What do you hunt?
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {STAG_MOVES.map((m) => (
              <ChoiceTile key={m} label={LABEL[m]} hint={m === 'stag' ? '5 if your partner joins · 0 alone' : '3 for sure'} icon={icon(m, 26)} tint={m === 'stag' ? colors.success : colors.borderStrong} bg={tone(m).bg} disabled={view.busy} onPress={() => view.play(m)} />
            ))}
          </View>
        </View>
      ) : null}

      <MatchLog title={rounds.length ? `Caught together: ${together} of ${rounds.length}` : 'Payoffs'} summary={rounds.length ? 'History and payoffs' : 'What each pair of choices pays'}>
        <MiniMatrix moves={STAG_MOVES} labels={LABEL} payoff={stagPayoffs} played={last ? { p: last.p, b: last.b } : undefined} />
        {rounds.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessible accessibilityLabel={`History: ${rounds.map((r, i) => `round ${i + 1}, you ${r.p}, partner ${r.b}`).join('; ')}.`}>
            {rounds.map((r, i) => (
              <View key={i} style={{ alignItems: 'center', gap: 2, padding: 4, borderRadius: radius.sm, backgroundColor: r.p === 'stag' && r.b === 'stag' ? colors.successSoft : colors.surface }}>
                {icon(r.p, 14)}
                {icon(r.b, 14)}
              </View>
            ))}
          </View>
        ) : null}
      </MatchLog>
    </View>
  );
}
