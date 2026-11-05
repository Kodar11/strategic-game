import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { APP_NAME } from '@/src/brand';
import { FontsReadyContext } from '@/src/components/ui/AppText';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { SyncIndicator } from '@/src/components/ui/SyncIndicator';
import { startAppData, useAppData } from '@/src/data/session';
import { startObservability, useScreenTracking } from '@/src/observability';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors } from '@/src/theme/tokens';

// Catch any errors thrown by the Layout component: Expo Router's recovery screen, plus one error report.
export { ErrorBoundary } from '@/src/observability';

// A deep link (e.g. a friend challenge) opens above the tabs, so Back always has somewhere to go.
export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.primary, text: colors.text, border: colors.border },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const reduced = useMotionReduced();
  const ready = loaded || !!error;
  const data = useAppData();

  // Content and progress load from the device first (src/data/session.ts), so this is quick even offline. Only a
  // device that has never had the content or this account's progress needs the server once (or shows a retry).
  useEffect(() => {
    // Telemetry starts alongside, never before or instead: it can't delay or break start-up (src/observability).
    startObservability();
    void startAppData();
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  // A font failure is not fatal: text falls back to the system font.
  if (!ready) return null;

  return (
    <FontsReadyContext.Provider value={loaded && !error}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        {/* The browser tab title on web; does nothing on native. */}
        <Head>
          <title>{APP_NAME}</title>
        </Head>
        {data.status === 'ready' ? (
          <>
            <AppStack reduced={reduced} />
            <SyncIndicator />
          </>
        ) : (
          <MessageScreen
            loading={data.status === 'loading'}
            title={data.status === 'error' && data.error.kind === 'network' ? 'Connect once to get started' : 'Couldn’t load the lessons'}
            body={
              data.status === 'error'
                ? data.error.kind === 'network'
                  ? 'This device doesn’t have your progress yet, so it needs the internet once. After that, lessons, scenarios and games work offline.'
                  : data.error.message
                : undefined
            }
            onRetry={() => void startAppData()}
          />
        )}
      </ThemeProvider>
    </FontsReadyContext.Provider>
  );
}

function AppStack({ reduced }: { reduced: boolean }) {
  useScreenTracking();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: reduced ? 'fade' : 'slide_from_right',
      }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="lesson/[lessonId]" />
      <Stack.Screen name="challenges/index" />
      <Stack.Screen name="challenges/[lessonId]" />
      <Stack.Screen name="scenario/[scenarioId]" />
      <Stack.Screen name="checkpoint/[assessmentId]" />
      <Stack.Screen name="daily" />
      <Stack.Screen name="daily/play" />
      <Stack.Screen name="daily/leaderboard" />
      <Stack.Screen name="daily/history" />
      <Stack.Screen name="settings" options={{ presentation: 'modal', animation: reduced ? 'fade' : 'slide_from_bottom' }} />
      <Stack.Screen name="about" />
      <Stack.Screen name="licenses" />
      <Stack.Screen name="games/[gameId]" />
      <Stack.Screen name="games/play" options={{ gestureEnabled: false }} />
      <Stack.Screen name="games/ranked" options={{ gestureEnabled: false }} />
      <Stack.Screen name="competitions/index" />
      <Stack.Screen name="competitions/[id]" />
      <Stack.Screen name="arena/[gameId]" />
      <Stack.Screen name="arena/play" options={{ gestureEnabled: false }} />
      <Stack.Screen name="story/[storyId]" options={{ animation: reduced ? 'fade' : 'fade_from_bottom' }} />
      <Stack.Screen name="leaderboard" />
      <Stack.Screen name="report" />
      <Stack.Screen name="report/[skill]" />
      <Stack.Screen name="challenge/[token]" />
      <Stack.Screen name="nickname" options={{ presentation: 'modal', animation: reduced ? 'fade' : 'slide_from_bottom' }} />
      <Stack.Screen name="sign-in" options={{ presentation: 'modal', animation: reduced ? 'fade' : 'slide_from_bottom' }} />
      <Stack.Screen name="auth-callback" options={{ animation: 'none' }} />
    </Stack>
  );
}
