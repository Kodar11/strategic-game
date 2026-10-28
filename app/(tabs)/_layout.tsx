import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useContext, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontsReadyContext } from '@/src/components/ui/AppText';
import { BookOpen, Gamepad2, type LucideIcon, UserRound } from '@/src/components/ui/icons';
import { useProgress } from '@/src/store/progress';
import { colors, fonts, radius } from '@/src/theme/tokens';

/**
 * Three top-level destinations: Learn (the curriculum, practice and daily challenge), Games (the five bot games,
 * Game of the Week and leaderboards) and Profile (the existing Thinking Profile, plus a separate game record).
 * Everything else is pushed on the root stack above the tabs, so lessons and games get the full screen and Android
 * back returns to the tab you came from.
 */
export default function TabsLayout() {
  const fontsReady = useContext(FontsReadyContext);
  const insets = useSafeAreaInsets();
  useFirstLaunchWelcome();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        // Room for the pill-backed icon and its label, plus the device's bottom inset (home indicator / gesture bar).
        tabBarStyle: { backgroundColor: colors.bgRaised, borderTopColor: colors.border, borderTopWidth: 1, height: 62 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 6 },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, ...(fontsReady ? { fontFamily: fonts.semibold } : { fontWeight: '600' }) },
        tabBarHideOnKeyboard: true,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Learn', tabBarAccessibilityLabel: 'Learn: lessons, practice and the daily challenge', tabBarIcon: ({ focused }) => <TabIcon icon={BookOpen} focused={focused} /> }} />
      <Tabs.Screen name="games" options={{ title: 'Games', tabBarAccessibilityLabel: 'Games: play bots, Game of the Week and leaderboards', tabBarIcon: ({ focused }) => <TabIcon icon={Gamepad2} focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarAccessibilityLabel: 'Your strategic thinking profile and game record', tabBarIcon: ({ focused }) => <TabIcon icon={UserRound} focused={focused} /> }} />
    </Tabs>
  );
}

/**
 * Opens the welcome above the tabs on a device that hasn't finished it, once the saved settings have loaded (so a
 * returning user is never shown it). Pushed rather than redirected, so the tabs are underneath when it closes.
 */
function useFirstLaunchWelcome() {
  const [settingsLoaded, setSettingsLoaded] = useState(() => useProgress.persist.hasHydrated());
  const onboarded = useProgress((s) => s.settings.onboarded);
  const opened = useRef(false);

  useEffect(() => (settingsLoaded ? undefined : useProgress.persist.onFinishHydration(() => setSettingsLoaded(true))), [settingsLoaded]);

  useEffect(() => {
    // Re-armed once finished, so it opens again for the new player after an account is deleted.
    if (onboarded) opened.current = false;
    if (!settingsLoaded || onboarded || opened.current) return;
    opened.current = true;
    router.push('/onboarding');
  }, [settingsLoaded, onboarded]);
}

/** The active tab gets a soft pill behind its icon, so it reads at a glance without relying on colour alone. */
function TabIcon({ icon: Icon, focused }: { icon: LucideIcon; focused: boolean }) {
  return (
    <View style={{ width: 52, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.primarySoft : 'transparent' }}>
      <Icon size={20} color={focused ? colors.primaryText : colors.textMuted} strokeWidth={focused ? 2.4 : 2} />
    </View>
  );
}
