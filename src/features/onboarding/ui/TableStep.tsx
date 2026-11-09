import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight, BookOpen, CalendarDays, ChevronRight, Gamepad2, Swords, Users, type LucideIcon } from '@/src/components/ui/icons';
import { allLessons } from '@/src/content/lessons';
import { LIBRARY_COUNT } from '@/src/games/library';
import { RivalMark, toneColors } from '@/src/features/tournament/ui/parts';
import type { Rival } from '@/src/tournament/schema';
import { colors, radius, space } from '@/src/theme/tokens';
import { useMotionReduced } from '@/src/utils/feedback';

import { SCRIPT } from '../script';
import { SpokenLine, StepKicker } from './parts';

const S = SCRIPT.table;

/**
 * What else the app holds, each named with where it lives, so nothing here promises a place that doesn't exist.
 * The tab names must match the tab bar (ui-consistency.test.ts checks it).
 */
function alsoInside(): { icon: LucideIcon; label: string; where: string }[] {
  return [
    { icon: CalendarDays, label: 'Daily challenge', where: 'Home' },
    { icon: Swords, label: 'Weekly Rival', where: 'Home' },
    { icon: BookOpen, label: `${allLessons().length} lessons and Stories`, where: 'Lessons tab' },
    { icon: Gamepad2, label: `${LIBRARY_COUNT} games`, where: 'Games tab' },
    { icon: Users, label: 'Party mode, friends on one phone', where: 'Games tab' },
  ];
}

/** Part 5: the five rivals, one by one, then the season path and the rest of the app. */
export function TableStep({ host, rivals, onNext }: { host: Rival; rivals: Rival[]; onNext: () => void }) {
  const reduced = useMotionReduced();
  const step = (i: number) => (reduced ? undefined : FadeInRight.delay(250 + i * 220).duration(300));
  const after = (i: number) => (reduced ? undefined : FadeInDown.delay(250 + (rivals.length + i) * 220).duration(280));
  return (
    <View style={{ gap: space.xl }}>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <StepKicker color={toneColors(host.tone).fg}>{S.kicker}</StepKicker>
        <AppText variant="display" align="center" accessibilityRole="header">
          {S.title}
        </AppText>
        <SpokenLine text={S.host} variant="body" color={colors.textBody} />
      </View>

      <View style={{ gap: space.sm }}>
        {rivals.map((r, i) => {
          const t = toneColors(r.tone);
          return (
            <Animated.View key={r.id} entering={step(i)} style={[styles.rival, { borderLeftColor: t.solid }]} accessible accessibilityLabel={`${r.name}, ${r.epithet}. “${r.lines.taunt[0] ?? ''}”`}>
              <RivalMark rival={r} size={52} expression="confident" />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' }}>
                  <AppText variant="bodyStrong">{r.name}</AppText>
                  <AppText variant="overline" color={t.fg}>
                    {r.epithet}
                  </AppText>
                </View>
                {r.lines.taunt[0] ? (
                  <AppText variant="small" color={colors.textBody} style={{ fontStyle: 'italic' }}>
                    “{r.lines.taunt[0]}”
                  </AppText>
                ) : null}
              </View>
            </Animated.View>
          );
        })}
      </View>

      <Animated.View entering={after(0)} style={{ gap: space.sm }}>
        <AppText variant="overline" color={colors.textMuted}>
          {S.pathTitle}
        </AppText>
        <View style={styles.path} accessible accessibilityLabel={`${S.path.map((p) => `${p.label}, ${p.detail}`).join(', then ')}. ${S.afterPath}`}>
          {S.path.map((p, i) => (
            <View key={p.label} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={[styles.node, i === S.path.length - 1 && { borderColor: colors.insight }]}>
                <AppText variant="caption" color={i === S.path.length - 1 ? colors.insight : colors.text} align="center">
                  {p.label}
                </AppText>
                <AppText variant="caption" color={colors.textFaint} align="center">
                  {p.detail}
                </AppText>
              </View>
              {i < S.path.length - 1 ? <ChevronRight size={14} color={colors.textFaint} /> : null}
            </View>
          ))}
        </View>
        <AppText variant="small" color={colors.textMuted} align="center">
          {S.afterPath}
        </AppText>
      </Animated.View>

      <Animated.View entering={after(1)} style={{ gap: space.sm }}>
        <AppText variant="overline" color={colors.textMuted}>
          {S.alsoTitle}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {alsoInside().map((a) => (
            <View key={a.label} style={styles.chip} accessible accessibilityLabel={`${a.label}, on ${a.where}`}>
              <a.icon size={15} color={colors.accent} />
              <AppText variant="caption" color={colors.text}>
                {a.label}
              </AppText>
              <AppText variant="caption" color={colors.textFaint}>
                · {a.where}
              </AppText>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={after(2)}>
        <Button label={S.next} icon={ArrowRight} onPress={onNext} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  rival: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderLeftWidth: 4, borderColor: colors.border, backgroundColor: colors.surface },
  path: { flexDirection: 'row', alignItems: 'stretch', gap: space.xs },
  node: { flex: 1, gap: 2, paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.bgRaised },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
