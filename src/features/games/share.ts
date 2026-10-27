import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

import { toDataError } from '@/src/data/errors';
import { GameError } from '@/src/data/games';

/**
 * Sharing text and challenge links through the platform's own share sheet.
 *
 * Links: with EXPO_PUBLIC_WEB_URL set (where the web build is hosted), invites use `https://<host>/challenge/<token>`,
 * which works for anyone — the web build plays the challenge. Otherwise they use the app's scheme
 * (`strategicgame://challenge/<token>`), which opens the installed app and does nothing without it.
 */

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL;

export function challengeLink(token: string): string {
  if (WEB_URL) return `${WEB_URL.replace(/\/+$/, '')}/challenge/${token}`;
  return Linking.createURL(`/challenge/${token}`);
}

/** What we can honestly say happened. Neither platform reports whether a message was actually sent. */
export type ShareResult = 'opened' | 'copied' | 'dismissed' | 'unavailable';

export async function shareText(message: string, url?: string): Promise<ShareResult> {
  const text = url ? `${message}\n${url}` : message;
  if (Platform.OS === 'web') {
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share(url ? { text: message, url } : { text: message });
        return 'opened';
      } catch {
        return 'dismissed';
      }
    }
    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(text);
        return 'copied';
      } catch {
        // Fall through.
      }
    }
    return 'unavailable';
  }
  try {
    const r = await Share.share({ message: text });
    return r.action === Share.dismissedAction ? 'dismissed' : 'opened';
  } catch {
    return 'unavailable';
  }
}

/** What to tell the player after sharing; when nothing could be shared, the text itself, to copy by hand. */
export function shareResultMessage(r: ShareResult, what: 'result' | 'invite', text: string): string | null {
  switch (r) {
    case 'copied':
      return what === 'invite' ? 'Invite link copied. Paste it into a message.' : 'Result copied. Paste it into a message.';
    case 'unavailable':
      return `Sharing isn’t available here. Copy this instead:\n${text}`;
    default:
      return null;
  }
}

/** A failed invite, in words the player can act on. Server refusals the app knows about keep their own message. */
export function inviteFailure(e: unknown): string {
  const d = toDataError(e);
  if (d instanceof GameError || d.transient) return d.message;
  return 'Couldn’t create an invite link right now. Practice games still work.';
}
