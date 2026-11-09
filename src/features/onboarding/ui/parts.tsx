import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Gamepad2, Gauge, HandCoins, Handshake, ScanEye, type LucideIcon } from '@/src/components/ui/icons';
import { colors, radius, space, type TypeVariant } from '@/src/theme/tokens';
import { useMotionReduced } from '@/src/utils/feedback';

/** The scene icons the script names. */
export const SCENE_ICON: Record<string, LucideIcon> = { split: Handshake, deal: HandCoins, read: ScanEye, pressure: Gauge, games: Gamepad2 };

const WORD_MS = 55;

/**
 * A line said by a character, appearing word by word (all at once when motion is reduced). The unrevealed words are
 * laid out but invisible, so the text never reflows, and a screen reader hears the whole line at once.
 */
export function SpokenLine({ text, variant = 'heading', color = colors.text, align = 'center' }: { text: string; variant?: TypeVariant; color?: string; align?: 'center' | 'left' }) {
  const reduced = useMotionReduced();
  const words = text.split(' ');
  // Progress belongs to one line: a new line starts again from its first word.
  const [progress, setProgress] = useState({ text, n: 0 });
  const shown = reduced ? words.length : progress.text === text ? progress.n : 0;

  useEffect(() => {
    if (reduced) return;
    const total = text.split(' ').length;
    const id = setInterval(() => {
      setProgress((p) => {
        const n = p.text === text ? p.n : 0;
        if (n >= total) {
          clearInterval(id);
          return p;
        }
        return { text, n: n + 1 };
      });
    }, WORD_MS);
    return () => clearInterval(id);
  }, [text, reduced]);

  return (
    <AppText variant={variant} color={color} align={align} accessibilityLabel={text}>
      {words.slice(0, shown).join(' ')}
      <Text style={{ opacity: 0 }}>{shown < words.length ? ` ${words.slice(shown).join(' ')}` : ''}</Text>
    </AppText>
  );
}

/** A small uppercase label in a colour, above a step's title. */
export function StepKicker({ children, color = colors.insight }: { children: string; color?: string }) {
  return (
    <AppText variant="overline" color={color} align="center">
      {children}
    </AppText>
  );
}

/** The shared card look of the flow. */
export function Card({ children, tint, border, style }: { children: React.ReactNode; tint?: string; border?: string; style?: object }) {
  return <View style={[styles.card, tint ? { backgroundColor: tint } : null, border ? { borderColor: border } : null, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
