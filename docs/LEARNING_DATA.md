# Learning data: record, challenges, profile and export

The app keeps a small **learning record**: one entry per submitted answer, from lesson predictions, paired scenarios and practice challenges. It feeds both the Strategic Thinking Profile and the JSON export.

**Where it is stored.** Since the Supabase migration the record — with lesson progress, scenario runs, challenge drafts, assessment results and the goal — is saved to the app's Supabase database (see [DATA_ARCHITECTURE.md](DATA_ARCHITECTURE.md)). Each install signs in anonymously: the database stores a random user ID created by Supabase Auth, and the session token that identifies it is kept on the device. No names or emails are collected, and row level security lets each anonymous user read and write only their own rows. The profile is still computed on the device from the record; it is never stored. Clearing the app's storage loses the anonymous session, and with it access to the saved progress (there is no account to recover it with yet).

| Path | What it is |
|---|---|
| `src/features/learning/records.ts` | Record types, the lesson prediction catalogue (`PREDICTIONS`), attempt numbering, validation and upgrade, deduplication, goal, export format. |
| `src/features/learning/profile.ts` | Every profile rule: skills, insights, confidence, first tries, practice, transfer, next step. |
| `src/features/learning/evidence-policy.ts` | Every profile threshold, and the evidence levels (`none` / `activity` / `tentative` / `established`). |
| `src/features/learning/summary.ts` | What the profile screens show, chosen from the profile: snapshot, one observation, explored areas, which report sections appear, one area in detail. |
| `src/features/learning/journey.ts` | The learning journey the overview and report show: lesson and module progress, the four area cards, change within an area, one growth snapshot, one recommendation (with a game once everything is done), accuracy, confidence bands, progress over time and the answer history. Tested in `__tests__/journey.test.ts`. |
| `src/features/challenges/content.ts` | Types and accessors for the 15 practice challenges and the per-lesson concept reviews. The challenges themselves are content in Supabase (`content_challenges`, `content_challenge_options`, `content_concept_reviews`). |
| `src/features/challenges/progress.ts` | Challenge drafts, the atomic submit, retry, resume and summary rules. |
| `src/features/learning/shareFile.ts` / `.web.ts` | Writing and sharing the export file (native share sheet / browser download). |
| `src/store/progress.ts` | Holds `learning`, `challengeDrafts`, `goal` and lesson progress for the screens; loaded from and written back to Supabase (`src/data/session.ts`). Only device settings stay in AsyncStorage. |
| Each lesson's `copy.ts` | `…Records(data)`: the lesson's evaluated predictions, built from the same feedback functions the screen uses. |

## Items, attempts and first attempts

An **item** is one question. It is either a lesson prediction (`l1.rival`) or a challenge (`l1.c1.discount-war`).

**One record per submission.**
- An attempt is recorded once per intentional submission: a prediction or challenge answer the learner locks in.
- The record's id is `<item>@<lockedAt>`. Re-renders, resumed screens and double taps produce the same id, and the first record for an id wins.
- The following never record anything:
  - opening a challenge;
  - choosing an option without submitting;
  - leaving midway;
  - resuming.
- Lesson predictions are recorded once their feedback is shown. Challenge answers are recorded at submission, together with the locked answer in a single store update (`submitChallenge`), so the answer and its record can't drift apart.

**`attempt` numbers submissions per item.**
- It starts at 1 and is fixed when the record is made.
- Attempt 1 is the **first attempt**. It is never overwritten, re-graded or trimmed.
- These all add attempts 2, 3, …:
  - challenge retries ("Try again");
  - lesson replays;
  - a Lesson 4 lab reset;
  - a Lesson 5 rule change.

**Context recorded with each attempt.**
- `lessonCompleted` says whether the associated lesson had been completed when the answer was submitted. It is `null` for records made before schema 2.
- `contentVersion` is the challenge content version that was answered; `null` for lessons. Edit a challenge's meaning, and you must bump its `version`. Old records keep the version they answered, and the profile never compares attempts across versions.

**What happens to records over time.**
- **Append-only.** Records are never edited.
- **Completion keeps them.** Completing a lesson does not erase anything.
- **Reset clears them.** **Settings → Reset progress** clears lesson progress, the learning record and challenge drafts. The goal is kept.
- **Storage is bounded.** At most 500 records are kept. Beyond that the oldest *retries* are dropped; first attempts are always kept.
- **Bad data is dropped.** Saved data that fails validation is dropped, never guessed at.
- **Older saves still load.**
  - Saves from before the learning record existed start empty.
  - v1 records (from before challenges existed) are upgraded on load: they become lesson records, numbered by their order, with `lessonCompleted: null`.
  - Saves without challenge drafts start with none.
  - Completed lessons are always kept.

## Practice challenges

There are three challenges per lesson, 15 in all. Each has a short scenario, one decision with three options, feedback for every option, a takeaway, and a concept review.
- **Always open.** All 15 are available from the start, from the home screen (**Practice**) and from each lesson's completion screen. None of them requires a lesson.
- **Drafts persist.** A chosen answer and confidence survive leaving and coming back. Resuming opens the first challenge with an unfinished answer, otherwise the first untried one, otherwise the summary.
- **"Tried"** means the challenge has at least one submitted attempt. Retries never add to the count.

## Evaluation

| `evaluation` | From the verdict | Meaning |
|---|---|---|
| `correct` | `match` | Matched the model or the outcome. |
| `partial` | `defensible`, `depends` | Reasonable, but missing something or resting on an assumption. |
| `reasonable-miss` | `reasonable` (lesson) | A sensible lesson prediction about something the learner couldn't know yet; the outcome went another way. |
| `reasonable` | `reasonable` (challenge) | A sensible answer to a challenge where nothing in the scenario settles the answer. Never scored. |
| `misconception` | `misconception` | Contradicted the information available, or the learner's own prediction. |

| `basis` | Items | Used for skills, confidence, first tries and transfer? |
|---|---|---|
| `calculable` | The answer follows from the information given: all lesson predictions except the two below, and 14 of the 15 challenges | Yes |
| `uncertain` | It depends on something unknowable: `l2.crowd`, `l3.round1`, and the challenge `l2.c1.crowded-cafe` | No. Recorded and exported, never counted as evidence of good or poor reasoning |

## Profile screens

The profile has three layers. Activity (lessons, challenges answered) and agreement with the model (calculable first attempts) are always shown separately: finishing a lesson is never presented as evidence of skill.

1. **The overview** (`app/(tabs)/profile.tsx`), in this order:
   - **Learning progress**: lessons completed out of the total, one bar, one sentence from the real completion state (getting started, which module, nearly through, library complete), and finished modules as a quiet milestone. Opens the detailed report.
   - **At most one growth snapshot** (`growthSnapshot`), in this priority: a supported improvement within an area; the existing observation (`pickObservation`: encouraging first, avoiding the next step's area); otherwise "you've started exploring …" (activity only). Its evidence is always visible, and tentative evidence is labelled "Early observation". Opens that area.
   - **One recommendation** (`recommendation`): the existing next step (goal → weakest area → lesson in progress / next lesson → untried challenges). Challenges say how many ("Try 3 challenges"). When the next step would only be a replay — every lesson and challenge done — a game that exercises the least-practised area is suggested instead (`GAME_FOR_AREA`). The optional goal stays as an inline control.
   - **Areas you're exploring**: all four areas, each with lessons completed (bar), one line about first attempts ("14 of 24 first attempts matched", "Early evidence" when tentative) and a chevron. Opens `app/report/[skill].tsx`.
   - A link to the detailed report, then the game record (separate, never feeding a learning measure).
2. **One area** (`app/report/[skill].tsx`): lessons completed and first attempts side by side, change within the area when there is enough evidence, the next thing to do in the area (`areaNext`), the five most recent first attempts, a link to all of them, and every lesson that practises the area.
3. **The detailed report** (`app/report.tsx`):
   - **Learning activity**: lessons (with a per-module breakdown), lessons in progress, challenges answered, predictions including replays, daily challenges counted.
   - **Prediction accuracy**: comparable first attempts matched, a percentage only from 10, matched / partly / different, how many were excluded as unknowable and how many retries weren't counted, and a note that this is agreement with the model, not ability. "Learning after feedback" and "Ideas in new situations" expand inside it when they have enough evidence.
   - **Progress over time**: a chart of match rate per block of first attempts, or one quiet line saying how many more answers it needs. The 4-week comparison expands below it.
   - **Confidence and outcomes**: three confidence bands, each shown only with 3 or more answers, one sentence comparing the surest and least sure bands, and an explanation of correct vs confident vs calibrated.
   - **Strategic areas**, then **Every answer** (`app/report/history.tsx`): each first attempt, newest first, filterable, expanding to the answer, confidence, what happened, any retries (listed, never counted) and a link to the lesson or challenges. `?skill=` limits it to one area.

**Journey thresholds** (`EVIDENCE` in evidence-policy.ts):

| Measure | Shown only when… | Otherwise |
|---|---|---|
| Percentage next to "N of M" | 10 or more comparable first attempts | The count alone |
| Progress-over-time chart | 15 or more comparable first attempts, in blocks of at least 5, at most 6 points | "Your progress over time will appear as you complete more practice — N more answers…" |
| Chart direction | First and last block differ by 20 points or more | "held fairly steady" |
| Change within an area | 4 or more first attempts in each half, and a gap of 25 points or more | "similar rates" (or nothing below 8 answers) |
| Confidence comparison | 4 rated first attempts, 3 or more in both the surest and least sure band, and a gap of 20 points | A neutral sentence; never "lower your confidence" |

The chart groups answers in the order they were given (by their real `lockedAt`) rather than by calendar week, so each point rests on the same number of answers even when many are given in one sitting. A remainder smaller than a block joins the last block instead of being drawn alone.

**Evidence levels for a skill area:**

| Level | First attempts | What it shows |
|---|---|---|
| `activity` | 0–1 | Raw counts only |
| `tentative` | 2–4 | One cautious observation ("An encouraging start" / "Still exploring …"), with its sample size |
| `established` | 5+ | A plainer description. From 5, one different answer moves the rate by 20 points or less. |

The observation prefers an encouraging pattern (the existing `isStrong` rule). It also prefers an area other than the one the next step practises, so the two never repeat each other. The game record stays at the foot of the profile and never feeds any learning measure.

## Profile rules (summary)

**Evidence comes from first attempts.** Each item contributes its first attempt only, so retrying a question until it matches never upgrades a skill, the confidence comparison or an insight. Retries appear only in "After feedback". Lesson predictions and challenges both count in the four areas, and there is no overall score.

**Thresholds:**

| Section | Shows something only when… | Otherwise |
|---|---|---|
| Skill area | 2 or more calculable first answers in the area | "Not tried yet" / "Still exploring" |
| Confidence | 4 or more calculable first answers, and 3 or more in a group | "Make N more predictions…" |
| First tries | 4 or more calculable first answers | "Not enough evidence yet" |
| After feedback | 2 or more questions where all of these hold: calculable, first answer not matching, retried on the same content version | "Not enough evidence yet" |
| New situations (transfer) | 2 or more *different* challenges for a lesson concept, first tries only | "Not enough evidence yet" |

**After feedback** reports:
- how many first-missed questions moved to the model's answer;
- how many repeated the same mistaken answer.

It says plainly that answers given after feedback show the learner followed the reasoning, not that they would find it unaided.

**New situations** names how many first tries came before the lesson was taken.

**Insights** have a fixed priority:
1. gap;
2. overconfidence;
3. transfer: at least 2 different challenges for one concept matched on the first try, and at least two thirds of that concept's challenges;
4. weak area;
5. reasonable lesson misses;
6. underconfidence;
7. strength.

Goal-related insights come first. A secondary insight never repeats an area the primary mentions.

**Next step**, in this order:
1. the goal's lesson, or that lesson's challenges if it is completed and they are untried;
2. the weakest area, the same way;
3. the lesson in progress, or the next unfinished lesson;
4. any untried challenges;
5. a replay.

## Export format (`schemaVersion` 2)

Exported from **Settings → Export learning data** as `strategic-thinking-data-YYYY-MM-DD.json`.
- On iOS and Android the file goes to the app cache and the system share sheet opens.
- On web the browser downloads it.

Neither platform reports whether the file was saved, so the app doesn't claim it was.

```json
{
  "format": "strategic-thinking-learning-data",
  "schemaVersion": 2,
  "exportedAt": "2026-10-26T12:00:00.000Z",
  "goal": "coordination",
  "lessons": [
    { "id": "cooperation-trap", "number": 1, "title": "The Cooperation Trap", "completed": true, "inProgress": false, "challengesTried": 1, "challengesTotal": 3 }
  ],
  "attempts": [
    {
      "id": "l1.c3.changed-reward@1759276800000",
      "kind": "challenge",
      "lesson": "cooperation-trap",
      "prediction": "l1.c3.changed-reward",
      "question": "The Changed Reward",
      "skill": "incentives",
      "basis": "calculable",
      "answer": "no",
      "confidence": 2,
      "evaluation": "misconception",
      "outcome": "Strongest answer: Yes — working now pays more whatever you do",
      "attempt": 1,
      "isFirstAttempt": true,
      "lessonCompleted": false,
      "contentVersion": 1,
      "recordSchemaVersion": 2,
      "lockedAt": "2025-10-01T00:00:00.000Z"
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `format`, `schemaVersion` | Identify this format. Version 2 added challenges and attempt history. |
| `exportedAt` | When the file was made (ISO 8601, UTC). |
| `goal` | `anticipating`, `incentives`, `coordination`, `uncertainty`, `none`, or `null` if never chosen. |
| `lessons[]` | Every lesson with `completed`, `inProgress`, and `challengesTried` out of `challengesTotal`. |
| `attempts[].id` | Unique attempt id (`<item>@<lock time in ms>`). |
| `attempts[].kind` | `lesson` (a prediction inside a lesson) or `challenge` (a practice challenge). |
| `attempts[].prediction`, `question` | The item id, and the question (lesson) or challenge title. |
| `attempts[].attempt`, `isFirstAttempt` | Submission number for this item; `true` for the first. |
| `attempts[].answer` | The option id locked in. |
| `attempts[].confidence` | 1 Just guessing … 5 Extremely confident, given before any feedback. |
| `attempts[].evaluation`, `basis` | See the tables above. |
| `attempts[].outcome` | What happened, or the strongest answer, in a few words. |
| `attempts[].lessonCompleted` | Whether the lesson had been completed at the time (`null` if unknown, for old records). |
| `attempts[].contentVersion` | Challenge content version answered (`null` for lesson predictions). |
| `attempts[].lockedAt` | When the answer was submitted (ISO 8601, UTC). |
| `attempts[].recordSchemaVersion` | Version of the stored record (1 = from before challenges, upgraded on load). |
