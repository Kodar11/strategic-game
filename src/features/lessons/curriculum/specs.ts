import type { CharacterId, Expression } from '../../../components/characters/cast.ts';
import type { Analogy, TransferOption } from '../../../components/lesson/TransferQuestion.tsx';
import type { LessonId } from '../../../content/lessons.ts';

/**
 * Content for the curriculum lessons built on the shared lesson runner (Lessons 2, 3, 6–9, 11–13, 15–22).
 * Each lesson: intro and strategic question → scenario A (play the mechanism) → a lab that names the concept →
 * scenario B (change an assumption) → scenario C (transfer) → a transfer check → completion.
 * The five original lessons keep their own components and add their paired scenarios before completion.
 */

export interface Line {
  character: CharacterId;
  expression?: Expression;
  text: string;
  align?: 'left' | 'right';
}

export interface CurriculumLessonSpec {
  id: LessonId;
  intro: { kicker?: string; title: string; body: string; lines: Line[] };
  /** The strategic question the lesson answers, shown on the intro. */
  question: string;
  objectives: string[];
  concept: { title: string; line: Line; panels: { tone: 'insight' | 'info' | 'caution'; title: string; body: string }[] };
  transfer: { question: string; options: TransferOption[]; analogy: Analogy };
  completion: { takeaway: string; remember: string[]; reflection: string; nextHook: string };
}

export const CURRICULUM_LESSONS: Partial<Record<LessonId, CurriculumLessonSpec>> = {
  'iterated-dominance': {
    id: 'iterated-dominance',
    intro: {
      title: 'Read the table like a detective',
      body: 'A payoff table lists what every combination of choices pays each player. Most of the work is ruling things out.',
      lines: [
        { character: 'meera', expression: 'explaining', text: 'Before predicting what anyone does, find the moves nobody sensible would make.' },
        { character: 'aarav', expression: 'curious', text: 'And once those are gone, the table gets smaller?', align: 'right' },
      ],
    },
    question: 'Which options can you rule out without knowing what the other side will do?',
    objectives: ['Read a payoff matrix column by column.', 'Spot strictly dominant and dominated actions.', 'Delete dominated options in rounds — and know why weak dominance needs care.'],
    concept: {
      title: 'Dominance and iterated deletion',
      line: { character: 'sen', expression: 'explaining', text: 'An action is strictly dominated if another action pays more against every choice of the other side. Rational players never use it — and if everyone knows that, you can delete it and look again.' },
      panels: [
        { tone: 'insight', title: 'Round by round', body: 'Deleting one player’s dominated options can make another player’s option dominated. Each round adds one more layer of “they know that I know they’re rational”.' },
        { tone: 'caution', title: 'Weak dominance needs care', body: 'An action that is never better and sometimes worse is only weakly dominated. Deleting weakly dominated options in different orders can leave different results. Rows T, M, B against columns L, R, with payoffs T (1, 1) (0, 0), M (1, 1) (2, 1), B (0, 0) (2, 1): delete T first and the row player ends with 2; delete B first and they end with 1. Strict dominance never has that problem.' },
      ],
    },
    transfer: {
      question: 'A café can open at 7, 8 or 9 a.m. Whatever the rival café does, opening at 9 earns less than opening at 8. What can you conclude?',
      options: [
        { id: 'drop-9', label: 'Opening at 9 can be ruled out, whatever the rival does', verdict: 'strong', feedback: '8 beats 9 against every rival choice, so 9 is dominated. You can drop it before thinking about the rival at all.' },
        { id: 'choose-8', label: 'Opening at 8 is the best choice', verdict: 'defensible', feedback: '8 beats 9, but nothing here compares 8 with 7. Dominance rules options out; it doesn’t always pick the winner.' },
        { id: 'depends', label: 'Nothing — it depends on the rival', verdict: 'misconception', feedback: 'Some conclusions don’t depend on the rival: an option that loses against every rival choice can go.' },
      ],
      analogy: { holds: 'Comparing two options against each of the other side’s choices is exactly the column-by-column check.', differs: 'Real choices often come with more options and uncertain payoffs, so dominance is rarer than in textbook tables.' },
    },
    completion: {
      takeaway: 'Rule out what nobody would play, round by round. What survives is what you need to think about.',
      remember: ['Compare actions against each opponent choice separately.', 'Deleting one side’s dominated options can expose dominated options for the other.', 'Strict dominance is safe in any order; weak dominance isn’t.'],
      reflection: 'Think of a decision where one option was worse than another in every circumstance. Did you notice it at the time?',
      nextHook: 'Elimination doesn’t always pick an answer. Next: best replies, and the outcomes nobody wants to leave.',
    },
  },
  'best-response': {
    id: 'best-response',
    intro: {
      title: 'What’s your best move — if you knew theirs?',
      body: 'Most games have no dominant strategy. Your best choice depends on what the other side does, and theirs on yours.',
      lines: [
        { character: 'rohan', expression: 'confident', text: 'You can’t know where I’ll park. So how will you choose?' },
        { character: 'aarav', expression: 'thinking', text: 'I can work out my best spot for each place he might go.', align: 'right' },
      ],
    },
    question: 'Which outcomes are stable — where nobody would change their own choice?',
    objectives: ['Find the best reply to each choice of the other side.', 'Identify pure-strategy Nash equilibria as mutual best replies.', 'Separate stability from fairness and efficiency.'],
    concept: {
      title: 'Best replies and Nash equilibrium',
      line: { character: 'sen', expression: 'explaining', text: 'A Nash equilibrium is a set of choices in which each one is a best reply to the others. Nobody can do better by changing only their own choice.' },
      panels: [
        { tone: 'insight', title: 'Mutual best replies', body: 'Ring each player’s best reply in every row and column. A cell with both payoffs ringed is an equilibrium.' },
        { tone: 'caution', title: 'Stable isn’t the same as good', body: 'An equilibrium can be unfair, inefficient or worse for everyone than another outcome. Some games have several equilibria — and some, like the penalty kick, have none in fixed choices.' },
      ],
    },
    transfer: {
      question: 'Two neighbours both play loud music on Saturday nights. Each would be slightly happier quiet if the other is quiet, but plays loud if the other does. Right now both play loud. Is this stable?',
      options: [
        { id: 'stable', label: 'Yes — neither gains by turning it down alone, even though both quiet would be better', verdict: 'strong', feedback: 'Against loud music, loud is each one’s best reply, so neither changes alone. Both-quiet is also stable here — and better for both.' },
        { id: 'unstable', label: 'No — both would prefer quiet', verdict: 'misconception', feedback: 'Both preferring a different outcome doesn’t make this one unstable: getting there needs both to change at once.' },
        { id: 'unique', label: 'Yes, and it’s the only stable outcome', verdict: 'defensible', feedback: 'It is stable, but not the only one: if both were quiet, neither would want to start playing loud.' },
      ],
      analogy: { holds: 'Stability means each choice is a best reply to the other.', differs: 'Neighbours can talk, so they may coordinate on the better equilibrium — something the one-shot game leaves out.' },
    },
    completion: {
      takeaway: 'Find each side’s best reply to the other. Where the replies meet, you have an outcome nobody will undo alone.',
      remember: ['A best reply is the best action against one specific choice of the other side.', 'Nash equilibrium = everyone choosing a best reply to everyone else.', 'Equilibria need not be fair, efficient or unique — and may not exist in pure strategies.'],
      reflection: 'Can you think of an arrangement at work or at home that is stable even though everyone would prefer something else?',
      nextHook: 'Next: what happens when several outcomes are stable and you have to land on the same one.',
    },
  },
  'market-competition': {
    id: 'market-competition',
    intro: {
      title: 'Every move changes your rival’s best move',
      body: 'In a market with few sellers, how much you make and what you charge change the price and the sales your rival faces.',
      lines: [
        { character: 'rohan', expression: 'confident', text: 'You make more, the price drops for both of us. You cut prices, I lose customers.' },
        { character: 'meera', expression: 'explaining', text: 'So the real question is how each of you responds to the other.', align: 'right' },
      ],
    },
    question: 'How should you compete when your rival’s best response depends on your move?',
    objectives: ['Find best replies in quantity (Cournot) competition.', 'See why identical-product price (Bertrand) competition is so fierce — and when it isn’t.', 'Apply best-reply reasoning to positioning.'],
    concept: {
      title: 'Quantity competition, price competition and positioning',
      line: { character: 'sen', expression: 'explaining', text: 'When firms choose quantities, each one’s best output falls as its rival produces more — and the market settles where both outputs are best replies to each other.' },
      panels: [
        { tone: 'insight', title: 'Cournot equilibrium', body: 'With price 12 − total, your best output is (12 − rival’s) ÷ 2. Both at 4 is the only point where each output is a best reply.' },
        { tone: 'info', title: 'Prices behave differently', body: 'With identical products, the cheaper firm takes the whole market, which drives prices down close to cost. Differentiation — loyalty, location, brand — softens that.' },
      ],
    },
    transfer: {
      question: 'Two bus companies run the same route. One plans to add more buses. What should it expect?',
      options: [
        { id: 'respond', label: 'Its rival will likely run fewer buses or cut fares in response, and fares overall will fall', verdict: 'strong', feedback: 'More capacity lowers the price both can charge; the rival’s best reply adjusts to it.' },
        { id: 'same', label: 'Its rival will carry on exactly as before', verdict: 'misconception', feedback: 'The rival’s best reply depends on how much capacity is on the route.' },
        { id: 'profit', label: 'Its profits will rise in proportion to the extra buses', verdict: 'misconception', feedback: 'Extra capacity pushes fares down for every bus, including the existing ones.' },
      ],
      analogy: { holds: 'Capacity choices work like quantities: more supply lowers the price for everyone.', differs: 'Real routes have timetables, loyal passengers and regulation — differences that soften competition.' },
    },
    completion: {
      takeaway: 'In a market of few rivals, plan your move around their best reply to it — and look for ways not to be identical.',
      remember: ['Cournot: more output from your rival means less from you.', 'Bertrand with identical products drives prices towards cost.', 'Position just beside a fixed rival on the crowded side — or at the median if both can move.'],
      reflection: 'Which businesses near you compete mostly on price, and which avoid it by being different?',
      nextHook: 'Next: what happens when nobody chooses — strategies simply spread or die out.',
    },
  },
  evolution: {
    id: 'evolution',
    intro: {
      title: 'Nobody chooses. Strategies spread.',
      body: 'Sometimes behaviour isn’t chosen in the moment: habits, conventions and instincts spread when they do well and fade when they don’t.',
      lines: [
        { character: 'meera', expression: 'explaining', text: 'Instead of asking “what should I do?”, ask “which behaviours survive in a population?”' },
        { character: 'aarav', expression: 'curious', text: 'So the score depends on who else is out there.', align: 'right' },
      ],
    },
    question: 'Which mixes of strategies last, and which can be invaded?',
    objectives: ['Track how strategy shares change when better-earning strategies grow.', 'Identify evolutionarily stable strategies and mixes.', 'Tell mixed-strategy equilibrium apart from evolutionary stability.'],
    concept: {
      title: 'Evolutionary stability',
      line: { character: 'sen', expression: 'explaining', text: 'A strategy — or mix — is evolutionarily stable if a small group doing something else earns less and fades away.' },
      panels: [
        { tone: 'insight', title: 'Population, not person', body: 'In Hawk–Dove no animal randomises. The population’s proportions settle at 2/3 hawks because that’s where both types earn the same.' },
        { tone: 'caution', title: 'Not every equilibrium is stable', body: 'In the driving game, 50/50 is a mixed Nash equilibrium, but any tilt tips the whole population to one side. Mixed equilibrium (Lesson 5) and evolutionary stability are different tests.' },
      ],
    },
    transfer: {
      question: 'A new messaging app is used by 5% of a school. It’s better, but only useful if your friends use it too. What’s likely?',
      options: [
        { id: 'fade', label: 'It probably fades unless a large enough group switches together', verdict: 'strong', feedback: 'Like the rare Reciprocators, a small group mostly meets people on the old app. It needs a cluster above the tipping point.' },
        { id: 'win', label: 'It wins, because it’s better', verdict: 'misconception', feedback: 'Being better when everyone uses it doesn’t help much when almost nobody does.' },
        { id: 'half', label: 'It settles at half the school', verdict: 'misconception', feedback: 'When matching pays, mixed shares are unstable: the population tips one way.' },
      ],
      analogy: { holds: 'Payoffs depend on what others use, and the majority habit earns more.', differs: 'People can coordinate deliberately — a class switching together — which population models leave out.' },
    },
    completion: {
      takeaway: 'What spreads is what earns more against the current mix. Stable mixes are the ones small invasions can’t break.',
      remember: ['Success depends on the population you face.', 'An ESS resists a small group of alternatives.', 'A mixed equilibrium can be unstable as a population mix.'],
      reflection: 'Which convention around you is stable mainly because everyone else follows it?',
      nextHook: 'Next module: timing. What changes when the other side sees your move before choosing theirs?',
    },
  },
  'sequential-moves': {
    id: 'sequential-moves',
    intro: {
      title: 'Think from the end',
      body: 'When moves happen in order and each player sees what came before, the right way to plan is backwards.',
      lines: [
        { character: 'meera', expression: 'explaining', text: 'Draw the moves as a tree. Start at the last decision and ask what that player will do.' },
        { character: 'aarav', expression: 'thinking', text: 'Then the one before knows that, and so on back to me.', align: 'right' },
      ],
    },
    question: 'How do you choose an early move when others will respond to it?',
    objectives: ['Represent a sequential game as a tree.', 'Solve it by backward induction (subgame-perfect equilibrium).', 'Separate the formal prediction from how people often behave.'],
    concept: {
      title: 'Backward induction and subgame perfection',
      line: { character: 'sen', expression: 'explaining', text: 'Solve the last decisions first, replace them by their outcomes, and work back to the start. The plan you get — what each player does at every point, even ones never reached — is a subgame-perfect equilibrium.' },
      panels: [
        { tone: 'insight', title: 'Moving first can be an advantage', body: 'A visible commitment changes the follower’s best reply. The Stackelberg leader earns 18 where simultaneous play gave 16.' },
        { tone: 'caution', title: 'Theory vs behaviour', body: 'In the growing-pot game, backward induction says take at once. In experiments most people pass at least once. A prediction about perfectly rational players is not a prediction about everyone.' },
      ],
    },
    transfer: {
      question: 'You’re selling a car and will name a price; the buyer can accept, or walk away and buy a similar car elsewhere for 9,000. What should guide your price?',
      options: [
        { id: 'outside', label: 'What the buyer can get elsewhere: up to 9,000 if the cars are equal', verdict: 'strong', feedback: 'Working back from the buyer’s choice: they accept if your price is no worse than their alternative.' },
        { id: 'cost', label: 'What I paid for the car', verdict: 'misconception', feedback: 'Your past cost doesn’t change what the buyer will accept.' },
        { id: 'high', label: 'As high as possible — they can negotiate down', verdict: 'defensible', feedback: 'With bargaining that might work, but here the buyer only accepts or walks away.' },
      ],
      analogy: { holds: 'You move first and should anticipate the response, as in the bonus split.', differs: 'Real buyers may counteroffer, and you may not know their alternative.' },
    },
    completion: {
      takeaway: 'When others respond to your move, solve their response first — then choose the move whose response you like best.',
      remember: ['Game trees show who moves when and what they know.', 'Backward induction gives the subgame-perfect equilibrium.', 'Real players don’t always follow it — check who you face.'],
      reflection: 'Think of a decision where your first move shaped someone else’s options. Did you plan it backwards?',
      nextHook: 'Next: threats. Backward induction will tell you which ones to believe.',
    },
  },
  credibility: {
    id: 'credibility',
    intro: {
      title: 'Words are cheap',
      body: 'Threats and promises are about the future. Whether they work depends on what the speaker will want to do when the future arrives.',
      lines: [
        { character: 'rohan', expression: 'confident', text: 'Enter my market and you’ll regret it.' },
        { character: 'aarav', expression: 'skeptical', text: 'Would he really hurt himself to hurt me?', align: 'right' },
      ],
    },
    question: 'When does a threat actually change what the other side does?',
    objectives: ['Test threats with backward induction.', 'See how a real commitment changes future incentives.', 'Tell credible threats from empty ones in new settings.'],
    concept: {
      title: 'Credible threats and commitment',
      line: { character: 'sen', expression: 'explaining', text: 'A threat is credible when carrying it out is the threatener’s best choice at that point. A commitment makes it credible by changing those later payoffs — or removing the option to back down.' },
      panels: [
        { tone: 'insight', title: 'What made the capacity threat work', body: 'Spare capacity made a price war pay you 4 instead of 2, more than sharing. The entrant could see it, so stayed out.' },
        { tone: 'caution', title: 'Irreversible isn’t enough', body: 'Spending money only helps if it changes the comparison you’ll face later. Sunk spending that leaves “fight vs share” unchanged is just a loss.' },
      ],
    },
    transfer: {
      question: 'A parent tells a teenager: “If you’re home late again, we’re cancelling the family holiday.” The whole family has been looking forward to it. How credible is this?',
      options: [
        { id: 'weak', label: 'Not very — cancelling hurts the parents and siblings too', verdict: 'strong', feedback: 'When the moment comes, cancelling costs the threatener a lot. That makes it tempting to back down — which the teenager can anticipate.' },
        { id: 'strong', label: 'Very — parents have the authority', verdict: 'misconception', feedback: 'Authority makes it possible, not attractive. Ask what the parent will prefer at the time.' },
        { id: 'reputation', label: 'It depends on whether the parents have carried out threats before', verdict: 'defensible', feedback: 'Reputation can matter in repeated settings — but this particular threat is costly to carry out, so it starts weak.' },
      ],
      analogy: { holds: 'The threatened action hurts the threatener, like the supplier cutting off its biggest customer.', differs: 'Families interact repeatedly and care about each other, which can make even costly threats sometimes credible.' },
    },
    completion: {
      takeaway: 'Believe threats that the other side would want to carry out. Make yours credible by changing what you’ll want to do later.',
      remember: ['Use backward induction to test a threat.', 'Commitment works by changing future incentives or options.', 'Reputation in repeated games can change the analysis.'],
      reflection: 'Which threat or promise have you heard recently that wouldn’t pass the backward-induction test?',
      nextHook: 'Next: incentives inside organisations, where one side can’t even see what the other does.',
    },
  },
  bargaining: {
    id: 'bargaining',
    intro: {
      title: 'Who gets what?',
      body: 'Bargaining divides a surplus. What each side gets depends less on fairness speeches and more on what happens if they say no.',
      lines: [
        { character: 'kavya', expression: 'skeptical', text: 'Offer me too little and I’ll walk — even if it costs me.' },
        { character: 'meera', expression: 'explaining', text: 'Then the question is whether walking away is credible, and what it costs.', align: 'right' },
      ],
    },
    question: 'What gives a negotiator power over the split?',
    objectives: ['Compare Ultimatum and Dictator Games, and money-only predictions with observed fairness.', 'Solve alternating offers with delay costs by backward induction.', 'Recognise the hold-up problem.'],
    concept: {
      title: 'Bargaining power: outside options, delay and credible rejection',
      line: { character: 'sen', expression: 'explaining', text: 'Each side accepts any deal at least as good as what it gets by refusing. Change the cost of delay or the outside option, and the split changes with it.' },
      panels: [
        { tone: 'insight', title: 'Delay costs create first-mover power', body: 'When the pie shrinks a lot after each rejection, the first proposer can keep most of it. With many rounds and cheap delay, the split moves towards equal — but in a short game, the last proposer gains power too.' },
        { tone: 'info', title: 'Model vs people', body: 'A money-only model predicts tiny ultimatum offers. Real responders often reject offers they see as unfair, and proposers anticipate it. Kavya’s threshold was an assumption standing in for that.' },
      ],
    },
    transfer: {
      question: 'You’re negotiating a salary. You have a written offer from another firm for 50,000. The employer knows. What sets your bargaining position?',
      options: [
        { id: 'outside', label: 'The 50,000 offer: any deal must beat it for you to accept', verdict: 'strong', feedback: 'Your outside option sets the minimum you accept — and the employer knows it.' },
        { id: 'need', label: 'How much I need the money', verdict: 'misconception', feedback: 'Needing it doesn’t raise what you can demand; if anything, it weakens your willingness to walk.' },
        { id: 'fair', label: 'What would be fair', verdict: 'defensible', feedback: 'Fairness norms can matter in practice, but the credible alternative is what anchors the bargain.' },
      ],
      analogy: { holds: 'Your alternative works like the colleague’s option to escalate: it sets the floor.', differs: 'Real negotiations involve uncertainty about each other’s alternatives and relationships after the deal.' },
    },
    completion: {
      takeaway: 'In bargaining, power comes from what you can do if talks fail — your outside option, your patience, and your credibility in saying no.',
      remember: ['Money-only models predict small offers; real people often punish unfair ones.', 'Backward induction solves alternating offers with delay.', 'Agree terms before making investments that only pay off with one partner.'],
      reflection: 'In your last negotiation, what was your alternative — and did the other side know it?',
      nextHook: 'Next: when the bargaining turns into waiting, and both sides pay for every day.',
    },
  },
  'war-of-attrition': {
    id: 'war-of-attrition',
    intro: {
      title: 'Who blinks first?',
      body: 'Strikes, queues, lawsuits, price wars: sometimes nobody concedes, and both sides pay while they wait for the other to give up.',
      lines: [
        { character: 'rohan', expression: 'frustrated', text: 'I’ve been in this queue for four days. I’m not leaving now.' },
        { character: 'meera', expression: 'explaining', text: 'Those four days are gone either way. The question is tomorrow.', align: 'right' },
      ],
    },
    question: 'When is it worth persisting while the costs pile up?',
    objectives: ['Ignore sunk costs and compare the next round’s cost with its expected gain.', 'Tell a war of attrition apart from an all-pay contest.', 'Account for future pressure when persisting looks bad today.'],
    concept: {
      title: 'Wars of attrition and all-pay contests',
      line: { character: 'sen', expression: 'explaining', text: 'In a war of attrition both pay while waiting, and each hopes the other quits first. Decide by looking forward: is the chance of winning in the next round worth that round’s cost?' },
      panels: [
        { tone: 'insight', title: 'Sunk costs are sunk', body: 'What you’ve already paid is the same whether you quit or stay. Only future costs and chances should move you.' },
        { tone: 'info', title: 'Two different contests', body: 'In a war of attrition you can drop out as you learn. In an all-pay contest you commit once and pay whatever happens.' },
      ],
    },
    transfer: {
      question: 'A firm has spent 2 million on a product that is behind schedule. Finishing will cost 1 million more and has a 30% chance of producing something worth 5 million. What should it consider?',
      options: [
        { id: 'forward', label: 'Only the 1 million to come against the 30% chance of 5 million (1.5 million expected)', verdict: 'strong', feedback: 'Finishing is worth 1.5 million in expectation for 1 million: continue. The 2 million already spent shouldn’t enter the decision.' },
        { id: 'sunk', label: 'The 2 million already spent — we can’t waste it', verdict: 'misconception', feedback: 'The 2 million is spent either way. Letting it drive the decision is the sunk-cost fallacy.' },
        { id: 'total', label: 'Whether 3 million total is less than 5 million', verdict: 'defensible', feedback: 'Close, but it mixes in the sunk 2 million and ignores the 70% chance of failure.' },
      ],
      analogy: { holds: 'Each further stage is a new decision: cost now against the chance of winning.', differs: 'Real projects learn as they go, so later chances may change — like the rising pressure in the strike.' },
    },
    completion: {
      takeaway: 'Persist only while the next round’s chance of winning is worth its cost. What you’ve already paid doesn’t count.',
      remember: ['Sunk costs shouldn’t change your decision.', 'All-pay contests burn up most of the prize in effort.', 'If the other side’s pressure is rising, early losses can be worth taking.'],
      reflection: 'Is there something you’re persisting with mainly because of what you’ve already put in?',
      nextHook: 'Next: what happens when you’ll meet the same people again and again.',
    },
  },
  'repeated-cooperation': {
    id: 'repeated-cooperation',
    intro: {
      title: 'The shadow of the future',
      body: 'In Lesson 1, cooperation collapsed because there was no tomorrow. Most real relationships have one.',
      lines: [
        { character: 'arjun', expression: 'confident', text: 'If you cut corners on me this month, you lose my business next month.' },
        { character: 'aarav', expression: 'thinking', text: 'So today’s gain has to be weighed against all the months after.', align: 'right' },
      ],
    },
    question: 'When can the future make cooperation pay?',
    objectives: ['See how future rounds change today’s incentive to defect.', 'Use the grim-trigger threshold δ ≥ (T − R)/(T − P).', 'See how detection delays and costly punishment weaken cooperation.'],
    concept: {
      title: 'Repeated games and conditional cooperation',
      line: { character: 'sen', expression: 'explaining', text: 'If defecting today costs you cooperation tomorrow, and tomorrow is likely enough, cooperating can be in your own interest. That’s conditional cooperation — not trust, but incentives.' },
      panels: [
        { tone: 'insight', title: 'The threshold', body: 'Against grim trigger, cooperation holds if the chance of another round is at least (5 − 3) ÷ (5 − 1) = 50%.' },
        { tone: 'caution', title: 'Repetition isn’t enough', body: 'Slow detection, a likely end, or a punishment both sides would rather renegotiate away can all break cooperation.' },
      ],
    },
    transfer: {
      question: 'A tourist-area restaurant serves mostly one-time visitors. A neighbourhood café serves the same regulars every day. Which is more likely to keep quality high without inspections?',
      options: [
        { id: 'cafe', label: 'The café — its customers come back and can punish a bad meal', verdict: 'strong', feedback: 'Regulars make the future matter: one bad meal costs many future visits.' },
        { id: 'tourist', label: 'The tourist restaurant — it needs good reviews', verdict: 'defensible', feedback: 'Reviews do create a kind of future — reputation across customers — but each visitor’s own future visits don’t.' },
        { id: 'same', label: 'Both equally', verdict: 'misconception', feedback: 'The difference in repeat business changes the incentive to cut corners.' },
      ],
      analogy: { holds: 'Repeat customers are a partner who responds to your last move.', differs: 'Reviews spread information to new customers, a form of reputation the two-player model leaves out.' },
    },
    completion: {
      takeaway: 'Cooperation can pay when today’s choice changes tomorrow’s treatment — if tomorrow is likely enough and cheating is seen in time.',
      remember: ['Defection gains once; punishment costs every round after.', 'Grim trigger needs δ ≥ (T − R)/(T − P).', 'Detection delays make cheating more tempting.'],
      reflection: 'Which of your own relationships stays cooperative mainly because you’ll meet again?',
      nextHook: 'Next module: information. First, reasoning about how others reason.',
    },
  },
  'bayesian-uncertainty': {
    id: 'bayesian-uncertainty',
    intro: {
      title: 'You can’t see who they are',
      body: 'Competitors, suppliers and partners come in types — tough or soft, reliable or not — and only they know which.',
      lines: [
        { character: 'meera', expression: 'explaining', text: 'You can’t see the type. But you can put a probability on it, and update it when evidence arrives.' },
        { character: 'aarav', expression: 'curious', text: 'And decide on the average, weighted by those chances?', align: 'right' },
      ],
    },
    question: 'How should you decide when the other side’s type is hidden?',
    objectives: ['Compute expected payoffs over hidden types.', 'Update beliefs with Bayes’ rule.', 'Judge whether information is worth its cost.'],
    concept: {
      title: 'Bayesian reasoning',
      line: { character: 'sen', expression: 'explaining', text: 'Start with a prior. When evidence arrives, ask how likely it is under each possibility. The posterior weighs both — and decisions use the posterior.' },
      panels: [
        { tone: 'insight', title: 'Base rates matter', body: 'A late delivery is 3.5 times as likely from an unreliable supplier, yet only 28% of late suppliers are unreliable — because most suppliers are reliable.' },
        { tone: 'info', title: 'Information has a price', body: 'Information is worth buying only if it’s likely to change your decision by more than it costs. An 80%-accurate report was worth 0.56 — less than its price of 1.' },
      ],
    },
    transfer: {
      question: 'A screening test for a rare condition (1 in 1,000 people) is 99% accurate. Someone tests positive. What should they think?',
      options: [
        { id: 'low', label: 'The chance they have it is still well under 50%, because the condition is so rare', verdict: 'strong', feedback: 'Of 1,000 people, about 1 true positive and about 10 false positives: roughly 1 in 11.' },
        { id: '99', label: 'There’s a 99% chance they have it', verdict: 'misconception', feedback: '99% is how often the test is right, not how often a positive is right. The rarity matters.' },
        { id: 'ignore', label: 'Ignore it — rare conditions don’t happen', verdict: 'misconception', feedback: 'The positive result raised the chance from 0.1% to about 9%. That’s worth following up.' },
      ],
      analogy: { holds: 'A base rate combined with how strongly the evidence points each way, exactly like the late supplier.', differs: 'Medical decisions involve follow-up tests and very unequal costs of errors.' },
    },
    completion: {
      takeaway: 'Put probabilities on what you can’t see, update them with evidence, and decide on expected value — while remembering that big losses can matter more than their average.',
      remember: ['Hidden types are about who someone is; hidden actions are about what they did.', 'Posterior ∝ prior × likelihood.', 'Information is worth what it changes, not what it reveals.'],
      reflection: 'When did evidence last change your mind — and by how much should it have?',
      nextHook: 'Next: when the informed side acts to reveal what it knows.',
    },
  },
  signaling: {
    id: 'signaling',
    intro: {
      title: 'Show, don’t tell',
      body: 'Anyone can claim to be good. Some actions are only worth taking if you really are.',
      lines: [
        { character: 'kavya', expression: 'skeptical', text: 'Every seller says their product is great.' },
        { character: 'meera', expression: 'explaining', text: 'So look for what would be too costly for a bad seller to copy.', align: 'right' },
      ],
    },
    question: 'How can one side credibly reveal private information to the other?',
    objectives: ['Identify senders and receivers.', 'Explain why a signal is credible only if it costs types differently.', 'Distinguish signalling (the informed side moves) from screening (the uninformed side designs options).'],
    concept: {
      title: 'Signalling and screening',
      line: { character: 'sen', expression: 'explaining', text: 'A signal separates types when it’s worth sending for one type and not for the other. Then the receiver can read it.' },
      panels: [
        { tone: 'insight', title: 'Separating vs pooling', body: 'If only high types send the signal, it separates. If everyone sends it — or nobody does — it pools, and the receiver learns nothing.' },
        { tone: 'info', title: 'Screening', body: 'When the uninformed side moves first, it designs a menu (plans, contracts) so each type picks the option meant for it.' },
      ],
    },
    transfer: {
      question: 'A startup founder invests most of her own savings in her company before asking investors for money. Why might investors take that seriously?',
      options: [
        { id: 'costly', label: 'It would be very costly for a founder who doubted the company — so it signals confidence', verdict: 'strong', feedback: 'A founder who expected failure would lose more by investing personally. The cost differs by type.' },
        { id: 'money', label: 'It shows she has money', verdict: 'misconception', feedback: 'It does, but what investors want to learn is how good the company is.' },
        { id: 'always', label: 'Personal investment always means a good company', verdict: 'misconception', feedback: 'Not always: an over-optimistic founder might invest too. It’s informative, not proof.' },
      ],
      analogy: { holds: 'A costly action worth taking only for the confident type, like the certificate.', differs: 'Founders can be wrong about their own company, so the “type” is a belief, not a fact.' },
    },
    completion: {
      takeaway: 'Trust actions that would be too costly to fake — and as the uninformed side, design choices that make types reveal themselves.',
      remember: ['Signals work through cost differences between types.', 'Pooling signals carry no information.', 'Screening uses menus to sort types.'],
      reflection: 'What costly signal have you sent — or read — recently?',
      nextHook: 'Next: auctions, where the rules decide how much to reveal in your bid.',
    },
  },
  auctions: {
    id: 'auctions',
    intro: {
      title: 'How much should you bid?',
      body: 'Auctions look simple: highest bid wins. But the rules about what the winner pays change how you should bid.',
      lines: [
        { character: 'maya', expression: 'confident', text: 'I always bid exactly what something is worth to me.' },
        { character: 'meera', expression: 'skeptical', text: 'Sometimes that’s perfect. Sometimes it guarantees you make nothing.', align: 'right' },
      ],
    },
    question: 'How do auction rules and the type of value change the best bid?',
    objectives: ['Shade bids in first-price auctions.', 'Bid your value in second-price private-value auctions (and know the assumptions).', 'Recognise and avoid the winner’s curse in common-value auctions.'],
    concept: {
      title: 'Auction formats and values',
      line: { character: 'sen', expression: 'explaining', text: 'Pay-your-bid auctions reward shading. Second-price auctions make bidding your value weakly dominant — when values are private. When the value is common and uncertain, winning itself is bad news about your estimate.' },
      panels: [
        { tone: 'insight', title: 'Private vs common values', body: 'A camera worth 60 to you is a private value. A jar of coins is worth the same to everyone; only the estimates differ.' },
        { tone: 'caution', title: 'The winner’s curse', body: 'The highest of many estimates is usually too high. Bid as if your estimate were the highest — because if you win, it probably was.' },
      ],
    },
    transfer: {
      question: 'Oil companies bid for drilling rights. Each has its own survey estimate of the oil in the ground. One company wins by a wide margin. What should it suspect?',
      options: [
        { id: 'curse', label: 'Its estimate was probably too optimistic', verdict: 'strong', feedback: 'The oil is worth the same to everyone. Winning by a lot means everyone else estimated less.' },
        { id: 'better', label: 'Its survey was better than the others’', verdict: 'defensible', feedback: 'Possible — but the default inference from winning a common-value auction is over-optimism.' },
        { id: 'bargain', label: 'It got a bargain', verdict: 'misconception', feedback: 'Winning by a wide margin is a warning sign, not evidence of a bargain.' },
      ],
      analogy: { holds: 'A common value with noisy estimates, like the coin jar.', differs: 'Firms can share surveys, form consortia or bid in rounds, which changes the information.' },
    },
    completion: {
      takeaway: 'Bid according to the rules and the kind of value: shade in first-price, bid your value in second-price private auctions, and correct for the winner’s curse when values are common.',
      remember: ['First-price: shade below your value.', 'Second-price, private values: bid your value.', 'Common values: winning tells you your estimate was high.'],
      reflection: 'Have you ever “won” something and then wondered why nobody else wanted it as much?',
      nextHook: 'Next: what happens to whole markets when signals and quality get mixed up.',
    },
  },
  'market-quality': {
    id: 'market-quality',
    intro: {
      title: 'When signals stop meaning anything',
      body: 'Lesson 16 showed how a signal can reveal quality. Here we follow what happens to a market when imitation and hidden quality take over.',
      lines: [
        { character: 'arjun', expression: 'concerned', text: 'Buyers can’t tell good cars from bad. So they offer less. So the good cars leave.' },
        { character: 'sen', expression: 'explaining', text: 'And every step is individually rational.', align: 'right' },
      ],
    },
    question: 'How do imitation and hidden quality change who trades — and what signals mean?',
    objectives: ['Compare pooling and separating outcomes as signal costs change.', 'See how imitation (cascades) removes information from actions.', 'Explain adverse selection and market unravelling.'],
    concept: {
      title: 'Pooling, cascades and adverse selection',
      line: { character: 'sen', expression: 'explaining', text: 'When everyone does the same thing — sends the same signal, copies the same choice — observing them tells you nothing new. When quality is hidden, the price attracts the worst first.' },
      panels: [
        { tone: 'insight', title: 'Who wins, who loses', body: 'High types prefer a separating outcome (8 vs 7); low types prefer pooling (7 vs 4). Changing a signal’s cost changes the distribution, not just the information.' },
        { tone: 'info', title: 'Fixes for hidden quality', body: 'Warranties, inspections, certification and reputation all exist largely to stop markets unravelling.' },
      ],
    },
    transfer: {
      question: 'An insurer offers one health policy at one price to everyone. What happens over time if customers know their own health better than the insurer?',
      options: [
        { id: 'adverse', label: 'Healthier people drop out, costs per customer rise, and the price has to go up', verdict: 'strong', feedback: 'At an average price, healthy customers are overcharged and leave, raising the average cost — adverse selection.' },
        { id: 'stable', label: 'Nothing — the price reflects the average', verdict: 'misconception', feedback: 'The average changes as people decide whether to buy at that price.' },
        { id: 'competition', label: 'Competition between insurers fixes it', verdict: 'defensible', feedback: 'Competition helps with prices, but every insurer faces the same hidden information.' },
      ],
      analogy: { holds: 'The informed side decides whether to participate at a pooled price, like car owners.', differs: 'Insurance can be made compulsory or priced by observable risk factors — tools the car market lacks.' },
    },
    completion: {
      takeaway: 'Signals lose meaning when they’re cheap to imitate, crowds lose information when they copy, and markets shrink when only the informed can see quality.',
      remember: ['Separation needs imitation to be too costly.', 'Cascades make choices uninformative.', 'Adverse selection drives good quality out first.'],
      reflection: 'Where have you seen a signal lose its meaning because everyone started sending it?',
      nextHook: 'Final module: groups. First, coalitions — and why agreed deals still fall apart.',
    },
  },
  coalitions: {
    id: 'coalitions',
    intro: {
      title: 'Who teams up with whom?',
      body: 'Groups create value together — and then have to divide it. Any subgroup that can do better on its own may walk away.',
      lines: [
        { character: 'nina', expression: 'happy', text: 'We all agreed on the split. Done!' },
        { character: 'meera', expression: 'skeptical', text: 'Agreed today. Is there a pair who could do better without the rest?', align: 'right' },
      ],
    },
    question: 'Which allocations can survive the threat of groups breaking away?',
    objectives: ['Use coalition values (a characteristic function).', 'Test allocations against blocking coalitions.', 'Recognise when the core is empty.'],
    concept: {
      title: 'Blocking coalitions and the core',
      line: { character: 'sen', expression: 'explaining', text: 'A coalition blocks a deal if it could earn more on its own than the deal gives its members. Deals no coalition can block form the core.' },
      panels: [
        { tone: 'insight', title: 'Stable means unblockable', body: '“Stable” here has a precise meaning: no group has a better option. It is not the same as everyone saying yes.' },
        { tone: 'info', title: 'Not bargaining between two', body: 'Lesson 11 was about splitting between two sides. Here the threat comes from any subgroup — so a deal must satisfy every pair at once.' },
      ],
    },
    transfer: {
      question: 'Three small airlines share a booking system. Any two could build their own for less than they pay now. Is the current cost-sharing arrangement safe?',
      options: [
        { id: 'unsafe', label: 'No — a pair that pays more than its own system would cost has a reason to leave', verdict: 'strong', feedback: 'That pair is a blocking coalition. A stable arrangement must charge every pair no more than going alone.' },
        { id: 'safe', label: 'Yes — they all signed the contract', verdict: 'misconception', feedback: 'Signing shows agreement, not stability. When the contract ends, a pair can leave.' },
        { id: 'equal', label: 'Yes, if the costs are split equally', verdict: 'misconception', feedback: 'Equal shares can still leave some pair paying more than its own system would cost.' },
      ],
      analogy: { holds: 'Pairs with a better alternative block the deal, like A and B in the project split.', differs: 'Real groups have switching costs and contracts that slow breakaways down.' },
    },
    completion: {
      takeaway: 'Test a deal against every group that could leave together. If some group can always do better, no deal is stable.',
      remember: ['The characteristic function says what each group can secure.', 'A blocking coalition gets more on its own.', 'The core can be empty, as in majority games.'],
      reflection: 'Think of a group project or partnership: could some subset have done better on its own?',
      nextHook: 'Next: when groups decide by voting — and the rules decide the winner.',
    },
  },
  voting: {
    id: 'voting',
    intro: {
      title: 'The rules pick the winner',
      body: 'Same voters, same preferences — different voting rules or a different order of votes can produce a different result.',
      lines: [
        { character: 'arjun', expression: 'thinking', text: 'If I vote for my favourite, I might help my least favourite win.' },
        { character: 'sen', expression: 'explaining', text: 'Then your vote and your preference can come apart.', align: 'right' },
      ],
    },
    question: 'How do voting rules, agendas and coalitions shape collective decisions?',
    objectives: ['Tell sincere from strategic voting.', 'See how agenda control can decide outcomes when majorities cycle.', 'Build a majority under explicit rules.'],
    concept: {
      title: 'Strategic voting and agenda setting',
      line: { character: 'sen', expression: 'explaining', text: 'When majorities cycle — A beats B, B beats C, C beats A — no option beats all others, and whoever sets the order of votes can steer the result.' },
      panels: [
        { tone: 'insight', title: 'A majority outcome isn’t inevitable', body: 'Each agenda produced a different winner from the same three voters. The procedure did the deciding.' },
        { tone: 'info', title: 'Sophisticated voters push back', body: 'Voters who look ahead can partly undo agenda tricks — but no reasonable voting rule removes strategic voting entirely.' },
      ],
    },
    transfer: {
      question: 'A club picks its next trip — beach, mountains or a city break — by two pairwise votes, and the organiser, who loves the city, sets the order. If members vote sincerely and majorities cycle, which order favours the city?',
      options: [
        { id: 'last', label: 'Hold the city back for the final vote against the option it beats', verdict: 'strong', feedback: 'With cyclic majorities, the option kept to the end and pitted against the one it beats wins.' },
        { id: 'first', label: 'Put the city in the first vote to build momentum', verdict: 'misconception', feedback: 'Entering early means the city must beat two options in a row — which a cycle rules out.' },
        { id: 'none', label: 'Order doesn’t matter — the majority decides', verdict: 'misconception', feedback: 'With cyclic majorities, order is exactly what decides.' },
      ],
      analogy: { holds: 'Pairwise votes with a chair choosing the order, as in the committee.', differs: 'Members may vote strategically or demand a different procedure.' },
    },
    completion: {
      takeaway: 'Ask what your vote changes, check whether majorities cycle, and watch who controls the procedure.',
      remember: ['Sincere and strategic votes can differ.', 'Cyclic majorities give agenda setters power.', 'A proposal passes only if a majority prefers it to the default.'],
      reflection: 'In a group decision you were part of, who decided the order of choices — and did it matter?',
      nextHook: 'Next: standoffs where each side raises the risk on purpose.',
    },
  },
  brinkmanship: {
    id: 'brinkmanship',
    intro: {
      title: 'Going to the edge',
      body: 'Some conflicts are won by being willing to create risk — a danger neither side fully controls.',
      lines: [
        { character: 'maya', expression: 'confident', text: 'If I make the situation dangerous enough, you’ll back down first.' },
        { character: 'aarav', expression: 'concerned', text: 'Unless the danger gets us both.', align: 'right' },
      ],
    },
    question: 'When does deliberately raising the risk pay — and when does it backfire?',
    objectives: ['Analyse Chicken and its equilibria.', 'Weigh pressure against shared risk on an escalation ladder.', 'See how commitment changes the consequences of backing down.'],
    concept: {
      title: 'Brinkmanship and escalation',
      line: { character: 'sen', expression: 'explaining', text: 'Brinkmanship is a threat that leaves something to chance: you can’t promise a disaster, but you can raise its probability — and that pressures the other side.' },
      panels: [
        { tone: 'insight', title: 'Climb only so far', body: 'One step up the ladder added a little risk and a lot of pressure. Further steps added risk faster than pressure.' },
        { tone: 'caution', title: 'Not attrition, not a threat', body: 'Attrition is waiting while paying. A threat promises a later choice. Brinkmanship creates shared danger now — and sometimes it materialises.' },
      ],
    },
    transfer: {
      question: 'Two firms in a contract dispute each keep filing more aggressive legal motions, raising the chance the judge voids the whole contract — which would hurt both. What’s going on?',
      options: [
        { id: 'brink', label: 'Brinkmanship: each raises a shared risk to pressure the other to settle', verdict: 'strong', feedback: 'Neither controls the judge. Each motion raises the chance of a result both dislike.' },
        { id: 'attrition', label: 'A war of attrition: they’re waiting each other out', verdict: 'defensible', feedback: 'There’s waiting and cost, but the key feature is the rising risk they create.' },
        { id: 'credible', label: 'A credible threat that one firm will carry out', verdict: 'misconception', feedback: 'The bad outcome isn’t chosen by either firm — it’s left to chance.' },
      ],
      analogy: { holds: 'Escalation raises the probability of a shared disaster, like the ladder.', differs: 'Legal processes have deadlines and settlement norms the model leaves out.' },
    },
    completion: {
      takeaway: 'Risk shared on purpose can force concessions — but only up to the point where the danger you add outweighs the pressure you gain.',
      remember: ['Chicken has two asymmetric equilibria and a risky mixed one.', 'Each escalation step trades risk for pressure.', 'Locking in wins only if the other side can still back down.'],
      reflection: 'Have you seen an argument escalate to a point neither side wanted?',
      nextHook: 'Last lesson: an unfamiliar situation, and no label telling you which idea to use.',
    },
  },
  'strategic-practice': {
    id: 'strategic-practice',
    intro: {
      title: 'No labels this time',
      body: 'Real situations don’t say “this is a Prisoner’s Dilemma”. This lesson practises the step that comes first: working out what kind of situation you’re in.',
      lines: [
        { character: 'sen', expression: 'explaining', text: 'Who are the players? What can they do? Who knows what, and who moves when? Answer those, and the model usually follows.' },
        { character: 'aarav', expression: 'confident', text: 'Then I pick the tool, not the other way round.', align: 'right' },
      ],
    },
    question: 'How do you analyse a strategic situation nobody has labelled for you?',
    objectives: ['Identify players, actions, information and timing.', 'Choose an appropriate model and solution method.', 'Predict outcomes, justify a decision and name the assumptions that could change it.'],
    concept: {
      title: 'A checklist for any strategic situation',
      line: { character: 'sen', expression: 'explaining', text: 'Players and goals. Actions. Information. Timing. Uncertainty and incentives. Model. Prediction. And what would change your mind.' },
      panels: [
        { tone: 'insight', title: 'Facts first, model second', body: 'In the launch case, the decisive fact was timing: the rival could see your move. That fact, not the payoffs, made it a sequential game.' },
        { tone: 'info', title: 'Name your assumptions', body: 'Every recommendation rests on assumptions — about payoffs, information or rationality. Saying which ones would change it is part of the answer.' },
      ],
    },
    transfer: {
      question: 'Your team and another team both want the same meeting room every Monday. Whoever books first gets it; booking opens Friday at noon and both teams see the calendar. What’s the most useful first question?',
      options: [
        { id: 'timing', label: 'Who moves first, and can each team see the other’s booking?', verdict: 'strong', feedback: 'Timing and visibility decide whether this is a race, a sequential game or a coordination problem.' },
        { id: 'fair', label: 'Which team deserves the room more?', verdict: 'misconception', feedback: 'That’s a question about fairness; it doesn’t tell you what will happen.' },
        { id: 'payoff', label: 'How much each team values the room', verdict: 'defensible', feedback: 'Payoffs matter — but without timing and information you can’t choose the model.' },
      ],
      analogy: { holds: 'Timing and observation decide the model, as in the launch.', differs: 'Teams meet every week, so it’s also a repeated game where coordination might emerge.' },
    },
    completion: {
      takeaway: 'Start with players, actions, information and timing. Then choose the model, predict, decide — and say what would change your mind.',
      remember: ['The model follows from the facts, not the labels.', 'Combine tools: timing, beliefs and incentives often all matter.', 'A good recommendation names its assumptions.'],
      reflection: 'Pick a decision you face this week and run it through the checklist.',
      nextHook: 'You’ve finished the curriculum. Try the final assessment to test your transfer.',
    },
  },
};
