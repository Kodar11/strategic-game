/**
 * Every word of the first-session flow, in one place, so the copy can be rewritten without touching a screen.
 *
 * Rules for this copy (see docs/ONBOARDING.md and docs/DECISIONS.md):
 * - No statistics about other players unless they come from real data. The Host guesses; it never says "7 in 10".
 * - No "brain score", IQ or cognitive-benefit claims. We talk about reading people and spotting traps.
 * - The fair answers must stay true. Change them the day billing, ads or accounts change.
 */
import type { GoalId } from '@/src/features/learning/records';

import type { DailyMinutes, Hand } from './flow';

export const SCRIPT = {
  envelope: {
    kicker: 'Before we begin',
    host: 'I’ve already written down what you’ll do. Sealed. No changing it.',
    setup: 'You and Maya each choose in secret. Share, or take.',
    sealed: 'The Host’s prediction',
    prompt: 'What do you do?',
    revealYou: 'You',
    revealMaya: 'Maya',
    opened: 'The envelope says',
    right: 'Exactly what I wrote. You’re readable. For now.',
    wrong: 'Not what I wrote. You’re harder to read than you look.',
    mayaWhy: 'Maya plays only for her own coins, and taking pays her more whatever you do. She never needed to guess.',
    next: 'Your turn to read me',
  },
  read: {
    kicker: 'Your turn',
    host: 'I have a habit. Find it, and beat me three times.',
    history: 'My last moves',
    hint: 'Hint: look at the order of my moves.',
    solved: 'You found it. Rock, Paper, Scissors, again and again. That is reading an opponent.',
    revealed: 'My habit: Rock, Paper, Scissors, always in that order. Now you know what to look for.',
    after: 'Your first real opponents hide their habits better than I did.',
    next: 'What was all that?',
  },
  meaning: {
    kicker: 'What you just did',
    title: 'You read a person, and got read back.',
    scenes: [
      { icon: 'split', place: 'Splitting a bill. A group project.', idea: 'Share or take. Trust pays only when it comes back.' },
      { icon: 'deal', place: 'Asking for a raise. Haggling at a market.', idea: 'Know what the other side will accept before you ask.' },
      { icon: 'read', place: 'Any rivalry, from the cricket ground to the office.', idea: 'Spot the habit before they change it.' },
    ],
    promise: (app: string) => `${app} trains how you think when someone else is thinking too.`,
    next: 'That’s for me',
  },
  goal: {
    kicker: 'Make it yours',
    title: 'What do you want to get sharper at?',
    options: [
      { id: 'anticipating', icon: 'read', label: 'Reading people', detail: 'See the next move before it’s made.' },
      { id: 'incentives', icon: 'deal', label: 'Negotiating', detail: 'Know what the other side really wants.' },
      { id: 'coordination', icon: 'split', label: 'Trust and teamwork', detail: 'When to cooperate, and when not to.' },
      { id: 'uncertainty', icon: 'pressure', label: 'Decisions under pressure', detail: 'Choose well when you can’t be sure.' },
      { id: 'none', icon: 'games', label: 'I just love strategy games', detail: 'Bring on the rivals.' },
    ] satisfies { id: GoalId; icon: string; label: string; detail: string }[],
    timeTitle: 'How much time a day?',
    minutes: { 2: '2 min', 5: '5 min', 10: '10+ min' } satisfies Record<DailyMinutes, string>,
    next: 'Continue',
  },
  table: {
    kicker: 'Season 1',
    title: 'Meet the table.',
    host: 'Five rivals. Each one plays a real trick. Beat all five, and you face me.',
    pathTitle: 'Your season',
    path: [
      { label: 'Qualifiers', detail: '3 quick matches' },
      { label: 'Five rivals', detail: 'One trick each' },
      { label: 'The Final', detail: 'Against the Host' },
    ],
    afterPath: 'Clear the season and the Gauntlet opens.',
    alsoTitle: 'Also inside',
    next: 'Almost there',
  },
  plan: {
    kicker: 'Fair questions',
    faq: [
      { q: 'Is it free?', a: 'Yes. Everything you’ve seen is free to play.' },
      { q: 'Ads?', a: 'None. Not now, not later.' },
      { q: 'Do I need an account?', a: 'No. Play as a guest. Sign in with Google only to keep your progress across phones and join leaderboards.' },
      { q: 'Is there maths?', a: 'No formulas. It’s about people and choices.' },
      { q: 'What about my data?', a: 'Your progress stays on this phone unless you sign in. Usage stats are shared only if you say yes.' },
    ],
    weekTitle: 'Your first week',
    pace: (m: DailyMinutes) => (m >= 10 ? 'Your pace: 10 minutes or more a day.' : `Your pace: about ${m} minutes a day.`),
    start: 'Enter the Qualifiers',
    explore: 'Look around first',
    done: 'Back to the app',
  },
  skip: 'Skip',
  back: 'Back',
} as const;

export const HAND_LABEL: Record<Hand, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
