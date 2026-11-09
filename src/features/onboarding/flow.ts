/**
 * The first-session flow ("The First Read"), as pure data and pure functions so the tests can check every rule:
 *
 * 1. envelope: the Host seals a prediction, the player plays one Share-or-Take round against Maya (dilemma.ts),
 *    then the envelope opens.
 * 2. read: the player reads the Host back: a short Rock-Paper-Scissors run where the Host has one plain habit.
 * 3. meaning: what they just did, named and placed in everyday life.
 * 4. goal: what they want to get sharper at (the existing learning goal) and how long a day.
 * 5. table: the five rivals and the season path.
 * 6. plan: straight answers to the usual doubts, a first week, and the first Qualifier.
 *
 * No randomness anywhere: the same taps always give the same screens. Nothing here reads or writes saved progress.
 */
import type { GoalId } from '@/src/features/learning/records';

import type { Move } from './dilemma';

export const STEPS = ['envelope', 'read', 'meaning', 'goal', 'table', 'plan'] as const;
export type Step = (typeof STEPS)[number];

export const stepIndex = (s: Step) => STEPS.indexOf(s);
export const nextStep = (s: Step): Step => STEPS[Math.min(stepIndex(s) + 1, STEPS.length - 1)];
export const previousStep = (s: Step): Step | null => (stepIndex(s) > 0 ? STEPS[stepIndex(s) - 1] : null);
export const isStep = (x: unknown): x is Step => typeof x === 'string' && (STEPS as readonly string[]).includes(x);

// ── 1. The envelope ──────────────────────────────────────────────────────────

/**
 * What the Host writes down before the player chooses. Fixed, and written before any tap, so it can't depend on the
 * choice. It is a guess, not a statistic: the Host never claims how many players do what.
 */
export const HOST_PREDICTION: Move = 'share';

export const predictionRight = (choice: Move) => choice === HOST_PREDICTION;

// ── 2. The read ──────────────────────────────────────────────────────────────

export type Hand = 'rock' | 'paper' | 'scissors';
export const HANDS: readonly Hand[] = ['rock', 'paper', 'scissors'];

/** The Host's habit: Rock, Paper, Scissors, in that order, again and again. */
export const hostHand = (round: number): Hand => HANDS[round % HANDS.length];

/** BEATS[a] is the hand that `a` beats. */
const BEATS: Record<Hand, Hand> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

export type RoundResult = 'win' | 'loss' | 'draw';

export function resultOf(you: Hand, host: Hand): RoundResult {
  if (you === host) return 'draw';
  return BEATS[you] === host ? 'win' : 'loss';
}

/** The hand that beats `h`. */
export const counterTo = (h: Hand): Hand => HANDS.find((x) => BEATS[x] === h)!;

/** Wins needed to "find the habit", and the most rounds before the Host gives the habit away. */
export const READ_TARGET = 3;
export const READ_MAX_ROUNDS = 6;

export interface ReadRound {
  you: Hand;
  host: Hand;
  result: RoundResult;
}

export const winsOf = (rounds: readonly ReadRound[]) => rounds.filter((r) => r.result === 'win').length;

export type ReadStatus = 'playing' | 'solved' | 'revealed';

export function readStatus(rounds: readonly ReadRound[]): ReadStatus {
  if (winsOf(rounds) >= READ_TARGET) return 'solved';
  return rounds.length >= READ_MAX_ROUNDS ? 'revealed' : 'playing';
}

/** Play one round. Ignored once the run is over. */
export function playRead(rounds: readonly ReadRound[], you: Hand): ReadRound[] {
  if (readStatus(rounds) !== 'playing') return [...rounds];
  const host = hostHand(rounds.length);
  return [...rounds, { you, host, result: resultOf(you, host) }];
}

/** A nudge once two rounds have gone by without a run of wins: look at the order. */
export function showHint(rounds: readonly ReadRound[]): boolean {
  if (readStatus(rounds) !== 'playing' || rounds.length < 2) return false;
  const last = rounds.slice(-2);
  return !last.every((r) => r.result === 'win');
}

// ── 4. The goal ──────────────────────────────────────────────────────────────

export const DAILY_MINUTES = [2, 5, 10] as const;
export type DailyMinutes = (typeof DAILY_MINUTES)[number];
export const isMinutes = (x: unknown): x is DailyMinutes => (DAILY_MINUTES as readonly unknown[]).includes(x);

export const GOAL_IDS = ['anticipating', 'incentives', 'coordination', 'uncertainty', 'none'] as const satisfies readonly GoalId[];
export const isGoal = (x: unknown): x is GoalId => (GOAL_IDS as readonly unknown[]).includes(x);

// ── 6. The plan ──────────────────────────────────────────────────────────────

export interface PlanDay {
  when: string;
  title: string;
  detail: string;
}

/**
 * The first week, from what the player said and what the season holds. `rival` is the first arc's rival (opened by
 * clearing the Qualifiers); `lesson` is the lesson that matches the goal. Every day points to something that exists.
 */
export function firstWeek(p: { minutes: DailyMinutes | null; rival: string; lesson?: { title: string } }): PlanDay[] {
  const minutes = p.minutes ?? 5;
  const days: PlanDay[] = [
    { when: 'Today', title: 'The Qualifiers', detail: 'Three quick matches against hidden opponents. Read them to earn a star.' },
    {
      when: 'Tomorrow',
      title: minutes <= 2 ? 'Your Daily' : `Your Daily, then ${p.rival}`,
      detail: minutes <= 2 ? 'One short challenge, new every day.' : 'A short daily challenge, then the first rival of the season.',
    },
  ];
  if (p.lesson) days.push({ when: 'Day 3', title: p.lesson.title, detail: 'The idea behind what you want to get better at, in a few minutes.' });
  return days;
}

// ── Saved place (so a closed app resumes the welcome where it was) ──────────

export interface SavedFlow {
  step: Step;
  choice: Move | null;
  readSolved: boolean | null;
  goal: GoalId | null;
  minutes: DailyMinutes | null;
  skipped: boolean;
}

export const EMPTY_FLOW: SavedFlow = { step: 'envelope', choice: null, readSolved: null, goal: null, minutes: null, skipped: false };

/** A saved place from storage, or the start when it is missing or malformed. */
export function parseFlow(raw: string | null): SavedFlow {
  if (!raw) return EMPTY_FLOW;
  try {
    const x = JSON.parse(raw) as Record<string, unknown>;
    return {
      step: isStep(x.step) ? x.step : 'envelope',
      choice: x.choice === 'share' || x.choice === 'take' ? x.choice : null,
      readSolved: typeof x.readSolved === 'boolean' ? x.readSolved : null,
      goal: isGoal(x.goal) ? x.goal : null,
      minutes: isMinutes(x.minutes) ? x.minutes : null,
      skipped: x.skipped === true,
    };
  } catch {
    return EMPTY_FLOW;
  }
}
