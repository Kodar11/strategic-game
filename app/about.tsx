import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui/AppText';
import { Backdrop } from '@/src/components/ui/Backdrop';
import { IconButton } from '@/src/components/ui/Button';
import { Card, SectionLabel } from '@/src/components/ui/Card';
import { ArrowLeft, Bug, CircleHelp, FileText, Info, Mail, Scale, Shield, Trash } from '@/src/components/ui/icons';
import { ABOUT_TEXT, LINKS, SUPPORT_EMAIL, supportMailto, versionLabel } from '@/src/features/settings/about';
import { FAQS } from '@/src/features/settings/faq';
import { FaqItem, LinkRow, openPage } from '@/src/features/settings/ui';
import { appVersion, platformLabel } from '@/src/features/settings/version';
import { MAX_CONTENT_WIDTH, colors, space } from '@/src/theme/tokens';

/**
 * About & Support, opened from Settings: what Tactiqo is, short answers to common questions, how to reach us (an
 * email with the version and build filled in — nothing about the account), the legal pages and open-source licences,
 * and the running version. Every link is a page the website was checked to have (src/features/settings/about.ts).
 */
export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const v = appVersion();
  const [note, setNote] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  const mail = (kind: 'problem' | 'feedback') => {
    Linking.openURL(supportMailto(kind, v, platformLabel())).catch(() => setNote(`No email app opened. Write to ${SUPPORT_EMAIL}.`));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          <View style={styles.head}>
            <IconButton icon={ArrowLeft} label="Back" onPress={back} />
            <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              About & support
            </AppText>
          </View>

          <Section label="About">
            <Card style={{ gap: space.xs }}>
              <AppText variant="small" color={colors.textBody}>
                {ABOUT_TEXT}
              </AppText>
              <LinkRow icon={Info} title="More about Tactiqo" onPress={() => openPage(LINKS.about)} />
            </Card>
          </Section>

          <Section label="Help">
            <Card style={{ gap: 0, paddingVertical: space.sm }}>
              {FAQS.map((f, i) => (
                <View key={f.id} style={i > 0 ? styles.divided : undefined}>
                  <FaqItem question={f.question} answer={f.answer} />
                </View>
              ))}
            </Card>
          </Section>

          <Section label="Get in touch">
            <Card style={{ gap: space.xs }}>
              <LinkRow icon={Bug} title="Report a problem" body="Opens an email with your app version filled in." onPress={() => mail('problem')} external={false} />
              <LinkRow icon={Mail} title="Send feedback" onPress={() => mail('feedback')} external={false} />
              <LinkRow icon={CircleHelp} title="Support page" onPress={() => openPage(LINKS.support)} />
              {note ? (
                <AppText variant="small" color={colors.textMuted} selectable accessibilityLiveRegion="polite">
                  {note}
                </AppText>
              ) : null}
            </Card>
          </Section>

          <Section label="Legal">
            <Card style={{ gap: space.xs }}>
              <LinkRow icon={Shield} title="Privacy policy" onPress={() => openPage(LINKS.privacy)} />
              <LinkRow icon={FileText} title="Terms and conditions" onPress={() => openPage(LINKS.terms)} />
              <LinkRow icon={Trash} title="Delete your account (web)" body="For when you can’t use the app." onPress={() => openPage(LINKS.deletion)} />
              <LinkRow icon={Scale} title="Open-source licences" onPress={() => router.push('/licenses')} external={false} />
            </Card>
          </Section>

          <AppText variant="caption" color={colors.textMuted} style={{ textAlign: 'center' }} selectable accessibilityLabel={`App version ${versionLabel(v)}`}>
            Version {versionLabel(v)}
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', gap: space.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
