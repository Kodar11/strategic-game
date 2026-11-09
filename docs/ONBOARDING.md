# First-session experience: "The First Read"

`app/onboarding.tsx`. It opens once per device above the tabs, and again from **Settings → Replay the introduction**.
It replaced the one-screen Host welcome on 2026-11-09; the user chose to rebuild it from scratch (see `docs/DECISIONS.md`).

**Goal:** in about ninety seconds a new player has played twice, been read by the Host, read the Host back, seen what
it means in real life, said what they want, met the rivals, had every usual doubt answered, and is in their first
Qualifier match.

| # | Part (`step`) | What happens | Doubt it answers |
| --- | --- | --- | --- |
| 1 | Envelope (`envelope`) | The Host seals a prediction. The player plays one Share-or-Take round against Maya, with all four outcomes shown first. Moves are revealed, then the envelope opens a beat later, with a haptic and a sound. | "What is this?" "Is it fun?" |
| 2 | Read (`read`) | Rock-Paper-Scissors against the Host, whose habit is Rock, Paper, Scissors in order. Three wins find it. After 6 rounds the Host gives the habit away. A hint appears after two rounds without two wins in a row. | "Is it too hard?" |
| 3 | Meaning (`meaning`) | "You read a person, and got read back." Three everyday scenes, then the promise line with the app's name. | "Why is this useful?" |
| 4 | Goal (`goal`) | One learning goal (saved as the existing `goal`, which the Profile shows) and a daily pace (2, 5 or 10+ minutes). | "Is it for me?" |
| 5 | Table (`table`) | The five rivals, one at a time (portrait, epithet, taunt), the season path (Qualifiers → five rivals → the Final against the Host, then the Gauntlet), and what else is inside and where. | "Will I get bored?" |
| 6 | Plan (`plan`) | Fair questions (free, ads, account, maths, data), a first week built from the goal and pace, then **Enter the Qualifiers** or **Look around first**. | "What's the catch?" "What now?" |

Rules and copy live outside the screens:

- `src/features/onboarding/flow.ts`: steps, the envelope, the Host's habit, the plan and the saved place. It is pure and tested.
- `src/features/onboarding/script.ts`: every word. Rewrite the copy there.
- `src/features/onboarding/dilemma.ts`: the Maya round, unchanged from the earlier welcome.

## Rules the copy must keep

- **No statistics about other players** unless they come from real data. The Host guesses; it never says "7 in 10". A test checks this.
- **No IQ, "brain score" or cognitive-benefit claims.** This was rejected for legal reasons. A test checks it too.
- **The fair answers must stay true.** Update them the day billing (Pro), ads or account rules change. Today: everything is free to play, there are no ads, guest play needs no account, and usage stats are shared only after the player says yes (UsageConsentCard, after the welcome).
- The "Also inside" chips name a real place (`Home`, `Lessons tab`, `Games tab`). `ui-consistency.test.ts` checks that the names match the tab bar.

## Navigation and saving

- **Skip** (top right, parts 1–5) jumps to the plan, which still ends in the first match.
- **Back** (top left) goes to the previous part.
- **Android back** goes to the previous part. From part 1 it goes to the plan; in a replay it closes the welcome.
- The place in the flow and the answers so far are saved in AsyncStorage (`onboarding.flow.v1`) after every change, so if the OS closes the app half-way, it resumes there. The save is cleared when the welcome ends. A replay always starts at part 1 and saves nothing until it ends.
- `settings.onboarded` is set only when the welcome ends (either button on the plan). A save from before onboarding existed counts as onboarded.
- The first Qualifier opens at the level its content sets (Easy). The read in part 2 doesn't change it.

## Events (`src/observability/events.ts`)

- `onboarding_step { step, replay }` for each part shown.
- `onboarding_finished { result: completed | skipped, at_step, choice, read_solved, goal, daily_minutes, next: match | explore, replay }`.

These give the funnel: start → each part → finish → first match (`tournament_match_finished`).

## Not done yet

- **Testing with people who haven't used the app.** After they finish, without explaining anything first, ask them:
  1. What is this app?
  2. Who is it for?
  3. Why did Maya take?
  4. What would you do next?
- **Testing on a real device**, including haptics, sound on Android and the resume after the OS closes the app. It has only been checked on web.
- **Keeping the first-week plan after the welcome.** Home doesn't show the plan yet. Day 1 (Qualifiers) and day 2 (Daily, then the first rival) already match what Home offers.
- **The paywall slots** (after the plan, and after the Qualifiers) are planned but not built. Billing is postponed until D7 retention is around 15%.
