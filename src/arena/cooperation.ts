import { type ArenaEngine, resultFrom } from './core.ts';
import { coopDebrief } from './cooperation-analysis.ts';
import { COOP_NAME, COOP_OPPONENTS, COOP_VARIANTS, type CoopAction, type CoopSetup, type CoopState, type CoopVariant, coopRounds, coopTotals, resolveCoop, validateCoop } from './cooperation-model.ts';

export * from './cooperation-model.ts';

export const cooperation: ArenaEngine<CoopState, CoopAction, CoopVariant> = {
  id: 'cooperation',
  opponents: COOP_OPPONENTS,
  variants: COOP_VARIANTS,
  rounds: coopRounds,
  create: (setup) => ({ setup: setup as CoopSetup, total: coopRounds(setup.length), rounds: [] }),
  validate: validateCoop,
  apply: resolveCoop,
  isOver: (s) => s.rounds.length >= s.total,
  played: (s) => s.rounds.length,
  result: (s) => {
    const t = coopTotals(s.rounds);
    return resultFrom(
      [
        { id: 'you', name: 'You', score: t.player, isPlayer: true },
        { id: s.setup.persona, name: COOP_NAME[s.setup.persona], score: t.bot, isPlayer: false },
      ],
      'points',
    );
  },
  debrief: coopDebrief,
};
