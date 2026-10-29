import { type BluffState, tokenValue } from '../arena/bluff.ts';
import { type CoalitionState, PRIZE } from '../arena/coalition.ts';
import type { CodeState } from '../arena/codebreaker.ts';
import type { CommonsState } from '../arena/commons.ts';
import { CODENAMES, plural } from '../arena/core.ts';
import { type DefusalState, WIRE_COLORS, clueText, consistent, defused, fuseLeft, playerCuts } from '../arena/defusal.ts';
import type { GambitState } from '../arena/gambit.ts';
import type { InspectorState } from '../arena/inspector.ts';
import { DISTRICTS, type StandState, held, planText } from '../arena/last-stand.ts';
import { type DiceState, bidText } from '../arena/liars-dice.ts';
import type { MoleState } from '../arena/mole.ts';
import { CLAIM_OF, type PowerMove, type PowerState, ROLE_NAME } from '../arena/power-play.ts';
import { type SaboteurState, crewName } from '../arena/saboteur.ts';
import type { TravelerState } from '../arena/travelers.ts';
import { count, firstRound, longestRun, times } from './select.ts';
import { type GameReflections, rule } from './types.ts';

/**
 * Reflections for the thirteen library games. Hidden-information rules:
 * - The Mole, the Saboteur: never say who the hidden player was or what any bot's card was. Only public evidence
 *   (camera pairs, accusations, mission totals) and the player's own private actions (interrogations, own card).
 * - Bluff, Power Play: say whether a claim was true only when it was challenged (and so revealed at the time), or when
 *   the claim was the player's own.
 * - Liar's Dice: the dice are counted aloud whenever someone calls, so the count of a called bid is public.
 */

const name = (seat: number) => CODENAMES[seat];

// ── The Mole ────────────────────────────────────────────────────────────────
// Four suspects (bots), one Mole. Public camera pairs and accusations; private interrogations; the player accuses.

export const MOLE: GameReflections<MoleState> = {
  game: 'mole',
  lesson: 'bayesian-uncertainty',
  rules: [
    rule({
      id: 'followed-the-room',
      tier: 1,
      when: (s: MoleState) => {
        const last = s.rounds[s.rounds.length - 1];
        if (!last || s.accused === null) return null;
        const votes = [0, 1, 2, 3].map((t) => count(last.accusations, (a) => a === t));
        const top = Math.max(...votes);
        return votes[s.accused] === top && count(votes, (v) => v === top) === 1 && top >= 2 ? { suspect: name(s.accused), votes: top } : null;
      },
      write: ({ suspect, votes }) => ({
        thought: `You accused ${suspect}, the suspect the room accused most in the final round (${votes} votes). How much of your conclusion came from evidence, and how much from the crowd — which included the Mole?`,
        idea: 'A crowd’s accusations are evidence, but not independent evidence: everyone saw the same camera, and one voter has every reason to mislead.',
        perspective: 'When several people point the same way for their own reasons, agreement can be strong. When they’re echoing each other, it’s one clue counted many times.',
        question: 'What would make you go against the room?',
      }),
    }),
    rule({
      id: 'nervous-tell',
      tier: 1,
      when: (s: MoleState) => {
        if (s.accused === null) return null;
        const round = firstRound(s.rounds, (r) => r.interrogated === s.accused && r.nervous);
        return round ? { round, suspect: name(s.accused) } : null;
      },
      write: ({ round, suspect }) => ({
        thought: `You accused ${suspect}, who came across nervous when you interrogated them in round ${round}. How much weight did that one answer carry?`,
        idea: 'A tell is evidence, not proof: the Mole is more likely to look nervous, but innocent people get nervous too.',
        perspective: 'One nervous answer next to a camera sighting is stronger than either alone. On its own, it can easily mislead.',
        question: 'How many independent clues would you want before naming someone?',
      }),
    }),
    rule({
      id: 'off-camera',
      tier: 1,
      when: (s: MoleState) => {
        if (s.accused === null || !s.rounds.length) return null;
        const seen = count(s.rounds, (r) => r.clue.includes(s.accused!));
        return seen === 0 ? { suspect: name(s.accused), rounds: s.rounds.length } : null;
      },
      write: ({ suspect, rounds }) => ({
        thought: `You accused ${suspect}, who didn’t appear in any of the ${rounds} camera pairs. What outweighed the camera evidence?`,
        idea: 'The camera is imperfect, so it can miss the Mole. Still, every pair that leaves a suspect out is a small point in their favour.',
        perspective: 'Other evidence — an interrogation, the accusations — can outweigh a quiet camera. The question is by how much.',
        question: 'How would you weigh a clue that is right most of the time against one that comes from a suspect?',
      }),
    }),
    rule({
      id: 'same-suspect',
      tier: 2,
      when: (s: MoleState) => {
        const k = [0, 1, 2, 3].map((t) => count(s.rounds, (r) => r.interrogated === t));
        const most = Math.max(...k);
        return most >= 2 ? { suspect: name(k.indexOf(most)), k: most } : null;
      },
      write: ({ suspect, k }) => ({
        thought: `You interrogated ${suspect} ${times(k)}. Were you confirming a suspicion, or trying to rule them out?`,
        idea: 'Repeating a test on one suspect sharpens what you know about them, and leaves the others as unknown as before.',
        perspective: 'Spreading interrogations widely gives a little evidence about everyone; focusing gives a lot about one.',
        question: 'Which suspect would you most want one more interrogation of, and why?',
      }),
    }),
  ],
  general: {
    thought: 'How much of your conclusion came from evidence, and how much came from what you expected the suspects to do?',
    idea: 'Each clue here is weak on its own. Confidence should come from several clues pointing the same way.',
    perspective: 'A suspect who behaves suspiciously might be the Mole — or might be an innocent reacting to the same evidence you saw.',
    question: 'Which single clue would you drop if you had to, and would your answer change?',
  },
};

// ── The Commons ─────────────────────────────────────────────────────────────

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

export const COMMONS: GameReflections<CommonsState> = {
  game: 'commons',
  lesson: 'cooperation-trap',
  rules: [
    rule({
      id: 'collapse',
      tier: 1,
      when: (s: CommonsState) => {
        const last = s.rounds[s.rounds.length - 1];
        return s.lake <= 0 && last ? { round: s.rounds.length, mine: last.requests[0], total: last.requests.reduce((a, b) => a + b, 0) } : null;
      },
      write: ({ round, mine, total }) => ({
        thought: `The lake collapsed in round ${round}, when the boats asked for ${total} fish between them — ${mine} of them yours. Taking more helped someone that round; what did it do to every round after?`,
        idea: 'A shared resource rewards each user for taking a little more, while the cost of over-fishing falls on everyone.',
        perspective: 'Holding back alone may not save the lake if others don’t. That is exactly what makes restraint hard to choose.',
        question: 'What would you need to see from the other boats before you’d hold back?',
      }),
    }),
    rule({
      id: 'rationed',
      tier: 1,
      when: (s: CommonsState) => {
        const round = firstRound(s.rounds, (r) => r.catches[0] < r.requests[0]);
        const r = s.rounds[round - 1];
        return round ? { round, asked: r.requests[0], got: r.catches[0] } : null;
      },
      write: ({ round, asked, got }) => ({
        thought: `In round ${round} the boats asked for more than the lake could give, so you landed ${got} of the ${asked} you asked for. What did that round say about how much was left for later?`,
        idea: 'When demand outruns the stock, everyone’s share is cut — and the lake’s ability to regrow shrinks with it.',
        perspective: 'Asking for more in a rationed round still raises your share. It also drains the pool everyone depends on.',
        question: 'If every boat had asked for one fewer that round, how might the next rounds have looked?',
      }),
    }),
    rule({
      id: 'took-more',
      tier: 2,
      when: (s: CommonsState) => {
        const mine = avg(s.rounds.map((r) => r.requests[0]));
        const others = avg(s.rounds.flatMap((r) => r.requests.slice(1)));
        return s.rounds.length && mine > others ? { mine, others } : null;
      },
      write: ({ mine, others }) => ({
        thought: `Your requests averaged about ${mine} fish a round, while the other boats averaged about ${others}. Taking more helps you now — how did it change what remained for everyone?`,
        idea: 'Each extra fish is fully yours, while the damage to the lake is shared four ways. That gap is the tragedy of the commons.',
        perspective: 'If the others were holding back, your extra catch rode on their restraint. If they weren’t, holding back alone might have changed little.',
        question: 'What would happen to the lake if every boat fished the way you did?',
      }),
    }),
    rule({
      id: 'held-back',
      tier: 2,
      when: (s: CommonsState) => {
        const mine = avg(s.rounds.map((r) => r.requests[0]));
        const others = avg(s.rounds.flatMap((r) => r.requests.slice(1)));
        return s.rounds.length && mine < others ? { mine, others } : null;
      },
      write: ({ mine, others }) => ({
        thought: `Your requests averaged about ${mine} fish a round, below the other boats’ ${others}. Who benefited most from your restraint?`,
        idea: 'Restraint keeps a shared resource alive for everyone, including those who don’t share the cost of keeping it.',
        perspective: 'Holding back protects the lake. It can also hand a bigger share to the boats that don’t.',
        question: 'Is there a way to hold back that also encourages the others to?',
      }),
    }),
  ],
  general: {
    thought: 'Taking more can help one boat now while changing what remains for everyone later.',
    idea: 'In a commons, each user gains the full benefit of an extra catch but shares its cost. Individually sensible choices can empty the lake.',
    perspective: 'A healthy lake pays everyone over time. The question is whether everyone believes the others will hold back too.',
    question: 'How would you fish if you could see every boat’s request before choosing yours?',
  },
};

// ── The Coalition ───────────────────────────────────────────────────────────

export const COALITION: GameReflections<CoalitionState> = {
  game: 'coalition',
  lesson: 'coalitions',
  rules: [
    rule({
      id: 'proposal-failed',
      tier: 1,
      when: (s: CoalitionState) => {
        const round = firstRound(s.rounds, (r) => r.proposal.proposer === 0 && !r.passed);
        const r = s.rounds[round - 1];
        return round ? { round, keep: r.proposal.shares[0], partners: r.proposal.members.length - 1 } : null;
      },
      write: ({ round, keep, partners }) => ({
        thought: `Your proposal in round ${round}, keeping ${keep} of ${PRIZE} points with ${plural(partners, 'partner')}, was voted down. An agreement isn’t only about how much everyone receives — it’s also about who has the power to say no.`,
        idea: 'Every member of a coalition can veto it. What each partner accepts depends on what they could get elsewhere.',
        perspective: 'A bigger share for you is a smaller share for someone whose vote you need.',
        question: 'Which partner was hardest to satisfy, and what were their alternatives?',
      }),
    }),
    rule({
      id: 'you-vetoed',
      tier: 1,
      when: (s: CoalitionState) => {
        const round = firstRound(s.rounds, (r) => r.proposal.proposer !== 0 && r.responses[0] === false);
        const r = s.rounds[round - 1];
        return round ? { round, offered: r.proposal.shares[0] } : null;
      },
      write: ({ round, offered }) => ({
        thought: `In round ${round} you voted down a deal that offered you ${offered} of ${PRIZE} points. What were you holding out for?`,
        idea: 'A veto is a bet that a better deal will come — from this proposer later, or from someone else.',
        perspective: 'Holding out can raise your price. It can also teach the others to build coalitions without you.',
        question: 'What share would you accept from the same proposer next time, and why that number?',
      }),
    }),
    rule({
      id: 'left-out',
      tier: 1,
      when: (s: CoalitionState) => {
        const round = firstRound(s.rounds, (r) => r.passed && !r.proposal.members.includes(0));
        return round ? { round } : null;
      },
      write: ({ round }) => ({
        thought: `In round ${round} a coalition passed without you. Your seats hadn’t changed — what made the others prefer a deal that left you out?`,
        idea: 'Power in a coalition comes from being needed. A party whose votes can be replaced has little to bargain with.',
        perspective: 'Being left out once isn’t a verdict. Proposers pick partners who are cheap to satisfy, and prices change.',
        question: 'How could you make yourself harder to replace?',
      }),
    }),
    rule({
      id: 'deal-passed',
      tier: 2,
      when: (s: CoalitionState) => {
        const round = firstRound(s.rounds, (r) => r.proposal.proposer === 0 && r.passed);
        const r = s.rounds[round - 1];
        return round ? { round, keep: r.proposal.shares[0], partners: r.proposal.members.length - 1 } : null;
      },
      write: ({ round, keep, partners }) => ({
        thought: `Your deal in round ${round} passed: you kept ${keep} of ${PRIZE} points, shared with ${plural(partners, 'partner')}. How close to the edge was it?`,
        idea: 'A successful proposal gives each partner just enough that saying yes beats waiting for the next proposal.',
        perspective: 'A generous split passes easily; a lean one keeps more but risks a veto.',
        question: 'Could you have kept more — and what would it have cost you to find out?',
      }),
    }),
  ],
  general: {
    thought: 'An agreement isn’t only about how much everyone receives. It’s also about who has the power to say no.',
    idea: 'In a coalition, seats matter less than being needed. A small party that tips the balance can be worth more than a big one.',
    perspective: 'Loyalty can make you a reliable partner; it can also make you cheap to keep.',
    question: 'Which party had the most real power in this match, and why?',
  },
};

// ── The Inspector ───────────────────────────────────────────────────────────

export const INSPECTOR: GameReflections<InspectorState> = {
  game: 'inspector',
  lesson: 'incentive-shift',
  rules: [
    rule({
      id: 'inspected-clean',
      tier: 1,
      when: (s: InspectorState) => {
        const round = firstRound(s.rounds, (r) => r.operator === 'bot' && r.ins === 'inspect' && r.op === 'comply');
        return round ? { round } : null;
      },
      write: ({ round }) => ({
        thought: `In round ${round} you paid to inspect and found an honest report. An inspection has a cost even when it finds nothing — what made it worthwhile?`,
        idea: 'An inspection that finds nothing isn’t necessarily wasted: the chance of being checked is part of why reports stay honest.',
        perspective: 'If the other side would have complied anyway, the inspection only cost you. The trouble is that you can’t know which it was.',
        question: 'How often would you inspect someone who has always been honest?',
      }),
    }),
    rule({
      id: 'caught',
      tier: 1,
      when: (s: InspectorState) => {
        const round = firstRound(s.rounds, (r) => r.operator === 'bot' && r.ins === 'inspect' && r.op === 'cut');
        return round ? { round } : null;
      },
      write: ({ round }) => ({
        thought: `Your inspection in round ${round} caught a cut corner. What made you check that particular round?`,
        idea: 'Detection works best when it is hard to predict: an operator who knows when you’ll inspect can cheat the rest of the time.',
        perspective: 'One catch can deter future cheating — or teach the operator to pick different rounds.',
        question: 'If the operator knew why you inspected that round, what would they do next?',
      }),
    }),
    rule({
      id: 'trusted-cut',
      tier: 1,
      when: (s: InspectorState) => {
        const round = firstRound(s.rounds, (r) => r.operator === 'bot' && r.ins === 'trust' && r.op === 'cut');
        return round ? { round } : null;
      },
      write: ({ round }) => ({
        thought: `In round ${round} you trusted the report, and corners had been cut. What made that round feel safe?`,
        idea: 'Trust saves the cost of checking, but it also tells the other side when checking is unlikely.',
        perspective: 'Inspecting every round would have caught it — at a price paid every round, including all the honest ones.',
        question: 'How would you make your inspections harder to predict?',
      }),
    }),
    rule({
      id: 'fined',
      tier: 1,
      when: (s: InspectorState) => {
        const round = firstRound(s.rounds, (r) => r.operator === 'player' && r.op === 'cut' && r.ins === 'inspect');
        return round ? { round } : null;
      },
      write: ({ round }) => ({
        thought: `You cut corners in round ${round} and were inspected. What made that round look like a safe one to try?`,
        idea: 'Cutting corners pays only when nobody checks. Its value depends entirely on what you believe about the inspector.',
        perspective: 'An inspector who caught you once may check more often — or may relax, thinking the lesson landed.',
        question: 'How did being caught change what you expected from the inspector afterwards?',
      }),
    }),
    rule({
      id: 'cut-unseen',
      tier: 2,
      when: (s: InspectorState) => {
        const k = count(s.rounds, (r) => r.operator === 'player' && r.op === 'cut' && r.ins === 'trust');
        return k ? { k } : null;
      },
      write: ({ k }) => ({
        thought: `You cut corners ${times(k)} without being inspected. Did each one feel like a read of the inspector, or a gamble?`,
        idea: 'An unchecked shortcut pays well, which is exactly why an inspector watches for patterns in when you take them.',
        perspective: 'A shortcut that goes unnoticed today still shapes how closely you’re watched tomorrow.',
        question: 'If the inspector could see your whole record, which rounds would look suspicious?',
      }),
    }),
    rule({
      id: 'always-complied',
      tier: 2,
      when: (s: InspectorState) => {
        const mine = s.rounds.filter((r) => r.operator === 'player');
        return mine.length >= 2 && mine.every((r) => r.op === 'comply') ? { n: mine.length } : null;
      },
      write: ({ n }) => ({
        thought: `You filed an honest report in all ${n} of your rounds as operator. Was that principle, or a judgment about how closely you were watched?`,
        idea: 'Compliance is the safe choice when inspections are likely. When they aren’t, it leaves points behind.',
        perspective: 'A clean record may also lower an inspector’s guard — a reputation has value of its own.',
        question: 'What would make cutting a corner worth the risk for you?',
      }),
    }),
  ],
  general: {
    thought: 'An inspection has a cost even when it finds nothing. What made each check worthwhile in this match?',
    idea: 'Neither side has one fixed answer: if inspectors always check, nobody cheats, and checking becomes a waste.',
    perspective: 'Being a little unpredictable can matter more for an inspector than being strict.',
    question: 'How often do you think the other side expected you to inspect?',
  },
};

// ── The Traveler’s Dilemma ──────────────────────────────────────────────────

export const TRAVELERS: GameReflections<TravelerState> = {
  game: 'travelers',
  lesson: 'iterated-dominance',
  rules: [
    rule({
      id: 'undercut-you',
      tier: 1,
      when: (s: TravelerState) => {
        const round = firstRound(s.rounds, (r) => r.claims[1] < r.claims[0]);
        const r = s.rounds[round - 1];
        return round ? { round, mine: r.claims[0], theirs: r.claims[1], paid: r.pay[0] } : null;
      },
      write: ({ round, mine, theirs, paid }) => ({
        thought: `In round ${round} you claimed ${mine} and they claimed ${theirs}, so you were paid ${paid}. A small change in either claim changed not only your reward, but how theirs affected it.`,
        idea: 'Both payouts are set by the lower claim, plus a bonus for the lower claimant and a penalty for the higher one. Being slightly lower always looks attractive.',
        perspective: 'If both sides chase “slightly lower”, claims slide down together, and both end up with less than two high claims would have paid.',
        question: 'Where would you expect two thoughtful travelers to settle — and would you want to be the first to stop undercutting?',
      }),
    }),
    rule({
      id: 'you-undercut',
      tier: 1,
      when: (s: TravelerState) => {
        const round = firstRound(s.rounds, (r) => r.claims[0] < r.claims[1]);
        const r = s.rounds[round - 1];
        return round ? { round, mine: r.claims[0], theirs: r.claims[1], paid: r.pay[0], theirPay: r.pay[1] } : null;
      },
      write: ({ round, mine, theirs, paid, theirPay }) => ({
        thought: `In round ${round} you claimed ${mine} under their ${theirs}: you were paid ${paid}, they got ${theirPay}. What do you think that round taught them about their next claim?`,
        idea: 'Undercutting wins the bonus once. It also gives the other traveler a reason to claim lower next time.',
        perspective: 'If they keep claiming high, undercutting keeps paying. If they adapt, the bonus becomes a race to the bottom.',
        question: 'What would you claim if you knew they’d copy your last claim?',
      }),
    }),
    rule({
      id: 'matched-high',
      tier: 2,
      when: (s: TravelerState) => {
        const k = count(s.rounds, (r) => r.claims[0] === r.claims[1] && r.claims[0] >= 15);
        return k ? { k } : null;
      },
      write: ({ k }) => ({
        thought: `${k === 1 ? 'Once' : `${k} times`}, you and the other traveler made the same high claim and both were paid it. What made that possible when undercutting always pays a little more?`,
        idea: 'Matching high claims beats the undercutting spiral for both — but each traveler can always gain by going one lower.',
        perspective: 'Trust keeps claims high; one undercut can be enough to break it.',
        question: 'How would you keep a high-claim agreement going without being able to talk?',
      }),
    }),
    rule({
      id: 'spiral',
      tier: 2,
      when: (s: TravelerState) => {
        const drops = s.rounds.slice(1).map((r, i) => r.claims[0] < s.rounds[i].claims[0]);
        const [len, start] = longestRun(drops, (d) => d);
        if (len < 2) return null;
        const from = s.rounds[start - 1].claims[0];
        const to = s.rounds[start + len - 1].claims[0];
        return { from, to, len: len + 1 };
      },
      write: ({ from, to, len }) => ({
        thought: `Over ${len} rounds in a row your claim fell, from ${from} to ${to}. Were you chasing the bonus, or protecting yourself from being undercut?`,
        idea: 'Each step down can be a sensible reply to the last round. Together, the steps can carry both travelers far below where they started.',
        perspective: 'Climbing back up means trusting the other side not to undercut you — a risk the spiral makes harder to take.',
        question: 'What would it take for either of you to claim higher again?',
      }),
    }),
  ],
  general: {
    thought: 'A small change in your claim could change not only your reward, but how your opponent’s claim affected it.',
    idea: 'The Traveler’s Dilemma rewards being slightly lower than the other side, yet two high claims pay both far more than two low ones.',
    perspective: 'Pure logic pulls claims down; real travelers often claim high and do better for it.',
    question: 'What would you claim against someone you trusted completely — and against a stranger?',
  },
};

// ── The Saboteur ────────────────────────────────────────────────────────────
// Only mission totals are public. The player's own card is the player's own knowledge.

export const SABOTEUR: GameReflections<SaboteurState> = {
  game: 'saboteur',
  lesson: 'bayesian-uncertainty',
  rules: [
    rule({
      id: 'your-zero',
      tier: 1,
      when: (s: SaboteurState) => {
        const mission = firstRound(s.history, (m) => m.cards[0] === 0 && !m.success);
        const m = s.history[mission - 1];
        return mission ? { mission, total: m.total, target: m.target } : null;
      },
      write: ({ mission, total, target }) => ({
        thought: `On mission ${mission} you played no energy, and the mission came up short (${total} of ${target}). From the outside, how would that look to the rest of the crew?`,
        idea: 'Only the total is public. A loyal player saving energy and a saboteur jamming can produce the same number.',
        perspective: 'Saving energy can be sound planning. It also hides you among the suspects — the same cover the saboteur relies on.',
        question: 'How could a loyal player prove their loyalty when only totals are visible?',
      }),
    }),
    rule({
      id: 'failed-mission',
      tier: 1,
      when: (s: SaboteurState) => {
        const mission = firstRound(s.history, (m) => !m.success);
        const m = s.history[mission - 1];
        return mission ? { mission, total: m.total, target: m.target } : null;
      },
      write: ({ mission, total, target }) => ({
        thought: `Mission ${mission} failed with a total of ${total} against a target of ${target}. A failed mission tells you something happened, but not necessarily who caused it.`,
        idea: 'An outcome is not the same as evidence about its cause. A short total could mean sabotage, or just a crew running low on energy.',
        perspective: 'Each failure narrows the suspects a little — mostly through who was on the team, and who was benched.',
        question: 'Which explanation for that failure did you rule out, and how?',
      }),
    }),
    rule({
      id: 'you-benched',
      tier: 2,
      when: (s: SaboteurState) => {
        const mission = firstRound(s.history, (m) => m.leader === 0);
        const m = s.history[mission - 1];
        return mission ? { mission, benched: crewName(m.bench), ok: m.success ? 1 : 0 } : null;
      },
      write: ({ mission, benched, ok }) => ({
        thought: `Leading mission ${mission}, you benched ${benched}, and the mission ${ok ? 'succeeded' : 'failed'}. What did that result tell you about the three who played?`,
        idea: 'Choosing a team is also running an experiment: who is left out changes what a success or failure can mean.',
        perspective: 'A success doesn’t clear everyone — a saboteur can play along when a jam wouldn’t matter.',
        question: 'Whom would you bench next time to learn the most?',
      }),
    }),
    rule({
      id: 'clean-run',
      tier: 2,
      when: (s: SaboteurState) => (s.history.length && s.history.every((m) => m.success) ? { n: s.history.length } : null),
      write: ({ n }) => ({
        thought: `All ${n} missions succeeded. With no failures to go on, what did you base your accusation on?`,
        idea: 'No failure means no direct evidence. A hidden opponent can stay hidden simply by never acting.',
        perspective: 'A clean record protected the score; it also left the saboteur with nothing to explain.',
        question: 'How would you find a saboteur who never sabotages?',
      }),
    }),
  ],
  general: {
    thought: 'A failed mission tells you something happened, but not necessarily who caused it.',
    idea: 'When only outcomes are visible, every player — loyal or not — looks the same. Evidence comes from patterns across missions.',
    perspective: 'Suspecting everyone protects missions but wastes trust; suspecting no one lets a saboteur work freely.',
    question: 'What pattern would convince you, and how many missions would it take to see it?',
  },
};

// ── Bluff ───────────────────────────────────────────────────────────────────

export const BLUFF: GameReflections<BluffState> = {
  game: 'bluff',
  lesson: 'signaling',
  rules: [
    rule({
      id: 'bluff-called',
      tier: 1,
      when: (s: BluffState) => {
        const round = firstRound(s.rounds, (r) => r.claimant === 'player' && r.call === true && r.claim! > tokenValue(r.tokens));
        const r = s.rounds[round - 1];
        return round ? { round, claim: r.claim!, value: tokenValue(r.tokens) } : null;
      },
      write: ({ round, claim, value }) => ({
        thought: `In round ${round} you claimed ${claim} holding ${value}, and it was called. What did your claim look like from the other side of the table?`,
        idea: 'A claim is judged against what is plausible. The further it sits from the likely value of the tokens, the more a challenge pays.',
        perspective: 'A bold claim that is sometimes true is harder to call than one that is always a bluff.',
        question: 'How would you make a big claim more believable next time?',
      }),
    }),
    rule({
      id: 'honest-called',
      tier: 1,
      when: (s: BluffState) => {
        const round = firstRound(s.rounds, (r) => r.claimant === 'player' && r.call === true && r.claim! <= tokenValue(r.tokens));
        const r = s.rounds[round - 1];
        return round ? { round, claim: r.claim! } : null;
      },
      write: ({ round, claim }) => ({
        thought: `In round ${round} your claim of ${claim} was true, and it was called anyway. Making a bold claim changes the situation even before anyone decides whether to believe it.`,
        idea: 'Truth and credibility are different things. An honest claim can still look like a bluff — and a challenger pays for guessing wrong.',
        perspective: 'Being called on a true claim earns you points; it may also make the other side more careful about calling next time.',
        question: 'What made that true claim look suspicious?',
      }),
    }),
    rule({
      id: 'bluff-believed',
      tier: 1,
      when: (s: BluffState) => {
        const round = firstRound(s.rounds, (r) => r.claimant === 'player' && r.call === false && r.claim! > tokenValue(r.tokens));
        const r = s.rounds[round - 1];
        return round ? { round, claim: r.claim!, value: tokenValue(r.tokens) } : null;
      },
      write: ({ round, claim, value }) => ({
        thought: `In round ${round} you claimed ${claim} holding ${value}, and it was believed. What made you confident it wouldn’t be called?`,
        idea: 'A bluff works when the claim sits inside what the other side finds plausible, and when calling costs them something.',
        perspective: 'A bluff that lands is tempting to repeat. Repeated, it becomes a pattern someone can call.',
        question: 'How often could you bluff like that before it stopped working?',
      }),
    }),
    rule({
      id: 'cracked',
      tier: 1,
      when: (s: BluffState) => {
        const round = firstRound(s.rounds, (r) => r.claimant === 'player' && r.bust);
        return round ? { round, drawn: s.rounds[round - 1].tokens.length } : null;
      },
      write: ({ round, drawn }) => ({
        thought: `In round ${round} you pressed to ${drawn} tokens and drew a Crack, so the round scored nothing. What were you hoping the extra tokens would buy?`,
        idea: 'Pressing raises what you can truthfully claim, at a fixed risk each draw. The reward grows; so does the chance of losing it all.',
        perspective: 'Stopping early is safe but leaves you claiming small — or bluffing to make up the difference.',
        question: 'At what hand value would you stop pressing, and why there?',
      }),
    }),
    rule({
      id: 'your-call',
      tier: 2,
      when: (s: BluffState) => {
        const round = firstRound(s.rounds, (r) => r.claimant === 'bot' && r.call === true);
        const r = s.rounds[round - 1];
        return round ? { round, claim: r.claim!, caught: r.claim! > tokenValue(r.tokens) ? 1 : 0 } : null;
      },
      write: ({ round, claim, caught }) => ({
        thought: `In round ${round} you called a claim of ${claim}, and it ${caught ? 'was a bluff' : 'turned out to be true'}. What tipped you into challenging that one?`,
        idea: 'A call is a bet: it pays when the claim is false and costs you when it’s true. Its value depends on the odds and on the claimant’s habits.',
        perspective: 'Calling rarely invites bigger bluffs; calling often makes honest claims expensive for you.',
        question: 'How much evidence would you want before the next call?',
      }),
    }),
  ],
  general: {
    thought: 'Making a bold claim changes the situation even before anyone decides whether to believe it.',
    idea: 'In Bluff, claims and challenges are linked: the more often someone calls, the less a bluff is worth, and the more an honest claim earns.',
    perspective: 'Confidence can be real or performed. From the outside, they look the same.',
    question: 'How would you play differently against someone who never calls?',
  },
};

// ── The Defusal (cooperative) ───────────────────────────────────────────────

export const DEFUSAL: GameReflections<DefusalState> = {
  game: 'defusal',
  lesson: null,
  rules: [
    rule({
      id: 'live-cut',
      tier: 1,
      when: (s: DefusalState) => {
        const i = s.turns.findIndex((t) => t.cutter === 'player' && t.live === true);
        if (i < 0) return null;
        // What you knew then: your clues, the clues your teammate had shared by that turn, and the earlier cuts.
        const theirs = s.turns.slice(0, i + 1).flatMap((t, j) => (playerCuts(j) && t.shared !== null ? [s.hands.bot[t.shared]] : []));
        const open = consistent({ ...s, turns: s.turns.slice(0, i) }, [...s.hands.player, ...theirs]).length;
        return { turn: i + 1, wire: `wire ${s.turns[i].cut! + 1} (${WIRE_COLORS[s.turns[i].cut!]})`, open };
      },
      write: ({ turn, wire, open }) => ({
        thought: `The ${wire} you cut on turn ${turn} was live. At that moment, the clues you had still allowed ${plural(open, 'possible pair')} of live wires — how much did you think they had ruled out?`,
        idea: 'Having a clue is different from knowing how much it rules out. Combining clues means checking which possibilities survive all of them.',
        perspective: 'Waiting for more information is safer, but the fuse keeps burning. Every turn spent sure is a turn spent.',
        question: 'Which clue would you most have wanted your teammate to share before that cut?',
      }),
    }),
    rule({
      id: 'teammate-live-cut',
      tier: 1,
      when: (s: DefusalState) => {
        const i = s.turns.findIndex((t) => t.cutter === 'bot' && t.live === true);
        if (i < 0) return null;
        const shared = count(s.turns.slice(0, i + 1), (t, j) => !playerCuts(j) && t.shared !== null);
        return { turn: i + 1, shared };
      },
      write: ({ turn, shared }) => ({
        thought: `Your teammate cut a live wire on turn ${turn}, after you had shared ${plural(shared, 'clue')}. What did they know at that moment that you didn’t — and what didn’t they?`,
        idea: 'In a team with split information, every clue you keep is a gap in your partner’s picture.',
        perspective: 'Sharing your strongest clue helps the most, but it isn’t always obvious which clue is strongest from their side.',
        question: 'Which of your clues would have changed that cut?',
      }),
    }),
    rule({
      id: 'first-share',
      tier: 2,
      when: (s: DefusalState) => {
        const i = s.turns.findIndex((t, j) => !playerCuts(j) && t.shared !== null);
        // You choose among your unshared clues; sharing nothing is only possible once every clue is out.
        return i >= 0 && s.hands.player.length > 1 ? { turn: i + 1, clue: clueText(s.hands.player[s.turns[i].shared!]).replace(/\.$/, ''), hand: s.hands.player.length } : null;
      },
      write: ({ turn, clue, hand }) => ({
        thought: `Of your ${hand} clues, the first you shared (turn ${turn}) was “${clue}”. What made it the one your teammate needed most?`,
        idea: 'A clue that feels decisive to you may overlap with what your partner already knows. The most useful clue is the one that rules out the most for them.',
        perspective: 'Sharing the clue you are surest of builds trust; sharing the one that cuts deepest may solve the board faster.',
        question: 'How could you tell which possibilities your teammate had already ruled out?',
      }),
    }),
    rule({
      id: 'defused',
      tier: 2,
      when: (s: DefusalState) => (defused(s) ? { left: fuseLeft(s) } : null),
      write: ({ left }) => ({
        thought: `You defused it with ${plural(left, 'turn')} of fuse to spare. Which clue did the most work?`,
        idea: 'In a shared puzzle, the best clue isn’t always the most specific one — it’s the one that rules out what the other person couldn’t.',
        perspective: 'Spare fuse is a cushion you didn’t need this time. On a harder board, it could be the difference.',
        question: 'Could you have spent fewer turns being certain?',
      }),
    }),
  ],
  general: {
    thought: 'Having a clue is different from knowing how much it rules out.',
    idea: 'Each of you holds part of the answer. The puzzle is solved by combining partial information, not by either clue alone.',
    perspective: 'Speed and certainty compete: every turn spent checking is a turn off the fuse.',
    question: 'What would you share first if you could share only one clue?',
  },
};

// ── The Power Play ──────────────────────────────────────────────────────────

const claimName = (m: PowerMove) => (m === 'income' ? 'Income' : ROLE_NAME[CLAIM_OF[m]]);
const aClaim = (role: string) => `${/^[AEIOU]/.test(role) ? 'an' : 'a'} ${role} claim`;

export const POWER_PLAY: GameReflections<PowerState> = {
  game: 'power-play',
  lesson: null,
  rules: [
    rule({
      id: 'challenge-lost',
      tier: 1,
      when: (s: PowerState) => {
        const turn = firstRound(s.turns, (t) => t.actor === 'bot' && t.challenged && t.truthful === true);
        return turn ? { turn, role: claimName(s.turns[turn - 1].move) } : null;
      },
      write: ({ turn, role }) => ({
        thought: `On turn ${turn} you challenged ${aClaim(role)} that turned out to be true, and lost a card. A challenge is also a decision under uncertainty — what made the risk worth taking?`,
        idea: 'A challenge pays when the claim is false and costs you when it’s true. Its value depends on how likely the claim was to be real.',
        perspective: 'Allowing a claim costs you the action’s effect; challenging can cost you a card. Which hurts more changes over the match.',
        question: 'How many cards of that role could you account for when you challenged?',
      }),
    }),
    rule({
      id: 'challenge-won',
      tier: 1,
      when: (s: PowerState) => {
        const turn = firstRound(s.turns, (t) => t.actor === 'bot' && t.challenged && t.truthful === false);
        return turn ? { turn, role: claimName(s.turns[turn - 1].move) } : null;
      },
      write: ({ turn, role }) => ({
        thought: `On turn ${turn} you challenged ${aClaim(role)} and caught a bluff. What made that claim feel false?`,
        idea: 'Bluffs become more detectable when you track which roles have been claimed, revealed or lost.',
        perspective: 'A successful challenge can make an opponent more honest — or simply more careful about when they bluff.',
        question: 'Would you challenge the same claim again, at the same moment?',
      }),
    }),
    rule({
      id: 'your-bluff-caught',
      tier: 1,
      when: (s: PowerState) => {
        const turn = firstRound(s.turns, (t) => t.actor === 'player' && t.challenged && t.truthful === false);
        return turn ? { turn, role: claimName(s.turns[turn - 1].move) } : null;
      },
      write: ({ turn, role }) => ({
        thought: `On turn ${turn} you claimed ${role} without the card, and were challenged. What did that claim look like from the other side?`,
        idea: 'A claim is credible when it fits what the other side can see: cards revealed, roles claimed before, what you need right now.',
        perspective: 'Bluffing the role you most need is also the bluff an opponent most expects.',
        question: 'When would a bluff of that role have been safer?',
      }),
    }),
    rule({
      id: 'truth-challenged',
      tier: 1,
      when: (s: PowerState) => {
        const turn = firstRound(s.turns, (t) => t.actor === 'player' && t.challenged && t.truthful === true);
        return turn ? { turn, role: claimName(s.turns[turn - 1].move) } : null;
      },
      write: ({ turn, role }) => ({
        thought: `On turn ${turn} your true ${role} claim was challenged, and the challenger lost a card. Why do you think your claim looked doubtful?`,
        idea: 'Truth and credibility are not the same. An honest claim that looks unlikely invites a challenge — which then costs the challenger.',
        perspective: 'Being challenged on the truth helps you now; it may also make your next claim easier to believe.',
        question: 'How could you use a reputation for honest claims later in a match?',
      }),
    }),
    rule({
      id: 'quiet-income',
      tier: 2,
      when: (s: PowerState) => {
        const mine = s.turns.filter((t) => t.actor === 'player');
        const k = count(mine, (t) => t.move === 'income');
        return mine.length >= 3 && k * 2 >= mine.length ? { k, n: mine.length } : null;
      },
      write: ({ k, n }) => ({
        thought: `You took plain Income on ${k} of your ${n} turns — no claim, nothing to challenge. Was that safety, or a way of hiding what you held?`,
        idea: 'A move that can’t be challenged gives nothing away, but it also gains slowly.',
        perspective: 'Safe moves protect your cards; claims speed you up and expose you.',
        question: 'When would a claim have been worth the exposure?',
      }),
    }),
  ],
  general: {
    thought: 'A challenge is also a decision under uncertainty. What made a risk worth taking in this match?',
    idea: 'In the Power Play, any claim might be true. Every claim, challenge and block is a bet on what the other side holds.',
    perspective: 'Challenging rarely lets bluffs pass; challenging often makes honest claims costly for you.',
    question: 'Which claim in this match would you most like to have challenged — or left alone?',
  },
};

// ── The Last Stand (cooperative) ────────────────────────────────────────────

export const LAST_STAND: GameReflections<StandState> = {
  game: 'last-stand',
  lesson: null,
  rules: [
    rule({
      id: 'burned-out',
      tier: 1,
      when: (s: StandState) => {
        const round = firstRound(s.rounds, (r) => r.newlyBurned.length > 0);
        const r = s.rounds[round - 1];
        return round ? { round, district: DISTRICTS[r.newlyBurned[0]], yours: planText(r.you) } : null;
      },
      write: ({ round, district, yours }) => ({
        thought: `${district} burned out in round ${round}, the round you chose “${yours}”. When did it stop being the next problem and become the current one?`,
        idea: 'Solving the most visible problem isn’t always the same as preventing the next one. Fires that are small now spread later.',
        perspective: 'Every action in one place is an action not taken somewhere else. Some losses are the price of saving more.',
        question: 'Looking at the map one round earlier, which district would you have watched?',
      }),
    }),
    rule({
      id: 'double-douse',
      tier: 1,
      when: (s: StandState) => {
        const round = firstRound(s.rounds, (r) => r.you.kind === 'douse' && r.bot.kind === 'douse' && r.you.d === r.bot.d);
        const r = s.rounds[round - 1];
        return round && r.you.kind === 'douse' ? { round, district: DISTRICTS[r.you.d] } : null;
      },
      write: ({ round, district }) => ({
        thought: `In round ${round}, you and your teammate both doused ${district}. Was it worth two of your shared buckets?`,
        idea: 'Your teammate announces first, so coordination is in your hands: doubling up and splitting up are both choices.',
        perspective: 'Two buckets on one fire can finish it off; one on each of two fires can keep both from spreading.',
        question: 'What would you have done with your action if your teammate’s had been enough?',
      }),
    }),
    rule({
      id: 'firebreaks',
      tier: 2,
      when: (s: StandState) => {
        const k = count(s.rounds, (r) => r.you.kind === 'firebreak');
        return k >= 2 ? { k } : null;
      },
      write: ({ k }) => ({
        thought: `You placed ${k} firebreaks. They cost no water but put out nothing — what were you protecting against?`,
        idea: 'Prevention spends effort on what hasn’t happened yet. It pays when you guess the spread right.',
        perspective: 'A firebreak in the wrong place is a wasted round while a fire grows elsewhere.',
        question: 'How did you choose where the next spread would come from?',
      }),
    }),
    rule({
      id: 'refills',
      tier: 2,
      when: (s: StandState) => {
        const k = count(s.rounds, (r) => r.you.kind === 'refill');
        return k >= 2 ? { k } : null;
      },
      write: ({ k }) => ({
        thought: `You refilled the shared water ${times(k)}. Each refill was a round without fighting a fire — how did you decide when the supply mattered more?`,
        idea: 'A shared resource needs someone to maintain it. Whoever does pays in actions now so both can act later.',
        perspective: 'Refilling too late leaves you both dry at the worst moment; too early lets fires grow.',
        question: 'Who should refill when both of you could be fighting fires?',
      }),
    }),
    rule({
      id: 'held',
      tier: 2,
      when: (s: StandState) => (held(s) ? { water: s.water } : null),
      write: ({ water }) => ({
        thought: `The line held, with ${plural(water, 'unit')} of water left. Which round do you think decided it?`,
        idea: 'In a crisis with shared resources, the turning point is often a quiet round where a small fire was stopped before it spread.',
        perspective: 'Holding out is the goal, but how much is left at the end shows how close it was.',
        question: 'Would the same plan have held on a harder day?',
      }),
    }),
  ],
  general: {
    thought: 'Solving the most visible problem isn’t always the same as preventing the next one.',
    idea: 'Fires spread from wherever they are hot. Choosing where to act means guessing where the next problem will come from.',
    perspective: 'Splitting effort covers more ground; concentrating it finishes the job.',
    question: 'How would you divide the work if you and your teammate couldn’t see each other’s plans?',
  },
};

// ── Liar’s Dice ─────────────────────────────────────────────────────────────

export const LIARS_DICE: GameReflections<DiceState> = {
  game: 'liars-dice',
  lesson: 'bayesian-uncertainty',
  rules: [
    rule({
      id: 'called-and-lost',
      tier: 1,
      when: (s: DiceState) => {
        const round = firstRound(s.rounds, (r) => r.caller === 'player' && r.loser === 'player');
        const r = s.rounds[round - 1];
        return round ? { round, bid: bidText(r.bids[r.bids.length - 1]), count: r.count } : null;
      },
      write: ({ round, bid, count: c }) => ({
        thought: `In round ${round} you called Liar on ${bid}, and there were ${c}. Your decision depended on more than the dice you could see — what did you assume about the ones you couldn’t?`,
        idea: 'A bid is a claim about all the dice, most of them hidden. Your own dice tell you part of the count; the rest is probability and reading the bidder.',
        perspective: 'A bid that looks greedy from your side may be modest from theirs, if their cup holds what yours doesn’t.',
        question: 'How many of that face did you expect in their cup, and why?',
      }),
    }),
    rule({
      id: 'your-bid-called',
      tier: 1,
      when: (s: DiceState) => {
        const round = firstRound(s.rounds, (r) => r.caller === 'bot' && r.loser === 'player');
        const r = s.rounds[round - 1];
        return round ? { round, bid: bidText(r.bids[r.bids.length - 1]), count: r.count } : null;
      },
      write: ({ round, bid, count: c }) => ({
        thought: `In round ${round} your bid of ${bid} was called, and there were only ${c}. Were you counting on their dice, or pushing because raising felt safer than calling?`,
        idea: 'Each raise has to be true across both cups. The higher it goes, the more it relies on dice you can’t see.',
        perspective: 'Calling ends the round on someone else’s claim; raising keeps it going on yours. Both are bets.',
        question: 'At what point in that round would calling have felt better than raising?',
      }),
    }),
    rule({
      id: 'called-and-won',
      tier: 1,
      when: (s: DiceState) => {
        const round = firstRound(s.rounds, (r) => r.caller === 'player' && r.loser === 'bot');
        const r = s.rounds[round - 1];
        return round ? { round, bid: bidText(r.bids[r.bids.length - 1]), count: r.count } : null;
      },
      write: ({ round, bid, count: c }) => ({
        thought: `In round ${round} you called ${bid}, and there were only ${c}. What told you that bid had gone too far?`,
        idea: 'A call combines what you see with what is likely in the dice you don’t. The more dice in play, the wider that hidden range.',
        perspective: 'A right call can still be a risky one; the same read against a different cup could have lost a die.',
        question: 'Would you have made the same call with one fewer die in your own cup?',
      }),
    }),
    rule({
      id: 'your-bid-held',
      tier: 2,
      when: (s: DiceState) => {
        const round = firstRound(s.rounds, (r) => r.caller === 'bot' && r.loser === 'bot');
        const r = s.rounds[round - 1];
        return round ? { round, bid: bidText(r.bids[r.bids.length - 1]), count: r.count } : null;
      },
      write: ({ round, bid, count: c }) => ({
        thought: `In round ${round} your bid of ${bid} was called, and there were ${c}. What did you know that made it safe?`,
        idea: 'A bid backed by your own dice is safer than it looks from across the table — the other side can’t see what you hold.',
        perspective: 'Bidding on your own dice also tells an attentive opponent something about your cup.',
        question: 'How could you bid strongly without giving your cup away?',
      }),
    }),
  ],
  general: {
    thought: 'Your decisions depended on more than the dice you could see. What did you assume about the dice you couldn’t?',
    idea: 'Liar’s Dice is reasoning under incomplete information: your cup is certain, theirs is probability, and every bid is a hint.',
    perspective: 'A bid may reflect what someone holds — or what they want you to think they hold.',
    question: 'How much would you trust a bid on a face you hold none of?',
  },
};

// ── The Codebreaker (cooperative) ───────────────────────────────────────────

const themeName = (t: string) => t[0].toUpperCase() + t.slice(1);

export const CODEBREAKER: GameReflections<CodeState> = {
  game: 'codebreaker',
  lesson: 'coordination-problem',
  rules: [
    rule({
      id: 'your-clue-trap',
      tier: 1,
      when: (s: CodeState) => {
        const round = firstRound(s.rounds, (r) => r.giver === 'player' && r.guesses.some((g) => r.board.key[g] === 'trap'));
        if (!round) return null;
        const r = s.rounds[round - 1];
        return { round, clue: themeName(r.clue.theme), n: r.clue.n, word: r.board.words[r.guesses.find((g) => r.board.key[g] === 'trap')!] };
      },
      write: ({ round, clue, n, word }) => ({
        thought: `In round ${round} your clue “${clue}” for ${n} led your teammate to ${word}, a trap. A clue can make perfect sense to the person giving it and mean something different to the person receiving it.`,
        idea: 'A clue is only as good as the shared meaning behind it. What links two words in your mind may link different words in theirs.',
        perspective: 'A narrower clue is safer but covers fewer words; a broad one covers more and invites wrong turns.',
        question: 'Which word on the board did your clue fit that you hadn’t noticed?',
      }),
    }),
    rule({
      id: 'you-hit-trap',
      tier: 1,
      when: (s: CodeState) => {
        const round = firstRound(s.rounds, (r) => r.giver === 'bot' && r.guesses.some((g) => r.board.key[g] === 'trap'));
        if (!round) return null;
        const r = s.rounds[round - 1];
        return { round, clue: themeName(r.clue.theme), n: r.clue.n, word: r.board.words[r.guesses.find((g) => r.board.key[g] === 'trap')!] };
      },
      write: ({ round, clue, n, word }) => ({
        thought: `In round ${round}, the clue “${clue}” for ${n} led you to ${word}, a trap. What connection did you see that your teammate didn’t mean?`,
        idea: 'Interpreting a clue means guessing what the giver had in mind, not just what the word could mean.',
        perspective: 'A link can be real and still not be the intended one. The giver also had to avoid the traps — that shapes their clue.',
        question: 'Which words would your teammate have been trying to steer you away from?',
      }),
    }),
    rule({
      id: 'clue-landed',
      tier: 2,
      when: (s: CodeState) => {
        const round = firstRound(s.rounds, (r) => r.giver === 'player' && r.clue.n >= 2 && count(r.guesses, (g) => r.board.key[g] === 'target') >= r.clue.n);
        const r = s.rounds[round - 1];
        return round ? { round, clue: themeName(r.clue.theme), n: r.clue.n } : null;
      },
      write: ({ round, clue, n }) => ({
        thought: `In round ${round} your clue “${clue}” for ${n} landed every word. What made that link so clear to both of you?`,
        idea: 'The best clues rest on shared context: associations both people are likely to make, not just ones that are true.',
        perspective: 'A clue that works with one partner may fail with another who thinks in different links.',
        question: 'Would that clue have worked with a teammate who thinks more literally?',
      }),
    }),
    rule({
      id: 'stopped-short',
      tier: 2,
      when: (s: CodeState) => {
        const round = firstRound(s.rounds, (r) => r.giver === 'bot' && r.guesses.length < r.clue.n && r.guesses.every((g) => r.board.key[g] === 'target'));
        const r = s.rounds[round - 1];
        return round ? { round, clue: themeName(r.clue.theme), n: r.clue.n, made: r.guesses.length } : null;
      },
      write: ({ round, clue, n, made }) => ({
        thought: `In round ${round}, with “${clue}” for ${n}, you stopped after ${plural(made, 'guess', 'guesses')}. What made the next word feel too uncertain?`,
        idea: 'Stopping early trades possible points for safety. The number in a clue is a promise about how many words fit.',
        perspective: 'Trusting the number fully can lead into a trap; doubting it can leave points behind.',
        question: 'How much do you trust a teammate’s number when the last word is a stretch?',
      }),
    }),
  ],
  general: {
    thought: 'A clue can make perfect sense to the person giving it and mean something different to the person receiving it.',
    idea: 'Communication works through shared context. A good clue is one your teammate is likely to read the way you meant it.',
    perspective: 'Safe clues avoid traps and score slowly; ambitious ones score fast and risk misreading.',
    question: 'How would you clue differently for someone you’d never played with?',
  },
};

// ── The Gambit ──────────────────────────────────────────────────────────────

const KIND = { step: 'Step', dash: 'Dash', strike: 'Strike' } as const;
const turnOf = (i: number) => Math.floor(i / 2) + 1;

export const GAMBIT: GameReflections<GambitState> = {
  game: 'gambit',
  lesson: null,
  rules: [
    rule({
      id: 'failed-risk',
      tier: 1,
      when: (s: GambitState) => {
        const i = s.turns.findIndex((t) => t.side === 'player' && t.move.kind !== 'step' && !t.success);
        return i >= 0 ? { turn: turnOf(i), kind: KIND[s.turns[i].move.kind] } : null;
      },
      write: ({ turn, kind }) => ({
        thought: `Your ${kind} on turn ${turn} didn’t come off. A risky move can look attractive because of what it might gain — what did it cost you when it failed?`,
        idea: 'A risky move is worth its odds times its payoff, minus what a failure costs: a lost tempo, a piece left exposed.',
        perspective: 'The same move can be smart and still fail. Judging it by its result alone hides the odds you faced.',
        question: 'Would you make that move again with the same position and the same odds?',
      }),
    }),
    rule({
      id: 'strike-landed',
      tier: 1,
      when: (s: GambitState) => {
        const i = s.turns.findIndex((t) => t.side === 'player' && t.move.kind === 'strike' && t.success);
        return i >= 0 ? { turn: turnOf(i) } : null;
      },
      write: ({ turn }) => ({
        thought: `Your Strike on turn ${turn} landed and took a piece. Was it the odds that made it worth trying, or the position it put you in?`,
        idea: 'A successful gamble feels like proof it was right. Whether it was depends on what a failure would have cost.',
        perspective: 'Luck rewarded the move this time; the same choice fails often enough to matter.',
        question: 'What would your position have looked like if the Strike had missed?',
      }),
    }),
    rule({
      id: 'lost-a-piece',
      tier: 1,
      when: (s: GambitState) => {
        const i = s.turns.findIndex((t) => t.side === 'bot' && t.move.kind === 'strike' && t.success);
        return i >= 0 ? { turn: turnOf(i) } : null;
      },
      write: ({ turn }) => ({
        thought: `On turn ${turn} one of your pieces was taken by a Strike. Did you see that piece was exposed?`,
        idea: 'Position is about danger as well as progress: a piece in reach of a Strike carries a risk every turn it stays there.',
        perspective: 'Leaving a piece exposed can be a fair trade if it buys progress elsewhere.',
        question: 'How would you weigh moving forward against staying out of reach?',
      }),
    }),
    rule({
      id: 'only-steps',
      tier: 2,
      when: (s: GambitState) => {
        const mine = s.turns.filter((t) => t.side === 'player');
        return mine.length >= 4 && mine.every((t) => t.move.kind === 'step') ? { n: mine.length } : null;
      },
      write: ({ n }) => ({
        thought: `All ${n} of your moves were sure Steps. Safety never failed you — did it ever cost you?`,
        idea: 'Certain moves avoid bad luck, but they also give up the chance to jump ahead.',
        perspective: 'Against an opponent who takes risks, steady play can win on their failures; against a lucky one, it can fall behind.',
        question: 'Was there a moment when a Dash or Strike would have been worth its odds?',
      }),
    }),
    rule({
      id: 'risk-heavy',
      tier: 2,
      when: (s: GambitState) => {
        const mine = s.turns.filter((t) => t.side === 'player');
        const risky = count(mine, (t) => t.move.kind !== 'step');
        return mine.length >= 4 && risky * 2 >= mine.length ? { risky, n: mine.length } : null;
      },
      write: ({ risky, n }) => ({
        thought: `${risky} of your ${n} moves were Dashes or Strikes. What did the risky moves buy you, and what did the misses cost?`,
        idea: 'Risk pays when the gain from success outweighs the loss from failure, across many tries — not just the one in front of you.',
        perspective: 'Frequent gambles make results swingy; a few well-chosen ones can do the same work.',
        question: 'Which of your risky moves would you keep, and which would you swap for a Step?',
      }),
    }),
  ],
  general: {
    thought: 'A risky move can look attractive because of what it might gain. What did it cost when it failed?',
    idea: 'The Gambit weighs safety, position and chance. A good decision and a good outcome are different things.',
    perspective: 'Playing safe protects you from bad luck; playing bold gives luck a chance to help.',
    question: 'How would you play if every risky move had slightly worse odds?',
  },
};
