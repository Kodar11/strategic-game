import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { ArrowLeft, ChevronRight, CircleCheck, KeyRound, Lock, Swords } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { getLesson } from '@/src/content/lessons';
import { rivalOf } from '@/src/features/tournament/content';
import { GameIcon, LEVEL_NAME, gameTitle } from '@/src/features/tournament/games';
import { useTournament } from '@/src/features/tournament/store';
import { Kicker, ProgressBar, RivalMark, StarRow, toneColors } from '@/src/features/tournament/ui/parts';
import { useLoadTournament, useTournamentStatus } from '@/src/features/tournament/useStatus';
import { track } from '@/src/observability';
import { cleared, mainStages, matchOpen, recordOf, stars } from '@/src/tournament/progress';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

/** One stage of the bracket: its rival, the intro scene the first time, the key card, and its matches. */
export default function StageScreen() {
  const { stageId } = useLocalSearchParams<{ stageId?: string }>();
  const insets = useSafeAreaInsets();
  useLoadTournament();
  const t = useTournamentStatus();
  const loaded = useTournament((s) => s.loaded);
  const status = t.stages.find((s) => s.stage.id === stageId);
  const tracked = useRef(false);
  const firstVisit = !!status && !t.progress.seen.includes(status.stage.id);

  useEffect(() => {
    if (!loaded || !status || tracked.current || !status.unlocked) return;
    tracked.current = true;
    track('tournament_stage_opened', { season_id: t.season.id, stage_id: status.stage.id, first: firstVisit });
  }, [loaded, status, firstVisit, t.season.id]);

  if (!loaded) return <MessageScreen loading />;
  if (!status) return <MessageScreen title="Stage not found" body="This part of the Tournament isn’t available." />;

  const { stage } = status;
  const rival = rivalOf(t.doc, stage.rival);
  const tone = toneColors(rival.tone);
  const main = mainStages(t.season);
  const previous = stage.kind === 'side' ? main[0] : (main[main.indexOf(stage) - 1] ?? null);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.15} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.xs, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
            <AppText variant="bodyStrong" color={colors.textMuted}>
              {t.season.title}
            </AppText>
          </View>

          <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
            <RivalMark rival={rival} size={64} dim={!status.unlocked} done={status.cleared} />
            <View style={{ flex: 1, gap: 2 }}>
              <Kicker tone={rival.tone}>{`${stage.title} · ${stage.theme}`}</Kicker>
              <AppText variant="title" accessibilityRole="header">
                {rival.name}
              </AppText>
              <AppText variant="small" color={colors.textMuted}>
                {rival.epithet} · {rival.bio}
              </AppText>
            </View>
          </View>

          {!status.unlocked ? (
            <View style={styles.panel}>
              <Lock size={18} color={colors.textMuted} />
              <AppText color={colors.textBody}>Clear {previous ? `${previous.title}` : 'the previous stage'} to enter this stage.</AppText>
            </View>
          ) : (
            <>
              {firstVisit ? (
                <View style={[styles.scene, { borderColor: tone.solid }]}>
                  {stage.intro.map((line, i) => (
                    <AppText key={i} color={i === 0 ? colors.text : colors.textBody} variant={i === 0 ? 'bodyStrong' : 'body'}>
                      {line}
                    </AppText>
                  ))}
                  <Button label="Enter" compact onPress={() => useTournament.getState().markSeen(stage.id)} style={{ alignSelf: 'flex-start' }} />
                </View>
              ) : null}

              <View>
                <ProgressBar value={status.clearedCount} max={stage.matches.length} color={tone.solid} />
                <AppText variant="caption" color={colors.textMuted} tabular style={{ marginTop: space.xs }}>
                  {status.clearedCount} of {stage.matches.length} cleared · {status.stars} of {status.maxStars} stars
                </AppText>
              </View>

              {stage.lessons.length > 0 ? <KeyCard stageId={stage.id} held={status.keyCard} lessons={stage.lessons} rivalName={rival.name} /> : null}

              <View style={{ gap: space.sm }}>
                {stage.matches.map((m) => {
                  const rec = recordOf(t.progress, m.id);
                  const open = matchOpen(status, m);
                  const done = cleared(rec);
                  return (
                    <Pressable
                      key={m.id}
                      disabled={!open}
                      onPress={() => router.push({ pathname: '/tournament/match/[matchId]', params: { matchId: m.id } })}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !open }}
                      accessibilityLabel={`${m.duel ? 'Rival duel: ' : ''}${gameTitle(m)}, ${LEVEL_NAME[m.level]}. ${!open ? (status.keyCard ? 'Clear the other matches first.' : 'Needs the key card and the other matches cleared.') : done ? (rec.skipped && !rec.won ? 'Skipped.' : 'Cleared.') : 'Not cleared yet.'} ${stars(rec)} of 3 stars.`}
                      style={({ pressed }) => [styles.match, m.duel && { borderColor: tone.solid }, !open && { opacity: 0.55 }, pressed && { opacity: 0.85 }]}>
                      <GameIcon match={m} size={44} />
                      <View style={{ flex: 1, gap: 2 }}>
                        {m.duel ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Swords size={12} color={tone.fg} />
                            <AppText variant="overline" color={tone.fg}>
                              Rival duel
                            </AppText>
                          </View>
                        ) : null}
                        <AppText variant="bodyStrong">{gameTitle(m)}</AppText>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                          <StarRow count={stars(rec)} />
                          <AppText variant="caption" color={colors.textMuted}>
                            {LEVEL_NAME[m.level]}
                            {rec.skipped && !rec.won ? ' · skipped' : ''}
                            {rec.replay ? ' · Hard Replay cleared' : ''}
                          </AppText>
                        </View>
                      </View>
                      {!open ? <Lock size={16} color={colors.textFaint} /> : done ? <CircleCheck size={18} color={colors.success} strokeWidth={2.4} /> : <ChevronRight size={18} color={colors.textMuted} />}
                    </Pressable>
                  );
                })}
              </View>

              {status.cleared ? (
                <AppText variant="small" color={colors.success}>
                  {rival.lines.defeated}
                </AppText>
              ) : null}
              <AppText variant="caption" color={colors.textMuted}>
                Stars: win · read the hidden style correctly · win on Hard.
              </AppText>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function KeyCard({ stageId, held, lessons, rivalName }: { stageId: string; held: boolean; lessons: readonly string[]; rivalName: string }) {
  return (
    <View style={[styles.panel, { flexDirection: 'column', alignItems: 'stretch', borderColor: held ? 'rgba(74,222,128,0.35)' : 'rgba(253,186,116,0.35)' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <KeyRound size={18} color={held ? colors.success : colors.insight} />
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {held ? 'Key card held' : `Earn the key card to face ${rivalName}`}
        </AppText>
        {held ? <Badge label="Ready" tone="success" /> : null}
      </View>
      {held ? null : (
        <>
          <AppText variant="small" color={colors.textBody}>
            Finish any one of these lessons, or pass a 3-question check.
          </AppText>
          <View style={{ gap: space.xs }}>
            {lessons.map((id) => {
              const l = getLesson(id);
              if (!l) return null;
              return (
                <Pressable key={id} onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: id } })} accessibilityRole="link" style={styles.lessonLink}>
                  <AppText variant="small" color={colors.primaryText} style={{ flex: 1 }}>
                    Lesson {l.number}: {l.title}
                  </AppText>
                  <ChevronRight size={16} color={colors.primaryText} />
                </Pressable>
              );
            })}
          </View>
          <Button label="Take the 3-question check" variant="secondary" compact onPress={() => router.push({ pathname: '/tournament/check/[stageId]', params: { stageId } })} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  panel: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  scene: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderLeftWidth: 3, backgroundColor: colors.bgRaised },
  match: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  lessonLink: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44 },
});
