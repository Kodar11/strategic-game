/**
 * Whether this build sends telemetry, and where. Pure: start.ts gathers the inputs (environment variables, the app
 * config, the platform) and this decides. Telemetry is off unless every condition holds, and the reason it is off is
 * kept for the development log and the Settings screen.
 *
 * - `environment` comes from the EAS build profile (app.config.js → `extra.observability`), never from a variable a
 *   developer could copy between environments: a production build always reports `production`.
 * - `EXPO_PUBLIC_POSTHOG_ENABLED` must be exactly `true`. It is the release gate: production stays off until the
 *   privacy policy and Play Data Safety describe what is collected (docs/OBSERVABILITY.md).
 * - Web is off: the web build is a preview of the app, and the website will have its own setup.
 * - The key must be a project (public, `phc_`) key. A personal API key (`phx_`) can read and delete data and must
 *   never be in an app; seeing one switches telemetry off.
 */

export type Environment = 'development' | 'preview' | 'production';

export interface ConfigInput {
  platform: string;
  enabledFlag: string | undefined;
  apiKey: string | undefined;
  host: string | undefined;
  environment: string | undefined;
  replaySampleRate: string | undefined;
  gitSha: string | null | undefined;
}

export type ResolvedConfig =
  | {
      enabled: true;
      apiKey: string;
      host: string;
      environment: Environment;
      /** 0 = session replay off (the default everywhere until approved). */
      replaySampleRate: number;
      gitSha: string | null;
    }
  | { enabled: false; reason: 'web' | 'switched_off' | 'no_key' | 'personal_key' | 'bad_host'; environment: Environment };

export const DEFAULT_HOST = 'https://eu.i.posthog.com';

export function environmentOf(raw: string | undefined): Environment {
  return raw === 'production' || raw === 'preview' ? raw : 'development';
}

export function resolveConfig(input: ConfigInput): ResolvedConfig {
  const environment = environmentOf(input.environment);
  if (input.platform === 'web') return { enabled: false, reason: 'web', environment };
  if (input.enabledFlag !== 'true') return { enabled: false, reason: 'switched_off', environment };
  const apiKey = input.apiKey?.trim() ?? '';
  if (!apiKey) return { enabled: false, reason: 'no_key', environment };
  if (apiKey.startsWith('phx_')) return { enabled: false, reason: 'personal_key', environment };
  const host = (input.host?.trim() || DEFAULT_HOST).replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(host)) return { enabled: false, reason: 'bad_host', environment };
  const rate = Number(input.replaySampleRate);
  const replaySampleRate = Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0;
  const gitSha = input.gitSha && /^[0-9a-f]{7,40}$/i.test(input.gitSha) ? input.gitSha.slice(0, 12) : null;
  return { enabled: true, apiKey, host, environment, replaySampleRate, gitSha };
}
