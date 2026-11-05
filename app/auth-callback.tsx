import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { MessageScreen } from '@/src/components/ui/MessageScreen';
import { completeSignInFromRedirect } from '@/src/data/session';

/**
 * Where Google sign-in returns (`tactiqo://auth-callback?code=…` in builds, `exp://…/--/auth-callback?code=…` in Expo Go;
 * src/auth/browser-sign-in.ts).
 *
 * If the JavaScript restarted on the way back (Expo Go on Android does; Android may also stop an installed app while
 * the browser is open), the sign-in that was waiting for the link is gone: this screen then finishes it from the link (completeSignInFromRedirect). When the sign-in is still
 * running, it handles the link itself and this screen only steps back to wherever the player was.
 */
export default function AuthCallback() {
  const { code, error } = useLocalSearchParams<{ code?: string; error?: string }>();

  useEffect(() => {
    const query = code ? `?code=${encodeURIComponent(code)}` : error ? `?error=${encodeURIComponent(error)}` : '';
    void (async () => {
      if (query) await completeSignInFromRedirect(query);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    })();
    // The link's parameters are fixed for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <MessageScreen loading />;
}
