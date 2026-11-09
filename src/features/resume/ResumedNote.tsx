import { RotateCcw } from '@/src/components/ui/icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { colors, radius, space } from '@/src/theme/tokens';

/** One quiet line at the top of a match that was continued from where the player left it. */
export function ResumedNote() {
  return (
    <View style={styles.note} accessibilityLiveRegion="polite">
      <RotateCcw size={14} color={colors.textMuted} strokeWidth={2.2} />
      <AppText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
        Picked up where you left off.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.md, backgroundColor: colors.surface },
});
