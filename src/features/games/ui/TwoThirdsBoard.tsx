import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { MatchLog } from '@/src/components/game/MatchLog';
import { FadeInOnce, useRevealStep } from '@/src/components/game/Reveal';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Lock } from '@/src/components/ui/icons';
import { Slider } from '@/src/components/ui/Slider';
import { TT_MAX, TT_MIN, type TwoThirdsBot, type TwoThirdsRound, roundStats, scaledDistance, winners } from '@/src/games/two-thirds';
import { twoThirdsPublic } from '@/src/games/two-thirds-view';
import { colors, fonts, space } from '@/src/theme/tokens';
import { haptic } from '@/src/utils/feedback';
import type { MatchView } from '../useMatch';
import { Panel, RoundTrack, trackDescription } from './parts';

const PAD = 14;

/** Pick a number, see every pick land on the line, then the target. A mystery crowd looks like any other until the reveal. */
export function TwoThirdsBoard({ view }: { view: MatchView }) {
  const rounds = view.rounds as TwoThirdsRound[];
  const last = rounds[rounds.length - 1];
  const [pick, setPick] = useState(33);
  const hidden = view.opponent === 'mystery' && !view.done;
  const crowd = view.bot as TwoThirdsBot;
  const pub = twoThirdsPublic(crowd, hidden);
  const marks = Array.from({ length: view.totalRounds }, (_, i) => (rounds[i] ? (rounds[i].botWon ? 'loss' : 'win') : 'pending') as 'win' | 'loss' | 'pending');

  return (
    <View style={{ gap: space.md }}>
      <RoundTrack marks={marks} describe={trackDescription(marks)} />

      {last ? (
        <RoundReveal round={last} index={rounds.length} crowd={crowd} hidden={hidden} pick={view.done ? null : pick} onPick={setPick} />
      ) : (
        <Panel>
          <AppText variant="small" color={colors.textBody}>
            {pub.intro}
          </AppText>
        </Panel>
      )}

      {!view.done ? (
        <View style={{ gap: space.sm }}>
          <Slider label="Your pick" value={pick} min={TT_MIN} max={TT_MAX} step={1} onChange={setPick} tone="cyan" />
          <Button label={`Lock in ${pick}`} icon={Lock} iconPosition="left" disabled={view.busy} onPress={() => view.play(pick)} />
        </View>
      ) : null}

      {rounds.length > 0 ? (
        <MatchLog title="Target so far" summary={rounds.map((r) => roundStats(r).target.toFixed(0)).join(' → ')}>
          <TargetTrail rounds={rounds} />
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
        </MatchLog>
      ) : null}

      <AppText variant="caption" color={colors.textFaint}>
        {pub.groupLine}
      </AppText>
    </View>
  );
}

/** The target and your pick, round by round, on one small chart. */
function TargetTrail({ rounds }: { rounds: TwoThirdsRound[] }) {
  const [width, setWidth] = useState(0);
  const H = 72;
  const x = (i: number) => PAD + (rounds.length > 1 ? ((width - 2 * PAD) * i) / (rounds.length - 1) : (width - 2 * PAD) / 2);
  const y = (v: number) => 6 + ((H - 12) * (100 - v)) / 100;
  const line = (f: (r: TwoThirdsRound) => number) => rounds.map((r, i) => `${x(i)},${y(f(r))}`).join(' ');
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: H }} accessible accessibilityLabel={`Target by round: ${rounds.map((r) => roundStats(r).target.toFixed(1)).join(', ')}. Your picks: ${rounds.map((r) => r.p).join(', ')}.`}>
      {width > 0 ? (
        <Svg width={width} height={H}>
          <Polyline points={line((r) => roundStats(r).target)} fill="none" stroke={colors.insight} strokeWidth={2} />
          <Polyline points={line((r) => r.p)} fill="none" stroke={colors.primary} strokeWidth={2} strokeDasharray="4 3" />
          {rounds.map((r, i) => (
            <Circle key={i} cx={x(i)} cy={y(roundStats(r).target)} r={3.5} fill={colors.insight} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

function RoundReveal({ round, index, crowd, hidden, pick, onPick }: { round: TwoThirdsRound; index: number; crowd: TwoThirdsBot; hidden: boolean; pick: number | null; onPick: (n: number) => void }) {
  const [width, setWidth] = useState(0);
  const s = roundStats(round);
  const w = winners(round);
  const pub = twoThirdsPublic(crowd, hidden, round.bots);
  const closest = [round.p, ...round.bots].filter((g) => scaledDistance(g, s.sum) === w.best);
  // Picks land one by one, then the target drops in. All at once with reduced motion.
  const shown = useRevealStep(index, pub.picks.length + 2, 70);
  const x = (v: number) => PAD + ((width - 2 * PAD) * v) / 100;
  const seen = new Map<number, number>();
  const stack = (v: number) => {
    const n = seen.get(v) ?? 0;
    seen.set(v, n + 1);
    return n;
  };
  const verdict = w.player ? (w.count === 1 ? `You were closest. +${round.ps}` : `You shared the win with ${w.count - 1} other${w.count > 2 ? 's' : ''}. +${round.ps}`) : `Closest pick: ${closest[0]}. You were ${Math.abs(round.p - s.target).toFixed(2)} away. +${round.ps}`;
  const tone = { crowd: colors.rival, other: colors.textMuted, neutral: colors.slateDot };

  return (
    <FadeInOnce revealKey={index}>
      <Panel>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={`Picks: you ${round.p}; the group ${pub.picks.join(', ')}. Average ${s.average.toFixed(2)}, target ${s.target.toFixed(2)}. ${verdict}`}>
          {width > 0 ? (
            <Svg width={width} height={86}>
              <Line x1={PAD} y1={58} x2={width - PAD} y2={58} stroke={colors.borderStrong} strokeWidth={2} />
              {[0, 25, 50, 75, 100].map((t) => (
                <SvgText key={t} x={x(t)} y={80} fill={colors.textFaint} fontSize={10} fontFamily={fonts.medium} textAnchor="middle">
                  {t}
                </SvgText>
              ))}
              {pub.picks.map((g, i) => {
                const cy = 58 - stack(g) * 9;
                return i < shown ? <Circle key={i} cx={x(g)} cy={cy} r={4.5} fill={tone[pub.dotTones[i]]} /> : null;
              })}
              {shown > pub.picks.length ? <Circle cx={x(round.p)} cy={58 - stack(round.p) * 9} r={6.5} fill={colors.primary} stroke="#fff" strokeWidth={1.5} /> : null}
              {shown > pub.picks.length + 1 ? (
                <>
                  <Rect x={x(s.target) - 1.5} y={6} width={3} height={56} fill={colors.insight} />
                  <SvgText x={x(s.target)} y={14} dx={s.target > 70 ? -6 : 6} textAnchor={s.target > 70 ? 'end' : 'start'} fill={colors.insight} fontSize={11} fontFamily={fonts.semibold}>
                    {`⅔ avg = ${s.target.toFixed(2)}`}
                  </SvgText>
                </>
              ) : null}
              {pick !== null ? <Rect x={x(pick) - 1} y={52} width={2} height={12} fill={colors.accent} /> : null}
            </Svg>
          ) : (
            <View style={{ height: 86 }} />
          )}
          {pick !== null && width > 0 ? (
            <Pressable
              onPress={(e) => {
                const v = Math.round(((e.nativeEvent.locationX - PAD) / (width - 2 * PAD)) * 100);
                haptic.select();
                onPick(Math.max(TT_MIN, Math.min(TT_MAX, v)));
              }}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : null}
        </View>
        <AppText variant="caption" color={colors.textBody} tabular>
          Average {s.average.toFixed(2)} → target ⅔ × {s.average.toFixed(2)} = {s.target.toFixed(2)}
          {pick !== null ? ' · tap the line to aim' : ''}
        </AppText>
        <AppText variant="small" weight="semibold" color={w.player ? colors.success : colors.rivalText} accessibilityLiveRegion="polite">
          {verdict}
        </AppText>
      </Panel>
    </FadeInOnce>
  );
}
