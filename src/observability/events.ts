/**
 * The analytics event catalogue: every product event Tactiqo may send, its allowed properties, when it fires and its
 * privacy class. Nothing else can be sent — `track()` (core.ts) refuses an unknown event and drops any property that
 * isn't listed here for that event, after the global privacy checks in privacy.ts.
 *
 * Rules for adding an event (see docs/OBSERVABILITY.md):
 * - It answers a product or reliability question nobody can answer from what already exists.
 * - It fires at one semantic boundary, once (completion events never repeat for one run).
 * - Its properties are identifiers, enums, counts, durations or booleans. Never answers, confidence ratings, free
 *   text, nicknames, emails, seeds, hidden roles or a mystery opponent's identity. Supabase keeps the learning record;
 *   PostHog only sees behaviour.
 * - A replay, a "rate" or a funnel is derived from these events in PostHog, not sent as an event of its own.
 *
 * Privacy classes: `behaviour` (what someone did in the app, pseudonymous), `account` (sign-in lifecycle; no identity
 * data), `performance` (timings). `reserved` events are defined for billing and must not be sent before it exists.
 */

/** How one property may look. `id`: a slug-like identifier (lowercase letters, digits, `.`, `_`, `-`, `:`, ≤ 64). */
export type PropSpec = 'id' | 'int' | 'bool' | readonly string[];

export type PrivacyClass = 'behaviour' | 'account' | 'performance' | 'reserved';

export interface EventSpec {
  /** When it fires, exactly. */
  readonly trigger: string;
  readonly privacy: PrivacyClass;
  readonly props: Readonly<Record<string, PropSpec>>;
}

const ONBOARDING_STEP = ['welcome', 'decision', 'reveal', 'map'] as const;
const GAME_SYSTEM = ['classic', 'arena'] as const;
/** Every way a match is played today: on the device, Game of the Week (server), a friend's challenge link (server). */
const GAME_MODE = ['practice', 'ranked', 'friend'] as const;
const OUTCOME = ['win', 'draw', 'loss'] as const;
const SCORE_BAND = ['0-39', '40-59', '60-79', '80-100'] as const;
const PERIOD = ['monthly', 'annual'] as const;

/** The properties that describe a match, shared by the game_* events. */
const MATCH = {
  game_id: 'id',
  system: GAME_SYSTEM,
  mode: GAME_MODE,
  level: 'id',
  variant: 'id',
  length: 'id',
  /** The opponent was hidden at the start ("mystery" practice). Never which opponent it was. */
  mystery: 'bool',
  /** The match was already under way when this screen opened it (a resumed server match). */
  resumed: 'bool',
  /** Game of the Week: which of the week's ranked attempts this is. */
  attempt_number: 'int',
} as const satisfies Record<string, PropSpec>;

const LESSON = { lesson_id: 'id', lesson_number: 'int', module: 'id' } as const satisfies Record<string, PropSpec>;

export const EVENTS = {
  // ── Onboarding ──────────────────────────────────────────────────────────────────────────────────────────────────
  onboarding_step: {
    trigger: 'A stage of the welcome flow is shown (welcome, the decision against Maya, the reveal, the map of the app).',
    privacy: 'behaviour',
    props: { step: ONBOARDING_STEP, replay: 'bool' },
  },
  onboarding_finished: {
    trigger: 'The welcome flow ends: completed from the map, or skipped at any stage.',
    privacy: 'behaviour',
    props: {
      result: ['completed', 'skipped'],
      at_step: ONBOARDING_STEP,
      /** The first decision's move. A move in a toy game, not a learning record. */
      choice: ['share', 'take'],
      next: ['lesson', 'explore'],
      replay: 'bool',
    },
  },

  // ── Learning ────────────────────────────────────────────────────────────────────────────────────────────────────
  lesson_started: {
    trigger: 'A lesson screen opens a run (first open, resume, or a replay started with Restart).',
    privacy: 'behaviour',
    props: { ...LESSON, is_replay: 'bool', resumed: 'bool', source: 'id' },
  },
  lesson_completed: {
    trigger: 'The lesson reaches its completion step. Once per run.',
    privacy: 'behaviour',
    props: { ...LESSON, is_replay: 'bool', duration_s: 'int' },
  },
  lesson_exited: {
    trigger: 'The lesson screen closes before its completion step (the resume point is kept).',
    privacy: 'behaviour',
    props: { ...LESSON, step: 'int', total_steps: 'int', duration_s: 'int' },
  },
  scenario_completed: {
    trigger: 'A practice scenario reaches its result. No prediction, answer or verdict is sent.',
    privacy: 'behaviour',
    props: { scenario_id: 'id', lesson_id: 'id', slot: ['A', 'B', 'C'], is_replay: 'bool' },
  },
  checkpoint_submitted: {
    trigger: 'A checkpoint (module assessment or the final) is submitted.',
    privacy: 'behaviour',
    props: { assessment_id: 'id', passed: 'bool', score_band: SCORE_BAND, attempt_number: 'int' },
  },

  // ── Games: one family for all 23 games and every mode ──────────────────────────────────────────────────────────
  game_started: {
    trigger: 'A match screen starts a match, or opens a server match still in progress (resumed).',
    privacy: 'behaviour',
    props: MATCH,
  },
  game_finished: {
    trigger: 'The match result is shown. Once per match.',
    privacy: 'behaviour',
    props: { ...MATCH, outcome: OUTCOME, rounds: 'int', duration_s: 'int' },
  },
  game_exited: {
    trigger: 'The match screen closes before the result (a server match can be resumed later).',
    privacy: 'behaviour',
    props: { ...MATCH, round: 'int', rounds_total: 'int', duration_s: 'int' },
  },
  reflection_link_opened: {
    trigger: 'A post-game reflection’s link to its lesson is tapped (the game → lesson loop).',
    privacy: 'behaviour',
    props: { game_id: 'id', lesson_id: 'id' },
  },

  // ── Daily Challenge (Game of the Week uses the game_* events with mode "ranked") ────────────────────────────────
  daily_submitted: {
    trigger: 'A Daily Challenge answer is checked: the official answer (recorded on the server) or a practice answer.',
    privacy: 'behaviour',
    props: { challenge_date: 'id', official: 'bool', format: 'id', result: ['recorded', 'existing', 'practice'] },
  },

  // ── Stories ─────────────────────────────────────────────────────────────────────────────────────────────────────
  story_started: {
    trigger: 'A story screen opens (new, or resuming a saved position).',
    privacy: 'behaviour',
    props: { story_id: 'id', resumed: 'bool' },
  },
  story_finished: {
    trigger: 'A story reaches an ending and opens its reflection. Once per run.',
    privacy: 'behaviour',
    props: { story_id: 'id', ending_id: 'id', finish_number: 'int' },
  },

  // ── Social ──────────────────────────────────────────────────────────────────────────────────────────────────────
  challenge_link_created: { trigger: 'A friend-challenge link is created.', privacy: 'behaviour', props: { game_id: 'id' } },
  challenge_link_opened: { trigger: 'A friend-challenge link opens and loads.', privacy: 'behaviour', props: { game_id: 'id' } },
  nickname_set: { trigger: 'A nickname is saved. The nickname itself is never sent.', privacy: 'behaviour', props: {} },

  // ── Account ─────────────────────────────────────────────────────────────────────────────────────────────────────
  sign_in_started: {
    trigger: '“Continue with Google” is tapped.',
    privacy: 'account',
    props: { source: 'id' },
  },
  sign_in_finished: {
    trigger: 'A sign-in attempt ends: success, cancelled by the player, or failed.',
    privacy: 'account',
    props: { source: 'id', result: ['success', 'cancelled', 'failed'], is_new_account: 'bool', method: ['browser', 'native'] },
  },
  sign_in_invite_dismissed: { trigger: '“Not now” on the Learn tab’s sign-in invitation.', privacy: 'account', props: {} },
  signed_out: { trigger: 'The player signs out (forced: they chose to drop unsent changes).', privacy: 'account', props: { forced: 'bool' } },
  // Sent AFTER the identity is reset, as an anonymous event, so it can't re-create the deleted account's PostHog person.
  account_deleted: { trigger: 'The server confirmed the account deletion; sent anonymously once the identity is reset.', privacy: 'account', props: {} },

  // ── Performance ─────────────────────────────────────────────────────────────────────────────────────────────────
  app_ready: {
    trigger: 'Cold start finished: content and progress loaded (ready) or the start-up error screen shown (error).',
    privacy: 'performance',
    props: { total_ms: 'int', catalog_ms: 'int', categories_ms: 'int', result: ['ready', 'error'], error_kind: 'id', signed_in: 'bool', onboarded: 'bool', content_source: ['cache', 'network', 'bundled'], session_verified: 'bool' },
  },

  // ── Billing: reserved. Defined so the schema is reviewed now; never sent until billing exists. Purchases,
  // renewals, cancellations and refunds must come from the store/RevenueCat on the server, not from the app. ─────────
  paywall_viewed: { trigger: 'Reserved.', privacy: 'reserved', props: { placement: 'id', trigger: 'id' } },
  plan_selected: { trigger: 'Reserved.', privacy: 'reserved', props: { product_id: 'id', period: PERIOD } },
  checkout_started: { trigger: 'Reserved.', privacy: 'reserved', props: { product_id: 'id', period: PERIOD } },
  checkout_result: {
    trigger: 'Reserved. The store’s answer as the app saw it — never the source of truth for revenue.',
    privacy: 'reserved',
    props: { product_id: 'id', period: PERIOD, result: ['success', 'cancelled', 'failed'], reason: 'id' },
  },
  purchase_restored: { trigger: 'Reserved.', privacy: 'reserved', props: {} },
} as const satisfies Record<string, EventSpec>;

export type EventName = keyof typeof EVENTS;

type ValueOf<S> = S extends 'id' ? string : S extends 'int' ? number : S extends 'bool' ? boolean : S extends readonly (infer U)[] ? U : never;

/** The properties an event accepts, all optional: a value that isn't known is simply left out. */
export type EventProps<E extends EventName> = { [K in keyof (typeof EVENTS)[E]['props']]?: ValueOf<(typeof EVENTS)[E]['props'][K]> };

/** Events the app may send today (reserved billing events are refused until billing exists). */
export function isSendable(name: string): name is EventName {
  return Object.prototype.hasOwnProperty.call(EVENTS, name) && EVENTS[name as EventName].privacy !== 'reserved';
}

/** Normalized screen names: the only values a `$screen` event or a `source` property can carry. */
export const SCREENS = [
  'learn',
  'games',
  'stories',
  'profile',
  'onboarding',
  'lesson',
  'scenario',
  'practice_challenges',
  'checkpoint',
  'daily',
  'daily_play',
  'daily_leaderboard',
  'daily_history',
  'game_setup',
  'match',
  'ranked_match',
  'friend_challenge',
  'leaderboard',
  'competitions',
  'competition',
  'story',
  'settings',
  'about',
  'licenses',
  'profile_report',
  'profile_area',
  'profile_history',
  'nickname',
  'sign_in',
] as const;

export type ScreenName = (typeof SCREENS)[number];
