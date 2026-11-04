import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { ChevronRight } from '@/src/components/ui/icons';
import { type LibraryEntry, entryHref, relatedTo } from '@/src/games/library';
import { colors, radius, space } from '@/src/theme/tokens';

/** "The other version of this game" on a setup screen, when the library has one (see RELATED). */
export function RelatedGameLink({ entry }: { entry: LibraryEntry }) {
  const related = relatedTo(entry);
  if (!related) return null;
  return (
    <Pressable
      onPress={() => router.push(entryHref(related.entry))}
      accessibilityRole="link"
      accessibilityLabel={`${related.label}. ${related.pitch}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.surfaceHigh : colors.surface })}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="small" weight="semibold" color={colors.primaryText}>
          {related.label}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {related.pitch}
        </AppText>
      </View>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}
