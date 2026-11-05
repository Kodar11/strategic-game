import type { UsageConsent } from '../../store/settings.ts';

/**
 * Whether to show the one-time "Help improve Tactiqo" card (UsageConsentCard). Asked once, after the welcome, only
 * where analytics can actually run (a native build with telemetry switched on), and never again once answered either
 * way — Settings keeps the choice changeable.
 */
export function shouldAskConsent(input: { platform: string; available: boolean; onboarded: boolean; consent: UsageConsent }): boolean {
  return input.platform !== 'web' && input.available && input.onboarded && input.consent === 'unset';
}

/** The card's copy, in one place so a test can hold it to the rules (equal choices, no pressure). */
export const CONSENT_COPY = {
  title: 'Help improve Tactiqo',
  body: 'Share anonymous usage and diagnostic data to help us improve the app and fix crashes. Never your answers, reflections or anything you type. You can change this in Settings.',
  accept: 'Share',
  decline: 'Not now',
} as const;
