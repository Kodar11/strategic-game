import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, Brain, ChevronRight, CircleCheck, Layers, Lock } from '@/src/components/ui/icons';
import { LESSON_IDS, allLessons } from '@/src/content/lessons';
import { cardSet, mindCheckOffer, nextMatch, type StageStatus } from '@/src/tournament/progress';
import { colors, radius, space } from '@/src/theme/tokens';
import { rivalOf } from '../content';
import { useTournamentStatus } from '../useStatus';
import { Kicker, ProgressBar, RivalMark, toneColors } from './parts';

const openStage = (id: string) => router.push({ pathname: '/tournament/[stageId]', params: { stageId: id } });
const openMatch = (id: string) => router.push({ pathname: '/tournament/match/[matchId]', params: { matchId: id } });

/** Home's Tournament: where you are, the next match, the bracket, your cards and the Mind Check when it's due. */
export function TournamentHome() {
  const t = useTournamentStatus();
  const { doc, season, progress, current, stages } = t;
  const rival = rivalOf(doc, current.stage.rival);
  const tone = toneColors(rival.tone);
  const next = nextMatch(current, progress);
  const done = stages.every((s) => s.cleared || s.stage.kind === 'side');
  const sides = stages.filter((s) => s.stage.kind === 'side');
  const cards = cardSet(season, LESSON_IDS, t.completed, progress);
  const owned = cards.filter((c) => c.owned).length;
  const offer = mindCheckOffer(season, progress);
  const label = !t.started ? 'Play your first match' : done ? 'Replay on Hard' : next ? (next.duel ? `Face ${rival.name}` : 'Next match') : 'Open the stage';

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <AppText variant="overline" color={colors.insight}>
            {doc.title} · {season.title}
          </AppText>
          <AppText variant="small" color={colors.textMuted}>
            {doc.tagline}
          </AppText>
        </View>
        <View style={styles.rating} accessible accessibilityLabel={`Strategist rating ${t.rating}, ${t.title}`}>
          <AppText variant="bodyStrong" tabular>
            {t.rating}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {t.title}
          </AppText>
        </View>
      </View>

      <View style={[styles.card, { borderColor: tone.solid }]}>
        <Pressable onPress={() => openStage(current.stage.id)} accessibilityRole="button" accessibilityLabel={`${current.stage.title}, ${current.stage.theme}. ${rival.name}, ${rival.epithet}. ${current.clearedCount} of ${current.stage.matches.length} matches cleared.`} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <RivalMark rival={rival} size={56} done={done} />
          <View style={{ flex: 1, gap: 2 }}>
            <Kicker tone={rival.tone}>{done ? `${season.title} complete` : `${current.stage.title} · ${current.stage.theme}`}</Kicker>
            <AppText variant="heading">{rival.name}</AppText>
            <AppText variant="small" color={colors.textMuted} numberOfLines={2}>
              {done ? 'Every rival beaten. Replay any match on Hard for its last star.' : `${rival.epithet} · ${rival.bio}`}
            </AppText>
          </View>
        </Pressable>
        <View>
          <ProgressBar value={current.clearedCount} max={current.stage.matches.length} color={tone.solid} />
          <AppText variant="caption" color={colors.textMuted} tabular style={{ marginTop: space.xs }}>
            {current.clearedCount} of {current.stage.matches.length} matches cleared · {current.stars} of {current.maxStars} stars
          </AppText>
        </View>
        <Button label={label} icon={ArrowRight} onPress={() => (next && !done ? openMatch(next.id) : openStage(current.stage.id))} />
      </View>

      {offer ? (
        <Pressable onPress={() => router.push({ pathname: '/tournament/mind-check', params: { form: offer } })} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
            <Brain size={18} color={colors.accent} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">Mind Check</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {offer === 'a' ? '10 questions · see where you start' : '10 new questions · see how far you’ve come'}
            </AppText>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      <View style={{ gap: space.xs }}>
        {stages
          .filter((s) => s.stage.kind !== 'side')
          .map((s) => (
            <StageRow key={s.stage.id} status={s} current={s.stage.id === current.stage.id && !done} />
          ))}
      </View>

      {sides.length ? (
        <View style={{ gap: space.xs }}>
          <AppText variant="overline" color={colors.textMuted}>
            Side trials
          </AppText>
          {sides.map((s) => (
            <StageRow key={s.stage.id} status={s} current={false} />
          ))}
        </View>
      ) : null}

      <Pressable onPress={() => router.push('/tournament/cards')} accessibilityRole="button" accessibilityLabel={`Strategy cards. ${owned} of ${cards.length} collected.`} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={[styles.icon, { backgroundColor: colors.insightSoft }]}>
          <Layers size={18} color={colors.insight} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">Strategy cards</AppText>
          <AppText variant="caption" color={colors.textMuted} tabular>
            {owned} of {cards.length} collected · {allLessons().length} from lessons, the rest from rivals
          </AppText>
        </View>
        <ChevronRight size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function StageRow({ status, current }: { status: StageStatus; current: boolean }) {
  const { doc } = useTournamentStatus();
  const rival = rivalOf(doc, status.stage.rival);
  const locked = !status.unlocked;
  return (
    <Pressable
      disabled={locked}
      onPress={() => openStage(status.stage.id)}
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      accessibilityLabel={`${status.stage.title}: ${rival.name}, ${status.stage.theme}. ${locked ? 'Locked.' : status.cleared ? 'Cleared.' : `${status.clearedCount} of ${status.stage.matches.length} cleared.`} ${status.stars} stars.`}
      style={({ pressed }) => [styles.stage, current && { borderColor: colors.borderStrong, backgroundColor: colors.surface }, pressed && styles.pressed]}>
      <RivalMark rival={rival} size={36} dim={locked} done={status.cleared} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" color={locked ? colors.textMuted : colors.text}>
          {status.stage.title} · {rival.name}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {status.stage.theme}
        </AppText>
      </View>
      {locked ? (
        <Lock size={16} color={colors.textFaint} />
      ) : status.cleared ? (
        <CircleCheck size={18} color={colors.success} strokeWidth={2.4} />
      ) : (
        <AppText variant="caption" color={colors.insight} tabular>
          {status.stars}/{status.maxStars} ★
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  rating: { alignItems: 'flex-end' },
  card: { gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: space.sm, paddingHorizontal: space.md },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stage: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'transparent' },
  pressed: { opacity: 0.85 },
});
