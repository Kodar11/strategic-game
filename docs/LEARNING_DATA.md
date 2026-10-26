# Learning data: record, profile and export

The app keeps a small **learning record** on the device. It holds one entry per evaluated prediction, and it feeds both the Strategic Thinking Profile and the JSON export. Nothing is sent anywhere unless the learner exports it, and no names, emails, accounts or device identifiers are ever stored.

| Path | What it is |
|---|---|
| `src/features/learning/records.ts` | Record types, the prediction catalogue (`PREDICTIONS`), validation, deduplication, goal, export format. |
| `src/features/learning/profile.ts` | Every profile rule: skills, insights, confidence, next step. |
| `src/features/learning/shareFile.ts` / `.web.ts` | Writing and sharing the export file (native share sheet / browser download). |
| `src/store/progress.ts` | Persists `learning` and `goal` next to lesson progress (AsyncStorage). |
| Each lesson's `copy.ts` | `…Records(data)`: the lesson's evaluated predictions, built from the same feedback functions the screen uses. |

## How records are made

- A prediction is recorded once its feedback is shown, never while it is a draft.
  - Lesson 1: the rival prediction after Rohan moves; the penalty guess once the threshold is found.
  - Lesson 4: the lab prediction after its first simulation.
  - Lesson 5: the stress test after the detection slider is used.
- **Ids are stable.** Each record's id is `<prediction>@<lockedAt>`, where `lockedAt` is set when the learner locks the prediction.
  - Re-renders, resumed lessons and repeated effects produce the same id, and the first record for an id wins, so nothing is recorded twice.
  - A retry, lab reset or lesson replay locks a new attempt with a new id.
- **Legacy attempts are skipped.** Predictions locked before lock times existed have no `lockedAt` and are not recorded.
- **History is kept.** Completing a lesson does not erase the record. **Settings → Reset progress** does, but the goal is kept.
- **Storage is bounded.** At most 500 records are kept; the oldest are dropped first.
- **Bad data is dropped.** Saved data that fails validation is dropped on load, never guessed at. Saves from before the learning record existed start with an empty history, and completed lessons are kept.

## Evaluation

| `evaluation` | From the lesson's verdict | Meaning |
|---|---|---|
| `correct` | `match` | Matched the model or the outcome. |
| `partial` | `defensible`, `depends` | Reasonable, but missing something or resting on an assumption. |
| `reasonable-miss` | `reasonable` | A sensible call about something the learner couldn't know yet; the outcome went another way. |
| `misconception` | `misconception` | Contradicted the information available, or the learner's own prediction. |

| `basis` | Predictions | Used for skills and confidence? |
|---|---|---|
| `calculable` | The answer followed from what was on screen: `l1.rival`, `l1.penalty`, `l2.lab`, `l3.round2`, `l4.compare`, `l4.lab`, `l5.proposal`, `l5.detection` | Yes |
| `uncertain` | It depended on a hidden rule: `l2.crowd` (the crowd's mix), `l3.round1` (Nina's rule, with no clue) | No. Recorded and exported, but never counted as evidence of good or poor reasoning |

## Profile rules (summary)

- **Only the latest attempt counts.** For each prediction, the profile uses the most recent attempt, so a replay updates the result rather than piling up.
- **Skill areas.** There are four, each linked to its lessons: anticipating others, understanding incentives, coordination, and reasoning under uncertainty. The status depends on how many *calculable* predictions the learner has made in that area:

  | Calculable predictions | Status shown |
  |---|---|
  | None | Not tried yet |
  | Fewer than 2 | Still exploring |
  | 2 or more | "Matched the model in a of n" |

  There is no overall score.
- **Insights.** These are deterministic, need a minimum amount of evidence, and come in a fixed priority order:
  1. A gap between a strong area (at least 75% matched) and a weak one (at most 50%).
  2. Overconfidence: at least 3 confident (4–5) calculable predictions, with at most half matched.
  3. A weak area.
  4. Two or more reasonable misses.
  5. Underconfidence: at least 3 unsure (1–2) predictions, with at least 75% matched.
  6. A strength: at least 3 predictions in an area, at least 75% matched.

  Insights about the learner's goal come first. The page shows one primary insight and, at most, one secondary insight about a different area. If no insight qualifies, the page says that more predictions are needed.
- **Confidence.** This section needs at least 4 calculable predictions. It compares the confident group (4–5) and the unsure group (1–2), and shows a group only if it has at least 3 predictions. It shows counts only, never a percentage.
- **Next step.** It is chosen in this order:
  1. the lesson for the chosen goal;
  2. otherwise, the weakest area with evidence;
  3. otherwise, the lesson in progress or the next unfinished lesson;
  4. otherwise, a replay.

## Export format (`schemaVersion` 1)

Exported from **Settings → Export learning data** as `strategic-thinking-data-YYYY-MM-DD.json`.
- On iOS and Android the file is written to the app cache and the system share sheet opens; the learner chooses where to save or send it. The share sheet doesn't report whether the file was saved, so the app doesn't claim it was.
- On web, the browser downloads the file.

```json
{
  "format": "strategic-thinking-learning-data",
  "schemaVersion": 1,
  "exportedAt": "2026-10-26T12:00:00.000Z",
  "goal": "coordination",
  "lessons": [
    { "id": "cooperation-trap", "number": 1, "title": "The Cooperation Trap", "completed": true, "inProgress": false }
  ],
  "attempts": [
    {
      "id": "l2.crowd@1761350400000",
      "lesson": "strategy-detective",
      "prediction": "l2.crowd",
      "question": "What will the other ten average?",
      "skill": "anticipating",
      "basis": "uncertain",
      "answer": "random",
      "confidence": 2,
      "evaluation": "reasonable-miss",
      "outcome": "The other ten averaged 38.3",
      "recordSchemaVersion": 1,
      "lockedAt": "2025-10-25T00:00:00.000Z"
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `format`, `schemaVersion` | Identify this format. `schemaVersion` changes when fields change meaning. |
| `exportedAt` | When the file was made (ISO 8601, UTC). |
| `goal` | `anticipating`, `incentives`, `coordination`, `uncertainty`, `none`, or `null` if never chosen. |
| `lessons[]` | Every lesson with `completed` and `inProgress` (a lesson partway through). |
| `attempts[].id` | Unique attempt id (`<prediction>@<lock time in ms>`). |
| `attempts[].prediction`, `question` | Which prediction, and the question in short form. |
| `attempts[].answer` | The option id the learner locked in (as in the lesson's code). |
| `attempts[].confidence` | 1 Just guessing … 5 Extremely confident, given before the answer was revealed. |
| `attempts[].evaluation`, `basis` | See the tables above. |
| `attempts[].outcome` | What happened or what the model says, in a few words. |
| `attempts[].lockedAt` | When the prediction was locked (ISO 8601, UTC). |
| `attempts[].recordSchemaVersion` | Version of the stored record the entry came from. |
