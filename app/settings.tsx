import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { Bug, ChartNoAxesColumn, ChevronRight, Download, ExternalLink, FileText, Info, Mail, Pencil, RotateCcw, Shield, Sparkles, Trash, UserRound, X } from '@/src/components/ui/icons';
import { allLessons } from '@/src/content/lessons';
import { accountDeletionError } from '@/src/data/account';
import { deleteAccount, useSyncStatus } from '@/src/data/session';
import { allGoals, buildLearningExport, exportFileName } from '@/src/features/learning/records';
import { shareJsonFile } from '@/src/features/learning/shareFile';
import { type ShareOutcome, isShareFailure, shareOutcomeMessage } from '@/src/features/learning/shareOutcome';
import { useNickname } from '@/src/features/profile/nickname';
import { ABOUT_TEXT, LINKS, SUPPORT_EMAIL, supportMailto, versionLabel } from '@/src/features/settings/about';
import { appVersion, platformLabel } from '@/src/features/settings/version';
import { useProgress } from '@/src/store/progress';
import { useMotionReduced } from '@/src/utils/feedback';
import { MAX_CONTENT_WIDTH, colors, radius, space } from '@/src/theme/tokens';

/**
 * One place for everything you can change, in a fixed order: who you are (nickname, goal), how the app behaves
 * (narration, motion, haptics), your learning data (export, reset), a way to your progress, about and support (legal
 * pages, contact, version) and the account. Opened from the gear on every tab.
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          <View style={styles.head}>
            <AppText variant="title" accessibilityRole="header">
              Settings
            </AppText>
            <IconButton icon={X} label="Close settings" onPress={close} />
          </View>

          <ProfileSection />
          <ExperienceSection />
          <LearningDataSection onReset={close} />
          <ProgressSection />
          <AboutSection />
          <AccountSection />
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </View>
  );
}

// ── A. Profile ───────────────────────────────────────────────────────────────

function ProfileSection() {
  const { name, failed, reload } = useNickname();
  const editProfile = () => router.navigate('/nickname');
  const loading = name === undefined && !failed;
  const display = name === undefined ? (failed ? 'Couldn’t load your nickname' : 'Loading…') : (name ?? 'Anonymous player');

  return (
    <Section label="Profile">
      <Card style={{ gap: space.md }}>
        <Pressable
          onPress={editProfile}
          disabled={name === undefined}
          accessibilityRole="button"
          accessibilityLabel={name === undefined ? display : `Nickname: ${name ?? 'none, shown as Anonymous player'}. Edit profile`}
          style={({ pressed }) => [styles.profileRow, pressed && { opacity: 0.8 }]}>
          <View style={styles.avatar} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {name ? (
              <AppText variant="heading" color={colors.text}>
                {name.trim().charAt(0).toUpperCase()}
              </AppText>
            ) : (
              <UserRound size={22} color={colors.primaryText} />
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="bodyStrong" numberOfLines={1} color={name ? colors.text : colors.textMuted}>
              {display}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              Your nickname may appear to other players.
            </AppText>
          </View>
          {loading ? <ActivityIndicator color={colors.primaryText} /> : null}
        </Pressable>
        {failed && name === undefined ? (
          <Button label="Try again" variant="secondary" compact icon={RotateCcw} iconPosition="left" onPress={reload} />
        ) : (
          <Button label="Edit profile" variant="secondary" compact icon={Pencil} iconPosition="left" disabled={name === undefined} onPress={editProfile} />
        )}
        <View style={styles.divider} />
        <GoalRow />
      </Card>
    </Section>
  );
}

/** The optional learning goal (also chosen during the welcome); it decides which area the profile suggests first. */
function GoalRow() {
  const goal = useProgress((s) => s.goal);
  const setGoal = useProgress((s) => s.setGoal);
  const [open, setOpen] = useState(false);
  const label = allGoals().find((g) => g.id === goal)?.label;
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong">Learning goal</AppText>
          <AppText variant="small" color={colors.textMuted} numberOfLines={2}>
            {label ?? 'Not set'}
          </AppText>
        </View>
        <Button label={open ? 'Done' : 'Change'} variant="ghost" compact onPress={() => setOpen((v) => !v)} accessibilityHint="Optional. Changes which area your next step focuses on." />
      </View>
      {open ? (
        <View accessibilityRole="radiogroup" accessibilityLabel="Learning goal" style={{ gap: space.sm }}>
          {allGoals().map((g) => (
            <View key={g.id} style={{ flexDirection: 'row' }}>
              <ChoiceCard
                compact
                title={g.label}
                selected={goal === g.id}
                onSelect={() => {
                  setGoal(g.id);
                  setOpen(false);
                }}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ── B. Experience and accessibility ─────────────────────────────────────────

function ExperienceSection() {
  const settings = useProgress((s) => s.settings);
  const setSetting = useProgress((s) => s.setSetting);
  // With the device's reduce-motion setting on, motion is reduced whatever the app says, so the switch shows that.
  const systemReduced = useReducedMotion();
  return (
    <Section label="Experience">
      <Card style={{ gap: space.lg }}>
        <ToggleRow
          title="Narration"
          body="Prof. Sen and the cast read their lines aloud. All text stays on screen either way."
          value={settings.narration}
          onChange={(v) => setSetting('narration', v)}
        />
        <ToggleRow
          title="Reduce motion"
          body={systemReduced ? 'On in your device settings.' : 'Turns off entrance and reveal animations.'}
          value={systemReduced || settings.reduceMotion}
          disabled={systemReduced}
          onChange={(v) => setSetting('reduceMotion', v)}
        />
        {Platform.OS !== 'web' ? (
          <ToggleRow title="Haptic feedback" body="A light tap on selections and milestones." value={settings.haptics} onChange={(v) => setSetting('haptics', v)} />
        ) : null}
      </Card>
    </Section>
  );
}

function ToggleRow({ title, body, value, onChange, disabled }: { title: string; body: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="small" color={colors.textMuted}>
          {body}
        </AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        accessibilityHint={body}
        trackColor={{ true: colors.primary, false: colors.surfaceHigh }}
        thumbColor="#fff"
      />
    </View>
  );
}

// ── C. Learning data ────────────────────────────────────────────────────────

/**
 * Export the learning record as JSON, on request (format: docs/LEARNING_DATA.md — no names or account details), or
 * clear it with Reset progress, which removes completed lessons, lessons in progress, predictions and challenge
 * answers. The goal and official daily challenge answers are kept.
 */
function LearningDataSection({ onReset }: { onReset: () => void }) {
  const entries = useProgress((s) => s.learning.length);
  const resetProgress = useProgress((s) => s.resetProgress);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const exportData = async () => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    const now = new Date();
    const fileName = exportFileName(now);
    let outcome: ShareOutcome;
    try {
      const { learning: attempts, completed, runtime, goal, scenarioDone, assessmentRuns } = useProgress.getState();
      const inProgress = allLessons().filter((l) => (runtime[l.id]?.step ?? 0) > 0).map((l) => l.id);
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
    <Section label="Learning data">
      <Card style={{ gap: space.md }}>
        <View style={{ gap: 2 }}>
          <AppText variant="small" color={colors.textBody}>
            Your answers power your learning profile. Export a copy, or reset to clear it.
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {entries === 0 ? 'No answers recorded yet.' : `${entries} ${entries === 1 ? 'answer' : 'answers'} recorded.`}
          </AppText>
        </View>
        <Button label={busy ? 'Preparing…' : 'Export data'} variant="secondary" compact icon={Download} iconPosition="left" disabled={busy} onPress={() => void exportData()} />
        {status ? (
          <AppText variant="small" color={status.failed ? colors.danger : colors.textBody} accessibilityLiveRegion="polite">
            {status.text}
          </AppText>
        ) : null}
        {confirmReset ? (
          <View style={{ gap: space.sm }}>
            <AppText variant="small" color={colors.textBody}>
              Clear completed lessons, lessons in progress and your recorded answers? Your goal and daily challenge answers are kept.
            </AppText>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button label="Cancel" variant="secondary" compact onPress={() => setConfirmReset(false)} style={{ flex: 1 }} />
              <Button
                label="Yes, reset"
                compact
                onPress={() => {
                  resetProgress();
                  setConfirmReset(false);
                  onReset();
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : (
          <Button label="Reset progress" variant="ghost" compact icon={RotateCcw} iconPosition="left" onPress={() => setConfirmReset(true)} />
        )}
        <SyncLine />
      </Card>
    </Section>
  );
}

/** Whether recent changes have reached the server. Saving happens in the background; this only reports it. */
function SyncLine() {
  const sync = useSyncStatus();
  const text =
    sync.state === 'error'
      ? (sync.message ?? 'A change couldn’t be saved.')
      : sync.state === 'retrying'
        ? `Not saved yet — ${sync.pending} ${sync.pending === 1 ? 'change' : 'changes'} waiting. ${sync.message ?? ''} It will retry automatically.`
        : sync.pending > 0
          ? 'Saving…'
          : 'All changes saved.';
  return (
    <AppText variant="caption" color={sync.state === 'error' ? colors.danger : colors.textMuted} accessibilityLiveRegion="polite">
      {text}
    </AppText>
  );
}

// ── D. Progress ─────────────────────────────────────────────────────────────

/** Back down to the tabs, then to Profile, so Settings doesn't stay on the stack underneath. */
function openProgress() {
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/profile');
}

function ProgressSection() {
  return (
    <Section label="Progress">
      <Pressable
        onPress={openProgress}
        accessibilityRole="button"
        accessibilityLabel="Your progress. View your learning profile and past activity."
        style={({ pressed }) => [styles.navRow, pressed && { backgroundColor: colors.surfaceHigh }]}>
        <View style={styles.navIcon}>
          <ChartNoAxesColumn size={18} color={colors.primaryText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong">Your progress</AppText>
          <AppText variant="small" color={colors.textMuted}>
            View your learning profile and past activity.
          </AppText>
        </View>
        <ChevronRight size={20} color={colors.textMuted} />
      </Pressable>
      <Pressable
        onPress={() => router.push('/onboarding')}
        accessibilityRole="button"
        accessibilityLabel="Replay the introduction. The one-minute decision against Maya. Your progress isn’t affected."
        style={({ pressed }) => [styles.navRow, { marginTop: space.sm }, pressed && { backgroundColor: colors.surfaceHigh }]}>
        <View style={styles.navIcon}>
          <Sparkles size={18} color={colors.primaryText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong">Replay the introduction</AppText>
          <AppText variant="small" color={colors.textMuted}>
            The one-minute decision against Maya. Your progress isn’t affected.
          </AppText>
        </View>
        <ChevronRight size={20} color={colors.textMuted} />
      </Pressable>
    </Section>
  );
}

// ── About and support ───────────────────────────────────────────────────────

/** Opens a page of the Tactiqo website in the in-app browser; falls back to the system browser. */
function openPage(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
}

function LinkRow({ icon: Icon, title, body, onPress, external = true }: { icon: typeof Info; title: string; body?: string; onPress: () => void; external?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={body ? `${title}. ${body}` : title} style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <Icon size={18} color={colors.primaryText} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        {body ? (
          <AppText variant="small" color={colors.textMuted}>
            {body}
          </AppText>
        ) : null}
      </View>
      {external ? <ExternalLink size={16} color={colors.textMuted} /> : <ChevronRight size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

/**
 * Who makes the app and how to reach them: the website's legal pages (checked to exist, src/features/settings/about.ts),
 * email support with the version filled in, and the running version and build.
 */
function AboutSection() {
  const v = appVersion();
  const [note, setNote] = useState<string | null>(null);
  const mail = (kind: 'problem' | 'feedback') => {
    Linking.openURL(supportMailto(kind, v, platformLabel())).catch(() => setNote(`No email app opened. Write to ${SUPPORT_EMAIL}.`));
  };
  return (
    <Section label="About and support">
      <Card style={{ gap: space.xs }}>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', paddingBottom: space.sm }}>
          <Info size={18} color={colors.insight} style={{ marginTop: 2 }} />
          <AppText variant="small" color={colors.textBody} style={{ flex: 1 }}>
            {ABOUT_TEXT}
          </AppText>
        </View>
        <LinkRow icon={Mail} title="Report a problem" body="Opens an email with your app version filled in." onPress={() => mail('problem')} external={false} />
        <LinkRow icon={Mail} title="Send feedback" onPress={() => mail('feedback')} external={false} />
        <LinkRow icon={Bug} title="Support" body="Help and how to reach us." onPress={() => openPage(LINKS.support)} />
        <LinkRow icon={Shield} title="Privacy Policy" onPress={() => openPage(LINKS.privacy)} />
        <LinkRow icon={FileText} title="Terms & Conditions" onPress={() => openPage(LINKS.terms)} />
        <LinkRow icon={Info} title="About Tactiqo" onPress={() => openPage(LINKS.about)} />
        {note ? (
          <AppText variant="small" color={colors.textMuted} selectable accessibilityLiveRegion="polite">
            {note}
          </AppText>
        ) : null}
        <AppText variant="caption" color={colors.textMuted} style={{ paddingTop: space.sm }} selectable accessibilityLabel={`App version ${versionLabel(v)}`}>
          Version {versionLabel(v)}
        </AppText>
      </Card>
    </Section>
  );
}

// ── Account ─────────────────────────────────────────────────────────────────

/**
 * Permanently delete the anonymous account on the server (src/data/session.ts → delete_my_account). On success the
 * app starts over as a new anonymous player and shows the welcome; on failure the dialog stays open with the reason.
 */
function AccountSection() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduced = useMotionReduced();

  const close = () => {
    if (busy) return;
    setOpen(false);
    setError(null);
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      // The app is restarting as a new player; this screen goes with it.
      if (router.canDismiss()) router.dismissAll();
    } catch (e) {
      setError(accountDeletionError(e));
      setBusy(false);
    }
  };

  return (
    <Section label="Account">
      <Card style={{ gap: space.md }}>
        <AppText variant="small" color={colors.textMuted}>
          Your account is anonymous and linked to this app installation — no name, email or password. Your learning progress, answers, Daily Challenge history, nickname and game results are saved to our server under it. Some things stay only on this device: story progress, the detailed Arena tallies and setups, and your preferences.
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          Reinstalling the app or changing phones starts a new account; the old one can’t be recovered.
        </AppText>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          accessibilityHint="Opens a confirmation. Deleting is permanent."
          style={({ pressed }) => [styles.danger, pressed && { backgroundColor: colors.dangerSoft }]}>
          <Trash size={18} color={colors.danger} strokeWidth={2.2} />
          <AppText variant="bodyStrong" color={colors.danger}>
            Delete account
          </AppText>
        </Pressable>
        <Pressable onPress={() => openPage(LINKS.deletion)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText variant="small" color={colors.primaryText}>
            What deletion removes, and how to ask by email if the app can’t
          </AppText>
        </Pressable>
      </Card>

      <Modal visible={open} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={close} statusBarTranslucent>
        <View style={styles.scrim}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <AppText variant="heading" accessibilityRole="header">
              Delete your account?
            </AppText>
            <AppText variant="small" color={colors.textBody}>
              This permanently deletes your anonymous account and everything saved on our server under it: lesson progress and answers, Daily Challenge history, your nickname, practice and Arena match results, Game of the Week results and friend challenges you created. It can’t be undone.
            </AppText>
            <AppText variant="small" color={colors.textBody}>
              Once the server confirms, this device also forgets the account: story progress, Arena records and anything still waiting to upload. Your motion, haptics and narration preferences stay.
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              Want a copy first? Cancel and use Export data. Exported or shared files aren’t affected.
            </AppText>
            {error ? (
              <AppText variant="small" color={colors.danger} accessibilityLiveRegion="assertive">
                {error}
              </AppText>
            ) : null}
            <View style={{ gap: space.sm }}>
              <Pressable
                onPress={() => void confirm()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={busy ? 'Deleting account' : 'Delete account'}
                accessibilityState={{ disabled: busy, busy }}
                style={({ pressed }) => [styles.dangerSolid, (pressed || busy) && { opacity: 0.8 }]}>
                {busy ? <ActivityIndicator color="#fff" size="small" /> : null}
                <AppText variant="bodyStrong" color="#fff" style={{ flexShrink: 1 }}>
                  {busy ? 'Deleting…' : 'Delete account'}
                </AppText>
              </Pressable>
              <Button label="Cancel" variant="secondary" compact disabled={busy} onPress={close} />
            </View>
          </View>
        </View>
      </Modal>
    </Section>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.xl },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
  divider: { height: 1, backgroundColor: colors.border },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: radius.md },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  navIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  danger: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  dangerSolid: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: '#B91C1C',
  },
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: colors.overlay },
  dialog: {
    width: '100%',
    maxWidth: 420,
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
});
