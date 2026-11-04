import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DIFFICULTIES } from '../core.ts';
import { ENGINES } from '../registry.ts';
import { WHAT_IF_GAMES, WHAT_IF_PATTERNS, hasWhatIf, replayPattern, whatIf } from '../what-if.ts';

type Round = { p: string; b: string; ps: number; bs: number };

function play(game: (typeof WHAT_IF_GAMES)[number], bot: string, difficulty: (typeof DIFFICULTIES)[number], seed: number, moves: (h: Round[]) => string) {
  const e = ENGINES[game];
  const spec = { bot, difficulty, seed };
  const rounds: Round[] = [];
  while (rounds.length < e.rounds) rounds.push(e.resolve(spec, rounds, e.parseMove(moves(rounds), e.prompt(spec, rounds))) as Round);
  return { spec, rounds };
}

describe('what if you had played differently', () => {
  it('only Split or Steal and Stag Hunt get a comparison', () => {
    assert.deepEqual(WHAT_IF_GAMES, ['split-steal', 'stag-hunt']);
    assert.equal(hasWhatIf('rps'), false);
    assert.equal(whatIf('rps', { bot: 'x', difficulty: 'easy', seed: 1 }, []), null);
  });

  it('replays exactly: playing a pattern by hand gives the same rounds as the replay', () => {
    for (const game of WHAT_IF_GAMES)
      for (const bot of ENGINES[game].bots)
        for (const difficulty of DIFFICULTIES)
          for (const pattern of WHAT_IF_PATTERNS[game]) {
            const seed = 1234 + bot.length;
            const hand = play(game, bot, difficulty, seed, (h) => pattern.move(h));
            const replay = replayPattern(game, hand.spec, pattern);
            assert.deepEqual(replay.rounds, hand.rounds, `${game} ${bot} ${difficulty} ${pattern.id}`);
          }
  });

  it('leaves out the pattern the player actually played, and needs a finished match and a seed', () => {
    const { spec, rounds } = play('split-steal', 'retaliator', 'hard', 99, () => 'split');
    const lines = whatIf('split-steal', spec, rounds)!;
    assert.ok(!lines.some((l) => l.id === 'split'), 'always split is what they did');
    assert.ok(lines.length >= 1);
    assert.equal(whatIf('split-steal', null, rounds), null, 'no seed (a server match): no comparison');
    assert.equal(whatIf('split-steal', spec, rounds.slice(0, 3)), null, 'unfinished');
  });

  it('shows real consequences: against a grim Retaliator, always stealing scores far below always splitting', () => {
    const { spec, rounds } = play('split-steal', 'retaliator', 'hard', 5, (h) => (h.length % 2 ? 'steal' : 'split'));
    const lines = whatIf('split-steal', spec, rounds)!;
    const split = lines.find((l) => l.id === 'split')!;
    const steal = lines.find((l) => l.id === 'steal')!;
    assert.ok(split.player > steal.player, JSON.stringify(lines));
  });
});
