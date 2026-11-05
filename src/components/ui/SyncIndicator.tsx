import { CloudOff, RefreshCw, Check, HardDrive, CircleAlert } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/src/auth/store';
import { useSyncStatus } from '@/src/data/session';
import { useConnectivity } from '@/src/data/sync/connectivity';
import { type Indicator, indicatorFor } from '@/src/data/sync/indicator';
import { colors } from '@/src/theme/tokens';
import { AppText } from './AppText';

/** "Syncing…" only once a sync has taken this long, so ordinary saves (a fraction of a second) never flash a label. */
const SYNCING_DELAY_MS = 1500;
const SYNCED_MS = 2000;

const ICONS = { offline: CloudOff, saved: HardDrive, syncing: RefreshCw, retrying: RefreshCw, error: CircleAlert, synced: Check } as const;

/**
 * A small, calm label at the top of the screen about the connection and unsynced work: "Offline", "Saved on device",
 * "Syncing progress…", "Couldn't sync yet. We'll retry." and, briefly, "Synced" once work that was waiting has actually
 * reached the server. Online with nothing waiting it shows nothing. Never takes touches; announced politely.
 */
export function SyncIndicator() {
  const insets = useSafeAreaInsets();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const network = useConnectivity((s) => s.network);
  const backend = useConnectivity((s) => s.backend);
  const pending = useSyncStatus((s) => s.pending);
  const state = useSyncStatus((s) => s.state);
  const target = indicatorFor({ signedIn, network, backend, sync: { pending, state } });

  // A sync that has lasted long enough to mention, and the brief "Synced" afterwards. Both only change in timers.
  const [syncingShown, setSyncingShown] = useState(false);
  const [synced, setSynced] = useState(false);
  const wasVisible = useRef(false);
  const kind = target?.kind ?? null;
  const settled = signedIn && pending === 0 && state === 'idle';

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, f: () => void) => timers.push(setTimeout(f, ms));
    if (kind === 'syncing' && !wasVisible.current) {
      later(SYNCING_DELAY_MS, () => {
        wasVisible.current = true;
        setSyncingShown(true);
      });
    } else if (kind) {
      wasVisible.current = true;
      later(0, () => {
        setSynced(false);
        setSyncingShown(true);
      });
    } else if (wasVisible.current && settled) {
      // Only after something waiting was shown and the queue really emptied on the server's acceptance.
      wasVisible.current = false;
      later(0, () => {
        setSyncingShown(false);
        setSynced(true);
      });
      later(SYNCED_MS, () => setSynced(false));
    } else {
      wasVisible.current = false;
      later(0, () => setSyncingShown(false));
    }
    return () => timers.forEach(clearTimeout);
  }, [kind, settled]);

  const shown: (Indicator & { synced?: boolean }) | null =
    target && (target.kind !== 'syncing' || syncingShown) ? target : !target && synced ? { kind: 'syncing', label: 'Synced', synced: true } : null;

  if (!shown) return null;
  const Icon = shown.synced ? ICONS.synced : ICONS[shown.kind];
  const tint = shown.kind === 'error' ? colors.danger : shown.synced ? colors.success : colors.textMuted;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <View style={styles.pill} accessible accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel={shown.label}>
        <Icon size={12} color={tint} />
        <AppText variant="caption" color={tint}>
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
