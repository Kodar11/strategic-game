import type { PropSpec } from './events.ts';

/**
 * What may leave the device. Every property is checked twice: against the event's allow-list (events.ts), and
 * against these global rules, so a property that is allowed by name still can't carry the wrong kind of value.
 *
 * A property is sent only if it is (1) listed for that event, (2) not on the banned list below, and (3) a value of the
 * listed type: a slug-like id, an integer, a boolean or one of the listed enum values. Objects, arrays, long strings
 * and free text never pass, whatever their name.
 */

/**
 * Names that are never sent, in any event, error context or person property — even if an event spec listed one by
 * mistake (a test checks that none does). Compared case-insensitively, and as a substring for the multi-word ones.
 */
export const BANNED_KEYS: readonly string[] = [
  'email',
  'name',
  'token',
  'password',
  'answer',
  'option',
  'confidence',
  'text',
  'reflection',
  'nickname',
  'seed',
  'persona',
  'opponent',
  'bot',
  'prediction',
  'guess',
  'choices',
  'hidden',
  'role',
  'mole',
  'saboteur',
  'state',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'secret',
  'key',
  'jwt',
  'session_token',
  'request_body',
  'response_body',
  'body',
  'detail',
  'url',
  'query',
  'phone',
  'address',
];

/** Exceptions to the substring rule: names that contain a banned word but are defined and safe. */
const SAFE_NAMES: ReadonlySet<string> = new Set(['game_id', 'lesson_id', 'scenario_id', 'story_id', 'assessment_id', 'ending_id', 'product_id']);

export function isBannedKey(key: string): boolean {
  const k = key.toLowerCase();
  if (SAFE_NAMES.has(k)) return false;
  return BANNED_KEYS.some((b) => k === b || k.split('_').includes(b) || (b.includes('_') && k.includes(b)));
}

/** A slug-like identifier: what an `id` property may hold. No spaces, so no sentences; no `@`, so no emails. */
const ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/i;
/** Keeps a long digit run (an account number, a phone number) out of ids. */
const LONG_DIGITS = /\d{9,}/;

export function validValue(spec: PropSpec, v: unknown): boolean {
  if (spec === 'id') return typeof v === 'string' && ID.test(v) && !LONG_DIGITS.test(v);
  if (spec === 'int') return typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= 1e9;
  if (spec === 'bool') return typeof v === 'boolean';
  return typeof v === 'string' && spec.includes(v);
}

export type Primitive = string | number | boolean;

export interface Cleaned {
  props: Record<string, Primitive>;
  /** Names dropped, with why: for tests and development warnings. Never sent. */
  dropped: string[];
}

/** Apply the allow-list and the global rules. Never throws. */
export function cleanProps(spec: Readonly<Record<string, PropSpec>>, input: unknown): Cleaned {
  const props: Record<string, Primitive> = {};
  const dropped: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { props, dropped };
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    if (isBannedKey(k)) {
      dropped.push(`${k}: banned`);
      continue;
    }
    const s = spec[k];
    if (!s) {
      dropped.push(`${k}: not in the catalogue`);
      continue;
    }
    if (!validValue(s, v)) {
      dropped.push(`${k}: invalid value`);
      continue;
    }
    props[k] = v as Primitive;
  }
  return { props, dropped };
}

/** The context an error report may carry (errors.ts). Same rules as event properties. */
export const ERROR_CONTEXT: Readonly<Record<string, PropSpec>> = {
  route: 'id',
  operation: 'id',
  rpc: 'id',
  error_code: 'id',
  refusal: 'id',
  http_status: 'int',
  game_id: 'id',
  lesson_id: 'id',
  scenario_id: 'id',
  story_id: 'id',
  sync_phase: 'id',
  stuck_minutes: 'int',
  attempt_number: 'int',
};

/**
 * An error message as it may be sent: one line, ≤ 160 characters, with anything that looks like an email, a token, a
 * long number or a URL query removed. Messages in this app are written for players or are codes, but a library error
 * can quote input, so they are scrubbed regardless.
 */
export function scrubMessage(message: string): string {
  return message
    .replace(/\s+/g, ' ')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]')
    .replace(/\b(?:sb_|phc_|phx_|sk_|pk_)[\w-]+/g, '[key]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]')
    .replace(/\d{9,}/g, '[number]')
    .replace(/\?[^\s]*/g, '?[query]')
    .trim()
    .slice(0, 160);
}
