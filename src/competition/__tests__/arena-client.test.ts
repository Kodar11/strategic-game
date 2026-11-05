import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ArenaMatchError, arenaCompetitionRepository } from '../../data/arena-competition.ts';
import { replay, viewOf } from '../arena-match.ts';

/** The app's client for ranked Arena matches: parses views, and tells a retryable failure from a final refusal. */
describe('arena-match client', () => {
  const cfg = { opponent: 'purist', level: 'normal' as const, variant: 'standard', length: 'short' as const };
  const view = { ...viewOf('travelers', cfg, replay('travelers', cfg, 1, []) as never, 0), matchId: '00000000-0000-4000-8000-000000000001', status: 'active', competitionId: 'w', attempt: 1 };

  it('parses a view', async () => {
    const repo = arenaCompetitionRepository(async () => ({ status: 200, body: view }));
    const v = await repo.get(view.matchId);
    assert.equal(v.game, 'travelers');
    assert.equal(v.step, 0);
  });

  it('maps refusals; only network-level failures are retryable', async () => {
    const at = (status: number, body: unknown) => arenaCompetitionRepository(async () => ({ status, body }));
    const err = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (e) {
        return e as ArenaMatchError;
      }
      throw new Error('expected a failure');
    };
    const stale = await err(at(409, { error: 'stale' }).move(view.matchId, 3, 1));
    assert.equal(stale.refusal, 'stale');
    assert.equal(stale.transient, false);
    const illegal = await err(at(422, { error: 'illegal_action', message: 'Claim between 2 and 20.' }).move(view.matchId, 0, 99));
    assert.equal(illegal.message, 'Claim between 2 and 20.');
    const down = await err(arenaCompetitionRepository(async () => Promise.reject(new TypeError('Network request failed'))).move(view.matchId, 0, 5));
    assert.equal(down.refusal, 'unavailable');
    assert.equal(down.transient, true);
    assert.equal((await err(at(503, { error: 'unavailable' }).get(view.matchId))).transient, true);
    assert.equal((await err(at(502, null).get(view.matchId))).refusal, 'unavailable');
  });
});
