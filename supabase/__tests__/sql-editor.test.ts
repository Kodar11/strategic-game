import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { createDatabase } from './pg.ts';

/**
 * The SQL Editor workflows in supabase/daily/manage.sql and supabase/games/manage.sql, run statement by statement
 * against the real migrations and content — so docs/SQL_EDITOR_OPERATIONS.md never refers to a column or function
 * that doesn't exist, and every documented operation actually works.
 */

let db: PGlite;
before(async () => {
  db = await createDatabase();
});
after(async () => {
  await db.close();
});

const read = (path: string) => readFileSync(join(import.meta.dirname, '..', path), 'utf8');

describe('SQL Editor workflows', () => {
  it('daily/manage.sql: preview, draft, publish, unpublish, schedule, usage, leaderboard, health, recovery', async () => {
    await db.exec(read('daily/manage.sql'));
    const c = (await db.query<any>(`select * from public.daily_challenges where id = 'bakery-price-war'`)).rows[0];
    assert.equal(c.status, 'draft', 'the last step unpublished it again');
    assert.equal(c.version, 2, 'publishing the draft made version 2');
    assert.equal(c.format, 'decision');
    assert.deepEqual(c.config.rules.length, 3);
    const today = (await db.query<any>(`select count(*)::int as n from public.daily_challenges where challenge_date = public.daily_challenge_today() and status = 'published'`)).rows[0].n;
    assert.equal(today, 1, 'recovery made today’s challenge');
    const history = (await db.query<any>(`select count(*)::int as n from public.daily_challenge_history where challenge_id = 'bakery-price-war'`)).rows[0].n;
    assert.ok(history >= 3, 'every state is in the history');
  });

  it('games/manage.sql: Gambit scheduled for a future week, rotation, audit, leaderboards, champions, finalization', async () => {
    await db.exec(read('games/manage.sql'));
    const w = (await db.query<any>(`select * from public.game_competitions where id = 'week-2030-w11'`)).rows[0];
    assert.equal(w.game_id, 'gambit');
    assert.equal(w.source, 'manual');
    assert.equal(w.config.level, 'hard');
    assert.equal((await db.query<any>(`select status from public.game_competitions where id = 'week-2030-w12'`)).rows[0].status, 'cancelled');
    const audit = (await db.query<any>(`select action from public.competition_schedule_audit where competition_id = 'week-2030-w11' order by seq`)).rows.map((r) => r.action);
    assert.deepEqual(audit, ['created', 'replaced']);
    assert.equal((await db.query<any>(`select arena_server_enabled from public.competition_settings`)).rows[0].arena_server_enabled, true);
  });

  it('daily/examples.sql still publishes (v1 documents are valid v2 documents)', async () => {
    await db.exec(read('daily/examples.sql'));
  });
});
