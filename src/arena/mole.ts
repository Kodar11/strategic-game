import { type ArenaEngine, CODENAMES, type Debrief, LENGTH_ROUNDS, type Setup, draw, drawInt, plural, resultFrom } from './core.ts';

/**
 * The Mole — find the insider among four suspects from evidence, interrogations and everyone's accusations.
 *
 * Seats: four bot suspects (codenames Ash, Birch, Cedar, Dune). One of them — fixed by the seed — is the Mole. You are
 * the investigator, never a suspect. A match is `investigation` rounds plus a final accusation.
 *
 * Each investigation round:
 * 1. Public clue: the vault camera catches two figures. With probability CLUE_TRUE the Mole is one of them (with one
 *    random innocent); otherwise both are innocent. Everyone sees it.
 * 2. Private hunch: at the start each innocent suspect saw one camera pair of its own, by the same rule. Only it knows.
 * 3. You interrogate one suspect: they come across Nervous with probability NERVOUS_MOLE if they are the Mole,
 *    NERVOUS_INNOCENT otherwise. Only you see the result.
 * 4. Every suspect publicly accuses one other suspect. Innocents accuse whoever their evidence (public clues + the
 *    hunch) makes most likely. The Mole accuses according to its cover style (the hidden personality).
 * Final round: you accuse one suspect. Right: you win the case (10). Wrong: the Mole escapes (10 to the Mole).
 *
 * Information: the Mole knows only that it is the Mole — not your interrogations, not anyone’s hunch. Innocent
 * suspects know they are innocent and nothing more. Nobody sees your interrogation results.
 *
 * Two separate questions: WHO is the Mole (your accusation, the game's outcome) and HOW it hides (the personality
 * prediction, scored separately). Knowing one doesn't settle the other.
 */

export const MOLE_STYLES = ['investigator', 'social-reader', 'deceiver', 'opportunist'] as const;
export type MoleStyle = (typeof MOLE_STYLES)[number];
export const MOLE_NAME: Record<MoleStyle, string> = { investigator: 'The Investigator', 'social-reader': 'The Social Reader', deceiver: 'The Deceiver', opportunist: 'The Opportunist' };

export type MoleVariant = 'standard' | 'blurry';
export const MOLE_VARIANTS: readonly MoleVariant[] = ['standard', 'blurry'];
export const moleInvestigation = LENGTH_ROUNDS(3, 4, 5);
export const moleRounds = (length: Setup['length']) => moleInvestigation(length) + 1;
export const SUSPECTS = 4;
export const NERVOUS_MOLE = 0.75;
export const NERVOUS_INNOCENT = 0.25;
export const clueTrue = (v: MoleVariant) => (v === 'blurry' ? 0.6 : 0.75);
export const CASE_POINTS = 10;

export type MoleAction = { kind: 'interrogate'; suspect: number } | { kind: 'accuse'; suspect: number };

export interface MoleRound {
  /** The public camera pair. */
  clue: [number, number];
  interrogated: number;
  nervous: boolean;
  /** accusations[i]: whom suspect i accused. */
  accusations: number[];
}

export interface MoleState {
  setup: Setup<MoleVariant, MoleStyle>;
  investigation: number;
  mole: number;
  rounds: MoleRound[];
  accused: number | null;
}

/** A camera pair for round n and viewer k (k = 0: public; k = 1 + i: suspect i's private clue). */
export function camera(setup: Setup<MoleVariant, MoleStyle>, mole: number, n: number, k: number): [number, number] {
  const { seed } = setup;
  const innocents = [0, 1, 2, 3].filter((i) => i !== mole);
  if (draw(seed, n, 40 + k * 3) < clueTrue(setup.variant)) {
    const other = innocents[drawInt(seed, n, 41 + k * 3, 0, 2)];
    return mole < other ? [mole, other] : [other, mole];
  }
  const out = innocents[drawInt(seed, n, 42 + k * 3, 0, 2)];
  const pair = innocents.filter((i) => i !== out);
  return [pair[0], pair[1]];
}

/** P(suspect is the Mole) from camera pairs (and optionally interrogations), uniform prior. Exact Bayes. */
export function molePosterior(variant: MoleVariant, pairs: readonly [number, number][], interrogations: readonly { suspect: number; nervous: boolean }[] = [], exclude: number | null = null): number[] {
  const t = clueTrue(variant);
  const w = [0, 1, 2, 3].map((m) => {
    if (m === exclude) return 0;
    let l = 1;
    for (const p of pairs) l *= p.includes(m) ? t : 1 - t;
    for (const q of interrogations) {
      const pNervous = q.suspect === m ? NERVOUS_MOLE : NERVOUS_INNOCENT;
      l *= q.nervous ? pNervous : 1 - pNervous;
    }
    return l;
  });
  const z = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / z);
}

const argmax = (xs: number[], skip: number, tieBreak: number) => {
  let best = -1;
  for (let k = 0; k < xs.length; k++) {
    const i = (k + tieBreak) % xs.length;
    if (i === skip) continue;
    if (best < 0 || xs[i] > xs[best] + 1e-9) best = i;
  }
  return best;
};

const votesAgainst = (r: MoleRound | undefined) => [0, 1, 2, 3].map((i) => (r ? r.accusations.filter((a) => a === i).length : 0));

/** An innocent suspect's accusation: the most likely Mole from public clues and its own private hunch, never itself. */
function innocentAccuses(s: MoleState, seat: number, n: number, pub: [number, number]): number {
  const pairs: [number, number][] = [...s.rounds.map((r) => r.clue), pub];
  pairs.push(camera(s.setup, s.mole, 0, 1 + seat));
  return argmax(molePosterior(s.setup.variant, pairs, [], seat), seat, n + seat);
}

/**
 * The Mole's accusation — its cover style. It knows it is the Mole and sees what everyone sees: the public clues and
 * past accusations. It never sees anyone’s hunch or your interrogations.
 *
 * Investigator — accuses whoever the public evidence points to most, excluding itself (Easy: by raw clue counts;
 *   Normal/Hard: by the same Bayes an honest suspect uses). Hard also prefers, among near-equal suspects, the one the
 *   crew accused last round, to look even more like them.
 * Social Reader — joins the crowd: accuses whoever drew the most accusations last round (not itself). Round 1, or when
 *   nobody was accused, it takes the evidence leader. Hard: when it drew more accusations than anyone else, it stops
 *   echoing the room and cites the evidence leader instead.
 * Deceiver — picks one innocent at the start (by the seed) and keeps accusing them. Normal/Hard switch to a new target
 *   once the public clues clearly clear the old one (posterior below 0.12); Hard picks the new target among those the
 *   evidence implicates, so the frame stays plausible.
 * Opportunist — accuses whoever accused it last round (the most recent accuser on a tie), otherwise whoever is most
 *   suspected by evidence plus accusations. Hard holds back from retaliating against a suspect who is itself the
 *   evidence leader and piles on them instead (same choice, better cover); Easy always retaliates.
 */
export function moleAccuses(s: MoleState, n: number, pub: [number, number]): number {
  const me = s.mole;
  const { level, persona } = s.setup;
  const pairs: [number, number][] = [...s.rounds.map((r) => r.clue), pub];
  const counts = [0, 1, 2, 3].map((i) => pairs.filter((p) => p.includes(i)).length);
  const post = level === 'easy' ? counts : molePosterior(s.setup.variant, pairs, [], me);
  const lead = argmax(post, me, n);
  const last = s.rounds[s.rounds.length - 1];
  const votes = votesAgainst(last);

  if (persona === 'investigator') {
    if (level === 'hard' && last) {
      const crowd = argmax(votes, me, n);
      if (post[crowd] >= post[lead] * 0.8) return crowd;
    }
    return lead;
  }
  if (persona === 'social-reader') {
    if (!last) return lead;
    const crowd = argmax(votes, me, n);
    if (votes[crowd] === 0) return lead;
    // Hard: when the room is turning on it, it stops echoing the crowd and cites the evidence instead.
    if (level === 'hard' && votes[me] > votes[crowd]) return lead;
    return crowd;
  }
  if (persona === 'deceiver') {
    const innocents = [0, 1, 2, 3].filter((i) => i !== me);
    let target = innocents[drawInt(s.setup.seed, 901, 0, 0, 2)];
    if (level !== 'easy') {
      // Re-run the target history so a switch persists.
      for (let k = 0; k <= n; k++) {
        const ps: [number, number][] = [...s.rounds.slice(0, k).map((r) => r.clue), k < s.rounds.length ? s.rounds[k].clue : pub];
        const pk = molePosterior(s.setup.variant, ps, [], me);
        if (pk[target] < 0.12) target = level === 'hard' ? argmax(pk, me, k) : innocents.find((i) => i !== target && pk[i] >= 0.12) ?? target;
      }
    }
    return target;
  }
  // opportunist
  const accusers = last ? last.accusations.map((a, i) => (a === me ? i : -1)).filter((i) => i >= 0) : [];
  if (accusers.length) {
    const hit = accusers[accusers.length - 1];
    if (!(level === 'hard' && hit !== lead && post[lead] > post[hit] * 1.5)) return hit;
  }
  const heat = [0, 1, 2, 3].map((i) => post[i] + votes[i] * 0.15);
  return argmax(heat, me, n);
}

export function molePrompt(s: MoleState): { phase: 'investigate'; round: number; clue: [number, number] } | { phase: 'accuse'; round: number } | null {
  const n = s.rounds.length;
  if (s.accused !== null) return null;
  if (n >= s.investigation) return { phase: 'accuse', round: n + 1 };
  return { phase: 'investigate', round: n + 1, clue: camera(s.setup, s.mole, n, 0) };
}

function validate(s: MoleState, a: MoleAction): string | null {
  const p = molePrompt(s);
  if (!p) return 'The case is closed.';
  if (!a || typeof a !== 'object' || !Number.isInteger(a.suspect) || a.suspect < 0 || a.suspect >= SUSPECTS) return 'Choose one of the four suspects.';
  if (p.phase === 'investigate' && a.kind !== 'interrogate') return 'Interrogate a suspect first — the accusation comes after the last round of evidence.';
  if (p.phase === 'accuse' && a.kind !== 'accuse') return 'The investigation is over. Make your accusation.';
  return null;
}

function apply(s: MoleState, a: MoleAction): MoleState {
  const why = validate(s, a);
  if (why) throw new Error(`mole: ${why}`);
  const n = s.rounds.length;
  if (a.kind === 'accuse') return { ...s, accused: a.suspect };
  const clue = camera(s.setup, s.mole, n, 0);
  // Accusations come from the state and the public clue only — your interrogation is private.
  const accusations = [0, 1, 2, 3].map((i) => (i === s.mole ? moleAccuses(s, n, clue) : innocentAccuses(s, i, n, clue)));
  const nervous = draw(s.setup.seed, n, 20) < (a.suspect === s.mole ? NERVOUS_MOLE : NERVOUS_INNOCENT);
  return { ...s, rounds: [...s.rounds, { clue, interrogated: a.suspect, nervous, accusations }] };
}

export const suspectName = (i: number) => CODENAMES[i];

/** Your evidence so far: P(Mole) per suspect from public clues and your interrogations (what a perfect detective would conclude). */
export const playerPosterior = (s: MoleState) =>
  molePosterior(
    s.setup.variant,
    s.rounds.map((r) => r.clue),
    s.rounds.map((r) => ({ suspect: r.interrogated, nervous: r.nervous })),
  );

function moleDebrief(s: MoleState): Debrief {
  const h = s.rounds;
  const m = s.mole;
  const post = playerPosterior(s);
  const best = argmax(post, -1, 0);
  const moments: string[] = [];
  const strongest = h.map((r, i) => ({ r, i })).find(({ r }) => r.clue.includes(m));
  if (strongest) moments.push(`Round ${strongest.i + 1}: the camera caught ${suspectName(strongest.r.clue[0])} and ${suspectName(strongest.r.clue[1])} — one of them was the Mole.`);
  const tell = h.map((r, i) => ({ r, i })).find(({ r }) => r.interrogated === m);
  if (tell) moments.push(`Round ${tell.i + 1}: you interrogated ${suspectName(m)}, who came across ${tell.r.nervous ? 'nervous — a real tell' : 'calm — interrogations aren’t proof either way'}.`);
  const innocentVotes = h.flatMap((r) => r.accusations.filter((_, i) => i !== m));
  const crowdRight = innocentVotes.filter((a) => a === m).length;
  if (s.accused !== null)
    moments.push(
      s.accused === m
        ? `You accused ${suspectName(m)} — correct. ${best === m ? 'The evidence pointed there too.' : 'The evidence actually leaned elsewhere; this time the hunch paid off.'}`
        : `You accused ${suspectName(s.accused)}, but the Mole was ${suspectName(m)}. ${best === m ? `The combined evidence gave ${suspectName(m)} ${Math.round(post[m] * 100)}% — the strongest case.` : 'The evidence was genuinely mixed.'}`,
    );
  const insight =
    s.accused !== m && best === m
      ? 'Weigh every clue together instead of the loudest one: one camera pair or one nervous answer is weak alone, but they multiply. An accusation that echoes the crowd is only as good as the crowd’s evidence.'
      : `Clues here are right ${Math.round(clueTrue(s.setup.variant) * 100)}% of the time and interrogations 75%: each is weak, so confidence should come from several pointing the same way. ${plural(crowdRight, 'innocent accusation')} of ${innocentVotes.length} named the real Mole — the crowd is evidence too, but the Mole votes in it.`;
  const style = s.setup.persona;
  const mv = h.map((r) => r.accusations[m]);
  const named = mv.map((t, i) => `round ${i + 1}: ${suspectName(t)}`).slice(0, 3).join(', ');
  const read: Record<MoleStyle, string> = {
    investigator: `${MOLE_NAME.investigator}: the Mole (${suspectName(m)}) accused whoever the public clues pointed at — ${named} — looking exactly like a careful detective.`,
    'social-reader': `${MOLE_NAME['social-reader']}: the Mole (${suspectName(m)}) followed the room, accusing last round’s most-accused suspect — ${named}.`,
    deceiver: `${MOLE_NAME.deceiver}: the Mole (${suspectName(m)}) kept steering suspicion onto a chosen scapegoat, switching only when the evidence cleared them — ${named}.`,
    opportunist: `${MOLE_NAME.opportunist}: the Mole (${suspectName(m)}) turned on whoever accused it, otherwise joined the pile-on — ${named}.`,
  };
  return { headline: s.accused === m ? 'Case solved' : 'The Mole escaped', moments: moments.slice(0, 3), insight, opponentRead: read[style] };
}

export const mole: ArenaEngine<MoleState, MoleAction, MoleVariant> = {
  id: 'mole',
  opponents: MOLE_STYLES,
  variants: MOLE_VARIANTS,
  rounds: moleRounds,
  create(setup) {
    const s = setup as Setup<MoleVariant, MoleStyle>;
    return { setup: s, investigation: moleInvestigation(s.length), mole: drawInt(s.seed, 900, 0, 0, SUSPECTS - 1), rounds: [], accused: null };
  },
  validate,
  apply,
  isOver: (s) => s.accused !== null,
  played: (s) => s.rounds.length + (s.accused !== null ? 1 : 0),
  result(s) {
    const solved = s.accused === s.mole;
    return {
      ...resultFrom(
        [
          { id: 'you', name: 'You', score: solved ? CASE_POINTS : 0, isPlayer: true },
          { id: 'mole', name: `The Mole (${suspectName(s.mole)})`, score: s.accused !== null && !solved ? CASE_POINTS : 0, isPlayer: false },
        ],
        'case points',
      ),
      headline: s.accused === null ? undefined : solved ? 'Case solved' : 'The Mole escaped',
    };
  },
  debrief: moleDebrief,
  moves(s) {
    const p = molePrompt(s);
    if (!p) return [];
    return [0, 1, 2, 3].map((suspect) => ({ kind: p.phase === 'accuse' ? 'accuse' : 'interrogate', suspect }) as MoleAction);
  },
};
