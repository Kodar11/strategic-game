import { CloudOff } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnectivity } from '@/src/data/sync/connectivity';
import { indicatorFor } from '@/src/data/sync/indicator';
import { colors } from '@/src/theme/tokens';
import { AppText } from './AppText';

/**
 * A small, calm "Offline" label at the top of the screen while the device can't reach the server. Syncing runs
 * silently in the background and is never shown. Never takes touches; announced politely.
 */
export function SyncIndicator() {
  const insets = useSafeAreaInsets();
  const network = useConnectivity((s) => s.network);
  const backend = useConnectivity((s) => s.backend);
  const shown = indicatorFor({ signedIn: false, network, backend, sync: { pending: 0, state: 'idle' } });

  if (!shown) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <View style={styles.pill} accessible accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel={shown.label}>
        <CloudOff size={12} color={colors.textMuted} />
        <AppText variant="caption" color={colors.textMuted}>
          {shown.label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.bgRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
});
