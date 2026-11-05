import type { ReactNode } from 'react';
import { PostHogMaskView } from 'posthog-react-native';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Wrap anything personal that is shown as plain text — the account email, a nickname, other players' nicknames on
 * leaderboards — so session replay records a masked box instead (text inputs and images are masked everywhere
 * already; see posthog.ts). Has no effect while replay is off, and is a plain View on web (Sensitive.web.tsx).
 */
export function Sensitive({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <PostHogMaskView style={style}>{children}</PostHogMaskView>;
}
