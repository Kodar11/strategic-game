import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import {
  type Beat,
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
import { MAX_CONTENT_WIDTH, radius, space } from '@/src/theme/tokens';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { useStories } from '../store';
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
  message: [
    'Trust is not a promise that nothing will go wrong. It is something people build out of what they do, how they answer when something does go wrong, and whether they can find a way forward together.',
    'Cooperating doesn’t mean ignoring harm. Forgiving doesn’t mean giving up your boundaries. And sometimes the difference between a broken arrangement and a repaired one starts with a message that makes the truth a little clearer.',
  ],
  takeaways: [
    { title: 'Build trust through actions', body: 'What people can see you do, again and again, gives them reasons to cooperate — far more than what you promise.' },
    { title: 'Break the cycle when you can', body: 'Answering harm with harm is understandable, and it can deter it. Kept up, it leaves everyone answering the last night instead of building the next one.' },
    { title: 'Communicate, and keep boundaries', body: 'Clear up what can be cleared up. And don’t mistake trust for accepting whatever happens: terms everyone can see make cooperation safer, not colder.' },
  ],
  question: 'What is one situation where you could make cooperation easier without giving up your boundaries?',
};

const PREMISE = 'A storm has split the town of Luma across a gorge. One cable, one basket, and a courier named Mira on the other side. What crosses between you is up to both of you.';

export function CrossingStory() {
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
      <Reflection
        tone={CROSSING_TONE}
        content={REFLECTION}
        onReplay={() => {
          useStories.getState().restart('crossing');
          setMode('story');
        }}
        before={<Ledger choices={save.choices} title={e ? ENDING_TITLE[e.id] : ''} />}
      />
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

function Player({ onEnd }: { onEnd: () => void }) {
  const save = useStories((s) => s.crossing);
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const reduced = useMotionReduced();
  const pos = save?.pos ?? START;
  const choices = save?.choices ?? {};
  const beat = beatAt(pos, choices);
  const prev = pos.beat > 0 ? beatAt({ scene: pos.scene, beat: pos.beat - 1 }, choices) : null;

  // Read each new line aloud for screen-reader users, as the art changes under it.
  useEffect(() => {
    if (beat?.kind === 'line') AccessibilityInfo.announceForAccessibility(`${speakerName(beat.who) ?? ''} ${beat.text}`);
  }, [beat]);

  if (!beat) return <MessageScreen title="Something went wrong" body="This part of the story couldn’t be found. Starting over will fix it." onRetry={() => useStories.getState().restart('crossing')} />;

  const advance = () => {
    const n = next(pos, choices);
    if (!n) return onEnd();
    useStories.getState().saveCrossing(n, choices);
  };
  const pick = (id: DecisionId, value: string) => {
    const r = choose(pos, choices, id, value);
    if (r) useStories.getState().saveCrossing(r.pos, r.choices);
  };

  const applicable = SCENES.filter((s) => sceneApplies(s, choices) && s !== 'e2' && s !== 'g2');
  const progress = Math.max(0, applicable.indexOf(pos.scene === 'e2' ? 'e' : pos.scene === 'g2' ? 'g' : pos.scene));

  return (
    <View style={{ flex: 1, backgroundColor: CROSSING_TONE.bg }}>
      <CrossingArt stage={beat.stage} maxHeight={screenH * 0.42} />
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
            <Animated.View key={`${pos.scene}-${pos.beat}`} entering={reduced ? undefined : FadeIn.duration(320)}>
              {beat.kind === 'line' ? (
                <Line beat={beat} />
              ) : (
                <AppText variant="heading" color={CROSSING_TONE.text} accessibilityRole="header">
                  {beat.prompt}
                </AppText>
              )}
            </Animated.View>
          </Pressable>
        </ScrollView>
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.md, width: '100%', maxWidth: MAX_CONTENT_WIDTH + space.xl * 2, alignSelf: 'center', gap: space.sm }}>
          {beat.kind === 'choice' ? (
            beat.options.map((o) => <OptionButton key={o.value} tone={CROSSING_TONE} label={o.label} detail={o.detail} onPress={() => pick(beat.id, o.value)} />)
          ) : (
            <ContinueButton tone={CROSSING_TONE} onPress={advance} />
          )}
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
function EndingCard({ choices, onContinue }: { choices: Parameters<typeof ending>[0]; onContinue: () => void }) {
  const insets = useSafeAreaInsets();
  const reduced = useMotionReduced();
  const e = ending(choices);
  const last = beatAt({ scene: 'h', beat: 99 }, choices);
  useEffect(() => haptic.success(), []);
  return (
    <View style={{ flex: 1, backgroundColor: CROSSING_TONE.bg }}>
      {last ? <CrossingArt stage={last.stage} /> : null}
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, paddingBottom: insets.bottom + space.xl, gap: space.xl }}>
        <Animated.View entering={reduced ? undefined : FadeIn.duration(1200)} style={{ gap: space.sm, alignItems: 'center' }}>
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
function Ledger({ choices, title }: { choices: Parameters<typeof ledger>[0]; title: string }) {
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
});
