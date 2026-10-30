/// <reference types="node" />
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { clipHash, validateManifest } from '../../../../scripts/tts-lib.mjs';
import { BASE_PRICING_GAME, rivalPolicy } from '../../../game/incentives.ts';
import { friendPolicy, resolveMeetup } from '../../../game/coordination.ts';
import { payoffAt } from '../../../game/payoff-matrix.ts';
import { explainOutcome } from '../../lessons/cooperation-trap/copy.ts';
import { proposalExplanation } from '../../lessons/incentive-shift/copy.ts';
import { CLIPS, type ClipDef, clipOutputPath, getClip } from '../clips.ts';
import { CURRICULUM_CLIPS } from '../curriculum-clips.ts';
import { curriculumLines } from '../curriculum-lines.ts';
import { LESSON_IDS, ORIGINAL_LESSON_IDS } from '../../../content/lessons.ts';
import {
  keeperReviewClip,
  meetupReactionClip,
  pricingRevealClips,
  pricingWhyClip,
  roundResultClip,
  shotReactionClip,
} from '../reactions.ts';
import { AUDIO_FORMAT, VOICES } from '../voices.ts';
import { installSeedCatalog } from '../../../content/seed.ts';

installSeedCatalog();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const ALL = CLIPS as readonly ClipDef[];

/** Every source file in a lesson's folder (the screen and its copy module) counts as "on screen". */
function lessonSource(lesson: string): string {
  const dir = path.join(ROOT, 'src/features/lessons', lesson);
  return readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
}

/** Undo JSX entities and line wrapping so source text can be compared with spoken text. */
function normalise(s: string) {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('Narration manifest', () => {
  it('passes the same validation the generator runs', () => {
    assert.deepEqual(validateManifest(ALL, VOICES, { fileNameFor: clipOutputPath }), []);
  });

  it('covers all five lessons with an introduction and a takeaway', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      assert.ok(getClip(`l${n}.intro.heading`), `lesson ${n} intro`);
      assert.ok(getClip(`l${n}.done.takeaway`), `lesson ${n} takeaway`);
    }
  });

  it('only voices characters that actually speak, with one voice each', () => {
    const speakers = new Set(ALL.map((c) => c.character));
    assert.deepEqual([...speakers].sort(), Object.keys(VOICES).sort());
  });

  it('covers every curriculum lesson with an introduction, its lines, transfer feedback and a takeaway', () => {
    const seed = installSeedCatalog();
    assert.equal(seed.curriculum.size, LESSON_IDS.length - ORIGINAL_LESSON_IDS.length);
    for (const [lesson, spec] of seed.curriculum) {
      for (const slot of ['intro.heading', 'concept.line', 'done.takeaway', ...spec.transfer.options.map((o) => `transfer.${o.id}`)]) {
        assert.ok(getClip(`${lesson}.${slot}`), `${lesson}.${slot}`);
      }
    }
  });

  it('the curriculum snapshot matches the content seed', () => {
    const seed = installSeedCatalog();
    const expected = LESSON_IDS.filter((id) => seed.curriculum.has(id)).flatMap((id) => curriculumLines(id, seed.curriculum.get(id)!));
    assert.deepEqual(CURRICULUM_CLIPS, expected, 'curriculum content changed — run `npm run tts:curriculum`, then `npm run tts`');
  });

  it('every "screen" line still appears verbatim in its lesson', () => {
    const lessons = [...new Set(ALL.filter((c) => c.sync === 'screen').map((c) => c.lesson))];
    const sources = Object.fromEntries(lessons.map((id) => [id, normalise(lessonSource(id))]));
    const drifted = ALL.filter((c) => c.sync === 'screen' && !sources[c.lesson].includes(normalise(c.text))).map((c) => c.id);
    assert.deepEqual(drifted, [], 'on-screen text changed — update clips.ts and regenerate those clips');
  });

  it('computed lines match what the screen renders for each reachable outcome', () => {
    assert.equal(getClip('l1.why.maintain-cut')?.text, explainOutcome('maintain', 'cut', payoffAt(BASE_PRICING_GAME, 'maintain', 'cut')));
    assert.equal(getClip('l1.why.cut-cut')?.text, explainOutcome('cut', 'cut', payoffAt(BASE_PRICING_GAME, 'cut', 'cut')));
    assert.equal(getClip('l5.proposal.result')?.text, proposalExplanation());
  });

  it('every generated audio file is up to date with its text and voice', () => {
    const lockFile = path.join(ROOT, 'assets/audio/clips.lock.json');
    if (!existsSync(lockFile)) return;
    const lock = JSON.parse(readFileSync(lockFile, 'utf8')) as { clips: Record<string, { hash: string }> };
    const stale = ALL.filter((c) => existsSync(path.join(ROOT, clipOutputPath(c))) && lock.clips[c.id]?.hash !== clipHash(c, VOICES[c.character], AUDIO_FORMAT));
    assert.deepEqual(stale.map((c) => c.id), []);
  });

  it('the app manifest only references clips that exist, with files on disk', () => {
    const src = readFileSync(path.join(ROOT, 'src/features/audio/audio-manifest.ts'), 'utf8');
    for (const [, id, file] of src.matchAll(/'([^']+)': require\('@\/([^']+)'\)/g)) {
      const clip = getClip(id);
      assert.ok(clip, `unknown clip ${id}`);
      assert.equal(file, clipOutputPath(clip!));
      assert.ok(existsSync(path.join(ROOT, file)), `missing file ${file}`);
    }
  });

  it('no secret or env loading reaches app code', () => {
    const appFiles = ['clips.ts', 'voices.ts', 'controller.ts', 'narration.ts', 'expoBackend.ts', 'useNarration.tsx', 'audio-manifest.ts', 'curriculum-lines.ts', 'curriculum-clips.ts'];
    for (const f of appFiles) {
      const src = readFileSync(path.join(ROOT, 'src/features/audio', f), 'utf8');
      assert.doesNotMatch(src, /GOOGLE_TTS_API_KEY|EXPO_PUBLIC_|process\.env|texttospeech\.googleapis|\.env\b/, f);
    }
  });
});

describe('Reactions follow the resolved outcome', () => {
  it('lesson 1: Rohan and Aarav react to the actual pair of prices', () => {
    const rival = rivalPolicy(BASE_PRICING_GAME);
    assert.equal(rival, 'cut', 'the stated policy is what makes only these two outcomes reachable');
    assert.deepEqual(pricingRevealClips('maintain', rival), { rohan: 'l1.reveal.rohan.undercut', aarav: 'l1.reveal.aarav.undercut' });
    assert.deepEqual(pricingRevealClips('cut', rival), { rohan: 'l1.reveal.rohan.bothcut', aarav: 'l1.reveal.aarav.bothcut' });
    assert.deepEqual(pricingRevealClips('cut', 'maintain'), { rohan: null, aarav: null }, 'no guessed line for an outcome without a clip');
    assert.equal(pricingWhyClip('maintain', 'cut'), 'l1.why.maintain-cut');
    assert.equal(pricingWhyClip('cut', 'cut'), 'l1.why.cut-cut');
    assert.equal(pricingWhyClip('maintain', 'maintain'), null);
  });

  it('lesson 2: Dr. Meera reacts to a win, or says which side of the target the pick fell', () => {
    const learner = (guess: number, isWinner: boolean) => ({ learner: { guess, isWinner } as never, target: 20 });
    assert.equal(roundResultClip(learner(21, true)), 'l2.result.won');
    assert.equal(roundResultClip(learner(40, false)), 'l2.result.above');
    assert.equal(roundResultClip(learner(5, false)), 'l2.result.below');
  });

  it('lesson 3: Nina only speaks for the place she actually went', () => {
    const r1 = (you: 'cafe' | 'park') => resolveMeetup(you, friendPolicy({ kind: 'none' }));
    const r2 = (you: 'cafe' | 'park') => resolveMeetup(you, friendPolicy({ kind: 'focal', place: 'cafe' }));
    assert.equal(meetupReactionClip(1, r1('park')), 'l3.reveal1.met');
    assert.equal(meetupReactionClip(1, r1('cafe')), 'l3.reveal1.missed');
    assert.equal(meetupReactionClip(2, r2('cafe')), 'l3.reveal2.met');
    assert.equal(meetupReactionClip(2, r2('park')), 'l3.reveal2.missed');
    assert.equal(meetupReactionClip(1, { you: 'cafe', friend: 'cafe', met: true }), null);
  });

  it('lesson 4: Maya reacts to goal vs save and to whether she was reading a pattern', () => {
    assert.equal(shotReactionClip({ scored: false, reason: 'repeat-habit' }), 'l4.shot.save-read');
    assert.equal(shotReactionClip({ scored: false, reason: 'coin' }), 'l4.shot.save-guess');
    assert.equal(shotReactionClip({ scored: true, reason: 'switch-habit' }), 'l4.shot.goal-read');
    assert.equal(shotReactionClip({ scored: true, reason: 'coin' }), 'l4.shot.goal-guess');
    assert.equal(keeperReviewClip(3), 'l4.review.read');
    assert.equal(keeperReviewClip(2), 'l4.review.few');
  });

  it('extracting the explanation text left the wording unchanged', () => {
    assert.equal(
      explainOutcome('cut', 'cut', [5, 5]),
      "You both cut. Neither gained customers from the other, but every order earned less. You each made 5 — instead of the 8 you'd each have made by both maintaining.",
    );
    assert.equal(explainOutcome('maintain', 'cut', [3, 10]), 'Rohan undercut you. Price-sensitive customers like Kavya moved to FoodKart, so you made 3 while FoodKart made 10.');
    assert.equal(explainOutcome('cut', 'maintain', [10, 3]), 'You undercut FoodKart and won most of the orders: you made 10, FoodKart made 3.');
    assert.equal(explainOutcome('maintain', 'maintain', [8, 8]), 'Both kept prices. Customers split and margins held: 8 each.');
  });
});
