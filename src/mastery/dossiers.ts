import type { ArenaGameId } from '../arena/core.ts';
import type { StarKind } from './rules.ts';

/**
 * Rival dossiers for the Strategy Arena: three pages per opponent, each unlocked by one mastery star
 * (src/mastery/rules.ts). Unlike the opponent cards, which only describe what a player can observe, a dossier is the
 * reward for mastering a rival, so it says how the rival actually decides. Every line restates the engine's documented
 * policy (the doc comment on each bot function in src/arena/*.ts); keep them in step when a policy changes.
 *
 * In the team games (Defusal, Last Stand, Codebreaker) difficulty is the puzzle, not the teammate, so "On Hard" says
 * what changes around it. Classic games build their dossiers from the read descriptions (src/games/reads.ts).
 */

export interface Dossier {
  /** Unlocked by `beat`. */
  thinks: string;
  /** Unlocked by `hard`. */
  hard: string;
  /** Unlocked by `read`. */
  beat: string;
}

export const DOSSIER_PAGE: Record<StarKind, { key: keyof Dossier; title: string }> = {
  beat: { key: 'thinks', title: 'How it thinks' },
  hard: { key: 'hard', title: 'On Hard' },
  read: { key: 'beat', title: 'How to beat it' },
};

const TEAM_HARD = {
  defusal: 'The same teammate on every level; Hard deals only two clues each, so every shared clue matters more.',
  'last-stand': 'The same teammate on every level; Hard adds a second fire in most rounds.',
  codebreaker: 'The same teammate on every level; Hard boards have nine words and two traps.',
};

export const ARENA_DOSSIERS: Record<ArenaGameId, Record<string, Dossier>> = {
  cooperation: {
    collaborator: {
      thinks: 'Cooperates and forgives about half of your defections; after three in four rounds it turns defensive.',
      hard: 'Absorbs a single defection, but two in four rounds make it defensive until you cooperate twice. It notices alternating.',
      beat: 'Cooperate steadily. A betrayal gains one round and costs the partnership; repair it with two cooperations in a row.',
    },
    retaliator: {
      thinks: 'Strict tit-for-tat: it answers a defection with one of its own, then follows your lead.',
      hard: 'Answers an isolated defection once (and sometimes lets it go), repeated ones twice, and forgives accidental slips.',
      beat: 'Never defect first. It mirrors you, so steady cooperation earns the most against it.',
    },
    opportunist: {
      thinks: 'Probes after a few rounds of mutual cooperation and keeps exploiting you while you never answer back.',
      hard: 'Models how forgiving you are, exploits a predictable cooperator, and always defects in the last round.',
      beat: 'Answer its first defection at once; it backs off when you retaliate. Expect a betrayal in the final round.',
    },
    chameleon: {
      thinks: 'Cooperates twice, probes once, then copies how often you cooperate.',
      hard: 'Profiles you (pushover, reciprocal, cooperative, aggressive or erratic), anticipates plain patterns and defects last round unless you are aggressive.',
      beat: 'Be a clear reciprocator: cooperate, answer a defection once, forgive. It becomes the partner you show it.',
    },
  },
  'ultimatum-game': {
    investor: {
      thinks: 'Accepts offers from 30 % of the surplus and offers you about 40 %. An early “no” is an investment in better offers later.',
      hard: 'Demands 35 % while it will respond again, but takes almost anything in its last responding round. Its offers start lower and slip after you accept.',
      beat: 'Pay its price while it still has rounds to respond; in its last responding round a small offer will do.',
    },
    banker: {
      thinks: 'A fixed acceptance line — a quarter of the surplus — and steady offers near half. It never gambles on signalling.',
      hard: 'Asks for 30 % and offers less (about 35 %), rising only just above the largest share you turned down.',
      beat: 'Offer just above its line and take its steady offers; rejecting buys you very little.',
    },
    dealmaker: {
      thinks: 'Mirrors your fairness: generous offers lower its demands, a stingy one raises them; it offers more after you reject.',
      hard: 'Also offers a little less after each acceptance, searching for the deal you both take.',
      beat: 'Be fair early — your average offer sets its price. Reject one lowball and its offer comes back up.',
    },
    opportunist: {
      thinks: 'Opens low (20 %), offers more after a rejection and less after an acceptance, and may say no to train you.',
      hard: 'Anchors its demand on your most generous offer so far, and brackets your floor from what you accepted and refused.',
      beat: 'Don’t open generously — it remembers. Reject its first lowball to set your floor; offer little in its last responding round.',
    },
  },
  auction: {
    investor: {
      thinks: 'Bids for value: about 90 % of its estimate after correcting for part of the winner’s curse.',
      hard: 'Corrects fully for the winner’s curse and bids its value minus 2 — or just above what the room usually pays, if that is lower.',
      beat: 'Leave it the lots priced close to value; win the ones it shades too far.',
    },
    banker: {
      thinks: 'Discounts uncertainty, bids low, and keeps the most cash back for later lots.',
      hard: 'Bids near the equilibrium with an extra discount for uncertain lots.',
      beat: 'The uncertain lots are yours to take — but bid below your own estimate there too.',
    },
    dealmaker: {
      thinks: 'Bids what the room has been paying, capped at its own value.',
      hard: 'Bids the room’s usual price, capped one below its value.',
      beat: 'It follows the room. When everyone has been bidding low, it bids low too — that’s your chance.',
    },
    opportunist: {
      thinks: 'Bids almost everything on a high estimate and little otherwise.',
      hard: 'Bids its value minus 1 on a high estimate, and snipes a room that has been bidding low.',
      beat: 'Its big bid means a high estimate — don’t fight it. Take the lots where it holds back.',
    },
  },
  market: {
    investor: {
      thinks: 'Best-replies to last round’s prices, never more than one below the round’s equilibrium, and stays a step higher when rivals price high.',
      hard: 'Keeps prices high while both rivals have held well above equilibrium for two rounds. In the final round it plays its best reply.',
      beat: 'It rewards high prices: price a little above each round’s equilibrium and it stays up with you.',
    },
    banker: {
      thinks: 'Never prices below the round’s equilibrium: a steady, predictable floor.',
      hard: 'Adds a step to its price when rivals are erratic.',
      beat: 'Its floor is the round’s equilibrium; price at or just under it to take share.',
    },
    dealmaker: {
      thinks: 'Opens high, holds its price while nobody undercuts it, and otherwise matches the lowest price.',
      hard: 'Edges its price up a step at a time while nobody undercuts it — an open invitation — and matches any undercut.',
      beat: 'Don’t undercut it. Follow its climb for bigger margins, then play your best reply in the final round.',
    },
    opportunist: {
      thinks: 'Plays the pure best reply to last round’s prices.',
      hard: 'Predicts your next price from your last moves and undercuts whenever that pays.',
      beat: 'Read each round’s shoppers and price near the equilibrium; a price it can predict is a price it undercuts.',
    },
  },
  signal: {
    investor: {
      thinks: 'An honest sender (stakes on Strong, warns on Weak). As investor it weighs the evidence and tests when it is unsure.',
      hard: 'Tests exactly when a test is worth more than deciding now — and pitches a Weak venture in its last sending round, when reputation no longer pays.',
      beat: 'Trust its stakes and warnings, except in its final sending round.',
    },
    banker: {
      thinks: 'Honest and consistent: warns on Weak, stakes or pitches on Strong. It needs a clear margin before it invests.',
      hard: 'Tests exactly when a test pays, keeping the same safety margin.',
      beat: 'Its pitches are honest. When you send, a stake persuades it; a bare pitch rarely does.',
    },
    dealmaker: {
      thinks: 'Honest by default — but if you bluffed it the last time you sent, it bluffs you back with a pitch.',
      hard: 'Holds the grudge: any bluff it has caught you in earns you a pitch on a Weak venture.',
      beat: 'Stay honest with it and its signals stay honest.',
    },
    opportunist: {
      thinks: 'Bluffs: it pitches most Weak ventures.',
      hard: 'Bluffs more while you believe its pitches, less once you doubt them, and sometimes pitches a Strong venture so pitches stay ambiguous.',
      beat: 'Doubt its pitches and test them; only its stakes are always true.',
    },
  },
  mole: {
    investigator: {
      thinks: 'The Mole plays detective: it accuses whoever the public evidence points to most.',
      hard: 'Among near-equal suspects it accuses the one the crew accused last round, to look even more like them.',
      beat: 'Its accusations look the most careful in the room. Trust your interrogations over who sounds right.',
    },
    'social-reader': {
      thinks: 'The Mole joins the crowd: it accuses whoever drew the most accusations last round.',
      hard: 'When the crowd turns on it, it stops echoing the room and cites the evidence leader instead.',
      beat: 'Look for the suspect who always votes with the room.',
    },
    deceiver: {
      thinks: 'The Mole picks one innocent and keeps accusing them, switching only once the clues clear them.',
      hard: 'Its new target is someone the evidence also implicates, so the frame stays plausible.',
      beat: 'A suspect who names the same person round after round is your lead.',
    },
    opportunist: {
      thinks: 'The Mole strikes back: it accuses whoever accused it last round.',
      hard: 'It won’t retaliate against the evidence leader; it piles on them instead.',
      beat: 'Accuse someone and watch who strikes back.',
    },
  },
  commons: {
    conservator: {
      thinks: 'Takes a quarter of what the lake can regrow, and just 1 when the lake is low.',
      hard: 'Rebuilds the lake toward its most productive level and never grabs at the end.',
      beat: 'Restrain with it: a healthy lake and the shared dividend pay more than a grab.',
    },
    'free-rider': {
      thinks: 'Takes 3, plus more for every boat that held back last round.',
      hard: 'Takes more per restrained boat, grabs 10 in the last two rounds, and eases off only when the lake is nearly gone.',
      beat: 'Your restraint is its profit. Hold steady, and take your share before the final two rounds.',
    },
    conditional: {
      thinks: 'Takes the average of the other boats’ last catches.',
      hard: 'Takes 3 while the fleet is moderate and the lake healthy; after anyone grabs 8 or more it takes the average plus 1, until the fleet calms down.',
      beat: 'Keep your catch moderate and it keeps the lake alive with you.',
    },
    maximizer: {
      thinks: 'Takes 4 while the lake is full, 2 when it is low, and 10 in the last two rounds.',
      hard: 'Tries every catch and keeps the one that maximises its own season, assuming everyone repeats their last catch.',
      beat: 'Expect the endgame grab and plan your own final rounds around it.',
    },
  },
  coalition: {
    loyal: {
      thinks: 'Keeps building coalitions with its last partner, splitting the prize by seats.',
      hard: 'Drops an ally that passed a bill without it, and asks that party for 120 % of a fair share.',
      beat: 'Pass one bill together and it keeps inviting you. Don’t leave it out.',
    },
    broker: {
      thinks: 'Buys the cheapest partners and keeps most of the prize: partners get under half their seat-fair share.',
      hard: 'Prices every coalition from how its members have voted and buys the cheapest; it wants 5 points when it is pivotal.',
      beat: 'Reject its lowball bills. What you refuse sets your price for the next one.',
    },
    switcher: {
      thinks: 'Goes wherever support is cheapest right now, offering the lowest share a partner has accepted.',
      hard: 'Never re-offers a share a partner turned down, and avoids a clear leader.',
      beat: 'Don’t accept cheap shares early: what you accept becomes what it offers you.',
    },
    fair: {
      thinks: 'Proposes the smallest winning coalition split by seats, and rejects bills whose proposer keeps more than twice a fair share.',
      hard: 'Also leaves a runaway leader out of its coalitions.',
      beat: 'Propose seat-fair splits and it votes yes; greed loses its vote.',
    },
  },
  inspector: {
    strict: {
      thinks: 'As inspector it checks 70 % of rounds, always right after catching you. As operator it complies 85 % of the time.',
      hard: 'Inspects 60 %, but always after catching you or after two unchecked rounds; as operator it cuts corners only after you trusted it twice in a row.',
      beat: 'Comply right after a catch and after two unchecked rounds; that’s when it looks.',
    },
    calculated: {
      thinks: 'Inspects when your cheat rate makes it pay, and cheats when your inspection rate is low.',
      hard: 'Weights recent rounds and mixes at the equilibrium near the line, so it can’t be read.',
      beat: 'Stay near the equilibrium yourself: cut corners about 2 rounds in 7, inspect about 1 in 3.',
    },
    'rule-follower': {
      thinks: 'Trusts by default — it inspects about 1 round in 5 — and almost always complies.',
      hard: 'Inspects right after it sees you cut corners on an unchecked round.',
      beat: 'Cut corners sparingly, never twice running, and spend few inspections on it.',
    },
    'risk-taker': {
      thinks: 'Saves on inspections (1 in 4) and, as operator, cuts corners 60 % of the time — more after getting away with it.',
      hard: 'Inspects half the time after losing to unseen violations twice; cheats less for one round after a fine.',
      beat: 'Inspect it right after it got away with something.',
    },
  },
  travelers: {
    purist: {
      thinks: 'Plays the equilibrium: claims the minimum, now and then one above it.',
      hard: 'Claims the minimum every round, whatever you do.',
      beat: 'Claim the minimum too. Anything higher just pays it the bonus.',
    },
    cooperative: {
      thinks: 'Claims the maximum; after you undercut it twice in a row it matches your last claim.',
      hard: 'Matches your claim after an undercut and climbs back toward the maximum when you stop.',
      beat: 'Claim high with it and don’t undercut — it follows you back up.',
    },
    undercutter: {
      thinks: 'Claims one below your last claim.',
      hard: 'Claims one below your predicted claim, and two below in the final round.',
      beat: 'Drop before it does, and go lower still in the final round.',
    },
    adaptive: {
      thinks: 'Best-replies to your past claims, recent ones weighted most.',
      hard: 'Spots a follower: if you copy its last claim, it leads with the maximum.',
      beat: 'Change your pattern often so its best reply is always a round behind.',
    },
  },
  saboteur: {
    planner: {
      thinks: 'Plays the perfect crew member and jams only in the second half, while successes lead failures.',
      hard: 'Never jams on a mission it leads, nor twice in a row.',
      beat: 'Watch the late missions: a failure after a clean start points at whoever was on it.',
    },
    investigator: {
      thinks: 'Jams every other mission it is on, and benches whoever shared its failed missions to pin the blame.',
      hard: 'Skips a jam right after a failed mission, when eyes are on the team.',
      beat: 'Its benching blames others — notice who it never benches.',
    },
    opportunist: {
      thinks: 'Jams only when its jam decides the mission.',
      hard: 'The same rule; its jams stay rare and decisive.',
      beat: 'Missions that fail by a single point are its signature.',
    },
    deceiver: {
      thinks: 'Clean when it leads, jams when someone else does, and benches the most trusted crew member.',
      hard: 'Stops after two jams in a row to rebuild trust.',
      beat: 'Failures on missions it didn’t lead, with a trusted member benched, point to it.',
    },
  },
  bluff: {
    cautious: {
      thinks: 'Presses to three tokens and usually claims its true value; it calls only claims that look far-fetched.',
      hard: 'Presses deeper on a weak hand, and bluffs a little only when you rarely call.',
      beat: 'Believe its claims, and keep yours modest — it calls only big ones.',
    },
    'risk-taker': {
      thinks: 'Presses deep, so its big claims are often true. It bluffs on some claims and rarely calls yours.',
      hard: 'Bluffs more against a player who rarely calls, less against one who calls a lot.',
      beat: 'Call selectively — its big claims are often honest — and claim boldly yourself.',
    },
    observant: {
      thinks: 'Calls when the exact odds say a bluff is likely.',
      hard: 'Blends the odds with how often your revealed claims were bluffs, and bluffs once if you have never called it.',
      beat: 'Keep your claims believable for your token count; honest play is hard for it to punish.',
    },
    performer: {
      thinks: 'Presses a random number of tokens, adds a random bluff, and calls about a third of the time.',
      hard: 'Calls only when the odds also allow a bluff, and keeps its claims possible on their face.',
      beat: 'Judge each claim by the odds alone, not by its manner.',
    },
  },
  defusal: {
    methodical: {
      thinks: 'Shares its clues in a fixed order — span counts, then pairs, then single wires — and cuts the likeliest-safe wire.',
      hard: TEAM_HARD.defusal,
      beat: 'Its sharing order is predictable: plan your cuts around the clue it will share next.',
    },
    cautious: {
      thinks: 'Shares its most certain clues first and cuts only wires it knows are safe; otherwise it holds, spending fuse.',
      hard: TEAM_HARD.defusal,
      beat: 'Share clues that prove a wire safe, or it will hold and burn fuse.',
    },
    bold: {
      thinks: 'Shares any clue and cuts the likeliest-safe wire from its own clues at once, without waiting on yours.',
      hard: TEAM_HARD.defusal,
      beat: 'The wires it cuts tell you what its clues say — read its cuts as extra clues.',
    },
    sharer: {
      thinks: 'Shares the clue that rules out the most, and cuts any safe wire your clue names.',
      hard: TEAM_HARD.defusal,
      beat: 'Share clues that name safe wires: it acts on them straight away.',
    },
  },
  'power-play': {
    honest: {
      thinks: 'Claims only roles it holds, and challenges only near-impossible claims.',
      hard: 'Counts cards exactly and also weighs how often you have claimed a role.',
      beat: 'Its claims are true and it seldom challenges — bluff with confidence.',
    },
    bluffer: {
      thinks: 'Uses its real roles first, and bluffs Treasury whenever your challenge rate makes the bluff pay.',
      hard: 'The same calculation, with counted odds and your claim history when it decides to challenge.',
      beat: 'Challenge its Treasury claims now and then, and its bluffs stop paying.',
    },
    challenger: {
      thinks: 'Plays honestly and challenges any claim with less than 45 % odds.',
      hard: 'Adds how often you have claimed a role to the counted odds.',
      beat: 'Claim only roles you hold, and let its challenges cost it influence.',
    },
    manipulator: {
      thinks: 'Uses real roles first and bluffs Steal when you have coins and rarely challenge; it avoids confrontation.',
      hard: 'Switches to plain Income once your recent challenges were right.',
      beat: 'Challenge its Steal claims; once you’ve been right, it goes quiet.',
    },
  },
  'last-stand': {
    planner: {
      thinks: 'Douses the biggest threat — fire plus burning neighbours — firebreaks when things are calm, and refills at 1 water.',
      hard: TEAM_HARD['last-stand'],
      beat: 'It covers the worst district; take the second-worst or the refill.',
    },
    responder: {
      thinks: 'Douses the hottest district every round and refills only when the water is gone.',
      hard: TEAM_HARD['last-stand'],
      beat: 'Mind the tanks: refill so its douses never run dry.',
    },
    guardian: {
      thinks: 'Protects the supply: refills at 2 water, douses districts at 3, and firebreaks the calm side of the hottest district.',
      hard: TEAM_HARD['last-stand'],
      beat: 'Do the dousing yourself; it keeps the tanks full.',
    },
    coordinator: {
      thinks: 'Fills the gap you leave: if you doused a district, it takes the hottest other one.',
      hard: TEAM_HARD['last-stand'],
      beat: 'Douse the worst fire yourself and it covers the next.',
    },
  },
  'liars-dice': {
    calculator: {
      thinks: 'Calls when the bid is less than 50 % likely, counting its own dice, and otherwise makes the most probable raise.',
      hard: 'Treats a face you have bid as likelier to be in your cup.',
      beat: 'Keep your bids close to the true odds — a face you bid tells it something.',
    },
    aggressive: {
      thinks: 'Calls only below 20 % and keeps raising on its best face, even on a stretch.',
      hard: 'Reads your bid faces too, but still raises hard.',
      beat: 'Let it overbid, then call.',
    },
    conservative: {
      thinks: 'Calls below 60 % and only raises to bids at least that likely.',
      hard: 'Reads your bid faces to sharpen its odds.',
      beat: 'Make safe, steady raises; it calls early and often.',
    },
    psychological: {
      thinks: 'Bids a face it doesn’t hold about a third of the time, to steer you.',
      hard: 'Bluffs faces once it sees you follow its earlier bluffs.',
      beat: 'Don’t copy its faces; bid on your own dice.',
    },
  },
  codebreaker: {
    literal: {
      thinks: 'Gives clues only through obvious links and refuses any theme near the trap; guesses only strong links.',
      hard: TEAM_HARD.codebreaker,
      beat: 'Give it clear, obvious themes; it won’t follow a stretch.',
    },
    associative: {
      thinks: 'Uses clear links for wider clues and guesses any linked word, strongest first.',
      hard: TEAM_HARD.codebreaker,
      beat: 'Clues of medium strength work well; keep the trap off-theme.',
    },
    'risk-aware': {
      thinks: 'Avoids themes that also fit neutral words or the trap, gives smaller numbers, and stops a guess short when unsure.',
      hard: TEAM_HARD.codebreaker,
      beat: 'Expect small numbers and take the sure words first.',
    },
    creative: {
      thinks: 'Reaches for big numbers through unusual links and always takes the bonus guess.',
      hard: TEAM_HARD.codebreaker,
      beat: 'Its stretches are deliberate — think about loose links when it clues.',
    },
  },
  gambit: {
    safe: {
      thinks: 'Risk-averse: a sure Step usually beats a gamble.',
      hard: 'Also weighs your best reply before it moves.',
      beat: 'Race it: take the calculated gambles it won’t.',
    },
    gambler: {
      thinks: 'Risk-seeking: it prefers Dashes and Strikes whenever they are close.',
      hard: 'Also weighs your best reply before it moves.',
      beat: 'Stay out of strike range and let its gambles fail.',
    },
    positional: {
      thinks: 'Plays the expected value of the position: progress, pieces home, exposure to strikes.',
      hard: 'Also weighs your best reply before it moves.',
      beat: 'There’s no habit to exploit: play sound moves and win the long race.',
    },
    adaptive: {
      thinks: 'Gambles when behind, plays safe when ahead, and keeps pace when you play risky.',
      hard: 'Also weighs your best reply before it moves.',
      beat: 'Get ahead early and play steady: it turns cautious and slows itself down.',
    },
  },
};
