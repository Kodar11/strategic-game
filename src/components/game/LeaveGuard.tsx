import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { colors, radius, space } from '@/src/theme/tokens';
import { shouldGuardLeave } from './reveal-plan';

/**
 * Asks before an active match is left, whichever way (the Back button, Android Back, a swipe): the match lives on this
 * screen, so leaving ends it. A match that hasn't started or is over passes straight through, and one answer is enough.
 * `body` lets a server match, which can be resumed, say so.
 */
export function LeaveGuard({ started, over, body = 'This match isn’t saved. If you leave now, your progress in it is lost.' }: { started: boolean; over: boolean; body?: string }) {
  const navigation = useNavigation();
  const [pending, setPending] = useState<null | (() => void)>(null);
  const confirmed = useRef(false);
  const guard = useRef({ started, over });
  useEffect(() => {
    guard.current = { started, over };
  }, [started, over]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!shouldGuardLeave(guard.current.started, guard.current.over, confirmed.current)) return;
        e.preventDefault();
        setPending(() => () => navigation.dispatch(e.data.action));
      }),
    [navigation],
  );

  if (!pending) return null;
  const stay = () => setPending(null);
  const leave = () => {
    confirmed.current = true;
    const go = pending;
    setPending(null);
    go();
  };
  return (
    <Modal transparent visible animationType="fade" onRequestClose={stay} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={stay} accessibilityLabel="Stay in the match" accessibilityRole="button">
        <Pressable style={styles.card} onPress={() => undefined} accessibilityViewIsModal>
          <AppText variant="heading" accessibilityRole="header">
            Leave this match?
          </AppText>
          <AppText variant="small" color={colors.textBody}>
            {body}
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="Leave" variant="secondary" onPress={leave} style={{ flex: 1 }} />
            <Button label="Stay" onPress={stay} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, backgroundColor: colors.overlay },
  card: { width: '100%', maxWidth: 360, gap: space.md, padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.bgRaised },
});
