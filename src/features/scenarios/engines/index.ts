import type { ScenarioEngine } from '../types.ts';
import { MODULE1_ENGINES } from './module1.ts';
import { MODULE2_ENGINES } from './module2.ts';
import { MODULE3_ENGINES } from './module3.ts';
import { MODULE4_ENGINES } from './module4.ts';
import { MODULE5_ENGINES } from './module5.ts';
import { MODULE6_ENGINES } from './module6.ts';

/**
 * The registered scenario engines: the rules of all 66 paired scenarios (three per lesson, A, B, C). Content rows
 * are joined to these by id and version; ids are stable and appear in saved runs and exported data.
 */
export const SCENARIO_ENGINES: readonly ScenarioEngine[] = [
  ...MODULE1_ENGINES,
  ...MODULE2_ENGINES,
  ...MODULE3_ENGINES,
  ...MODULE4_ENGINES,
  ...MODULE5_ENGINES,
  ...MODULE6_ENGINES,
];
