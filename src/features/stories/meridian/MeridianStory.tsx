import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from '@/src/components/lesson/AnimatedNumber';
import { AppText } from '@/src/components/ui/AppText';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import {
  type Design,
  type Move,
  NOISE,
  PAYOFFS,
  ROOMS,
  type RoomId,
  STARTERS,
  STARTER_DESIGN,
  STRATEGIES,
  type StarterId,
  type StrategyId,
  clearAir,
  entrant,
  evolve,
  MATCH_ROUNDS,
  placeOf,
  playMatch,
  runRoom,
  standingOf,
  yours,
} from '@/src/stories/meridian/engine';
import { BANDS, BAND_LABEL, type MeridianRun, NEW_RUN, REPEAT_ROUNDS, STEPS, STEP_TITLE, type Why, bandIn, mirrorReply } from '@/src/stories/meridian/run';
import { MAX_CONTENT_WIDTH, radius, space } from '@/src/theme/tokens';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { useStories } from '../store';
import { ContinueButton, OptionButton, Reflection, type ReflectionContent, StoryIntro, type StoryTone, StoryTopBar } from '../ui/kit';
import { BarList, Glyph, HallArt, Leaderboard, MERIDIAN, MatchStrip, MatchTotals, MoveToken, PopulationChart, STRATEGY_COLOR, moveWord, nameOf, ordinal } from './MeridianArt';

export const MERIDIAN_TONE: StoryTone = {
  bg: MERIDIAN.bg,
  panel: MERIDIAN.panel,
  border: MERIDIAN.border,
  text: MERIDIAN.text,
  muted: MERIDIAN.muted,
  accent: MERIDIAN.accent,
  accentText: MERIDIAN.accentText,
};

const T = MERIDIAN_TONE;

const REFLECTION: ReflectionContent = {
  message: [
    'You came looking for the best strategy.',
    'But a strategy never plays alone. It meets other strategies, under particular rules, in a room that can change — and that its own success helps to change.',
    'Sometimes you gain more by shaping the conditions so that cooperating becomes worthwhile than by trying to outsmart everyone in the room.',
  ],
  takeaways: [
    { title: 'Understand the incentives', body: 'Before judging a move, look at what each side gains, loses and risks — this round and in the rounds after it.' },
    { title: 'Adapt to the environment', body: 'What works with one person, or under one set of rules, can fail with another. Ask who you are dealing with and how often you will meet.' },
    { title: 'Look for mutual gains', body: 'Not every interaction is zero-sum. Some of the best outcomes are only reachable together — and some rooms really are hostile. Telling them apart is the skill.' },
  ],
  question: 'Where could changing the structure of an interaction create a better outcome than simply trying to win it?',
};

const STARTER_LABEL: Record<StarterId, string> = { 'open-hand': 'The Open Hand', mirror: 'The Mirror', 'iron-wall': 'The Iron Wall' };
const WHY_LABEL: Record<Why, { label: string; detail: string }> = {
  clever: { label: 'The cleverest rule', detail: 'Something that reads its opponents and outthinks them.' },
  tough: { label: 'The toughest rule', detail: 'Something no one can take advantage of.' },
  kind: { label: 'The kindest rule', detail: 'Something that brings out cooperation.' },
};

const isStarterDesign = (d: Design, id: StarterId) => JSON.stringify(d) === JSON.stringify(STARTER_DESIGN[id]);

export function MeridianStory() {
  const loaded = useStories((s) => s.loaded);
  const save = useStories((s) => s.meridian);
  const [mode, setMode] = useState<'intro' | 'story' | 'reflect'>(() => (useStories.getState().meridian?.reflecting ? 'reflect' : 'intro'));

  useEffect(() => {
    void useStories.getState().load().then(() => {
      if (useStories.getState().meridian?.reflecting) setMode('reflect');
    });
  }, []);

  if (!loaded) return <MessageScreen loading />;
  const run = save?.run ?? NEW_RUN;
  const started = !!save && run.step > 0;

  if (mode === 'intro')
    return (
      <StoryIntro
        tone={T}
        kicker="A Tactiqo story"
        title="The Rules of the Game"
        premise="Each autumn, the observatory hall at Meridian holds a tournament where the contestants never move. Their rules play for them. Enter one, and find out what actually wins."
        art={<HallArt height={320} />}
        resumeLabel={started ? STEP_TITLE[STEPS[run.step]] : undefined}
        onBegin={() => {
          if (!save) useStories.getState().restart('meridian');
          setMode('story');
        }}
        onRestart={
          started
            ? () => {
                useStories.getState().restart('meridian');
                setMode('story');
              }
            : undefined
        }
      />
    );

  if (mode === 'reflect' && save)
    return (
      <Reflection
        tone={T}
        content={REFLECTION}
        before={<LookBack run={save.run} />}
        onReplay={() => {
          useStories.getState().restart('meridian');
          setMode('story');
        }}
      />
    );

  return <Steps run={run} onFinish={() => { useStories.getState().reflectMeridian(); setMode('reflect'); }} />;
}

function Steps({ run, onFinish }: { run: MeridianRun; onFinish: () => void }) {
  const step = STEPS[run.step];
  const update = (patch: Partial<MeridianRun>) => useStories.getState().saveMeridian({ ...run, ...patch });
  const advance = () => (run.step >= STEPS.length - 1 ? onFinish() : update({ step: run.step + 1 }));
  const props = { run, update, advance };
  switch (step) {
    case 'enter':
      return <Enter {...props} />;
    case 'pick':
      return <Pick {...props} />;
    case 'single':
      return <Single {...props} />;
    case 'repeat':
      return <Repeat {...props} />;
    case 'echo':
      return <Echo {...props} />;
    case 'tournament':
      return <OpenTrials {...props} />;
    case 'rooms':
      return <Rooms {...props} />;
    case 'population':
      return <Population {...props} />;
    case 'design':
      return <DesignStep {...props} />;
    case 'final':
      return <Final {...props} />;
  }
}

interface StepProps {
  run: MeridianRun;
  update: (patch: Partial<MeridianRun>) => void;
  advance: () => void;
}

/** A step's frame: the top bar, scrolling content, and a footer action. */
function Frame({ run, children, footer }: { run: MeridianRun; children: ReactNode; footer: ReactNode }) {
  const insets = useSafeAreaInsets();
  const reduced = useMotionReduced();
  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StoryTopBar tone={T} title={STEP_TITLE[STEPS[run.step]]} progress={run.step} total={STEPS.length} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: insets.top + 64, paddingBottom: space.xl }}>
        <Animated.View key={run.step} entering={reduced ? undefined : FadeIn.duration(350)} style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: space.lg }}>
          {children}
        </Animated.View>
      </ScrollView>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: insets.bottom + space.lg, borderTopWidth: 1, borderTopColor: T.border }}>
        <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: space.sm }}>{footer}</View>
      </View>
    </View>
  );
}

function P({ children, muted, strong }: { children: ReactNode; muted?: boolean; strong?: boolean }) {
  return (
    <AppText variant={strong ? 'bodyStrong' : 'body'} color={muted ? T.muted : T.text} style={{ fontSize: 17, lineHeight: 26 }}>
      {children}
    </AppText>
  );
}

function H({ children }: { children: ReactNode }) {
  return (
    <AppText variant="title" color={T.text} accessibilityRole="header">
      {children}
    </AppText>
  );
}

function Card({ children, glow }: { children: ReactNode; glow?: string }) {
  return <View style={[styles.card, glow ? { borderColor: glow } : null]}>{children}</View>;
}

function Insight({ children }: { children: ReactNode }) {
  const reduced = useMotionReduced();
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.delay(250)} style={styles.insight}>
      <AppText variant="heading" color={T.accentText} style={{ lineHeight: 27 }}>
        {children}
      </AppText>
    </Animated.View>
  );
}

function Choice<V extends string>({ label, options, value, onChange }: { label: string; options: { value: V; label: string; detail?: string }[]; value?: V; onChange: (v: V) => void }) {
  return (
    <View style={{ gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <AppText variant="overline" color={T.accentText}>
        {label}
      </AppText>
      {options.map((o) => (
        <OptionButton key={o.value} tone={T} label={o.label} detail={o.detail} selected={value === o.value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

function Pills<V extends string>({ label, options, value, onChange }: { label: string; options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="caption" color={T.muted}>
        {label}
      </AppText>
      <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <View key={o.value} style={{ flexGrow: 1, flexBasis: 0, minWidth: 90 }}>
              <OptionButton tone={T} label={o.label} selected={on} onPress={() => (on ? undefined : onChange(o.value))} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function Enter({ run, advance }: StepProps) {
  return (
    <Frame run={run} footer={<ContinueButton tone={T} label="Step into the hall" onPress={advance} />}>
      <H>The hall</H>
      <P>Under the dome, twelve plinths stand in a ring. On each one, a contestant has left a rule: a short instruction for what to do when it meets someone.</P>
      <P>Every rule meets every other, one by one, for {MATCH_ROUNDS} rounds at a time. Each round both sides choose at the same moment — to share, or to take — and points are paid out. Then they choose again.</P>
      <P>Whoever earns the most points across the whole hall wins the Trials.</P>
      <P muted>You have one plinth. What you put on it is up to you.</P>
    </Frame>
  );
}

function Pick({ run, update, advance }: StepProps) {
  const ready = !!run.pick && !!run.predict && !!run.why;
  return (
    <Frame run={run} footer={<ContinueButton tone={T} label="Submit your rule" onPress={advance} disabled={!ready} />}>
      <H>Choose your entrant</H>
      <P muted>Three rules are already written. Pick one to place on your plinth.</P>
      <View style={{ gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Your entrant">
        {STARTERS.map((id) => (
          <OptionButton key={id} tone={T} label={STARTER_LABEL[id]} detail={STRATEGIES[id].rule} selected={run.pick === id} onPress={() => update({ pick: id })} />
        ))}
      </View>
      {run.pick ? (
        <>
          <Choice
            label={`Twelve entrants. Where will ${STARTER_LABEL[run.pick]} finish?`}
            options={BANDS.map((b) => ({ value: b, label: BAND_LABEL[b] }))}
            value={run.predict}
            onChange={(predict) => update({ predict })}
          />
          <Choice
            label="And what do you expect usually wins a contest like this?"
            options={(['clever', 'tough', 'kind'] as const).map((w) => ({ value: w, ...WHY_LABEL[w] }))}
            value={run.why}
            onChange={(why) => update({ why })}
          />
        </>
      ) : null}
    </Frame>
  );
}

/** The payoff matrix, with an optional highlighted cell. Rows are your move, columns theirs. */
function Matrix({ you, them }: { you?: Move; them?: Move }) {
  const cell = (y: Move, t: Move) => {
    const [a, b] = y === 'C' ? (t === 'C' ? [PAYOFFS.R, PAYOFFS.R] : [PAYOFFS.S, PAYOFFS.T]) : t === 'C' ? [PAYOFFS.T, PAYOFFS.S] : [PAYOFFS.P, PAYOFFS.P];
    const on = you === y && them === t;
    return (
      <View key={`${y}${t}`} style={[styles.cell, on && { borderColor: MERIDIAN.gold, backgroundColor: 'rgba(253,230,138,0.1)' }]} accessible accessibilityLabel={`You ${moveWord(y)}, they ${moveWord(t)}: you ${a}, they ${b}`}>
        <AppText variant="heading" color={MERIDIAN.gold} tabular>
          {a}
        </AppText>
        <AppText variant="caption" color={T.muted} tabular>
          them {b}
        </AppText>
      </View>
    );
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6, paddingLeft: 64 }}>
        {(['C', 'D'] as const).map((t) => (
          <View key={t} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <MoveToken move={t} size={12} />
            <AppText variant="caption" color={T.muted}>
              They {moveWord(t).toLowerCase()}
            </AppText>
          </View>
        ))}
      </View>
      {(['C', 'D'] as const).map((y) => (
        <View key={y} style={{ flexDirection: 'row', gap: 6, alignItems: 'stretch' }}>
          <View style={{ width: 58, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MoveToken move={y} size={12} />
            <AppText variant="caption" color={T.muted}>
              You {moveWord(y).toLowerCase()}
            </AppText>
          </View>
          {cell(y, 'C')}
          {cell(y, 'D')}
        </View>
      ))}
      <AppText variant="caption" color={T.muted}>
        Points, not money — just a way to keep score.
      </AppText>
    </View>
  );
}

function Single({ run, update, advance }: StepProps) {
  // The stranger is the Mirror; in a single meeting it simply opens by sharing.
  const them: Move = 'C';
  return (
    <Frame run={run} footer={run.single ? <ContinueButton tone={T} onPress={advance} /> : <AppText variant="caption" color={T.muted} align="center">Choose to share or take.</AppText>}>
      <H>One encounter</H>
      <P>Before your rule plays, the stewards ask you to play one meeting yourself, against a stranger you will never see again.</P>
      <Matrix you={run.single} them={run.single ? them : undefined} />
      {!run.single ? (
        <View style={{ gap: space.sm }}>
          <OptionButton tone={T} label="Share" detail="If they share too, you both get 3." onPress={() => update({ single: 'C' })} />
          <OptionButton tone={T} label="Take" detail="If they share, you get 5 and they get nothing." onPress={() => update({ single: 'D' })} />
        </View>
      ) : (
        <>
          <Card glow={MERIDIAN.gold}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <MoveToken move={run.single} size={28} />
                <AppText variant="caption" color={T.muted}>You</AppText>
                <AnimatedNumber value={run.single === 'C' ? PAYOFFS.R : PAYOFFS.T} variant="title" color={MERIDIAN.gold} />
              </View>
              <AppText variant="caption" color={T.muted}>vs</AppText>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <MoveToken move={them} size={28} />
                <AppText variant="caption" color={T.muted}>The stranger</AppText>
                <AnimatedNumber value={run.single === 'C' ? PAYOFFS.R : PAYOFFS.S} variant="title" color={T.text} />
              </View>
            </View>
          </Card>
          <P>{run.single === 'D' ? 'They shared. You took. Five points to nothing — the best result there is, for you.' : 'They shared too. Three points each.'}</P>
          <P>Look at the table again. Whatever the stranger does, taking pays you more: 5 instead of 3 if they share, 1 instead of 0 if they take. In a single meeting, taking is the safe bet.</P>
          <P>Now add both sides together. If you both share, the pair makes 6. If you both follow the safe bet and take, the pair makes 2.</P>
          <Insight>What is best for each of you alone leaves both of you worse off together.</Insight>
          <P muted>This shape of situation has a name: the prisoner’s dilemma. Sharing is usually called cooperating; taking, defecting.</P>
        </>
      )}
    </Frame>
  );
}

function Repeat({ run, update, advance }: StepProps) {
  const k = run.moves.length;
  const done = k >= REPEAT_ROUNDS;
  const guess = run.guesses[k];
  const reveals = run.moves.map((m, i) => ({ you: m, them: mirrorReply(run.moves, i), guess: run.guesses[i] }));
  const yourTotal = reveals.reduce((s, r) => s + (r.you === 'C' ? (r.them === 'C' ? 3 : 0) : r.them === 'C' ? 5 : 1), 0);
  const theirTotal = reveals.reduce((s, r) => s + (r.them === 'C' ? (r.you === 'C' ? 3 : 0) : r.you === 'C' ? 5 : 1), 0);
  const right = reveals.filter((r) => r.guess === r.them).length;
  const tookOnce = run.moves.slice(0, -1).includes('D');
  return (
    <Frame run={run} footer={done ? <ContinueButton tone={T} onPress={advance} /> : <AppText variant="caption" color={T.muted} align="center">Round {k + 1} of {REPEAT_ROUNDS}</AppText>}>
      <H>The same opponent, again</H>
      <P>Now it is a different arrangement: one opponent, {REPEAT_ROUNDS} rounds in a row. Same table, same choices. Before each round, guess what they’ll do.</P>
      <Card>
        <View style={{ gap: space.sm }}>
          {(['you', 'them'] as const).map((side) => (
            <View key={side} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <AppText variant="caption" color={T.muted} style={{ width: 64 }}>
                {side === 'you' ? 'You' : 'Opponent'}
              </AppText>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {Array.from({ length: REPEAT_ROUNDS }, (_, i) => (i < k ? <MoveToken key={i} move={reveals[i][side]} size={22} /> : <View key={i} style={styles.slot} />))}
              </View>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="caption" color={MERIDIAN.gold} tabular>You: {yourTotal}</AppText>
            <AppText variant="caption" color={T.muted} tabular>Opponent: {theirTotal}</AppText>
          </View>
        </View>
      </Card>
      {k > 0 ? (
        <AppText variant="small" color={T.muted}>
          Round {k}: you guessed they’d {moveWord(reveals[k - 1].guess ?? 'C').toLowerCase()}; they {reveals[k - 1].them === 'C' ? 'shared' : 'took'}.
        </AppText>
      ) : null}
      {!done ? (
        guess === undefined ? (
          <Pills label={`Round ${k + 1}: what will they do?`} options={[{ value: 'C', label: 'They’ll share' }, { value: 'D', label: 'They’ll take' }]} value={undefined as unknown as Move} onChange={(g) => update({ guesses: [...run.guesses.slice(0, k), g] })} />
        ) : (
          <Pills label={`Round ${k + 1}: you guessed “${moveWord(guess).toLowerCase()}”. Your move?`} options={[{ value: 'C', label: 'Share' }, { value: 'D', label: 'Take' }]} value={undefined as unknown as Move} onChange={(m) => { haptic.commit(); update({ moves: [...run.moves, m] }); }} />
        )
      ) : (
        <>
          <Card glow={STRATEGY_COLOR.mirror}>
            <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <Glyph id="mirror" size={36} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" color={T.text}>It was the Mirror.</AppText>
                <AppText variant="small" color={T.muted}>{STRATEGIES.mirror.rule}</AppText>
              </View>
            </View>
          </Card>
          <P>You read it right {right} of {REPEAT_ROUNDS} times. {tookOnce ? 'Every time you took, it took the very next round — your move came back to you, one round late.' : 'You never took, so it never did either: three points a round, every round.'}</P>
          <Insight>When you meet again, a move isn’t only a move. It’s what the other side will answer next round.</Insight>
        </>
      )}
    </Frame>
  );
}

/** The echo illustration: Mirror A slips once, in round 4. */
const ECHO = { slips: [{ side: 'a' as const, round: 3 }], rounds: 14 };

function Echo({ run, advance }: StepProps) {
  type Partner = 'mirror' | 'patient' | 'long-memory';
  const [partner, setPartner] = useState<Partner>('mirror');
  const match = useMemo(() => {
    const b = partner === 'mirror' ? entrant('mirror') : partner === 'long-memory' ? entrant('long-memory') : yours({ opening: 'C', response: 'two', forgive: 0 });
    return playMatch(entrant('mirror'), b, ECHO);
  }, [partner]);
  const partnerName = partner === 'mirror' ? 'Mirror B' : partner === 'long-memory' ? 'The Long Memory' : 'A patient Mirror';
  const perfect = ECHO.rounds * PAYOFFS.R;
  return (
    <Frame run={run} footer={<ContinueButton tone={T} onPress={advance} />}>
      <H>The echo</H>
      <P>In the practice hall, two Mirrors are paired. They should share forever. But in round 4, the first Mirror’s hand slips — it meant to share, and took.</P>
      <Card>
        <MatchStrip match={match} a={{ id: 'mirror', name: 'Mirror A' }} b={{ id: partner === 'long-memory' ? 'long-memory' : partner === 'patient' ? 'gentle-mirror' : 'mirror', name: partnerName }} />
        <MatchTotals match={match} a="Mirror A" b={partnerName} />
        <AppText variant="caption" color={T.muted}>A gold ring marks the slip. Two sharers would have made {perfect} each.</AppText>
      </Card>
      {partner === 'mirror' ? (
        <P>Watch what the one slip does. Mirror B answers it — fairly. Mirror A answers that. Then B answers A. The defection bounces back and forth for the rest of the match, and neither of them ever chooses to stop.</P>
      ) : partner === 'long-memory' ? (
        <P>The Long Memory never forgets a defection. One slip, and both sides take for the rest of the match — {match.b} points each where there could have been {perfect}.</P>
      ) : (
        <P>This partner waits for two defections in a row before hitting back. It lets the single slip pass, and the echo dies after one round.</P>
      )}
      <Pills
        label="Change Mirror A’s partner"
        options={[
          { value: 'mirror', label: 'Mirror' },
          { value: 'long-memory', label: 'Long Memory' },
          { value: 'patient', label: 'Patient' },
        ]}
        value={partner}
        onChange={setPartner}
      />
      <Insight>Hitting back stops you from being used. It can also keep a fight going long after anyone remembers why it started.</Insight>
    </Frame>
  );
}

function entrantName(run: MeridianRun) {
  return run.pick ? `You (${STARTER_LABEL[run.pick]})` : 'You';
}

function OpenTrials({ run, advance }: StepProps) {
  const pick = run.pick ?? 'mirror';
  const t = useMemo(() => runRoom(ROOMS.open, yours(STARTER_DESIGN[pick])), [pick]);
  const [selected, setSelected] = useState<StrategyId | null>(null);
  const [seenQualities, setSeenQualities] = useState(false);
  const mine = standingOf(t, 'yours');
  const band = bandIn(t, 'yours');
  const top = t.standings[0];
  const mostWins = [...t.standings].sort((a, b) => b.won - a.won)[0];
  const mirror = standingOf(t, 'mirror');
  const calc = standingOf(t, 'calculator');
  const sel = selected ? t.duel(0, t.ids.indexOf(selected)) : null;
  return (
    <Frame run={run} footer={<ContinueButton tone={T} label={seenQualities ? 'Continue' : 'Why did that happen?'} onPress={() => (seenQualities ? advance() : setSeenQualities(true))} />}>
      <H>The Open Trials</H>
      <P muted>Twelve rules: yours, and one of each kind the stewards could find. Everyone meets everyone, including a copy of itself. {MATCH_ROUNDS} rounds a match.</P>
      <Leaderboard t={t} yoursName={entrantName(run)} onSelect={(id) => setSelected(id === 'yours' ? null : id)} selected={selected} />
      {sel && selected ? (
        <Card>
          <AppText variant="caption" color={T.muted}>Your match against {nameOf(selected)}</AppText>
          <MatchStrip match={sel} a={{ id: 'yours', name: 'You' }} b={{ id: selected, name: nameOf(selected) }} />
          <MatchTotals match={sel} a="You" b={nameOf(selected)} />
        </Card>
      ) : (
        <AppText variant="caption" color={T.muted}>Tap a contestant to see your match against it.</AppText>
      )}
      <P>
        Your entry, {STARTER_LABEL[pick]}, finished {ordinal(mine.rank)} of {t.standings.length}. You predicted {BAND_LABEL[run.predict ?? 'middle'].toLowerCase()}; it landed in the {BAND_LABEL[band].toLowerCase()}.
      </P>
      <P>
        {nameOf(top.id, entrantName(run))} topped the hall. {nameOf(mostWins.id, entrantName(run))} out-scored the most opponents head to head — {mostWins.won} of them — and finished {ordinal(mostWins.rank)}. The Mirror out-scored {mirror.won === 0 ? 'no one at all' : `only ${mirror.won}`}, and finished {ordinal(mirror.rank)}.
      </P>
      <P muted>The Calculator, the most elaborate rule in the hall, finished {ordinal(calc.rank)}.</P>
      {seenQualities ? (
        <>
          <Insight>A rule that never beats anyone can still come out on top — by doing well with everyone.</Insight>
          <Card glow={STRATEGY_COLOR.mirror}>
            <View style={{ gap: space.md }}>
              <AppText variant="bodyStrong" color={T.text}>The Mirror has a real name: Tit for Tat.</AppText>
              <AppText variant="small" color={T.muted}>
                In 1980 the political scientist Robert Axelrod invited researchers to submit rules for a repeated prisoner’s dilemma tournament. Tit for Tat — cooperate first, then copy the other side’s last move — was one of the simplest entries, and it won. It won a second, larger tournament too.
              </AppText>
              {[
                ['Nice', 'It never takes first.'],
                ['Retaliatory', 'It answers a defection straight away, so it can’t be used for long.'],
                ['Forgiving', 'It returns to sharing as soon as the other side does.'],
                ['Clear', 'It is easy for other rules to read — and to learn that cooperating with it pays.'],
              ].map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', gap: space.sm }}>
                  <AppText variant="small" weight="semibold" color={STRATEGY_COLOR.mirror} style={{ width: 92 }}>{k}</AppText>
                  <AppText variant="small" color={T.text} style={{ flex: 1 }}>{v}</AppText>
                </View>
              ))}
              <AppText variant="caption" color={T.muted}>
                These four qualities help explain its success in those tournaments. They are not a guarantee. This hall is the app’s own simulation — different contestants, {MATCH_ROUNDS}-round matches — not a reproduction of Axelrod’s results.
              </AppText>
            </View>
          </Card>
        </>
      ) : null}
    </Frame>
  );
}

const ROOM_TABS: { value: Exclude<RoomId, 'open'>; label: string }[] = [
  { value: 'friendly', label: 'Garden' },
  { value: 'hostile', label: 'Iron' },
  { value: 'noisy', label: 'Fog' },
];

function Rooms({ run, advance }: StepProps) {
  const [room, setRoom] = useState<Exclude<RoomId, 'open'>>('friendly');
  const [who, setWho] = useState<StarterId>(run.pick ?? 'mirror');
  const mineE = useMemo(() => yours(STARTER_DESIGN[who]), [who]);
  const t = useMemo(() => runRoom(ROOMS[room], mineE), [room, mineE]);
  const clear = useMemo(() => (room === 'noisy' ? runRoom(clearAir(ROOMS.noisy), mineE) : null), [room, mineE]);
  const p = placeOf(t, 'yours');
  const name = `You (${STARTER_LABEL[who]})`;
  return (
    <Frame run={run} footer={<ContinueButton tone={T} onPress={advance} />}>
      <H>Change the room</H>
      <P>The stewards open three more halls. Same rules, same table — different company. Try each, with any of the three starting rules.</P>
      <Pills label="Hall" options={ROOM_TABS} value={room} onChange={setRoom} />
      <Pills label="Your entrant" options={STARTERS.map((s) => ({ value: s, label: STARTER_LABEL[s].replace('The ', '') }))} value={who} onChange={setWho} />
      <Card>
        <AppText variant="bodyStrong" color={T.text}>{ROOMS[room].name}</AppText>
        <AppText variant="small" color={T.muted}>{ROOMS[room].blurb}</AppText>
      </Card>
      <Leaderboard t={t} yoursName={name} reveal={false} />
      <P strong>
        {STARTER_LABEL[who]} finished {ordinal(p.rank)} of {p.of} here.
      </P>
      <RoomNote room={room} t={t} clear={clear} who={who} />
    </Frame>
  );
}

/** What this room's result shows, read from the result itself. */
function RoomNote({ room, t, clear, who }: { room: Exclude<RoomId, 'open'>; t: ReturnType<typeof runRoom>; clear: ReturnType<typeof runRoom> | null; who: StarterId }) {
  const top = t.standings[0];
  const topName = nameOf(top.id, `your ${STARTER_LABEL[who]}`);
  if (room === 'friendly') {
    const prober = standingOf(t, 'prober');
    return (
      <>
        <P>{topName} came first. {top.id !== 'prober' ? `The Prober, which takes from anyone who won’t hit back, finished ${ordinal(prober.rank)}.` : 'The Prober, which takes from anyone who won’t hit back, had plenty of Open Hands to take from.'}</P>
        <Insight>A room full of unconditional sharers is a feast for anyone willing to take.</Insight>
      </>
    );
  }
  if (room === 'hostile') {
    const mine = standingOf(t, 'yours');
    return (
      <>
        <P>{topName} came first. In a hall of takers, {who === 'open-hand' ? `the Open Hand scored ${mine.score.toFixed(2)} a round — exploited by almost everyone it met.` : who === 'mirror' ? 'the Mirror loses the first round to each taker, then stops giving anything away — and gains whenever it meets another rule that is willing to share.' : 'the Iron Wall finally fits in: takers taking from takers, one point at a time.'}</P>
        <Insight>Forgiveness that never stops is a weakness in a room like this one.</Insight>
      </>
    );
  }
  if (!clear) return null;
  const ids: StrategyId[] = ['yours', 'mirror', 'gentle-mirror', 'long-memory', 'settler', 'open-hand'];
  const rows = ids
    .filter((id) => t.ids.includes(id))
    .map((id) => ({ id, name: nameOf(id, `Your ${STARTER_LABEL[who].replace('The ', '')}`), value: Math.max(0, standingOf(clear, id).score - standingOf(t, id).score) }))
    .sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map((r) => r.value), 0.01);
  const gentleBeatsMirror = standingOf(t, 'gentle-mirror').score > standingOf(t, 'mirror').score;
  return (
    <>
      <P>In the fog, {Math.round(NOISE * 100)} moves in every hundred come out as their opposite, and nobody can tell a slip from a choice. Here is what the fog cost each rule, in points per round, compared with the same hall in clear air:</P>
      <BarList rows={rows} max={max} unit="points per round lost to the fog" />
      <P>
        {rows[0].name} lost the most. {gentleBeatsMirror ? 'The Gentle Mirror — which lets one defection in five go — now finishes ahead of the plain Mirror: its forgiveness stops the echoes.' : 'Even with forgiveness, the Gentle Mirror couldn’t get ahead of the plain Mirror this time.'} The Long Memory, which never forgives, finishes {ordinal(standingOf(t, 'long-memory').rank)}.
      </P>
      <Insight>When mistakes happen, a little forgiveness keeps one accident from becoming a feud.</Insight>
    </>
  );
}

const POP_ROOMS: { value: 'open' | 'noisy' | 'hostile'; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'noisy', label: 'Fog' },
  { value: 'hostile', label: 'Iron' },
];

function Population({ run, advance }: StepProps) {
  const [room, setRoom] = useState<'open' | 'noisy' | 'hostile'>('open');
  const pick = run.pick ?? 'mirror';
  const t = useMemo(() => runRoom(ROOMS[room], yours(STARTER_DESIGN[pick])), [room, pick]);
  const pop = useMemo(() => evolve(t, 40), [t]);
  const last = pop[pop.length - 1];
  const leader = t.ids[last.indexOf(Math.max(...last))];
  const iw = t.ids.indexOf('iron-wall');
  const peakIW = iw >= 0 ? Math.max(...pop.map((g) => g[iw])) : 0;
  return (
    <Frame run={run} footer={<ContinueButton tone={T} onPress={advance} />}>
      <H>The room changes back</H>
      <P>One last experiment before your final entry. Suppose each season, rules that scored well are copied by more contestants, and rules that scored badly are abandoned. The hall fills up with whatever is working.</P>
      <Pills label="Starting hall" options={POP_ROOMS} value={room} onChange={setRoom} />
      <Card>
        <PopulationChart key={room} t={t} pop={pop} yoursName={entrantName(run)} />
      </Card>
      <P>
        After 40 seasons, {nameOf(leader, entrantName(run))} is the most common rule.
        {iw >= 0 && room === 'open' ? ` The Iron Wall peaked at ${Math.round(peakIW * 100)}% and then vanished: once the easy targets were gone, there was nobody left to take from.` : ''}
        {room === 'hostile' ? ' In the Iron Hall, the takers thin each other out, and what survives depends on who can live alongside whom.' : ''}
      </P>
      <Insight>The room decides which rules do well — and the rules that do well remake the room.</Insight>
      <AppText variant="caption" color={T.muted}>
        A simplified model, not biology: each season a rule’s share grows in proportion to its average score against the current mix. Nothing mutates, no new rules appear, and a rule that disappears never comes back.
      </AppText>
    </Frame>
  );
}

const RESPONSES: { value: Design['response']; label: string; detail: string }[] = [
  { value: 'copy', label: 'Copy their last move', detail: 'Like the Mirror.' },
  { value: 'two', label: 'Hit back only after two takes in a row', detail: 'Patient: lets a single take pass.' },
  { value: 'grudge', label: 'Never forgive a take', detail: 'Like the Long Memory.' },
  { value: 'always-c', label: 'Always share', detail: 'Like the Open Hand.' },
  { value: 'always-d', label: 'Always take', detail: 'Like the Iron Wall.' },
];

function DesignStep({ run, update, advance }: StepProps) {
  const d: Design = run.design ?? STARTER_DESIGN[run.pick ?? 'mirror'];
  const set = (patch: Partial<Design>) => update({ design: { ...d, ...patch } });
  const forgivable = d.response === 'copy' || d.response === 'two' || d.response === 'grudge';
  return (
    <Frame run={run} footer={<ContinueButton tone={T} label="Enter the last trial" onPress={advance} disabled={!run.finalPredict || !run.design} />}>
      <H>Your final entrant</H>
      <P>The last trial runs your rule through every hall at once: the Open Trials, the Garden, the Iron Hall and the Fog. Build it however you like.</P>
      <Pills label="First move" options={[{ value: 'C', label: 'Share' }, { value: 'D', label: 'Take' }]} value={d.opening} onChange={(opening) => set({ opening })} />
      <Choice label="After that" options={RESPONSES} value={d.response} onChange={(response) => set({ response, forgive: response === 'always-c' || response === 'always-d' ? 0 : d.forgive })} />
      {forgivable ? (
        <Pills
          label="Forgiveness: chance of sharing anyway when the rule says take"
          options={[{ value: '0', label: 'Never' }, { value: '0.1', label: '1 in 10' }, { value: '0.3', label: '3 in 10' }]}
          value={String(d.forgive)}
          onChange={(v) => set({ forgive: Number(v) })}
        />
      ) : null}
      <Choice label="Where will it finish in the Open Trials?" options={BANDS.map((b) => ({ value: b, label: BAND_LABEL[b] }))} value={run.finalPredict} onChange={(finalPredict) => update({ finalPredict, design: d })} />
    </Frame>
  );
}

const FINAL_ROOMS: RoomId[] = ['open', 'friendly', 'hostile', 'noisy'];

/** A hall's name mid-sentence ("the Fog Hall"). */
const hall = (r: RoomId) => ROOMS[r].name.replace(/^The /, 'the ');

/** Revisits the player's first guess about what wins, using this run's own results. */
function whyNote(why: Why, open: ReturnType<typeof runRoom>): string {
  const calc = standingOf(open, 'calculator');
  const wall = standingOf(open, 'iron-wall');
  const n = open.standings.length;
  if (why === 'clever') return `The most elaborate rule in the hall, the Calculator, finished ${ordinal(calc.rank)} of ${n} in the Open Trials. Being complicated didn’t make it effective.`;
  if (why === 'tough')
    return `The toughest rule, the Iron Wall, out-scored ${wall.won} of its ${n} opponents head to head in the Open Trials — and finished ${ordinal(wall.rank)} of ${n}. Winning duels isn’t the same as doing well.`;
  // The Iron Hall has no Open Hand of its own; enter one to see how it fares.
  const hand = placeOf(runRoom(ROOMS.hostile, yours(STARTER_DESIGN['open-hand'])), 'yours');
  return `Kindness alone isn’t enough: an Open Hand finishes ${ordinal(hand.rank)} of ${hand.of} in the Iron Hall. The rules that did well across the halls were kind first, and hit back when hit.`;
}

function Final({ run, advance }: StepProps) {
  const d = run.design ?? STARTER_DESIGN.mirror;
  const mine = useMemo(() => yours(d), [d]);
  const results = useMemo(() => FINAL_ROOMS.map((r) => ({ room: r, t: runRoom(ROOMS[r], mine) })), [mine]);
  const open = results[0].t;
  const band = bandIn(open, 'yours');
  const ranks = results.map((r) => placeOf(r.t, 'yours'));
  const best = results[ranks.reduce((bi, r, i) => (r.rank / r.of < ranks[bi].rank / ranks[bi].of ? i : bi), 0)];
  const worst = results[ranks.reduce((wi, r, i) => (r.rank / r.of > ranks[wi].rank / ranks[wi].of ? i : wi), 0)];
  const preset = STARTERS.find((s) => isStarterDesign(d, s));
  const why = run.why ?? 'clever';
  return (
    <Frame run={run} footer={<ContinueButton tone={T} label="Leave the hall" onPress={advance} />}>
      <H>The last trial</H>
      <P muted>Your rule: {describeDesign(d)}{preset ? ` — the same as ${STARTER_LABEL[preset]}.` : '.'}</P>
      <View style={{ gap: space.sm }}>
        {results.map(({ room, t }, i) => (
          <Card key={room} glow={ranks[i].rank === 1 ? MERIDIAN.gold : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" color={T.text}>{ROOMS[room].name}</AppText>
                <AppText variant="caption" color={T.muted}>Winner: {nameOf(t.standings[0].id, 'your rule')}</AppText>
              </View>
              <AppText variant="title" color={MERIDIAN.gold} tabular accessibilityLabel={`${ordinal(ranks[i].rank)} of ${ranks[i].of}`}>
                {ordinal(ranks[i].rank)}
              </AppText>
              <AppText variant="caption" color={T.muted}>of {ranks[i].of}</AppText>
            </View>
          </Card>
        ))}
      </View>
      <P>
        You predicted the {BAND_LABEL[run.finalPredict ?? 'middle'].toLowerCase()} in the Open Trials; it finished in the {BAND_LABEL[band].toLowerCase()}. It did best in {hall(best.room)}{best.room !== worst.room ? ` and worst in ${hall(worst.room)}` : ''}.
      </P>
      <P>
        At the start you guessed that {WHY_LABEL[why].label.toLowerCase()} usually wins. {whyNote(why, open)}
      </P>
      <Insight>“What’s the best strategy?” has no answer on its own. Best against whom, in what room, under which rules?</Insight>
    </Frame>
  );
}

function describeDesign(d: Design): string {
  const first = d.opening === 'C' ? 'share first' : 'take first';
  const then = { copy: 'then copy their last move', two: 'then hit back only after two takes in a row', grudge: 'then never forgive a take', 'always-c': 'then always share', 'always-d': 'then always take' }[d.response];
  const f = d.forgive > 0 ? `, forgiving ${d.forgive === 0.1 ? '1 in 10' : '3 in 10'} times` : '';
  return `${first}, ${then}${f}`;
}

/** Before the reflection: how the player’s first guess compared with what happened. */
function LookBack({ run }: { run: MeridianRun }) {
  const pick = run.pick ?? 'mirror';
  const places = useMemo(() => FINAL_ROOMS.map((r) => ({ room: r, ...placeOf(runRoom(ROOMS[r], yours(STARTER_DESIGN[pick])), 'yours') })), [pick]);
  const [p, ...rest] = places;
  return (
    <View style={{ gap: space.sm }}>
      <AppText variant="overline" color={T.accentText}>The Meridian Trials · Looking back</AppText>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <Glyph id={pick} size={28} />
        <AppText variant="small" color={T.text} style={{ flex: 1 }}>
          You entered {STARTER_LABEL[pick]} expecting the {BAND_LABEL[run.predict ?? 'middle'].toLowerCase()}. It finished {ordinal(p.rank)} of {p.of} in the Open Trials; {rest.map((r) => `${ordinal(r.rank)} of ${r.of} in ${hall(r.room)}`).join(', ')}.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: T.panel, borderRadius: radius.lg, borderWidth: 1, borderColor: T.border, padding: space.lg, gap: space.sm },
  insight: { borderLeftWidth: 3, borderLeftColor: T.accent, paddingLeft: space.lg, paddingVertical: space.xs },
  cell: { flex: 1, minHeight: 60, borderRadius: radius.md, borderWidth: 1, borderColor: T.border, backgroundColor: T.panel, alignItems: 'center', justifyContent: 'center' },
  slot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: T.border, borderStyle: 'dashed' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
