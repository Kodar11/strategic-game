import type { RpsMove, RpsRound } from '../games/rps.ts';
import type { SplitRound } from '../games/split-steal.ts';
import type { StagRound } from '../games/stag-hunt.ts';
import { type TwoThirdsRound, sumOf } from '../games/two-thirds.ts';
import type { UltimatumRound } from '../games/ultimatum.ts';
import { count, firstRound, longestRun, times } from './select.ts';
import { type GameReflections, rule } from './types.ts';

/**
 * Reflections for the five classic games (src/games/). Each reads the match's recorded rounds — the same rounds the
 * board revealed one by one — and nothing about the bot except what it played.
 */

// ── Split or Steal ──────────────────────────────────────────────────────────
// 10 announced rounds; 5/5 both split, 8/0 steal vs split, 1/1 both steal.

type Split = readonly SplitRound[];

export const SPLIT_STEAL: GameReflections<Split> = {
  game: 'split-steal',
  lesson: 'repeated-cooperation',
  rules: [
    rule({
      id: 'split-after-steal',
      tier: 1,
      when: (h: Split) => {
        const round = firstRound(h, (r, i) => i > 0 && h[i - 1].b === 'steal' && r.p === 'split');
        return round ? { round, prev: round - 1 } : null;
      },
      write: ({ round, prev }) => ({
        thought: `Your opponent stole in round ${prev}, and you split anyway in round ${round}. Was that a second chance, or a bet that the steal wouldn’t repeat?`,
        idea: 'In a repeated game, every reply is also a message. Splitting after a steal says the door is still open; stealing back says betrayal has a price.',
        perspective: 'Forgiving can restart a run of 5–5 rounds. It can also teach the other side that a steal costs them nothing.',
        question: 'How many steals would it take before you stopped offering the split — and would you want your opponent to know that number?',
      }),
    }),
    rule({
      id: 'last-round-steal',
      tier: 1,
      when: (h: Split) => {
        const last = h[h.length - 1];
        const splits = count(h.slice(0, -1), (r) => r.p === 'split');
        return last?.p === 'steal' && splits >= Math.ceil((h.length - 1) / 2) ? { splits, before: h.length - 1, last: h.length } : null;
      },
      write: ({ splits, before, last }) => ({
        thought: `You split in ${splits} of the first ${before} rounds, then stole in round ${last}. With no round after it, what was left for trust to protect?`,
        idea: 'Cooperation in a repeated game leans on the future. In the final round there is no future to protect, and the gap between 8 and 5 is all that remains.',
        perspective: 'If both players see the last round that way, the round before it starts to look like a last round too — and the logic can creep backwards.',
        question: 'Did you expect your opponent to see the final round the same way you did?',
      }),
    }),
    rule({
      id: 'stole-back',
      tier: 1,
      when: (h: Split) => {
        const round = firstRound(h, (r, i) => i > 0 && h[i - 1].b === 'steal' && h[i - 1].p === 'split' && r.p === 'steal');
        return round ? { round, prev: round - 1 } : null;
      },
      write: ({ round, prev }) => ({
        thought: `After your split was met with a steal in round ${prev}, you stole in round ${round}. Was that a punishment, a protection, or a message?`,
        idea: 'Answering a steal makes stealing expensive for the other side. That is often what keeps a repeated relationship honest.',
        perspective: 'An answer can also start a feud: if both sides keep answering the last steal, nobody gets back to 5–5.',
        question: 'After answering a steal, what would you need to see before you split again?',
      }),
    }),
    rule({
      id: 'split-run',
      tier: 2,
      when: (h: Split) => {
        const [len, start] = longestRun(h, (r) => r.p === 'split' && r.b === 'split');
        return len >= 3 ? { len, start, end: start + len - 1 } : null;
      },
      write: ({ len, start, end }) => ({
        thought: `You both split for ${len} rounds straight, rounds ${start} to ${end}. What kept that run going — and what would have ended it?`,
        idea: 'A run of mutual splits is fragile: either side could earn 8 instead of 5 by stealing once. What holds it together is what each expects the other to do next.',
        perspective: 'A long run builds trust, but it also makes a single steal more tempting — the other side may not see it coming.',
        question: 'How long would a run like that need to last before you’d feel safe — or before you’d feel tempted?',
      }),
    }),
    rule({
      id: 'stole-first',
      tier: 2,
      when: (h: Split) => {
        const round = firstRound(h, (r) => r.p === 'steal' || r.b === 'steal');
        return round && h[round - 1].p === 'steal' && h[round - 1].b === 'split' ? { round } : null;
      },
      write: ({ round }) => ({
        thought: `You were the first to steal, in round ${round}. How did the rounds after it compare with the rounds before?`,
        idea: 'The first steal in a match changes what both players know about each other. Everything after it is played in its shadow.',
        perspective: 'An early steal grabs 8 once; it can also cost several rounds of 5 if the other side stops trusting you.',
        question: 'What would have happened if that steal had come one round later — or not at all?',
      }),
    }),
    rule({
      id: 'steal-lock',
      tier: 2,
      when: (h: Split) => {
        const both = count(h, (r) => r.p === 'steal' && r.b === 'steal');
        return both >= 3 ? { both } : null;
      },
      write: ({ both }) => ({
        thought: `${both} rounds ended with you both stealing, at 1 coin each. Each steal was safe on its own — so what would it have taken for one of you to try splitting?`,
        idea: 'Stealing pays more in any single round, whatever the other side does. Yet two stealers earn 1 each, where two splitters earn 5.',
        perspective: 'Moving first out of a steal–steal rut risks a round at 0. Staying in it pays 1, round after round.',
        question: 'Is there a way to signal you’d split, without being the one who pays for it?',
      }),
    }),
  ],
  general: {
    thought: 'Stealing pays more in any single round, yet two stealers end up far behind two splitters. Which of those facts guided you more?',
    idea: 'Split or Steal is a prisoner’s dilemma played ten times. Each round rewards stealing, but the match rewards a relationship that holds.',
    perspective: 'Trust is valuable only if the other side returns it. Against a player who never does, splitting is just a gift.',
    question: 'What would you change if the match had no announced end?',
  },
};

// ── Rock, Paper, Scissors ───────────────────────────────────────────────────

type Rps = readonly RpsRound[];
const MOVE: Record<RpsMove, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

export const RPS: GameReflections<Rps> = {
  game: 'rps',
  lesson: 'predictability-trap',
  rules: [
    rule({
      id: 'losing-streak',
      tier: 1,
      when: (h: Rps) => {
        const [len, start] = longestRun(h, (r) => r.r === -1);
        return len >= 3 ? { len, start, end: start + len - 1 } : null;
      },
      write: ({ len, start, end }) => ({
        thought: `You lost ${len} rounds in a row, rounds ${start} to ${end}. Was your opponent reading you, or is that what a short run of chance can look like?`,
        idea: 'Streaks happen even between two random players. In twelve rounds, a run of three is far more common than it feels.',
        perspective: 'A streak can also be real: if your throws followed a pattern, an attentive opponent may have found it.',
        question: 'What would you need to see to tell a real pattern from an unlucky run?',
      }),
    }),
    rule({
      id: 'winning-streak',
      tier: 1,
      when: (h: Rps) => {
        const [len, start] = longestRun(h, (r) => r.r === 1);
        return len >= 3 ? { len, start, end: start + len - 1 } : null;
      },
      write: ({ len, start, end }) => ({
        thought: `You won ${len} rounds in a row, rounds ${start} to ${end}. Had you found something real, or did a lucky run feel like a read?`,
        idea: 'Exploiting a genuine pattern and riding a lucky streak look identical from the inside. The difference shows only over many more rounds.',
        perspective: 'If the read was real, sticking with it pays. If it wasn’t, leaning on it makes you predictable in turn.',
        question: 'How many rounds would you want to see before trusting a read like that?',
      }),
    }),
    rule({
      id: 'favourite-throw',
      tier: 2,
      when: (h: Rps) => {
        const best = (['rock', 'paper', 'scissors'] as const).map((m) => ({ m, k: count(h, (r) => r.p === m) })).sort((a, b) => b.k - a.k)[0];
        return h.length && best.k * 2 >= h.length ? { move: MOVE[best.m], k: best.k, n: h.length } : null;
      },
      write: ({ move, k, n }) => ({
        thought: `You threw ${move} ${k} times out of ${n}. Was that a plan, or a habit that formed along the way?`,
        idea: 'In a game of pure counters, any lean in your choices is information. An opponent who counts can use it.',
        perspective: 'A lean only costs you if someone is watching for it. Against a truly random opponent, no choice changes your odds.',
        question: 'Facing the same opponent again, would you rather be readable on purpose — or not at all?',
      }),
    }),
    rule({
      id: 'win-stay',
      tier: 2,
      when: (h: Rps) => {
        const after = h.slice(1).filter((_, i) => h[i].r === 1);
        const stayed = count(h.slice(1), (r, i) => h[i].r === 1 && r.p === h[i].p);
        return after.length >= 3 && stayed * 3 >= after.length * 2 ? { stayed, wins: after.length } : null;
      },
      write: ({ stayed, wins }) => ({
        thought: `After a win, you kept the same throw ${stayed} of ${wins} times. Did that feel like sticking with what works?`,
        idea: 'What you do after a win or a loss is one of the easiest patterns to spot, because it repeats every time the same thing happens.',
        perspective: 'Repeating a winner feels natural — which is exactly why some players expect it, and some opponents bet on it.',
        question: 'What would change if your opponent knew what you do after a win?',
      }),
    }),
    rule({
      id: 'lose-shift',
      tier: 2,
      when: (h: Rps) => {
        const after = h.slice(1).filter((_, i) => h[i].r === -1);
        const shifted = count(h.slice(1), (r, i) => h[i].r === -1 && r.p !== h[i].p);
        return after.length >= 3 && shifted === after.length ? { shifted } : null;
      },
      write: ({ shifted }) => ({
        thought: `Every time you lost a round, you changed your throw — ${times(shifted)} in all. Was the switch a choice, or a reflex?`,
        idea: 'Switching after a loss feels like adapting. Done every time, it is also a rule — and rules can be learned.',
        perspective: 'Changing after a loss can shake off an opponent who has read you. It can also be exactly what they expect.',
        question: 'What would happen if you stayed put after a loss once in a while?',
      }),
    }),
  ],
  general: {
    thought: 'Did you choose your throws based on the game, or on what you thought your opponent would choose?',
    idea: 'Rock, Paper, Scissors has no best throw. Every edge comes from what each player expects the other to do.',
    perspective: 'Trying to out-think an opponent can create patterns of your own; playing at random gives nothing away but takes no edge either.',
    question: 'How would you play against an opponent you knew nothing about?',
  },
};

// ── Two-Thirds Guess ────────────────────────────────────────────────────────
// Target = ⅔ of the mean of all nine picks, i.e. 2·sum / 27.

type TwoThirds = readonly TwoThirdsRound[];
const target = (r: TwoThirdsRound) => Math.round((2 * sumOf(r)) / 27);

export const TWO_THIRDS: GameReflections<TwoThirds> = {
  game: 'two-thirds',
  lesson: 'strategy-detective',
  rules: [
    rule({
      id: 'highest-pick',
      tier: 1,
      when: (h: TwoThirds) => {
        const round = firstRound(h, (r) => r.bots.every((b) => r.p > b));
        return round ? { round, pick: h[round - 1].p, target: target(h[round - 1]) } : null;
      },
      write: ({ round, pick, target: t }) => ({
        thought: `In round ${round}, your ${pick} was higher than every other pick, and the target came out near ${t}. What did you expect the group to choose?`,
        idea: 'The target depends on everyone’s pick, so a good guess is really a guess about how far ahead the others are thinking.',
        perspective: 'Picking high can be a deliberate bet that the group will be naive. Whether that pays depends on who is in the room.',
        question: 'How many steps ahead do you think the others were reasoning — and how did you decide?',
      }),
    }),
    rule({
      id: 'chased-last-target',
      tier: 1,
      when: (h: TwoThirds) => {
        const round = firstRound(h, (r, i) => i > 0 && Math.abs(r.p - target(h[i - 1])) <= 2 && Math.abs(target(r) - target(h[i - 1])) >= 4);
        return round ? { round, pick: h[round - 1].p, prev: target(h[round - 2]), now: target(h[round - 1]) } : null;
      },
      write: ({ round, pick, prev, now }) => ({
        thought: `In round ${round} you picked ${pick}, right by the previous target of ${prev}, but the group moved and the target landed near ${now}. Were you expecting the others to stand still?`,
        idea: 'Last round’s target is public. That makes it a natural anchor — for you and for everyone else.',
        perspective: 'If everyone anchors on the last target, the next one moves away from it. If nobody does, the anchor might be right.',
        question: 'Which way did you expect the group to move after seeing that target?',
      }),
    }),
    rule({
      id: 'target-drift',
      tier: 2,
      when: (h: TwoThirds) => {
        if (h.length < 3) return null;
        const first = target(h[0]);
        const last = target(h[h.length - 1]);
        return first - last >= 5 ? { first, last, n: h.length, p1: h[0].p, pn: h[h.length - 1].p } : null;
      },
      write: ({ first, last, n, p1, pn }) => ({
        thought: `The target fell from about ${first} in round 1 to about ${last} in round ${n}, while your picks went from ${p1} to ${pn}. How much of that fall did you see coming?`,
        idea: 'When everyone sees the last result, the group tends to think one step further each round. The target moves because beliefs move.',
        perspective: 'Moving with the group keeps you close to the target; moving ahead of it only pays if the group actually follows.',
        question: 'Where would you start next time, knowing how this group moved?',
      }),
    }),
    rule({
      id: 'won-round',
      tier: 2,
      when: (h: TwoThirds) => {
        const round = firstRound(h, (r) => !r.botWon);
        return round ? { round, pick: h[round - 1].p, target: target(h[round - 1]) } : null;
      },
      write: ({ round, pick, target: t }) => ({
        thought: `Your ${pick} in round ${round} landed closest to a target of about ${t}. Was that a read of the numbers, or of the people choosing them?`,
        idea: 'A winning pick isn’t the “right” number in general. It is the right number for this group, this round.',
        perspective: 'The same pick against a different group could finish far from the target.',
        question: 'Would that pick still win if the group knew you’d make it?',
      }),
    }),
  ],
  general: {
    thought: 'Your choice depended not just on the number, but on what you expected everyone else to choose.',
    idea: 'In the Two-Thirds Guess, the target is made by the players themselves. Guessing well means modelling how others reason.',
    perspective: 'Thinking many steps ahead pays only if others do too. Against a group that stops early, deep reasoning undershoots.',
    question: 'How would your first pick change if you knew how deeply this group thinks?',
  },
};

// ── The Ultimatum (classic) ─────────────────────────────────────────────────
// 10 coins; proposer offers 1–9; rejection = 0 / 0. The player proposes in rounds 1, 3, 5.

type Ult = readonly UltimatumRound[];

export const ULTIMATUM: GameReflections<Ult> = {
  game: 'ultimatum',
  lesson: 'bargaining',
  rules: [
    rule({
      id: 'you-rejected',
      tier: 1,
      when: (h: Ult) => {
        const round = firstRound(h, (r) => r.proposer === 'bot' && !r.accepted);
        return round ? { round, offer: h[round - 1].offer } : null;
      },
      write: ({ round, offer }) => ({
        thought: `In round ${round} you turned down ${offer} of 10 coins, leaving you both with nothing. What was that refusal buying you?`,
        idea: 'Rejecting costs the responder money, so it only makes sense if something else matters: fairness, a message, or a better offer next time.',
        perspective: 'Seen as one round, any offer beats zero. Seen across the match, a refusal can be an investment in the next offer.',
        question: 'Would you have refused the same offer in the final round, with no next offer to influence?',
      }),
    }),
    rule({
      id: 'offer-rejected',
      tier: 1,
      when: (h: Ult) => {
        const round = firstRound(h, (r) => r.proposer === 'player' && !r.accepted);
        return round ? { round, offer: h[round - 1].offer } : null;
      },
      write: ({ round, offer }) => ({
        thought: `Your offer of ${offer} coins in round ${round} was turned down, and neither of you got anything. An offer can be profitable on paper and still be rejected — what do you think mattered most?`,
        idea: 'A responder who only counts coins accepts anything above zero. One who cares how the split looks may not.',
        perspective: 'A lower offer keeps more when it works and loses everything when it doesn’t. The question is how sure you are of the other side.',
        question: 'What would you need to know about the other side to choose an offer with confidence?',
      }),
    }),
    rule({
      id: 'lean-offer-accepted',
      tier: 2,
      when: (h: Ult) => {
        const round = firstRound(h, (r) => r.proposer === 'player' && r.accepted && r.offer <= 3);
        return round ? { round, offer: h[round - 1].offer } : null;
      },
      write: ({ round, offer }) => ({
        thought: `In round ${round}, your offer of ${offer} out of 10 was accepted. How sure were you that it would be?`,
        idea: 'Bargaining power belongs to whoever loses least if talks fail. Here a rejection costs the responder only a few coins.',
        perspective: 'A lean offer that lands looks clever; the same offer to a different responder could leave you with nothing.',
        question: 'How low would you go, and what would make you go lower?',
      }),
    }),
    rule({
      id: 'accepted-little',
      tier: 2,
      when: (h: Ult) => {
        const round = firstRound(h, (r) => r.proposer === 'bot' && r.accepted && r.offer <= 3);
        return round ? { round, offer: h[round - 1].offer } : null;
      },
      write: ({ round, offer }) => ({
        thought: `You accepted ${offer} of 10 coins in round ${round}. Something beats nothing — but did accepting say anything about what you’d take next time?`,
        idea: 'In a repeated match, accepting is also information: it shows the other side where your line is.',
        perspective: 'Refusing would have cost you those coins for certain; any effect on later offers was only a possibility.',
        question: 'Is there an offer you’d refuse even though it costs you?',
      }),
    }),
    rule({
      id: 'even-splitter',
      tier: 2,
      when: (h: Ult) => {
        const mine = h.filter((r) => r.proposer === 'player');
        return mine.length >= 2 && mine.every((r) => r.offer === 5) ? { offers: mine.length } : null;
      },
      write: ({ offers }) => ({
        thought: `You offered an even 5–5 split in all ${offers} of your proposals. Was that about fairness, or insurance against a rejection?`,
        idea: 'An even split is a focal point: easy to propose, hard to object to. It trades a bit of money for a lot of certainty.',
        perspective: 'Against a responder who accepts less, an even split leaves coins on the table.',
        question: 'What would it take for you to try a different offer — and what would you learn from it?',
      }),
    }),
  ],
  general: {
    thought: 'An offer can be profitable on paper and still be rejected. What do you think mattered most in your decisions?',
    idea: 'The Ultimatum Game separates money from fairness: a responder can always choose nothing over a split that feels wrong.',
    perspective: 'A proposer holds the first move; a responder holds the veto. Which one is stronger depends on how each side values a refusal.',
    question: 'How would you play if you only proposed, and never responded?',
  },
};

// ── Stag Hunt ───────────────────────────────────────────────────────────────
// Both stag 5/5; stag alone 0 vs hare 3; both hare 3/3.

type Stag = readonly StagRound[];

export const STAG_HUNT: GameReflections<Stag> = {
  game: 'stag-hunt',
  lesson: 'coordination-problem',
  rules: [
    rule({
      id: 'stag-alone',
      tier: 1,
      when: (h: Stag) => {
        const round = firstRound(h, (r) => r.p === 'stag' && r.b === 'hare');
        return round ? { round, again: h[round]?.p === 'stag' ? 1 : 0, next: round + 1 } : null;
      },
      write: ({ round, again, next }) => ({
        thought: again
          ? `In round ${round} you went for the stag alone and came back with nothing — and you went for it again in round ${next}. What made you willing to commit twice?`
          : `In round ${round} you went for the stag and your partner took the hare, leaving you with nothing. What would have had to be true for that risk to pay?`,
        idea: 'The stag only pays when both commit. Hunting it is less a bet on the animal than a bet on your partner.',
        perspective: 'Committing after a miss can show your partner you mean it; it can also cost you again if they still don’t believe you.',
        question: 'How confident do you need to be in a partner before the stag is worth it?',
      }),
    }),
    rule({
      id: 'hare-while-they-stag',
      tier: 1,
      when: (h: Stag) => {
        const round = firstRound(h, (r) => r.p === 'hare' && r.b === 'stag');
        return round ? { round } : null;
      },
      write: ({ round }) => ({
        thought: `In round ${round} you took the safe hare while your partner went for the stag alone, so you kept 3 where you could have shared 5. What made you cautious that round?`,
        idea: 'The hare is safe because it doesn’t depend on anyone. That same independence is why it can never reach the shared reward.',
        perspective: 'Caution protected you from a miss. It also left your partner with nothing, which may shape how they hunt next.',
        question: 'What would your partner have needed to do for you to commit?',
      }),
    }),
    rule({
      id: 'stag-run',
      tier: 2,
      when: (h: Stag) => {
        const [len, start] = longestRun(h, (r) => r.p === 'stag' && r.b === 'stag');
        return len >= 3 ? { len, start, end: start + len - 1 } : null;
      },
      write: ({ len, start, end }) => ({
        thought: `You and your partner hunted the stag together for ${len} rounds, ${start} to ${end}. The best shared outcome held — what made each of you keep believing in the other?`,
        idea: 'Once both expect the other to commit, the stag is the best reply for each. Expectations, not promises, hold it together.',
        perspective: 'A long run can feel secure, yet one doubtful round from either side can break it.',
        question: 'What would make you doubt a partner who had committed every round?',
      }),
    }),
    rule({
      id: 'hare-lock',
      tier: 2,
      when: (h: Stag) => {
        const both = count(h, (r) => r.p === 'hare' && r.b === 'hare');
        return both * 2 >= h.length && h.length ? { both, n: h.length } : null;
      },
      write: ({ both, n }) => ({
        thought: `${both} of ${n} rounds ended with you both on the safe hare. Each of you did the sensible thing given what you expected — so who should move first?`,
        idea: 'Both-hare is stable: neither side gains by switching alone. Getting to the stag takes someone willing to risk a round at zero.',
        perspective: 'Staying safe pays a sure 3 a round. Breaking out might earn 5 a round — or cost you a round for nothing.',
        question: 'How many safe rounds would you trade for one attempt at the stag?',
      }),
    }),
  ],
  general: {
    thought: 'The best shared outcome depended on whether you and your partner expected each other to commit.',
    idea: 'Stag Hunt has two stable outcomes: both bold, or both safe. Neither player is tempted to cheat; the problem is trust.',
    perspective: 'Caution is never foolish here — it is the best reply to a cautious partner. Boldness is the best reply to a bold one.',
    question: 'What could you do early in a match to make the bold outcome easier to reach?',
  },
};
