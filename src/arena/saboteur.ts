import { type ArenaEngine, CODENAMES, type Debrief, LENGTH_ROUNDS, type Setup, clamp, draw, drawInt, resultFrom } from './core.ts';

/**
 * The Saboteur — a crew of four runs missions; one bot crew member is secretly working against it.
 *
 * Seats: you (0) and three bot crew (Ash, Birch, Cedar). One bot — fixed by the seed — is the saboteur. You are always
 * loyal and always on the mission.
 *
 * Each mission:
 * 1. Leadership rotates (you lead mission 1, then Ash, Birch, Cedar, you, …). The leader benches one bot; the team is
 *    you plus the other two bots (a bot leader never benches itself).
 * 2. The mission needs a total of at least its target (5–8, public, fixed by the seed).
 * 3. Each team member secretly plays a card: 0–3 energy from their own budget (ENERGY_PER_MISSION × missions to start),
 *    or — the saboteur only — a JAM card worth −1 that costs no energy.
 * 4. Only the total is revealed — never the cards. A jam looks exactly like weak effort; loyal bots sometimes play a
 *    card lower than planned (25 %, seeded), so one bad total proves nothing.
 *    Total ≥ target: success (+2 to you). Otherwise: failure (+2 to the saboteur).
 * After the last mission you accuse one bot. Right: +3 to you. Wrong: +3 to the saboteur. More points wins.
 *
 * Information: the saboteur knows only that it is the saboteur — not your energy, not anyone else’s cards. Loyal bots know
 * they are loyal. Everyone sees the same public record (leaders, benches, targets, totals).
 *
 * The personality is the saboteur's method — when it jams, and whom it benches when it leads. It is predicted
 * separately from who the saboteur is.
 */

export const SABOTEUR_STYLES = ['planner', 'investigator', 'opportunist', 'deceiver'] as const;
export type SaboteurStyle = (typeof SABOTEUR_STYLES)[number];
export const SABOTEUR_NAME: Record<SaboteurStyle, string> = { planner: 'The Mission Planner', investigator: 'The Investigator', opportunist: 'The Opportunistic Saboteur', deceiver: 'The Deceptive Saboteur' };

export type SaboteurVariant = 'standard';
export const SABOTEUR_VARIANTS: readonly SaboteurVariant[] = ['standard'];
export const saboteurMissions = LENGTH_ROUNDS(4, 5, 6);
export const saboteurRounds = (length: Setup['length']) => saboteurMissions(length) + 1;
export const ENERGY_PER_MISSION = 2;
export const MAX_CARD = 3;
export const JAM = -1;
export const MISSION_POINTS = 2;
export const ACCUSE_POINTS = 3;

export type SaboteurAction = { kind: 'mission'; bench?: number; card: number } | { kind: 'accuse'; suspect: number };

export interface Mission {
  leader: number;
  target: number;
  bench: number;
  /** Cards by seat (null for the benched bot). JAM is −2. */
  cards: (number | null)[];
  /** The only thing revealed: the sum of the cards. */
  total: number;
  success: boolean;
}

export interface SaboteurState {
  setup: Setup<SaboteurVariant, SaboteurStyle>;
  missions: number;
  saboteur: number;
  energy: number[];
  history: Mission[];
  accused: number | null;
}

export const crewName = (seat: number) => (seat === 0 ? 'You' : CODENAMES[seat - 1]);
export const leaderOf = (n: number) => n % 4;
export const missionTarget = (s: SaboteurState, n: number) => drawInt(s.setup.seed, n, 0, 5, 8);
/** The two bots on a mission's team. */
export const teamBots = (m: Mission) => [1, 2, 3].filter((b) => b !== m.bench);

/**
 * Public suspicion of each bot, as a loyal crew member reads the record (totals only): for every mission a bot was on,
 * + the shortfall below the target, halved between the two bots on the team; −1 for each success. Without your card it
 * can't tell a jam from a weak effort.
 */
export function suspicion(h: readonly Mission[]): number[] {
  const sus = [0, 0, 0, 0];
  for (const m of h)
    for (const b of teamBots(m)) {
      if (m.success) sus[b] -= 1;
      else sus[b] += (m.target - m.total) / 2;
    }
  return sus;
}

const mostSuspicious = (sus: number[], among: number[], tie: number) => [...among].sort((a, b) => sus[b] - sus[a] || ((a + tie) % 4) - ((b + tie) % 4))[0];

/**
 * A bot's honest card: its share of the target (3 when the target is 7+, else 2), keeping energy for the missions still
 * to come, and 25 % of the time (seeded) one lower — honest crews have off days too. The saboteur uses the same card
 * when it plays clean.
 */
function loyalCard(s: SaboteurState, seat: number, n: number): number {
  const left = s.missions - n;
  const target = missionTarget(s, n);
  const want = (target >= 7 ? 3 : 2) - (draw(s.setup.seed, n, 10 + seat) < 0.25 ? 1 : 0);
  const reserve = Math.floor(s.energy[seat] / Math.max(1, left)) + 1;
  return clamp(Math.min(want, reserve), 0, Math.min(MAX_CARD, s.energy[seat]));
}

/** The saboteur's estimate of one teammate's card: what the others added on its past missions, per player. */
function expectedOthers(s: SaboteurState): number {
  const seen = s.history.filter((m) => m.cards[s.saboteur] !== null).map((m) => (m.total - m.cards[s.saboteur]!) / 2);
  return seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : 2;
}

/**
 * The saboteur's card on a mission it is on.
 *
 * Mission Planner — plays the perfect crew member: full cards early, and jams only when it needs failures to win —
 *   Easy: only on the final mission; Normal: from the second half, whenever successes lead failures; Hard: the same,
 *   but never on a mission it leads, and never twice in a row.
 * Investigator — jams often and deflects: Easy on every mission it's on; Normal and Hard on every other one (Hard skips a
 *   jam right after a failed mission, when eyes are on the team).
 * Opportunist — jams only when the jam decides the mission: it estimates the other two cards from what it has seen, and
 *   jams if the mission would succeed without the jam but fail with it. Easy just jams half the time (seeded).
 * Deceiver — clean when it leads (the leader draws attention), jams when someone else leads; Hard also stops after two
 *   jams in a row to rebuild trust.
 */
export function saboteurCard(s: SaboteurState, n: number, u: number): number {
  const me = s.saboteur;
  const { level, persona } = s.setup;
  const h = s.history;
  const target = missionTarget(s, n);
  const normal = loyalCard(s, me, n);
  const leading = leaderOf(n) === me;
  const onTeam = h.filter((m) => m.bench !== me);
  const lastOn = onTeam[onTeam.length - 1];
  const jammedLast = lastOn ? lastOn.cards[me] === JAM : false;
  const fails = h.filter((m) => !m.success).length;
  const wins = h.length - fails;
  const finalMission = n === s.missions - 1;

  if (persona === 'planner') {
    if (level === 'easy') return finalMission ? JAM : MAX_CARD <= s.energy[me] ? MAX_CARD : normal;
    const late = n >= Math.floor(s.missions / 2);
    const need = wins >= fails;
    if (level === 'hard' && (leading || jammedLast)) return normal;
    return late && need ? JAM : Math.min(MAX_CARD, s.energy[me]);
  }
  if (persona === 'investigator') {
    if (level === 'easy') return JAM;
    const myMissions = onTeam.length;
    if (level === 'hard' && h.length && !h[h.length - 1].success) return normal;
    return myMissions % 2 === 0 ? JAM : normal;
  }
  if (persona === 'opportunist') {
    if (level === 'easy') return u < 0.5 ? JAM : normal;
    const others = 2 * expectedOthers(s);
    const withMe = others + normal;
    const withJam = others + JAM;
    return withMe >= target && withJam < target ? JAM : normal;
  }
  // deceiver
  if (leading) return normal;
  if (level === 'hard' && onTeam.length >= 2 && onTeam.slice(-2).every((m) => m.cards[me] === JAM)) return normal;
  return JAM;
}

/**
 * Whom a bot leader benches (never itself, never you). Loyal leaders bench the most suspicious other bot. A saboteur
 * leader: Planner and Opportunist bench the most suspicious bot too (looking diligent); Investigator benches whoever
 * shared the most failed missions with it (pinning its failures on them); Deceiver benches the least suspicious —
 * the most trusted crew member — so the team it joins looks weaker.
 */
export function benchChoice(s: SaboteurState, n: number): number {
  const leader = leaderOf(n);
  const others = [1, 2, 3].filter((b) => b !== leader);
  const sus = suspicion(s.history);
  if (leader !== s.saboteur || s.setup.persona === 'planner' || s.setup.persona === 'opportunist') return mostSuspicious(sus, others, n);
  if (s.setup.persona === 'investigator') {
    const shared = (b: number) => s.history.filter((m) => !m.success && m.bench !== b && m.bench !== leader).length;
    return [...others].sort((a, b) => shared(b) - shared(a) || a - b)[0];
  }
  return [...others].sort((a, b) => sus[a] - sus[b] || a - b)[0];
}

export function saboteurPrompt(s: SaboteurState): { phase: 'mission'; mission: number; leader: number; target: number; bench: number | null; energy: number } | { phase: 'accuse' } | null {
  if (s.accused !== null) return null;
  const n = s.history.length;
  if (n >= s.missions) return { phase: 'accuse' };
  const leader = leaderOf(n);
  return { phase: 'mission', mission: n + 1, leader, target: missionTarget(s, n), bench: leader === 0 ? null : benchChoice(s, n), energy: s.energy[0] };
}

function validate(s: SaboteurState, a: SaboteurAction): string | null {
  const p = saboteurPrompt(s);
  if (!p) return 'The operation is over.';
  if (!a || typeof a !== 'object') return 'Choose an action.';
  if (p.phase === 'accuse') return a.kind === 'accuse' && [1, 2, 3].includes(a.suspect) ? null : 'Accuse Ash, Birch or Cedar.';
  if (a.kind !== 'mission') return 'Play your card for this mission first.';
  if (!Number.isInteger(a.card) || a.card < 0 || a.card > Math.min(MAX_CARD, s.energy[0])) return `Play 0 to ${Math.min(MAX_CARD, s.energy[0])} energy.`;
  if (p.leader === 0 && ![1, 2, 3].includes(a.bench as number)) return 'You lead this mission: bench one bot.';
  return null;
}

function apply(s: SaboteurState, a: SaboteurAction): SaboteurState {
  const why = validate(s, a);
  if (why) throw new Error(`saboteur: ${why}`);
  if (a.kind === 'accuse') return { ...s, accused: a.suspect };
  const n = s.history.length;
  const leader = leaderOf(n);
  const bench = leader === 0 ? a.bench! : benchChoice(s, n);
  const target = missionTarget(s, n);
  // Bots play from the record before this mission; nobody sees anyone else's card.
  const cards = [0, 1, 2, 3].map((i) => (i === bench ? null : i === 0 ? a.card : i === s.saboteur ? saboteurCard(s, n, draw(s.setup.seed, n, 5)) : loyalCard(s, i, n)));
  const played = cards.filter((c): c is number => c !== null);
  const total = played.reduce((t, c) => t + c, 0);
  const energy = s.energy.map((e, i) => e - (cards[i] !== null && cards[i]! > 0 ? cards[i]! : 0));
  const mission: Mission = { leader, target, bench, cards, total, success: total >= target };
  return { ...s, energy, history: [...s.history, mission] };
}

export const saboteurScores = (s: SaboteurState): [number, number] => {
  const ok = s.history.filter((m) => m.success).length;
  const fail = s.history.length - ok;
  const right = s.accused !== null && s.accused === s.saboteur;
  const wrong = s.accused !== null && !right;
  return [ok * MISSION_POINTS + (right ? ACCUSE_POINTS : 0), fail * MISSION_POINTS + (wrong ? ACCUSE_POINTS : 0)];
};

function saboteurDebrief(s: SaboteurState): Debrief {
  const h = s.history.map((m, i) => ({ m, i }));
  const sab = s.saboteur;
  const moments: { at: number; text: string }[] = [];
  const team = (m: Mission) => [1, 2, 3].filter((b) => b !== m.bench).map(crewName).join(' and ');
  const firstJam = h.find(({ m }) => m.cards[sab] === JAM);
  if (firstJam) moments.push({ at: firstJam.i, text: `Mission ${firstJam.i + 1}: ${team(firstJam.m)} were on the team and the total came up short — the −1 jam was ${crewName(sab)}’s.` });
  const myBench = h.find(({ m }) => m.leader === 0);
  if (myBench) {
    const { m, i } = myBench;
    moments.push({ at: i, text: `Mission ${i + 1}: you benched ${crewName(m.bench)}${m.bench === sab ? ' — the saboteur, keeping it off the team' : ''}. It ${m.success ? 'succeeded' : 'failed'} (total ${m.total} vs target ${m.target}).` });
  }
  const thin = h.find(({ m }) => !m.success && !m.cards.includes(JAM));
  if (thin && moments.length < 3) moments.push({ at: thin.i, text: `Mission ${thin.i + 1} failed with no jam at all: a total of ${thin.m.total} fell short of ${thin.m.target}. Not every failure is sabotage — sometimes the team just runs out of energy.` });
  if (s.accused !== null) moments.push({ at: 99, text: s.accused === sab ? `You accused ${crewName(sab)} — correct.` : `You accused ${crewName(s.accused)}; the saboteur was ${crewName(sab)}.` });
  const insight = `The saboteur had a hidden incentive and the same public face as everyone else — the classic principal–agent problem. Each jammed mission narrows it to two; who you bench, and who keeps turning up on failed missions, does the rest. Benching the most suspicious bot protects the mission and is itself a test.`;
  const myJams = h.filter(({ m }) => m.cards[sab] === JAM).map(({ i }) => i + 1);
  const onCount = h.filter(({ m }) => m.bench !== sab).length;
  const style: Record<SaboteurStyle, string> = {
    planner: 'played like the best crew member and saved its jams for when failures were needed',
    investigator: 'jammed often and pointed the bench at others',
    opportunist: 'jammed only when a jam would decide the mission',
    deceiver: 'stayed clean on its own missions and jammed on other people’s',
  };
  return {
    headline: s.accused === sab ? 'Saboteur caught' : 'The saboteur slipped away',
    moments: moments.sort((a, b) => a.at - b.at).slice(0, 3).map((m) => m.text),
    insight,
    opponentRead: `${SABOTEUR_NAME[s.setup.persona]} (${crewName(sab)}) ${style[s.setup.persona]}: it was on ${onCount} of ${h.length} missions and jammed ${myJams.length ? `mission${myJams.length === 1 ? '' : 's'} ${myJams.join(', ')}` : 'none of them'}.`,
  };
}

export const saboteur: ArenaEngine<SaboteurState, SaboteurAction, SaboteurVariant> = {
  id: 'saboteur',
  opponents: SABOTEUR_STYLES,
  variants: SABOTEUR_VARIANTS,
  rounds: saboteurRounds,
  create(setup) {
    const s = setup as Setup<SaboteurVariant, SaboteurStyle>;
    const missions = saboteurMissions(s.length);
    return { setup: s, missions, saboteur: drawInt(s.seed, 900, 0, 1, 3), energy: [0, 1, 2, 3].map(() => ENERGY_PER_MISSION * missions), history: [], accused: null };
  },
  validate,
  apply,
  isOver: (s) => s.accused !== null,
  played: (s) => s.history.length + (s.accused !== null ? 1 : 0),
  result(s) {
    const [p, b] = saboteurScores(s);
    return {
      ...resultFrom(
        [
          { id: 'you', name: 'You', score: p, isPlayer: true },
          { id: 'saboteur', name: `The saboteur (${crewName(s.saboteur)})`, score: b, isPlayer: false },
        ],
        'points',
      ),
      headline: s.accused === null ? undefined : s.accused === s.saboteur ? 'Saboteur caught' : 'The saboteur slipped away',
    };
  },
  debrief: saboteurDebrief,
  moves(s) {
    const p = saboteurPrompt(s);
    if (!p) return [];
    if (p.phase === 'accuse') return [1, 2, 3].map((suspect) => ({ kind: 'accuse', suspect }) as SaboteurAction);
    const cards = [...new Set([0, Math.min(2, p.energy), Math.min(MAX_CARD, p.energy)])];
    return cards.flatMap((card) => (p.leader === 0 ? [1, 2, 3].map((bench) => ({ kind: 'mission', bench, card }) as SaboteurAction) : [{ kind: 'mission', card } as SaboteurAction]));
  },
};
