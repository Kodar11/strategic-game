import { useEffect, useState } from 'react';

import { type ReflectionGame, reflect } from '@/src/reflections/registry';
import type { Reflection } from '@/src/reflections/types';

/**
 * Reflection ids shown after each game's last few matches this session, newest first. Kept in memory only: it exists
 * so back-to-back rematches don't repeat a reflection when another, equally specific one fits the match.
 */
const recent = new Map<ReflectionGame, string[]>();
const KEEP = 3;

export function recentReflections(game: ReflectionGame): readonly string[] {
  return recent.get(game) ?? [];
}

export function rememberReflection(game: ReflectionGame, id: string) {
  recent.set(game, [id, ...recentReflections(game).filter((x) => x !== id)].slice(0, KEEP));
}

/**
 * The reflection for a finished match, chosen once when the result first renders (re-renders never reshuffle it).
 * `record`: the rounds (classic games) or the final engine state (arena games). Reads the record; never changes it.
 */
export function useReflection(game: ReflectionGame, record: unknown): Reflection {
  const [reflection] = useState(() => reflect(game, record, recentReflections(game)));
  useEffect(() => rememberReflection(game, reflection.id), [game, reflection.id]);
  return reflection;
}
