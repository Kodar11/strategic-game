/**
 * Reading the URL Supabase sends the browser back to after a browser-based Google sign-in (the Expo Go development
 * fallback, src/auth/browser-sign-in.ts). Pure, so it is tested without a browser.
 *
 * With the PKCE flow a successful sign-in comes back as `<redirect>?code=<auth code>`; the code is useless without the
 * code verifier that stayed on this device, so it is safe to pass through a redirect. A refusal comes back as
 * `?error=...&error_description=...` (in the query or, from some providers, the fragment).
 */

export type AuthCallback = { type: 'code'; code: string } | { type: 'cancelled' } | { type: 'error'; code: string };

function paramsOf(url: string): URLSearchParams {
  const out = new URLSearchParams();
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  const query = q >= 0 ? url.slice(q + 1, h > q ? h : undefined) : '';
  const fragment = h >= 0 ? url.slice(h + 1) : '';
  for (const part of [query, fragment]) new URLSearchParams(part).forEach((v, k) => out.set(k, v));
  return out;
}

export function parseAuthCallback(url: string): AuthCallback {
  const p = paramsOf(url);
  const code = p.get('code');
  if (code) return { type: 'code', code };
  const error = p.get('error') ?? p.get('error_code');
  // The player closed Google's consent page or chose "Cancel".
  if (error === 'access_denied') return { type: 'cancelled' };
  return { type: 'error', code: error ?? 'no_code' };
}
