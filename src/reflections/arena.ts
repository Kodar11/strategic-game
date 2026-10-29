import type { AuctionState } from '../arena/auction.ts';
import type { CoopState } from '../arena/cooperation.ts';
import type { MarketState } from '../arena/market.ts';
import type { SignalState } from '../arena/signal.ts';
import type { UltState } from '../arena/ultimatum-game.ts';
import { count, firstRound, longestRun, times } from './select.ts';
import { type GameReflections, rule } from './types.ts';

/**
 * Reflections for the first five Strategy Arena games. Each reads the engine's final state. Fields the player never
 * saw stay unread: the Ultimatum Game's `botMin` (the bot's private acceptance threshold) and the Cooperation Game's
 * `bi` (what the bot meant before a slip; only the delivered move `b` was shown).
 */

// ── The Cooperation Game ────────────────────────────────────────────────────

export const COOPERATION: GameReflections<CoopState> = {
  game: 'cooperation',
  lesson: 'repeated-cooperation',
  rules: [
    rule({
      id: 'slip',
      tier: 1,
      when: (s: CoopState) => {
        const round = firstRound(s.rounds, (r) => r.pi !== r.p || r.bi !== r.b);
        return round ? { round, yours: s.rounds[round - 1].pi !== s.rounds[round - 1].p ? 1 : 0 } : null;
      },
      write: ({ round, yours }) => ({
        thought: `In round ${round}, a slip changed what was delivered${yours ? ' — this time, yours' : ''}. When a defection might be an accident, how quickly should it be answered?`,
        idea: 'Noise turns every defection into a question: was it meant? Strategies that never forgive can lock two well-meaning players into a feud.',
        perspective: 'Forgiving too easily invites real defections disguised as slips. Forgiving too rarely punishes accidents.',
        question: 'How many defections in a row would convince you one wasn’t an accident?',
      }),
    }),
    rule({
      id: 'coop-after-defection',
      tier: 1,
      when: (s: CoopState) => {
        const h = s.rounds;
        const round = firstRound(h, (r, i) => i > 0 && h[i - 1].b === 'D' && r.pi === 'C');
        return round ? { round, prev: round - 1 } : null;
      },
      write: ({ round, prev }) => ({
        thought: `Your opponent defected in round ${prev}, and you cooperated anyway in round ${round}. Would you have chosen the same if it had been the final round?`,
        idea: 'Repeated play changes the incentives behind cooperation: today’s choice shapes tomorrow’s relationship.',
        perspective: 'Cooperating after a defection can repair the relationship. It also carries a cost when the other side doesn’t reciprocate.',
        question: 'What would you change if this were the first of ten encounters rather than a one-time interaction?',
      }),
    }),
    rule({
      id: 'final-defection',
      tier: 1,
      when: (s: CoopState) => {
        const h = s.rounds;
        const before = h.length - 1;
        const coop = count(h.slice(0, -1), (r) => r.pi === 'C');
        return h.length > 1 && h[before].pi === 'D' && coop * 2 >= before ? { coop, before, last: h.length } : null;
      },
      write: ({ coop, before, last }) => ({
        thought: `You cooperated in ${coop} of the first ${before} rounds, then defected in round ${last}. Did the end of the match change what cooperation was for?`,
        idea: 'Cooperation in a repeated game leans on the next round. When there isn’t one, only the temptation is left.',
        perspective: 'If both sides reason that way, the last round is lost — and the one before it starts to look like the last round too.',
        question: 'Would you play differently if you didn’t know which round was the last?',
      }),
    }),
    rule({
      id: 'answered',
      tier: 2,
      when: (s: CoopState) => {
        const h = s.rounds;
        const round = firstRound(h, (r, i) => i > 0 && h[i - 1].b === 'D' && h[i - 1].p === 'C' && r.pi === 'D');
        return round ? { round, prev: round - 1 } : null;
      },
      write: ({ round, prev }) => ({
        thought: `When your cooperation met a defection in round ${prev}, you answered with one in round ${round}. What did you want your opponent to take from it?`,
        idea: 'An answer makes defection costly. Reciprocity — returning what you receive — is one of the most reliable ways to keep a repeated game honest.',
        perspective: 'An answer is only useful if it ends. If both sides keep answering the last defection, nobody returns to cooperation.',
        question: 'After answering, what would you need to see before cooperating again?',
      }),
    }),
    rule({
      id: 'mutual-coop-run',
      tier: 2,
      when: (s: CoopState) => {
        const [len, start] = longestRun(s.rounds, (r) => r.p === 'C' && r.b === 'C');
        return len >= 4 ? { len, start, end: start + len - 1 } : null;
      },
      write: ({ len, start, end }) => ({
        thought: `You cooperated together for ${len} rounds, ${start} to ${end}. Either of you could have gained by defecting once — what held it together?`,
        idea: 'Mutual cooperation is never safe in a single round. It survives because each side values the rounds still to come.',
        perspective: 'A long run builds trust, and also makes a surprise defection more profitable for whoever breaks it first.',
        question: 'What would make you suspicious of a partner who had cooperated every round?',
      }),
    }),
    rule({
      id: 'mutual-defection-run',
      tier: 2,
      when: (s: CoopState) => {
        const [len, start] = longestRun(s.rounds, (r) => r.p === 'D' && r.b === 'D');
        return len >= 3 ? { len, start, end: start + len - 1 } : null;
      },
      write: ({ len, start, end }) => ({
        thought: `Rounds ${start} to ${end} were ${len} mutual defections in a row. Each was safe on its own — so what would it have taken for one of you to try cooperating first?`,
        idea: 'Mutual defection is stable: neither side gains by switching alone. Escaping it costs whoever moves first.',
        perspective: 'One round of risk could reopen cooperation; it could also be one more round of being exploited.',
        question: 'How would you signal that you’re ready to cooperate, without being the one who pays for it?',
      }),
    }),
  ],
  general: {
    thought: 'Every round here was both a choice and a message about the next one. What were your choices saying?',
    idea: 'In a repeated prisoner’s dilemma, the future gives cooperation its value: what you do now changes what the other side expects.',
    perspective: 'Cooperating builds trust that can pay over many rounds; defecting is safer in any single one.',
    question: 'What would you change if you knew you’d meet this opponent again tomorrow?',
  },
};

// ── The Ultimatum Game (arena) ──────────────────────────────────────────────

const walkText = (w: number) => (w > 0 ? `your walk-away of ${w}` : 'nothing');

export const ULTIMATUM_GAME: GameReflections<UltState> = {
  game: 'ultimatum-game',
  lesson: 'bargaining',
  rules: [
    rule({
      id: 'refused-gain',
      tier: 1,
      when: (s: UltState) => {
        const round = firstRound(s.rounds, (r) => r.proposer === 'bot' && !r.accepted && r.offer > r.walkPlayer);
        const r = s.rounds[round - 1];
        return round ? { round, offer: r.offer, pool: r.pool, walk: r.walkPlayer } : null;
      },
      write: ({ round, offer, pool, walk }) => ({
        thought: `In round ${round} you refused ${offer} of a ${pool}-token pool and took ${walkText(walk)} instead. What was that refusal worth to you?`,
        idea: 'A rejection costs the responder something real. It only makes sense if fairness, a message, or the next offer matters more.',
        perspective: 'Accepting would have paid more this round. Refusing may change how the next offer looks — or may not.',
        question: 'Would you have refused the same offer in the very last round?',
      }),
    }),
    rule({
      id: 'walked-away',
      tier: 1,
      when: (s: UltState) => {
        const round = firstRound(s.rounds, (r) => r.proposer === 'bot' && !r.accepted && r.offer <= r.walkPlayer && r.walkPlayer > 0);
        const r = s.rounds[round - 1];
        return round ? { round, offer: r.offer, walk: r.walkPlayer } : null;
      },
      write: ({ round, offer, walk }) => ({
        thought: `In round ${round}, your walk-away of ${walk} was worth at least the offer of ${offer}, so refusing cost you nothing. How did knowing your outside option change what you’d accept?`,
        idea: 'Bargaining power comes from what you get if talks fail. A good outside option lets you say no cheaply.',
        perspective: 'The other side knows your walk-away too. An offer just above it is hard to refuse.',
        question: 'How would you propose to someone whose walk-away was larger than yours?',
      }),
    }),
    rule({
      id: 'offer-refused',
      tier: 1,
      when: (s: UltState) => {
        const round = firstRound(s.rounds, (r) => r.proposer === 'player' && !r.accepted);
        const r = s.rounds[round - 1];
        return round ? { round, offer: r.offer, pool: r.pool } : null;
      },
      write: ({ round, offer, pool }) => ({
        thought: `Your offer of ${offer} from a ${pool}-token pool in round ${round} was refused. An offer can be profitable on paper and still be rejected — what do you think mattered most?`,
        idea: 'A responder weighs the offer against what refusing costs them, and against how the split looks.',
        perspective: 'A leaner offer keeps more when it lands. Each refusal costs you the whole round.',
        question: 'What would you need to know about the other side to choose an offer with confidence?',
      }),
    }),
    rule({
      id: 'lean-accepted',
      tier: 2,
      when: (s: UltState) => {
        const round = firstRound(s.rounds, (r) => r.proposer === 'player' && r.accepted && r.offer * 4 <= r.pool);
        const r = s.rounds[round - 1];
        return round ? { round, offer: r.offer, pool: r.pool } : null;
      },
      write: ({ round, offer, pool }) => ({
        thought: `In round ${round}, you offered ${offer} of ${pool} and it was accepted. How sure were you, before the answer came back?`,
        idea: 'When refusing costs the responder more than accepting, the proposer holds most of the power — on paper.',
        perspective: 'A lean offer that lands looks clever. The same offer to a different responder could leave you with nothing.',
        question: 'How would you find out how low you can go without paying for the experiment?',
      }),
    }),
    rule({
      id: 'generous',
      tier: 2,
      when: (s: UltState) => {
        const mine = s.rounds.filter((r) => r.proposer === 'player');
        return mine.length >= 2 && mine.every((r) => r.offer * 2 >= r.pool) ? { offers: mine.length } : null;
      },
      write: ({ offers }) => ({
        thought: `In all ${offers} of your proposals, you gave away at least half the pool. Was that fairness, or insurance against a refusal?`,
        idea: 'An even split is easy to accept and hard to resent. It trades some money for certainty.',
        perspective: 'Against a responder who would take less, generosity leaves tokens on the table.',
        question: 'What would you learn by offering a little less, once?',
      }),
    }),
  ],
  general: {
    thought: 'Who gets what depends on what happens if the deal falls apart. How much did that shape your choices?',
    idea: 'In the Ultimatum Game, the proposer moves first but the responder holds a veto. Walk-away values tilt the balance.',
    perspective: 'A purely money-minded responder accepts anything above their walk-away; real people often refuse splits that feel unfair.',
    question: 'How would you bargain if both walk-away values were zero?',
  },
};

// ── The Auction House ───────────────────────────────────────────────────────
// Sealed first-price bids; seat 0 is the player. Values and estimates are revealed after each lot.

export const AUCTION: GameReflections<AuctionState> = {
  game: 'auction',
  lesson: 'auctions',
  rules: [
    rule({
      id: 'won-at-a-loss',
      tier: 1,
      when: (s: AuctionState) => {
        const lot = firstRound(s.rounds, (r) => r.winner === 0 && r.price > r.value);
        const r = s.rounds[lot - 1];
        return lot ? { lot, name: r.lot.name, price: r.price, value: r.value } : null;
      },
      write: ({ name, price, value }) => ({
        thought: `You won the ${name} for ${price}, but it turned out to be worth ${value}. Winning the auction and making a good deal weren’t the same thing — what made that bid feel right?`,
        idea: 'The winner of a common-value auction is often the bidder whose estimate ran highest. Winning is itself a hint that you may have overestimated.',
        perspective: 'Bidding cautiously avoids overpaying, but it also means losing lots that would have been profitable.',
        question: 'How would you adjust a bid knowing that winning means you were the most optimistic in the room?',
      }),
    }),
    rule({
      id: 'above-estimate',
      tier: 1,
      when: (s: AuctionState) => {
        const lot = firstRound(s.rounds, (r) => r.bids[0] > r.estimates[0]);
        const r = s.rounds[lot - 1];
        return lot ? { lot, name: r.lot.name, bid: r.bids[0], estimate: r.estimates[0] } : null;
      },
      write: ({ name, bid, estimate }) => ({
        thought: `On the ${name}, you bid ${bid} with an estimate of ${estimate}. What pushed you above your own estimate?`,
        idea: 'Competition pulls bids up. The question is whether you are bidding against the lot or against the other bidders.',
        perspective: 'Your estimate could be low, and a higher bid might be right. It could also be the pressure of the room talking.',
        question: 'What would you need to believe about the lot to bid above your estimate again?',
      }),
    }),
    rule({
      id: 'won-with-profit',
      tier: 2,
      when: (s: AuctionState) => {
        const lot = firstRound(s.rounds, (r) => r.winner === 0 && r.price < r.value);
        const r = s.rounds[lot - 1];
        return lot ? { lot, name: r.lot.name, price: r.price, value: r.value } : null;
      },
      write: ({ name, price, value }) => ({
        thought: `You won the ${name} for ${price}, and it was worth ${value}. Did you know how much room you had when you placed that bid?`,
        idea: 'A profitable win balances two risks: bidding too low and losing, or bidding too high and overpaying.',
        perspective: 'The same bid on a lot you’d misjudged could have been a loss. A good result doesn’t always mean a safe bid.',
        question: 'Would you bid the same on a lot with a wider range of estimates?',
      }),
    }),
    rule({
      id: 'won-nothing',
      tier: 2,
      when: (s: AuctionState) => (s.rounds.length && s.rounds.every((r) => r.winner !== 0) ? { lots: s.rounds.length } : null),
      write: ({ lots }) => ({
        thought: `You didn’t win any of the ${lots} lots. Was that discipline, or did the room keep valuing things more than you did?`,
        idea: 'Not winning protects you from overpaying. It also means zero profit.',
        perspective: 'If every lot went for more than it was worth, staying out was the profitable choice. If not, caution had a cost.',
        question: 'Looking back at the revealed values, which lot would you have liked to win — and at what price?',
      }),
    }),
  ],
  general: {
    thought: 'Winning the auction and making a good deal aren’t necessarily the same thing. How did your bids balance those goals?',
    idea: 'Every bidder sees only an estimate. In a sealed auction, the highest estimate tends to win — and it is often too high.',
    perspective: 'Shading bids protects you from overpaying, but shading too much hands the lots to everyone else.',
    question: 'How does your bid change when more bidders are in the room?',
  },
};

// ── Market Rivals ───────────────────────────────────────────────────────────
// Three firms set prices each round; seat 0 is the player.

export const MARKET: GameReflections<MarketState> = {
  game: 'market',
  lesson: 'market-competition',
  rules: [
    rule({
      id: 'below-cost',
      tier: 1,
      when: (s: MarketState) => {
        const round = firstRound(s.rounds, (r) => r.profits[0] < 0);
        const r = s.rounds[round - 1];
        return round ? { round, price: r.prices[0], cost: r.cond.cost } : null;
      },
      write: ({ round, price, cost }) => ({
        thought: `In round ${round} you priced at ${price} with a unit cost of ${cost}, so every sale lost money. What were you trying to win with that price?`,
        idea: 'Pricing below cost can win customers, but each one costs you. It only pays if it changes what rivals do later.',
        perspective: 'Rivals may answer a low price with their own cuts, turning one round’s sacrifice into a market-wide price war.',
        question: 'What would your rivals need to do afterwards for that round to have been worth it?',
      }),
    }),
    rule({
      id: 'cut-then-rivals',
      tier: 1,
      when: (s: MarketState) => {
        const h = s.rounds;
        const round = firstRound(h, (r, i) => i > 0 && i < h.length - 1 && r.prices[0] < h[i - 1].prices[0] && Math.min(...h[i + 1].prices.slice(1)) < Math.min(...r.prices.slice(1)));
        if (!round) return null;
        const r = h[round - 1];
        return { round, from: h[round - 2].prices[0], to: r.prices[0], rivalBefore: Math.min(...r.prices.slice(1)), rivalAfter: Math.min(...h[round].prices.slice(1)) };
      },
      write: ({ round, from, to, rivalBefore, rivalAfter }) => ({
        thought: `You cut your price from ${from} to ${to} in round ${round}, and the next round the lowest rival price fell from ${rivalBefore} to ${rivalAfter}. Coincidence, or a reaction?`,
        idea: 'Your price didn’t exist in isolation: each firm’s best price depends on what the others charge.',
        perspective: 'Rivals might have cut anyway. One round is thin evidence of who is reacting to whom.',
        question: 'How would you test whether your rivals follow your prices?',
      }),
    }),
    rule({
      id: 'cheapest',
      tier: 2,
      when: (s: MarketState) => {
        const k = count(s.rounds, (r) => r.prices[0] < Math.min(...r.prices.slice(1)));
        return s.rounds.length && k * 2 >= s.rounds.length ? { k, n: s.rounds.length } : null;
      },
      write: ({ k, n }) => ({
        thought: `You had the lowest price in ${k} of ${n} rounds. Did the extra customers make up for the thinner margin?`,
        idea: 'A lower price trades margin for volume. Whether that pays depends on how sensitive customers are, and how rivals respond.',
        perspective: 'Being the cheapest also sets the bar your rivals react to.',
        question: 'What would happen to your profit if one rival matched your price every round?',
      }),
    }),
    rule({
      id: 'priced-high',
      tier: 2,
      when: (s: MarketState) => {
        const k = count(s.rounds, (r) => r.prices[0] > Math.max(...r.prices.slice(1)));
        return s.rounds.length && k * 2 >= s.rounds.length ? { k, n: s.rounds.length } : null;
      },
      write: ({ k, n }) => ({
        thought: `You charged the highest price in ${k} of ${n} rounds. Were you holding out for margin, or hoping rivals would come up to meet you?`,
        idea: 'A high price earns more per sale and fewer sales. It can also be an invitation for rivals to stop undercutting.',
        perspective: 'If rivals don’t follow, a high price mostly hands them customers.',
        question: 'How long would you hold a high price before deciding no one was following?',
      }),
    }),
  ],
  general: {
    thought: 'Your price didn’t exist in isolation. What mattered about the choices your competitors made?',
    idea: 'In a market with rivals, every price changes everyone else’s best reply. Profit comes from the whole pattern, not one move.',
    perspective: 'Undercutting wins share in the moment; matching or holding can keep prices — and profits — higher for everyone.',
    question: 'What would you try if your rivals copied your last price?',
  },
};

// ── The Hidden Signal ───────────────────────────────────────────────────────
// Roles alternate. Every venture's true state is revealed after its round.

const SIGNAL_NAME = { warn: 'a warning', pitch: 'a pitch', stake: 'a stake' } as const;

export const SIGNAL: GameReflections<SignalState> = {
  game: 'signal',
  lesson: 'signaling',
  rules: [
    rule({
      id: 'trusted-free-pitch',
      tier: 1,
      when: (s: SignalState) => {
        const round = firstRound(s.rounds, (r) => r.sender === 'bot' && r.signal === 'pitch' && r.invested && !r.strong);
        return round ? { round } : null;
      },
      write: ({ round }) => ({
        thought: `In round ${round} you invested on a pitch, and the venture was Weak. What made that signal convincing: the message itself, or what you expected the sender to gain from sending it?`,
        idea: 'A signal’s content and the incentive behind it are different things. A claim that costs nothing to make says less than one that costs the sender when it’s false.',
        perspective: 'Free claims aren’t worthless: an honest sender uses them too. The question is how often they were honest here.',
        question: 'What would a sender need to risk for you to believe them without a test?',
      }),
    }),
    rule({
      id: 'test-vs-signal',
      tier: 1,
      when: (s: SignalState) => {
        const round = firstRound(s.rounds, (r) => r.sender === 'bot' && r.tested && r.test !== null && r.test !== (r.signal !== 'warn'));
        const r = s.rounds[round - 1];
        return round ? { round, signal: SIGNAL_NAME[r.signal], invested: r.invested ? 1 : 0 } : null;
      },
      write: ({ round, signal, invested }) => ({
        thought: `In round ${round} your test disagreed with ${signal}, and you ${invested ? 'invested' : 'passed'}. Which did you lean on more — the sender’s word or your own evidence?`,
        idea: 'Two imperfect sources can disagree. Weighing them means asking how reliable each is, and why the sender said what they said.',
        perspective: 'A test is right most of the time, not every time. A sender may know more — and may also have a reason to shade it.',
        question: 'How would your answer change if the test were less accurate?',
      }),
    }),
    rule({
      id: 'your-bluff',
      tier: 1,
      when: (s: SignalState) => {
        const round = firstRound(s.rounds, (r) => r.sender === 'player' && !r.strong && r.signal !== 'warn');
        const r = s.rounds[round - 1];
        return round ? { round, signal: SIGNAL_NAME[r.signal], believed: r.invested ? 1 : 0 } : null;
      },
      write: ({ round, signal, believed }) => ({
        thought: `In round ${round} you sent ${signal} on a Weak venture, and ${believed ? 'it was believed' : 'they passed anyway'}. Once the truth was revealed, what did that round say about your next signal?`,
        idea: 'Every revealed round becomes part of your record. A signal is only as credible as the sender’s history makes it.',
        perspective: 'A bluff earns the fee now; honest signals earn belief later. Which is worth more depends on how many rounds are left.',
        question: 'How would you rebuild credibility after a bluff was exposed?',
      }),
    }),
    rule({
      id: 'honest-warnings',
      tier: 2,
      when: (s: SignalState) => {
        const k = count(s.rounds, (r) => r.sender === 'player' && !r.strong && r.signal === 'warn');
        return k >= 2 ? { k } : null;
      },
      write: ({ k }) => ({
        thought: `You warned honestly about a Weak venture ${times(k)}, giving up the fee each time. What were you building with those warnings?`,
        idea: 'Honesty that costs something is what gives later signals weight. A reputation is built from rounds where lying would have paid.',
        perspective: 'A reputation only pays if there are enough rounds left to spend it.',
        question: 'When, if ever, would you spend that reputation?',
      }),
    }),
    rule({
      id: 'passed-strong',
      tier: 2,
      when: (s: SignalState) => {
        const round = firstRound(s.rounds, (r) => r.sender === 'bot' && !r.invested && r.strong);
        const r = s.rounds[round - 1];
        return round ? { round, signal: SIGNAL_NAME[r.signal], prior: Math.round(r.prior * 100) } : null;
      },
      write: ({ round, signal, prior }) => ({
        thought: `In round ${round} you passed after ${signal}, with a ${prior}% prior, and the venture was Strong. What would it have taken to convince you?`,
        idea: 'Passing protects you from a loss and gives up a gain. Every decision under uncertainty trades one error for the other.',
        perspective: 'A pass that misses a good venture can still be a sound decision given what you knew at the time.',
        question: 'Which error would you rather make more often: investing in a Weak venture, or passing on a Strong one?',
      }),
    }),
  ],
  general: {
    thought: 'A signal can be informative or empty. What made a message worth believing in this match?',
    idea: 'The sender knows the truth and wants investment either way. Signals that are costly to fake carry the most information.',
    perspective: 'Ignoring every signal is safe but throws away information. Believing every signal hands the sender control.',
    question: 'What kind of message would you trust from someone who profits whatever you decide?',
  },
};
