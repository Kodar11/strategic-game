import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Flag, Gavel, Rocket, Zap } from '@/src/components/ui/icons';
import { MAX_CARD, type SaboteurAction, type SaboteurState, crewName, saboteurPrompt, teamBots } from '@/src/arena/saboteur';
import { haptic } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { AnimatedBar, type BoardProps, Reveal, Row } from '../parts';
import { Avatar, Chip, Overline, Panel, Stepper } from './kit';

/** Missions as a track of nodes: done ones show success or failure, the current one pulses with its target. */
function Track({ s }: { s: SaboteurState }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessible accessibilityLabel={`Missions: ${s.history.map((m, i) => `${i + 1} ${m.success ? 'succeeded' : 'failed'}`).join(', ') || 'none yet'}.`}>
      {Array.from({ length: s.missions }, (_, i) => {
        const m = s.history[i];
        const now = i === s.history.length;
        return (
          <View key={i} style={{ alignItems: 'center', gap: 4, flex: 1 }}>
            <View style={[styles.node, m ? { backgroundColor: m.success ? colors.successSoft : colors.dangerSoft, borderColor: m.success ? colors.success : colors.danger } : now ? { borderColor: colors.insight } : null]}>
              <AppText variant="small" weight="bold" color={m ? (m.success ? colors.success : colors.danger) : now ? colors.insight : colors.textFaint}>
                {m ? (m.success ? '✓' : '✗') : i + 1}
              </AppText>
            </View>
            <AppText variant="caption" color={colors.textFaint}>
              {m ? `${m.total}/${m.target}` : now ? 'now' : ''}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

/** Each bot's public record: missions it was on, and how many of those failed. */
function Roster({ s, pick, onPick, label }: { s: SaboteurState; pick?: number | null; onPick?: (b: number) => void; label?: string }) {
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Overline>{label}</Overline> : null}
      {[1, 2, 3].map((b) => {
        const on = s.history.filter((m) => teamBots(m).includes(b));
        const failed = on.filter((m) => !m.success).length;
        const selected = pick === b;
        const content = (
          <Row style={[styles.crew, selected && { borderColor: colors.rival, backgroundColor: colors.rivalSoft }]}>
            <Avatar name={crewName(b)} size={30} seat={b} />
            <AppText variant="small" weight="semibold" style={{ flex: 1 }}>
              {crewName(b)}
            </AppText>
            <AppText variant="caption" color={failed ? colors.rivalText : colors.textMuted} tabular>
              on {on.length} · failed {failed}
            </AppText>
          </Row>
        );
        return onPick ? (
          <Pressable key={b} onPress={() => onPick(b)} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${crewName(b)}: on ${on.length} missions, ${failed} failed.`}>
            {content}
          </Pressable>
        ) : (
          <View key={b}>{content}</View>
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

  return (
    <View style={{ gap: space.lg }}>
      <Track s={state} />
      {last ? (
        <Reveal revealKey={state.history.length} tone={last.success ? 'good' : 'bad'} overline={`Mission ${state.history.length} · ${last.success ? 'success' : 'failure'}`}>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            Total {last.total} against a target of {last.target}. Team: you, {teamBots(last).map(crewName).join(' and ')}.
          </AppText>
          <AnimatedBar ratio={Math.max(0, last.total) / Math.max(last.target, 1)} color={last.success ? colors.success : colors.danger} />
          <AppText variant="caption" color={colors.textMuted}>
            You played {last.cards[0]}. The other two added {last.total - (last.cards[0] ?? 0)} together — cards stay hidden.
          </AppText>
        </Reveal>
      ) : null}

      {p && p.phase === 'mission' ? (
        <Panel accent="rgba(253,186,116,0.35)">
          <Row>
            <Rocket size={18} color={colors.insight} />
            <Overline color={colors.insight}>
              Mission {p.mission} of {state.missions} · target {p.target} · {p.leader === 0 ? 'you lead' : `${crewName(p.leader)} leads`}
            </Overline>
          </Row>
          {p.leader === 0 ? (
            <>
              <AppText variant="small" color={colors.textBody}>
                Bench one bot. The other two go with you.
              </AppText>
              <Row style={{ flexWrap: 'wrap' }}>
                {[1, 2, 3].map((b) => (
                  <Chip key={b} label={`Bench ${crewName(b)}`} on={bench === b} onPress={() => setBench(b)} tint={colors.rival} />
                ))}
              </Row>
            </>
          ) : (
            <AppText variant="small" color={colors.textBody}>
              {crewName(p.leader)} benched {crewName(p.bench!)}. Team: you, {[1, 2, 3].filter((b) => b !== p.bench).map(crewName).join(' and ')}.
            </AppText>
          )}
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <View style={{ gap: 2 }}>
              <AppText variant="caption" color={colors.textMuted}>
                Your energy card · {p.energy} left
              </AppText>
              <Stepper value={Math.min(card, Math.min(MAX_CARD, p.energy))} min={0} max={Math.min(MAX_CARD, p.energy)} onChange={setCard} label="Energy to play" />
            </View>
            <Button
              label="Play card"
              icon={Zap}
              iconPosition="left"
              compact
              disabled={p.leader === 0 && bench === null}
              onPress={() => go(p.leader === 0 ? { kind: 'mission', bench: bench!, card: Math.min(card, p.energy) } : { kind: 'mission', card: Math.min(card, p.energy) })}
            />
          </Row>
          <Roster s={state} label="Crew record" />
        </Panel>
      ) : null}

      {p && p.phase === 'accuse' ? (
        <Panel accent={colors.rival}>
          <Row>
            <Flag size={18} color={colors.rivalText} />
            <Overline color={colors.rivalText}>All missions done · accuse the saboteur</Overline>
          </Row>
          <Roster s={state} pick={suspect} onPick={(b) => setSuspect(b)} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  node: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bgRaised },
  crew: { padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised, minHeight: 44 },
});
