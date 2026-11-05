import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { type VersionInfo, resolveVersion } from './about';

/**
 * The running app's version and build (expo-application, SDK 57): the installed binary's version name and build
 * number (Android versionName / versionCode, iOS CFBundleShortVersionString / CFBundleVersion). EAS sets the build
 * number remotely (eas.json `appVersionSource: remote`), so it is only known from the binary.
 *
 * In Expo Go the native values are Expo Go's own, and on web they are null, so there the app config's version is shown
 * with no build (resolveVersion). A missing value shows as no build, never a guess.
 */
export function appVersion(): VersionInfo {
  try {
    return resolveVersion({
      expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
      nativeVersion: Application.nativeApplicationVersion,
      nativeBuild: Application.nativeBuildVersion,
      configVersion: Constants.expoConfig?.version ?? null,
    });
  } catch {
    return { version: Constants.expoConfig?.version ?? null, build: null };
  }
}

export const platformLabel = () => `${Platform.OS} ${Platform.Version ?? ''}`.trim();
