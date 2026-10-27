import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Handshake, Swords } from '@/src/components/ui/icons';
import { SPLIT_MOVES, type SplitMove, type SplitRound, splitPayoffs } from '@/src/games/split-steal';
import { colors, radius, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';
import { FadeInView, MiniMatrix, MoveTile, RevealChip } from './common';
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
  if (r.p === 'steal' && r.b === 'split') return 'You stole while the bot split: 8 for you, 0 for the bot.';
  if (r.p === 'split' && r.b === 'steal') return 'The bot stole while you split: 0 for you, 8 for the bot.';
  return 'Both stole: 1 coin each.';
}

/** Hidden choices, a two-step reveal, the payoff cell that applied, running coins and the full history. */
export function SplitStealBoard({ view }: { view: MatchView }) {
  const rounds = view.rounds as SplitRound[];
  const last = rounds[rounds.length - 1];
  const marks = Array.from({ length: view.totalRounds }, (_, i) => (rounds[i] ? (rounds[i].ps > rounds[i].bs ? 'win' : rounds[i].ps < rounds[i].bs ? 'loss' : 'draw') : 'pending') as 'win' | 'loss' | 'draw' | 'pending');
  const max = Math.max(1, view.totals.player, view.totals.bot);

  return (
    <View style={{ gap: space.lg }}>
      <RoundTrack marks={marks} describe={trackDescription(marks)} />

      {last ? (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <RevealChip revealKey={`p${rounds.length}`} who="You" label={LABEL[last.p]} icon={icon(last.p)} tint={tone(last.p).fg} bg={tone(last.p).bg} />
            <RevealChip revealKey={`b${rounds.length}`} who="Bot" label={LABEL[last.b]} icon={icon(last.b)} tint={tone(last.b).fg} bg={tone(last.b).bg} delay={260} />
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
            Choose in secret
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            {SPLIT_MOVES.map((m) => (
              <MoveTile
                key={m}
                label={LABEL[m]}
                hint={m === 'split' ? '5 each if they split too' : '8 if they split · 1 if they steal'}
                icon={icon(m, 34)}
                tint={m === 'split' ? colors.primary : colors.rival}
                bg={tone(m).bg}
                disabled={view.busy}
                onPress={() => view.play(m)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <MiniMatrix moves={SPLIT_MOVES} labels={LABEL} payoff={splitPayoffs} played={last ? { p: last.p, b: last.b } : undefined} />

      <View style={{ gap: space.xs }} accessible accessibilityLabel={`Coins: you ${view.totals.player}, bot ${view.totals.bot}.`}>
        <CoinBar label="You" value={view.totals.player} max={max} color={colors.primary} />
        <CoinBar label="Bot" value={view.totals.bot} max={max} color={colors.rival} />
      </View>

      {rounds.length > 0 ? (
        <View style={{ gap: space.xs }} accessible accessibilityLabel={`History: ${rounds.map((r, i) => `round ${i + 1}, you ${r.p}, bot ${r.b}`).join('; ')}.`}>
          <AppText variant="caption" color={colors.textMuted}>
            History · you over bot
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {rounds.map((r, i) => (
              <View key={i} style={{ alignItems: 'center', gap: 2, padding: 4, borderRadius: radius.sm, backgroundColor: colors.bgRaised }}>
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

function CoinBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <AppText variant="caption" color={colors.textMuted} style={{ width: 30 }}>
        {label}
      </AppText>
      <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surfaceHigh, overflow: 'hidden' }}>
        <View style={{ width: `${(value / max) * 100}%`, height: '100%', backgroundColor: color, borderRadius: 5 }} />
      </View>
      <AppText variant="small" weight="semibold" tabular style={{ width: 28, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  );
}
