import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { BookOpen, ChevronDown, Compass } from '@/src/components/ui/icons';
import { getLesson } from '@/src/content/lessons';
import { hasCatalog } from '@/src/content/catalog';
import type { ReflectionGame } from '@/src/reflections/registry';
import type { Reflection } from '@/src/reflections/types';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';
import { useReflection } from './useReflection';

/** What the card shows. Only copy and a lesson id reach the UI — never the evidence or anything about the opponent. */
export type ReflectionView = Pick<Reflection, 'id' | 'thought' | 'idea' | 'perspective' | 'question' | 'lesson'>;

/** The published lesson to link to, or null when the id isn't in the loaded catalog. */
export function linkedLesson(id: Reflection['lesson']) {
  if (!id || !hasCatalog()) return null;
  return getLesson(id) ?? null;
}

/**
 * The reflection for a finished match. `record`: the rounds (classic games) or the final engine state (arena games).
 * Render it only with the result, after any personality reveal.
 */
export function MatchReflection({ game, record }: { game: ReflectionGame; record: unknown }) {
  const r = useReflection(game, record);
  return <ReflectionCard reflection={{ id: r.id, thought: r.thought, idea: r.idea, perspective: r.perspective, question: r.question, lesson: r.lesson }} />;
}

/**
 * "A thought to take with you": one short observation from the match, and — only when the player asks — the idea
 * behind it, another way to see it, a question to try, and (when one teaches it) a lesson. Collapsed by default.
 */
export function ReflectionCard({ reflection }: { reflection: ReflectionView }) {
  const [open, setOpen] = useState(false);
  const reduced = useMotionReduced();
  const lesson = linkedLesson(reflection.lesson);

  return (
    <View style={{ gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(34,211,238,0.28)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Compass size={18} color={colors.accent} strokeWidth={2.2} />
        <AppText variant="overline" color={colors.accent} accessibilityRole="header" style={{ flex: 1 }}>
          A thought to take with you
        </AppText>
      </View>
      <AppText variant="body" color={colors.text}>
        {reflection.thought}
      </AppText>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        aria-expanded={open}
        accessibilityLabel={open ? 'Hide this idea' : 'Explore this idea'}
        hitSlop={8}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
        <AppText variant="small" weight="semibold" color={colors.accent}>
          {open ? 'Hide this idea' : 'Explore this idea'}
        </AppText>
        <ChevronDown size={16} color={colors.accent} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} style={{ gap: space.md, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Part label="The idea" text={reflection.idea} />
          <Part label="Another way to see it" text={reflection.perspective} />
          <Part label="A question to try" text={reflection.question} />
          {lesson ? (
            <Pressable
              onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: lesson.id } })}
              accessibilityRole="link"
              accessibilityLabel={`Explore this concept in a lesson: ${lesson.title}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.surfaceHigh : colors.bgRaised })}>
              <BookOpen size={16} color={colors.primaryText} />
              <View style={{ flex: 1, paddingVertical: space.xs }}>
                <AppText variant="caption" color={colors.textMuted}>
                  Explore this concept in a lesson
                </AppText>
                <AppText variant="small" weight="semibold" color={colors.primaryText}>
                  {lesson.title}
                </AppText>
              </View>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

function Part({ label, text }: { label: string; text: string }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="small" color={colors.textBody}>
        {text}
      </AppText>
    </View>
  );
}
