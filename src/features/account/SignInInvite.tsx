import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { create } from 'zustand';

import { useIsGuest } from '@/src/components/auth/SignInRequired';
import { SignInPanel } from '@/src/components/auth/SignInPanel';
import { track } from '@/src/observability';
import { useProgress } from '@/src/store/progress';

/**
 * "Keep your progress safe": a quiet card on Learn that offers Google sign-in to a guest who has something worth
 * keeping. Never a modal, never before or during the welcome, and never in the way:
 * - only once the welcome is finished and the guest has made at least one decision (so it isn't on a first launch
 *   with nothing to save);
 * - dismissing it ("Not now") is remembered on this device and it doesn't come back; Settings always keeps the option;
 * - it disappears the moment the player is signed in.
 */

const INVITE_KEY = 'tactiqo/sign-in-invite/v1';

const useInvite = create<{ loaded: boolean; dismissed: boolean }>(() => ({ loaded: false, dismissed: false }));

let loading: Promise<void> | null = null;
function loadInvite(): Promise<void> {
  loading ??= AsyncStorage.getItem(INVITE_KEY)
    .then((v) => useInvite.setState({ loaded: true, dismissed: v === 'dismissed' }))
    .catch(() => useInvite.setState({ loaded: true, dismissed: false }));
  return loading;
}

function dismissInvite(): void {
  track('sign_in_invite_dismissed');
  useInvite.setState({ dismissed: true });
  AsyncStorage.setItem(INVITE_KEY, 'dismissed').catch(() => undefined);
}

export function SignInInvite() {
  const guest = useIsGuest();
  const { loaded, dismissed } = useInvite();
  const onboarded = useProgress((s) => s.settings.onboarded);
  const hasProgress = useProgress((s) => s.learning.length > 0 || s.completed.length > 0 || s.scenarioDone.length > 0);

  useEffect(() => {
    void loadInvite();
  }, []);

  if (!guest || !loaded || dismissed || !onboarded || !hasProgress) return null;
  return (
    <SignInPanel
      title="Keep your progress safe"
      body="Sign in with Google to save your progress and access it across devices. Right now it’s saved on this device only."
      onDismiss={dismissInvite}
      source="invite"
      legal
    />
  );
}
