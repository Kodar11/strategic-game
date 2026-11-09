/**
 * The Crowd: Daily questions whose right answer is other people. Everyone answers the same question on the same day;
 * the result opens the next morning. The server stores only one whole number 0–100 per player per day (a number, or
 * the index of an option) — see supabase/migrations/20261110120000_daily_crowd.sql — and the outcome is computed
 * here from the distribution, so a new question is a row in CROWD_QUESTIONS, not a migration.
 *
 * Kinds:
 * - fraction        Guess 0–100; the target is `fraction` × the average guess; closest wins (Keynes' beauty contest).
 * - lowest-unique   Pick 1–`max`; the lowest number that exactly one player picked wins.
 * - minority        Pick an option; the least-picked option wins (ties share the win).
 * - majority        Pick the option you think most people will pick; the most-picked wins (a focal point).
 * - threshold       Go or stay: going pays only if fewer than `limit` of the crowd go (El Farol). Staying always pays
 *                   a little, so it wins when the crowd overcrowds.
 * - stag            Hunt the stag (pays only if at least `limit` of the crowd hunt it) or take the hare (always safe).
 */

export type CrowdKind = 'fraction' | 'lowest-unique' | 'minority' | 'majority' | 'threshold' | 'stag';

export interface CrowdQuestion {
  id: string;
  kind: CrowdKind;
  title: string;
  /** The situation, in two or three sentences. */
  prompt: string;
  /** For option kinds (index = stored value). threshold / stag: [the risky option, the safe one]. */
  options?: string[];
  /** Number kinds: the range. */
  min?: number;
  max?: number;
  /** fraction: the multiplier. threshold / stag: the share of the crowd (0–1). */
  fraction?: number;
  limit?: number;
  /** The idea, shown with the result. */
  idea: string;
  /** Where to learn more. */
  lesson?: string;
}

export const CROWD_QUESTIONS: readonly CrowdQuestion[] = [
  { id: 'c-two-thirds', kind: 'fraction', fraction: 2 / 3, min: 0, max: 100, title: 'Two-thirds of the crowd', prompt: 'Pick a whole number from 0 to 100. The winner is whoever is closest to two-thirds of the average of everyone’s picks.', idea: 'Each step of “they’ll think that I’ll think…” pushes the answer lower. Pure logic says 0; real crowds stop after one or two steps, and winning means guessing how many steps the crowd takes.', lesson: 'strategy-detective' },
  { id: 'c-lowest-unique', kind: 'lowest-unique', min: 1, max: 30, title: 'The lonely number', prompt: 'Pick a number from 1 to 30. The lowest number that exactly one player picked wins. Pick 1 and you might win — or share it with half the crowd.', idea: 'Everyone wants low, so low numbers crowd up. The winning number usually sits just above where most people think everyone else will stop.' },
  { id: 'c-minority-door', kind: 'minority', options: ['Door A', 'Door B', 'Door C'], title: 'The quiet door', prompt: 'Three doors. Everyone walks through one. The door the fewest people choose leads to the prize.', idea: 'In a minority game no choice is right on its own; any choice that looks clever to many becomes the crowded one. Unpredictability is the strategy.', lesson: 'predictability-trap' },
  { id: 'c-majority-meet', kind: 'majority', options: ['The main station', 'The clock tower', 'The biggest café', 'The museum steps'], title: 'Meet the crowd', prompt: 'You must meet a stranger in a city you both know, with no way to talk. Pick the spot you think most players will pick.', idea: 'With many equally good meeting points, people coordinate on what stands out — a focal point (Schelling). You win by picking what others find obvious, not what you prefer.', lesson: 'coordination-problem' },
  { id: 'c-el-farol', kind: 'threshold', options: ['Go to the party', 'Stay home'], limit: 0.6, title: 'The crowded party', prompt: 'The party is great if fewer than 60% of players go, and miserable if more do. Staying home is always fine, never great.', idea: 'If everyone expects a quiet party, everyone goes and it’s packed; if everyone expects a crowd, nobody goes. There’s no prediction everyone can act on — the El Farol bar problem.' },
  { id: 'c-stag', kind: 'stag', options: ['Hunt the stag', 'Take the hare'], limit: 0.7, title: 'The big hunt', prompt: 'The stag is caught only if at least 70% of players hunt it — then every hunter feasts. The hare is a small meal you always get.', idea: 'The stag is better for everyone, but only if enough others trust it too. The stag hunt is about confidence in the group, not about greed.', lesson: 'coordination-problem' },
  { id: 'c-half', kind: 'fraction', fraction: 1 / 2, min: 0, max: 100, title: 'Half the average', prompt: 'Pick a number from 0 to 100. Closest to half of the crowd’s average wins.', idea: 'Halving shrinks faster than two-thirds, so each step of reasoning matters more. Where the crowd lands tells you how many steps people really take.', lesson: 'strategy-detective' },
  { id: 'c-minority-route', kind: 'minority', options: ['The highway', 'The coast road', 'Through town'], title: 'The empty road', prompt: 'Everyone drives home at the same time. The road the fewest players choose is the fast one.', idea: 'Traffic is a minority game: the moment a shortcut is famous, it isn’t one. Mixing your choices is how you stay out of the jam.', lesson: 'predictability-trap' },
  { id: 'c-majority-number', kind: 'majority', options: ['7', '3', '1', '10'], title: 'Everyone’s number', prompt: 'Pick the number you think most players will pick.', idea: 'Asked for a “random” number, people aren’t random: 7 and 3 stand out. A focal point is whatever the crowd expects the crowd to expect.', lesson: 'coordination-problem' },
  { id: 'c-lowest-unique-small', kind: 'lowest-unique', min: 1, max: 15, title: 'Alone at the bottom', prompt: 'Pick a number from 1 to 15. The lowest number picked by exactly one player wins.', idea: 'The obvious small numbers collide. The winner is low and lonely — find the gap the crowd leaves.' },
  { id: 'c-el-farol-market', kind: 'threshold', options: ['Open a stall', 'Stay out'], limit: 0.5, title: 'The night market', prompt: 'Opening a stall pays well if fewer than half of players open one, and loses money if more do. Staying out earns nothing and loses nothing.', idea: 'Entry decisions are crowd decisions: profits attract entrants until there are none left. The same logic drives price wars and gold rushes.', lesson: 'market-competition' },
  { id: 'c-stag-project', kind: 'stag', options: ['Join the big project', 'Do your own small task'], limit: 0.6, title: 'The big project', prompt: 'The big project succeeds only if at least 60% of players join it — then everyone who joined shares a big reward. Your own small task always pays a little.', idea: 'Teams fail less from laziness than from doubt: if you fear others won’t commit, playing safe is sensible — and that fear makes itself come true.', lesson: 'coordination-problem' },
  { id: 'c-three-quarters', kind: 'fraction', fraction: 3 / 4, min: 0, max: 100, title: 'Three-quarters', prompt: 'Pick a number from 0 to 100. Closest to three-quarters of the average wins.', idea: 'A gentler multiplier, the same trap: the answer depends on how deep everyone else thinks, not just on how deep you can.', lesson: 'strategy-detective' },
  { id: 'c-minority-colour', kind: 'minority', options: ['Red', 'Blue', 'Green', 'Yellow'], title: 'The rare colour', prompt: 'Pick a colour. The colour the fewest players pick wins.', idea: 'Favourites get crowded, and so do “clever” non-favourites. The minority shifts with what people think other people think.' },
];

export const crowdQuestion = (id: string) => CROWD_QUESTIONS.find((q) => q.id === id) ?? null;
export const isOptionKind = (q: CrowdQuestion) => q.kind === 'minority' || q.kind === 'majority' || q.kind === 'threshold' || q.kind === 'stag';

/** Whether `value` is a legal answer to `q`. */
export function validCrowdAnswer(q: CrowdQuestion, value: number): boolean {
  if (!Number.isInteger(value)) return false;
  if (isOptionKind(q)) return value >= 0 && value < (q.options?.length ?? 0);
  return value >= (q.min ?? 0) && value <= (q.max ?? 100);
}

export interface CrowdOutcome {
  /** You won this one (with or without others). Null: you didn't answer. */
  won: boolean | null;
  /** One line on what the crowd did ("The average was 31, so the target was 21."). */
  crowd: string;
  /** One line on you. */
  you: string | null;
  /** The winning answer(s), as shown. */
  winning: string;
  answered: number;
  /** For bar charts: one entry per option, or a few number buckets. */
  bars: { label: string; count: number; winning: boolean; mine: boolean }[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The outcome from the closed day's distribution ([[value, count], …]) and your answer. */
export function crowdOutcome(q: CrowdQuestion, counts: readonly (readonly [number, number])[], mine: number | null): CrowdOutcome {
  const valid = counts.filter(([v, c]) => validCrowdAnswer(q, v) && c > 0);
  const n = valid.reduce((s, [, c]) => s + c, 0);
  const countOf = (v: number) => valid.find(([x]) => x === v)?.[1] ?? 0;

  if (isOptionKind(q)) {
    const opts = q.options ?? [];
    const share = opts.map((_, i) => (n ? countOf(i) / n : 0));
    let winners: number[];
    let crowd: string;
    if (q.kind === 'minority' || q.kind === 'majority') {
      const target = q.kind === 'minority' ? Math.min(...share) : Math.max(...share);
      winners = opts.map((_, i) => i).filter((i) => share[i] === target);
      crowd = `${winners.map((i) => opts[i]).join(' and ')} drew ${pct(target)} of the crowd — the ${q.kind === 'minority' ? 'fewest' : 'most'}.`;
    } else {
      // threshold: the risky option (0) wins when fewer than `limit` take it; stag: when at least `limit` do.
      const risky = share[0];
      const riskyWins = q.kind === 'threshold' ? risky < (q.limit ?? 0.5) : risky >= (q.limit ?? 0.5);
      winners = [riskyWins ? 0 : 1];
      crowd = `${pct(risky)} chose “${opts[0]}” — ${riskyWins ? (q.kind === 'threshold' ? 'few enough, so it paid' : 'enough, so it paid') : q.kind === 'threshold' ? 'too many, so staying out paid' : 'not enough, so the safe choice paid'} (the line was ${pct(q.limit ?? 0.5)}).`;
    }
    const won = mine === null ? null : n === 0 ? null : winners.includes(mine);
    return {
      won,
      crowd: n === 0 ? 'Nobody answered this one.' : crowd,
      you: mine === null ? null : `You chose ${opts[mine] ?? '—'} (${pct(share[mine] ?? 0)} of the crowd).`,
      winning: winners.map((i) => opts[i]).join(' or '),
      answered: n,
      bars: opts.map((label, i) => ({ label, count: countOf(i), winning: n > 0 && winners.includes(i), mine: mine === i })),
    };
  }

  const lo = q.min ?? 0;
  const hi = q.max ?? 100;
  let winningValues: number[] = [];
  let crowd = 'Nobody answered this one.';
  let you: string | null = null;
  if (n > 0 && q.kind === 'fraction') {
    const mean = valid.reduce((s, [v, c]) => s + v * c, 0) / n;
    const target = mean * (q.fraction ?? 2 / 3);
    const best = Math.min(...valid.map(([v]) => Math.abs(v - target)));
    winningValues = valid.filter(([v]) => Math.abs(v - target) === best).map(([v]) => v);
    crowd = `The average was ${mean.toFixed(1)}, so the target was ${target.toFixed(1)}.`;
    if (mine !== null) {
      const closer = valid.filter(([v]) => Math.abs(v - target) < Math.abs(mine - target)).reduce((s, [, c]) => s + c, 0);
      you = `You picked ${mine}: closer than ${pct(1 - closer / n - countOf(mine) / n)} of players.`;
    }
  } else if (n > 0) {
    const unique = valid.filter(([, c]) => c === 1).map(([v]) => v).sort((a, b) => a - b);
    winningValues = unique.length ? [unique[0]] : [];
    crowd = unique.length ? `${unique[0]} was the lowest number only one player chose.` : 'Every number was chosen at least twice — nobody won.';
    if (mine !== null) you = `You picked ${mine}, along with ${plural(countOf(mine) - 1, 'other player')}.`;
  }
  const won = mine === null || n === 0 ? null : winningValues.includes(mine);

  // Ten buckets across the range for the chart (fraction), or one bar per number (lowest-unique, small ranges).
  const bucketSize = hi - lo + 1 <= 30 ? 1 : Math.ceil((hi - lo + 1) / 10);
  const bars: CrowdOutcome['bars'] = [];
  for (let start = lo; start <= hi; start += bucketSize) {
    const end = Math.min(hi, start + bucketSize - 1);
    const inBucket = (v: number) => v >= start && v <= end;
    bars.push({
      label: bucketSize === 1 ? String(start) : `${start}–${end}`,
      count: valid.filter(([v]) => inBucket(v)).reduce((s, [, c]) => s + c, 0),
      winning: winningValues.some(inBucket),
      mine: mine !== null && inBucket(mine),
    });
  }
  return { won, crowd, you, winning: winningValues.length ? winningValues.join(', ') : 'nobody', answered: n, bars };
}
