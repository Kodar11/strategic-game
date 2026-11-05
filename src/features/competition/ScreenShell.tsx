import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { ArrowLeft, RefreshCw } from '@/src/components/ui/icons';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';
import type { Remote } from './useRemote';

/** A pushed screen: back, title, optional refresh, scrolling content within the content width and safe areas. */
export function ScreenShell({ title, onRefresh, fallback = '/games', children }: { title: string; onRefresh?: () => void; fallback?: '/games' | '/'; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const close = () => (router.canGoBack() ? router.back() : router.replace(fallback));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <View style={styles.head}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
            <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={2}>
              {title}
            </AppText>
            {onRefresh ? <IconButton icon={RefreshCw} label="Refresh" onPress={onRefresh} /> : null}
          </View>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

/** Loading → content, or the server's error with a retry. Never placeholder data. */
export function RemoteView<T>({ state, onRetry, children }: { state: Remote<T>; onRetry: () => void; children: (d: T) => ReactNode }) {
  if (state.status === 'loading') return <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} accessibilityLabel="Loading" />;
  if (state.status === 'error')
    return (
      <View style={{ gap: space.md, alignItems: 'flex-start' }}>
        <AppText color={colors.textBody}>{state.error.message}</AppText>
        <Button label="Try again" variant="secondary" compact icon={RefreshCw} iconPosition="left" onPress={onRetry} />
      </View>
    );
  return <>{children(state.data)}</>;
}

export const shellStyles = StyleSheet.create({
  card: { gap: space.xs, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.md, backgroundColor: colors.surface },
  rowMe: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  rowLeader: { borderWidth: 1, borderColor: 'rgba(253,186,116,0.45)' },
  champion: { gap: space.sm, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(253,186,116,0.55)', backgroundColor: colors.bgRaised, alignItems: 'center' },
});

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
