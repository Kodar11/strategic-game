import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { VersionInfo } from './about';

/**
 * The running app's version and build, read at runtime. The version comes from the app config (app.json `version`).
 * The build number is the installed binary's (Android versionCode / iOS buildNumber): EAS sets it remotely
 * (eas.json `appVersionSource: remote`), so app.json doesn't have it. expo-constants still exposes it in SDK 57 —
 * deprecated in favour of expo-application, which isn't installed; a missing value shows as no build, never a guess.
 */
export function appVersion(): VersionInfo {
  const version = Constants.expoConfig?.version ?? null;
  let build: string | null = null;
  try {
    const p = Constants.platform as { android?: { versionCode?: number | null }; ios?: { buildNumber?: string | null } } | undefined;
    const raw = Platform.OS === 'android' ? p?.android?.versionCode : Platform.OS === 'ios' ? p?.ios?.buildNumber : null;
    build = raw === null || raw === undefined || raw === '' ? null : String(raw);
  } catch {
    build = null;
  }
  return { version, build };
}

export const platformLabel = () => `${Platform.OS} ${Platform.Version ?? ''}`.trim();
