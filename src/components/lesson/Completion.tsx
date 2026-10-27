import { router } from 'expo-router';
import { ArrowRight, House, RotateCcw, Trophy } from '@/src/components/ui/icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Portrait } from '@/src/components/characters/Portrait';
import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Badge, Card } from '@/src/components/ui/Card';
import { type LessonMeta, allLessons, nextLesson } from '@/src/content/lessons';
import { moduleCheckpoint } from '@/src/features/assessments/content';
import { challengesFor } from '@/src/features/challenges/content';
import { isTried } from '@/src/features/challenges/progress';
import { useProgress } from '@/src/store/progress';
import type { ClipId } from '@/src/features/audio/clips';
import { useNarrateOnMount } from '@/src/features/audio/useNarration';
import { haptic, useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { useEnter } from './motion';

/**
 * Final step of every lesson: takeaway, the learner's own path through it, a reflection question,
 * then next / replay / home.
 */
export function Completion({
  lesson,
  takeaway,
  remember,
  onReplay,
  takeawayClip,
  recap,
  reflection,
  nextHook,
}: {
  lesson: LessonMeta;
  takeaway: string;
  remember: string[];
  onReplay: () => void;
  /** Prof. Sen reads the takeaway when the lesson completes. */
  takeawayClip?: ClipId;
  /** What this learner actually predicted and decided, built from lesson state. Never a judgement of the person. */
  recap?: string[];
  /** One question or small challenge to carry the idea into a new situation. */
  reflection?: string;
  /** Why the next lesson is a different problem worth opening. */
  nextHook?: string;
}) {
  const enter = useEnter();
  useNarrateOnMount(takeawayClip);
  const reduced = useMotionReduced();
  const next = nextLesson(lesson.id);
  // Optional practice in new situations. Dismissable, and never required to finish or leave the lesson.
  const [practiceOpen, setPracticeOpen] = useState(true);
  const learning = useProgress((s) => s.learning);
  const challenges = challengesFor(lesson.id);
  const tried = challenges.filter((c) => isTried(learning, c.id)).length;
  // The last lesson of a module leads into that module's checkpoint.
  const endsModule = allLessons().filter((l) => l.module === lesson.module).at(-1)?.id === lesson.id;
  const checkpoint = endsModule ? moduleCheckpoint(lesson.module) : null;

  useEffect(() => {
    haptic.success();
  }, []);

  return (
    <View style={{ gap: space.xl }}>
      <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.lg }}>
        <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(14)} style={styles.trophy}>
          <Trophy size={34} color={colors.insight} strokeWidth={2} />
        </Animated.View>
        <Badge label={`Lesson ${lesson.number} complete`} tone="amber" style={{ alignSelf: 'center' }} />
        <AppText variant="title" align="center" accessibilityRole="header">
          {lesson.title}
        </AppText>
      </View>

      <Animated.View entering={enter(120)}>
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <Portrait character="sen" expression="satisfied" size={44} />
            <AppText variant="overline" color={colors.insight}>
              The takeaway
            </AppText>
          </View>
          <AppText variant="heading">{takeaway}</AppText>
          <View style={{ gap: space.sm }}>
            {remember.map((r) => (
              <View key={r} style={{ flexDirection: 'row', gap: space.sm }}>
                <AppText color={colors.insight}>—</AppText>
                <AppText variant="small" style={{ flex: 1 }}>
                  {r}
                </AppText>
              </View>
            ))}
          </View>
        </Card>
      </Animated.View>

      {recap && recap.length ? (
        <Animated.View entering={enter(170)}>
          <Card style={{ gap: space.sm }}>
            <AppText variant="overline" color={colors.primaryText}>
              Your path through it
            </AppText>
            {recap.map((r) => (
              <View key={r} style={{ flexDirection: 'row', gap: space.sm }}>
                <AppText color={colors.primaryText}>•</AppText>
                <AppText variant="small" style={{ flex: 1 }}>
                  {r}
                </AppText>
              </View>
            ))}
          </Card>
        </Animated.View>
      ) : null}

      {reflection ? (
        <Animated.View entering={enter(200)} style={styles.reflection}>
          <AppText variant="overline" color={colors.accent}>
            Take it further
          </AppText>
          <AppText variant="body">{reflection}</AppText>
        </Animated.View>
      ) : null}

      {checkpoint ? (
        <Animated.View entering={enter(205)} style={styles.practice}>
          <AppText variant="overline" color={colors.primaryText}>
            Module checkpoint
          </AppText>
          <AppText variant="heading">{checkpoint.title}</AppText>
          <AppText variant="small" color={colors.textBody}>
            {checkpoint.items.length} short questions that combine this module’s ideas. Your first score is kept; you can retake any time.
          </AppText>
          <Button label="Take the checkpoint" icon={ArrowRight} compact onPress={() => router.push({ pathname: '/checkpoint/[assessmentId]', params: { assessmentId: checkpoint.id } })} />
        </Animated.View>
      ) : null}

      {practiceOpen && challenges.length ? (
        <Animated.View entering={enter(210)} style={styles.practice}>
          <AppText variant="overline" color={colors.primaryText}>
            Practice
          </AppText>
          <AppText variant="heading">Ready to try this idea somewhere new?</AppText>
          <AppText variant="small" color={colors.textBody}>
            {challenges.length === 3 ? 'Three' : challenges.length} short challenges. New situations. The same strategic thinking.{tried ? ` You've tried ${tried} of ${challenges.length}.` : ''}
          </AppText>
          <Button
            label={tried === challenges.length ? 'Revisit challenges' : 'Start challenges'}
            icon={ArrowRight}
            compact
            onPress={() => router.push({ pathname: '/challenges/[lessonId]', params: { lessonId: lesson.id } })}
          />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="Review lesson" variant="ghost" compact onPress={onReplay} style={{ flex: 1 }} />
            <Button label="Not now" variant="ghost" compact onPress={() => setPracticeOpen(false)} style={{ flex: 1 }} />
          </View>
        </Animated.View>
      ) : null}

      <Animated.View entering={enter(220)} style={{ gap: space.sm }}>
        {next && nextHook ? (
          <AppText variant="small" color={colors.textMuted} align="center">
            {nextHook}
          </AppText>
        ) : null}
        {next ? (
          <Button
            label={`Next: ${next.title}`}
            icon={ArrowRight}
            onPress={() => router.replace({ pathname: '/lesson/[lessonId]', params: { lessonId: next.id } })}
          />
        ) : (
          <Button label="Back to all lessons" icon={House} iconPosition="left" onPress={() => router.replace('/')} />
        )}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label="Replay" variant="secondary" icon={RotateCcw} iconPosition="left" onPress={onReplay} style={{ flex: 1 }} />
          {next ? (
            <Button label="Home" variant="secondary" icon={House} iconPosition="left" onPress={() => router.replace('/')} style={{ flex: 1 }} />
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  reflection: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.3)',
    backgroundColor: colors.bgRaised,
  },
  practice: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  trophy: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.insightSoft,
    borderWidth: 1,
    borderColor: 'rgba(253,186,116,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
