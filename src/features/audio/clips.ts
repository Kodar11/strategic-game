import { BASE_PRICING_GAME, NO_RULES, cutAdvantage } from '../../game/incentives.ts';
import { payoffAt } from '../../game/payoff-matrix.ts';
import { levelKGuess } from '../../game/two-thirds-game.ts';
import type { LessonId } from '../../content/lessons.ts';
import { explainOutcome } from '../lessons/cooperation-trap/copy.ts';
import { proposalExplanation } from '../lessons/incentive-shift/copy.ts';
import { CURRICULUM_CLIPS } from './curriculum-clips.ts';
import { STORY_CLIPS } from './story-clips.ts';
import type { SpeakingCharacter } from './voices.ts';

/**
 * Narration source manifest. The `text` here is exactly what gets synthesised; the app refers to clips only by `id`.
 *
 * - `sync: 'screen'`   the text appears verbatim on screen (a test checks the lesson source still contains it).
 * - `sync: 'computed'` the text comes from the same function the screen uses, or the screen renders this text.
 * - `sync: 'spoken'`   a spoken form of on-screen text (e.g. "⅔" read as "two-thirds"), or a short added reaction
 *                      whose outcome is already shown on screen. These are reviewed by hand.
 *
 * The five original lessons' lines are written out below. The curriculum lessons' lines are derived from their
 * content (`curriculum-lines.ts`) and snapshotted into `curriculum-clips.ts` by `npm run tts:curriculum`.
 *
 * Bump MANIFEST_VERSION when the shape of this file changes. Changing a line's text marks its audio as stale;
 * regenerate it with `npm run tts -- --only <id> --force`.
 */
export const MANIFEST_VERSION = 1;

export type ClipStyle = 'narration' | 'dialogue' | 'reaction';
export type ClipSync = 'screen' | 'computed' | 'spoken';

export interface ClipDef {
  id: string;
  /** A lesson, or one of the two stories (dbu, mer; whose lines are generated into story-clips.ts). */
  lesson: LessonId | 'dbu' | 'mer';
  character: SpeakingCharacter;
  style: ClipStyle;
  sync: ClipSync;
  text: string;
}

const L1 = 'cooperation-trap';
const L2 = 'strategy-detective';
const L3 = 'coordination-problem';
const L4 = 'predictability-trap';
const L5 = 'incentive-shift';

const LESSON_CLIPS = [
  // ── Lesson 1 · The Cooperation Trap ──────────────────────────────────────────
  { id: 'l1.intro.heading', lesson: L1, character: 'sen', style: 'narration', sync: 'spoken', text: 'Two apps. One city. Food delivery here comes down to two companies. You run one of them.' },
  { id: 'l1.intro.sen', lesson: L1, character: 'sen', style: 'narration', sync: 'screen', text: "Every Monday both companies set prices for the week. Neither sees the other's choice until the week begins." },
  { id: 'l1.stakes.kavya', lesson: L1, character: 'kavya', style: 'dialogue', sync: 'screen', text: "Honestly? If one app is cheaper this week, I'm ordering from that one." },
  { id: 'l1.stakes.rohan', lesson: L1, character: 'rohan', style: 'dialogue', sync: 'screen', text: "I'll do whatever earns FoodKart the most. Nothing personal." },
  { id: 'l1.decide.aarav', lesson: L1, character: 'aarav', style: 'dialogue', sync: 'screen', text: "What would I do if I knew Rohan's choice? Does it change if he picks the other one?" },
  { id: 'l1.reveal.rohan.undercut', lesson: L1, character: 'rohan', style: 'reaction', sync: 'screen', text: 'Thanks for keeping your prices up.' },
  { id: 'l1.reveal.rohan.bothcut', lesson: L1, character: 'rohan', style: 'reaction', sync: 'screen', text: 'So we both cut. That stings.' },
  { id: 'l1.reveal.aarav.undercut', lesson: L1, character: 'aarav', style: 'reaction', sync: 'screen', text: 'He undercut me. Could I have seen that coming?' },
  { id: 'l1.reveal.aarav.bothcut', lesson: L1, character: 'aarav', style: 'reaction', sync: 'screen', text: 'We both did the "smart" thing. So why does it feel like we lost?' },
  { id: 'l1.why.maintain-cut', lesson: L1, character: 'meera', style: 'dialogue', sync: 'computed', text: explainOutcome('maintain', 'cut', payoffAt(BASE_PRICING_GAME, 'maintain', 'cut')) },
  { id: 'l1.why.cut-cut', lesson: L1, character: 'meera', style: 'dialogue', sync: 'computed', text: explainOutcome('cut', 'cut', payoffAt(BASE_PRICING_GAME, 'cut', 'cut')) },
  { id: 'l1.matrix.dominant', lesson: L1, character: 'sen', style: 'narration', sync: 'screen', text: "Your cutting payoff is ringed in both columns, and FoodKart's in both rows. When one choice is best no matter what the other side does, it is called a dominant strategy." },
  { id: 'l1.trap.sen', lesson: L1, character: 'sen', style: 'narration', sync: 'screen', text: "Each company made the sensible choice for itself, and together they landed somewhere worse. This shape of game is called the Prisoner's Dilemma." },
  { id: 'l1.trap.rohan', lesson: L1, character: 'rohan', style: 'dialogue', sync: 'screen', text: "Let's stop this. Next week, we both keep prices. Deal?" },
  { id: 'l1.penalty.flip', lesson: L1, character: 'sen', style: 'reaction', sync: 'spoken', text: 'There it is. Once the penalty is bigger than the two-point gain from cutting, maintaining wins.' },
  { id: 'l1.caveat.kavya', lesson: L1, character: 'kavya', style: 'dialogue', sync: 'screen', text: 'Wait — the price war was good for me. If cutting is penalised, I pay more.' },
  { id: 'l1.caveat.arjun', lesson: L1, character: 'arjun', style: 'dialogue', sync: 'screen', text: 'And someone has to detect cuts and enforce the penalty. That costs something too.' },
  { id: 'l1.transfer.both-advertise', lesson: L1, character: 'sen', style: 'narration', sync: 'screen', text: 'Whatever the other shop does, heavy ads win you customers or protect the ones you have — so each shop spends. Together they pay for ads that mostly cancel out.' },
  { id: 'l1.transfer.both-hold', lesson: L1, character: 'sen', style: 'narration', sync: 'screen', text: 'Holding back is better for the pair, but each shop gains by quietly advertising while the other holds back. Without something that changes those incentives, the good outcome is fragile.' },
  { id: 'l1.transfer.repeat', lesson: L1, character: 'sen', style: 'narration', sync: 'screen', text: 'A fair point the one-month picture leaves out. Facing each other every month lets the shops reward restraint and punish ads. But within any single month, each still gains by advertising.' },
  { id: 'l1.transfer.first-mover', lesson: L1, character: 'sen', style: 'narration', sync: 'screen', text: 'They decide at the same time without seeing each other, so there is no first move to react to. Each has to reason about the other instead.' },
  { id: 'l1.done.takeaway', lesson: L1, character: 'sen', style: 'narration', sync: 'screen', text: 'When each side has a dominant strategy, individually rational choices can still leave everyone worse off.' },

  // ── Lesson 2 · The Strategy Detective ────────────────────────────────────────
  { id: 'l2.intro.heading', lesson: L2, character: 'sen', style: 'narration', sync: 'spoken', text: 'Guess two-thirds of the average. You and ten other players each secretly pick a whole number from 0 to 100.' },
  { id: 'l2.intro.sen', lesson: L2, character: 'sen', style: 'narration', sync: 'screen', text: "The target is two-thirds of everyone's average pick — yours included. Closest to the target wins." },
  { id: 'l2.intro.maya', lesson: L2, character: 'maya', style: 'dialogue', sync: 'screen', text: "I'm in. The question is what the rest of you will do." },
  { id: 'l2.example.aarav', lesson: L2, character: 'aarav', style: 'dialogue', sync: 'screen', text: "So I'm not guessing a number — I'm guessing what everyone else will guess." },
  { id: 'l2.guess2.maya', lesson: L2, character: 'maya', style: 'dialogue', sync: 'screen', text: 'If they all expect a lower target, the target itself moves lower. Where does it stop?' },
  { id: 'l2.result.won', lesson: L2, character: 'meera', style: 'reaction', sync: 'screen', text: 'You read this crowd well.' },
  { id: 'l2.result.above', lesson: L2, character: 'meera', style: 'reaction', sync: 'screen', text: 'Your number was above the target this crowd produced.' },
  { id: 'l2.result.below', lesson: L2, character: 'meera', style: 'reaction', sync: 'screen', text: 'Your number was below the target this crowd produced.' },
  { id: 'l2.types.meera', lesson: L2, character: 'meera', style: 'dialogue', sync: 'spoken', text: `Each extra step multiplies the previous guess by two-thirds: 50, then ${levelKGuess(1)}, then ${levelKGuess(2)}, then ${levelKGuess(3)}. This is called level-k reasoning.` },
  { id: 'l2.theory.zero', lesson: L2, character: 'sen', style: 'narration', sync: 'screen', text: 'Repeating the elimination forever leaves only 0. But that requires everyone to reason all the way down and to trust that everyone else does too. In the rounds you played, the winning number came from modelling the actual crowd.' },
  { id: 'l2.transfer.model', lesson: L2, character: 'sen', style: 'narration', sync: 'screen', text: 'The advice only works if few people follow it. If most do, 9:30 becomes the new jam. The best time depends on how many steps ahead the rest of the crowd is thinking.' },
  { id: 'l2.transfer.advice', lesson: L2, character: 'sen', style: 'narration', sync: 'screen', text: 'That is one step of reasoning — beating last year’s crowd. But everyone read the same advice, so you may be joining this year’s crowd instead.' },
  { id: 'l2.transfer.ten', lesson: L2, character: 'sen', style: 'narration', sync: 'screen', text: 'One step further, and it can work — but only if most people really do leave early. If the advice didn’t spread widely, 10 pm is the old jam again.' },
  { id: 'l2.transfer.earliest', lesson: L2, character: 'sen', style: 'narration', sync: 'screen', text: 'You would beat the traffic and miss the festival. Reasoning further than the crowd costs you something — like picking 0 in the number game.' },
  { id: 'l2.done.takeaway', lesson: L2, character: 'sen', style: 'narration', sync: 'screen', text: 'Your best move depends on how deeply others think — not on how deeply you can think.' },

  // ── Lesson 3 · The Coordination Problem ──────────────────────────────────────
  { id: 'l3.intro.heading', lesson: L3, character: 'sen', style: 'narration', sync: 'spoken', text: 'Two dead phones. You and Nina agreed to meet in the old town at six. Then both your phones died. You never said where.' },
  { id: 'l3.intro.aarav', lesson: L3, character: 'aarav', style: 'dialogue', sync: 'screen', text: "There are only two places we'd ever go: the Clocktower Café or Riverside Park." },
  { id: 'l3.reveal1.met', lesson: L3, character: 'nina', style: 'reaction', sync: 'computed', text: 'There you are! I hoped you’d pick the park.' },
  { id: 'l3.reveal1.missed', lesson: L3, character: 'nina', style: 'reaction', sync: 'computed', text: 'I waited by the river. I thought you’d come to the park.' },
  { id: 'l3.matrix.equilibria', lesson: L3, character: 'sen', style: 'narration', sync: 'spoken', text: "Your best move is simply: go where Nina goes — and the same for her. Each meeting outcome is a Nash equilibrium: once you're there, nobody gains by leaving alone. The hard part is knowing which one you're aiming for." },
  { id: 'l3.pick2.nina', lesson: L3, character: 'nina', style: 'dialogue', sync: 'spoken', text: "Let's make the clocktower our usual spot. Easy to remember." },
  { id: 'l3.pick2.aarav', lesson: L3, character: 'aarav', style: 'dialogue', sync: 'screen', text: "She'll remember that. And she knows I remember it too." },
  { id: 'l3.reveal2.met', lesson: L3, character: 'nina', style: 'reaction', sync: 'computed', text: 'Our usual spot. I knew you’d remember.' },
  { id: 'l3.reveal2.missed', lesson: L3, character: 'nina', style: 'reaction', sync: 'computed', text: 'I waited under the clocktower — our usual spot.' },
  { id: 'l3.focal.sen', lesson: L3, character: 'sen', style: 'narration', sync: 'screen', text: "When several outcomes would work, people coordinate on the one that stands out to everyone — and that everyone knows stands out. That's a focal point." },
  { id: 'l3.transfer.announce', lesson: L3, character: 'sen', style: 'narration', sync: 'screen', text: 'A public announcement gives everyone the same expectation at once — and everyone knows everyone saw it. Chatter fans lose their favourite, but being on one app beats being split.' },
  { id: 'l3.transfer.majority', lesson: L3, character: 'sen', style: 'narration', sync: 'screen', text: 'That can work as a shared rule — if everyone knows the numbers and expects the others to follow the same rule. If it is close, or people disagree about the count, the group can stay split.' },
  { id: 'l3.transfer.better-app', lesson: L3, character: 'sen', style: 'narration', sync: 'screen', text: 'People prefer different apps, so there may never be agreement on “better”. Like the café and the park, neither option is best for everyone — what matters is that you all pick the same one.' },
  { id: 'l3.transfer.both', lesson: L3, character: 'sen', style: 'narration', sync: 'screen', text: 'Staying split is the outcome everyone wanted to avoid: messages get missed, like waiting at different meeting places.' },
  { id: 'l3.done.takeaway', lesson: L3, character: 'sen', style: 'narration', sync: 'screen', text: 'When many outcomes could work, success depends on shared expectations — not on finding the single best option.' },

  // ── Lesson 4 · The Predictability Trap ───────────────────────────────────────
  { id: 'l4.intro.heading', lesson: L4, character: 'sen', style: 'narration', sync: 'spoken', text: 'The penalty shootout. You shoot left or right. Maya, in goal, dives left or right at the same moment.' },
  { id: 'l4.intro.maya', lesson: L4, character: 'maya', style: 'dialogue', sync: 'screen', text: "I don't know where you'll shoot. But I'll be watching every shot you take." },
  { id: 'l4.shot.save-read', lesson: L4, character: 'maya', style: 'reaction', sync: 'spoken', text: 'Read that one.' },
  { id: 'l4.shot.save-guess', lesson: L4, character: 'maya', style: 'reaction', sync: 'spoken', text: 'Lucky guess. I’ll take it.' },
  { id: 'l4.shot.goal-read', lesson: L4, character: 'maya', style: 'reaction', sync: 'spoken', text: 'Hm. You broke the pattern.' },
  { id: 'l4.shot.goal-guess', lesson: L4, character: 'maya', style: 'reaction', sync: 'spoken', text: 'Good shot.' },
  { id: 'l4.review.read', lesson: L4, character: 'maya', style: 'dialogue', sync: 'screen', text: 'People think they’re being random. Most of them have a rhythm.' },
  { id: 'l4.review.few', lesson: L4, character: 'maya', style: 'dialogue', sync: 'screen', text: 'You didn’t give me much to work with. Annoying.' },
  { id: 'l4.compare.patterns', lesson: L4, character: 'sen', style: 'narration', sync: 'screen', text: 'Always-left and alternating are both perfectly predictable once Maya has a few shots of history. The random striker gives her nothing reliable to read: her reads are no better than guesses, so it scores around half — more or less, depending on the run.' },
  { id: 'l4.mixed.meera', lesson: L4, character: 'meera', style: 'dialogue', sync: 'screen', text: "Choosing each side with a fixed probability is called a mixed strategy. Mixing 50/50 here means your chance of scoring doesn't depend on what she does." },
  { id: 'l4.caveat.sen', lesson: L4, character: 'sen', style: 'narration', sync: 'screen', text: 'Real strikers have a stronger side, and keepers reach some corners better. Then the equilibrium mix shifts away from 50/50 — the principle stays the same: leave no exploitable pattern.' },
  { id: 'l4.transfer.weighted', lesson: L4, character: 'sen', style: 'narration', sync: 'screen', text: 'Riders can’t time their dodging, so skipping a ticket is risky on every trip — and the checks lean towards the routes where they matter most. Unpredictable doesn’t have to mean evenly spread.' },
  { id: 'l4.transfer.uniform', lesson: L4, character: 'sen', style: 'narration', sync: 'screen', text: 'Nothing for riders to learn, which is the key idea. But routes differ: an even spread wastes checks on routes where hardly anyone dodges. The right mix depends on the payoffs, like a striker with a stronger side.' },
  { id: 'l4.transfer.fixed', lesson: L4, character: 'sen', style: 'narration', sync: 'screen', text: 'A fixed schedule is easy to learn. Fare-dodgers simply avoid Monday mornings on that route.' },
  { id: 'l4.transfer.rotate', lesson: L4, character: 'sen', style: 'narration', sync: 'screen', text: 'Rotation feels varied, but a fixed cycle is still a pattern — once noticed, it is as exploitable as alternating shots.' },
  { id: 'l4.done.takeaway', lesson: L4, character: 'sen', style: 'narration', sync: 'screen', text: 'If an opponent can learn your pattern, your pattern becomes their advantage.' },

  // ── Lesson 5 · The Incentive Shift ───────────────────────────────────────────
  { id: 'l5.intro.heading', lesson: L5, character: 'sen', style: 'narration', sync: 'spoken', text: "Change the rules, change the game. QuickEats and FoodKart are back in the same market. This time you'll also get to rewrite its rules." },
  { id: 'l5.intro.arjun', lesson: L5, character: 'arjun', style: 'dialogue', sync: 'screen', text: "I advise the city's delivery council. Before anyone writes a rule, I want to see what it actually does to each company's choices." },
  { id: 'l5.rules.meera', lesson: L5, character: 'meera', style: 'dialogue', sync: 'spoken', text: `Cutting is each company's best reply in every case — by exactly ${cutAdvantage(NO_RULES)} points. Keep that number in mind.` },
  { id: 'l5.proposal.arjun', lesson: L5, character: 'arjun', style: 'dialogue', sync: 'screen', text: 'One councillor wants to pay each company 1.5 points a week for keeping its prices. It sounds generous. Will it work?' },
  { id: 'l5.proposal.result', lesson: L5, character: 'sen', style: 'narration', sync: 'computed', text: proposalExplanation() },
  { id: 'l5.designer.sen', lesson: L5, character: 'sen', style: 'narration', sync: 'screen', text: 'Your goal: find rules under which rational companies maintain prices. Then ask whether those rules are worth it.' },
  { id: 'l5.sandbox.flip', lesson: L5, character: 'sen', style: 'reaction', sync: 'spoken', text: 'That’s the line. Once the penalty and the reward together outweigh the two-point gain from cutting, maintaining wins.' },
  { id: 'l5.enforce.arjun', lesson: L5, character: 'arjun', style: 'dialogue', sync: 'screen', text: 'Every inspector costs the council money. I need to know how much checking your rule really needs.' },
  { id: 'l5.levers.meera', lesson: L5, character: 'meera', style: 'dialogue', sync: 'spoken', text: 'The behaviour flips at the same line — p plus r greater than 2 — but who bears the cost is completely different.' },
  { id: 'l5.side.customers', lesson: L5, character: 'sen', style: 'narration', sync: 'screen', text: 'The price war was good for Kavya. A rule that ends it raises what customers pay. "Better for the companies" can be worse for the people they serve.' },
  { id: 'l5.side.enforcement', lesson: L5, character: 'sen', style: 'narration', sync: 'screen', text: 'Detecting "price cuts" means defining them and watching for disguised discounts, coupons and bundles. Enforcement costs money, and loopholes change the game again.' },
  { id: 'l5.side.competition', lesson: L5, character: 'sen', style: 'narration', sync: 'screen', text: 'If price is off the table, Rohan may compete on speed, quality or marketing instead — not modelled here, but likely in reality. New rivals may also enter.' },
  { id: 'l5.transfer.team-bonus', lesson: L5, character: 'sen', style: 'narration', sync: 'screen', text: 'This changes the payoffs: sharing now earns you something directly. Like the reward lever, it has a cost — and it can invite free-riding, so it needs designing with care.' },
  { id: 'l5.transfer.drop-ranking', lesson: L5, character: 'sen', style: 'narration', sync: 'screen', text: 'That removes the reason to hoard — but also the reward for effort. People may stop hoarding and stop pushing, too. Taking away an incentive changes more than the one behaviour you were aiming at.' },
  { id: 'l5.transfer.ask', lesson: L5, character: 'sen', style: 'narration', sync: 'screen', text: 'Encouragement doesn’t change the table. If hoarding still wins the individual ranking, the incentive to hoard is unchanged.' },
  { id: 'l5.transfer.bigger-ranking', lesson: L5, character: 'sen', style: 'narration', sync: 'screen', text: 'That raises the reward for beating colleagues, making hoarding even more attractive.' },
  { id: 'l5.done.takeaway', lesson: L5, character: 'sen', style: 'narration', sync: 'screen', text: 'To change what people choose, change what their choices cost and earn — then check what else changes.' },
] as const satisfies readonly ClipDef[];

export const CLIPS = [...LESSON_CLIPS, ...CURRICULUM_CLIPS, ...STORY_CLIPS] as const;

export type ClipId = (typeof CLIPS)[number]['id'];

/** Bundled file for a clip: `assets/audio/<lesson>/<id with dots and dashes as underscores>.mp3`. */
export function clipFileName(id: string): string {
  return `${id.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.mp3`;
}

export function clipOutputPath(clip: Pick<ClipDef, 'id' | 'lesson'>): string {
  return `assets/audio/${clip.lesson}/${clipFileName(clip.id)}`;
}

export function getClip(id: string): ClipDef | undefined {
  return (CLIPS as readonly ClipDef[]).find((c) => c.id === id);
}
