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
import { useMotionReduced } from '@/src/utils/feedback';
import { colors } from '@/src/theme/tokens';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.primary, text: colors.text, border: colors.border },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const reduced = useMotionReduced();
  const ready = loaded || !!error;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  // A font failure is not fatal: text falls back to the system font.
  if (!ready) return null;

  return (
    <FontsReadyContext.Provider value={loaded && !error}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: reduced ? 'fade' : 'slide_from_right',
          }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="lesson/[lessonId]" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="settings" options={{ presentation: 'modal', animation: reduced ? 'fade' : 'slide_from_bottom' }} />
        </Stack>
      </ThemeProvider>
    </FontsReadyContext.Provider>
  );
}
