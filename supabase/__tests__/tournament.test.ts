import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { seasonOneSql } from '../../scripts/tournament-seed.mjs';
import { parseTournament } from '../../src/tournament/schema.ts';
import { SEASON_ONE } from '../../src/tournament/season1.ts';
import { as, createDatabase, failure } from './pg.ts';

/**
 * The Tournament's server side: the published document, its public read, and every statement of the SQL Editor
 * workflow (supabase/tournament/manage.sql) against the real migrations.
 */

let db: PGlite;
before(async () => {
  db = await createDatabase();
});
after(async () => {
  await db.close();
});

const read = (path: string) => readFileSync(join(import.meta.dirname, '..', path), 'utf8');
const published = async (who: string | null) => (await as(db, who, (tx) => tx.query<{ d: unknown }>('select public.get_tournament_content() as d'))).rows[0].d;

describe('tournament content', () => {
  it('season1.sql is generated from the bundled Season 1 (run scripts/tournament-seed.mjs after editing it)', () => {
    assert.equal(read('tournament/season1.sql').replace(/\r\n/g, '\n'), seasonOneSql());
  });

  it('returns nothing before a document is published', async () => {
    assert.equal(await published(null), null);
  });

  it('publishes Season 1, readable by a guest, identical to the app’s bundled copy', async () => {
    await db.exec(read('tournament/season1.sql'));
    const doc = await published(null);
    assert.deepEqual(doc, JSON.parse(JSON.stringify(SEASON_ONE)));
    assert.ok(parseTournament(doc));
  });

  it('runs every SQL Editor statement, and leaves a document the app still accepts', async () => {
    await db.exec(read('tournament/manage.sql'));
    const doc = (await published(null)) as typeof SEASON_ONE;
    assert.ok(parseTournament(doc), 'still valid after the edits');
    const bluff = doc.seasons[0].stages[1].matches.find((m) => m.id === 's1.vesper.bluff')!;
    assert.equal(bluff.level, 'hard', 'section 3 changed one match');
    assert.equal(doc.seasons.length, 1, 'the draft season was added and removed again');
    const r = await db.query<{ revision: number; status: string }>(`select revision, status from public.tournament_documents where id = 'main'`);
    assert.ok(r.rows[0].revision > 1);
    assert.equal(r.rows[0].status, 'published');
  });

  it('hides a draft and refuses writes from the app', async () => {
    await db.exec(`update public.tournament_documents set status = 'draft' where id = 'main'`);
    assert.equal(await published(null), null);
    await db.exec(`update public.tournament_documents set status = 'published' where id = 'main'`);
    assert.match((await failure(db, null, `update public.tournament_documents set status = 'draft'`))!, /permission denied/);
    assert.match((await failure(db, null, `insert into public.tournament_documents (id, document) values ('x', '{"id":"x","schemaVersion":1}')`))!, /permission denied/);
  });

  it('rejects a document whose id or schema version doesn’t match', async () => {
    await assert.rejects(db.exec(`insert into public.tournament_documents (id, document) values ('other', '{"id":"main","schemaVersion":1}')`));
    await assert.rejects(db.exec(`insert into public.tournament_documents (id, document) values ('other', '{"id":"other","schemaVersion":2}')`));
  });
});
