import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_NAME } from '@/src/brand';
import { useEnter } from '@/src/components/lesson/motion';
import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { IconButton } from '@/src/components/ui/Button';
import { Settings } from '@/src/components/ui/icons';
import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { SignInInvite } from '@/src/features/account/SignInInvite';
import { DailyRow } from '@/src/features/daily/DailyRow';
import { UsageConsentCard } from '@/src/features/settings/UsageConsentCard';
import { TournamentHome } from '@/src/features/tournament/ui/TournamentHome';
import { WeeklyRival } from '@/src/features/tournament/ui/WeeklyRival';
import { useLoadTournament } from '@/src/features/tournament/useStatus';
import { useTournament } from '@/src/features/tournament/store';
import { useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

/** The brain-puzzle mark on a transparent background (the same artwork as the splash screen). */
const LOGO = require('@/assets/images/splash-icon.png');

/** Home: the Tournament first, then today's Daily challenge. */
export default function Home() {
  const insets = useSafeAreaInsets();
  const enter = useEnter();
  const hydrated = useProgress((s) => s.hydrated);
  const loaded = useTournament((s) => s.loaded);
  useLoadTournament();

  if (!hydrated || !loaded) return <MessageScreen loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.15} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xxl, paddingHorizontal: space.lg }}>
        <View style={styles.column}>
          <View style={styles.topBar}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessible accessibilityRole="header" accessibilityLabel={APP_NAME}>
              <Image source={LOGO} style={styles.logo} contentFit="contain" />
              <AppText variant="heading" color={colors.text}>
                {APP_NAME}
              </AppText>
            </View>
            <IconButton icon={Settings} label="Settings" onPress={() => router.navigate('/settings')} />
          </View>

          <Animated.View entering={enter(0, 'fade')}>
            <TournamentHome />
          </Animated.View>

          <Animated.View entering={enter(80)} style={{ gap: space.sm }}>
            <AppText variant="overline" color={colors.textMuted}>
              Today
            </AppText>
            <DailyRow />
            <WeeklyRival />
          </Animated.View>

          <UsageConsentCard />
          <SignInInvite />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.xl },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { width: 30, height: 30 },
});
