import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ARENA_IDS } from '../../arena/core.ts';
import { ARENA_ENGINES } from '../../arena/registry.ts';
import { LESSON_IDS } from '../../content/lessons.ts';
import { GAME_IDS } from '../../games/core.ts';
import {
  EMPTY_PROGRESS,
  type Played,
  START_RATING,
  type TournamentProgress,
  allStages,
  canSkip,
  cardSet,
  currentStage,
  findMatch,
  hasKeyCard,
  mergeProgress,
  mindCheckOffer,
  mindForm,
  nextMatch,
  opponentRating,
  playStyle,
  recordGame,
  recordOf,
  sanitizeProgress,
  seasonCleared,
  skipMatch,
  stageStatus,
  stars,
  strategistRating,
  titleFor,
} from '../progress.ts';
import { type TournamentDoc, liveSeason, parseTournament, resolveMatch, validateTournament } from '../schema.ts';
import { SEASON_ONE } from '../season1.ts';

const season = liveSeason(SEASON_ONE)!;
const clone = (): TournamentDoc => JSON.parse(JSON.stringify(SEASON_ONE));
const win: Played = { outcome: 'win', level: 'normal', read: false };
const loss: Played = { outcome: 'loss', level: 'normal', read: false };

/** Plays one game of a match and returns the new progress. */
function play(p: TournamentProgress, matchId: string, g: Played = win): TournamentProgress {
  const f = findMatch(season, matchId)!;
  return recordGame(p, f.stage, f.match, g, 1).progress;
}

/** Wins every match of the stage, the duel last. */
function clearStage(p: TournamentProgress, index: number): TournamentProgress {
  for (const m of season.stages[index].matches) p = play(p, m.id);
  return p;
}

describe('Season 1 content', () => {
  it('passes its own validation, shape and meaning', () => {
    assert.ok(parseTournament(SEASON_ONE));
    assert.deepEqual(validateTournament(SEASON_ONE), []);
  });

  it('uses all 23 games (Codebreaker as a side trial), each against its real variants', () => {
    const used = new Set(season.stages.flatMap((s) => s.matches.map((m) => m.game.id)));
    const all = [...ARENA_IDS, ...GAME_IDS];
    assert.equal(all.length, 23);
    assert.deepEqual(all.filter((g) => !used.has(g)), []);
    for (const s of season.stages)
      for (const m of s.matches) {
        const r = resolveMatch(s, m);
        if (m.game.system === 'arena') assert.ok((ARENA_ENGINES[m.game.id as keyof typeof ARENA_ENGINES].variants as readonly string[]).includes(r.variant), m.id);
      }
  });

  it('earns a key card from every lesson somewhere, and every intel lesson exists', () => {
    const keyLessons = new Set(season.stages.flatMap((s) => s.lessons));
    for (const s of season.stages) for (const m of s.matches) if (m.intel.lesson) assert.ok((LESSON_IDS as readonly string[]).includes(m.intel.lesson), m.id);
    // Every lesson but the three foundations used by the Qualifiers' intel is a key card for some stage.
    assert.ok(keyLessons.size >= 18);
  });

  it('ends every stage but the Qualifiers in a single duel, played on Hard', () => {
    for (const s of season.stages) {
      const duels = s.matches.filter((m) => m.duel);
      assert.equal(duels.length, s.kind === 'qualifiers' || s.kind === 'side' ? 0 : 1, s.id);
      if (duels.length) assert.equal(duels[0].level, 'hard', s.id);
    }
  });
});

describe('documents that must be refused', () => {
  it('an unknown game, a bad variant, an unknown lesson, a duplicate id or a missing rival', () => {
    const cases: ((d: TournamentDoc) => void)[] = [
      (d) => (d.seasons[0].stages[1].matches[0].game.id = 'chess'),
      (d) => (d.seasons[0].stages[1].matches[0].variant = 'turbo'),
      (d) => (d.seasons[0].stages[1].lessons = ['not-a-lesson']),
      (d) => (d.seasons[0].stages[1].matches[1].id = d.seasons[0].stages[1].matches[0].id),
      (d) => (d.seasons[0].stages[1].rival = 'nobody'),
      (d) => (d.seasons[0].stages[1].matches[0].duel = true),
      (d) => (d.seasons[0].stages[0].matches[0].variant = 'standard'),
      (d) => (d.questions[0].options[0].correct = true),
      (d) => (d.questions[0].stage = 's9.nowhere'),
      (d) => (d.seasons[0].stages = d.seasons[0].stages.map((s) => ({ ...s, kind: 'side' as const }))),
    ];
    for (const change of cases) {
      const d = clone();
      change(d);
      assert.equal(parseTournament(d), null);
    }
  });

  it('a wrong shape', () => {
    assert.equal(parseTournament({ ...clone(), schemaVersion: 2 }), null);
    assert.equal(parseTournament(null), null);
    assert.equal(parseTournament({ ...clone(), seasons: [] }), null);
  });

  it('a document without a revision reads as revision 1, older than the bundled Season 1', () => {
    const old = clone() as Record<string, unknown>;
    delete old.revision;
    assert.equal(parseTournament(old)?.revision, 1);
    assert.ok(SEASON_ONE.revision > 1);
  });

  it('a draft season is never the one played', () => {
    const d = clone();
    d.seasons.unshift({ ...d.seasons[0], id: 's0', status: 'draft', stages: d.seasons[0].stages.map((s) => ({ ...s, id: `x${s.id}`, matches: s.matches.map((m) => ({ ...m, id: `x${m.id}` })) })) });
    assert.equal(parseTournament(d)?.seasons.length, 2);
    assert.equal(liveSeason(d)?.id, 's1');
  });
});

describe('progression', () => {
  it('opens with the Qualifiers only', () => {
    const all = allStages(season, EMPTY_PROGRESS, []);
    assert.deepEqual(all.map((s) => s.unlocked), [true, false, false, false, false, false, false, false]);
    assert.equal(currentStage(season, EMPTY_PROGRESS, []).stage.id, 's1.qualifiers');
    assert.equal(nextMatch(all[0], EMPTY_PROGRESS)?.id, 's1.q.rps');
  });

  it('clears a match with one win and unlocks the next stage when every match is cleared', () => {
    let p = play(EMPTY_PROGRESS, 's1.q.rps');
    assert.equal(stageStatus(season, 0, p, []).clearedCount, 1);
    assert.equal(stageStatus(season, 1, p, []).unlocked, false);
    p = clearStage(p, 0);
    assert.equal(stageStatus(season, 0, p, []).cleared, true);
    assert.equal(stageStatus(season, 1, p, []).unlocked, true);
  });

  it('keeps the duel closed until the other matches are cleared and the key card is held', () => {
    let p = clearStage(EMPTY_PROGRESS, 0);
    const arc = season.stages[1];
    for (const m of arc.matches.filter((x) => !x.duel)) p = play(p, m.id);
    assert.equal(stageStatus(season, 1, p, []).duelOpen, false, 'no key card yet');
    assert.equal(stageStatus(season, 1, p, ['signaling']).duelOpen, true, 'a finished lesson is the key card');
    const passed = { ...p, checks: { [arc.id]: { passed: true, correct: 2, total: 3, at: 1 } } };
    assert.equal(stageStatus(season, 1, passed, []).duelOpen, true, 'so is a passed check');
    const failed = { ...p, checks: { [arc.id]: { passed: false, correct: 1, total: 3, at: 1 } } };
    assert.equal(stageStatus(season, 1, failed, []).duelOpen, false);
  });

  it('credits lessons finished before the Tournament existed', () => {
    assert.equal(hasKeyCard(season.stages[2], ['evolution'], EMPTY_PROGRESS), true);
    assert.equal(hasKeyCard(season.stages[0], [], EMPTY_PROGRESS), true, 'the Qualifiers need no key card');
  });

  it('reports the rival beaten and the stage cleared exactly once', () => {
    let p = clearStage(EMPTY_PROGRESS, 0);
    const arc = season.stages[1];
    for (const m of arc.matches.filter((x) => !x.duel)) p = play(p, m.id);
    const duel = arc.matches.find((m) => m.duel)!;
    const first = recordGame(p, arc, duel, { outcome: 'win', level: 'hard', read: true }, 2);
    assert.equal(first.rivalDefeated, true);
    assert.equal(first.stageCleared, true);
    assert.equal(first.starsAfter, 3, 'won, read, on Hard');
    const again = recordGame(first.progress, arc, duel, { outcome: 'win', level: 'hard', read: false }, 3);
    assert.equal(again.rivalDefeated, false);
    assert.equal(again.stageCleared, false);
  });

  it('awards stars once each: a win, a correct read (even in a loss), a win on Hard', () => {
    let p = play(EMPTY_PROGRESS, 's1.q.rps', { outcome: 'loss', level: 'easy', read: true });
    assert.equal(stars(recordOf(p, 's1.q.rps')), 1);
    assert.equal(recordOf(p, 's1.q.rps').won, false);
    p = play(p, 's1.q.rps', { outcome: 'loss', level: 'hard', read: false });
    assert.equal(stars(recordOf(p, 's1.q.rps')), 1, 'a loss on Hard is no Hard star');
    p = play(p, 's1.q.rps', { outcome: 'win', level: 'hard', read: false });
    assert.equal(stars(recordOf(p, 's1.q.rps')), 3);
  });

  it('lets a match be skipped after three games without a win, never a duel', () => {
    let p = EMPTY_PROGRESS;
    const m = findMatch(season, 's1.q.two-thirds')!.match;
    for (let i = 0; i < 2; i++) p = play(p, m.id, loss);
    assert.equal(canSkip(m, recordOf(p, m.id)), false);
    assert.equal(skipMatch(p, m), p);
    p = play(p, m.id, { ...loss, outcome: 'draw' });
    assert.equal(canSkip(m, recordOf(p, m.id)), true);
    p = skipMatch(p, m);
    assert.equal(recordOf(p, m.id).skipped, true);
    assert.equal(stars(recordOf(p, m.id)), 0);
    const duel = season.stages[1].matches.find((x) => x.duel)!;
    let d = EMPTY_PROGRESS;
    for (let i = 0; i < 5; i++) d = play(d, duel.id, loss);
    assert.equal(canSkip(duel, recordOf(d, duel.id)), false);
  });

  it('opens the side trial after the Qualifiers, and never needs it for the season', () => {
    const side = season.stages.findIndex((s) => s.kind === 'side');
    assert.equal(stageStatus(season, side, EMPTY_PROGRESS, []).unlocked, false);
    let p = clearStage(EMPTY_PROGRESS, 0);
    assert.equal(stageStatus(season, side, p, []).unlocked, true);
    assert.equal(stageStatus(season, 1, p, []).unlocked, true, 'Arc 1 opens without the side trial');
    for (let i = 1; i < season.stages.length; i++) if (i !== side) p = clearStage(p, i);
    assert.equal(seasonCleared(season, p), true);
    assert.notEqual(currentStage(season, p, []).stage.kind, 'side');
  });

  it('can clear the whole season', () => {
    let p = EMPTY_PROGRESS;
    for (let i = 0; i < season.stages.length; i++) p = clearStage(p, i);
    const all = [...LESSON_IDS];
    assert.equal(allStages(season, p, all).every((s) => s.cleared), true);
    assert.equal(seasonCleared(season, p), true);
    assert.equal(currentStage(season, p, all).stage.id, 's1.final');
  });
});

describe('status', () => {
  it('rates from the history: wins against stronger opponents raise it most', () => {
    assert.equal(strategistRating([]), START_RATING);
    const easy = strategistRating([{ match: 'a', outcome: 'win', opp: 700, read: false, at: 1 }]);
    const hard = strategistRating([{ match: 'a', outcome: 'win', opp: 1100, read: false, at: 1 }]);
    const lost = strategistRating([{ match: 'a', outcome: 'loss', opp: 1100, read: false, at: 1 }]);
    assert.ok(hard > easy && easy > START_RATING && lost < START_RATING);
    const final = season.stages[6];
    assert.equal(opponentRating(final, final.matches[4], 'hard'), 1300);
  });

  it('names titles by rating band', () => {
    assert.equal(titleFor(800), 'Contestant');
    assert.equal(titleFor(950), 'Challenger');
    assert.equal(titleFor(1000), 'Tactician');
    assert.equal(titleFor(1250), 'Mastermind');
  });

  it('shows a play style only after ten games, from where the player wins', () => {
    const h = (match: string, n: number, read = false) => Array.from({ length: n }, (_, i) => ({ match, outcome: 'win' as const, opp: 900, read, at: i }));
    assert.equal(playStyle(season, h('s1.kade.split-steal', 9)), null);
    assert.equal(playStyle(season, h('s1.kade.split-steal', 10)), 'diplomat');
    assert.equal(playStyle(season, [...h('s1.vesper.bluff', 6), ...h('s1.q.rps', 4)]), 'manipulator');
    assert.equal(playStyle(season, h('s1.q.rps', 10, true)), 'reader', 'every correct read counts for The Reader');
  });

  it('has 28 cards: one per lesson and one per stage rival', () => {
    const cards = cardSet(season, LESSON_IDS, ['cooperation-trap'], EMPTY_PROGRESS);
    assert.equal(cards.length, 28);
    assert.equal(cards.filter((c) => c.kind === 'rival').length, 6);
    assert.deepEqual(cards.filter((c) => c.owned).map((c) => c.id), ['cooperation-trap']);
    const host = cardSet(season, LESSON_IDS, [], clearStage(EMPTY_PROGRESS, 0)).find((c) => c.id === 'host')!;
    assert.equal(host.owned, false, 'the Host’s card comes with the Final, their last stage');
  });
});

describe('Mind Check', () => {
  it('offers A first, B after the third stage, C after the sixth, each once', () => {
    let p = EMPTY_PROGRESS;
    assert.equal(mindCheckOffer(season, p), 'a');
    p = { ...p, mind: [{ form: 'a', correct: 5, total: 10, at: 1 }] };
    assert.equal(mindCheckOffer(season, p), null);
    for (let i = 0; i < 3; i++) p = clearStage(p, i);
    assert.equal(mindCheckOffer(season, p), 'b');
    p = { ...p, mind: [...p.mind, { form: 'b', correct: 7, total: 10, at: 2 }] };
    assert.equal(mindCheckOffer(season, p), null);
    for (let i = 3; i < 6; i++) p = clearStage(p, i);
    assert.equal(mindCheckOffer(season, p), 'c');
  });

  it('has its own questions: three per key card, thirty for the Mind Check, two per theme in every form', () => {
    for (const s of season.stages.filter((x) => x.lessons.length)) assert.equal(SEASON_ONE.questions.filter((q) => q.use === 'key' && q.stage === s.id).length, 3, s.id);
    const mind = SEASON_ONE.questions.filter((q) => q.use === 'mind');
    assert.equal(mind.length, 30);
    for (const f of ['a', 'b', 'c'] as const) {
      const form = mindForm(mind, f);
      assert.equal(form.length, 10);
      const themes = new Map<string, number>();
      for (const q of form) themes.set(q.theme!, (themes.get(q.theme!) ?? 0) + 1);
      assert.deepEqual([...themes.values()], [2, 2, 2, 2, 2], f);
    }
    for (const q of SEASON_ONE.questions) assert.equal(q.options.filter((o) => o.correct).length, 1, q.id);
  });

  it('splits a pool into forms that share no item', () => {
    const pool = Array.from({ length: 33 }, (_, i) => i);
    const [a, b, c] = (['a', 'b', 'c'] as const).map((f) => mindForm(pool, f));
    assert.equal(a.length, 10);
    assert.equal(new Set([...a, ...b, ...c]).size, a.length + b.length + c.length);
  });
});

describe('merging two copies', () => {
  it('keeps everything either copy earned, and is order-free and repeatable', () => {
    const phone = play(play(EMPTY_PROGRESS, 's1.q.rps', { outcome: 'win', level: 'easy', read: true }), 's1.q.two-thirds', loss);
    let server = play(EMPTY_PROGRESS, 's1.q.rps', { outcome: 'win', level: 'hard', read: false });
    server = { ...server, checks: { 's1.vesper': { passed: true, correct: 2, total: 3, at: 4 } }, mind: [{ form: 'a', correct: 6, total: 10, at: 3 }], seen: ['s1.qualifiers'] };
    const m = mergeProgress(phone, server);
    assert.deepEqual(m, mergeProgress(server, phone));
    assert.deepEqual(mergeProgress(m, m), m);
    assert.equal(stars(recordOf(m, 's1.q.rps')), 3, 'win and read from the phone, the Hard win from the server');
    assert.equal(recordOf(m, 's1.q.two-thirds').losses, 1);
    assert.equal(m.checks['s1.vesper'].passed, true);
    assert.deepEqual(m.seen, ['s1.qualifiers']);
    assert.equal(m.mind.length, 1);
    assert.equal(m.history.length, 3, 'every game from both copies, none twice');
  });

  it('keeps the first score of each Mind Check form', () => {
    const a = { ...EMPTY_PROGRESS, mind: [{ form: 'a' as const, correct: 4, total: 10, at: 1 }] };
    const b = { ...EMPTY_PROGRESS, mind: [{ form: 'a' as const, correct: 9, total: 10, at: 5 }] };
    assert.equal(mergeProgress(a, b).mind[0].correct, 4);
  });
});

describe('saved progress', () => {
  it('survives a round trip and drops anything malformed', () => {
    let p = play(EMPTY_PROGRESS, 's1.q.rps', { outcome: 'win', level: 'hard', read: true });
    p = { ...p, seen: ['s1.qualifiers'], checks: { 's1.vesper': { passed: true, correct: 3, total: 3, at: 5 } }, mind: [{ form: 'a', correct: 6, total: 10, at: 9 }] };
    assert.deepEqual(sanitizeProgress(JSON.parse(JSON.stringify(p))), p);
    const junk = sanitizeProgress({ matches: { 'BAD ID': { won: true }, ok: 'x' }, history: [{ match: 's1.q.rps', outcome: 'maybe' }], seen: [1, 's1.kade'], mind: [{ form: 'z' }, { form: 'a' }, { form: 'a' }], checks: null });
    assert.deepEqual(junk.matches, {});
    assert.deepEqual(junk.history, []);
    assert.deepEqual(junk.seen, ['s1.kade']);
    assert.equal(junk.mind.length, 1);
    assert.deepEqual(sanitizeProgress('nonsense'), EMPTY_PROGRESS);
  });
});
