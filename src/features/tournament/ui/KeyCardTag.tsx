import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { KeyRound } from '@/src/components/ui/icons';
import { colors, space } from '@/src/theme/tokens';
import { rivalOf, useTournamentContent } from '../content';

/** "Key card · Arc 1, Vesper": on a lesson that earns a tournament stage's key card. Nothing otherwise. */
export function KeyCardTag({ lesson }: { lesson: string }) {
  const label = useTournamentContent((s) => {
    const stage = s.season.stages.find((st) => st.lessons.includes(lesson));
    return stage ? `Key card · ${stage.title}, ${rivalOf(s.doc, stage.rival).name}` : null;
  });
  if (!label) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 2 }}>
      <KeyRound size={13} color={colors.insight} strokeWidth={2.2} />
      <AppText variant="caption" color={colors.insight}>
        {label}
      </AppText>
    </View>
  );
}
