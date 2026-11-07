import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { ArrowLeft, Check, ChevronRight, Lightbulb, Play, Swords } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { getLesson } from '@/src/content/lessons';
import { rivalOf } from '@/src/features/tournament/content';
import { GameIcon, LEVEL_NAME, gameTitle, playMatch } from '@/src/features/tournament/games';
import { useTournament } from '@/src/features/tournament/store';
import { Kicker, StarRow, toneColors } from '@/src/features/tournament/ui/parts';
import { useLoadTournament, useTournamentStatus } from '@/src/features/tournament/useStatus';
import { SKIP_AFTER, canSkip, findMatch, matchOpen, recordOf, stars } from '@/src/tournament/progress';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

/** Before a tournament match: what the rival does in this game, what beats it, and the stars still to earn. */
export default function MatchIntelScreen() {
  const { matchId } = useLocalSearchParams<{ matchId?: string }>();
  const insets = useSafeAreaInsets();
  useLoadTournament();
  const t = useTournamentStatus();
  const loaded = useTournament((s) => s.loaded);
  const found = matchId ? findMatch(t.season, matchId) : null;

  if (!loaded) return <MessageScreen loading />;
  if (!found) return <MessageScreen title="Match not found" body="This match isn’t part of the current Tournament." />;

  const { stage, match } = found;
  const status = t.stages[found.index];
  const rival = rivalOf(t.doc, stage.rival);
  const tone = toneColors(rival.tone);
  const rec = recordOf(t.progress, match.id);
  const open = matchOpen(status, match);
  const lesson = match.intel.lesson ? getLesson(match.intel.lesson) : undefined;
  const close = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/tournament/[stageId]', params: { stageId: stage.id } }));
  const hardLeft = rec.won && !rec.hard && match.level !== 'hard';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.15} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.xs, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
            <Kicker tone={rival.tone}>{`${stage.title} · ${rival.name}`}</Kicker>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <GameIcon match={match} size={64} />
            <View style={{ flex: 1, gap: 2 }}>
              {match.duel ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Swords size={12} color={tone.fg} />
                  <AppText variant="overline" color={tone.fg}>
                    Rival duel
                  </AppText>
                </View>
              ) : null}
              <AppText variant="title" accessibilityRole="header">
                {gameTitle(match)}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                {LEVEL_NAME[match.level]} · {rival.name} plays a hidden style
              </AppText>
            </View>
          </View>

          <View style={[styles.intel, { borderColor: tone.solid }]}>
            <AppText variant="overline" color={tone.fg}>
              Intel
            </AppText>
            <AppText variant="bodyStrong">{match.intel.tendency}</AppText>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Lightbulb size={18} color={colors.insight} style={{ marginTop: 3 }} />
              <AppText color={colors.textBody} style={{ flex: 1 }}>
                {match.intel.counter}
              </AppText>
            </View>
            {lesson ? (
              <Pressable onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: lesson.id } })} accessibilityRole="link" style={styles.link}>
                <AppText variant="small" color={colors.primaryText} style={{ flex: 1 }}>
                  Full lesson {lesson.number}: {lesson.title}
                </AppText>
                <ChevronRight size={16} color={colors.primaryText} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.starsPanel}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="bodyStrong">Stars</AppText>
              <StarRow count={stars(rec)} size={16} />
            </View>
            <Goal done={rec.won} label="Win the match" />
            <Goal done={rec.read} label="Read the hidden style correctly" />
            <Goal done={rec.hard} label="Win on Hard" />
          </View>

          {open ? (
            <View style={{ gap: space.sm }}>
              <Button label={rec.wins + rec.losses + rec.draws === 0 ? 'Play' : rec.won ? 'Play again' : 'Try again'} icon={Play} iconPosition="left" onPress={() => playMatch(stage, match)} />
              {hardLeft ? <Button label="Play on Hard for the last star" variant="secondary" onPress={() => playMatch(stage, match, 'hard')} /> : null}
              {canSkip(match, rec) ? (
                <Button
                  label="Skip this match (no stars)"
                  variant="ghost"
                  onPress={() => {
                    useTournament.getState().skip(match.id);
                    close();
                  }}
                />
              ) : null}
              {!rec.won && !match.duel && rec.losses + rec.draws > 0 && !canSkip(match, rec) ? (
                <AppText variant="caption" color={colors.textMuted} align="center">
                  Stuck? After {SKIP_AFTER} tries without a win you can skip this match.
                </AppText>
              ) : null}
            </View>
          ) : (
            <AppText color={colors.textMuted}>{status.unlocked ? `Clear the other matches and hold the key card to face ${rival.name}.` : 'This stage is still locked.'}</AppText>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Goal({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessible accessibilityLabel={`${label}: ${done ? 'earned' : 'not yet'}`}>
      <View style={[styles.tick, done && { backgroundColor: colors.successSoft, borderColor: colors.success }]}>{done ? <Check size={12} color={colors.success} strokeWidth={3} /> : null}</View>
      <AppText variant="small" color={done ? colors.text : colors.textMuted}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  intel: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderLeftWidth: 3, backgroundColor: colors.surface },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 36 },
  starsPanel: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgRaised },
  tick: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
});
