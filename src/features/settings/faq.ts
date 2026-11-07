import { SUPPORT_EMAIL } from './about.ts';

/**
 * About & Support FAQ. Every answer describes what the app actually does today (checked against the code on
 * 2026-11-06); change an answer when the behaviour changes. Short on purpose: one or two sentences each.
 */
export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export const FAQS: readonly Faq[] = [
  {
    id: 'how',
    question: 'How does Tactiqo work?',
    answer: 'Each lesson puts you in a decision, shows what follows, then explains the idea behind it. Games and stories let you practise the same ideas.',
  },
  {
    id: 'lessons-games',
    question: 'What’s the difference between lessons and games?',
    answer: 'Lessons teach one idea step by step and record your answers. Games are practice against bots: play as often as you like; they don’t change your lesson progress.',
  },
  {
    id: 'rankings',
    question: 'How do rankings work?',
    answer: 'Game of the Week has a weekly leaderboard: your best completed ranked match counts, with a few ranked attempts per week. Practice games never count. The Daily Challenge has its own board. Both need sign-in.',
  },
  {
    id: 'progress',
    question: 'What happens to my progress?',
    answer: 'Signed in, lessons, answers, Daily Challenge history, your nickname and game results are saved to your account. As a guest, progress stays on this phone until you sign in. Story progress and detailed Arena records stay on this phone.',
  },
  {
    id: 'offline',
    question: 'Can I use Tactiqo offline?',
    answer: 'Yes, for lessons, scenarios, practice games, the Arena and stories. Progress is saved on this phone first and sent to your account when you’re back online. Daily Challenge, Game of the Week, leaderboards and sign-in need a connection.',
  },
  {
    id: 'data',
    question: 'What information does Tactiqo collect?',
    answer: 'Your Google account email (for sign-in) and what you save in the app. Usage and crash data only if you choose Share — linked to a random ID, never your name, email, answers, reflections or anything you type.',
  },
  {
    id: 'delete',
    question: 'How can I delete my account?',
    answer: 'Settings → Account → Delete account. Your account and its saved data are deleted at once; analytics data linked to it is deleted by a background process, which can take a few weeks. Can’t use the app? Use the deletion page below.',
  },
  {
    id: 'contact',
    question: 'How can I contact support?',
    answer: `Use Report a problem or Send feedback below. Both open an email to ${SUPPORT_EMAIL} with your app version and device filled in, for you to check before sending.`,
  },
];
