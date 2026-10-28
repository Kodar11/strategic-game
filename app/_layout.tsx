import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { FontsReadyContext } from '@/src/components/ui/AppText';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { startAppData, useAppData } from '@/src/data/session';
import { useMotionReduced } from '@/src/utils/feedback';
import { colors } from '@/src/theme/tokens';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

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

  // Content and progress come from Supabase; nothing renders until both have loaded (or failed with a retry).
  useEffect(() => {
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
        {data.status === 'ready' ? (
          <AppStack reduced={reduced} />
        ) : (
          <MessageScreen
            loading={data.status === 'loading'}
            title="Couldn’t load the lessons"
            body={data.status === 'error' ? data.error.message : undefined}
            onRetry={() => void startAppData()}
          />
        )}
      </ThemeProvider>
    </FontsReadyContext.Provider>
  );
}

function AppStack({ reduced }: { reduced: boolean }) {
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
      <Stack.Screen name="settings" options={{ presentation: 'modal', animation: reduced ? 'fade' : 'slide_from_bottom' }} />
      <Stack.Screen name="games/[gameId]" />
      <Stack.Screen name="games/play" options={{ gestureEnabled: false }} />
      <Stack.Screen name="leaderboard" />
      <Stack.Screen name="report" />
      <Stack.Screen name="report/[skill]" />
      <Stack.Screen name="challenge/[token]" />
      <Stack.Screen name="nickname" options={{ presentation: 'modal', animation: reduced ? 'fade' : 'slide_from_bottom' }} />
    </Stack>
  );
}
