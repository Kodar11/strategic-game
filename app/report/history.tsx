import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confidenceLabel } from '@/src/components/lesson/prediction-state';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button } from '@/src/components/ui/Button';
import { ChevronDown } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { Segmented } from '@/src/components/ui/Segmented';
import { getLesson } from '@/src/content/lessons';
import { type HistoryRow, answerHistory } from '@/src/features/learning/journey';
import { allSkills, type SkillArea } from '@/src/features/learning/records';
import { RESULT } from '@/src/features/learning/ui/JourneyParts';
import { ScreenHeader, openLesson } from '@/src/features/learning/ui/ProfileParts';
import { useProfile } from '@/src/features/learning/useProfile';
import { haptic } from '@/src/utils/feedback';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

type Filter = 'all' | 'matched' | 'other' | 'not-compared';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'matched', label: 'Matched' },
  { value: 'other', label: 'Others' },
  { value: 'not-compared', label: 'Not compared' },
];
const inFilter = (r: HistoryRow, f: Filter) => f === 'all' || (f === 'matched' ? r.result === 'matched' : f === 'not-compared' ? r.result === 'not-compared' : r.result !== 'matched' && r.result !== 'not-compared');

const longDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Evidence: every first attempt (and qualifying daily answer), newest first, optionally for one area. Rows expand to
 * show the answer, the confidence, what happened and any retries — which are listed, never counted.
 */
export default function AnswerHistoryScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ skill?: string }>();
  const { hydrated, profile, attempts } = useProfile();
  const skill = allSkills().find((s) => s.id === params.skill);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => answerHistory(profile, attempts, skill?.id as SkillArea | undefined), [profile, attempts, skill]);
  const shown = useMemo(() => rows.filter((r) => inFilter(r, filter)), [rows, filter]);

  if (!hydrated) return <MessageScreen loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <FlatList
        data={shown}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.huge, gap: space.sm }}
        ListHeaderComponent={
          <View style={[styles.column, { gap: space.lg, marginBottom: space.sm }]}>
            <ScreenHeader title={skill ? skill.label : 'Every answer'} subtitle="Your first answer to each question, newest first. Retries are noted but never change a result." />
            {rows.length ? <Segmented label="Show" options={FILTERS} value={filter} onChange={setFilter} /> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.column, { gap: space.md }]}>
            <AppText variant="small" color={colors.textMuted}>
              {rows.length ? 'No answers in this group.' : 'No answers yet. Your predictions in lessons and challenges will be listed here.'}
            </AppText>
            {rows.length ? null : <Button label="Back to profile" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />}
          </View>
        }
        renderItem={({ item }) => <Row row={item} open={open === item.id} onToggle={() => setOpen((v) => (v === item.id ? null : item.id))} />}
      />
    </View>
  );
}

function Row({ row, open, onToggle }: { row: HistoryRow; open: boolean; onToggle: () => void }) {
  const r = RESULT[row.result];
  const lesson = getLesson(row.lesson);
  const source = row.source === 'Daily challenge' ? row.source : `${row.source} · ${lesson?.title ?? ''}`;
  return (
    <View style={[styles.column, styles.row]}>
      <Pressable
        onPress={() => {
          haptic.select();
          onToggle();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${row.question}. ${r.label}. ${source}.`}
        style={({ pressed }) => [styles.rowHead, pressed && { opacity: 0.75 }]}>
        <r.icon size={18} color={r.color} strokeWidth={2.2} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="small" color={colors.text}>
            {row.question}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {r.label} · {longDate(row.lockedAt)}
          </AppText>
        </View>
        <ChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open ? (
        <View style={styles.detail}>
          <AppText variant="caption" color={colors.textMuted}>
            {source}
          </AppText>
          {row.answer ? <Detail label="Your first answer" value={row.answer} /> : null}
          <Detail label="Confidence" value={confidenceLabel(row.confidence as 1 | 2 | 3 | 4 | 5)} />
          {row.outcome ? <Detail label="What happened" value={row.outcome} /> : null}
          {row.uncertain ? (
            <AppText variant="small" color={colors.textBody}>
              The outcome depended on information nobody had when answering, so this answer isn’t compared with the model.
            </AppText>
          ) : null}
          {row.retries ? (
            <AppText variant="small" color={colors.textBody}>
              {`You came back to this ${row.retries === 1 ? 'once' : `${row.retries} times`}${row.latest ? ` — your latest answer: ${RESULT[row.latest].label.toLowerCase()}` : ''}. Retries never change the first-attempt result.`}
            </AppText>
          ) : null}
          {row.source !== 'Daily challenge' && lesson ? (
            <Button
              label={row.source === 'Challenge' ? 'Open the challenges' : `Open ${lesson.title}`}
              variant="ghost"
              compact
              style={{ alignSelf: 'flex-start' }}
              onPress={() => (row.source === 'Challenge' ? router.push({ pathname: '/challenges/[lessonId]', params: { lessonId: row.lesson } }) : openLesson(row.lesson))}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="small" color={colors.text}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  row: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, minHeight: 56, padding: space.md },
  detail: { gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md, paddingLeft: space.md + 18 + space.sm },
});
