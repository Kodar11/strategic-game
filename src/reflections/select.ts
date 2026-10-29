import type { GameReflections, Reflection } from './types.ts';

/**
 * Picks one reflection for a finished match, deterministically:
 * 1. Evaluate every rule; keep those whose event happened (`when` returned facts).
 * 2. Keep the most specific tier present (tier 1 moments before tier 2 patterns).
 * 3. Within that tier, take the first rule (in authored order) that isn't in `recent`; if every one is recent, the
 *    first. Rotation never reaches into a less specific tier, and never invents an event.
 * 4. No eligible rule: the game's general reflection.
 *
 * `recent`: reflection ids shown after this game's last few matches, newest first.
 */
export function selectReflection<M>(def: GameReflections<M>, match: M, recent: readonly string[] = []): Reflection {
  const eligible = def.rules.flatMap((r) => {
    const f = r.when(match);
    return f ? [{ r, f }] : [];
  });
  if (!eligible.length) return { ...def.general, id: `${def.game}.general`, lesson: def.lesson, evidence: {}, general: true };
  const tier = Math.min(...eligible.map((e) => e.r.tier));
  const top = eligible.filter((e) => e.r.tier === tier);
  const pick = top.find((e) => !recent.includes(`${def.game}.${e.r.id}`)) ?? top[0];
  return { ...pick.r.write(pick.f), id: `${def.game}.${pick.r.id}`, lesson: pick.r.lesson === undefined ? def.lesson : pick.r.lesson, evidence: pick.f, general: false };
}

/** Every rule whose event happened, in authored order (for tests and debugging). */
export function eligibleRules<M>(def: GameReflections<M>, match: M): string[] {
  return def.rules.filter((r) => r.when(match) !== null).map((r) => r.id);
}

// ── Small helpers for rules ─────────────────────────────────────────────────

/** 1-based index of the first item matching, or 0. */
export const firstRound = <T>(xs: readonly T[], f: (x: T, i: number) => boolean): number => xs.findIndex(f) + 1;

/** Longest run of consecutive items matching; returns [length, 1-based start]. */
export function longestRun<T>(xs: readonly T[], f: (x: T) => boolean): [number, number] {
  let best = 0;
  let start = 0;
  let run = 0;
  xs.forEach((x, i) => {
    run = f(x) ? run + 1 : 0;
    if (run > best) {
      best = run;
      start = i - run + 2;
    }
  });
  return [best, start];
}

export const count = <T>(xs: readonly T[], f: (x: T, i: number) => boolean) => xs.filter(f).length;

export const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
