import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Card } from '@/src/components/ui/Card';
import { BookOpen, Gauge, Layers, Repeat, Shuffle, Target, TrendingUp } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { getLesson } from '@/src/content/lessons';
import { EVIDENCE } from '@/src/features/learning/evidence-policy';
import type { Insight, PeriodCount } from '@/src/features/learning/profile';
import { Note, ReportSection, ScreenHeader, SkillAreaRow, StatRow } from '@/src/features/learning/ui/ProfileParts';
import { useProfile } from '@/src/features/learning/useProfile';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

/**
 * The detailed report behind "View detailed report". Each section appears only when summary.ts says its data
 * supports it (thresholds in evidence-policy.ts) — sections without enough evidence are left out, not shown empty.
 * Every number comes from the same Profile as the main screen.
 */
export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const { hydrated, profile, summary } = useProfile();
  if (!hydrated) return <MessageScreen loading />;

  const { progress, glance, practice, confidence, trend, insights } = profile;
  const insight = (...ids: Insight['id'][]) => insights.find((i) => ids.includes(i.id)) ?? null;
  const notCompared = profile.evidence.filter((a) => a.basis !== 'calculable').length;
  const explored = new Map(summary.areas.map((a) => [a.id, a]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <ScreenHeader title="Detailed report" subtitle="Everything behind your profile. Sections appear once there is enough to say." />

          {/* A · Learning activity */}
          <ReportSection title="Learning activity" icon={BookOpen}>
            <StatRow label="Lessons completed" value={`${progress.completed} of ${progress.total}`} strong />
            {progress.inProgress ? <StatRow label="Lessons in progress" value={String(progress.inProgress)} /> : null}
            <StatRow label="Predictions made, including replays" value={String(progress.predictions)} />
            <StatRow label="Practice challenges tried" value={`${progress.challengesTried} of ${progress.challengesTotal}`} />
            {progress.dailyCounted ? <StatRow label="Daily challenges counted" value={String(progress.dailyCounted)} /> : null}
          </ReportSection>

          {/* B · First attempts */}
          {summary.report.firstAttempts ? (
            <ReportSection title="First attempts" icon={Target} footnote="Only your first answer to each question counts, so retrying until an answer matches never changes this.">
              <StatRow label="First attempts that matched the model" value={`${glance.matched} of ${glance.judged}`} strong />
              {glance.ready ? null : <Note muted>{`Early days: fewer than ${EVIDENCE.firstAttempts.tentative} so far, so this is a record of answers rather than a pattern.`}</Note>}
              {notCompared ? (
                <Note muted>{`${notCompared === 1 ? '1 answer' : `${notCompared} answers`} depended on things you couldn’t know, so ${notCompared === 1 ? 'it isn’t' : 'they aren’t'} compared with the model.`}</Note>
              ) : null}
              <InsightNote insight={insight('uncertain-misses')} />
            </ReportSection>
          ) : null}

          {/* C · Learning after feedback */}
          {summary.report.feedback ? (
            <ReportSection title="Learning after feedback" icon={Repeat}>
              <StatRow label="Questions first missed, then retried" value={String(practice.improvement.retried)} />
              <StatRow label="Now match the model" value={`${practice.improvement.nowMatch} of ${practice.improvement.retried}`} strong />
              <Note>{practice.improvement.text}</Note>
            </ReportSection>
          ) : null}

          {/* D · Applying concepts to new situations */}
          {summary.report.transfer ? (
            <ReportSection title="Applying ideas to new situations" icon={Shuffle} footnote={practice.transfer.text}>
              <Note muted>Practice challenges put a lesson’s idea into a scenario you haven’t seen — unlike replaying a question you already know.</Note>
              {practice.transfer.lines.map((l) => (
                <StatRow key={l.lesson} label={getLesson(l.lesson)?.title ?? l.lesson} value={`${l.matchedFirst} of ${l.tried}${l.beforeLesson ? ` · ${l.beforeLesson} before the lesson` : ''}`} />
              ))}
              <InsightNote insight={insight('transfer')} />
            </ReportSection>
          ) : null}

          {/* E · Confidence and outcomes */}
          {summary.report.confidence ? (
            <ReportSection title="Confidence and outcomes" icon={Gauge} footnote={`${confidence.judged} rated first attempts. ${confidence.message}`}>
              {confidence.groups.map((g) => (
                <View key={g.label} style={{ gap: 4 }} accessible accessibilityLabel={g.text}>
                  <StatRow label={g.label} value={`${g.matched} of ${g.count} matched`} />
                  <Dots total={g.count} filled={g.matched} />
                </View>
              ))}
              <InsightNote insight={insight('overconfident', 'underconfident')} />
            </ReportSection>
          ) : null}

          {/* F · Progress over time */}
          {summary.report.trend && trend.direction ? (
            <ReportSection title="Over time" icon={TrendingUp} footnote="Each period has different questions, so this shows a change in results — not necessarily in skill.">
              <PeriodBar label={`Last ${trend.days / 7} weeks`} count={trend.recent} highlight />
              <PeriodBar label={`The ${trend.days / 7} weeks before`} count={trend.previous} />
              <Note>{trend.direction === 'higher' ? 'A higher match rate than the period before.' : trend.direction === 'lower' ? 'A lower match rate than the period before.' : 'The same match rate as the period before.'}</Note>
            </ReportSection>
          ) : null}

          {/* G · Areas and the lessons that practise them */}
          <View style={{ gap: space.xs }}>
            <View style={styles.inline}>
              <Layers size={16} color={colors.textMuted} />
              <AppText variant="overline" color={colors.textMuted}>
                Areas and their lessons
              </AppText>
            </View>
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {profile.skills.map((s, i) => (
                <SkillAreaRow
                  key={s.id}
                  last={i === profile.skills.length - 1}
                  row={explored.get(s.id) ?? { id: s.id, label: s.label, level: 'none', recorded: 0, judged: 0, matched: 0, measure: 'Not explored yet', caption: 'See lessons' }}
                  onPress={() => router.push({ pathname: '/report/[skill]', params: { skill: s.id } })}
                />
              ))}
            </Card>
          </View>

          <AppText variant="caption" color={colors.textMuted} align="center">
            Worked out on your device from your saved answers{progress.dailyCounted ? ' and daily challenges' : ''}. It describes what you did — not who you are.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

/** An existing profile insight, shown inside the section it is about, with the evidence behind it. */
function InsightNote({ insight }: { insight: Insight | null }) {
  if (!insight) return null;
  return (
    <View style={styles.insight}>
      <AppText variant="small" weight="semibold" color={colors.text}>
        {insight.title}
      </AppText>
      <AppText variant="small" color={colors.textBody}>
        {insight.body}
      </AppText>
      <AppText variant="caption" color={colors.textMuted}>
        Why we say this: {insight.evidence}
      </AppText>
    </View>
  );
}

function PeriodBar({ label, count, highlight }: { label: string; count: PeriodCount; highlight?: boolean }) {
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${label}: ${count.matched} of ${count.judged} matched`}>
      <StatRow label={label} value={`${count.matched} of ${count.judged}`} strong={highlight} />
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(count.matched / count.judged) * 100}%` }, !highlight && { backgroundColor: colors.textFaint }]} />
      </View>
    </View>
  );
}

/** One dot per answer: filled when it matched the model. Counts, not a score. */
function Dots({ total, filled }: { total: number; filled: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i < filled ? styles.dotOn : null]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  insight: { gap: space.xs, marginTop: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: colors.insightSoft },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.textMuted },
  dotOn: { backgroundColor: colors.primaryText, borderColor: colors.primaryText },
});
