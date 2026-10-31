import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AppText } from '@/src/components/ui/AppText';
import type { MeridianTheme } from '@/src/stories/meridian/direction';
import { encounterSound } from '@/src/stories/meridian/direction';
import { type MatchResult, type Move, type StarterId, type StrategyId, type Tournament, replayFrames, standingOf } from '@/src/stories/meridian/engine';
import { radius, space } from '@/src/theme/tokens';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { storySfx } from '../audio/session';
import { Glyph, MERIDIAN, MoveToken, STRATEGY_COLOR, moveWord, nameOf, ordinal } from './MeridianArt';

/**
 * The moving parts of the Meridian Trials: the arena behind everything, the strategies' living sigils, the encounter
 * between two moves, and the tournament watched as it happens. All of it animates from real results: nothing here
 * decides an outcome, and under reduced motion each piece simply shows its end state.
 */

const THEMES: Record<MeridianTheme, { glow: string; ring: string; rings: number[]; speed: number; bg: string; square: boolean }> = {
  neutral: { glow: '#4f46e5', ring: '#818CF8', rings: [1, 0.72, 0.46], speed: 120000, bg: MERIDIAN.bg, square: false },
  // The Garden opens out: wide, slow, warm.
  garden: { glow: '#0f9d76', ring: '#5EEAD4', rings: [1.25, 0.9, 0.55], speed: 180000, bg: '#06120f', square: false },
  // The Iron Hall closes in: tight, faster, square-cut.
  iron: { glow: '#9f1239', ring: '#FB7185', rings: [0.8, 0.62, 0.44, 0.26], speed: 60000, bg: '#12070b', square: true },
  // The Fog: the rings are still there, but you can't quite trust them.
  fog: { glow: '#475569', ring: '#CBD5E1', rings: [1, 0.72, 0.46], speed: 150000, bg: '#0a0d13', square: false },
};

/** The hall, behind every step of the story. Changing the room changes this first: you feel it before you read it. */
export function Arena({ theme }: { theme: MeridianTheme }) {
  const { width, height } = useWindowDimensions();
  const reduced = useMotionReduced();
  const t = THEMES[theme];
  const spin = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    spin.set(0);
    spin.set(withRepeat(withTiming(360, { duration: t.speed, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(spin);
  }, [reduced, t.speed, spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  const size = Math.max(width, height) * 0.9;
  const cx = size / 2;
  const r = size * 0.34;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, overflow: 'hidden' }]} pointerEvents="none">
      <Animated.View key={theme} entering={reduced ? undefined : FadeIn.duration(1400)} style={StyleSheet.absoluteFill}>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={`arena-${theme}`} cx="50%" cy="34%" r="62%">
              <Stop offset="0" stopColor={t.glow} stopOpacity={0.3} />
              <Stop offset="1" stopColor={t.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={width} height={height} fill={`url(#arena-${theme})`} />
        </Svg>
        <Animated.View style={[{ position: 'absolute', left: (width - size) / 2, top: height * 0.34 - size / 2, width: size, height: size }, style]}>
          <Svg width={size} height={size}>
            {t.rings.map((k) =>
              t.square ? (
                <Rect key={k} x={cx - r * k} y={cx - r * k} width={2 * r * k} height={2 * r * k} stroke={t.ring} strokeOpacity={0.14} strokeWidth={1} fill="none" />
              ) : (
                <Circle key={k} cx={cx} cy={cx} r={r * k} stroke={t.ring} strokeOpacity={0.14} strokeWidth={1} strokeDasharray={theme === 'fog' ? '2 9' : undefined} fill="none" />
              ),
            )}
            {[0, 30, 60, 90, 120, 150].map((a) => {
              const c = Math.cos((a * Math.PI) / 180) * r * 1.3;
              const s = Math.sin((a * Math.PI) / 180) * r * 1.3;
              return <Line key={a} x1={cx - c} y1={cx - s} x2={cx + c} y2={cx + s} stroke={t.ring} strokeOpacity={0.05} />;
            })}
          </Svg>
        </Animated.View>
        {theme === 'fog' ? <FogVeil reduced={reduced} width={width} height={height} /> : null}
      </Animated.View>
    </View>
  );
}

/** Controlled disruption: slow banks of fog, and now and then a line of static, as the simulation's noise. */
function FogVeil({ reduced, width, height }: { reduced: boolean; width: number; height: number }) {
  const x = useSharedValue(0);
  const flick = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    x.set(withRepeat(withSequence(withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 16000, easing: Easing.inOut(Easing.sin) })), -1, false));
    flick.set(withRepeat(withSequence(withDelay(3600, withTiming(1, { duration: 50 })), withTiming(0, { duration: 90 }), withDelay(1400, withTiming(0.7, { duration: 40 })), withTiming(0, { duration: 120 })), -1, false));
    return () => {
      cancelAnimation(x);
      cancelAnimation(flick);
    };
  }, [reduced, x, flick]);
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: (x.get() - 0.5) * width * 0.3 }] }));
  const flicker = useAnimatedStyle(() => ({ opacity: flick.get() * 0.5 }));
  return (
    <>
      <Animated.View style={[{ position: 'absolute', left: -width * 0.3, top: 0, width: width * 1.6, height }, drift]}>
        <Svg width={width * 1.6} height={height}>
          <Defs>
            <RadialGradient id="fog-bank" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#CBD5E1" stopOpacity={0.14} />
              <Stop offset="1" stopColor="#CBD5E1" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={width * 0.4} cy={height * 0.25} r={width * 0.7} fill="url(#fog-bank)" />
          <Circle cx={width * 1.1} cy={height * 0.6} r={width * 0.8} fill="url(#fog-bank)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 0, top: height * 0.42, width, height: 2, backgroundColor: '#E2E8F0' }, flicker]} />
      <Animated.View style={[{ position: 'absolute', left: width * 0.2, top: height * 0.18, width: width * 0.5, height: 1, backgroundColor: '#E2E8F0' }, flicker]} />
    </>
  );
}

/**
 * The three starting strategies, each alive in its own way. The Open Hand opens and gives out; the Mirror's halves
 * answer one another; the Iron Wall doesn't move at all, which is the point.
 */
export function LivingSigil({ id, size = 44 }: { id: StarterId; size?: number }) {
  const reduced = useMotionReduced();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced || id === 'iron-wall') return;
    p.set(withRepeat(withSequence(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.sin) })), -1, false));
    return () => cancelAnimation(p);
  }, [reduced, id, p]);
  const ripple = useAnimatedStyle(() => ({ opacity: (1 - p.get()) * 0.6, transform: [{ scale: 0.72 + p.get() * 0.5 }] }));
  const breath = useAnimatedStyle(() => ({ transform: [{ scale: 0.96 + p.get() * 0.06 }] }));
  const left = useAnimatedStyle(() => ({ transform: [{ translateX: -p.get() * size * 0.07 }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ translateX: p.get() * size * 0.07 }] }));
  const color = STRATEGY_COLOR[id];
  const box = { position: 'absolute' as const, left: 0, top: 0, width: size, height: size };
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {id === 'open-hand' ? (
        <>
          <Animated.View style={[box, ripple]}>
            <Svg width={size} height={size} viewBox="0 0 24 24">
              <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1} fill="none" />
            </Svg>
          </Animated.View>
          <Animated.View style={[box, breath]}>
            <Glyph id="open-hand" size={size} />
          </Animated.View>
        </>
      ) : null}
      {id === 'mirror' ? (
        <>
          <Animated.View style={[box, left]}>
            <Svg width={size} height={size} viewBox="0 0 24 24">
              <Path d="M10 4 A 8 8 0 0 0 10 20" stroke={color} strokeWidth={2} fill="none" />
            </Svg>
          </Animated.View>
          <Animated.View style={[box, right]}>
            <Svg width={size} height={size} viewBox="0 0 24 24">
              <Path d="M14 4 A 8 8 0 0 1 14 20" stroke={color} strokeWidth={2} fill="none" />
            </Svg>
          </Animated.View>
        </>
      ) : null}
      {id === 'iron-wall' ? <Glyph id="iron-wall" size={size} /> : null}
    </View>
  );
}

/**
 * One round, played out: both moves arrive from their own sides and meet. Sharing lights up the space between them;
 * a lone take goes through the sharer, who dims; two takes knock each other back. The numbers are the matrix's.
 */
export function Encounter({ you, them, youPoints, themPoints, themName = 'Opponent', roundKey, quiet }: { you: Move; them: Move; youPoints: number; themPoints: number; themName?: string; roundKey: string | number; /** Seen before: no sound this time. */ quiet?: boolean }) {
  const reduced = useMotionReduced();
  const p = useSharedValue(reduced ? 1 : 0);
  const hit = useSharedValue(reduced ? 1 : 0);
  const [landed, setLanded] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      p.set(1);
      hit.set(1);
      return;
    }
    p.set(0);
    hit.set(0);
    p.set(withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) }));
    hit.set(withDelay(420, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) })));
    const h = setTimeout(() => {
      setLanded(true);
      if (quiet) return;
      storySfx(`meridian/sfx/${encounterSound(you, them)}`);
      haptic.commit();
    }, 420);
    return () => {
      clearTimeout(h);
      setLanded(false);
    };
  }, [roundKey, you, them, reduced, p, hit, quiet]);

  const gap = 70;
  const sideStyle = (dir: -1 | 1, mine: Move, other: Move) => {
    'worklet';
    const pre = dir * gap * (1 - p.get());
    // A take presses on through a sharer; a sharer who was taken from falls back; two takers recoil.
    const after = mine === 'D' && other === 'C' ? -dir * 12 * hit.get() : mine === 'C' && other === 'D' ? dir * 16 * hit.get() : mine === 'D' ? dir * 14 * hit.get() : 0;
    const scale = mine === 'C' && other === 'D' ? 1 - 0.38 * hit.get() : 1;
    const opacity = mine === 'C' && other === 'D' ? 1 - 0.55 * hit.get() : 1;
    return { transform: [{ translateX: pre + after }, { scale }], opacity };
  };
  const leftStyle = useAnimatedStyle(() => sideStyle(-1, you, them));
  const rightStyle = useAnimatedStyle(() => sideStyle(1, them, you));
  const burst = useAnimatedStyle(() => ({ opacity: (1 - hit.get()) * (p.get() > 0.98 ? 1 : 0), transform: [{ scale: 0.4 + hit.get() * 2.2 }] }));
  const glow = useAnimatedStyle(() => ({ opacity: hit.get() * 0.55 }));
  const color = you === 'C' && them === 'C' ? MERIDIAN.share : you === 'D' && them === 'D' ? MERIDIAN.take : MERIDIAN.gold;

  return (
    <View style={styles.encounter} accessible accessibilityLabel={`You ${moveWord(you).toLowerCase()}, ${themName} ${moveWord(them).toLowerCase()}. You get ${youPoints}, they get ${themPoints}.`}>
      <View style={styles.side}>
        <AppText variant="caption" color={MERIDIAN.muted}>You</AppText>
        {landed ? (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(280)}>
            <AppText variant="title" color={MERIDIAN.gold} tabular>{youPoints}</AppText>
          </Animated.View>
        ) : <View style={{ height: 30 }} />}
      </View>
      <View style={styles.pit}>
        {you === 'C' && them === 'C' ? (
          <Animated.View style={[styles.accord, glow]}>
            <Svg width={84} height={44}>
              <Defs>
                <RadialGradient id="accord" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={MERIDIAN.share} stopOpacity={0.8} />
                  <Stop offset="1" stopColor={MERIDIAN.share} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect width={84} height={44} fill="url(#accord)" />
            </Svg>
          </Animated.View>
        ) : null}
        <Animated.View style={[styles.burst, { borderColor: color }, burst]} />
        <Animated.View style={[styles.token, { marginRight: 2 }, leftStyle]}>
          <MoveToken move={you} size={30} />
        </Animated.View>
        <Animated.View style={[styles.token, { marginLeft: 2 }, rightStyle]}>
          <MoveToken move={them} size={30} />
        </Animated.View>
      </View>
      <View style={styles.side}>
        <AppText variant="caption" color={MERIDIAN.muted} numberOfLines={1}>{themName}</AppText>
        {landed ? (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(280)}>
            <AppText variant="title" color={MERIDIAN.text} tabular>{themPoints}</AppText>
          </Animated.View>
        ) : <View style={{ height: 30 }} />}
      </View>
    </View>
  );
}

/** A match drawn token by token, so you can watch one move set off the next. A ring and a small sound mark a slip. */
export function PlayedStrip({ match, a, b, stepMs = 150, quiet }: { match: MatchResult; a: { id: StrategyId; name: string }; b: { id: StrategyId; name: string }; stepMs?: number; quiet?: boolean }) {
  const reduced = useMotionReduced();
  const { width } = useWindowDimensions();
  const n = match.rounds.length;
  const [shown, setShown] = useState(reduced ? n : 0);
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setShown((s) => (s >= n ? s : s + 1)), stepMs);
    return () => clearInterval(timer);
  }, [n, stepMs, reduced]);
  useEffect(() => {
    const r = match.rounds[shown - 1];
    if (!quiet && r && (r.a !== r.ia || r.b !== r.ib)) storySfx('meridian/sfx/slip');
  }, [shown, match, quiet]);
  const size = Math.max(6, Math.min(18, Math.floor((Math.min(width - space.xl * 2 - space.lg * 2, 520) - 30) / n) - 2));
  const label = `${a.name} scored ${match.a}, ${b.name} scored ${match.b} over ${n} rounds. ${a.name}: ${match.rounds.map((r) => moveWord(r.a)).join(', ')}. ${b.name}: ${match.rounds.map((r) => moveWord(r.b)).join(', ')}.`;
  const row = (side: 'a' | 'b') => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Glyph id={side === 'a' ? a.id : b.id} size={20} />
      <View style={{ flexDirection: 'row', gap: 2, flex: 1 }}>
        {match.rounds.map((r, i) => (
          <View key={i} style={{ width: size, height: size }}>
            {i < shown ? (
              <Animated.View entering={reduced ? undefined : FadeIn.duration(140)}>
                <MoveToken move={r[side]} size={size} slipped={side === 'a' ? r.a !== r.ia : r.b !== r.ib} />
              </Animated.View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={label}>
      {row('a')}
      {row('b')}
    </View>
  );
}

/**
 * The tournament, watched: pairings are revealed one after another and the table re-sorts itself as they land. Every
 * frame is computed from the real results (see `replayFrames`), so the leader who emerges is the real one, and any
 * lead that doesn't last was a real lead too. It can be skipped; it shows the result outright under reduced motion.
 */
export function TournamentReplay({ t, yoursName, stepMs = 150, onDone, onSelect, selected, autoStart = true }: { t: Tournament; yoursName: string; stepMs?: number; onDone?: () => void; onSelect?: (id: StrategyId) => void; selected?: StrategyId | null; autoStart?: boolean }) {
  const reduced = useMotionReduced();
  const frames = useMemo(() => replayFrames(t), [t]);
  const last = frames.length - 1;
  const [frame, setFrame] = useState(reduced || !autoStart ? last : 0);
  const done = frame >= last;
  const notified = useRef(false);

  useEffect(() => {
    if (done || reduced) return;
    const timer = setInterval(() => setFrame((f) => Math.min(last, f + 1)), stepMs);
    return () => clearInterval(timer);
  }, [done, reduced, stepMs, last]);

  useEffect(() => {
    if (frame > 0 && frame % 4 === 0 && !done) storySfx('meridian/sfx/tick', 0.7);
    if (done && !notified.current) {
      notified.current = true;
      if (frame > 0 && !reduced && autoStart) storySfx('meridian/sfx/crown');
      onDone?.();
    }
  }, [frame, done, reduced, onDone, autoStart]);

  const f = frames[frame];
  const n = t.standings.length;
  const scores = f.order.map((x) => x.score);
  const max = Math.max(...scores, 0.01);
  const min = done ? Math.min(...scores) : 0;
  const lo = done ? Math.max(0, min - (max - min) * 0.6 - 0.1) : 0;
  const pairNames = f.pair ? `${nameOf(t.ids[f.pair[0]], yoursName)} meets ${f.pair[0] === f.pair[1] ? 'its twin' : nameOf(t.ids[f.pair[1]], yoursName)}` : 'The first pairings are being drawn';

  return (
    <View style={{ gap: 4 }}>
      {!done ? (
        <View style={styles.ticker}>
          {f.pair ? <Glyph id={t.ids[f.pair[0]]} size={18} /> : null}
          {f.pair ? <Glyph id={t.ids[f.pair[1]]} size={18} /> : null}
          <AppText variant="caption" color={MERIDIAN.text} numberOfLines={1} style={{ flex: 1 }}>
            {pairNames}
          </AppText>
          <Pressable onPress={() => setFrame(last)} accessibilityRole="button" accessibilityLabel="Skip to the results" hitSlop={10} style={{ minHeight: 32, justifyContent: 'center' }}>
            <AppText variant="caption" weight="semibold" color={MERIDIAN.accentText}>
              Skip
            </AppText>
          </Pressable>
        </View>
      ) : null}
      {f.order.map((row) => {
        const final = done ? standingOf(t, row.id) : null;
        const mine = row.id === 'yours';
        const count = t.counts[row.index];
        const name = nameOf(row.id, yoursName) + (count > 1 ? ` ×${count}` : '');
        const pct = Math.max(2, ((row.score - lo) / (max - lo || 1)) * 100);
        const inPlay = !!f.pair && (f.pair[0] === row.index || f.pair[1] === row.index);
        return (
          <Animated.View key={row.id} layout={reduced ? undefined : LinearTransition.duration(Math.min(240, stepMs))}>
            <Pressable
              disabled={!onSelect || !done}
              onPress={() => onSelect?.(row.id)}
              accessibilityRole={onSelect && done ? 'button' : undefined}
              accessibilityState={onSelect ? { selected: selected === row.id } : undefined}
              accessibilityLabel={final ? `${ordinal(final.rank)}: ${name}, ${final.score.toFixed(2)} points per round, out-scored ${final.won} of ${n} opponents head to head${onSelect ? '. Show your match against it' : ''}` : `${name}, ${row.score.toFixed(2)} so far`}
              style={[styles.row, { backgroundColor: selected === row.id ? 'rgba(125,211,252,0.12)' : mine ? 'rgba(253,230,138,0.08)' : inPlay ? 'rgba(255,255,255,0.05)' : 'transparent', borderColor: mine ? 'rgba(253,230,138,0.4)' : 'transparent' }]}>
              <AppText variant="caption" color={MERIDIAN.muted} tabular style={{ width: 22 }}>
                {final ? final.rank : ''}
              </AppText>
              <Glyph id={row.id} size={18} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
                  <AppText variant="small" weight={mine ? 'semibold' : 'regular'} color={mine ? MERIDIAN.gold : MERIDIAN.text} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {name}
                  </AppText>
                  <AppText variant="small" color={MERIDIAN.text} tabular>
                    {row.score.toFixed(2)}
                  </AppText>
                </View>
                <View style={styles.track}>
                  <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: STRATEGY_COLOR[row.id], opacity: mine ? 1 : 0.75 }} />
                </View>
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
      <AppText variant="caption" color={MERIDIAN.muted}>
        Average points per round against everyone in the room.
      </AppText>
    </View>
  );
}

/** Words that have to wait for the thing they describe, so the result is seen before it's explained. */
export function AfterReveal({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  const reduced = useMotionReduced();
  if (!ready) return null;
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(600)} exiting={reduced ? undefined : FadeOut.duration(200)} style={{ gap: space.lg }}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  encounter: { flexDirection: 'row', alignItems: 'center', backgroundColor: MERIDIAN.panel, borderRadius: radius.lg, borderWidth: 1, borderColor: MERIDIAN.border, paddingVertical: space.lg, paddingHorizontal: space.md, gap: space.sm },
  side: { width: 64, alignItems: 'center', gap: 2 },
  pit: { flex: 1, height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  token: { width: 30, height: 30 },
  burst: { position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 2 },
  accord: { position: 'absolute', width: 84, height: 44 },
  ticker: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: MERIDIAN.border, backgroundColor: MERIDIAN.panel, marginBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 5, paddingHorizontal: space.sm, borderRadius: radius.sm, borderWidth: 1, minHeight: 44 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
});
