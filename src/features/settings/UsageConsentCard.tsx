import { Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui/AppText';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { ShieldCheck } from '@/src/components/ui/icons';
import { analyticsAvailable } from '@/src/observability';
import { useProgress } from '@/src/store/progress';
import { colors, space } from '@/src/theme/tokens';

import { CONSENT_COPY, shouldAskConsent } from './consent';

/**
 * The one-time analytics choice, shown on Learn after the welcome (shouldAskConsent). A card in the page, never a
 * modal: it blocks nothing and can be scrolled past. "Share" and "Not now" look the same — same style, same size —
 * and nothing is preselected. Either answer is stored in device settings and the card never shows again; Settings
 * keeps the switch.
 */
export function UsageConsentCard() {
  const onboarded = useProgress((s) => s.settings.onboarded);
  const consent = useProgress((s) => s.settings.usageConsent);
  const setSetting = useProgress((s) => s.setSetting);
  if (!shouldAskConsent({ platform: Platform.OS, available: analyticsAvailable(), onboarded, consent })) return null;

  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.row}>
        <ShieldCheck size={20} color={colors.primaryText} />
        <AppText variant="bodyStrong" accessibilityRole="header" style={{ flex: 1 }}>
          {CONSENT_COPY.title}
        </AppText>
      </View>
      <AppText variant="small" color={colors.textBody}>
        {CONSENT_COPY.body}
      </AppText>
      <View style={styles.buttons}>
        <Button label={CONSENT_COPY.decline} variant="secondary" compact onPress={() => setSetting('usageConsent', 'denied')} style={styles.button} />
        <Button label={CONSENT_COPY.accept} variant="secondary" compact onPress={() => setSetting('usageConsent', 'granted')} style={styles.button} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  button: { flexGrow: 1, flexBasis: 120 },
});
