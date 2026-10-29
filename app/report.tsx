import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { BookOpen, CircleCheck, Gauge, Layers, ListOrdered, Target, TrendingUp } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { getLesson } from '@/src/content/lessons';
import { EVIDENCE } from '@/src/features/learning/evidence-policy';
import type { Insight, PeriodCount } from '@/src/features/learning/profile';
import { AreaList, Disclosure, LinkRow, ProgressBar, SeriesChart, SplitBar, ConfidenceBands } from '@/src/features/learning/ui/JourneyParts';
import { Note, ReportSection, ScreenHeader, StatRow } from '@/src/features/learning/ui/ProfileParts';
import { useJourney } from '@/src/features/learning/useProfile';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The detailed report: an optional, deeper look behind the profile overview, in six sections — learning activity,
 * prediction accuracy, progress over time, confidence, areas, and the answer history. Activity and agreement with
 * the model are kept apart. Sections without enough evidence show one quiet line instead of an empty chart.
 * Every number comes from journey.ts / profile.ts; thresholds from evidence-policy.ts.
 */
export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const { hydrated, profile, summary, journey } = useJourney();
  if (!hydrated) return <MessageScreen loading />;

  const { progress, accuracy, calibration, series, areas } = journey;
  const { practice, trend, insights } = profile;
  const insight = (...ids: Insight['id'][]) => insights.find((i) => ids.includes(i.id)) ?? null;
  const daily = profile.progress.dailyCounted;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge }}>
        <View style={styles.column}>
          <ScreenHeader title="Detailed report" subtitle="What you’ve done, how your first answers compared with the model, and how that’s changing." />

          {/* A · Learning activity — effort, not mastery */}
          <ReportSection title="Learning activity" icon={BookOpen}>
            <View style={{ gap: space.sm }} accessible accessibilityLabel={`${progress.completed} of ${progress.total} lessons completed.`}>
              <View style={styles.bigRow}>
                <AppText variant="title" tabular>
                  {progress.completed}
                  <AppText variant="heading" color={colors.textMuted} tabular>{` / ${progress.total}`}</AppText>
                </AppText>
                <AppText variant="small" color={colors.textMuted}>
                  lessons completed
                </AppText>
              </View>
              <ProgressBar value={progress.fraction} />
            </View>
            {progress.inProgress ? <StatRow label="Lessons in progress" value={String(progress.inProgress)} /> : null}
            <StatRow label="Practice challenges answered" value={`${profile.progress.challengesTried} of ${profile.progress.challengesTotal}`} />
            <StatRow label="Predictions in lessons, including replays" value={String(profile.progress.predictions)} />
            {daily ? <StatRow label="Daily challenges counted" value={String(daily)} /> : null}
            <Disclosure title="Modules" summary={`${progress.modulesDone} of ${progress.modules.length} complete`}>
              {progress.modules.map((m) => (
                <View key={m.id} style={{ gap: 4 }} accessible accessibilityLabel={`Module ${m.number}, ${m.title}: ${m.done} of ${m.total} lessons completed.`}>
                  <View style={styles.row}>
                    <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
                      {m.number} · {m.title}
                    </AppText>
                    {m.done === m.total ? <CircleCheck size={14} color={colors.success} /> : null}
                    <AppText variant="caption" color={colors.textMuted} tabular>
                      {m.done}/{m.total}
                    </AppText>
                  </View>
                  <ProgressBar value={m.total ? m.done / m.total : 0} height={4} />
                </View>
              ))}
            </Disclosure>
            <LinkRow title="Practice challenges" subtitle="Apply each lesson’s idea to a new situation" onPress={() => router.push('/challenges')} />
          </ReportSection>

          {/* B · Prediction accuracy — first attempts only */}
          <ReportSection title="Prediction accuracy" icon={Target}>
            {accuracy.comparable === 0 ? (
              <Note muted>Your first predictions will appear here. Only answers you could work out from the information given are compared with the model.</Note>
            ) : (
              <>
                <View style={styles.bigRow} accessible accessibilityLabel={`${accuracy.matched} of ${accuracy.comparable} first attempts matched the model${accuracy.percent !== null ? `, ${accuracy.percent} percent` : ''}.`}>
                  <AppText variant="title" tabular>
                    {accuracy.matched}
                    <AppText variant="heading" color={colors.textMuted} tabular>{` of ${accuracy.comparable}`}</AppText>
                  </AppText>
                  <AppText variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                    first attempts matched{accuracy.percent !== null ? ` · ${accuracy.percent}%` : ''}
                  </AppText>
                </View>
                <SplitBar
                  parts={[
                    { label: 'Matched', value: accuracy.matched, color: colors.primary },
                    { label: 'Partly', value: accuracy.partly, color: colors.accent },
                    { label: 'Different', value: accuracy.other, color: colors.textFaint },
                  ]}
                />
                {!accuracy.ready ? <Note muted>{`Early days: fewer than ${EVIDENCE.firstAttempts.tentative} comparable answers, so this is a record rather than a pattern.`}</Note> : null}
                {accuracy.excluded ? (
                  <Note muted>{`${plural(accuracy.excluded, 'answer')} depended on something you couldn’t know, so ${accuracy.excluded === 1 ? 'it isn’t' : 'they aren’t'} compared.`}</Note>
                ) : null}
                {accuracy.retries ? <Note muted>{`${plural(accuracy.retries, 'retry', 'retries')} not counted — only your first answer to each question is.`}</Note> : null}
              </>
            )}
            <Note muted>This measures agreement with the model’s reasoning, not strategic ability. A matching answer can be a lucky guess, and a different one can still be well reasoned.</Note>
            <InsightNote insight={insight('uncertain-misses')} />
            {summary.report.feedback ? (
              <Disclosure title="Learning after feedback" summary={`${practice.improvement.nowMatch} of ${practice.improvement.retried} first misses now match`}>
                <Note>{practice.improvement.text}</Note>
              </Disclosure>
            ) : null}
            {summary.report.transfer ? (
              <Disclosure title="Ideas in new situations" summary={`${plural(practice.transfer.lines.length, 'lesson concept')} tested in practice challenges`}>
                {practice.transfer.lines.map((l) => (
                  <StatRow key={l.lesson} label={getLesson(l.lesson)?.title ?? l.lesson} value={`${l.matchedFirst} of ${l.tried}${l.beforeLesson ? ` · ${l.beforeLesson} before the lesson` : ''}`} />
                ))}
                <Note muted>{practice.transfer.text}</Note>
                <InsightNote insight={insight('transfer')} />
              </Disclosure>
            ) : null}
          </ReportSection>

          {/* C · Progress over time */}
          <ReportSection title="Progress over time" icon={TrendingUp}>
            {series.ready ? (
              <>
                <Note>
                  {series.direction === 'higher'
                    ? 'Your more recent first attempts matched the model more often than your earliest ones.'
                    : series.direction === 'lower'
                      ? 'Your more recent first attempts matched the model less often than your earliest ones — newer lessons may simply be harder.'
                      : 'Your match rate has held fairly steady.'}
                </Note>
                <SeriesChart points={series.points} />
                <Note muted>{`Each point is about ${series.blockSize} comparable first attempts, in the order you answered them. Later lessons ask different questions, so read this as a rough signal.`}</Note>
                {trend.ready && trend.direction ? (
                  <Disclosure title={`The last ${trend.days / 7} weeks`} summary={`${trend.recent.matched} of ${trend.recent.judged}, against ${trend.previous.matched} of ${trend.previous.judged} before`}>
                    <PeriodBar label={`Last ${trend.days / 7} weeks`} count={trend.recent} highlight />
                    <PeriodBar label={`The ${trend.days / 7} weeks before`} count={trend.previous} />
                  </Disclosure>
                ) : null}
              </>
            ) : (
              <Note muted>{`Your progress over time will appear as you complete more practice — ${plural(series.needed, 'more answer')} you can work out from the information given.`}</Note>
            )}
          </ReportSection>

          {/* D · Confidence and calibration */}
          <ReportSection title="Confidence and outcomes" icon={Gauge}>
            {calibration.ready ? (
              <>
                <ConfidenceBands bands={calibration.bands} />
                <Note>{calibration.text}</Note>
                <InsightNote insight={insight('overconfident', 'underconfident')} />
                <Disclosure title="Correct, confident, calibrated" summary="Three different things">
                  <Note>Correct: your answer matched the model.</Note>
                  <Note>Confident: how sure you felt before seeing the result.</Note>
                  <Note>Calibrated: answers you feel surer about turn out right more often than ones you feel unsure about. It’s about your confidence tracking your accuracy — not about always feeling sure.</Note>
                  <Note muted>{`Based on ${plural(calibration.rated, 'rated first attempt')}. Groups with fewer than ${EVIDENCE.confidence.group} answers aren’t compared.`}</Note>
                </Disclosure>
              </>
            ) : (
              <Note muted>{calibration.text}</Note>
            )}
          </ReportSection>

          {/* E · Strategic areas */}
          <View>
            <View style={styles.inline}>
              <Layers size={16} color={colors.textMuted} />
              <AppText variant="overline" color={colors.textMuted}>
                Strategic areas
              </AppText>
            </View>
            <AreaList areas={areas} />
            <AppText variant="caption" color={colors.textMuted} style={{ marginTop: space.sm }}>
              Areas with different numbers of answers aren’t directly comparable. Open one to see the answers and lessons behind it.
            </AppText>
          </View>

          {/* F · Evidence and answer history */}
          <LinkRow
            icon={ListOrdered}
            title="Every answer"
            subtitle={profile.evidence.length ? `${plural(profile.evidence.length, 'first attempt')}${accuracy.retries ? ` · ${plural(accuracy.retries, 'retry', 'retries')}` : ''}` : 'Your answers will be listed here'}
            onPress={() => router.push('/report/history')}
          />

          <AppText variant="caption" color={colors.textMuted} align="center">
            Worked out on your device from your saved answers{daily ? ' and daily challenges' : ''}. It describes what you did — not who you are.
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
      <ProgressBar value={count.judged ? count.matched / count.judged : 0} color={highlight ? colors.primary : colors.textFaint} />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space.sm },
  insight: { gap: space.xs, marginTop: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: colors.insightSoft },
});
