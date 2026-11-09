import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { addUser, createDatabase, failure, pgRpc } from './pg.ts';

/** The Crowd (20261110120000_daily_crowd.sql): one answer a day, today's distribution hidden until the day is over. */

let db: PGlite;
const ALICE = '00000000-0000-4000-8000-0000000c0a11';
const BOB = '00000000-0000-4000-8000-0000000c0b22';
const CAROL = '00000000-0000-4000-8000-0000000c0c33';
let today: string;

before(async () => {
  db = await createDatabase({ seed: false });
  for (const u of [ALICE, BOB, CAROL]) await addUser(db, u);
  today = (await db.query<{ d: string }>(`select public.daily_challenge_today()::text as d`)).rows[0].d;
});
after(async () => {
  await db.close();
});

const rpc = (user: string | null, fn: string, request: unknown) => pgRpc(db, user).call(fn, { request }) as Promise<any>;
const fails = async (user: string | null, fn: string, request: unknown) => {
  try {
    await rpc(user, fn, request);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

describe('The Crowd', () => {
  it('records the first answer of the day and keeps it', async () => {
    const a = await rpc(ALICE, 'submit_crowd_answer', { questionId: 'q1', value: 22 });
    assert.equal(a.status, 'recorded');
    assert.equal(a.value, 22);
    const again = await rpc(ALICE, 'submit_crowd_answer', { questionId: 'q1', value: 90 });
    assert.equal(again.status, 'existing');
    assert.equal(again.value, 22);
  });

  it('refuses guests and invalid answers', async () => {
    assert.match((await fails(null, 'submit_crowd_answer', { questionId: 'q1', value: 5 })) ?? '', /permission denied|games:auth/);
    assert.match((await fails(BOB, 'submit_crowd_answer', { questionId: 'q1', value: 101 })) ?? '', /crowd:invalid_answer/);
    assert.match((await fails(BOB, 'submit_crowd_answer', { questionId: 'q1', value: 2.5 })) ?? '', /crowd:invalid_answer/);
    assert.match((await fails(BOB, 'submit_crowd_answer', { questionId: '', value: 2 })) ?? '', /crowd:invalid_answer/);
  });

  it('shows only the count today, and the full distribution once the day is over', async () => {
    await rpc(BOB, 'submit_crowd_answer', { questionId: 'q1', value: 33 });
    const open = await rpc(CAROL, 'get_crowd_result', { day: today, questionId: 'q1' });
    assert.equal(open.open, true);
    assert.equal(open.answered, 2);
    assert.equal(open.mine, null);
    assert.equal(open.counts, undefined);

    // Yesterday, as if it had happened.
    await db.query(`insert into public.crowd_answers (day, question_id, user_id, value) values ($1::date - 1, 'q0', $2, 10), ($1::date - 1, 'q0', $3, 10), ($1::date - 1, 'q0', $4, 40)`, [today, ALICE, BOB, CAROL]);
    const y = (await db.query<{ d: string }>(`select ($1::date - 1)::text as d`, [today])).rows[0].d;
    const closed = await rpc(ALICE, 'get_crowd_result', { day: y, questionId: 'q0' });
    assert.equal(closed.open, false);
    assert.equal(closed.answered, 3);
    assert.equal(closed.mine, 10);
    assert.deepEqual(closed.counts, [[10, 2], [40, 1]]);
  });

  it('never answers for a future day, and the table is closed to direct access', async () => {
    const t = (await db.query<{ d: string }>(`select ($1::date + 1)::text as d`, [today])).rows[0].d;
    assert.match((await fails(ALICE, 'get_crowd_result', { day: t, questionId: 'q1' })) ?? '', /crowd:invalid_day/);
    assert.match((await fails(ALICE, 'get_crowd_result', { day: 'soon', questionId: 'q1' })) ?? '', /crowd:invalid_day/);
    assert.match((await failure(db, ALICE, 'select * from public.crowd_answers')) ?? '', /permission denied/);
  });
});
