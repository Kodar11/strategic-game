import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { Button } from '@/src/components/ui/Button';
import { ArrowRight } from '@/src/components/ui/icons';
import { rivalOf, useTournamentContent } from '@/src/features/tournament/content';
import { Kicker, RivalMark } from '@/src/features/tournament/ui/parts';
import { track } from '@/src/observability';
import { playMatch } from '@/src/features/tournament/games';
import { mainStages } from '@/src/tournament/progress';
import { useProgress } from '@/src/store/progress';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

const FALLBACK = ['Welcome to the Tournament.', 'Five rivals are waiting. Each one plays a trick you can learn to beat.'];

/**
 * The first-session experience, shown once per device above the tabs (and on request from Settings): the Host
 * welcomes the player to the Tournament, then the first Qualifier match opens. About twenty seconds; skippable. The
 * Host's lines are tournament content (`welcome`), so they change with the document. Records nothing but the
 * `onboarded` setting.
 */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { doc, season } = useTournamentContent();
  const host = rivalOf(doc, doc.host);
  const lines = doc.welcome.length ? doc.welcome : FALLBACK;
  const firstStage = mainStages(season)[0];
  const first = firstStage?.matches[0];
  const replayed = useRef(useProgress.getState().settings.onboarded);

  useEffect(() => {
    track('onboarding_step', { step: 'host', replay: replayed.current });
  }, []);

  const end = useCallback((play: boolean) => {
    track('onboarding_finished', { result: play ? 'completed' : 'skipped', at_step: 'host', next: play ? 'match' : 'explore', replay: replayed.current });
    useProgress.getState().setSetting('onboarded', true);
    // Play first, learn after: the welcome opens the first match itself; its result points to the idea behind it.
    if (play && first && firstStage) playMatch(firstStage, first, first.level, { replace: true });
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [first, firstStage]);

  // Android back leaves the welcome, like "Skip".
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        end(false);
        return true;
      });
      return () => sub.remove();
    }, [end]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop warm={0.25} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.lg, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          <View style={{ alignItems: 'center', gap: space.md }}>
            <RivalMark rival={host} size={88} />
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Kicker tone={host.tone}>{doc.title}</Kicker>
              <AppText variant="title" accessibilityRole="header" align="center">
                {host.name}
              </AppText>
            </View>
          </View>

          <View style={{ gap: space.md }}>
            {lines.map((line, i) => (
              <AppText key={i} variant={i === 0 ? 'heading' : 'body'} color={i === 0 ? colors.text : colors.textBody} align="center">
                {line}
              </AppText>
            ))}
          </View>

          <View style={{ gap: space.sm }}>
            <Button label="Play your first match" icon={ArrowRight} onPress={() => end(true)} accessibilityHint="Opens the first Qualifier match" />
            <Button label="Skip to the app" variant="ghost" onPress={() => end(false)} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.xxl },
});
