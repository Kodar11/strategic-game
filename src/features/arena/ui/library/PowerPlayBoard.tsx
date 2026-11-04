import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FlipInYLeft } from 'react-native-reanimated';

import { CompactReveal, MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Check, Coins, Crown, Eye, Hand, HandCoins, Shield, ShieldAlert, type LucideIcon } from '@/src/components/ui/icons';
import { COPIES, CLAIM_OF, type Card, type PowerAction, type PowerMove, type PowerState, type PowerTurn, ROLES, ROLE_NAME, type Role, WIN_COINS, moveText, powerPrompt } from '@/src/arena/power-play';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { AnimatedBar, type BoardProps, Row } from '../parts';
import { Overline, Panel } from './kit';

const ROLE_ICON: Record<Role, LucideIcon> = { treasurer: Crown, thief: HandCoins, guard: Shield, oracle: Eye };
const ROLE_TINT: Record<Role, string> = { treasurer: colors.insight, thief: colors.rivalText, guard: colors.primaryText, oracle: colors.accent };

function RoleCard({ card, faceDown, lost, k }: { card: Card | null; faceDown?: boolean; lost?: boolean; k: string }) {
  const reduced = useMotionReduced();
  if (faceDown || !card)
    return (
      <View style={[styles.card, styles.back]} accessibilityLabel="A face-down card">
        <AppText variant="bodyStrong" color={colors.textFaint}>
          ?
        </AppText>
      </View>
    );
  const Icon = ROLE_ICON[card.role];
  return (
    <Animated.View key={k} entering={reduced ? undefined : FlipInYLeft.duration(240)} style={[styles.card, { borderColor: ROLE_TINT[card.role] }, lost && { opacity: 0.4 }]} accessible accessibilityLabel={`${ROLE_NAME[card.role]}${lost ? ', lost' : ''}`}>
      <Icon size={16} color={ROLE_TINT[card.role]} />
      <AppText variant="caption" color={colors.text} numberOfLines={1} style={{ fontSize: 10 }}>
        {lost ? 'lost' : ROLE_NAME[card.role]}
      </AppText>
    </Animated.View>
  );
}

/** The coin race: both sides against the same 10. */
function Race({ who, coins, tint }: { who: string; coins: number; tint: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${who}: ${coins} of ${WIN_COINS} coins.`}>
      <Row style={{ gap: 4 }}>
        <Coins size={12} color={colors.insight} />
        <AppText variant="caption" color={colors.textBody} tabular>
          {coins}/{WIN_COINS}
        </AppText>
      </Row>
      <AnimatedBar ratio={Math.min(1, coins / WIN_COINS)} color={tint} height={6} />
    </View>
  );
}

const ACTIONS: { move: PowerMove; label: string; effect: string }[] = [
  { move: 'income', label: 'Income', effect: '+1 · no claim' },
  { move: 'treasury', label: 'Treasury', effect: '+3 coins' },
  { move: 'steal', label: 'Steal', effect: 'take 2' },
  { move: 'foresight', label: 'Foresight', effect: 'see a card' },
];

/** Roles you can account for: your own cards and every face-up card. Never anything face down on the other side. */
function RoleCounts({ s }: { s: PowerState }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.xs }} accessible accessibilityLabel={ROLES.map((r) => `${ROLE_NAME[r]}: ${[...s.player.hand, ...s.player.lost, ...s.bot.lost].filter((c) => c.role === r).length} of ${COPIES} accounted for`).join('. ')}>
      {ROLES.map((r) => {
        const Icon = ROLE_ICON[r];
        const known = [...s.player.hand, ...s.player.lost, ...s.bot.lost].filter((c) => c.role === r).length;
        return (
          <View key={r} style={styles.count}>
            <Icon size={12} color={ROLE_TINT[r]} />
            <View style={{ flexDirection: 'row', gap: 2 }}>
              {Array.from({ length: COPIES }, (_, i) => (
                <View key={i} style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: ROLE_TINT[r], backgroundColor: i < known ? ROLE_TINT[r] : 'transparent' }} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const turnLine = (t: PowerTurn, who: string) => `${who} ${moveText(t.move)}.${t.challenged ? ` Challenged: ${t.truthful ? 'it was true' : 'a bluff'}.` : ''}${t.blocked ? ' Blocked by a Guard.' : ''}${t.blockChallenged ? ` The block was ${t.blockTruthful ? 'real' : 'a bluff'}.` : ''}`;

export function PowerPlayBoard({ state, act, over, rivalName }: BoardProps<PowerState, PowerAction>) {
  const p = powerPrompt(state);
  const last = state.turns[state.turns.length - 1];
  const holds = (r: Role) => state.player.hand.some((c) => c.role === r);
  const go = (a: PowerAction) => {
    haptic.commit();
    act(a);
  };
  const seen = Object.entries(state.playerSaw).filter(([id]) => state.bot.hand.some((c) => String(c.id) === id));
  const who = (a: 'player' | 'bot') => (a === 'player' ? 'You' : 'They');

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.table}>
        <Row style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {state.bot.hand.map((c) => (
              <RoleCard key={c.id} k={`b${c.id}`} card={over ? c : null} faceDown={!over} />
            ))}
            {state.bot.lost.map((c) => (
              <RoleCard key={c.id} k={`bl${c.id}`} card={c} lost />
            ))}
          </View>
          <Race who={rivalName} coins={state.bot.coins} tint={colors.rival} />
        </Row>
        {seen.length && !over ? (
          <AppText variant="caption" color={colors.accent}>
            Your Foresight saw: {seen.map(([, r]) => ROLE_NAME[r]).join(', ')}
          </AppText>
        ) : null}
        <Row style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {state.player.hand.map((c) => (
              <RoleCard key={c.id} k={`p${c.id}`} card={c} />
            ))}
            {state.player.lost.map((c) => (
              <RoleCard key={c.id} k={`pl${c.id}`} card={c} lost />
            ))}
          </View>
          <Race who="You" coins={state.player.coins} tint={colors.primary} />
        </Row>
        <RoleCounts s={state} />
      </View>

      {last && !state.pendingBlock ? (
        <CompactReveal revealKey={state.turns.length} tone={last.lost.player.length ? 'bad' : last.lost.bot.length ? 'good' : 'plain'} summary={`${turnLine(last, who(last.actor))}${last.lost.player.length ? ` You lost a ${ROLE_NAME[last.lost.player[0]]}.` : ''}${last.lost.bot.length ? ` They lost a ${ROLE_NAME[last.lost.bot[0]]}.` : ''}${last.seen && last.actor === 'player' ? ` Foresight: one of its cards is a ${ROLE_NAME[last.seen]}.` : ''}`} />
      ) : null}

      {p?.phase === 'act' ? (
        <View style={styles.grid}>
          {ACTIONS.map((a) => {
            const role = a.move === 'income' ? null : CLAIM_OF[a.move as Exclude<PowerMove, 'income'>];
            const real = role ? holds(role) : true;
            return (
              <Pressable key={a.move} onPress={() => go({ kind: 'act', move: a.move })} accessibilityRole="button" accessibilityLabel={`${a.label}. ${a.effect}.${role ? ` Claims ${ROLE_NAME[role]}. ${real ? 'You hold it.' : 'A bluff: you do not hold it.'}` : ''}`} style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfaceHigh }]}>
                <AppText variant="small" weight="semibold">
                  {a.label}
                </AppText>
                <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {a.effect}
                </AppText>
                {role ? (
                  <AppText variant="caption" weight="semibold" color={real ? colors.success : colors.insight} numberOfLines={1}>
                    {real ? 'You hold it' : `Bluff ${ROLE_NAME[role]}`}
                  </AppText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {p?.phase === 'respond' ? (
        <Panel accent="rgba(249,115,22,0.45)" style={{ padding: space.md, gap: space.sm }}>
          <Overline color={colors.rivalText}>Their claim</Overline>
          <AppText variant="bodyStrong">They {moveText(p.move)}.</AppText>
          {p.move === 'income' ? (
            <Button label="Continue" icon={Check} iconPosition="left" onPress={() => go({ kind: 'respond', answer: 'allow' })} />
          ) : (
            <View style={{ gap: space.xs }}>
              <Row>
                <Button label="Allow" variant="secondary" icon={Check} iconPosition="left" onPress={() => go({ kind: 'respond', answer: 'allow' })} style={{ flex: 1 }} />
                <Button label="Challenge" variant="secondary" icon={Hand} iconPosition="left" onPress={() => go({ kind: 'respond', answer: 'challenge' })} style={{ flex: 1 }} />
              </Row>
              {p.move === 'steal' ? <Button label={holds('guard') ? 'Block with Guard · you hold it' : 'Block with Guard · a bluff'} variant="secondary" icon={Shield} iconPosition="left" onPress={() => go({ kind: 'respond', answer: 'block' })} /> : null}
              <AppText variant="caption" color={colors.textMuted}>
                A wrong challenge costs you a card. The dots above show the copies you can account for, of {COPIES} each.
              </AppText>
            </View>
          )}
        </Panel>
      ) : null}

      {p?.phase === 'block' ? (
        <Panel accent="rgba(37,99,235,0.45)" style={{ padding: space.md, gap: space.sm }}>
          <Row>
            <ShieldAlert size={16} color={colors.primaryText} />
            <Overline color={colors.primaryText}>Your steal is blocked</Overline>
          </Row>
          <AppText variant="small" weight="semibold">They claim a Guard to block your steal.</AppText>
          <Row>
            <Button label="Accept" variant="secondary" onPress={() => go({ kind: 'block-answer', answer: 'accept' })} style={{ flex: 1 }} />
            <Button label="Challenge" variant="secondary" icon={Hand} iconPosition="left" onPress={() => go({ kind: 'block-answer', answer: 'challenge' })} style={{ flex: 1 }} />
          </Row>
        </Panel>
      ) : null}

      {state.turns.length ? (
        <MatchLog title="Public claims" summary={`They claimed ${state.turns.filter((t) => t.actor === 'bot' && t.move !== 'income').length} roles · ${state.bot.lost.length + state.player.lost.length} cards face up`}>
          {state.turns.map((t, i) => (
            <AppText key={i} variant="caption" color={t.actor === 'player' ? colors.primaryText : colors.rivalText}>
              {i + 1}. {turnLine(t, who(t.actor))}
            </AppText>
          ))}
        </MatchLog>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  card: { width: 50, height: 58, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: colors.bgRaised },
  back: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceHigh },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  action: { flexGrow: 1, flexBasis: '46%', minHeight: 64, gap: 1, padding: space.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  count: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 22, borderRadius: radius.sm, backgroundColor: colors.bgRaised },
});
