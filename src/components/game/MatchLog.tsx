import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { ChevronDown } from '@/src/components/ui/icons';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors, radius, space } from '@/src/theme/tokens';

/**
 * A folded section under a board: round history, evidence, details. The content is each game's own and must hold only
 * what the player may already know. Folded, it is one line, so the current decision stays in reach.
 */
export function MatchLog({ title, summary, defaultOpen = false, children }: { title: string; summary?: string; defaultOpen?: boolean; children: ReactNode }) {
  const reduced = useMotionReduced();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.box}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${title}${summary ? `. ${summary}` : ''}`} style={({ pressed }) => [styles.head, pressed && { opacity: 0.75 }]}>
        <View style={{ flex: 1 }}>
          <AppText variant="small" weight="semibold" color={colors.textBody} numberOfLines={1}>
            {title}
          </AppText>
          {summary ? (
            <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>
              {summary}
            </AppText>
          ) : null}
        </View>
        <ChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(180)} style={styles.body}>
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

const TONE = {
  plain: { bg: colors.surface, border: colors.border, fg: colors.textMuted },
  good: { bg: colors.successSoft, border: 'rgba(74,222,128,0.35)', fg: colors.success },
  bad: { bg: colors.rivalSoft, border: 'rgba(249,115,22,0.35)', fg: colors.rivalText },
  insight: { bg: colors.insightSoft, border: 'rgba(253,186,116,0.35)', fg: colors.insight },
} as const;

/**
 * What just happened, in one line, with the full account a tap away. Remounts with `revealKey`, so each round starts
 * folded and is announced to screen readers.
 */
export function CompactReveal({ revealKey, tone = 'plain', overline, summary, children }: { revealKey: string | number; tone?: keyof typeof TONE; overline?: string; summary: string; children?: ReactNode }) {
  return <CompactRevealBody key={revealKey} tone={tone} overline={overline} summary={summary}>{children}</CompactRevealBody>;
}

function CompactRevealBody({ tone, overline, summary, children }: { tone: keyof typeof TONE; overline?: string; summary: string; children?: ReactNode }) {
  const reduced = useMotionReduced();
  const [open, setOpen] = useState(false);
  const t = TONE[tone];
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={{ flex: 1, gap: 1 }}>
        {overline ? (
          <AppText variant="overline" color={t.fg} numberOfLines={1}>
            {overline}
          </AppText>
        ) : null}
        <AppText variant="small" weight="semibold" color={colors.text} accessibilityLiveRegion="polite">
          {summary}
        </AppText>
      </View>
      {children ? <ChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} /> : null}
    </View>
  );
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} style={[styles.reveal, { backgroundColor: t.bg, borderColor: t.border }]}>
      {children ? (
        <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityHint="Shows the full round" style={{ minHeight: 40, justifyContent: 'center' }}>
          {content}
        </Pressable>
      ) : (
        <View style={{ minHeight: 40, justifyContent: 'center' }}>{content}</View>
      )}
      {open ? <View style={{ gap: space.xs, paddingTop: space.xs }}>{children}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.md, paddingVertical: space.xs },
  body: { gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.md },
  reveal: { paddingHorizontal: space.md, paddingVertical: 2, borderRadius: radius.md, borderWidth: 1 },
});
