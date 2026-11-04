import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CompactReveal, MatchLog } from '@/src/components/game/MatchLog';
import { CountUp } from '@/src/components/game/Reveal';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Flag, Gavel, Rocket, Zap } from '@/src/components/ui/icons';
import { MAX_CARD, type SaboteurAction, type SaboteurState, crewName, saboteurPrompt, teamBots } from '@/src/arena/saboteur';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { AnimatedBar, type BoardProps, Reveal, Row } from '../parts';
import { Avatar, Chip, Overline, Panel } from './kit';

/** Missions as a track of nodes: done ones show success or failure and their total, the current one its ring. */
function Track({ s }: { s: SaboteurState }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessible accessibilityLabel={`Missions: ${s.history.map((m, i) => `${i + 1} ${m.success ? 'succeeded' : 'failed'}`).join(', ') || 'none yet'}.`}>
      {Array.from({ length: s.missions }, (_, i) => {
        const m = s.history[i];
        const now = i === s.history.length;
        return (
          <View key={i} style={{ alignItems: 'center', gap: 2, flex: 1 }}>
            <View style={[styles.node, m ? { backgroundColor: m.success ? colors.successSoft : colors.dangerSoft, borderColor: m.success ? colors.success : colors.danger } : now ? { borderColor: colors.insight, borderWidth: 2 } : null]}>
              <AppText variant="caption" weight="bold" color={m ? (m.success ? colors.success : colors.danger) : now ? colors.insight : colors.textFaint}>
                {m ? (m.success ? '✓' : '✗') : i + 1}
              </AppText>
            </View>
            <AppText variant="caption" color={colors.textFaint} tabular>
              {m ? `${m.total}/${m.target}` : now ? 'now' : ' '}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

/** Crew by mission: who was on what and how it ended. Public record only: individual cards never appear here. */
function CrewGrid({ s }: { s: SaboteurState }) {
  return (
    <View style={{ gap: 3 }}>
      {[1, 2, 3].map((b) => (
        <Row key={b} style={{ gap: 3 }} accessible accessibilityLabel={`${crewName(b)}: ${s.history.map((m, i) => `mission ${i + 1} ${m.bench === b ? 'benched' : m.success ? 'on it, succeeded' : 'on it, failed'}`).join(', ')}.`}>
          <AppText variant="caption" color={colors.textBody} style={{ width: 44 }} numberOfLines={1}>
            {crewName(b)}
          </AppText>
          {Array.from({ length: s.missions }, (_, i) => {
            const m = s.history[i];
            const on = m && m.bench !== b;
            return (
              <View key={i} style={[styles.gridCell, m && !on && { backgroundColor: 'transparent' }, on && { backgroundColor: m.success ? colors.successSoft : colors.dangerSoft, borderColor: m.success ? colors.success : colors.danger }]}>
                <AppText variant="caption" color={on ? (m.success ? colors.success : colors.danger) : colors.textFaint}>
                  {!m ? '' : on ? (m.success ? '✓' : '✗') : '–'}
                </AppText>
              </View>
            );
          })}
        </Row>
      ))}
      <AppText variant="caption" color={colors.textFaint}>
        ✓ on a success · ✗ on a failure · – benched
      </AppText>
    </View>
  );
}

/** Each bot's public record: missions it was on, and how many of those failed. */
function Roster({ s, pick, onPick }: { s: SaboteurState; pick: number | null; onPick: (b: number) => void }) {
  return (
    <View style={{ gap: space.xs }}>
      {[1, 2, 3].map((b) => {
        const on = s.history.filter((m) => teamBots(m).includes(b));
        const failed = on.filter((m) => !m.success).length;
        const selected = pick === b;
        return (
          <Pressable key={b} onPress={() => onPick(b)} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${crewName(b)}: on ${on.length} missions, ${failed} failed.`}>
            <Row style={[styles.crew, selected && { borderColor: colors.rival, backgroundColor: colors.rivalSoft }]}>
              <Avatar name={crewName(b)} size={28} seat={b} />
              <AppText variant="small" weight="semibold" style={{ flex: 1 }}>
                {crewName(b)}
              </AppText>
              <AppText variant="caption" color={failed ? colors.rivalText : colors.textMuted} tabular>
                on {on.length} · failed {failed}
              </AppText>
            </Row>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SaboteurBoard({ state, act, over }: BoardProps<SaboteurState, SaboteurAction>) {
  const p = saboteurPrompt(state);
  const last = state.history[state.history.length - 1];
  const [card, setCard] = useState(2);
  const [bench, setBench] = useState<number | null>(null);
  const [suspect, setSuspect] = useState<number | null>(null);
  const go = (a: SaboteurAction) => {
    haptic.commit();
    act(a);
    setBench(null);
  };
  const n = state.history.length;

  return (
    <View style={{ gap: space.sm }}>
      <Track s={state} />
      {last ? (
        <CompactReveal revealKey={n} tone={last.success ? 'good' : 'bad'} overline={`Mission ${n} · ${last.success ? 'success' : 'failure'}`} summary={`Total ${last.total} against ${last.target}. You played ${last.cards[0]}. ${teamBots(last).map(crewName).join(' and ')} added ${last.total - (last.cards[0] ?? 0)} together.`} />
      ) : null}
      {last ? (
        <CountUp
          to={Math.max(0, last.total)}
          revealKey={n}
          render={(v) => (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <AnimatedBar ratio={v / Math.max(last.target, 1)} color={v >= last.target ? colors.success : colors.insight} height={6} />
            </View>
          )}
        />
      ) : null}

      {p && p.phase === 'mission' ? (
        <Panel accent="rgba(253,186,116,0.35)" style={{ padding: space.md, gap: space.sm }}>
          <Row>
            <Rocket size={16} color={colors.insight} />
            <Overline color={colors.insight}>
              Mission {p.mission} · target {p.target} · {p.leader === 0 ? 'you lead' : `${crewName(p.leader)} leads`}
            </Overline>
          </Row>
          {p.leader === 0 ? (
            <Row style={{ flexWrap: 'wrap', gap: space.xs }}>
              {[1, 2, 3].map((b) => (
                <Chip key={b} label={`Bench ${crewName(b)}`} on={bench === b} onPress={() => setBench(b)} tint={colors.rival} />
              ))}
            </Row>
          ) : (
            <AppText variant="caption" color={colors.textBody}>
              {crewName(p.leader)} benched {crewName(p.bench!)}. Team: you, {[1, 2, 3].filter((b) => b !== p.bench).map(crewName).join(' and ')}.
            </AppText>
          )}
          <AppText variant="caption" color={colors.textMuted}>
            Your energy card · {p.energy} energy left
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            {Array.from({ length: MAX_CARD + 1 }, (_, v) => {
              const can = v <= p.energy;
              const on = Math.min(card, Math.min(MAX_CARD, p.energy)) === v;
              return (
                <Pressable
                  key={v}
                  disabled={!can}
                  onPress={() => {
                    haptic.select();
                    setCard(v);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: !can }}
                  accessibilityLabel={`Energy card ${v}`}
                  style={[styles.card, on && { borderColor: colors.primary, backgroundColor: colors.primarySoft }, !can && { opacity: 0.35 }]}>
                  <AppText variant="heading" tabular>
                    {v}
                  </AppText>
                  <Zap size={12} color={on ? colors.primaryText : colors.textMuted} />
                </Pressable>
              );
            })}
          </View>
          <Button
            label={p.leader === 0 && bench === null ? 'Choose who to bench' : 'Play card'}
            icon={Zap}
            iconPosition="left"
            disabled={p.leader === 0 && bench === null}
            onPress={() => go(p.leader === 0 ? { kind: 'mission', bench: bench!, card: Math.min(card, p.energy) } : { kind: 'mission', card: Math.min(card, p.energy) })}
          />
        </Panel>
      ) : null}

      {p && p.phase === 'accuse' ? (
        <Panel accent={colors.rival} style={{ padding: space.md, gap: space.sm }}>
          <Row>
            <Flag size={16} color={colors.rivalText} />
            <Overline color={colors.rivalText}>All missions done · accuse the saboteur</Overline>
          </Row>
          <Roster s={state} pick={suspect} onPick={setSuspect} />
          <Button label={suspect ? `Accuse ${crewName(suspect)}` : 'Choose a crew member'} icon={Gavel} iconPosition="left" disabled={!suspect} onPress={() => suspect && go({ kind: 'accuse', suspect })} />
        </Panel>
      ) : null}

      {over && state.accused !== null ? (
        <Reveal revealKey="end" tone={state.accused === state.saboteur ? 'good' : 'bad'} overline="Unmasked">
          <AppText variant="heading">The saboteur was {crewName(state.saboteur)}.</AppText>
          <AppText variant="small" color={colors.textBody}>
            Its cards: {state.history.map((m, i) => `M${i + 1} ${m.cards[state.saboteur] === null ? 'benched' : m.cards[state.saboteur] === -1 ? 'JAM' : m.cards[state.saboteur]}`).join(' · ')}
          </AppText>
        </Reveal>
      ) : null}

      {n ? (
        <MatchLog title="Crew record" summary={`${state.history.filter((m) => !m.success).length} of ${n} missions failed`} defaultOpen={p?.phase === 'accuse'}>
          <CrewGrid s={state} />
        </MatchLog>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  node: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bgRaised },
  crew: { padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised, minHeight: 44 },
  card: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.bgRaised },
  gridCell: { flex: 1, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 4, borderWidth: 1, borderColor: 'transparent', backgroundColor: colors.surface },
});
