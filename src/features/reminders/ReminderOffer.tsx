import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Clock } from '@/src/components/ui/icons';
import { shouldOffer } from '@/src/tournament/reminders';
import { colors, radius, space } from '@/src/theme/tokens';
import { disableReminders, enableReminders, onVisit, remindersSupported, useReminders } from './reminders';

/**
 * Home's one-time reminder offer, shown from the second day of use until answered. Asking here, in the app's own
 * words, comes before the system prompt, so the system prompt only appears for someone who already said yes.
 * Also counts the visit and reschedules reminders that are on.
 */
export function ReminderOffer() {
  const state = useReminders();

  useFocusEffect(
    useCallback(() => {
      void onVisit();
    }, []),
  );

  if (!remindersSupported || !state.loaded || !shouldOffer(state)) return null;
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Clock size={18} color={colors.primaryText} />
        <AppText variant="bodyStrong" style={{ flex: 1 }} accessibilityRole="header">
          Want a reminder?
        </AppText>
      </View>
      <AppText variant="small" color={colors.textBody}>
        One nudge in the evening for your Daily streak, and a note when a rival is waiting. Turn it off any time in Settings.
      </AppText>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Turn on" compact onPress={() => void enableReminders()} style={{ flex: 1 }} />
        <Button label="Not now" variant="ghost" compact onPress={() => void disableReminders(true)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
