# Tactiqo Stories

Stories are Tactiqo's third kind of experience, next to **Lessons** (an idea, explained with exercises) and **Games**
(a decision, practised in repeatable matches). In a story the player is inside a situation first, makes choices with
consequences, and meets the idea afterwards: *experience, then discovery, then explanation*.

There are two:

| | The Distance Between Us | The Rules of the Game |
|---|---|---|
| Subject | Trust, reciprocity, retaliation, forgiveness, communication, boundaries | Repeated prisoner's dilemma, Axelrod-style tournaments, environments, adaptation |
| Form | Narrative: a courier, a broken bridge, sixteen nights | Experiment: a tournament where rules play instead of people |
| Mechanics | 9 decisions, Mira's behaviour derived from history, 3 endings (8 variants) | Real, deterministic, tested simulation |
| Length | ~15 minutes | ~15 minutes |

Both are original works inspired by Nicky Case's *The Evolution of Trust*, Veritasium's video on the prisoner's
dilemma, and Robert Axelrod's tournaments. No script, characters, art or sequence is copied from them.

## Where things live

```
app/(tabs)/stories.tsx               Stories library (a fourth tab)
app/story/[storyId].tsx              Full-screen story route (crossing | meridian)

src/stories/                         Pure logic — no React Native; tested with node --test
  crossing/story.ts                  Story One: choices, Mira's rules, script, endings, ledger, save restore
  meridian/engine.ts                 Story Two: strategies, matches, noise, tournaments, rooms, population model
  meridian/run.ts                    Story Two: saved run (step, picks, predictions, design) and validation
  save.ts                            Device save format for both stories, validated on load
  __tests__/                         crossing, meridian-engine and save tests

src/features/stories/                UI
  store.ts                           zustand store, persisted to AsyncStorage key tactiqo/stories/v1
  ui/kit.tsx                         Shared pieces: top bar, choice and continue buttons, intro card, Reflection
  crossing/CrossingArt.tsx           Vector illustration of the gorge, restaged on every beat
  crossing/CrossingStory.tsx         Story One player, ending card, ledger and reflection
  meridian/MeridianArt.tsx           Sigils, move tokens, match strips, leaderboard, population chart, hall art
  meridian/MeridianStory.tsx         Story Two's ten steps and reflection
```

Changes outside these: the `stories` tab in `app/(tabs)/_layout.tsx`, the `story/[storyId]` screen in
`app/_layout.tsx`, and the `ScrollText` icon in `src/components/ui/icons.ts`.

## Architecture decisions

**No narrative engine.** Story One's script is ordinary functions (`sceneBeats(scene, choices)`) that return beats —
lines and choices, each with a complete illustration `Stage`. Story Two is ten bespoke React steps over a simulation
engine. Neither story needs anything the other has, apart from the controls and the reflection, which are shared in
`ui/kit.tsx`.

**The history is the state.** Story One saves only `{ pos, choices }`. Everything else — what Mira loads into the
basket, her note on night seven, whether a retaliation cycle ran, what she believed after the storm, the ending — is
derived from the choices by named functions (`miraTimber`, `breachTone`, `stormReading`, `miraStance`, `ending`, …).
There is no hidden trust score. Story Two saves only the player's picks and predictions; every result is recomputed by
the deterministic engine.

**Local, offline, no backend change.** Stories progress is device-local, like Strategy Arena records: no Supabase
schema change, no account needed, works offline. Each beat is written as it happens, so Android Back, closing the
app or a crash resumes on the same beat. Saves are validated on load (`sanitizeSave`, `restore`, `sanitizeRun`):
unknown values are dropped and a position is moved back to the first unmade decision, so a damaged save can't strand
a player. Limitation: progress does not sync across devices, and "Reset progress" / account deletion in Settings do not
clear it (matching Arena records).

## Story One — The Distance Between Us

Luma is split by the Ashgill gorge after a storm. You keep the east bank's cable; Mira, a courier carrying for her
brother's hamlet, works the west. Hollis, the injured old bridgekeeper, is your side's stake and counterpoint.

Scenes (`SCENES`): crossing · first exchange · rope · night seven · the answer · echoes (only after an empty basket) ·
the storm · first frost (+ asking about night seven) · the crossing changes.

Mira's rules (all in `story.ts`, each documented where it's defined):

- Night 1 she mirrors openness: plain talk gets a full bundle, guardedness a stranger's share.
- Night 4 her timber answers night 1 (full, a single test plank, extra to make amends, or half).
- Night 7 she always keeps the medicine — her brother is sick. History only changes her note ("sorry" or "even").
- Night 9 she always sends a third of what she owed. Your answer (empty / stay away / send anyway / send half with
  terms) decides what happens next; an empty basket opens the echo scene, where you either stop first or keep going.
- Night 13 the storm empties your basket and soaks hers. A short load is invisible to her. What she believes
  (`stormReading`) depends on your signal *and* your record: explaining or asking only half-works after repeated
  harm, silence is read through the past, an accusation is always misread.
- Night 16 her stance (`miraStance`: open / wary / closed) has three distinct ways to close: a retaliation cycle, being
  misread after earlier harm, or three deliberate harms. Asking about night seven can open a wary Mira, never a closed
  one.

Endings (`ending()`): **The Span** (built together, or in stages), **The Line Holds** (unconditional generosity skimmed by
the west council; a wary Mira stopping at the first knot; "not this winter"; an honest trade), **Two Banks** (wintering
apart after a cycle; or keeping the oil on the last night). Design properties, each covered by a test:

- Cooperating every time *without conditions* does not get the best ending; the same generosity with a boundary does.
- A player who distrusted Mira at first, then set terms and communicated, can still build the span.
- Retaliating once and then stopping first doesn't close the road; a cycle that runs does.
- Self-protection ("winter without the bridge") is a legitimate ending, not a failure state.
- Blind trust with a wary partner stops short; staged trust gets further.
- A deliberate short load followed by "storm" can be believed — and the ending remembers it.

The illustration (`CrossingArt`) is restaged from each beat's `Stage`: sky (dusk → night → storm → frost → dawn), rain
and snow, Mira's pose and lantern, the basket's position (animated on the UI thread), and what crosses the gap — single
cable, hand-line, guide line, fraying line during a cycle, finished span, or cut line. The environment carries the
relationship; there is no meter.

## Story Two — The Rules of the Game

Steps (`STEPS`): the hall · choose your entrant (+ two predictions) · one encounter · the same opponent again (predict,
then play six rounds vs a hidden Mirror) · the echo (one slip between two Mirrors; swap the partner) · the Open Trials
(leaderboard, tap any contestant for your match; Tit for Tat and Axelrod) · change the room (Garden / Iron / Fog, with
any starter) · the room changes back (population model) · your final entrant (design + prediction) · the last trial
(all four halls) → reflection.

### Simulation rules (`engine.ts`, stated in the story too)

- Payoffs T 5 / R 3 / P 1 / S 0 — points, not money. Simultaneous moves; both sides see executed moves afterwards.
- Matches are a fixed 50 rounds. No strategy looks at the round number, so none can exploit the end.
- Noise: with probability 5 %, an intended move is executed as its opposite; nobody learns it was a slip.
- Round-robin: every pair plays, and every entry meets a copy of itself (as in Axelrod's tournaments). Head counts
  weight the average. Score = average points per round against the room; equal scores share a rank.
- Randomness (the Weathervane, forgiveness, noise) comes from a counter-based hash keyed to the *rule*, not to its seat
  in the field, so an entry identical to a contestant always scores identically. The Fog Hall averages 100 seeded
  replays per pairing: with a dozen, the top three changed with the seed.
- Population model (`evolve`): discrete replicator dynamics on the tournament's pairwise averages. It is described in
  the story as a simplified model — no mutation, no new strategies, extinct ones never return — not biology.

Strategies: Open Hand (always C), Mirror (Tit for Tat), Iron Wall (always D), Long Memory (grim trigger), Weathervane
(random), Prober, Gentle Mirror (generous TFT, forgives 1 in 5), Pendulum (alternates), Wary Mirror (suspicious TFT),
Settler (win-stay lose-shift), Calculator (the deliberately elaborate one), and the player's design (opening × response
× forgiveness).

### What the results actually show (from tests, not copy)

- Open Trials: the Mirror out-scores no one head to head yet finishes at or near the top; the Iron Wall wins the most
  duels and finishes near the bottom; the Calculator lands mid-table.
- Garden Hall: the Prober tops it whatever you enter. Iron Hall: an Open Hand finishes last.
- Fog Hall: the Gentle Mirror wins; the fog costs the Mirror more than the forgiving rules, and the never-forgiving Long
  Memory most of all.
- Every sentence in Story Two that states a rank, a winner or a comparison is computed from the run. The Axelrod card
  says plainly that this hall is the app's own simulation, not a reproduction of his results, and that Tit for Tat's
  qualities are not a guarantee.

## Accessibility, motion, performance

- Choices are full-width buttons (≥ 52–56 pt) with the detail in the accessibility label; every illustration has a text
  description; each new Story One line is announced to screen readers.
- Reduced motion (system or in-app setting) removes entering animations, the basket glide, rain and snow drift and the
  leaderboard / population reveals; nothing is gated on an animation finishing.
- No audio: the stories are fully understandable without it, and the app has no audio pipeline for ambience. Adding
  ambient sound would need a new dependency and controls, so it is out of scope for this version.
- Art is vector (react-native-svg), so there are no image assets to download. Fog-room runs (100 replays) take well under
  a second; results are memoised per step.

## Tests

`npm test` runs `src/stories/__tests__/*` with the rest of the suite (76 story tests):

- **crossing.test.ts** — plays all 3,360 complete choice combinations to an ending; checks that all 3 endings and all 8
  variants are reachable, that dialogue about the past only appears when that past happened, Mira's rules, storm
  readings, the no-automatic-reward properties above, that every option of every decision changes something later,
  save restore (including invalid and out-of-order saves) and the ledger.
- **meridian-engine.test.ts** — payoff matrix, every strategy's rule, slips and noise rates, determinism, aggregation
  arithmetic, shared ranks, identical-rule ties, environment effects, population invariants.
- **save.test.ts** — save validation, step fallback, bands, the Mirror's reply in the repeated scene.

## Verification status

- `npx tsc --noEmit`: clean for all app code (the pre-existing errors in the Deno edge function
  `supabase/functions/text-to-speech` are unrelated).
- `npx expo lint`: clean.
- `npm test`: all story tests pass. The 10 failures in `supabase/__tests__/daily.test.ts` were failing before this work.
- Web preview (375 × 812): both stories played start to finish, including resume from the library, replay, the
  reflection, and a retaliation-cycle path.
- **Not verified on Android or iOS.** No native build or device/emulator run was done. Things to check there: the basket
  glide and rain overlays (Reanimated + SVG), `fade_from_bottom` transition, Back mid-story, and text sizes on small
  phones.

## Outstanding

- Native (Android) verification, above.
- Optional: illustrated character art for Mira and Hollis. The current silhouettes are intentional vector art, not
  placeholders, but painted portraits for the dialogue panel would deepen Story One.
- Optional: ambient sound with an in-app toggle.
- Progress is per device; syncing it through Supabase would need a schema change.
