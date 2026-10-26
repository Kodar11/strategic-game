import { CircleCheck, Info, Lightbulb, TriangleAlert } from '@/src/components/ui/icons';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Portrait } from '@/src/components/characters/Portrait';
import { CAST, type CharacterId, type Expression } from '@/src/components/characters/cast';
import { AppText } from '@/src/components/ui/AppText';
import type { ClipId } from '@/src/features/audio/clips';
import { narration } from '@/src/features/audio/narration';
import { hasClipAudio, useNarrateOnMount } from '@/src/features/audio/useNarration';
import { colors, radius, space } from '@/src/theme/tokens';
import { useEnter } from './motion';
import type { Verdict } from './verdict';

/**
 * A character speaking. Kept short: characters clarify, they don't lecture.
 * With `clip`, the line is spoken once when it appears, and tapping the bubble replays it.
 * Without one (or before its audio exists) it renders exactly as plain dialogue.
 */
export function Dialogue({
  character,
  expression = 'neutral',
  children,
  delay = 0,
  align = 'left',
  clip,
  clipKey,
}: {
  character: CharacterId;
  expression?: Expression;
  children: ReactNode;
  delay?: number;
  align?: 'left' | 'right';
  clip?: ClipId | null;
  /** Dedupe key when the same clip can legitimately be spoken again on another screen. */
  clipKey?: string;
}) {
  const enter = useEnter();
  const spec = CAST[character];
  const right = align === 'right';
  useNarrateOnMount(clip, clipKey);
  const bubbleStyle = [styles.bubble, right ? styles.bubbleRight : styles.bubbleLeft];
  const content = (
    <>
      <AppText variant="caption" color={spec.accent} style={{ marginBottom: 2 }}>
        {spec.name}
      </AppText>
      {isTextLike(children) ? <AppText variant="body">{children}</AppText> : children}
    </>
  );
  return (
    <Animated.View entering={enter(delay)} style={[styles.dialogue, right && { flexDirection: 'row-reverse' }]}>
      <Portrait character={character} expression={expression} size={52} />
      {hasClipAudio(clip) ? (
        <Pressable
          onPress={() => narration.replay(clip)}
          accessibilityHint="Plays this line again"
          style={({ pressed }) => [...bubbleStyle, pressed && { backgroundColor: colors.surfaceHigh }]}>
          {content}
        </Pressable>
      ) : (
        <View style={bubbleStyle}>{content}</View>
      )}
    </Animated.View>
  );
}

type PanelTone = 'insight' | 'info' | 'success' | 'caution';

const PANEL: Record<PanelTone, { bg: string; border: string; fg: string; Icon: typeof Lightbulb }> = {
  insight: { bg: colors.insightSoft, border: 'rgba(253,186,116,0.35)', fg: colors.insight, Icon: Lightbulb },
  info: { bg: colors.accentSoft, border: 'rgba(34,211,238,0.3)', fg: colors.accent, Icon: Info },
  success: { bg: colors.successSoft, border: 'rgba(74,222,128,0.3)', fg: colors.success, Icon: CircleCheck },
  caution: { bg: colors.rivalSoft, border: 'rgba(249,115,22,0.35)', fg: colors.rivalText, Icon: TriangleAlert },
};

/** Insight / feedback panel. The icon and title carry the meaning alongside the colour. */
export function Panel({
  tone = 'insight',
  title,
  children,
  delay = 0,
  clip,
}: {
  tone?: PanelTone;
  title: string;
  children?: ReactNode;
  delay?: number;
  /** Narrated once when the panel appears. Use NarrateOn instead for panels revealed by a learner action. */
  clip?: ClipId | null;
}) {
  const enter = useEnter();
  useNarrateOnMount(clip);
  const t = PANEL[tone];
  return (
    <Animated.View entering={enter(delay)} style={[styles.panel, { backgroundColor: t.bg, borderColor: t.border }]}>
      <View style={styles.panelHead}>
        <t.Icon size={18} color={t.fg} strokeWidth={2.2} />
        <AppText variant="bodyStrong" color={t.fg} style={{ flex: 1 }}>
          {title}
        </AppText>
      </View>
      {isTextLike(children) ? (
        <AppText variant="body" style={{ marginTop: space.xs }}>
          {children}
        </AppText>
      ) : children ? (
        <View style={{ marginTop: space.xs }}>{children}</View>
      ) : null}
    </Animated.View>
  );
}

const VERDICT: Record<Verdict, { tone: PanelTone; title: string }> = {
  match: { tone: 'success', title: 'Matches the model' },
  defensible: { tone: 'info', title: 'Defensible — with a gap' },
  misconception: { tone: 'caution', title: 'Worth a second look' },
  depends: { tone: 'insight', title: 'Depends on an assumption' },
};

/**
 * Feedback on a learner's answer. Green is reserved for answers that match the model; a reasonable
 * alternative, a common misreading and an assumption-dependent answer each read differently.
 */
export function FeedbackPanel({ verdict, title, children, delay }: { verdict: Verdict; title?: string; children?: ReactNode; delay?: number }) {
  const v = VERDICT[verdict];
  return (
    <Panel tone={v.tone} title={title ?? v.title} delay={delay}>
      {children}
    </Panel>
  );
}

/** Screen heading block used at the top of each lesson step. */
export function StepHeading({ kicker, title, body, clip }: { kicker?: string; title: string; body?: string; clip?: ClipId }) {
  const enter = useEnter();
  useNarrateOnMount(clip);
  return (
    <Animated.View entering={enter(0, 'fade')} style={{ gap: space.sm }}>
      {kicker ? (
        <AppText variant="overline" color={colors.primaryText}>
          {kicker}
        </AppText>
      ) : null}
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" color={colors.textMuted}>
          {body}
        </AppText>
      ) : null}
    </Animated.View>
  );
}

/** A labelled number, e.g. "Your profit 8". */
export function Stat({
  label,
  value,
  tone = 'neutral',
  caption,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'blue' | 'orange' | 'amber';
  caption?: string;
}) {
  const color = tone === 'blue' ? colors.primaryText : tone === 'orange' ? colors.rivalText : tone === 'amber' ? colors.insight : colors.text;
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="number" color={color} tabular style={{ fontSize: 30, lineHeight: 36 }}>
        {value}
      </AppText>
      {caption ? (
        <AppText variant="caption" color={colors.textMuted}>
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

export function Bullet({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <AppText variant="body" color={colors.textMuted}>
        •
      </AppText>
      <AppText variant="body" style={{ flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  dialogue: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  bubble: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  bubbleLeft: { borderTopLeftRadius: 4 },
  bubbleRight: { borderTopRightRadius: 4 },
  panel: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.bgRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 2,
  },
});

/** Strings, numbers, and JSX text with interpolations (arrays of those) must be wrapped in a Text. */
function isTextLike(node: ReactNode): boolean {
  if (typeof node === 'string' || typeof node === 'number') return true;
  return Array.isArray(node) && node.length > 0 && node.every((n) => typeof n === 'string' || typeof n === 'number');
}
