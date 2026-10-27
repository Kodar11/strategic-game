import { router } from 'expo-router';
import { Download, X } from '@/src/components/ui/icons';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { LESSONS } from '@/src/content/lessons';
import { buildLearningExport, exportFileName } from '@/src/features/learning/records';
import { shareJsonFile } from '@/src/features/learning/shareFile';
import { type ShareOutcome, isShareFailure, shareOutcomeMessage } from '@/src/features/learning/shareOutcome';
import { useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const settings = useProgress((s) => s.settings);
  const setSetting = useProgress((s) => s.setSetting);
  const resetProgress = useProgress((s) => s.resetProgress);
  const [confirmReset, setConfirmReset] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}>
        <View style={{ maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.lg }}>
          <View style={styles.head}>
            <AppText variant="title" accessibilityRole="header">
              Settings
            </AppText>
            <IconButton icon={X} label="Close settings" onPress={close} />
          </View>

          <Card style={{ gap: space.lg }}>
            <Row
              title="Narration"
              body="Prof. Sen and the cast read their lines aloud. All text stays on screen either way."
              value={settings.narration}
              onChange={(v) => setSetting('narration', v)}
            />
            <Row
              title="Reduce motion"
              body="Turns off entrance and reveal animations. Your system setting is respected either way."
              value={settings.reduceMotion}
              onChange={(v) => setSetting('reduceMotion', v)}
            />
            {Platform.OS !== 'web' ? (
              <Row
                title="Haptics"
                body="A light tap on selections and milestones."
                value={settings.haptics}
                onChange={(v) => setSetting('haptics', v)}
              />
            ) : null}
          </Card>

          <LearningDataCard />

          <Card style={{ gap: space.md }}>
            <AppText variant="bodyStrong">Progress</AppText>
            <AppText variant="small" color={colors.textMuted}>
              Progress is saved on this device only. Resetting clears completed lessons, any lesson in progress, your recorded predictions and challenge answers. Your goal is kept.
            </AppText>
            {confirmReset ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button label="Cancel" variant="secondary" compact onPress={() => setConfirmReset(false)} style={{ flex: 1 }} />
                <Button
                  label="Yes, reset"
                  compact
                  onPress={() => {
                    resetProgress();
                    setConfirmReset(false);
                    close();
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            ) : (
              <Button label="Reset progress" variant="secondary" compact onPress={() => setConfirmReset(true)} />
            )}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Export the learning record as JSON. Only on request; the app never sends it anywhere by itself.
 * Uses the same records as the profile (see docs/LEARNING_DATA.md for the format).
 */
function LearningDataCard() {
  const learning = useProgress((s) => s.learning);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);

  const exportData = async () => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    const now = new Date();
    const fileName = exportFileName(now);
    let outcome: ShareOutcome;
    try {
      const { learning: attempts, completed, runtime, goal, scenarioDone, assessmentRuns } = useProgress.getState();
      const inProgress = LESSONS.filter((l) => (runtime[l.id]?.step ?? 0) > 0).map((l) => l.id);
      const json = JSON.stringify(buildLearningExport({ attempts, completed, inProgress, goal, now, scenarioDone, assessments: assessmentRuns }), null, 2);
      outcome = await shareJsonFile(json, fileName);
    } catch (error) {
      // shareJsonFile reports its own failures; anything thrown here happened while preparing the data.
      outcome = { kind: 'serialize-error', detail: String(error) };
    }
    setStatus({ text: shareOutcomeMessage(outcome, fileName), failed: isShareFailure(outcome) });
    setBusy(false);
  };

  return (
    <Card style={{ gap: space.md }}>
      <AppText variant="bodyStrong">Learning data</AppText>
      <AppText variant="small" color={colors.textMuted}>
        Your predictions and challenge answers — first tries and retries — with confidence ratings and how each was evaluated are kept only on this device. They power your profile. Export a copy as a JSON file to keep, inspect or share — no names or account details are included.
      </AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {learning.length === 0
          ? 'No predictions recorded yet — an export now would contain only your lesson progress.'
          : `${learning.length} ${learning.length === 1 ? 'prediction' : 'predictions'} recorded.`}
      </AppText>
      <Button label={busy ? 'Preparing…' : 'Export learning data'} variant="secondary" compact icon={Download} iconPosition="left" disabled={busy} onPress={exportData} />
      {status ? (
        <AppText variant="small" color={status.failed ? colors.danger : colors.textBody} accessibilityLiveRegion="polite">
          {status.text}
        </AppText>
      ) : null}
    </Card>
  );
}

function Row({ title, body, value, onChange }: { title: string; body: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="small" color={colors.textMuted}>
          {body}
        </AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={title}
        trackColor={{ true: colors.primary, false: colors.surfaceHigh }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
