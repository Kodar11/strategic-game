import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedbackPanel, Panel } from '@/src/components/lesson/Panels';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Badge, Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { Check, House, Lock, RotateCcw, X } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { getLesson, getModule } from '@/src/content/lessons';
import { ASSESSMENTS, type Assessment, type AssessmentItem, getAssessment } from '@/src/features/assessments/content';
import { assessmentScore, currentAssessmentRun, finalUnlocked, isComplete, itemScore } from '@/src/features/assessments/scoring';
import { DataTable } from '@/src/features/scenarios/visuals';
import { useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

export function generateStaticParams() {
  return ASSESSMENTS.map((a) => ({ assessmentId: a.id }));
}

/** A module checkpoint or the final assessment. Answers are drafts until submitted; the first score is kept forever. */
export default function CheckpointScreen() {
  const { assessmentId } = useLocalSearchParams<{ assessmentId: string }>();
  const hydrated = useProgress((s) => s.hydrated);
  const runs = useProgress((s) => s.assessmentRuns);
  const a = getAssessment(assessmentId);
  if (!a) return <MessageScreen title="Assessment not found" body="This link doesn't match any checkpoint." />;
  if (!hydrated) return <MessageScreen loading />;
  if (a.id === 'final' && !finalUnlocked(runs)) return <Locked />;
  return <Runner key={a.id} a={a} />;
}

function Locked() {
  const runs = useProgress((s) => s.assessmentRuns);
  const remaining = ASSESSMENTS.filter((x) => x.id !== 'final' && !(runs[x.id]?.attempts ?? 0));
  return (
    <Frame title="Final assessment">
      <Card style={{ gap: space.sm }}>
        <Lock size={22} color={colors.textMuted} />
        <AppText variant="heading">Opens after the six module checkpoints</AppText>
        <AppText variant="small" color={colors.textMuted}>
          The final assessment tests transfer across the whole curriculum. Submit each checkpoint once to unlock it — passing isn’t required.
        </AppText>
        {remaining.map((r) => (
          <Button key={r.id} label={r.title} variant="secondary" compact onPress={() => router.replace({ pathname: '/checkpoint/[assessmentId]', params: { assessmentId: r.id } })} />
        ))}
      </Card>
    </Frame>
  );
}

function Runner({ a }: { a: Assessment }) {
  const runs = useProgress((s) => s.assessmentRuns);
  const run = useMemo(() => currentAssessmentRun(runs, a), [runs, a]);
  const answer = useProgress((s) => s.answerAssessment);
  const submit = useProgress((s) => s.submitAssessment);
  const retake = useProgress((s) => s.retakeAssessment);
  const setReflection = useProgress((s) => s.setAssessmentReflection);
  const toggleRubric = useProgress((s) => s.toggleAssessmentRubric);
  const score = run.submitted ? assessmentScore(a, run.answers) : null;
  const complete = isComplete(a, run.answers);
  const answered = a.items.filter((i) => run.answers[i.id]?.length).length;
  const moduleTitle = a.id === 'final' ? 'All modules' : `Module ${getModule(a.id).number} · ${getModule(a.id).title}`;

  return (
    <Frame title={a.title}>
      <View style={{ gap: space.sm }}>
        <Badge label={moduleTitle} tone="amber" />
        <AppText variant="title" accessibilityRole="header">
          {a.title}
        </AppText>
        <AppText color={colors.textMuted}>{a.intro}</AppText>
        {run.attempts ? (
          <AppText variant="caption" color={colors.textMuted}>
            First score {fmtScore(run.firstScore, a)} · best {fmtScore(run.bestScore, a)} · attempts {run.attempts}
          </AppText>
        ) : null}
      </View>

      {a.case ? (
        <Panel tone="info" title="The case">
          {a.case}
        </Panel>
      ) : null}

      {a.items.map((item, n) => (
        <ItemCard key={item.id} n={n + 1} item={item} chosen={run.answers[item.id] ?? []} submitted={run.submitted} onPick={(o) => answer(a.id, item.id, o)} />
      ))}

      {a.reflection ? (
        <Card style={{ gap: space.sm }}>
          <SectionLabel>Your recommendation (not scored)</SectionLabel>
          <AppText variant="bodyStrong">{a.reflection.prompt}</AppText>
          <TextInput
            value={run.reflection}
            onChangeText={(t) => setReflection(a.id, t)}
            editable={!run.submitted}
            multiline
            placeholder="Write your recommendation…"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={a.reflection.prompt}
            style={styles.input}
          />
          <AppText variant="small" color={colors.textMuted}>
            Check your answer against this list — tick what it covers:
          </AppText>
          {a.reflection.rubric.map((r, i) => {
            const on = run.rubric.includes(i);
            return (
              <Pressable key={r} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggleRubric(a.id, i)} style={styles.check}>
                <View style={[styles.box, on && styles.boxOn]}>{on ? <Check size={14} color={colors.text} strokeWidth={3} /> : null}</View>
                <AppText variant="small" style={{ flex: 1 }}>
                  {r}
                </AppText>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      {score ? (
        <Card elevated style={{ gap: space.sm }}>
          <SectionLabel color={colors.insight}>Your result</SectionLabel>
          <AppText variant="title">
            {fmtScore(score.score, a)} · {score.passed ? 'Passed' : 'Not yet'}
          </AppText>
          <AppText variant="small" color={colors.textMuted}>
            Pass mark {Math.round(a.passMark * 100)}%. Partly right answers earn half a point; on “choose all that apply” questions, each misconception chosen costs a point.
          </AppText>
          <View style={{ gap: space.xs }}>
            {[...new Set(a.items.filter((i) => itemScore(i, run.answers[i.id] ?? []) < 1).map((i) => i.lesson))].map((id) => {
              const l = getLesson(id)!;
              return <Button key={id} label={`Review Lesson ${l.number}: ${l.title}`} variant="ghost" compact onPress={() => router.push({ pathname: '/lesson/[lessonId]', params: { lessonId: id } })} />;
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="Retake" variant="secondary" icon={RotateCcw} iconPosition="left" onPress={() => retake(a.id)} style={{ flex: 1 }} />
            <Button label="Home" icon={House} iconPosition="left" onPress={() => router.replace('/')} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : (
        <View style={{ gap: space.xs }}>
          <Button label="Submit answers" disabled={!complete} onPress={() => submit(a.id)} />
          <AppText variant="caption" color={colors.textMuted} align="center">
            {complete ? 'You can’t change answers after submitting — but you can retake.' : `${answered} of ${a.items.length} answered.`}
          </AppText>
        </View>
      )}
    </Frame>
  );
}

function fmtScore(s: number | null, a: Assessment) {
  return s === null ? '—' : `${Number.isInteger(s) ? s : s.toFixed(1)} / ${a.items.length}`;
}

function ItemCard({ n, item, chosen, submitted, onPick }: { n: number; item: AssessmentItem; chosen: string[]; submitted: boolean; onPick: (id: string) => void }) {
  const s = submitted ? itemScore(item, chosen) : null;
  return (
    <Card style={{ gap: space.sm }}>
      <SectionLabel>{`Question ${n}${item.multi ? ' · choose all that apply' : ''}`}</SectionLabel>
      {item.situation ? <AppText variant="small">{item.situation}</AppText> : null}
      {item.table ? <DataTable head={item.table.head} rows={item.table.rows} /> : null}
      <AppText variant="bodyStrong">{item.question}</AppText>
      <View accessibilityRole={item.multi ? undefined : 'radiogroup'} style={{ gap: space.sm }}>
        {item.options.map((o) => (
          <View key={o.id} style={{ flexDirection: 'row' }}>
            <ChoiceCard compact title={o.label} selected={chosen.includes(o.id)} onSelect={() => onPick(o.id)} disabled={submitted && !chosen.includes(o.id)} />
          </View>
        ))}
      </View>
      {submitted ? (
        <View style={{ gap: space.sm }}>
          {item.options
            .filter((o) => chosen.includes(o.id))
            .map((o) => (
              <FeedbackPanel key={o.id} verdict={o.verdict}>
                {o.feedback}
              </FeedbackPanel>
            ))}
          {item.options
            .filter((o) => o.verdict === 'match' && !chosen.includes(o.id))
            .map((o) => (
              <Panel key={o.id} tone="insight" title={`Also correct: ${o.label}`}>
                {o.feedback}
              </Panel>
            ))}
          <AppText variant="small" color={colors.textMuted}>
            {item.explanation} {s !== null ? `(${s === 1 ? 'full marks' : s === 0 ? 'no marks' : `${s.toFixed(2).replace(/\.?0+$/, '')} of 1`})` : ''}
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.08} />
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.row}>
          <IconButton icon={X} label="Close. Your answers are saved." onPress={leave} />
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </AppText>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: insets.bottom + space.xxxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg },
  input: {
    minHeight: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgRaised,
    color: colors.text,
    padding: space.md,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
