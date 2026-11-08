import { View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { findMatch, thoughtMoment } from '@/src/tournament/progress';
import { colors, radius, space } from '@/src/theme/tokens';
import { useTournamentContent } from '../content';

/**
 * The player's inner voice during a tournament game: one short line at the start, around the middle and before the
 * last round (the match's `monologue` in the tournament document). Nothing between those moments, nothing once the
 * game is over, and nothing for a match without lines.
 */
export function TournamentThought({ matchId, played, total, over }: { matchId: string; played: number; total: number; over: boolean }) {
  const season = useTournamentContent((s) => s.season);
  const moment = over ? null : thoughtMoment(played, total);
  const line = moment ? findMatch(season, matchId)?.match.monologue?.[moment] : undefined;
  if (!line) return null;
  return (
    <View accessible accessibilityLabel={`Your thought: ${line}`} accessibilityLiveRegion="polite" style={{ paddingVertical: space.xs, paddingHorizontal: space.md, borderLeftWidth: 2, borderLeftColor: colors.insight, borderRadius: radius.sm, backgroundColor: colors.insightSoft }}>
      <AppText variant="small" color={colors.textBody} style={{ fontStyle: 'italic' }}>
        {line}
      </AppText>
    </View>
  );
}
