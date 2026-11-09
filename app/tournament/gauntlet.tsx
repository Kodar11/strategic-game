import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Card';
import { ArrowLeft, CircleCheck, CircleX, HandHeart, Lock, Play, Swords } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { rivalOf } from '@/src/features/tournament/content';
import { GameIcon, LEVEL_NAME, gameTitle, playBout } from '@/src/features/tournament/games';
import { boutToken, useGauntlet } from '@/src/features/tournament/gauntlet-store';
import { useTournament } from '@/src/features/tournament/store';
import { PerkButton } from '@/src/features/tournament/ui/GauntletResult';
import { RivalMark, toneColors } from '@/src/features/tournament/ui/parts';
import { useLoadTournament, useTournamentStatus } from '@/src/features/tournament/useStatus';
import { GAUNTLET_BOUTS, boutLevel, boutsWon } from '@/src/tournament/gauntlet';
import { findMatch, seasonCleared } from '@/src/tournament/progress';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

/**
 * The Gauntlet: six bouts in a row, one life, a perk after each win. Open once the season's bracket is cleared.
 * One screen holds the whole run: the ladder of rivals, lives, the next bout and its button.
 */
export default function GauntletScreen() {
  const insets = useSafeAreaInsets();
  useLoadTournament();
  const t = useTournamentStatus();
  const loaded = useTournament((s) => s.loaded);
  const g = useGauntlet();
  useEffect(() => {
    void useGauntlet.getState().load(t.season);
  }, [t.season]);

  if (!loaded || !g.loaded) return <MessageScreen loading />;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const open = seasonCleared(t.season, t.progress);
  const run = g.run;
  const current = run && !run.over ? findMatch(t.season, run.bouts[run.at].matchId) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.25} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          <View style={styles.head}>
            <IconButton icon={ArrowLeft} label="Back" onPress={close} />
            <View style={{ flex: 1 }}>
              <AppText variant="overline" color={colors.insight}>
                {t.season.title}
              </AppText>
              <AppText variant="title" accessibilityRole="header">
                The Gauntlet
              </AppText>
            </View>
          </View>
          <AppText variant="small" color={colors.textBody}>
            Six rivals in a row, each harder than the last. One life. Win a bout and pick a perk; lose and the run is over.
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
            <Badge label={`Best run: ${g.best} of ${GAUNTLET_BOUTS}`} tone="amber" />
            {g.runs ? <Badge label={`${g.runs} run${g.runs === 1 ? '' : 's'}`} /> : null}
          </View>

          {!open ? (
            <View style={styles.card}>
              <Lock size={20} color={colors.textMuted} />
              <AppText variant="bodyStrong">Opens when you finish the season</AppText>
              <AppText variant="small" color={colors.textMuted}>
                Beat every rival in the bracket, and the Gauntlet opens: the whole cast, back to back.
              </AppText>
            </View>
          ) : !run || run.over ? (
            <View style={{ gap: space.md }}>
              {run?.over ? (
                <View style={styles.card}>
                  <AppText variant="heading">{boutsWon(run) === GAUNTLET_BOUTS ? 'You ran the whole Gauntlet' : `Last run: ${boutsWon(run)} of ${GAUNTLET_BOUTS} bouts won`}</AppText>
                  <Ladder />
                </View>
              ) : null}
              <Button label={run ? 'Start a new run' : 'Start your first run'} icon={Play} onPress={() => g.start(t.season)} />
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <AppText variant="bodyStrong" style={{ flex: 1 }}>
                    Bout {run.at + 1} of {GAUNTLET_BOUTS}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: 2 }} accessible accessibilityLabel={`${run.lives} ${run.lives === 1 ? 'life' : 'lives'}`}>
                    {Array.from({ length: run.lives }, (_, i) => (
                      <HandHeart key={i} size={18} color={colors.rivalText} />
                    ))}
                  </View>
                </View>
                <Ladder />
              </View>

              {run.choice ? (
                <View style={{ gap: space.sm }}>
                  <AppText variant="bodyStrong">Pick a perk for the next bout</AppText>
                  {run.choice.map((p) => (
                    <PerkButton key={p} perk={p} onPress={() => g.pick(p)} />
                  ))}
                </View>
              ) : current ? (
                <NextBout />
              ) : null}
              <Button label="Give up this run" variant="ghost" compact onPress={() => g.abandon()} />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** The six bouts: done ones marked won / drawn / lost, the current one highlighted, the rest as rival marks. */
function Ladder() {
  const t = useTournamentStatus();
  const run = useGauntlet((s) => s.run)!;
  return (
    <View style={styles.ladder}>
      {run.bouts.map((b, i) => {
        const found = findMatch(t.season, b.matchId);
        if (!found) return null;
        const rival = rivalOf(t.doc, found.stage.rival);
        const r = run.results[i];
        const now = i === run.at && !run.over;
        return (
          <View key={i} style={[styles.rung, now && { borderColor: toneColors(rival.tone).solid }]} accessible accessibilityLabel={`Bout ${i + 1}: ${rival.name}, ${LEVEL_NAME[b.level]}. ${r === 'win' ? 'Won' : r === 'loss' ? 'Lost' : r === 'draw' ? 'Drawn' : now ? 'Next' : 'To come'}.`}>
            <RivalMark rival={rival} size={34} dim={!r && !now} done={r === 'win'} />
            {r === 'win' ? <CircleCheck size={14} color={colors.success} style={styles.mark} /> : r === 'loss' ? <CircleX size={14} color={colors.rivalText} style={styles.mark} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function NextBout() {
  const t = useTournamentStatus();
  const run = useGauntlet((s) => s.run)!;
  const bout = run.bouts[run.at];
  const found = findMatch(t.season, bout.matchId)!;
  const rival = rivalOf(t.doc, found.stage.rival);
  const level = boutLevel(run);
  return (
    <View style={[styles.card, { borderColor: toneColors(rival.tone).solid }]}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <GameIcon match={found.match} size={44} />
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color={colors.textMuted}>
            {gameTitle(found.match)} · {LEVEL_NAME[level]}
            {run.calm ? ' (Calm mind)' : ''}
          </AppText>
          <AppText variant="heading">{rival.name}</AppText>
        </View>
        <Swords size={18} color={colors.textMuted} />
      </View>
      {run.scout ? (
        <View style={styles.scout}>
          <AppText variant="overline" color={colors.accent}>
            Scout report
          </AppText>
          <AppText variant="small" color={colors.textBody}>
            {found.match.intel.tendency}
          </AppText>
        </View>
      ) : (
        <AppText variant="small" color={colors.textMuted}>
          A hidden opponent, as in every Tournament match: read them as you play.
        </AppText>
      )}
      <Button label={`Play bout ${run.at + 1}`} icon={Play} onPress={() => playBout(found.stage, found.match, level, boutToken(run))} />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  card: { gap: space.md, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ladder: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  rung: { padding: 4, borderRadius: radius.pill, borderWidth: 2, borderColor: 'transparent' },
  mark: { position: 'absolute', right: 0, bottom: 0 },
  scout: { gap: 2, padding: space.md, borderRadius: radius.md, backgroundColor: colors.accentSoft },
});
