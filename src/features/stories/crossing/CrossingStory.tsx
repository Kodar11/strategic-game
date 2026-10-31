import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import type { ClipId } from '@/src/features/audio/clips';
import { NarrateOnMount, NarrationScope, hasClipAudio, useNarrateOnMount } from '@/src/features/audio/useNarration';
import { direct, sfxBetween } from '@/src/stories/crossing/direction';
import { beatTiming, decisionPending, isFinalBeat, previous, progressIndex } from '@/src/stories/crossing/playback';
import { beatClip } from '@/src/stories/crossing/narration';
import {
  type Beat,
  type Choices,
  type DecisionId,
  ENDING_TITLE,
  SCENES,
  SCENE_TITLE,
  type Speaker,
  START,
  type Stage,
  beatAt,
  choose,
  ending,
  ledger,
  next,
  sceneApplies,
} from '@/src/stories/crossing/story';
import { CROSSING_REFLECTION_LINES } from '@/src/stories/meridian/narration';
import { useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, radius, space } from '@/src/theme/tokens';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import type { StorySound } from '../audio/assets';
import { storyCue, storySfx, useStoryAudio, useStoryAudioSession } from '../audio/session';
import { useStories } from '../store';
import { PlaybackBar, useAutoAdvance } from '../ui/PlaybackBar';
import { ContinueButton, OptionButton, Reflection, type ReflectionContent, StoryIntro, type StoryTone, StoryTopBar } from '../ui/kit';
import { CrossingArt, LANTERN, MIRA_AMBER } from './CrossingArt';

export const CROSSING_TONE: StoryTone = {
  bg: '#070a12',
  panel: '#131925',
  border: 'rgba(242, 166, 90, 0.22)',
  text: '#F4EEE6',
  muted: '#B9B1A6',
  accent: MIRA_AMBER,
  accentText: '#F6C08A',
};

const HOLLIS = '#A9C49A';

const REFLECTION: ReflectionContent = {
  message: [CROSSING_REFLECTION_LINES['dbu.reflect.1'], CROSSING_REFLECTION_LINES['dbu.reflect.2']],
  takeaways: [
    { title: 'Build trust through actions', body: 'What people can see you do, again and again, gives them reasons to cooperate — far more than what you promise.' },
    { title: 'Break the cycle when you can', body: 'Answering harm with harm is understandable, and it can deter it. Kept up, it leaves everyone answering the last night instead of building the next one.' },
    { title: 'Communicate, and keep boundaries', body: 'Clear up what can be cleared up. And don’t mistake trust for accepting whatever happens: terms everyone can see make cooperation safer, not colder.' },
  ],
  question: CROSSING_REFLECTION_LINES['dbu.reflect.question'],
};

const PREMISE = 'A storm has split the town of Luma across a gorge. One cable, one basket, and a courier named Mira on the other side. What crosses between you is up to both of you.';

const NIGHT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];

const music = (name: string) => `crossing/music/${name}`;
const bedsOf = (beds: Record<string, number>) => Object.fromEntries(Object.entries(beds).map(([k, v]) => [`crossing/ambience/${k}`, v]));

export function CrossingStory() {
  useStoryAudioSession();
  const loaded = useStories((s) => s.loaded);
  const save = useStories((s) => s.crossing);
  const [mode, setMode] = useState<'intro' | 'story' | 'ending' | 'reflect'>(() => (useStories.getState().crossing?.reflecting ? 'reflect' : 'intro'));

  useEffect(() => {
    void useStories.getState().load().then(() => {
      if (useStories.getState().crossing?.reflecting) setMode('reflect');
    });
  }, []);

  if (!loaded) return <MessageScreen loading />;

  const pos = save?.pos ?? START;
  const choices = save?.choices ?? {};
  const started = !!save && (save.pos.scene !== 'a' || save.pos.beat > 0 || Object.keys(save.choices).length > 0);

  if (mode === 'intro') {
    const first: Stage = { night: 1, sky: 'dusk', rain: false, snow: false, mira: 'stand', miraLight: true, basket: 'east', built: 'none', frayed: false };
    return (
      <StoryIntro
        tone={CROSSING_TONE}
        kicker="A Tactiqo story"
        title="The Distance Between Us"
        premise={PREMISE}
        art={<CrossingArt stage={started ? (beatAt(pos, choices)?.stage ?? first) : first} />}
        resumeLabel={started ? `Night ${beatAt(pos, choices)?.stage.night ?? 1} · ${SCENE_TITLE[pos.scene]}` : undefined}
        onBegin={() => {
          if (!save) useStories.getState().restart('crossing');
          setMode(next(pos, choices) === null && ending(choices) ? 'ending' : 'story');
        }}
        onRestart={
          started
            ? () => {
                useStories.getState().restart('crossing');
                setMode('story');
              }
            : undefined
        }
      />
    );
  }

  if (mode === 'reflect' && save) {
    const e = ending(save.choices);
    return (
      <NarrationScope step="reflect">
        <ReflectSound id={e?.id} />
        <NarrateOnMount clip={'dbu.reflect.1' as ClipId} />
        <NarrateOnMount clip={'dbu.reflect.2' as ClipId} />
        <NarrateOnMount clip={'dbu.reflect.question' as ClipId} />
        <Reflection
          tone={CROSSING_TONE}
          content={REFLECTION}
          onReplay={() => {
            useStories.getState().restart('crossing');
            setMode('story');
          }}
          before={<Ledger choices={save.choices} title={e ? ENDING_TITLE[e.id] : ''} />}
        />
      </NarrationScope>
    );
  }

  if (mode === 'ending') {
    return (
      <EndingCard
        choices={choices}
        onContinue={() => {
          useStories.getState().reflectCrossing();
          setMode('reflect');
        }}
      />
    );
  }

  return <Player onEnd={() => setMode('ending')} />;
}

/** The ending's music carries on under the reflection, a little further away. */
function ReflectSound({ id }: { id?: string }) {
  useEffect(() => {
    if (id) storyCue({ music: music(id), musicLevel: 0.55, beds: bedsOf({ wind: 0.2, river: 0.25 }), fadeMs: 3000 });
  }, [id]);
  return null;
}

function Player({ onEnd }: { onEnd: () => void }) {
  const save = useStories((s) => s.crossing);
  const pos = save?.pos ?? START;
  return (
    <NarrationScope step={`${pos.scene}:${pos.beat}`}>
      <PlayerBody onEnd={onEnd} />
    </NarrationScope>
  );
}

function PlayerBody({ onEnd }: { onEnd: () => void }) {
  const save = useStories((s) => s.crossing);
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const reduced = useMotionReduced();
  const pos = save?.pos ?? START;
  const choices = save?.choices ?? {};
  const key = `${pos.scene}:${pos.beat}`;
  const choicesKey = JSON.stringify(choices);
  // Beats are derived from the choices; memoised on their content so nothing below re-runs between steps.
  const { beat, prev, dir } = useMemo(() => {
    const c = JSON.parse(choicesKey) as Choices;
    const b = beatAt(pos, c);
    const p = pos.beat > 0 ? beatAt({ scene: pos.scene, beat: pos.beat - 1 }, c) : null;
    return { beat: b, prev: p, dir: direct(pos, c, p) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pos is captured by its key
  }, [key, choicesKey]);
  // Each arrival at a beat is one visit. Ground already covered gets its voice again, but no held silence and no
  // repeated sound effects: those belong to the first time something happens.
  const reached = progressIndex(pos, choices);
  const [visit, setVisit] = useState({ key, count: 0, fresh: true, furthest: reached });
  if (visit.key !== key) setVisit({ key, count: visit.count + 1, fresh: reached > visit.furthest, furthest: Math.max(reached, visit.furthest) });
  const hold = visit.fresh ? (dir?.holdMs ?? 0) : 0;

  // A held beat: the picture changes first, and the words and the voice come after a moment of nothing.
  const [releasedKey, setReleasedKey] = useState<string | null>(null);
  const revealed = hold === 0 || releasedKey === key;
  useEffect(() => {
    if (hold === 0) return;
    const h = setTimeout(() => setReleasedKey(key), hold);
    return () => clearTimeout(h);
  }, [key, hold]);

  // The mix follows the beat. A sound only plays when the story moves forward onto a change, never on resume.
  const lastBeat = useRef<Beat | null>(null);
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!beat || !dir) return;
    storyCue({ music: dir.music ? music(dir.music) : null, musicLevel: dir.musicLevel, beds: bedsOf(dir.beds), fadeMs: dir.fadeMs });
    if (visit.fresh && lastKey.current !== null && lastKey.current !== key) {
      for (const s of sfxBetween(lastBeat.current, beat)) storySfx(`crossing/sfx/${s.sound}` as StorySound, s.gain);
    }
    lastKey.current = key;
    lastBeat.current = beat;
  }, [key, beat, dir, visit.fresh]);

  const clip = revealed && beat ? (beatClip(beat) as ClipId | null) : null;
  useNarrateOnMount(clip, `${key}#${visit.count}`);

  // With no voice (narration off, or no file), screen readers still announce each new line.
  useEffect(() => {
    if (revealed && beat?.kind === 'line') AccessibilityInfo.announceForAccessibility(`${speakerName(beat.who) ?? ''} ${beat.text}`);
  }, [revealed, beat]);

  // Passing time: when the night changes, its number rests on the picture for a moment.
  const nightSeen = useRef<number | null>(null);
  const night = beat?.stage.night ?? 1;
  const [nightCard, setNightCard] = useState<number | null>(null);
  useEffect(() => {
    const was = nightSeen.current;
    nightSeen.current = night;
    if (was === null || was === night || reduced || !visit.fresh) return;
    const show = setTimeout(() => setNightCard(night), 0);
    const hide = setTimeout(() => setNightCard(null), 1900);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [night, reduced, visit.fresh]);

  const [picked, setPicked] = useState<string | null>(null);
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pickTimer.current) clearTimeout(pickTimer.current);
  }, []);

  // Off until the player asks for it, and only for as long as this screen is open.
  const [auto, setAuto] = useState(false);
  const narrationOn = useProgress((s) => s.settings.narration);
  const pending = !!beat && decisionPending(beat, choices);
  const final = isFinalBeat(pos, choices);
  const timing = beat ? beatTiming(beat, prev, narrationOn && !!clip && hasClipAudio(clip), !prev) : { minMs: 0, breathMs: 0 };
  const carryOn = () => {
    const n = next(pos, choices);
    if (n) useStories.getState().saveCrossing(n, choices);
  };
  // The ending is never opened automatically: the last beat stays until the player moves on.
  useAutoAdvance({ beatKey: `${key}#${visit.count}`, enabled: auto && revealed && !pending && !final && !picked, timing, onAdvance: carryOn });

  if (!beat || !dir) return <MessageScreen title="Something went wrong" body="This part of the story couldn’t be found. Starting over will fix it." onRetry={() => useStories.getState().restart('crossing')} />;

  const advance = () => {
    useStoryAudio.getState().setPaused(false);
    if (!revealed) return setReleasedKey(key);
    const n = next(pos, choices);
    if (!n) return onEnd();
    useStories.getState().saveCrossing(n, choices);
  };
  const commit = (id: DecisionId, value: string) => {
    const r = choose(pos, choices, id, value);
    setPicked(null);
    if (r) useStories.getState().saveCrossing(r.pos, r.choices);
  };
  const pick = (id: DecisionId, value: string) => {
    useStoryAudio.getState().setPaused(false);
    if (picked) return;
    if (reduced) return commit(id, value);
    // A moment to see what you chose, before the story answers.
    setPicked(value);
    pickTimer.current = setTimeout(() => commit(id, value), 380);
  };

  const back = previous(pos, choices);
  const goBack = () => {
    if (!back || picked) return;
    // Going back is reading: autoplay stops, so the story doesn't carry on from under you.
    setAuto(false);
    useStoryAudio.getState().setPaused(false);
    useStories.getState().saveCrossing(back, choices);
  };

  const applicable = SCENES.filter((s) => sceneApplies(s, choices) && s !== 'e2' && s !== 'g2');
  const progress = Math.max(0, applicable.indexOf(pos.scene === 'e2' ? 'e' : pos.scene === 'g2' ? 'g' : pos.scene));

  return (
    <View style={{ flex: 1, backgroundColor: CROSSING_TONE.bg }}>
      <View>
        <CrossingArt stage={beat.stage} direction={dir} coverHeight={Math.min(screenH * 0.44, 440)} />
        {nightCard ? (
          <Animated.View entering={FadeIn.duration(500)} exiting={FadeOut.duration(600)} style={styles.nightCard} pointerEvents="none">
            <AppText variant="heading" color="#F4EEE6" style={{ letterSpacing: 3, textShadowColor: '#000', textShadowRadius: 12 }}>
              Night {NIGHT_WORDS[nightCard] ?? nightCard}
            </AppText>
          </Animated.View>
        ) : null}
      </View>
      <StoryTopBar tone={CROSSING_TONE} title={`Night ${beat.stage.night} · ${SCENE_TITLE[pos.scene]}`} progress={progress} total={applicable.length} />
      <View style={[styles.panel, { paddingBottom: insets.bottom + space.lg }]}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: space.xl, paddingTop: space.lg }}>
          <Pressable
            onPress={beat.kind === 'line' ? advance : undefined}
            disabled={beat.kind !== 'line'}
            accessible={false}
            style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', gap: space.lg, flexGrow: 1, justifyContent: 'flex-end' }}>
            {prev && prev.kind === 'line' && prev.who !== 'insight' ? (
              <View style={{ opacity: 0.38 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <Line beat={prev} compact />
              </View>
            ) : null}
            {revealed ? (
              <Animated.View key={key} entering={reduced ? undefined : FadeIn.duration(beat.kind === 'line' && beat.who === 'insight' ? 900 : 420)}>
                {beat.kind === 'line' ? (
                  <Line beat={beat} />
                ) : (
                  <AppText variant="heading" color={CROSSING_TONE.text} accessibilityRole="header">
                    {beat.prompt}
                  </AppText>
                )}
              </Animated.View>
            ) : null}
            {beat.kind === 'choice' && revealed ? (
              <View style={{ gap: space.sm }}>
                {beat.options.map((o) => {
                  // Coming back to a decision shows what was chosen. It can't be chosen again.
                  const made = choices[beat.id];
                  return <OptionButton key={o.value} tone={CROSSING_TONE} label={o.label} detail={o.detail} selected={picked === o.value || made === o.value} disabled={made !== undefined || (!!picked && picked !== o.value)} onPress={() => pick(beat.id, o.value)} />;
                })}
              </View>
            ) : null}
          </Pressable>
        </ScrollView>
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.md, width: '100%', maxWidth: MAX_CONTENT_WIDTH + space.xl * 2, alignSelf: 'center', gap: space.sm }}>
          <PlaybackBar
            tone={CROSSING_TONE}
            variant="quiet"
            auto={auto && !final}
            held={pending}
            canPrevious={!!back && !picked}
            canNext={!pending && !picked}
            canPlay={!final}
            onPrevious={goBack}
            onToggle={() => setAuto(!auto)}
            onNext={advance}
            nextLabel={final ? 'Go to the ending' : 'Next'}
          />
        </View>
      </View>
    </View>
  );
}

function speakerName(who: Speaker): string | null {
  return who === 'mira' ? 'Mira' : who === 'hollis' ? 'Hollis' : who === 'note' ? 'A note' : who === 'lamp' ? 'Her lamp' : null;
}

function Line({ beat, compact }: { beat: Extract<Beat, { kind: 'line' }>; compact?: boolean }) {
  const t = CROSSING_TONE;
  switch (beat.who) {
    case 'mira':
    case 'hollis': {
      const color = beat.who === 'mira' ? MIRA_AMBER : HOLLIS;
      return (
        <View style={[styles.speech, { borderLeftColor: color }]}>
          <AppText variant="overline" color={color}>
            {beat.who === 'mira' ? 'Mira' : 'Hollis'}
          </AppText>
          <AppText variant={compact ? 'small' : 'body'} color={t.text} style={compact ? undefined : { fontSize: 17, lineHeight: 26 }}>
            {beat.text}
          </AppText>
        </View>
      );
    }
    case 'note':
      return (
        <View style={styles.note} accessibilityLabel={`A note in charcoal: ${beat.text}`}>
          <AppText variant="small" weight="semibold" color="#2b2318" style={{ letterSpacing: 1.4, lineHeight: 22 }}>
            {beat.text}
          </AppText>
        </View>
      );
    case 'lamp':
      return (
        <View style={styles.lamp} accessibilityLabel={`Her signal lamp blinks: ${beat.text}`}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: LANTERN, opacity: 0.4 + i * 0.25 }} />
            ))}
          </View>
          <AppText variant="bodyStrong" color={LANTERN} style={{ letterSpacing: 3 }}>
            {beat.text}
          </AppText>
        </View>
      );
    case 'insight':
      return (
        <View style={{ gap: space.sm, alignItems: 'center', paddingVertical: space.sm }}>
          <View style={{ width: 28, height: 1, backgroundColor: t.accent, opacity: 0.6 }} />
          <AppText variant="heading" color={t.accentText} align="center" style={{ lineHeight: 28 }}>
            {beat.text}
          </AppText>
          <View style={{ width: 28, height: 1, backgroundColor: t.accent, opacity: 0.6 }} />
        </View>
      );
    default:
      return (
        <AppText variant={compact ? 'small' : 'body'} color={compact ? t.muted : t.text} style={compact ? undefined : { fontSize: 17, lineHeight: 27 }}>
          {beat.text}
        </AppText>
      );
  }
}

/** A quiet pause on the last image before the reflection: the ending's name, and nothing to do but go on. */
function EndingCard({ choices, onContinue }: { choices: Choices; onContinue: () => void }) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const reduced = useMotionReduced();
  const e = ending(choices);
  const last = beatAt({ scene: 'h', beat: 99 }, choices);
  const dir = direct({ scene: 'h', beat: 99 }, choices);
  useEffect(() => haptic.success(), []);
  return (
    <View style={{ flex: 1, backgroundColor: CROSSING_TONE.bg }}>
      {last ? <CrossingArt stage={last.stage} direction={dir ? { ...dir, shot: 'wide' } : undefined} coverHeight={Math.min(screenH * 0.56, 520)} /> : null}
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, paddingBottom: insets.bottom + space.xl, gap: space.xl }}>
        <Animated.View entering={reduced ? undefined : FadeIn.duration(1600)} style={{ gap: space.sm, alignItems: 'center' }}>
          <AppText variant="overline" color={CROSSING_TONE.muted}>
            The Distance Between Us
          </AppText>
          <AppText variant="display" color={CROSSING_TONE.text} align="center" accessibilityRole="header">
            {e ? ENDING_TITLE[e.id] : ''}
          </AppText>
        </Animated.View>
        <Animated.View entering={reduced ? undefined : FadeIn.delay(1600).duration(800)}>
          <ContinueButton tone={CROSSING_TONE} onPress={onContinue} />
        </Animated.View>
      </View>
    </View>
  );
}

/** What crossed the Ashgill, night by night — a record of this run, not a score. */
function Ledger({ choices, title }: { choices: Choices; title: string }) {
  const rows = ledger(choices);
  return (
    <View style={{ gap: space.md }}>
      <AppText variant="overline" color={CROSSING_TONE.accentText}>
        {title} · What crossed the Ashgill
      </AppText>
      <View style={{ gap: space.sm }}>
        {rows.map((r) => (
          <View key={r.night} style={{ flexDirection: 'row', gap: space.md }}>
            <AppText variant="caption" color={CROSSING_TONE.muted} style={{ width: 64, paddingTop: 2 }}>
              {r.night}
            </AppText>
            <AppText variant="small" color={CROSSING_TONE.text} style={{ flex: 1 }}>
              {r.text}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, borderTopWidth: 1, borderTopColor: 'rgba(242,166,90,0.14)' },
  speech: { borderLeftWidth: 2, paddingLeft: space.md, gap: 2 },
  note: { backgroundColor: '#d8c8a8', padding: space.lg, borderRadius: radius.sm, transform: [{ rotate: '-0.8deg' }] },
  lamp: { backgroundColor: '#0c0f16', borderRadius: radius.md, padding: space.lg, gap: space.sm, borderWidth: 1, borderColor: 'rgba(255,208,138,0.25)' },
  nightCard: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)' },
});
