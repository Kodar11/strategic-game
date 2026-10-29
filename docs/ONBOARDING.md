# First-session experience

`app/onboarding.tsx`, shown once per device above the tabs, and again on request from **Settings → Replay the introduction**.

| Stage | What happens |
| --- | --- |
| Welcome | One headline and one action, with a branching-paths animation. "Skip to the app" leaves immediately. |
| Decision | Share or take against Maya, one round, with all four outcomes shown before choosing. |
| Reveal | Both moves, the coins, what happened, and why Maya chose that way. "Go deeper" adds her incentives, the outcome table, labelled hypotheticals and what changes when players meet again. "Play it again" restarts with the same rules. |
| World + next step | Learn, Play and Explore previews built from the live catalog, then one recommended lesson or "Explore on my own". |

## The dilemma (`src/features/onboarding/dilemma.ts`)

This is a one-shot Prisoner's Dilemma, measured in coins:

| | Maya shares | Maya takes |
| --- | --- | --- |
| **You share** | 3 / 3 | 0 / 5 |
| **You take** | 5 / 0 | 1 / 1 |

Maya's rule: she plays only for her own coins in this single meeting, so she picks her dominant move (take). `mayaDecides()`
takes no arguments, which means it can't see your choice. Her move is sealed when the round starts and stays hidden until you lock
in. The dilemma uses no randomness. The module has no imports, so it can't read or write saved progress, and it doesn't touch
any game engine. Tests are in `src/features/onboarding/__tests__/`.

## Persistence

The welcome uses the existing `settings.onboarded` flag (`src/store/settings.ts`), which is stored locally:

- The flag is set only when the person leaves the welcome (skip, finish or Android back on the first screen).
- If a session is interrupted, the welcome simply shows again on the next launch.
- A save from before onboarding existed counts as onboarded, so existing users never see it.
- The nickname and learning-goal steps from the earlier welcome are still available in Settings, Profile and the Games tab.

## Not done yet: validation with new users

None of the following has been carried out:

- Testing the flow with people who haven't used the app. After they finish, without explaining anything beforehand, ask them to:
  1. Say what Tactiqo offers.
  2. Say why Maya took.
  3. Say what they learned.
  4. Choose what to try next.
- Analytics. The app has no analytics infrastructure, and none was added. Useful measures would be start and completion, skip
  rate, time to lock-in, how many people tap the recommended lesson, and whether they start a second activity. Collect them
  only if an approved analytics layer is added.
