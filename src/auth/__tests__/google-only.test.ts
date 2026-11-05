import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Google is the only way to sign in (docs/AUTHENTICATION.md). These guards read the source, so a later change that
 * brings back email/password, magic links, password reset or anonymous accounts fails here instead of shipping.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      out.push(...sources(path));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const APP_FILES = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'src'))];

/** Supabase Auth calls that create or sign in a non-Google identity. */
const FORBIDDEN_CALLS = [
  'signInWithPassword',
  'signUp',
  'signInWithOtp',
  'verifyOtp',
  'resetPasswordForEmail',
  'signInAnonymously',
  'signInWithSSO',
  'linkIdentity',
];

/** The only Supabase Auth entry points sign-in may use: Google through the browser (PKCE) or the native ID token. */
const ALLOWED_SIGN_IN = new Set(['signInWithOAuth', 'signInWithIdToken', 'exchangeCodeForSession']);

describe('Google-only sign-in', () => {
  it('no app code calls an email, password, OTP or anonymous Supabase Auth method', () => {
    const hits: string[] = [];
    for (const file of APP_FILES) {
      const text = readFileSync(file, 'utf8');
      for (const call of FORBIDDEN_CALLS) {
        if (new RegExp(`\\.${call}\\s*\\(`).test(text)) hits.push(`${relative(ROOT, file)}: ${call}`);
      }
      if (/updateUser\s*\(\s*\{[^}]*password/.test(text)) hits.push(`${relative(ROOT, file)}: updateUser(password)`);
    }
    assert.deepEqual(hits, []);
  });

  it('every sign-in call is a Google one', () => {
    const used = new Set<string>();
    for (const file of APP_FILES) {
      for (const m of readFileSync(file, 'utf8').matchAll(/auth\.(signIn\w*|exchangeCodeForSession)\s*\(/g)) used.add(m[1]);
    }
    assert.ok(used.size > 0, 'expected the Google sign-in calls to be found');
    for (const call of used) assert.ok(ALLOWED_SIGN_IN.has(call), `unexpected sign-in method ${call}`);
  });

  it('no screen asks for a password or tells the player to check their email', () => {
    const hits: string[] = [];
    for (const file of APP_FILES) {
      if (file.includes(`${join('src', 'observability')}`)) continue; // the redaction list names "password" on purpose
      const text = readFileSync(file, 'utf8');
      if (/secureTextEntry|textContentType=["']password|autoComplete=["'](current-|new-)?password/.test(text)) {
        hits.push(`${relative(ROOT, file)}: password field`);
      }
      if (/check your (email|inbox)|magic link|forgot (your )?password|reset (your )?password|verify your email/i.test(text)) {
        hits.push(`${relative(ROOT, file)}: email-auth copy`);
      }
    }
    assert.deepEqual(hits, []);
  });

  it('there is no route for email sign-up, password reset or email confirmation', () => {
    const routes = sources(join(ROOT, 'app')).map((f) => relative(join(ROOT, 'app'), f).replaceAll('\\', '/'));
    const bad = routes.filter((r) => /sign-?up|register|password|reset|verify|confirm|magic|otp/i.test(r));
    assert.deepEqual(bad, []);
  });

  it('local Supabase config: anonymous sign-ins and email sign-ups off, Google on with the nonce check', () => {
    const toml = readFileSync(join(ROOT, 'supabase', 'config.toml'), 'utf8');
    const section = (name: string) => {
      const start = toml.indexOf(`[${name}]`);
      assert.ok(start >= 0, `missing [${name}]`);
      const rest = toml.slice(start + name.length + 2);
      const end = rest.search(/^\[/m);
      return end < 0 ? rest : rest.slice(0, end);
    };
    assert.match(section('auth'), /^enable_anonymous_sign_ins\s*=\s*false/m);
    assert.match(section('auth.email'), /^enable_signup\s*=\s*false/m);
    assert.match(section('auth.external.google'), /^enabled\s*=\s*true/m);
    assert.match(section('auth.external.google'), /^skip_nonce_check\s*=\s*false/m);
    assert.doesNotMatch(toml, /^\[auth\.sms\][^[]*^enable_signup\s*=\s*true/ms);
  });
});
