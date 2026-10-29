import { StyleSheet, View } from 'react-native';
import Animated, { FlipInYLeft } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Check, Coins, Crown, Eye, Hand, HandCoins, Shield, ShieldAlert, type LucideIcon } from '@/src/components/ui/icons';
import { CLAIM_OF, type Card, type PowerAction, type PowerMove, type PowerState, ROLE_NAME, type Role, WIN_COINS, moveText, powerPrompt } from '@/src/arena/power-play';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row } from '../parts';
import { Overline, Panel } from './kit';

const ROLE_ICON: Record<Role, LucideIcon> = { treasurer: Crown, thief: HandCoins, guard: Shield, oracle: Eye };
const ROLE_TINT: Record<Role, string> = { treasurer: colors.insight, thief: colors.rivalText, guard: colors.primaryText, oracle: colors.accent };

function RoleCard({ card, faceDown, lost, k }: { card: Card | null; faceDown?: boolean; lost?: boolean; k: string }) {
  const reduced = useMotionReduced();
  if (faceDown || !card)
    return (
      <View style={[styles.card, styles.back]} accessibilityLabel="A face-down card">
        <AppText variant="heading" color={colors.textFaint}>
          ?
        </AppText>
      </View>
    );
  const Icon = ROLE_ICON[card.role];
  return (
    <Animated.View key={k} entering={reduced ? undefined : FlipInYLeft.duration(240)} style={[styles.card, { borderColor: ROLE_TINT[card.role] }, lost && { opacity: 0.4 }]} accessible accessibilityLabel={`${ROLE_NAME[card.role]}${lost ? ', lost' : ''}`}>
      <Icon size={22} color={ROLE_TINT[card.role]} />
      <AppText variant="caption" weight="semibold" color={colors.text}>
        {ROLE_NAME[card.role]}
      </AppText>
      {lost ? (
        <AppText variant="caption" color={colors.danger}>
          lost
        </AppText>
      ) : null}
    </Animated.View>
  );
}

const ACTIONS: { move: PowerMove; label: string; hint: string }[] = [
  { move: 'income', label: 'Income', hint: '+1 · no claim' },
  { move: 'treasury', label: 'Treasury', hint: '+3 · claims Treasurer' },
  { move: 'steal', label: 'Steal', hint: 'take 2 · claims Thief' },
  { move: 'foresight', label: 'Foresight', hint: 'see a card · claims Oracle' },
];

export function PowerPlayBoard({ state, act, over, rivalName }: BoardProps<PowerState, PowerAction>) {
  const p = powerPrompt(state);
  const last = state.turns[state.turns.length - 1];
  const holds = (r: Role) => state.player.hand.some((c) => c.role === r);
  const go = (a: PowerAction) => {
    haptic.commit();
    act(a);
  };
  const seen = Object.entries(state.playerSaw).filter(([id]) => state.bot.hand.some((c) => String(c.id) === id));
  const who = (a: 'player' | 'bot') => (a === 'player' ? 'You' : rivalName);

  return (
    <View style={{ gap: space.lg }}>
      <Panel>
        <Row style={{ justifyContent: 'space-between' }}>
          <Overline color={colors.rivalText}>{rivalName}</Overline>
          <Row style={{ gap: 4 }}>
            <Coins size={14} color={colors.insight} />
            <AppText variant="bodyStrong" tabular>
              {state.bot.coins}/{WIN_COINS}
            </AppText>
          </Row>
        </Row>
        <Row>
          {state.bot.hand.map((c) => (
            <RoleCard key={c.id} k={`b${c.id}`} card={over ? c : null} faceDown={!over} />
          ))}
          {state.bot.lost.map((c) => (
            <RoleCard key={c.id} k={`bl${c.id}`} card={c} lost />
          ))}
        </Row>
        {seen.length && !over ? (
          <AppText variant="caption" color={colors.accent}>
            Your Foresight saw: {seen.map(([, r]) => ROLE_NAME[r]).join(', ')}
          </AppText>
        ) : null}
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Overline color={colors.primaryText}>Your hand</Overline>
          <Row style={{ gap: 4 }}>
            <Coins size={14} color={colors.insight} />
            <AppText variant="bodyStrong" tabular>
              {state.player.coins}/{WIN_COINS}
            </AppText>
          </Row>
        </Row>
        <Row>
          {state.player.hand.map((c) => (
            <RoleCard key={c.id} k={`p${c.id}`} card={c} />
          ))}
          {state.player.lost.map((c) => (
            <RoleCard key={c.id} k={`pl${c.id}`} card={c} lost />
          ))}
        </Row>
      </Panel>

      {last && !state.pendingBlock ? (
        <Reveal revealKey={state.turns.length} tone={last.lost.player.length ? 'bad' : last.lost.bot.length ? 'good' : 'plain'} overline={`Turn ${state.turns.length}`}>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            {who(last.actor)} {moveText(last.move)}.
            {last.challenged ? ` Challenged — ${last.truthful ? 'it was true' : 'a bluff'}.` : ''}
            {last.blocked ? ' Blocked by a Guard.' : ''}
            {last.blockChallenged ? ` The block was ${last.blockTruthful ? 'real' : 'a bluff'}.` : ''}
          </AppText>
          {last.lost.player.length || last.lost.bot.length ? (
            <AppText variant="small" color={colors.textBody}>
              {last.lost.player.length ? `You lost a ${ROLE_NAME[last.lost.player[0]]}. ` : ''}
              {last.lost.bot.length ? `${rivalName} lost a ${ROLE_NAME[last.lost.bot[0]]}.` : ''}
            </AppText>
          ) : null}
          {last.seen && last.actor === 'player' ? (
            <AppText variant="small" color={colors.accent}>
              Foresight: one of its cards is a {ROLE_NAME[last.seen]}.
            </AppText>
          ) : null}
        </Reveal>
      ) : null}

      {p?.phase === 'act' ? (
        <Panel accent="rgba(253,186,116,0.35)">
          <Overline color={colors.insight}>Turn {p.turn} of {state.total} · your move</Overline>
          <View style={styles.grid}>
            {ACTIONS.map((a) => {
              const role = a.move === 'income' ? null : CLAIM_OF[a.move as Exclude<PowerMove, 'income'>];
              const real = role ? holds(role) : true;
              return (
                <Button
                  key={a.move}
                  label={a.label}
                  kicker={role ? `${a.hint}${real ? ' ✓' : ' · bluff'}` : a.hint}
                  variant={real ? 'secondary' : 'ghost'}
                  onPress={() => go({ kind: 'act', move: a.move })}
                  style={styles.cell}
                />
              );
            })}
          </View>
        </Panel>
      ) : null}

      {p?.phase === 'respond' ? (
        <Panel accent="rgba(249,115,22,0.45)">
          <Overline color={colors.rivalText}>Turn {p.turn} · {rivalName}’s move</Overline>
          <AppText variant="heading">
            {rivalName} {moveText(p.move)}.
          </AppText>
          {p.move === 'income' ? (
            <Button label="Continue" icon={Check} iconPosition="left" onPress={() => go({ kind: 'respond', answer: 'allow' })} />
          ) : (
            <View style={{ gap: space.sm }}>
              <Row>
                <Button label="Allow" variant="secondary" icon={Check} iconPosition="left" onPress={() => go({ kind: 'respond', answer: 'allow' })} style={{ flex: 1 }} />
                <Button label="Challenge" icon={Hand} iconPosition="left" onPress={() => go({ kind: 'respond', answer: 'challenge' })} style={{ flex: 1 }} />
              </Row>
              {p.move === 'steal' ? <Button label={holds('guard') ? 'Block with Guard · you hold it' : 'Block with Guard · a bluff'} variant="ghost" icon={Shield} iconPosition="left" onPress={() => go({ kind: 'respond', answer: 'block' })} /> : null}
              <AppText variant="caption" color={colors.textMuted}>
                Three of each role exist. Count yours and the face-up ones before you challenge: a wrong challenge costs you a card.
              </AppText>
            </View>
          )}
        </Panel>
      ) : null}

      {p?.phase === 'block' ? (
        <Panel accent="rgba(37,99,235,0.45)">
          <Row>
            <ShieldAlert size={18} color={colors.primaryText} />
            <Overline color={colors.primaryText}>Your steal is blocked</Overline>
          </Row>
          <AppText variant="bodyStrong">{rivalName} claims a Guard to block your steal.</AppText>
          <Row>
            <Button label="Accept" variant="secondary" onPress={() => go({ kind: 'block-answer', answer: 'accept' })} style={{ flex: 1 }} />
            <Button label="Challenge the Guard" icon={Hand} iconPosition="left" onPress={() => go({ kind: 'block-answer', answer: 'challenge' })} style={{ flex: 1 }} />
          </Row>
        </Panel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 72, height: 92, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.bgRaised },
  back: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceHigh },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { flexGrow: 1, flexBasis: '46%' },
});
