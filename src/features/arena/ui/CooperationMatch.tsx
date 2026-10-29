import { router } from 'expo-router';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '@/src/components/lesson/AnimatedNumber';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Badge } from '@/src/components/ui/Card';
import { Button, IconButton } from '@/src/components/ui/Button';
import { ArrowLeft, BookOpen, Check, ChevronDown, Link2, Lock, Unlink } from '@/src/components/ui/icons';
import { ARENA, LENGTH_LABEL, LEVEL_LABEL, opponentInfo } from '@/src/arena/catalog';
import type { Level, MatchLength } from '@/src/arena/core';
import { COOP_NAME, COOP_PAYOFFS, type CoopMove, type CoopOpponent, type CoopRound, type CoopSetup, type CoopState, type CoopVariant, cooperation, coopPayoff } from '@/src/arena/cooperation';
import { coopBriefing, coopOutcomeText, coopRevealNote, opponentPatterns } from '@/src/arena/cooperation-analysis';
import { MiniMatrix } from '@/src/features/games/ui/common';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';
import { useArenaRecords } from '../records';
import { useArenaMatch } from '../useArenaMatch';
import { CoopResults } from './CoopResults';
import { CoachTip, PERSONA_ICON, Row, signed } from './parts';

export const MOVE_LABEL: Record<CoopMove, string> = { C: 'Cooperate', D: 'Defect' };
const MOVES: readonly CoopMove[] = ['C', 'D'];
export const moveTint = (m: CoopMove) => (m === 'C' ? { fg: colors.primaryText, solid: colors.primary, bg: colors.primarySoft } : { fg: colors.rivalText, solid: colors.rival, bg: colors.rivalSoft });
export const MoveIcon = ({ m, size = 22 }: { m: CoopMove; size?: number }) => (m === 'C' ? <Link2 size={size} color={moveTint(m).fg} strokeWidth={2.2} /> : <Unlink size={size} color={moveTint(m).fg} strokeWidth={2.2} />);

type View_ = 'decide' | 'reveal' | 'results';

/**
 * A Cooperation Game match: briefing → secret decision → reveal → next round, then a results screen. The engine owns
 * every rule and score; this component only sequences what the player sees. Leaving the screen discards the match —
 * there is no half-resolved round to come back to.
 */
export function CooperationMatch({
  persona,
  level,
  length,
  variant,
  seed,
  onPlayAgain,
}: {
  persona: CoopOpponent;
  level: Level;
  length: MatchLength;
  variant: CoopVariant;
  seed: number;
  onPlayAgain: () => void;
}) {
  const insets = useSafeAreaInsets();
  const setup: CoopSetup = { persona, level, length, variant, seed };
  const { state, act, result, newBest } = useArenaMatch(cooperation, setup);
  const coached = useArenaRecords((s) => s.coached.cooperation);
  const [view, setView] = useState<View_>('decide');
  const [tipHidden, setTipHidden] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const g = ARENA.cooperation;
  const name = COOP_NAME[persona];
  const h = state.rounds;

  useEffect(() => {
    void useArenaRecords.getState().load();
  }, []);

  const commit = (move: CoopMove) => {
    if (view !== 'decide') return;
    haptic.commit();
    act({ move, round: h.length });
    setView('reveal');
  };
  const next = () => {
    setView(h.length >= state.total ? 'results' : 'decide');
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/arena/[gameId]', params: { gameId: 'cooperation' } }));
  const change = (n: { persona?: string; level?: Level }) => router.setParams({ persona: n.persona ?? persona, level: n.level ?? level });

  // The round shown: during a reveal, the one just played.
  const shownRound = view === 'reveal' ? h.length : Math.min(h.length + 1, state.total);
  const tip = !coached && !tipHidden && view === 'decide' && h.length < g.coach.length ? g.coach[h.length] : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <Row>
            <IconButton icon={ArrowLeft} label="Back — leaving ends this match" onPress={close} />
            <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1}>
              {g.title}
            </AppText>
            {view !== 'results' ? (
              <Pressable onPress={() => setRulesOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: rulesOpen }} accessibilityLabel="Rules and payoffs" hitSlop={6} style={({ pressed }) => [styles.rulesBtn, pressed && { backgroundColor: colors.surfaceHigh }]}>
                <BookOpen size={16} color={colors.primaryText} />
                <AppText variant="caption" color={colors.primaryText}>
                  Rules
                </AppText>
              </Pressable>
            ) : null}
          </Row>

          {view === 'results' && result ? (
            <CoopResults state={state} result={result} newBest={newBest} onRematch={onPlayAgain} onChange={change} onLibrary={() => router.navigate('/games')} />
          ) : (
            <>
              {rulesOpen ? <RulesCard variant={variant} total={state.total} /> : null}
              <ScoreHeader state={state} view={view} name={name} round={shownRound} />
              <Timeline h={h} total={state.total} current={view === 'decide' ? h.length : -1} />
              {tip ? <CoachTip text={tip} onDismiss={() => setTipHidden(true)} /> : null}
              {view === 'decide' ? <Decision key={h.length} state={state} name={name} onCommit={commit} /> : <Reveal state={state} name={name} onNext={next} />}
              <OpponentCard persona={persona} level={level} length={length} variant={variant} h={h} />
              <MatchHistory h={h} name={name} />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** Scores and progress. During a reveal the totals count up from the previous round. */
function ScoreHeader({ state, view, name, round }: { state: CoopState; view: View_; name: string; round: number }) {
  const h = state.rounds;
  const you = h.reduce((t, r) => t + r.ps, 0);
  const them = h.reduce((t, r) => t + r.bs, 0);
  const left = state.total - h.length;
  return (
    <View style={styles.score} accessible accessibilityLabel={`Round ${round} of ${state.total}. You ${you}, ${name} ${them}. ${left} rounds left.`}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="caption" color={colors.primaryText}>
          You
        </AppText>
        <AnimatedNumber value={you} variant="title" duration={view === 'reveal' ? 450 : 0} />
      </View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <AppText variant="overline" color={colors.textMuted}>
          Round
        </AppText>
        <AppText variant="bodyStrong" tabular>
          {round} of {state.total}
        </AppText>
        <AppText variant="caption" color={left <= 1 ? colors.insight : colors.textMuted}>
          {left === 0 ? 'match complete' : `${left} left`}
        </AppText>
      </View>
      <View style={{ flex: 1, gap: 2, alignItems: 'flex-end' }}>
        <AppText variant="caption" color={colors.rivalText} numberOfLines={1}>
          {name.replace(/^The /, '')}
        </AppText>
        <AnimatedNumber value={them} variant="title" duration={view === 'reveal' ? 450 : 0} />
      </View>
    </View>
  );
}

/** One cell per round: your move over theirs once played, the current round ringed, the rest empty. */
const Timeline = memo(function Timeline({ h, total, current }: { h: readonly CoopRound[]; total: number; current: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }} accessible accessibilityLabel={`Rounds: ${h.length} played of ${total}.${h.length ? ` Last round: you ${MOVE_LABEL[h[h.length - 1].p]}, opponent ${MOVE_LABEL[h[h.length - 1].b]}.` : ''}`}>
      {Array.from({ length: total }, (_, i) => {
        const r = h[i];
        const now = i === current;
        return (
          <View key={i} style={[styles.cell, now && { borderColor: colors.insight, borderWidth: 2 }, !r && !now && { opacity: 0.55 }]}>
            {r ? (
              <>
                <View style={[styles.half, { backgroundColor: moveTint(r.p).solid }]}>
                  <AppText variant="caption" color={colors.text} style={styles.letter}>
                    {r.p}
                  </AppText>
                </View>
                <View style={[styles.half, { backgroundColor: moveTint(r.b).solid, opacity: 0.85 }]}>
                  <AppText variant="caption" color={colors.text} style={styles.letter}>
                    {r.b}
                  </AppText>
                </View>
              </>
            ) : (
              <AppText variant="caption" color={now ? colors.insight : colors.textFaint} style={styles.letter}>
                {i + 1}
              </AppText>
            )}
          </View>
        );
      })}
    </View>
  );
});

function Decision({ state, name, onCommit }: { state: CoopState; name: string; onCommit: (m: CoopMove) => void }) {
  const { width } = useWindowDimensions();
  const stacked = width < 360;
  const [picked, setPicked] = useState<CoopMove | null>(null);
  const pay = COOP_PAYOFFS[state.setup.variant];
  const briefing = coopBriefing(state.rounds, state.total);
  const pick = (m: CoopMove) => {
    if (picked) return;
    setPicked(m);
    onCommit(m);
  };
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.briefing} accessibilityLiveRegion="polite">
        <AppText variant="small" color={colors.textBody}>
          {briefing}
        </AppText>
      </View>
      <Row style={{ justifyContent: 'center' }}>
        <Lock size={13} color={colors.textMuted} />
        <AppText variant="caption" color={colors.textMuted}>
          {name} has locked its choice. It can’t see yours.
        </AppText>
      </Row>
      <View style={{ flexDirection: stacked ? 'column' : 'row', gap: space.md }}>
        {MOVES.map((m) => {
          const [ifC] = coopPayoff(pay, m, 'C');
          const [ifD] = coopPayoff(pay, m, 'D');
          const t = moveTint(m);
          const on = picked === m;
          return (
            <Pressable
              key={m}
              onPress={() => pick(m)}
              disabled={!!picked}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: !!picked }}
              accessibilityLabel={`${MOVE_LABEL[m]}. ${m === 'C' ? 'Build a better outcome together.' : 'Take the immediate advantage.'} You get ${ifC} if they cooperate, ${ifD} if they defect.`}
              style={({ pressed }) => [styles.choice, stacked ? styles.choiceStacked : styles.choiceSide, { borderColor: on ? t.solid : colors.border }, (pressed || on) && { backgroundColor: t.bg }]}>
              <View style={[styles.choiceIcon, { backgroundColor: t.bg }]}>{on ? <Check size={24} color={t.fg} strokeWidth={2.6} /> : <MoveIcon m={m} size={24} />}</View>
              <View style={{ flex: stacked ? 1 : undefined, alignItems: stacked ? 'flex-start' : 'center', gap: 2 }}>
                <AppText variant="heading" color={colors.text}>
                  {on ? 'Locked in' : MOVE_LABEL[m]}
                </AppText>
                <AppText variant="small" color={colors.textBody} align={stacked ? 'left' : 'center'}>
                  {m === 'C' ? 'Build a better outcome together.' : 'Take the immediate advantage.'}
                </AppText>
                <AppText variant="caption" color={colors.textMuted} align={stacked ? 'left' : 'center'}>
                  {signed(ifC)} if they cooperate · {signed(ifD)} if they defect
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Reveal({ state, name, onNext }: { state: CoopState; name: string; onNext: () => void }) {
  const reduced = useMotionReduced();
  const h = state.rounds;
  const r = h[h.length - 1];
  if (!r) return null;
  const left = state.total - h.length;
  const note = coopRevealNote(h);
  const slip = [r.p !== r.pi ? `Your ${MOVE_LABEL[r.pi]} slipped and was delivered as ${MOVE_LABEL[r.p]}.` : null, r.b !== r.bi ? `Its choice slipped: it meant to ${MOVE_LABEL[r.bi].toLowerCase()}.` : null].filter(Boolean).join(' ');
  const enter = (delay: number) => (reduced ? undefined : ZoomIn.duration(200).delay(delay));
  const fade = (delay: number) => (reduced ? undefined : FadeIn.duration(220).delay(delay));
  return (
    <View style={{ gap: space.md }}>
      <AppText variant="overline" color={colors.textMuted} align="center">
        Round {h.length} revealed
      </AppText>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Animated.View entering={enter(0)} style={[styles.chip, { borderColor: moveTint(r.p).solid }]}>
          <AppText variant="caption" color={colors.textMuted}>
            You · locked in
          </AppText>
          <MoveIcon m={r.p} size={26} />
          <AppText variant="bodyStrong" color={moveTint(r.p).fg}>
            {MOVE_LABEL[r.p]}
          </AppText>
          <AppText variant="heading" tabular>
            {signed(r.ps)}
          </AppText>
        </Animated.View>
        <Animated.View entering={enter(180)} style={[styles.chip, { borderColor: moveTint(r.b).solid }]}>
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
            {name.replace(/^The /, '')}
          </AppText>
          <MoveIcon m={r.b} size={26} />
          <AppText variant="bodyStrong" color={moveTint(r.b).fg}>
            {MOVE_LABEL[r.b]}
          </AppText>
          <AppText variant="heading" tabular>
            {signed(r.bs)}
          </AppText>
        </Animated.View>
      </View>
      <Animated.View entering={fade(260)} style={styles.outcome}>
        <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
          {coopOutcomeText(r)}
        </AppText>
        {slip ? (
          <AppText variant="small" color={colors.insight}>
            {slip}
          </AppText>
        ) : null}
        {note ? (
          <AppText variant="small" color={colors.textMuted}>
            {note}
          </AppText>
        ) : null}
      </Animated.View>
      <Button label={left === 0 ? 'View Results' : left === 1 ? 'Final Round' : 'Next Round'} onPress={onNext} />
    </View>
  );
}

function OpponentCard({ persona, level, length, variant, h }: { persona: CoopOpponent; level: Level; length: MatchLength; variant: CoopVariant; h: readonly CoopRound[] }) {
  const info = opponentInfo('cooperation', persona)!;
  const Icon = PERSONA_ICON[persona];
  const { summary, notes } = opponentPatterns(h);
  const v = ARENA.cooperation.variants.find((x) => x.id === variant)!;
  return (
    <View style={styles.card}>
      <Row>
        <View style={styles.avatar}>
          <Icon size={20} color={colors.rivalText} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">{info.name}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {info.summary}
          </AppText>
        </View>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        <Badge label={LEVEL_LABEL[level]} />
        <Badge label={`${LENGTH_LABEL[length]} · ${h.length ? `${h.length} played` : 'new match'}`} tone="blue" />
        {v.challenge ? <Badge label={v.name} tone="amber" /> : null}
      </View>
      <View style={{ gap: 4 }}>
        <AppText variant="caption" color={colors.textMuted}>
          What it has done so far
        </AppText>
        {h.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }} accessible accessibilityLabel={`Its moves: ${h.map((r) => MOVE_LABEL[r.b]).join(', ')}.`}>
            {h.map((r, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: moveTint(r.b).solid }]}>
                <AppText variant="caption" color={colors.text} style={styles.letter}>
                  {r.b}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
        <AppText variant="small" weight="semibold" color={colors.text}>
          {summary}
        </AppText>
        {notes.map((n) => (
          <AppText key={n} variant="small" color={colors.textBody}>
            {n}
          </AppText>
        ))}
      </View>
    </View>
  );
}

function MatchHistory({ h, name }: { h: readonly CoopRound[]; name: string }) {
  const [open, setOpen] = useState(false);
  if (!h.length) return null;
  let you = 0;
  let them = 0;
  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }}>
        <AppText variant="overline" color={colors.textMuted} style={{ flex: 1 }}>
          Match history · {h.length} round{h.length === 1 ? '' : 's'}
        </AppText>
        <ChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open
        ? h.map((r, i) => {
            you += r.ps;
            them += r.bs;
            return (
              <Row key={i} style={styles.histRow}>
                <AppText variant="caption" color={colors.textMuted} tabular style={{ width: 26 }}>
                  R{i + 1}
                </AppText>
                <AppText variant="small" color={moveTint(r.p).fg} style={{ width: 78 }}>
                  {MOVE_LABEL[r.p]}
                </AppText>
                <AppText variant="small" color={moveTint(r.b).fg} style={{ flex: 1 }} numberOfLines={1}>
                  {MOVE_LABEL[r.b]}
                </AppText>
                <AppText variant="small" tabular color={colors.textBody}>
                  {signed(r.ps)} / {signed(r.bs)}
                </AppText>
                <AppText variant="caption" tabular color={colors.textMuted} style={{ width: 46, textAlign: 'right' }}>
                  {you}–{them}
                </AppText>
              </Row>
            );
          })
        : null}
      {open ? (
        <AppText variant="caption" color={colors.textFaint}>
          You · {name.replace(/^The /, '')} · points this round · running total
        </AppText>
      ) : null}
    </View>
  );
}

function RulesCard({ variant, total }: { variant: CoopVariant; total: number }) {
  const g = ARENA.cooperation;
  const pay = COOP_PAYOFFS[variant];
  return (
    <View style={[styles.card, { borderColor: 'rgba(147,180,248,0.35)' }]}>
      <AppText variant="overline" color={colors.primaryText}>
        Rules · this match
      </AppText>
      <MiniMatrix moves={MOVES} labels={MOVE_LABEL} payoff={(p, b) => coopPayoff(pay, p, b)} />
      {g.rules.slice(0, 1).concat(g.rules.slice(2)).map((r) => (
        <AppText key={r} variant="small" color={colors.textBody}>
          {r}
        </AppText>
      ))}
      <AppText variant="caption" color={colors.textMuted}>
        This match: {total} rounds{variant === 'noisy' ? ' · 10% of choices slip and are shown after the round' : ''}. Opening the rules doesn’t affect the round.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  rulesBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  score: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
  cell: { width: 22, height: 30, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  half: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 10, lineHeight: 12 },
  briefing: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.insight },
  choice: { alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.lg, borderRadius: radius.xl, borderWidth: 2, backgroundColor: colors.surface },
  // Side by side on wider phones; a full-width row each on narrow ones (< 360 dp), so neither card gets cramped.
  choiceSide: { flex: 1, minHeight: 168 },
  choiceStacked: { flexDirection: 'row', justifyContent: 'flex-start', gap: space.md, minHeight: 96 },
  choiceIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  chip: { flex: 1, alignItems: 'center', gap: 4, padding: space.md, borderRadius: radius.lg, borderWidth: 2, backgroundColor: colors.bgRaised },
  outcome: { gap: space.xs, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  card: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.rivalSoft, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  histRow: { paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
});
