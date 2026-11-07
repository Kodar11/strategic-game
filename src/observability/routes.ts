import type { ScreenName } from './events.ts';

/**
 * Expo Router route → stable screen name. Only routes listed here are tracked; everything else (the callback route,
 * not-found, modals inside flows) is ignored. Dynamic segments become properties, and only the ones named here — a
 * friend-challenge token, a match id or any query parameter never leaves the device.
 *
 * Input is `useSegments()` (e.g. `['(tabs)', 'games']`, `['lesson', '[lessonId]']`) plus the route's params.
 */

interface RouteSpec {
  screen: ScreenName;
  /** Route param → event property. Values must still pass the `id` rule. */
  params?: Readonly<Record<string, 'lesson_id' | 'scenario_id' | 'assessment_id' | 'game_id' | 'story_id'>>;
}

const ROUTES: Readonly<Record<string, RouteSpec>> = {
  '': { screen: 'home' },
  lessons: { screen: 'learn' },
  games: { screen: 'games' },
  'tournament/[stageId]': { screen: 'tournament_stage' },
  'tournament/match/[matchId]': { screen: 'tournament_match' },
  'tournament/check/[stageId]': { screen: 'tournament_check' },
  'tournament/cards': { screen: 'tournament_cards' },
  'tournament/mind-check': { screen: 'mind_check' },
  profile: { screen: 'profile' },
  onboarding: { screen: 'onboarding' },
  'lesson/[lessonId]': { screen: 'lesson', params: { lessonId: 'lesson_id' } },
  'scenario/[scenarioId]': { screen: 'scenario', params: { scenarioId: 'scenario_id' } },
  challenges: { screen: 'practice_challenges' },
  'challenges/[lessonId]': { screen: 'practice_challenges', params: { lessonId: 'lesson_id' } },
  'checkpoint/[assessmentId]': { screen: 'checkpoint', params: { assessmentId: 'assessment_id' } },
  daily: { screen: 'daily' },
  'daily/play': { screen: 'daily_play' },
  'daily/leaderboard': { screen: 'daily_leaderboard' },
  'daily/history': { screen: 'daily_history' },
  'games/[gameId]': { screen: 'game_setup', params: { gameId: 'game_id' } },
  'arena/[gameId]': { screen: 'game_setup', params: { gameId: 'game_id' } },
  'games/play': { screen: 'match', params: { game: 'game_id' } },
  'arena/play': { screen: 'match', params: { game: 'game_id' } },
  'games/ranked': { screen: 'ranked_match' },
  'challenge/[token]': { screen: 'friend_challenge' },
  leaderboard: { screen: 'leaderboard' },
  competitions: { screen: 'competitions' },
  'competitions/[id]': { screen: 'competition' },
  'story/[storyId]': { screen: 'story', params: { storyId: 'story_id' } },
  settings: { screen: 'settings' },
  about: { screen: 'about' },
  licenses: { screen: 'licenses' },
  report: { screen: 'profile_report' },
  'report/[skill]': { screen: 'profile_area' },
  'report/history': { screen: 'profile_history' },
  nickname: { screen: 'nickname' },
  'sign-in': { screen: 'sign_in' },
};

export interface ScreenView {
  screen: ScreenName;
  props: Record<string, string>;
  /** Identifies one screen instance: a change of screen or of its id-properties is a new view. */
  key: string;
}

const ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/i;

export function routeKey(segments: readonly string[]): string {
  return segments.filter((s) => !(s.startsWith('(') && s.endsWith(')')) && s !== 'index').join('/');
}

export function screenOf(segments: readonly string[], params: Readonly<Record<string, unknown>>): ScreenView | null {
  const spec = ROUTES[routeKey(segments)];
  if (!spec) return null;
  const props: Record<string, string> = {};
  for (const [param, prop] of Object.entries(spec.params ?? {})) {
    const v = params[param];
    if (typeof v === 'string' && ID.test(v)) props[prop] = v;
  }
  return { screen: spec.screen, props, key: [spec.screen, ...Object.values(props)].join('|') };
}
