import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Lock } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { personality } from '@/src/games/catalog';
import { TT_MAX, TT_MIN, type TwoThirdsRound, lineup, roundStats, scaledDistance, winners } from '@/src/games/two-thirds';
import { colors, fonts, space } from '@/src/theme/tokens';
import type { MatchView } from '../useMatch';
import { FadeInView } from './common';
import { Panel, RoundTrack, trackDescription } from './parts';

/** Pick a number, then see every pick on a number line with the ⅔ target, and why the closest one won. */
export function TwoThirdsBoard({ view }: { view: MatchView }) {
  const rounds = view.rounds as TwoThirdsRound[];
  const last = rounds[rounds.length - 1];
  const [pick, setPick] = useState(33);
  const marks = Array.from({ length: view.totalRounds }, (_, i) => (rounds[i] ? (rounds[i].botWon ? 'loss' : 'win') : 'pending') as 'win' | 'loss' | 'pending');

  return (
    <View style={{ gap: space.lg }}>
      <RoundTrack marks={marks} describe={trackDescription(marks)} />

      {last ? <RoundReveal round={last} index={rounds.length} crowd={view.bot} /> : (
        <Panel>
          <AppText variant="small" color={colors.textBody}>
            Target = ⅔ × the average of all 9 picks (yours included). Closest wins. The other 8 are simulated reasoners — see who they are below.
          </AppText>
        </Panel>
      )}

      {!view.done ? (
        <View style={{ gap: space.md }}>
          <Slider label="Your pick" value={pick} min={TT_MIN} max={TT_MAX} step={1} onChange={setPick} tone="cyan" />
          <Button label={`Lock in ${pick}`} icon={Lock} iconPosition="left" disabled={view.busy} onPress={() => view.play(pick)} />
        </View>
      ) : null}

      {rounds.length > 0 ? (
        <View style={{ gap: space.xs }}>
          <AppText variant="caption" color={colors.textMuted}>
            Rounds so far
          </AppText>
          {rounds.map((r, i) => {
            const s = roundStats(r);
            return (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border }} accessible accessibilityLabel={`Round ${i + 1}: you picked ${r.p}, target ${s.target.toFixed(2)}, ${r.ps} points.`}>
                <AppText variant="small" tabular>
                  R{i + 1} · you {r.p}
                </AppText>
                <AppText variant="small" color={colors.insight} tabular>
                  target {s.target.toFixed(2)}
                </AppText>
                <AppText variant="small" weight="semibold" tabular color={r.botWon ? colors.textMuted : colors.success}>
                  +{r.ps}
                </AppText>
              </View>
            );
          })}
        </View>
      ) : null}

      <AppText variant="caption" color={colors.textFaint}>
        The group: 5 × {personality('two-thirds', view.bot)?.name ?? view.bot}, plus one each of the other types. Simulated, not real people.
      </AppText>
    </View>
  );
}

function RoundReveal({ round, index, crowd }: { round: TwoThirdsRound; index: number; crowd: string }) {
  const [width, setWidth] = useState(0);
  const s = roundStats(round);
  const w = winners(round);
  const types = lineup(crowd as never);
  const closest = [round.p, ...round.bots].filter((g) => scaledDistance(g, s.sum) === w.best);
  const pad = 14;
  const x = (v: number) => pad + ((width - 2 * pad) * v) / 100;
  // Stack equal picks so every one stays visible.
  const seen = new Map<number, number>();
  const stack = (v: number) => {
    const n = seen.get(v) ?? 0;
    seen.set(v, n + 1);
    return n;
  };
  const verdict = w.player
    ? w.count === 1
      ? `You were closest. +${round.ps}`
      : `You shared the win with ${w.count - 1} other${w.count > 2 ? 's' : ''}. +${round.ps}`
    : `Closest pick: ${closest[0]}. You were ${Math.abs(round.p - s.target).toFixed(2)} away. +${round.ps}`;

  return (
    <FadeInView revealKey={index}>
      <Panel>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={`Picks: you ${round.p}; bots ${round.bots.join(', ')}. Average ${s.average.toFixed(2)}, target ${s.target.toFixed(2)}. ${verdict}`}>
          {width > 0 ? (
            <Svg width={width} height={92}>
              <Line x1={pad} y1={60} x2={width - pad} y2={60} stroke={colors.borderStrong} strokeWidth={2} />
              {[0, 25, 50, 75, 100].map((t) => (
                <SvgText key={t} x={x(t)} y={84} fill={colors.textFaint} fontSize={10} fontFamily={fonts.medium} textAnchor="middle">
                  {t}
                </SvgText>
              ))}
              <Rect x={x(s.target) - 1.5} y={6} width={3} height={58} fill={colors.insight} />
              <SvgText x={x(s.target)} y={4 + 10} dx={6} fill={colors.insight} fontSize={11} fontFamily={fonts.semibold}>
                {`⅔ avg = ${s.target.toFixed(2)}`}
              </SvgText>
              {round.bots.map((g, i) => (
                <Circle key={i} cx={x(g)} cy={60 - stack(g) * 9} r={4.5} fill={types[i] === crowd ? colors.rival : colors.textMuted} />
              ))}
              <Circle cx={x(round.p)} cy={60 - stack(round.p) * 9} r={6.5} fill={colors.primary} stroke="#fff" strokeWidth={1.5} />
            </Svg>
          ) : (
            <View style={{ height: 92 }} />
          )}
        </View>
        <AppText variant="small" color={colors.textBody} tabular>
          Average of 9 picks {s.average.toFixed(2)} → target ⅔ × {s.average.toFixed(2)} = {s.target.toFixed(2)}
        </AppText>
        <AppText variant="bodyStrong" color={w.player ? colors.success : colors.rivalText} accessibilityLiveRegion="polite">
          {verdict}
        </AppText>
      </Panel>
    </FadeInView>
  );
}
