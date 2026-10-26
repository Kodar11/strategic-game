import type { Verdict } from '../../components/lesson/verdict.ts';
import type { LessonId } from '../../content/lessons.ts';
import type { EvaluationBasis, SkillArea } from '../learning/types.ts';

/**
 * Paired-scenario challenges: three short transfer exercises per lesson. Pure data — the shared challenge screen
 * renders them and `evaluation.ts` grades them, so no rule lives in UI code.
 *
 * Every verdict here must follow from the scenario text alone. Where the text can't settle the answer, the
 * challenge is `basis: 'uncertain'` and no option is marked `match`: sensible answers are `reasonable`.
 * Bump a challenge's `version` whenever its scenario or options change meaning, so old records stay interpretable.
 */

export interface ChallengeOption {
  id: string;
  label: string;
  /**
   * `match` the strongest reasoning; `defensible` reasonable but missing something; `depends` rests on an
   * assumption outside the scenario; `reasonable` a sensible call where no answer can be known;
   * `misconception` contradicts the information given.
   */
  verdict: Verdict;
  /** Two or three sentences: what the choice implies, and why. */
  feedback: string;
}

export interface Challenge {
  id: string;
  lesson: LessonId;
  order: 1 | 2 | 3;
  /** Content version; recorded with every attempt. */
  version: number;
  title: string;
  /** Two to four sentences with only what is needed to reason. */
  scenario: string;
  question: string;
  options: readonly ChallengeOption[];
  skill: SkillArea;
  /** The concept from the lesson that this applies, in a few words. */
  concept: string;
  /** What carries over to other situations; shown after any answer. */
  takeaway: string;
  /** 1 = closest to the lesson, 3 = furthest transfer. */
  level: 1 | 2 | 3;
  basis: EvaluationBasis;
}

/** A one-paragraph refresher per lesson, shown after feedback without replaying the lesson. */
export const CONCEPT_REVIEW: Record<LessonId, { concept: string; summary: string }> = {
  'cooperation-trap': {
    concept: 'Dominant strategies and the cooperation trap',
    summary: 'If one choice pays you more whatever the other side does, you will take it — even when both sides holding back would leave everyone better off. Changing the payoffs, not promises, is what moves people out of the trap.',
  },
  'strategy-detective': {
    concept: 'Reasoning about how others reason',
    summary: 'Your best move depends on what others will do, and they are guessing about you too. Model the people you actually face — usually a step or two ahead, rarely all the way — and treat clues as evidence of their thinking, not as facts.',
  },
  'coordination-problem': {
    concept: 'Coordination and focal points',
    summary: 'When several outcomes work as long as everyone matches, the hard part is agreeing which one. Shared history, conventions and clear announcements make one option stand out to everybody.',
  },
  'predictability-trap': {
    concept: 'Predictability and mixed strategies',
    summary: 'Against someone who gains by reading you, a pattern is a weakness, so mix your choices in proportions that leave nothing to exploit. When nobody is trying to read you, there is no reason to randomise.',
  },
  'incentive-shift': {
    concept: 'Changing incentives',
    summary: 'A rule changes behaviour only if it changes which choice pays more — the penalty or reward has to outweigh the gain. And people respond to what is actually rewarded, which is not always what was intended.',
  },
};

export const CHALLENGES: readonly Challenge[] = [
  // ── Lesson 1 · The Cooperation Trap ─────────────────────────────────────────
  {
    id: 'l1.c1.discount-war',
    lesson: 'cooperation-trap',
    order: 1,
    version: 1,
    level: 1,
    title: 'The Discount War',
    scenario:
      'Two bakeries on the same street each choose, without talking, whether to discount this weekend. If both keep normal prices, each makes 6. If only one discounts, it makes 8 and the other makes 2. If both discount, each makes 4.',
    question: 'What will each bakery most likely do?',
    skill: 'anticipating',
    basis: 'calculable',
    concept: 'A choice that pays more whatever the other side does',
    takeaway: 'Compare your payoffs against each of the other side’s choices, not against the outcome you would both prefer.',
    options: [
      {
        id: 'both-discount',
        label: 'Both discount',
        verdict: 'match',
        feedback: 'Discounting pays each bakery 2 more whatever the other does (8 instead of 6, or 4 instead of 2). So both discount and end up with 4 each — less than the 6 they would get by both holding back.',
      },
      {
        id: 'both-hold',
        label: 'Both keep normal prices — that’s better for both',
        verdict: 'misconception',
        feedback: '6 each does beat 4 each, but each bakery only controls its own price. From each seat, discounting pays more whichever choice the other makes, so holding back is fragile.',
      },
      {
        id: 'copy',
        label: 'Each will copy what it expects the other to do',
        verdict: 'misconception',
        feedback: 'Copying only makes sense if the best reply changes with the other’s choice. Here it doesn’t: discounting is better against a discounter and against a non-discounter alike.',
      },
    ],
  },
  {
    id: 'l1.c2.shared-project',
    lesson: 'cooperation-trap',
    order: 2,
    version: 1,
    level: 2,
    title: 'The Shared Project',
    scenario:
      'Two classmates share one grade for a project. Working the weekend raises the shared grade, but costs the worker more than their share of the gain. In points: both work, 2 each; both coast, 0 each; if only one works, the worker gets −1 and the coaster 3.',
    question: 'Your partner promises to work hard. If they only care about their own points, what will they do?',
    skill: 'anticipating',
    basis: 'calculable',
    concept: 'Free-riding is the dominant choice when effort is shared',
    takeaway: 'A promise doesn’t change the payoffs. Ask what the other person gains from each choice — and what would have to change to make keeping the promise pay.',
    options: [
      {
        id: 'coast',
        label: 'Coast',
        verdict: 'match',
        feedback: 'If you work, coasting gives them 3 instead of 2; if you coast, 0 instead of −1. Coasting pays them more either way, so the promise is fragile — unless something outside these points, like working together again, changes their incentives.',
      },
      {
        id: 'keep-promise',
        label: 'Work, because they promised',
        verdict: 'depends',
        feedback: 'Trust, reputation or future projects together can make promises stick — but those are outside these numbers. On the points alone, coasting pays them more whatever you do.',
      },
      {
        id: 'better-together',
        label: 'Work, because both working beats both coasting',
        verdict: 'misconception',
        feedback: 'Both working (2 each) is better for the pair than both coasting (0 each). But each person only chooses their own effort, and coasting scores more for them whichever choice you make.',
      },
    ],
  },
  {
    id: 'l1.c3.changed-reward',
    lesson: 'cooperation-trap',
    order: 3,
    version: 1,
    level: 3,
    title: 'The Changed Reward',
    scenario:
      'Same project, same points: both work, 2 each; both coast, 0 each; a lone worker gets −1 and the coaster 3. Now the teacher adds a bonus of 2 points for anyone whose own contribution is logged.',
    question: 'Does the bonus change what a self-interested partner does?',
    skill: 'incentives',
    basis: 'calculable',
    concept: 'A reward flips the choice only if it outweighs the gain from free-riding',
    takeaway: 'Find the gap that makes the unwanted choice attractive. A reward or penalty works only if it is bigger than that gap.',
    options: [
      {
        id: 'yes',
        label: 'Yes — working now pays more whatever you do',
        verdict: 'match',
        feedback: 'Coasting used to win by 1 point either way (3 vs 2, and 0 vs −1). With the bonus, working gives 4 vs 3 if you work and 1 vs 0 if you coast — the bonus more than covers the gap.',
      },
      {
        id: 'no',
        label: 'No — coasting is still a free ride',
        verdict: 'misconception',
        feedback: 'The free ride is still there, but compare the numbers: working now earns 4 instead of 3 if you work, and 1 instead of 0 if you coast. A bonus of 2 outweighs a 1-point gain from coasting.',
      },
      {
        id: 'only-if-huge',
        label: 'Only if the bonus is bigger than the whole grade',
        verdict: 'misconception',
        feedback: 'The bonus only has to beat the gap between working and coasting — 1 point here — not the whole grade. Anything above that gap flips the choice.',
      },
    ],
  },

  // ── Lesson 2 · The Strategy Detective ───────────────────────────────────────
  {
    id: 'l2.c1.crowded-cafe',
    lesson: 'strategy-detective',
    order: 1,
    version: 1,
    level: 1,
    title: 'The Crowded Café',
    scenario:
      'A café gives a free pastry to its first 20 customers every Saturday from 9:00. Last week the queue started at 8:40 and the pastries were gone by 8:50. Most regulars saw how early the queue formed.',
    question: 'When do you expect the queue to start this Saturday?',
    skill: 'anticipating',
    basis: 'uncertain',
    concept: 'Other people learn from the same evidence you do',
    takeaway: 'When everyone saw the same thing you did, expect them to react to it too — and stay honest about how much you can actually know.',
    options: [
      {
        id: 'earlier',
        label: 'Earlier than 8:40 — regulars will try to beat last week’s queue',
        verdict: 'reasonable',
        feedback: 'A sensible read: the regulars learned what you learned, so some will come earlier. How much earlier depends on how many of them adjust — nothing here can tell you that for sure.',
      },
      {
        id: 'same',
        label: 'About 8:40 again',
        verdict: 'defensible',
        feedback: 'Habits are sticky, so it could happen. But it assumes nobody reacts to last week, when most of them saw the same early queue you did.',
      },
      {
        id: 'nine',
        label: 'At 9:00, when the offer starts',
        verdict: 'misconception',
        feedback: 'That ignores what everyone else is doing: last week the queue formed 20 minutes early and the pastries were gone before 9:00 — and people have only become more aware since.',
      },
    ],
  },
  {
    id: 'l2.c2.lowest-unique',
    lesson: 'strategy-detective',
    order: 2,
    version: 1,
    level: 2,
    title: 'The Second-Order Guess',
    scenario:
      'Twenty coworkers each secretly write a whole number from 1 to 50. The lowest number that nobody else wrote wins a prize. Everyone knows the rule.',
    question: 'Which kind of number gives you the best chance?',
    skill: 'anticipating',
    basis: 'calculable',
    concept: 'Think about what others pick when they are thinking about you',
    takeaway: 'The obvious choice is obvious to everyone. Ask which option others will avoid because they expect it to be crowded — but don’t go so far that you leave the winning range.',
    options: [
      {
        id: 'one',
        label: '1 — it’s the lowest possible',
        verdict: 'misconception',
        feedback: '1 only wins if nobody else picks it, and it is the first number almost everyone considers. That reasoning stops one step short: others had the same thought.',
      },
      {
        id: 'small',
        label: 'A small number that others are likely to skip, like 4 to 8',
        verdict: 'match',
        feedback: 'This goes one step further: many will crowd onto 1, 2 and 3, so a slightly higher number has a better chance of being unique while still being low. It’s a judgement about the crowd, not a guarantee.',
      },
      {
        id: 'big',
        label: 'A big number like 40, which nobody will pick',
        verdict: 'misconception',
        feedback: 'It may well be unique, but it only wins if every lower number is picked more than once. With twenty players and fifty numbers, some lower number is almost certain to be unique.',
      },
    ],
  },
  {
    id: 'l2.c3.misleading-clue',
    lesson: 'strategy-detective',
    order: 3,
    version: 1,
    level: 3,
    title: 'The Misleading Clue',
    scenario:
      'You’re guessing whether your coworkers will pick the taco truck or the noodle truck for lunch; usually it’s close to even. Today Sam, who picks tacos every single day, says loudly: “Everyone’s going for tacos today!”',
    question: 'How much should this change your prediction?',
    skill: 'anticipating',
    basis: 'calculable',
    concept: 'Weigh a clue by what it tells you about other people’s thinking',
    takeaway: 'Ask what a clue really reveals. A loud opinion tells you about the speaker; it tells you about the group only if the group listens to them.',
    options: [
      {
        id: 'certain',
        label: 'A lot — tacos is now almost certain',
        verdict: 'misconception',
        feedback: 'Sam’s statement mostly reveals Sam’s own taste, which you already knew. One confident voice isn’t evidence about what everyone else prefers.',
      },
      {
        id: 'nudge',
        label: 'A little — lean slightly towards tacos at most',
        verdict: 'match',
        feedback: 'Sam would say this on any day, so it adds little information. A small nudge makes sense only if others tend to follow Sam — which is worth checking rather than assuming.',
      },
      {
        id: 'opposite',
        label: 'Switch to noodles — Sam is probably bluffing',
        verdict: 'misconception',
        feedback: 'Nothing suggests Sam is trying to mislead anyone; this is simply Sam’s usual preference. Reading a hidden motive into it is as unsupported as taking it at face value.',
      },
    ],
  },

  // ── Lesson 3 · The Coordination Problem ─────────────────────────────────────
  {
    id: 'l3.c1.meetup-point',
    lesson: 'coordination-problem',
    order: 1,
    version: 1,
    level: 1,
    title: 'The Meetup Point',
    scenario:
      'You and a colleague lose each other in a huge conference centre, and both phones are dead. The lobby has a café you like, the main entrance and an information desk under a big sign. You would both rather meet anywhere than keep searching.',
    question: 'Where do you go?',
    skill: 'coordination',
    basis: 'calculable',
    concept: 'Pick the option that stands out to both of you',
    takeaway: 'When any meeting point works, choose the one the other person expects you to expect — not simply your own favourite.',
    options: [
      {
        id: 'info-desk',
        label: 'The information desk under the big sign',
        verdict: 'match',
        feedback: 'It is the most prominent spot, and your colleague knows you know that. Any place works if you both choose it — this one is the most likely to be chosen by both.',
      },
      {
        id: 'cafe',
        label: 'The café — you’d enjoy waiting there',
        verdict: 'defensible',
        feedback: 'If your colleague would also think of the café, it works. But nothing marks it out for both of you; your preference alone isn’t a shared signal.',
      },
      {
        id: 'search',
        label: 'Keep walking around looking for them',
        verdict: 'misconception',
        feedback: 'If you both move, you can keep missing each other. Stopping at a spot you both expect is what makes meeting likely.',
      },
    ],
  },
  {
    id: 'l3.c2.two-standards',
    lesson: 'coordination-problem',
    order: 2,
    version: 1,
    level: 2,
    title: 'Two Useful Standards',
    scenario:
      'Two teams are merging their shared spreadsheets. One team writes dates as day/month, the other as month/day. Either format works perfectly well, as long as everyone uses the same one; mixing them makes dates get misread.',
    question: 'What should the merged team do?',
    skill: 'coordination',
    basis: 'calculable',
    concept: 'Several outcomes work; matching is what matters',
    takeaway: 'When there are several good standards, the value is in agreeing. A clear, public choice usually beats a perfect one.',
    options: [
      {
        id: 'announce',
        label: 'Announce one format — either is fine — and stick to it',
        verdict: 'match',
        feedback: 'Both formats are good outcomes as long as everyone matches. A public announcement gives everyone the same expectation at once, which is exactly what a coordination problem needs.',
      },
      {
        id: 'bigger-team',
        label: 'Use whichever format the bigger team already uses',
        verdict: 'defensible',
        feedback: 'A sensible tie-breaker that makes one option stand out. It works if everyone knows which team is bigger and expects the others to follow the same rule — so it still helps to say it out loud.',
      },
      {
        id: 'keep-both',
        label: 'Let each team keep its own format',
        verdict: 'misconception',
        feedback: 'Mixed formats are the one outcome everyone wanted to avoid: dates like 03/04 get misread. Either format is better than both.',
      },
    ],
  },
  {
    id: 'l3.c3.unusual-option',
    lesson: 'coordination-problem',
    order: 3,
    version: 1,
    level: 3,
    title: 'The Unusual Option',
    scenario:
      'You and a friend get separated at a festival with no signal. You usually meet at the main stage, but tonight it is packed and hard to reach. Last year you both agreed: “If we ever lose each other, meet at the red food truck.”',
    question: 'Where do you go?',
    skill: 'coordination',
    basis: 'calculable',
    concept: 'A less obvious option works when you both have a shared reason to expect it',
    takeaway: 'The best meeting point isn’t always the most famous one. A reason you both share — an agreement, a history — can make an unusual option the obvious one.',
    options: [
      {
        id: 'food-truck',
        label: 'The red food truck',
        verdict: 'match',
        feedback: 'You both remember the agreement, and you both know the stage is hard to reach tonight. That shared reason makes the truck the option each of you expects the other to choose.',
      },
      {
        id: 'main-stage',
        label: 'The main stage — it’s where you always meet',
        verdict: 'defensible',
        feedback: 'The usual spot still stands out, so it could work. But you share a specific backup plan for exactly this situation, and the crowd makes the stage a worse bet tonight.',
      },
      {
        id: 'exit',
        label: 'The nearest exit',
        verdict: 'misconception',
        feedback: 'Nothing gives your friend a reason to pick the same exit. A meeting point only works if you both expect it.',
      },
    ],
  },

  // ── Lesson 4 · The Predictability Trap ──────────────────────────────────────
  {
    id: 'l4.c1.repeated-defender',
    lesson: 'predictability-trap',
    order: 1,
    version: 1,
    level: 1,
    title: 'The Repeated Defender',
    scenario:
      'In a pickup basketball game, you have driven to your left on the last five plays and scored every time. Your defender has started shading to your left before you move.',
    question: 'What’s your best approach for the next few plays?',
    skill: 'uncertainty',
    basis: 'calculable',
    concept: 'A pattern an opponent has noticed gets exploited',
    takeaway: 'Once someone is reading you, success with a pattern is a reason to vary it — not to repeat it.',
    options: [
      {
        id: 'mix',
        label: 'Mix in drives to the right so they can’t sit on your left',
        verdict: 'match',
        feedback: 'Your defender is adjusting to your pattern, so varying it takes that advantage away. You don’t need 50/50 — if your left is stronger, lean left, just not every time.',
      },
      {
        id: 'keep-left',
        label: 'Keep going left — it’s been working',
        verdict: 'misconception',
        feedback: 'It worked while the defender hadn’t noticed. Now they are leaning left, so the same move is about to get much harder.',
      },
      {
        id: 'always-right',
        label: 'Switch to going right every time',
        verdict: 'misconception',
        feedback: 'That just swaps one pattern for another. A defender who noticed the first one will notice this one too.',
      },
    ],
  },
  {
    id: 'l4.c2.pattern-hunter',
    lesson: 'predictability-trap',
    order: 2,
    version: 1,
    level: 2,
    title: 'The Pattern Hunter',
    scenario:
      'You’re playing rock-paper-scissors, best of nine, for the last slice of pizza. Your friend is good at spotting habits, and you’ve noticed you usually play rock right after losing a round.',
    question: 'What is your best plan?',
    skill: 'uncertainty',
    basis: 'calculable',
    concept: 'Leave no pattern for a pattern-reader',
    takeaway: 'Against someone who learns your habits, a rule for what to play next is itself a habit. Aim for a mix with no rule behind it.',
    options: [
      {
        id: 'even-mix',
        label: 'Play each option about equally, with no rule your friend could learn',
        verdict: 'match',
        feedback: 'With no pattern to read, your friend’s guesses are no better than chance, and nothing about your play changes that. In this game every option is equally strong, so an even mix is right.',
      },
      {
        id: 'paper-after-loss',
        label: 'After losing, play paper instead of rock',
        verdict: 'misconception',
        feedback: 'That replaces one habit with another. A friend watching for habits will spot “paper after a loss” just as quickly.',
      },
      {
        id: 'always-rock',
        label: 'Play rock every time — they’ll expect you to change',
        verdict: 'misconception',
        feedback: 'It might fool them once, but a constant choice is the easiest pattern of all to read. After a round or two they will just play paper.',
      },
    ],
  },
  {
    id: 'l4.c3.no-opponent',
    lesson: 'predictability-trap',
    order: 3,
    version: 1,
    level: 3,
    title: 'The Mixed Strategy',
    scenario:
      'You commute to work by one of two routes: route A takes 20 minutes, route B takes 25, every day. Nobody is watching your route or gains anything from predicting it. A friend says you should mix it up so you’re less predictable.',
    question: 'Should you randomise your route?',
    skill: 'uncertainty',
    basis: 'calculable',
    concept: 'Mixing only helps when someone can exploit your pattern',
    takeaway: 'Unpredictability is a tool against someone who gains by reading you. Without such an opponent, just pick what works best.',
    options: [
      {
        id: 'no',
        label: 'No — nobody exploits your pattern, so take the faster route',
        verdict: 'match',
        feedback: 'Mixing protects you from someone who can react to your choices. Here nobody can, so every day on route B just costs you 5 minutes.',
      },
      {
        id: 'yes',
        label: 'Yes — being unpredictable is always smart',
        verdict: 'misconception',
        feedback: 'Unpredictability pays only against an opponent who gains by reading you. With none, mixing just means taking the slower route some days.',
      },
      {
        id: 'half',
        label: 'Split it 50/50 to keep things balanced',
        verdict: 'misconception',
        feedback: 'A 50/50 mix is the answer when both options are equally good and someone is reading you. Here neither is true: one route is simply faster.',
      },
    ],
  },

  // ── Lesson 5 · The Incentive Shift ──────────────────────────────────────────
  {
    id: 'l5.c1.bonus-scheme',
    lesson: 'incentive-shift',
    order: 1,
    version: 1,
    level: 1,
    title: 'The Bonus Scheme',
    scenario:
      'A support team starts paying a bonus for every ticket an agent closes. Within weeks, more tickets are closed — and more customers write back that the same problem has returned.',
    question: 'What is the most likely explanation?',
    skill: 'incentives',
    basis: 'calculable',
    concept: 'People respond to what is rewarded, not what was meant',
    takeaway: 'Check what a reward actually pays for. If it pays for a measure rather than the goal, expect people to chase the measure.',
    options: [
      {
        id: 'close-fast',
        label: 'Agents close tickets quickly, even when the problem isn’t fully solved',
        verdict: 'match',
        feedback: 'The bonus pays for closing, not for solving. Closing fast earns more, so some tickets get closed before the problem is really fixed — exactly the pattern in the complaints.',
      },
      {
        id: 'lazier',
        label: 'The agents have become lazier',
        verdict: 'misconception',
        feedback: 'They are working harder at what the bonus rewards. The change in behaviour follows the new incentive, not a change in character.',
      },
      {
        id: 'customers',
        label: 'Customers have become more demanding',
        verdict: 'defensible',
        feedback: 'Possible, but the timing points to the bonus: closed tickets and repeat problems rose together right after it started. Check the incentive before blaming the customers.',
      },
    ],
  },
  {
    id: 'l5.c2.new-penalty',
    lesson: 'incentive-shift',
    order: 2,
    version: 1,
    level: 2,
    title: 'The New Penalty',
    scenario:
      'A library charges a 20-cent fine for returning a book late, and many people keep books a few days past the due date. Borrowers say returning on time would mean a special trip worth about $2 to them. The library raises the late fine to 50 cents.',
    question: 'Will the higher fine get most books back on time?',
    skill: 'incentives',
    basis: 'calculable',
    concept: 'A penalty works only if it outweighs the gain from the behaviour',
    takeaway: 'Don’t ask whether a penalty sounds bigger; ask whether it is bigger than what people gain by ignoring it.',
    options: [
      {
        id: 'mostly-not',
        label: 'Mostly not — 50 cents is still less than the $2 trip it saves',
        verdict: 'match',
        feedback: 'Keeping the book late saves a trip worth about $2, and the new fine is 50 cents. The penalty went up, but it still doesn’t outweigh the gain, so most people’s choice stays the same.',
      },
      {
        id: 'yes',
        label: 'Yes — the fine has more than doubled',
        verdict: 'misconception',
        feedback: 'Doubling sounds strong, but what matters is the comparison with the gain. At 50 cents against a $2 trip, returning late still pays.',
      },
      {
        id: 'depends',
        label: 'It depends on how much each borrower values the trip',
        verdict: 'defensible',
        feedback: 'True for individuals: anyone who values the trip at under 50 cents will now return on time. But borrowers say it’s worth about $2, so for most the fine is still too small.',
      },
    ],
  },
  {
    id: 'l5.c3.rat-bounty',
    lesson: 'incentive-shift',
    order: 3,
    version: 1,
    level: 3,
    title: 'The Unintended Effect',
    scenario:
      'To reduce its rat problem, a city pays $1 for every rat tail handed in. Catching wild rats is slow work; raising rats in a backyard is cheap. No one checks where the tails come from.',
    question: 'What is likely to happen?',
    skill: 'incentives',
    basis: 'calculable',
    concept: 'Rewards can be gamed in ways the designer didn’t intend',
    takeaway: 'Before introducing a reward, ask how someone could earn it without delivering the goal — and close that path.',
    options: [
      {
        id: 'breeding',
        label: 'Some people start raising rats to collect the reward',
        verdict: 'match',
        feedback: 'The city pays for tails, not for fewer rats, and raising rats is cheaper than catching them. For some people breeding pays — so the reward can even increase the number of rats.',
      },
      {
        id: 'works',
        label: 'Rat numbers drop steadily, as intended',
        verdict: 'misconception',
        feedback: 'That assumes people will only earn the reward the intended way. With unchecked tails and cheap breeding, the easiest way to earn it doesn’t reduce rats at all.',
      },
      {
        id: 'nothing',
        label: 'Nothing changes — $1 is too little to matter',
        verdict: 'defensible',
        feedback: 'For many people, maybe. But the reward only has to pay for someone who can raise rats for less than $1 each — and the scenario says that is cheap.',
      },
    ],
  },
];

export type ChallengeId = string;

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}

export function challengesFor(lesson: LessonId): Challenge[] {
  return CHALLENGES.filter((c) => c.lesson === lesson).sort((a, b) => a.order - b.order);
}
