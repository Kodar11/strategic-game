import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@/src/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import type { Info } from './icons';

/**
 * The one empty-state pattern: a small icon, one sentence, and at most one useful action. Used where a whole list
 * has nothing in it yet (history, champions, past weeks). Keep `text` to a single short sentence.
 */
export function EmptyState({ icon: Icon, text, action }: { icon: typeof Info; text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.box} accessible={!action} accessibilityRole={action ? undefined : 'text'}>
      <View style={styles.icon}>
        <Icon size={20} color={colors.textMuted} />
      </View>
      <AppText variant="small" color={colors.textMuted} align="center">
        {text}
      </AppText>
      {action ? <Button label={action.label} variant="secondary" compact onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg },
  icon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
});
