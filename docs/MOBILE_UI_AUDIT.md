# Mobile UI audit — lessons (October 2026)

A layout audit of all 22 lessons on phone widths (320, 360, 390 and 430 dp), looking for overlapping labels, duplicated
text, numbers breaking mid-value, cramped multi-column cards, squeezed tables and wrapping buttons. Lesson content,
scenario rules and every calculation are unchanged; only presentation moved.

## How the lessons are built (where a layout bug can live)

| Lessons | Screen code | Shared pieces they render |
|---|---|---|
| 1, 4, 5, 10, 14 | Their own components (`src/features/lessons/<id>/`) | `LessonShell`, `Slider`, `Stat`, `PayoffMatrix`, `PredictionPrompt`, `Completion`, plus their paired scenarios |
| 2, 3, 6–9, 11–13, 15–22 | `CurriculumLesson` | `LabView` (matrix, tree, parameter or reveal lab), `ScenarioPlayer` ×3, `TransferQuestion`, `Completion` |
| All 66 scenarios | `ScenarioPlayer` | Rules card, `ScenarioVisualView` (payoff matrix, game tree or `DataTable`), prediction, `Decision` (choice, number or allocation), result stats, `Bars`, "Compare your options" |

Every reported symptom traced back to one of these shared components, so each was fixed once.

## Findings

| # | Lessons | Symptom | Root cause | Fix |
|---|---|---|---|---|
| 1 | 6, 7, 11, 12, 13, 15, 16, 17, 18, 19, 21 (every parameter lab) | Slider label and a bold value collide or run off the right edge; the label appears twice ("Value of the resource (V)" … "Value of the resource (V): 4") | `ParamLab` passed `formatValue={(v) => \`${label}: ${v}\`}`, so the value repeated the label; `Slider`'s header was a non-wrapping `space-between` row | Value is now just the number and unit. `Slider`'s header wraps: label grows and wraps on the left, value stays right, and drops below when the line is too narrow (or the system font is large) |
| 2 | Every scenario whose move is a number (25 decision prompts across lessons 1–22) | The question shown twice (heading + slider label) and the value shown twice (slider header + "Offer: 5 coins" button) | `Decision` passed the full prompt as the slider label and kept the slider's value header | The slider keeps the prompt as its accessibility label but prints neither (`hideLabel`, `showValue={false}`); the question appears once and the live value is on the commit button directly below |
| 3 | Allocation decision (19 B) | "A: 30" label repeated in the value | `formatValue={(v) => \`${p.label}: ${v}\`}` | Value shows the number only |
| 4 | Daily challenge number answers | "YOUR ANSWER" section label followed by a "Your answer" slider label | Same pattern | `hideLabel` |
| 5 | Every parameter lab (6, 7, 11–13, 15–19, 21), every scenario result card, daily results | `100.0%` splitting into `100.` / `0%`; three narrow cards with long labels; `3.5 units` wrapping | Stats used `flexBasis: '30%'` regardless of width or content, with a 30 pt value | New `StatGrid` measures its width and picks 3, 2 or 1 columns from the actual labels and values (and the system font scale). One column renders as a compact label-left / value-right list instead of tall cards. Values use non-breaking spaces so a number and its unit stay together. Rows share a height; a short last row stretches |
| 6 | 5, 10, 14 (custom lessons) | Two or three `Stat`s in a plain row: same squeeze on 320 dp | Hand-built `flexDirection: 'row'` groups | Converted to `StatGrid` |
| 7 | 10 C (call-centre bonus) and every other table: 6 C, 8 A, 16 C, 19 B, 20 B, 20 C, checkpoint tables | Row names wrapping awkwardly, headers broken mid-word ("Solve / d"), cells cut off at two lines; the 11-column voter table in 6 C squeezed to unreadable | `DataTable` gave every column `flex: 1` and `numberOfLines={2}` | Columns are sized from their content (`table-layout.ts`). If the table fits, extra width is shared out; if not, cells wrap only between words; if even that can't fit, the table keeps readable widths and scrolls sideways inside its frame with the first column pinned and a "swipe" hint. Rows on both sides of the pinned column keep the same height |
| 8 | Every lesson's completion screen (reported on 9) | "Next: Incentives and Hidden Actions" wrapping into an unbalanced two-line button | One long label in a padded button | `Button` gained an optional `kicker`: "NEXT LESSON" over the lesson title, so it reads as two deliberate lines. Button padding moved from 20 to 16 horizontally (+8 vertically) so labels have more room in every button, and the accessibility label reads "Next lesson: …" |
| 9 | 1, 5, 10 (sliders with markers) | Marker caption ("tie", "half") could hang off either end of the track | Caption centred on the marker without clamping | Clamped inside the track |
| 10 | All (bars) | Long bar labels could push the percentage out | No shrink on the label | Label shrinks and wraps; value stays |
| 11 | All (confidence scale) | End labels of the 1–5 scale could collide on 320 dp with large text | No shrink | Both labels shrink and wrap |

Checked and left alone: `PayoffMatrix` already picks side-by-side / stacked / scrolling layouts from measured width;
`LessonShell` keeps the footer outside the scroll view with safe-area padding, so the last card always scrolls clear
of it; `ChoiceCard`, `Segmented`, `TransferQuestion` and the game tree wrap correctly.

## Validation

- Unit tests for the column choices: `src/components/lesson/__tests__/stat-layout.test.ts`,
  `src/features/scenarios/__tests__/table-layout.test.ts`. Text-width estimates were calibrated against Inter measured
  in the browser and err wide, since an underestimate breaks a word.
- Automated sweep in the web build (Inter, the same flexbox rules as native), checking that no text extends past the
  screen (outside a deliberate sideways scroller) and that no single word or number renders on more than one line. No
  problems found in:
  - all 11 parameter labs at 320, 360, 390 and 430 dp;
  - the 6 matrix, tree and reveal labs (lessons 2, 3, 8, 9, 20, 22) at 320 and 360 dp;
  - all 66 scenario pages (brief, rules, table or matrix, prediction) and each one's first decision card at 320 dp;
  - the header and footer (progress, Back / Continue / call to action) of all 22 lessons at 320 dp. The step bodies of
    lesson pages did not render in the hidden test frame, so they are covered by the lab and scenario checks above,
    not this one.
- Screenshots: lessons 6, 7 (including `100.0%`), 12 labs; 10 C table at 360 dp; 20 C table at 320 dp; number decision
  at 320 dp; lesson 5 intro stats at 320 dp; next-lesson button at 320 and 360 dp.
- `npx expo export --platform android` bundles without errors.

## Still needs a device

- Android with the system font at its largest setting: the layouts account for font scale, but this was only exercised
  in tests, not on hardware.
- Scenario result cards (shown after playing) use the same `StatGrid` as the labs, but were not opened for every
  scenario.
- Custom-lesson steps past the intro (1, 4, 5, 10, 14) were checked by code review and by the shared components they
  use, not opened step by step.
