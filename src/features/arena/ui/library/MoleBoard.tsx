import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, Marker, Path, Text as SvgText } from 'react-native-svg';

import { CompactReveal, MatchLog } from '@/src/components/game/MatchLog';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Camera, Gavel, type LucideIcon, MessageCircle, ScanEye, Search, StickyNote } from '@/src/components/ui/icons';
import { type MoleAction, type MoleRound, type MoleState, SUSPECTS, moleEvidence, molePrompt, suspectName } from '@/src/arena/mole';
import { haptic } from '@/src/utils/feedback';
import { colors, fonts, radius, space } from '@/src/theme/tokens';
import { type BoardProps, Reveal, Row } from '../parts';
import { Avatar, Overline, Panel } from './kit';

function Fact({ icon: Icon, text, color = colors.textMuted }: { icon: LucideIcon; text: string; color?: string }) {
  return (
    <Row style={{ gap: 4 }}>
      <Icon size={12} color={color} />
      <AppText variant="caption" color={color} tabular numberOfLines={1} style={{ flex: 1 }}>
        {text}
      </AppText>
    </Row>
  );
}

/** Who has accused whom, from the public record only: thicker arrows for repeated accusations. */
function AccusationWeb({ rounds }: { rounds: readonly MoleRound[] }) {
  const size = 200;
  const pos = [
    [44, 40],
    [156, 40],
    [156, 160],
    [44, 160],
  ];
  const counts = new Map<string, number>();
  for (const r of rounds) r.accusations.forEach((t, i) => counts.set(`${i}-${t}`, (counts.get(`${i}-${t}`) ?? 0) + 1));
  const label = [...counts.entries()].map(([k, n]) => {
    const [a, b] = k.split('-').map(Number);
    return `${suspectName(a)} accused ${suspectName(b)} ${n} time${n === 1 ? '' : 's'}`;
  });
  return (
    <View style={{ alignItems: 'center' }} accessible accessibilityLabel={label.join('. ')}>
      <Svg width={size} height={size}>
        <Defs>
          <Marker id="head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto">
            <Path d="M0 0 L8 4 L0 8 z" fill={colors.rivalText} />
          </Marker>
        </Defs>
        {[...counts.entries()].map(([k, n]) => {
          const [a, b] = k.split('-').map(Number);
          const [x1, y1] = pos[a];
          const [x2, y2] = pos[b];
          const len = Math.hypot(x2 - x1, y2 - y1);
          const ux = (x2 - x1) / len;
          const uy = (y2 - y1) / len;
          // Offset each direction sideways, so A→B and B→A stay apart.
          const ox = -uy * 6;
          const oy = ux * 6;
          return <Line key={k} x1={x1 + ux * 24 + ox} y1={y1 + uy * 24 + oy} x2={x2 - ux * 24 + ox} y2={y2 - uy * 24 + oy} stroke={colors.rivalText} strokeOpacity={0.45 + 0.15 * n} strokeWidth={1 + n} markerEnd="url(#head)" />;
        })}
        {pos.map(([x, y], i) => (
          <Circle key={i} cx={x} cy={y} r={20} fill={colors.surfaceHigh} stroke={colors.borderStrong} />
        ))}
        {pos.map(([x, y], i) => (
          <SvgText key={i} x={x} y={y + 4} fill={colors.text} fontSize={12} fontFamily={fonts.semibold} textAnchor="middle">
            {suspectName(i)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

/**
 * The evidence wall: one card per suspect with everything public about them (camera sightings, accusations received)
 * and your private interrogation notes. Nothing on a card hints at who the Mole is or at its style.
 */
export function MoleBoard({ state, act, over }: BoardProps<MoleState, MoleAction>) {
  const p = molePrompt(state);
  const ev = moleEvidence(state.setup);
  const [pick, setPick] = useState<number | null>(null);
  const h = state.rounds;
  const last = h[h.length - 1];
  const sightings = (i: number) => h.filter((r) => r.clue.includes(i)).length;
  const accused = (i: number) => h.reduce((t, r) => t + r.accusations.filter((a) => a === i).length, 0);
  const notes = (i: number) => h.filter((r) => r.interrogated === i).map((r) => (r.nervous ? 'nervous' : 'calm'));
  const live = p?.phase === 'investigate' ? p.clue : null;

  const commit = () => {
    if (pick === null || !p) return;
    haptic.commit();
    act({ kind: p.phase === 'accuse' ? 'accuse' : 'interrogate', suspect: pick });
    setPick(null);
  };

  return (
    <View style={{ gap: space.sm }}>
      {last ? (
        <CompactReveal revealKey={h.length} tone="plain" overline={`Round ${h.length}`} summary={`${suspectName(last.interrogated)} seemed ${last.nervous ? 'nervous' : 'calm'}. Accusations: ${last.accusations.map((t, i) => `${suspectName(i)}→${suspectName(t)}`).join(', ')}.`} />
      ) : null}

      {p ? (
        <Panel accent={p.phase === 'accuse' ? colors.rival : 'rgba(249,115,22,0.35)'} style={{ padding: space.md, gap: space.sm }}>
          <Row>
            <ScanEye size={16} color={colors.rivalText} />
            <Overline color={colors.rivalText}>{p.phase === 'accuse' ? 'Final accusation' : `Round ${p.round} of ${state.investigation} · question one suspect`}</Overline>
          </Row>
          <AppText variant="small" weight="semibold">
            {p.phase === 'accuse' ? 'Who is the Mole? Choose one suspect.' : `The camera caught ${suspectName(p.clue[0])} and ${suspectName(p.clue[1])} near the vault.`}
          </AppText>
          <View style={styles.grid}>
            {Array.from({ length: SUSPECTS }, (_, i) => {
              const seen = live?.includes(i);
              const on = pick === i;
              const n = notes(i);
              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    haptic.select();
                    setPick(i);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${suspectName(i)}: caught on camera ${sightings(i) + (seen ? 1 : 0)} times${seen ? ', including this round' : ''}, accused ${accused(i)} times${n.length ? `, interrogations: ${n.join(', ')}` : ''}.`}
                  style={[styles.card, seen && { borderColor: colors.insight }, on && { borderColor: colors.rival, backgroundColor: colors.rivalSoft }]}>
                  <Row style={{ gap: 6 }}>
                    <Avatar name={suspectName(i)} seat={i + 1} size={24} />
                    <AppText variant="small" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                      {suspectName(i)}
                    </AppText>
                  </Row>
                  <Fact icon={Camera} text={`${sightings(i) + (seen ? 1 : 0)}${seen ? ' · on camera now' : ' on camera'}`} color={seen ? colors.insight : colors.textMuted} />
                  <Fact icon={MessageCircle} text={`accused ${accused(i)}×`} />
                  <Fact icon={StickyNote} text={n.length ? n.join(', ') : 'not questioned'} color={n.includes('nervous') ? colors.rivalText : colors.textMuted} />
                </Pressable>
              );
            })}
          </View>
          <Button label={pick === null ? (p.phase === 'accuse' ? 'Choose a suspect' : 'Choose whom to question') : p.phase === 'accuse' ? `Accuse ${suspectName(pick)}` : `Question ${suspectName(pick)}`} icon={p.phase === 'accuse' ? Gavel : Search} iconPosition="left" disabled={pick === null} onPress={commit} />
          {p.phase === 'investigate' ? (
            <AppText variant="caption" color={colors.textMuted}>
              Camera pairs include the Mole {Math.round(ev.camera * 100)}% of the time. The Mole seems nervous {Math.round(ev.nervousMole * 100)}% of the time, innocents {Math.round(ev.nervousInnocent * 100)}%.{state.setup.level === 'hard' ? ' On Hard the Mole is composed: weaker tells, so build a stronger case.' : ''}
            </AppText>
          ) : null}
        </Panel>
      ) : null}

      {over && state.accused !== null ? (
        <Reveal revealKey="end" tone={state.accused === state.mole ? 'good' : 'bad'} overline="Unmasked">
          <AppText variant="heading">The Mole was {suspectName(state.mole)}.</AppText>
          <AppText variant="small" color={colors.textBody}>
            You accused {suspectName(state.accused)}.
          </AppText>
        </Reveal>
      ) : null}

      {h.length ? (
        <MatchLog title="Who accused whom" summary="Public accusations, round by round">
          <AccusationWeb rounds={h} />
          {h.map((r, n) => (
            <View key={n} style={{ gap: 1, paddingVertical: 3, borderTopWidth: 1, borderTopColor: colors.border }}>
              <AppText variant="caption" color={colors.textMuted}>
                Round {n + 1} · camera: {suspectName(r.clue[0])}, {suspectName(r.clue[1])} · you questioned {suspectName(r.interrogated)}: {r.nervous ? 'nervous' : 'calm'}
              </AppText>
              <AppText variant="caption" color={colors.textBody}>
                {r.accusations.map((t, i) => `${suspectName(i)} → ${suspectName(t)}`).join(' · ')}
              </AppText>
            </View>
          ))}
        </MatchLog>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  card: { flexGrow: 1, flexBasis: '46%', minWidth: 120, gap: 2, padding: space.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bgRaised },
});
