import { router } from 'expo-router';
import { House } from '@/src/components/ui/icons';
import { ActivityIndicator, View } from 'react-native';

import { Portrait } from '@/src/components/characters/Portrait';
import { colors, space } from '@/src/theme/tokens';
import { AppText } from './AppText';
import { Backdrop } from './Backdrop';
import { Button } from './Button';

/** Full-screen loading, empty and error states. */
export function MessageScreen({ title, body, loading }: { title?: string; body?: string; loading?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.lg }}>
      <Backdrop />
      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Loading" />
      ) : (
        <>
          <Portrait character="sen" expression="thinking" size={88} />
          <AppText variant="title" align="center">
            {title}
          </AppText>
          {body ? (
            <AppText align="center" color={colors.textMuted} style={{ maxWidth: 360 }}>
              {body}
            </AppText>
          ) : null}
          <Button label="Back to lessons" icon={House} iconPosition="left" onPress={() => router.replace('/')} />
        </>
      )}
    </View>
  );
}
