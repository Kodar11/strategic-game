import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { ChevronDown, ChevronRight, ExternalLink, type Info } from '@/src/components/ui/icons';
import { colors, radius, space } from '@/src/theme/tokens';

/** Opens a page of the Tactiqo website in the in-app browser; falls back to the system browser. */
export function openPage(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
}

/** One tappable row: icon, title, optional one-line body, and an external-link or chevron mark. */
export function LinkRow({ icon: Icon, title, body, onPress, external = true }: { icon: typeof Info; title: string; body?: string; onPress: () => void; external?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={body ? `${title}. ${body}` : title}
      accessibilityHint={external ? 'Opens in the browser' : undefined}
      style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <Icon size={18} color={colors.primaryText} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        {body ? (
          <AppText variant="small" color={colors.textMuted}>
            {body}
          </AppText>
        ) : null}
      </View>
      {external ? <ExternalLink size={16} color={colors.textMuted} /> : <ChevronRight size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

/** A question that opens to its answer. Collapsed by default, so the list stays short. */
export function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.faqRow, pressed && { backgroundColor: colors.surfaceHigh }]}>
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {question}
        </AppText>
        <ChevronDown size={18} color={colors.textMuted} style={open ? { transform: [{ rotate: '180deg' }] } : undefined} />
      </Pressable>
      {open ? (
        <AppText variant="small" color={colors.textBody} style={styles.answer} selectable>
          {answer}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: radius.md },
  faqRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: radius.md },
  answer: { paddingHorizontal: space.xs, paddingBottom: space.md },
});
