import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button, IconButton } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ChoiceCard } from '@/src/components/ui/ChoiceCard';
import { ChartNoAxesColumn, ChevronRight, CircleHelp, Download, LogOut, Pencil, RotateCcw, Sparkles, Trash, UserRound, X } from '@/src/components/ui/icons';
import { useAuth } from '@/src/auth/store';
import { SignInPanel } from '@/src/components/auth/SignInPanel';
import { allLessons } from '@/src/content/lessons';
import { accountDeletionError } from '@/src/data/account';
import { UNSAVED_MESSAGE, deleteAccount, signOut, useSyncStatus } from '@/src/data/session';
import { allGoals, buildLearningExport, exportFileName } from '@/src/features/learning/records';
import { shareJsonFile } from '@/src/features/learning/shareFile';
import { type ShareOutcome, isShareFailure, shareOutcomeMessage } from '@/src/features/learning/shareOutcome';
import { useNickname } from '@/src/features/profile/nickname';
import { Sensitive } from '@/src/observability';
import { LINKS, versionLabel } from '@/src/features/settings/about';
import { openPage } from '@/src/features/settings/ui';
import { appVersion } from '@/src/features/settings/version';
import { useProgress } from '@/src/store/progress';
import { useMotionReduced } from '@/src/utils/feedback';
import { MAX_CONTENT_WIDTH, colors, fonts, radius, space } from '@/src/theme/tokens';

/**
 * One place for everything you can change, in a fixed order: who you are (nickname, goal), how the app behaves
 * (narration, motion, haptics, analytics), your learning data (export, reset), a way to your progress, About & support
 * (its own screen: help, contact, legal pages, licences, version) and the account. Opened from the gear on every tab.
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
  const { name: loaded, failed, reload } = useNickname();
  // A nickname belongs to an account (it's what leaderboards show), so a guest is offered sign-in instead.
  const guest = useAuth((s) => s.status !== 'signedIn' && s.status !== 'signingOut' && s.status !== 'deleting');
  const name = guest ? null : loaded;
  const editProfile = () => router.navigate(guest ? '/sign-in' : '/nickname');
  const loading = !guest && name === undefined && !failed;
  const display = guest ? 'Guest' : name === undefined ? (failed ? 'Couldn’t load your nickname' : 'Loading…') : (name ?? 'Anonymous player');

  return (
    <Section label="Profile">
      <Card style={{ gap: space.md }}>
        <Pressable
          onPress={editProfile}
          disabled={name === undefined}
          accessibilityRole="button"
          accessibilityLabel={guest ? 'Guest. Sign in to choose a nickname' : name === undefined ? display : `Nickname: ${name ?? 'none, shown as Anonymous player'}. Edit profile`}
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
            <Sensitive>
              <AppText variant="bodyStrong" numberOfLines={1} color={name ? colors.text : colors.textMuted}>
                {display}
              </AppText>
            </Sensitive>
            <AppText variant="caption" color={colors.textMuted}>
              {guest ? 'Sign in to choose a nickname for leaderboards.' : 'Your nickname may appear to other players.'}
            </AppText>
          </View>
          {loading ? <ActivityIndicator color={colors.primaryText} /> : null}
        </Pressable>
        {guest ? (
          <Button label="Sign in to choose a nickname" variant="secondary" compact icon={UserRound} iconPosition="left" onPress={editProfile} />
        ) : failed && name === undefined ? (
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
        {Platform.OS !== 'web' ? (
          <ToggleRow
            title="Share usage and crash data"
            body={`${settings.usageConsent === 'unset' ? 'Off — you haven’t chosen yet. ' : ''}Helps us fix crashes and improve Tactiqo. Never your answers, reflections or anything you type.`}
            value={settings.usageConsent === 'granted'}
            onChange={(v) => setSetting('usageConsent', v ? 'granted' : 'denied')}
          />
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
        accessibilityLabel="Replay the introduction. The Host’s welcome to the Tournament. Your progress isn’t affected."
        style={({ pressed }) => [styles.navRow, { marginTop: space.sm }, pressed && { backgroundColor: colors.surfaceHigh }]}>
        <View style={styles.navIcon}>
          <Sparkles size={18} color={colors.primaryText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong">Replay the introduction</AppText>
          <AppText variant="small" color={colors.textMuted}>
            The Host’s welcome to the Tournament. Your progress isn’t affected.
          </AppText>
        </View>
        <ChevronRight size={20} color={colors.textMuted} />
      </Pressable>
    </Section>
  );
}

// ── About and support ───────────────────────────────────────────────────────

/** One entry for help, contact, legal pages, licences and the version (app/about.tsx). */
function AboutSection() {
  const v = appVersion();
  return (
    <Section label="About & support">
      <Pressable
        onPress={() => router.push('/about')}
        accessibilityRole="button"
        accessibilityLabel={`About & support. Help, contact, privacy, terms and licences. Version ${versionLabel(v)}`}
        style={({ pressed }) => [styles.navRow, pressed && { backgroundColor: colors.surfaceHigh }]}>
        <View style={styles.navIcon}>
          <CircleHelp size={18} color={colors.primaryText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong">About & support</AppText>
          <AppText variant="small" color={colors.textMuted}>
            Help, contact, privacy, terms and licences.
          </AppText>
        </View>
        <ChevronRight size={20} color={colors.textMuted} />
      </Pressable>
    </Section>
  );
}

// ── Account ─────────────────────────────────────────────────────────────────

/**
 * Who is signed in, and the account's actions. A guest sees why an account helps and "Continue with Google". A
 * signed-in player sees the Google email, Sign out (the account and its data stay on the server) and Delete account
 * (src/data/session.ts → delete_my_account: permanent, and only reported once the server confirms it).
 */
function AccountSection() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const signedIn = (status === 'signedIn' || status === 'signingOut' || status === 'deleting') && !!user;

  return (
    <Section label="Account">
      {signedIn ? (
        <SignedInAccount email={user.email} />
      ) : (
        <Card style={{ gap: space.md }}>
          <View style={styles.row}>
            <View style={styles.navIcon}>
              <UserRound size={18} color={colors.primaryText} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">Not signed in</AppText>
              <AppText variant="caption" color={colors.textMuted}>
                Your progress is saved on this device only.
              </AppText>
            </View>
          </View>
          <AppText variant="small" color={colors.textBody}>
            Sign in with Google to keep your progress and use it on any device. An account also unlocks the Daily Challenge, Game of the Week, a nickname and friend challenges.
          </AppText>
          <SignInPanel card={false} />
        </Card>
      )}
    </Section>
  );
}

function SignedInAccount({ email }: { email: string | null }) {
  const status = useAuth((s) => s.status);
  const [dialog, setDialog] = useState<'signOut' | 'delete' | null>(null);

  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.row}>
        <View style={styles.navIcon}>
          <UserRound size={18} color={colors.primaryText} />
        </View>
        <View style={{ flex: 1 }}>
          {/* Masked in session replay (src/observability/Sensitive.tsx). */}
          <Sensitive>
            <AppText variant="bodyStrong" numberOfLines={1} selectable>
              {email ?? 'Google account'}
            </AppText>
          </Sensitive>
          <AppText variant="caption" color={colors.textMuted}>
            Signed in with Google
          </AppText>
        </View>
      </View>
      <AppText variant="small" color={colors.textMuted}>
        Lessons, answers, Daily Challenge history, your nickname and game results are saved to your account. Story progress, detailed Arena records and preferences stay on this phone.
      </AppText>
      <Button label="Sign out" variant="secondary" compact icon={LogOut} iconPosition="left" disabled={status !== 'signedIn'} onPress={() => setDialog('signOut')} />
      <Pressable
        onPress={() => setDialog('delete')}
        disabled={status !== 'signedIn'}
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
      <SignOutDialog open={dialog === 'signOut'} onClose={() => setDialog(null)} />
      <DeleteDialog open={dialog === 'delete'} onClose={() => setDialog(null)} />
    </Card>
  );
}

function Dialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const reduced = useMotionReduced();
  return (
    <Modal visible={open} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={styles.dialog} accessibilityViewIsModal>
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** Back to the app's first screen, with nothing of the previous account left on the stack. */
function leaveToStart() {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}

/**
 * Signing out keeps the account. If changes are still waiting to upload (offline), the dialog says so and offers
 * "Sign out anyway" rather than dropping them silently.
 */
function SignOutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useAuth((s) => s.status);
  const [unsaved, setUnsaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = status === 'signingOut';

  const close = () => {
    if (busy) return;
    setUnsaved(false);
    setError(null);
    onClose();
  };

  const confirm = async (force: boolean) => {
    if (busy) return;
    setError(null);
    const result = await signOut({ force });
    if (result === 'signedOut') {
      onClose();
      leaveToStart();
    } else if (result === 'unsaved') {
      setUnsaved(true);
    } else {
      setError(useAuth.getState().error ?? 'Couldn’t sign out. Please try again.');
    }
  };

  return (
    <Dialog open={open} onClose={close}>
      <AppText variant="heading" accessibilityRole="header">
        Sign out?
      </AppText>
      <AppText variant="small" color={colors.textBody}>
        Signing out doesn’t delete your account. Sign in with Google again to pick up where you left off.
      </AppText>
      <View style={{ gap: 2 }}>
        <AppText variant="small" color={colors.textBody} style={{ fontFamily: fonts.semibold }}>
          Kept on your account
        </AppText>
        <AppText variant="small" color={colors.textBody}>
          Lessons and answers, Daily Challenge history, Game of the Week and game results, your nickname.
        </AppText>
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="small" color={colors.textBody} style={{ fontFamily: fonts.semibold }}>
          Removed from this phone
        </AppText>
        <AppText variant="small" color={colors.textBody}>
          Story progress and detailed Arena records. They’re only stored on this phone and can’t be restored.
        </AppText>
      </View>
      {unsaved ? (
        <AppText variant="small" color={colors.insight} accessibilityLiveRegion="assertive">
          {UNSAVED_MESSAGE}
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="small" color={colors.danger} accessibilityLiveRegion="assertive">
          {error}
        </AppText>
      ) : null}
      <View style={{ gap: space.sm }}>
        <Button label={busy ? 'Signing out…' : unsaved ? 'Sign out anyway' : 'Sign out'} icon={LogOut} iconPosition="left" disabled={busy} onPress={() => void confirm(unsaved)} />
        <Button label="Cancel" variant="secondary" compact disabled={busy} onPress={close} />
      </View>
    </Dialog>
  );
}

/**
 * Permanently delete the account on the server. Success is shown only once the server confirms; the app then
 * continues as a new guest and shows the welcome. On failure the dialog stays open with the reason.
 */
function DeleteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      setBusy(false);
      onClose();
      leaveToStart();
    } catch (e) {
      setError(accountDeletionError(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close}>
      <AppText variant="heading" accessibilityRole="header">
        Delete your account?
      </AppText>
      <AppText variant="small" color={colors.textBody}>
        Your Tactiqo account and its data are deleted permanently. This can’t be undone.
      </AppText>
      <AppText variant="small" color={colors.textBody}>
        That’s lessons and answers, Daily Challenge history, your nickname, game and Arena results, Game of the Week results and friend challenges you created. This phone forgets the account too; your app preferences stay.
      </AppText>
      <AppText variant="small" color={colors.textBody}>
        Usage and crash data linked to your account is deleted by a background process, which can take a few weeks to finish.
      </AppText>
      <AppText variant="caption" color={colors.textMuted}>
        Only want to leave this phone? Sign out instead. Want a copy first? Use Export data.
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
    </Dialog>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.xl },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
  divider: { height: 1, backgroundColor: colors.border },
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
