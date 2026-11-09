import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { useTournamentContent } from '@/src/features/tournament/content';
import { useTournament } from '@/src/features/tournament/store';
import { useProgress } from '@/src/store/progress';
import { DAILY_HOUR, EMPTY_REMINDERS, type ReminderState, nudgeDate, recordVisit, rivalNudge, sanitizeReminders } from '@/src/tournament/reminders';

/**
 * Local reminders (no server, no push token): a daily nudge for the Daily challenge streak, and "Vesper is waiting"
 * two days after a visit that left a stage part-way done. Opt-in only, offered after the second day of use
 * (src/tournament/reminders.ts has the rules). Rescheduled on every visit, so the rival nudge always counts from the
 * last time the app was opened. Phones only: on web this does nothing.
 */

export const REMINDERS_KEY = 'tactiqo/reminders/v1';
const DAILY_ID = 'tactiqo-daily-streak';
const NUDGE_ID = 'tactiqo-rival-nudge';
const CHANNEL = 'reminders';
export const remindersSupported = Platform.OS === 'ios' || Platform.OS === 'android';

if (remindersSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

interface RemindersStore extends ReminderState {
  loaded: boolean;
}

export const useReminders = create<RemindersStore>(() => ({ ...EMPTY_REMINDERS, loaded: false }));

const save = (s: ReminderState) => AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify({ enabled: s.enabled, asked: s.asked, days: s.days })).catch(() => undefined);

function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function load(): Promise<ReminderState> {
  if (!useReminders.getState().loaded) {
    try {
      const raw = await AsyncStorage.getItem(REMINDERS_KEY);
      useReminders.setState({ ...sanitizeReminders(raw ? JSON.parse(raw) : {}), loaded: true });
    } catch {
      useReminders.setState({ loaded: true });
    }
  }
  return useReminders.getState();
}

async function schedule(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_ID).catch(() => undefined);
  await Notifications.cancelScheduledNotificationAsync(NUDGE_ID).catch(() => undefined);
  if (!useReminders.getState().enabled) return;
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_ID,
    content: { title: 'Today’s challenge is waiting', body: 'One short strategic decision. Keep your streak going.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: DAILY_HOUR, minute: 0, channelId: CHANNEL },
  });
  const nudge = rivalNudge(useTournamentContent.getState().doc, useTournament.getState(), useProgress.getState().completed);
  if (nudge) {
    await Notifications.scheduleNotificationAsync({
      identifier: NUDGE_ID,
      content: { title: nudge.title, body: nudge.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nudgeDate(new Date()), channelId: CHANNEL },
    });
  }
}

/** On every visit to Home: count the day of use and, when reminders are on, schedule them afresh. Never throws. */
export async function onVisit(): Promise<void> {
  if (!remindersSupported) return;
  try {
    const s = await load();
    const next = recordVisit(s, localDay());
    if (next !== s) {
      useReminders.setState(next);
      void save(next);
    }
    await useTournament.getState().load();
    await schedule();
  } catch {
    // Scheduling failed (permission withdrawn in system settings): nothing is sent, nothing breaks.
  }
}

/** Ask for permission and turn reminders on. Resolves false when the player (or the system) declines. */
export async function enableReminders(): Promise<boolean> {
  if (!remindersSupported) return false;
  try {
    await load();
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT });
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: false } })).granted;
    const next = { ...useReminders.getState(), enabled: granted, asked: true };
    useReminders.setState(next);
    void save(next);
    await schedule();
    return granted;
  } catch {
    return false;
  }
}

export async function disableReminders(asked = true): Promise<void> {
  await load();
  const next = { ...useReminders.getState(), enabled: false, asked };
  useReminders.setState(next);
  void save(next);
  if (remindersSupported) await schedule().catch(() => undefined);
}
