/**
 * The trust and support links in Settings, and the app's version — kept out of the screen so a test can check them.
 *
 * Every URL here was checked on the live site (https://tactiqo.vercel.app, 2026-11-04): the footer links Support
 * (/contact), Privacy Policy (/privacy), Terms & Conditions (/terms), Delete Account (/delete-account) and About
 * (/about). The support address is the one the Support and Privacy pages publish. Don't add a link here that the site
 * doesn't have.
 */

export const SITE = 'https://tactiqo.vercel.app';

export const LINKS = {
  privacy: `${SITE}/privacy`,
  terms: `${SITE}/terms`,
  support: `${SITE}/contact`,
  deletion: `${SITE}/delete-account`,
  about: `${SITE}/about`,
} as const;

/** Published on the site's Support and Privacy pages. */
export const SUPPORT_EMAIL = 'tanmaychavan13@gmail.com';

/** One line about the product, in the site's own terms; no claims about outcomes. */
export const ABOUT_TEXT =
  'Tactiqo is a strategic-thinking app. Make decisions in lessons, games and stories, see what follows, and understand why — trust, incentives, bargaining and uncertainty, one decision at a time.';

export interface VersionInfo {
  version: string | null;
  build: string | null;
}

/**
 * Which version to show. The installed binary's values win (a store or preview build); in Expo Go they belong to Expo
 * Go itself, and on web they don't exist, so the app config's version is used with no build number.
 */
export function resolveVersion(input: { expoGo: boolean; nativeVersion: string | null; nativeBuild: string | null; configVersion: string | null }): VersionInfo {
  const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
  if (input.expoGo) return { version: clean(input.configVersion), build: null };
  const nativeVersion = clean(input.nativeVersion);
  return { version: nativeVersion ?? clean(input.configVersion), build: nativeVersion ? clean(input.nativeBuild) : null };
}

/** "1.0.0 (build 12)", "1.0.0", or "Unknown" — never a made-up number. */
export function versionLabel(v: VersionInfo): string {
  if (!v.version) return 'Unknown';
  return v.build ? `${v.version} (build ${v.build})` : v.version;
}

/** A mailto link with a subject and the version in the body, so a report says which build it's about. */
export function supportMailto(kind: 'problem' | 'feedback', v: VersionInfo, platform: string): string {
  const subject = kind === 'problem' ? 'Tactiqo: problem report' : 'Tactiqo: feedback';
  const body =
    kind === 'problem'
      ? `What were you doing?\n\nWhat did you expect?\n\nWhat happened instead?\n\n—\nApp ${versionLabel(v)} · ${platform}`
      : `\n\n—\nApp ${versionLabel(v)} · ${platform}`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
