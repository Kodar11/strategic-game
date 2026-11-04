# Tactiqo game library audit

Audit date: 31 October 2026. Audited on `main` at `d3e82c6`. **No game code, rule, bot, component or dependency was changed.** Supporting data is in [`docs/game-ux-audit/`](game-ux-audit/).

## How to read this report

### There are 23 games, not 22

The brief lists 22 games, but the app has **23 playable games**. "The Ultimatum" exists twice: a classic game (`src/games/ultimatum.ts`) and a separate Arena game, "The Ultimatum Game" (`src/arena/ultimatum-game.ts`). Both appear on the Games tab. I audited both, under entry 4.

Three other points in the brief differ from what is built:

- **The Codebreaker** is a word-association game like Codenames. It has no symbols or candidate combinations.
- **The Coalition** has take-it-or-leave-it proposals. It has no negotiation.
- **The Two-Thirds Guess** already shows the distribution of guesses.

### Evidence labels

| Label | Meaning |
|---|---|
| **[B]** | Seen in the browser preview at 360×640 (some checks also at 320×568), driven by scripted taps at Normal/Medium, standard or short length |
| **[C]** | Read in the code; not exercised at run time |
| **[S]** | Measured by a simulation of fixed strategies against the real engines |
| **[H]** | Hypothesis or design inference, not a measured fact |

### What was not verified

- **Android: nothing.** This machine has no Android SDK, emulator or device. Every "mobile" finding is mobile-sized web, including layout, gestures, haptics and performance.
- **Human play.** The moves were scripted, so nobody played these for fun. Engagement scores and "feel" are design inferences.
- **Server matches.** Game of the Week and friend challenges were not played. The tests cover them.
- **Harder setups in the browser.** Easy and Hard, long matches and challenge variants were simulated only (standard variants), and not seen on screen.
- **Slider dragging and the Repeat panel.** The sliders were not dragged and Repeat was not run. Mid-match guessing was not exercised; the end-of-match guess was.
- **Hardware Back, screen readers and animation smoothness.**
- **Screenshots.** The preview often timed out on screenshots. No image was captured for RPS, The Ultimatum, The Ultimatum Game, Stag Hunt, The Cooperation Game, The Auction House, The Traveler's Dilemma, The Saboteur or The Coalition's proposal builder. Those games were checked through page text, measurements and code, and their Visual identity scores are marked † in the scorecard. No screenshots are stored in the repo.

### Checks that were run

| Check | Result |
|---|---|
| `npm test` | 1,139 passed, 0 failed |
| `npx expo lint` | No errors |
| `npx tsc --noEmit` | 4 errors, all in `supabase/functions/text-to-speech/index.ts` (already known, not game code) |
| Scripted play in browser | All 23 games reached their results screen |

### Limits of the simulation

Each row plays one simple fixed strategy for 200 seeds against each opponent at each level (standard length and variant). These are not human results. They show whether a strategy that ignores the opponent can win, and whether difficulty changes the result. Full output is in [`balance-simulation-output.txt`](game-ux-audit/balance-simulation-output.txt). Win rates below are percentages for Easy / Normal / Hard.

---

## Section A: Executive summary

**Overall quality.** The library is broad, stable and honest. The engines are carefully built, the tests are strong, and the debriefs cite what really happened in the match. It is still less finished as a set of *experiences* than as a set of *systems*. Most games share one layout: a score strip, a panel with what just happened, a decision panel and a text-based result. Only a few give the player something to touch.

**Strongest implementations.**

- **The Gambit** has direct manipulation and the clearest skill curve in the library.
- **The Cooperation Game** has the best round structure and results screen.
- **The Inspector** has the healthiest balance.
- **The Last Stand** has a real map with coordination built into the play.
- **The Traveler's Dilemma** shows consequences before you commit.

**Generic or underdeveloped games.**

- **The Hidden Signal** is the most text-heavy game.
- **The Defusal** asks you to do logic in your head, with the clues out of sight of the wires.
- **The Market Rivals** can be won by one fixed price, and the screen is long.
- **The Power Play** usually ends in a three-Treasury race.
- **The Coalition** is a list of bars where the point is alliances.

**Five correctness problems [B/S].** These should be fixed before any redesign:

1. **Two-Thirds mystery matches reveal the hidden crowd type from round 1.** The footer says "The group: 5 × Shallow Thinkers" while offering Insight Points for guessing it.
2. **The Gambit can leave the player with no legal move and no way to pass.** It happened in about 0.04% of random-play matches. The match then cannot end.
3. **The Defusal can deal a clue that says nothing:** "Both live wires are among 1–6" on a six-wire bomb. It reaches 4–22% of hands, depending on setup.
4. **The Defusal's black wire is almost invisible** on the dark panel.
5. **Small wrong statements in player text:** "Ten strategic games" on a tab with 23; "a 50% move doesn't fail often"; "you called 1 twos".

**Common UX problem: the decision moves below the fold.** In the Arena layout the reveal sits above the decision, so the board grows and the next action moves down the page. At 360×640, from the top of the page, the action was out of view on more than half of the taps in 14 of the 18 Arena games. In The Market Rivals, The Commons, The Coalition, The Auction House, The Ultimatum Game, Liar's Dice, The Hidden Signal and The Power Play that was every tap. The classic games place it higher and stay mostly on screen.

**Common visual problem: the game state is described, not shown.** Most boards have no signature object that changes during play. The exceptions are the lake, the fire map, the Gambit board, the dice, the tokens, the cards, the wires, the word grid, the luggage tags and the number line. Even there, pieces change state without moving. Gambit pieces disappear and pop in on the new square. No game has sound [C].

**Common interaction problem: evidence disappears.** Every game asks you to work out a hidden personality, but 11 of the 18 Arena boards keep only the latest round on screen. Bluff tells you to compare claims with tokens, then replaces them every round. See Section D.

**The biggest design problem: "winning" often rewards the wrong thing.** In Split or Steal and The Cooperation Game, always defecting wins 100% of matches at every level, against every opponent, while always cooperating wins 0% **[S]**. In Stag Hunt, always hunting stag together can never "win", and the result is "A draw". The mechanics are faithful. The headline teaches the opposite of the concept.

**Difficulty often does not mean difficulty [S].** For several fixed strategies, difficulty makes little difference or even inverts:

| Game and strategy | Easy | Normal | Hard |
|---|---|---|---|
| The Market Rivals: always price 10 | 96 | 90 | 92 |
| The Mole: exact probability | 79 | 79 | 79 |
| Bluff: honest, call long-odds claims | 64 | 65 | **77** |
| The Coalition: fair split, accept all | 17 | 18 | **22** |
| Liar's Dice: never call | 52 | **83** | 54 |
| The Power Play: always Treasury | 49 | 42 | 43 |

For comparison, The Gambit (always step: 58 / 53 / 20) and The Auction House (shade by 1u: 56 / 38 / 34) scale as you would hope.

**Most promising opportunities.** The best value is mostly in presentation: keep the decision on screen, keep a visible record of evidence, and frame shared outcomes correctly. Engine changes should wait for a separate balance decision.

---

## Section B: Comparative scorecard

Scored 1–5. The observations behind each score are in Section C and the measurements below. † = Visual identity scored without a captured screenshot. Engagement is a design inference for every game **[H]**. Android is not verified for any game, so Mobile means mobile-sized web only.

| # | Game | Authenticity | Decision UX | Visual identity | Interactivity | Feedback | Engagement | Mobile | Polish | Total |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 22 | The Gambit | 4 | 5 | 4 | 5 | 3 | 4 | 3 | 4 | **32** |
| 6 | The Cooperation Game | 3 | 4 | 3† | 2 | 5 | 4 | 4 | 5 | **30** |
| 13 | The Inspector | 5 | 4 | 3 | 2 | 4 | 3 | 4 | 4 | **29** |
| 19 | The Last Stand | 4 | 3 | 4 | 4 | 3 | 4 | 3 | 4 | **29** |
| 14 | The Traveler's Dilemma | 4 | 4 | 3† | 3 | 4 | 3 | 3 | 4 | **28** |
| 2 | Rock, Paper, Scissors | 4 | 4 | 2† | 2 | 3 | 3 | 5 | 4 | **27** |
| 21 | The Codebreaker | 3 | 4 | 3 | 4 | 3 | 3 | 3 | 4 | **27** |
| 3 | Two-Thirds Guess | 4 | 3 | 3 | 3 | 4 | 3 | 4 | 2 | **26** |
| 10 | The Mole | 3 | 4 | 3 | 4 | 3 | 3 | 3 | 3 | **26** |
| 16 | Bluff | 3 | 4 | 3 | 3 | 3 | 3 | 3 | 4 | **26** |
| 20 | Liar's Dice | 2 | 4 | 4 | 4 | 4 | 3 | 2 | 3 | **26** |
| 7 | The Auction House | 5 | 3 | 2† | 3 | 4 | 3 | 2 | 3 | **25** |
| 4a | The Ultimatum (classic) | 3 | 3 | 3† | 3 | 3 | 2 | 4 | 3 | **24** |
| 4b | The Ultimatum Game (Arena) | 3 | 3 | 3† | 3 | 3 | 3 | 3 | 3 | **24** |
| 11 | The Commons | 4 | 3 | 4 | 2 | 3 | 3 | 2 | 3 | **24** |
| 15 | The Saboteur | 4 | 3 | 3† | 3 | 3 | 3 | 2 | 3 | **24** |
| 1 | Split or Steal | 3 | 3 | 2 | 2 | 3 | 3 | 4 | 3 | **23** |
| 5 | Stag Hunt | 3 | 3 | 2† | 2 | 3 | 2 | 4 | 3 | **22** |
| 8 | The Market Rivals | 3 | 3 | 3 | 3 | 3 | 2 | 2 | 3 | **22** |
| 12 | The Coalition | 3 | 3 | 2† | 4 | 2 | 3 | 2 | 3 | **22** |
| 18 | The Power Play | 2 | 3 | 3 | 3 | 3 | 3 | 2 | 3 | **22** |
| 9 | The Hidden Signal | 3 | 3 | 2 | 2 | 3 | 3 | 2 | 3 | **21** |
| 17 | The Defusal | 3 | 2 | 3 | 3 | 3 | 2 | 2 | 2 | **20** |

### Mobile measurements [B]

Measured at 360×640 with the page scrolled to the top, including the first-run coach tip where shown. "Out of view" counts the scripted taps whose target sat beyond the 640 px screen. A real player may already have scrolled, but must still scroll to get there. "Reflection Y" is how far down the results screen "A thought to take with you" starts. All rows are standard length except The Gambit and The Cooperation Game, which are short, so their in-play heights can only be equal or larger in longer matches.

| Game | First screen height | Tallest in play | Action position (Y) | Taps out of view | Result height | Reflection Y | Play again Y |
|---|---:|---:|---:|---:|---:|---:|---:|
| Rock, Paper, Scissors | 652 | 976 | 376–464 | 0 of 12 | 1650 | 1271 | 1476 |
| Split or Steal | 760 | 1170 | 266–464 | 0 of 10 | 1673 | 1294 | 1499 |
| Two-Thirds Guess | 718 | 1136 | 462–578 | 0 of 5 | 1661 | 1306 | 1487 |
| The Ultimatum | 640 | 1000 | 458–554 | 0 of 6 | 1499 | 1120 | 1325 |
| Stag Hunt | 700 | 1134 | 266–488 | 3 of 8 | 1575 | 1196 | 1401 |
| The Cooperation Game | 735 | 959 | 326–557 | 0–1 per match | 1930 | not captured | not captured |
| The Inspector | 736 | 1067 | 408–569 | 1 of 8 | 1946 | 1402 | 1607 |
| The Last Stand | 1018 | 1126 | 343–885 | 3 of 6 | 1991 | 1378 | 1583 |
| Bluff | 722 | 950 | 541–647 | 4 of 8 | 1803 | 1166 | 1395 |
| The Mole | 874 | 1122 | 338–861 | 7 of 10 | 1843 | 1299 | 1479 |
| The Codebreaker | 716 | 1280 | 475–1053 | 6 of 9 | 1839 | 1250 | 1431 |
| The Saboteur | 1001 | 1207 | 460–725 | 6 of 9 | 2101 | 1557 | 1762 |
| The Defusal | 1164 | 1426 | 309–943 | 4 of 6 | 2409 | 1772 | 2001 |
| The Gambit | 830 | 1084 | 487–682 | 13 of 20 | 2135 | 1522 | 1727 |
| The Traveler's Dilemma | 711 | 1112 | 470–687 | 7 of 8 | 1928 | 1291 | 1520 |
| The Ultimatum Game | 761 | 1134 | 549–651 | 6 of 6 | 1941 | 1396 | 1577 |
| The Hidden Signal | 938 | 1410 | 601–759 | 8 of 8 | 2171 | 1647 | 1876 |
| The Commons | 994 | 1172 | 701–859 | 8 of 8 | 2158 | 1613 | 1794 |
| The Auction House | 1006 | 1290 | 661–881 | 5 of 5 | 1929 | 1360 | 1565 |
| The Power Play | 973 | 1129 | 684–818 | 5 of 5 | 1976 | 1387 | 1568 |
| Liar's Dice | 926 | 1180 | 684–959 | 11 of 11 | 2045 | 1408 | 1637 |
| The Coalition | 819 | 1208 | 630–930 | 11 of 11 | 1971 | 1402 | 1607 |
| The Market Rivals | 1166 | 1387 | 854–1035 | 8 of 8 | 1723 | 1198 | 1403 |

Other measurements:

- **Horizontal overflow:** none at 360 px in any game. At 320×568, I checked six games. Liar's Dice was the only one with elements past the right edge (6 elements, most likely the row of six face pickers).
- **Small tap targets:** coach-tip close 16×16 (with a 10 pt touch margin), Cooperation's Rules 81×36 and Match history 294×32, Arena result rematch and opponent pills 40 tall.
- **Setup screen:** The Bluff setup screen is 1,821 px tall and Play sits at Y 1536, about two and a half screens down, even when you keep every default.
- **Games tab:** 5,125 px tall.

---

## Section C: Individual game audits

Android is not verified for any game. Priorities: P0 correctness or serious usability, P1 high-value experience, P2 polish, P3 optional.

### 1. Split or Steal

**Current implementation**
Classic 10-round iterated prisoner's dilemma, paying 5/5, 8/0, 0/8 or 1/1. Two tiles, then a reveal chip for each side with a sentence, a payoff matrix that highlights the cell played, coin bars and a history strip (`src/features/games/ui/SplitStealBoard.tsx`). Four hidden bots. Engine has an exact SQL port **[C]**.

**What works well**
- Everything fits a phone: the decision was always in view (0 of 10 taps out of view) **[B]**.
- The matrix highlight ties the outcome to the rules.
- The reveal gives evidence about the opponent ("After you chose Steal, it chose Steal next round 2 of 3 times") **[B]**.

**Weaknesses**
- Always stealing wins 100% at every level, against every bot. Always splitting wins 0% **[S]**. The screen then says "You beat The Cooperator" even when both could have earned more.
- The coin bars repeat the score bar **[B]**.
- The reveal is small: two chips with a staggered pop-in, and no tension.
- It overlaps heavily with The Cooperation Game, which does the same thing better.

**Missed opportunities**
Show what mutual splitting would have paid. The final results could compare "You 50 · Bot 34" with "10 rounds of mutual split: 50 each".

**Visual direction**
Two sealed choices on a table that turn over together. One coin pile in the middle that divides or vanishes.

**Interaction improvements**
Keep two choices; that is the right form. Press and hold to seal your choice before the reveal **[H]**.

**Recommended changes**
1. Add a "what you left on the table" line to the result.
2. Add a two-step sealed reveal.
3. Remove the duplicate coin bars.

**Risk and complexity**
Low if only presentation changes. Any rule change requires SQL and a `rulesVersion` bump.

**Priority**
P1, for the outcome framing.

**Recommendation**
Minor polish.

### 2. Rock, Paper, Scissors

**Current implementation**
Classic 12 rounds, win 3, tie 1, loss 0. Three gesture tiles, reveal chips, W/L track and the bot's throw history. Four hidden bots. Has its own detailed end-of-match reveal (`RpsBoard.tsx`, `RpsReveal.tsx`, `rps-insight.ts`).

**What works well**
- This is the best mobile fit in the library. Actions stayed at Y 376–464 [B].
- Bots are distinct and learnable: repeating or cycling loses almost everything to the Mind Reader (0%) and the Counter punishes habits, while beating the bot's last throw wins 59–80% **[S]**.
- The final evidence quotes the rule and how often it applied [B].

**Weaknesses**
- Repeated rounds look the same, and only the small history circles show change.
- The history shows the bot's throws, not what you threw against them.

**Missed opportunities**
A simple pattern view that makes your own habit visible, using the existing history. For example, "You: rock 6, paper 3, scissors 3".

**Visual direction**
Keep it plain. The personality should come from the two hands meeting.

**Interaction improvements**
None needed beyond the reveal. Three tiles are the natural form.

**Recommended changes**
1. Add a simultaneous reveal beat.
2. Add a two-row history of you and the bot.

**Risk and complexity**
Low. Presentation only.

**Priority**
P3.

**Recommendation**
Keep as is, with one small reveal polish.

### 3. Two-Thirds Guess

**Current implementation**
Classic 5 rounds, you plus 8 simulated bots. Slider, "Lock in", then a number line with every pick, the two-thirds target and the arithmetic (`TwoThirdsBoard.tsx`).

**What works well**
- The number line is one of the best visual explanations in the library: you see the crowd, the target and your distance at once [B].
- Convergence is visible in the "Rounds so far" list.
- 22 and 15 do well in different rooms; no single number wins everywhere **[S]**.

**Weaknesses**
- **P0, hidden information leak [B].** In a mystery match the footer shows "The group: 5 × Shallow Thinkers" from round 1, while the panel below offers +3 Insight Points for guessing the crowd (`TwoThirdsBoard.tsx:67`, text `The group: 5 × {personality…}`).
- The dots also colour the majority type differently before the reveal [C/B], which gives the crowd away a second way.
- The score label "Bot rounds" is unclear [B].
- The slider stays on your last pick, which encourages repeating it.

**Missed opportunities**
Show how the target has moved across rounds on one shared line, not as a text list.

**Visual direction**
A live experiment: dots drop onto the line one after another, then the average and the target slide into place.

**Interaction improvements**
Drag directly on the number line instead of a separate slider **[H]**.

**Recommended changes**
1. Fix the leak: hide the crowd name and the dot colouring until the reveal.
2. Replace "Bot rounds".
3. Animate the reveal in sequence.
4. Plot a target trail across rounds.

**Risk and complexity**
The leak fix is very low risk. The rest is low to medium and presentation only.

**Priority**
P0 (leak), then P2.

**Recommendation**
Minor polish after the P0.

### 4a. The Ultimatum (classic)

**Current implementation**
Classic 6 rounds, roles swap, split 10 coins, offer 1–9, rejection pays nothing. Coin row, slider, Accept/Reject buttons and a round list (`UltimatumBoard.tsx`).

**What works well**
- The ten-coin row shows the split directly and fits at 360 px [B].
- The round list makes offers and responses easy to review.
- Offering 4 and rejecting lowballs beats most bots, while the Hardliner resists **[S]**.

**Weaknesses**
- Some bots are static. In one match the Maximizer offered 2, 2, 2 and accepted 4, 4, 4 [B], so the rounds repeat with nothing new to decide.
- Rejection is only a label and sentence. The stake isn't felt.
- It overlaps with The Ultimatum Game on the same tab.

**Missed opportunities**
Rejecting should visibly destroy the coins, because that is the whole tension of the game.

**Visual direction**
A pile of coins pushed across a table.

**Interaction improvements**
Tap or drag coins across a dividing line in place of the slider. Keep the +/− control for accessibility **[H]**.

**Recommended changes**
1. **Decide whether two Ultimatum games should exist.** This matters most.
2. Add a clear "deal burned" moment on rejection.
3. Try direct coin dragging.

**Risk and complexity**
Low for presentation. Merging or removing it is a product decision, and this game is in the Game of the Week rotation.

**Priority**
P2.

**Recommendation**
Moderate UX improvement, or merge. See 4b.

### 4b. The Ultimatum Game (Arena)

**Current implementation**
Arena, 4/6/8 rounds. Pools vary (8–20 tokens), offers 0–pool, walk-away values in the Outside Options variant. Token pool, slider, Accept/Reject tiles and a negotiation log (`UltimatumGameBoard.tsx`).

**What works well**
- Changing pools make each round a fresh decision.
- Walk-away values add a real bargaining idea that the classic game lacks.
- Accept and Reject tiles state what each person receives.

**Weaknesses**
- Offering 40% and rejecting anything under 40% wins 100 / 91 / 84% with no reading of the opponent **[S]**. Hard barely resists this.
- Every one of the 6 taps was out of view at 360×640 [B].
- Round results are text.

**Missed opportunities**
The walk-away value is the strategic core of the variant, and it has no visual weight. It could appear as a line drawn across the pool that an offer must clear.

**Visual direction**
Same table language as 4a, with the pool size visibly changing each round.

**Interaction improvements**
Divide the pool directly. Show the walk-away line while you choose.

**Recommended changes**
1. Keep the decision in view.
2. Show the walk-away line.
3. Review how Hard responds to a fixed 40% line.

**Risk and complexity**
Low for presentation, medium for bot tuning. Arena engines have no SQL port.

**Priority**
P2.

**Recommendation**
Moderate UX improvement. If only one Ultimatum survives, keep this design for practice and keep 4a only for competition.

### 5. Stag Hunt

**Current implementation**
Classic 8 rounds, stag 5/5, alone 0 vs hare 3, hare 3/3. Two tiles, a matrix, a "caught together" count and history (`StagHuntBoard.tsx`).

**What works well**
- It is very clear. The hints ("5 if the bot joins · 0 alone", "3 for sure") state the risk [B].
- The "Caught together: 3 of 8" line is the right measure of success [B].

**Weaknesses**
- Always hunting stag wins 0% and always taking hare wins 50%, because a mutual stag is a tie **[S]**. A match of perfect teamwork ends with "A draw".
- The theme exists only in two icons and some wording.
- 3 of 8 taps were out of view [B].

**Missed opportunities**
This is a game about trust and success together, so the result should lead with what you achieved together, not who "won".

**Visual direction**
Two hunters and one stag. If both commit, the stag falls. If not, it bolts and a hare remains.

**Interaction improvements**
Keep two choices. Trust is the whole decision.

**Recommended changes**
1. Lead the result with the hunts caught together.
2. Show each round as a small scene.

**Risk and complexity**
Low. Presentation only.

**Priority**
P1, for the framing.

**Recommendation**
Minor polish.

### 6. The Cooperation Game

**Current implementation**
Arena 6/10/14 rounds, payoffs 5/3/1/0 (with High Stakes and Noisy variants). Briefing, secret choice, reveal, then next round. Timeline of C/D cells, stats-rich results (`CooperationMatch.tsx`, `CoopResults.tsx`, `cooperation-analysis.ts`).

**What works well**
- It has the library's best round structure, with a distinct screen for deciding and for seeing the result. The action stayed in view [B].
- The timeline shows the relationship at a glance.
- Results compute real patterns: mutual cooperation, exploitation, "It returned your cooperation (3 of 4)" [B].
- Rules open in place without disturbing the round [C].

**Weaknesses**
- Always defecting wins 100% at every level, and always cooperating wins 0% **[S]**. `docs/ARENA.md` line 63 even says "always-defect never wins Cooperation", which contradicts both the engine and line 39 of the same file.
- It uses its own components and labels, such as "Rematch" and "Back to Games" where others say "Play again" and "Game library" [B/C], so it drifts from the rest of the library.
- Results are 1,930 px of mostly stats.

**Missed opportunities**
The timeline could show the relationship as a line of trust that rises and breaks, derived only from the moves.

**Visual direction**
Two people joined by a thread that strengthens with mutual cooperation and frays after betrayal. The existing Link and Unlink icons point this way.

**Interaction improvements**
Keep the cards. This is a good simple form.

**Recommended changes**
1. Change the headline when a win comes from betrayal. Show the score alongside what steady cooperation would have earned. The text already exists in the insights.
2. Correct `docs/ARENA.md`.
3. Bring labels in line with the other games.

**Risk and complexity**
Low. The framing is presentation only.

**Priority**
P1.

**Recommendation**
Minor polish. Study this round structure as a pattern for other games.

### 7. The Auction House

**Current implementation**
Arena 3/5/8 lots. Sealed-bid first-price, common value, private estimate ±u, four bidders, budget. Value range bar, slider, profit preview, ranked bid reveal, standings (`AuctionBoard.tsx`).

**What works well**
- **The winner's curse is real.** Bidding your raw estimate wins 8–10%, while shading it wins up to 56% and Hard pushes back **[S]**. This is the most authentic economics in the library.
- The reveal lists every bidder's estimate and bid, and it names the curse when it happens **[C]**.

**Weaknesses**
- **The slider starts at about the right answer.** It opens at the corrected value (`posteriorMean − 0.6u`, `AuctionBoard.tsx`). Tapping Bid without thinking wins 33–38% **[S]**, and the main lesson can be missed entirely **[H]**.
- It doesn't feel like an auction. It looks like a form [C].
- All 5 taps out of view, and action Y reaches 881 [B].
- Rival personalities barely change the player's win rate (30–40% across all four) **[S]**, so the mystery read has little to work with.
- Only the latest lot stays visible.

**Missed opportunities**
A running curse record: for each lot, the winner's estimate against the true value. All of this data exists.

**Visual direction**
An auction room. Paddles go up one by one in reveal order, highest last, then a hammer falls and the true value is unveiled.

**Interaction improvements**
Start the bid at the player's estimate, or at the low end, so choosing how far to shade is the decision.

**Recommended changes**
1. Stop pre-filling the answer.
2. Add a paddle-by-paddle reveal.
3. Keep a lot history.
4. Shorten the screen.

**Risk and complexity**
Medium. The reveal is new presentation. Changing the default will shift results, so re-check balance. Engine stays unchanged.

**Priority**
P1.

**Recommendation**
Significant presentation redesign. The mechanics are good.

### 8. The Market Rivals

**Current implementation**
Arena 5/8/12 rounds, three firms, logit demand, prices 4–20. Slider, projected-profit bar chart, projection table, round results with bars, season standings (`MarketBoard.tsx`).

**What works well**
- The profit curve is a genuinely useful, honest visual [B].
- Only real engine variables are shown.
- The "hollow win" benchmark correctly addresses a race to the bottom.

**Weaknesses**
- **One price wins.** Always charging 10 wins 96 / 90 / 92%, at every level and against every rival. Always charging 11 wins 36 / 0 / 0%, even though it earns *more* profit on Normal (1,149 vs 1,124) **[S]**. The game doesn't need reading, and the win condition sits on a knife edge.
- The opening slider value is 11 (cost + 5), the price that never wins on Normal or Hard **[S]**. In scripted play it lost 1,170 to 1,286 [B].
- The chart largely solves the round for you: find the tallest bar **[H]**.
- The tallest screen in play relative to its action: the button sits at Y 854–1035, every tap out of view [B].
- No price history, which is the essence of a market.

**Missed opportunities**
A chart of all three firms' prices across rounds would show a price war forming or a tacit truce holding. The data already exists.

**Visual direction**
A street of three shopfronts with price tags and customers flowing between them.

**Interaction improvements**
Keep the price control but move results into a compact shared chart, so the page doesn't grow.

**Recommended changes**
1. **Investigate the win condition and bot pricing** before redesigning.
2. Add a price history chart.
3. Fold the projection table away.

**Risk and complexity**
Medium to high for balance. Arena only, with no SQL. Layout is low risk.

**Priority**
P1.

**Recommendation**
Investigate mechanics before proposing redesign.

### 9. The Hidden Signal

**Current implementation**
Arena 4/8/12 rounds, roles alternate. Prior bar, signal card (Warn, Pitch, Stake), optional test, Invest/Pass tiles or three signal tiles, track record, venture log (`SignalBoard.tsx`).

**What works well**
- Each role states exactly what is known and hidden ("You're the investor — the truth is hidden") [B].
- The test updates the odds bar, which is a real inference tool [C].
- The venture log and record are among the better evidence displays.

**Weaknesses**
- It is the most text-heavy decision screen, with a tall page (938–1,410 px) and all 8 taps out of view [B].
- Always pitching and investing unless warned wins 82 / 68 / 73% **[S]**. Cheap talk isn't discounted enough, except by the Opportunist. Honest sending with no judgement loses about 90% **[S]**.
- The odds bar for the signal itself isn't shown: "prior + test, before the signal" leaves the key inference to you, which is fair, but there's nothing to help you do it [B/C].
- The identity is generic. Nothing feels like a venture or a signal.

**Missed opportunities**
A sender credibility record shown as a stack of past signals with their truth stamped on them. The numbers exist, as text.

**Visual direction**
A sealed envelope from the sender. Warn, Pitch and Stake look different (a stake has money clipped to it). The envelope opens on the reveal.

**Interaction improvements**
As investor, consider the signal and then invest by moving a chip onto the venture. Keep the two outcomes clear.

**Recommended changes**
1. Tighten the screen and fold the explanatory text.
2. Show the record visually.
3. Review how bots discount repeated pitches.

**Risk and complexity**
Medium for bot tuning. Layout is low risk.

**Priority**
P1.

**Recommendation**
Significant presentation redesign.

### 10. The Mole

**Current implementation**
Arena, 3/4/5 investigation rounds plus a final accusation. Four suspect cards with sightings, accusations and interrogation notes (`MoleBoard.tsx`). Exact Bayes helpers exist in the engine.

**What works well**
- The suspect cards are the interface. You choose by touching the person, and each card accumulates evidence [B].
- Hidden information is held correctly. I found no leak of the Mole in text scanned during play, and the personality stays hidden **[B/C]**.
- It teaches evidence weighing: exact probability wins 79%, a raw count 66–69%, and random 22–26% **[S]**.

**Weaknesses**
- **Difficulty and the Mole's style don't change who wins.** Exact Bayes is 79 / 79 / 79 and "most accused" 69 / 69 / 67, with almost no change across the four styles **[S]**. The stated difficulty lever ("how well the Mole blends in") has little effect.
- **The evidence for the personality guess isn't on screen.** The panel says to watch "who each suspect accused, round after round", but the board keeps only totals and the last round [B/C].
- Interrogation has no cost or trade-off [C].
- The cards use emoji (📷 👉 🗒), unlike the rest of the app's icon set, and these render differently per platform [B/C].
- It has no sense of a room or of suspects as characters.

**Missed opportunities**
An accusation web: arrows between the four suspects, kept across rounds. This is the natural visual for the game, uses only public data, and would finally make the style readable.

**Visual direction**
A corkboard: four photos, strings for accusations, and camera stills pinned next to the people caught.

**Interaction improvements**
Let the player tag suspicions on each card, and later compare them to the reveal.

**Recommended changes**
1. Add an accusation timeline or web.
2. Replace emoji with app icons.
3. Investigate whether difficulty should affect the evidence.

**Risk and complexity**
Low to medium for the visual. Medium for mechanics.

**Priority**
P1.

**Recommendation**
Moderate UX improvement.

### 11. The Commons

**Current implementation**
Arena 6/8/10 rounds, four boats, logistic regrowth, collapse below 10. Animated lake with fish, best-regrowth line, boat cards, request stepper, catch summary (`CommonsBoard.tsx`).

**What works well**
- **The lake is one of the best visuals in the library:** water height is the real stock, the dashed line is a real threshold, and it animates [B].
- Collapse is real and shared: taking 10 always destroys the lake, and taking 7 does so 76–100% of the time **[S]**.

**Weaknesses**
- **The advice and the win disagree.** The screen says "3–4 each keeps the lake going" and starts the stepper at 3. On Normal, taking 3 wins 23% while taking 5 wins 98% **[S]**. There's a design reason (you shouldn't finish last), but a player following the advice sees repeated draws.
- On Hard the lake can die without you: taking 0 still collapses it 24% of the time **[S]**, so some losses aren't yours.
- All 8 taps out of view, because the lake and boat cards fill the screen first [B].
- No history of the lake, even though its trend is the story of the game.
- Only the last round's requests are visible.
- The screen-reader label for regrowth always uses the standard rate, even in Fragile lake (`CommonsBoard.tsx`, `regrow('standard', lake)`) [C].

**Missed opportunities**
A small lake-level line over rounds, plus a row of each boat's requests over rounds. That would let you see who started grabbing.

**Visual direction**
Keep the lake. Fish leave the water as a visible catch and go to each boat. Regrowth appears as new fish.

**Interaction improvements**
Drag a net or drag fish towards your boat in place of the stepper **[H]**. Keep the stepper for accessibility.

**Recommended changes**
1. Shrink the lake and bring the control into view.
2. Add level and request history.
3. Align the advice with the win rule, or explain the gap.
4. Fix the Fragile accessibility label.

**Risk and complexity**
Low to medium.

**Priority**
P1.

**Recommendation**
Moderate UX improvement.

### 12. The Coalition

**Current implementation**
Arena 4/8/12 rounds. Seats 34/28/22/16 dealt at random, rotating proposer, majority 51, split 12 points, all members must accept. Party rows with bars, chips to invite, steppers for offers, vote reveal (`CoalitionBoard.tsx`).

**What works well**
- Building a bill is real interaction: choose partners, set shares, watch your total [B/C].
- The rules are a good model of pivotal power (seats aren't power).
- A proportional split starts as a helpful default.

**Weaknesses**
- **It isn't negotiation.** Proposals are one-shot and take-it-or-leave-it [C]. If that's the design, the name and pitch should say so.
- **Relationships don't show.** Only the latest round remains, so you can't see alliances form or shift [B/C].
- The bar to 51 has no marker at the majority [C].
- Fair-split, accept-all play wins 17 / 18 / 22%, near the one-in-four chance baseline, and Hard is no harder than Easy **[S]**. This needs a stronger simulated player before drawing conclusions, as it may partly reflect a weak test strategy.
- All 11 taps out of view [B].

**Missed opportunities**
A hemicycle of 100 seats, coloured by party, with a marker at 51. Add a relationship matrix showing who has passed bills with whom, from the public record.

**Visual direction**
A parliament chamber: seats light up as you add partners, and pass when the bloc crosses the line.

**Interaction improvements**
Tap a party's block in the chamber to invite it, then drag the prize between members.

**Recommended changes**
1. Add a chamber with a majority line.
2. Add alliance history.
3. Compress the builder.
4. Test Hard bots with a better player.

**Risk and complexity**
Medium. The builder needs care because of its many states.

**Priority**
P1.

**Recommendation**
Significant presentation redesign.

### 13. The Inspector

**Current implementation**
Arena 6/8/10 rounds, roles alternate. Comply/Cut or Inspect/Trust, with a rubber-stamp result and audit log (`InspectorBoard.tsx`).

**What works well**
- **Best balance in the library.** The equilibrium mix wins 48 / 44 / 40%, and reading pays: comply-and-inspect beats the Risk Taker 99% **[S]**. Pure strategies fail against the right opponent.
- The stamp ("VIOLATION FOUND") is a small, memorable consequence [C/B].
- Two tiles with honest payoffs fit on screen: 1 of 8 taps out of view [B].

**Weaknesses**
- The audit log relies on emoji and a colour legend [C].
- Role changes are stated only in a small overline, and a player could miss them [B].

**Missed opportunities**
Make the role switch a clear moment: the screen changes from "filing a report" to "reviewing a report".

**Visual direction**
A clipboard form as operator, a magnifying glass over the form as inspector, a stamp landing to end the round.

**Interaction improvements**
Keep two choices. They are the mechanic.

**Recommended changes**
1. Stronger role change.
2. Replace emoji in the log.

**Risk and complexity**
Low.

**Priority**
P3.

**Recommendation**
Keep as is, with minor polish.

### 14. The Traveler's Dilemma

**Current implementation**
Arena 6/8/10 rounds. Claims 2–20, pay the lower claim, ±2 bonus. Slider, what-if payoffs, luggage tag reveal, claim bar chart (`TravelersBoard.tsx`).

**What works well**
- **The what-if line shows the dilemma before you act:** if they match, if one less, if one more [C/B].
- The claim chart makes a race to the bottom visible.
- The luggage tags are a light, fitting identity.
- The 60% win rule properly makes a race to the bottom hollow: always claiming 2 only ever draws **[S]**.

**Weaknesses**
- The Game-Theory Purist plays the minimum on Hard, whatever you do, so you can't win (0–8% at all levels) and later rounds offer little to do [C/S].
- Most taps (7 of 8) sit below the fold once the reveal appears [B].

**Missed opportunities**
A simple ladder that steps down as claims fall, making the unravelling physical.

**Visual direction**
Keep the tags. A staircase from 20 to 2 with both travellers' markers.

**Interaction improvements**
Drag your marker on the staircase in place of the slider **[H]**.

**Recommended changes**
1. Keep the decision on screen.
2. Consider a short match ending or message once a purist's pattern is obvious.

**Risk and complexity**
Low.

**Priority**
P2.

**Recommendation**
Minor polish.

### 15. The Saboteur

**Current implementation**
Arena 4/5/6 missions plus an accusation. Leader benches one bot, secret energy cards, only totals shown. Mission track, crew record, energy stepper (`SaboteurBoard.tsx`).

**What works well**
- It preserves secrecy correctly: "You played 3. The other two added 4 together — cards stay hidden" [C].
- The evidence works: using suspicion counts finds the saboteur 75–88% of the time against 33% for guessing **[S]**.
- The mission track reads at a glance.
- The final reveal shows the saboteur's cards, and that's a satisfying "aha" [C].

**Weaknesses**
- It has low suspense: results appear immediately as a total [C].
- The comment says the current mission "pulses", but no pulse is implemented (`SaboteurBoard.tsx`) [C].
- Energy budgeting has little presence on screen.
- The page is tall: 1,001 px at the first decision, with 6 of 9 taps out of view [B].

**Missed opportunities**
Add each bot's mission history as a grid of bot against mission, marked with outcomes. This uses only public data.

**Visual direction**
A mission console: energy bars fill as cards flip face down, then the total climbs slowly toward the target, and may fall short.

**Interaction improvements**
Choose a card from a hand of 0–3 and jam-style cards in place of a stepper. A count-up reveal gives the tension the game lacks.

**Recommended changes**
1. Add a count-up reveal.
2. Add a crew-by-mission grid.
3. Replace the stepper with a card choice.

**Risk and complexity**
Low to medium. The grid must keep cards hidden.

**Priority**
P2.

**Recommendation**
Moderate UX improvement.

### 16. Bluff

**Current implementation**
Arena 6/8/10 rounds. Draw tokens, press for more at a 15% Crack risk, claim a value, believe or call. Token chips, stepper, Believe/Call buttons with stakes (`BluffBoard.tsx`).

**What works well**
- It has a clear moment of tension: a big number, hidden tokens, two buttons [B].
- The hint (average, maximum) helps you judge without giving the answer away [B].
- The token flip on reveal suits the game.

**Weaknesses**
- **There's no record of past claims.** The coach tip says to compare what it claimed with what it held, but each round replaces the last [B/C]. This is the clearest example of the library's memory problem.
- Always calling beats two of the four bots 96–100% at every level **[S]**.
- Honest play with sensible calling wins 64 / 65 / 77%, so Hard is easier for this strategy **[S]**.
- Believe and Call are styled unequally: Call is the primary button, which may nudge the choice **[B/H]**.

**Missed opportunities**
A claim-versus-truth strip, one small bar pair per round, would show who lies, by how much and how often.

**Visual direction**
Face-down tokens on a felt surface, with the claim spoken aloud on a card. A call flips them in sequence.

**Interaction improvements**
Press your luck by physically drawing from a bag. Set the claim with a dial. Make Believe and Call equally weighted.

**Recommended changes**
1. Add a claim history.
2. Balance the two buttons' styling.
3. Review how bots bluff when called constantly.

**Risk and complexity**
Low for the UI, medium for bot tuning.

**Priority**
P1.

**Recommendation**
Moderate UX improvement.

### 17. The Defusal

**Current implementation**
Arena, cooperative, 5/6/7 wires with 2 live. Private clues, alternating share and cut. Wire list, clue cards, cut button (`DefusalBoard.tsx`).

**What works well**
- The asymmetric information idea is original and fits the concept.
- Cooperative framing is honest: shared result, no fake winner.
- Clues are logically sound and the fuse creates pressure.

**Weaknesses**
- **Zero-information clues.** "Both live wires are among 1–6" on six wires rules out nothing [B]. Measured share of hands with at least one: 4–22%, depending on setup (6% on standard Hard, where you hold only two clues) **[S]**.
- **The black wire is almost invisible** (`#1E293B` on a dark panel) [B].
- **You do the logic in your head.** Clues sit below the wires and you must scroll between them on a 1,164–1,426 px page, with nowhere to mark a conclusion [B].
- **The teammate often decides the result.** With perfect logic from the player, the teammate cuts a live wire 3 / 11 / 24% of matches against 1 / 3 / 11% for the player. Hard succeeds only 65% overall and 45% with the Bold Solver **[S]**.
- A standard match is only about 4 turns: you cut about 2 wires and share about 2 clues **[S]**. It may feel over too quickly **[H]**.
- It has little urgency: the fuse is a number.

**Missed opportunities**
A deduction grid: a row per wire, tap to mark safe, live or unknown. This turns a text puzzle into a real interface and is the highest-value change in the game.

**Visual direction**
A bomb panel with thick physical wires and a burning fuse. Your notes appear beside each wire.

**Interaction improvements**
Cut by tapping the wire, with a press-and-hold to confirm, since a mistake ends everything. Share a clue by dragging it to the teammate.

**Recommended changes**
1. Filter tautological clues. Fix the black wire.
2. Add a deduction grid beside the wires.
3. Keep clues and wires on one screen.
4. Revisit how often the teammate gambles, or show its uncertainty.

**Risk and complexity**
Clue filter and colour are low risk. The grid is medium. Clue changes shift balance, so re-run the tests.

**Priority**
P0 (zero-information clue and invisible wire), then P1.

**Recommendation**
Significant presentation redesign.

### 18. The Power Play

**Current implementation**
Arena 8/12/16 turns. A 12-card deck with four roles, two cards each, 2 starting coins, claim to act, challenge or block, first to 10 coins or the other side's last card. Face-down cards, action buttons, allow/challenge prompts (`PowerPlayBoard.tsx`).

**What works well**
- A well-known bluffing structure, with real tension around challenges.
- Your hand and the hidden cards are visually clear [B].
- It marks each action as true or a bluff from your hand, which makes bluffing understandable [B].

**Weaknesses**
- **The Treasury race dominates.** Starting at 2, three unchallenged Treasuries reach 11, ending the game on turn 5 of "12" [B]. Always claiming Treasury and never challenging wins 49 / 42 / 43%. Income-only wins about 10%, and always stealing 12–15% **[S]**. Steal and Foresight rarely matter.
- Difficulty is nearly flat **[S]**.
- "Turn 1 of 12" sets the wrong expectation: matches averaged about 6 turns with an always-Treasury player, and 8–9 even with Income only **[S]**.
- **Bluff options look disabled.** The ghost button style makes the bluff feel unavailable, which works against a game about bluffing [B].
- No claim history, though the advice is to count cards [B/C].
- Button labels wrap awkwardly at 360 px, with a stray tick on its own line [B].

**Missed opportunities**
A public record of claims and face-up cards, shown as three slots per role. Card counting then becomes a visual game.

**Visual direction**
Cards on a table with a coin pile moving towards 10. A challenge is a moment: the card turns over slowly.

**Interaction improvements**
Choose actions from cards that represent the roles, and style a bluff action equally to a true one.

**Recommended changes**
1. **Investigate the coin economy** (Treasury +3, win at 10, start 2) before any redesign.
2. Add a role-count display.
3. Restyle bluff actions.

**Risk and complexity**
Medium to high for balance. Arena only.

**Priority**
P1.

**Recommendation**
Investigate mechanics before proposing redesign.

### 19. The Last Stand

**Current implementation**
Arena, cooperative, 6/8/10 rounds. Six districts on a ring, fire levels 0–3, water supply, teammate announces first, you douse, firebreak or refill. Map with fire icons, water bar, radio line (`LastStandBoard.tsx`).

**What works well**
- **A real map you touch** [B]. The state is readable at a glance from colour and flames.
- **The teammate announces first,** and the planned district is outlined on the map, so coordination is part of the mechanic [C].
- Each round forces a true priority decision.
- It communicates "pressure" better than any other game, and a failure can happen by round 3 [B].

**Weaknesses**
- **Adjacency is faint.** The ring that explains how fire spreads is barely visible [B], though spread is the main thing to reason about.
- It doesn't preview where fire will spread.
- Three teammates are far stronger than the fourth. A sensible player holds 94% with most but 51% with the Resource Guardian on Normal, and 14% on Hard **[S]**.
- On Easy, doing nothing but refilling succeeds 79% **[S]**.
- Two steps to act (mode, then district).
- 3 of 6 taps out of view [B].

**Missed opportunities**
Show arrows on the map for spread that will occur if nothing changes. This follows from the existing rules and hides nothing in the future, except ignitions.

**Visual direction**
Keep the map. Connect districts with clear roads and animate the spread between them.

**Interaction improvements**
Tap a district first, then choose the action there, in one step.

**Recommended changes**
1. Clear adjacency lines and spread preview.
2. Merge the action steps.
3. Rebalance the Guardian.

**Risk and complexity**
Low for the visuals. Medium for teammate tuning.

**Priority**
P2.

**Recommendation**
Minor polish. Protect what works here.

### 20. Liar's Dice

**Current implementation**
Arena, 3/4/5 dice per side, no wilds. Hidden cups, face picker, quantity stepper, Liar! button, all dice revealed with matches highlighted (`LiarsDiceBoard.tsx`).

**What works well**
- It looks like the real game: real dice, hidden cup, a big current bid [B].
- The reveal highlights the bid face and states the count, which is the most satisfying reveal in the library [C/B].
- Elimination gives clear stakes.

**Weaknesses**
- **Never calling "Liar!" wins 52 / 83 / 54%.** Against the Conservative Challenger it wins 96–98% **[S]**. Careful play that calls below 50% wins only 43 / 44 / 22% **[S]**. On Normal, bots assume your dice are random and don't read your bids (`pTrue`, `liars-dice.ts`) **[C]**, so bidding your own best face is safe. A game about calling liars rewards never calling.
- All 11 taps out of view, with action Y up to 959 [B].
- At 320 px some controls extend past the edge [B].
- Bid history in the round is reduced to a count (4 bids this round) [B].
- The debrief reads "you called 1 twos" [B].
- No probability helper.

**Missed opportunities**
A bid ladder for the round. An optional helper: how many more dice would need to match, from your own cup and the unknown count.

**Visual direction**
Real cups that lift on the call, with dice sorting into matching and non-matching.

**Interaction improvements**
Tap a die to choose the face and tap a quantity directly. Make "Liar!" a distinctly separate, weighty action.

**Recommended changes**
1. **Have bots read bids on Normal,** then re-test.
2. Compact the layout so the bid control stays visible.
3. Add a bid ladder.
4. Fix the 320 px face row and the "1 twos" text.

**Risk and complexity**
Medium for bot changes. Arena only. Layout is low risk.

**Priority**
P1.

**Recommendation**
Investigate mechanics before proposing redesign. The presentation is strong.

### 21. The Codebreaker

**Current implementation**
Arena 4/6/8 rounds, cooperative, 3×3 word grid, 3 targets, trap, one theme from 12 and a number. Word association via a fixed table (`CodebreakerBoard.tsx`, `codebreaker.ts`).

**What works well**
- A clean, focused board where you tap the words themselves [B].
- It's the most natural mobile interaction after The Gambit.
- The risk of stopping or continuing is real: taking every guess beats stopping after one (70–78% vs 45–53%) **[S]**.
- Role swaps show both sides of communication.

**Weaknesses**
- **The name promises something else.** It plays like Codenames, not codebreaking. The brief itself expected symbols and candidate combinations **[H]**.
- **Word links are opaque.** The bot's reasoning comes from a hidden strength table; a clue like WAR 1 with Dragon, Castle and Crown has several reasonable answers [B]. Players may feel a miss is arbitrary **[H]**.
- Clues come from a fixed list of 12 themes, narrowing the expression that the game is about.
- Only the last board remains visible.

**Missed opportunities**
After each round, show why the bot linked its picks. The data exists in `ASSOC`, and it would turn an arbitrary-feeling miss into something you learn from.

**Visual direction**
Keep the card grid and add a clear reveal for target, neutral and trap. If the name stays, lean into a "cipher desk" look. Or rename the game.

**Interaction improvements**
Mark words as "probably" before committing. Tap to reveal.

**Recommended changes**
1. Decide on the name.
2. Explain word links after each round.
3. Add light pre-commit marking.

**Risk and complexity**
Low. Renaming touches catalog text and possibly saved records' display only.

**Priority**
P2.

**Recommendation**
Minor polish.

### 22. The Gambit

**Current implementation**
Arena 10/14/18 turns, 5×6 board, three pieces each. Step (always), Dash 50%, Strike 55%, first to bring two home (`GambitBoard.tsx`, `gambit.ts`).

**What works well**
- **The board is the interface.** You touch a piece and see its options with odds printed on the squares. There are no separate buttons [B/C].
- **Risk is priced at the moment of choice.** "✓", "50%" and "55%" are on the target squares.
- **Skill shows.** Random play wins 4–8%, one simple plan up to 58%, and Hard drops that to 20% **[S]**. No other game has so clear a curve.
- **Personalities can be observed** in the bot's moves, and the concept is summed up well: "Judge a move by its odds, not by how it turned out".
- **It uses space well:** nearly every pixel on the first screen is the game.

Patterns worth reusing: tap-a-thing then tap-a-target, odds shown in place, one object as the whole game, and a debrief focused on decision quality rather than outcome.

**Weaknesses**
- **P0 soft-lock [S/C].** Pieces can be boxed in with no legal move. Measured at about 0.04–0.05% under random or dash-first play. There's no pass in the UI, so the only way out is Back. Example: your lone piece on A2 with enemies on A3 and B2.
- **Pieces don't move.** They vanish and zoom in on the new square (`key` based on position). You rely on text to see what the bot did [C/B].
- The board shifts vertically each turn as the reveal panel changes height, moving targets under your finger [B].
- 13 of 20 taps out of view at 360×640 [B].
- No running count of risky moves, although the personality guess asks you to judge "how often it chose the risky move" [B].
- The debrief says "a 50% move doesn't fail often, but it does". A 50% move fails half the time (`gambit.ts`) [C].

**Missed opportunities**
A running tally of risky and safe moves for each side, and a visible expected-value lesson: odds taken against results.

**Visual direction**
Slide pieces. Show a dash attempt as a leap that lands or falls short, and a strike as a clash with a visible coin flip.

**Interaction improvements**
Already the best. Show a clearer last-move marker for the bot's piece.

**Recommended changes**
1. Fix the soft-lock (skip the turn, or end the match by the turn-limit rule).
2. Correct the debrief text.
3. Stabilise the board position.
4. Animate piece movement.
5. Add a risk tally.

**Risk and complexity**
The soft-lock needs an engine rule plus a test. Animation is medium risk, because of Reanimated and pieces being keyed by position.

**Priority**
P0 (soft-lock), then P2.

**Recommendation**
Minor polish. Use this as a pattern, not a template.

---

## Section D: Cross-game design system audit

### Two separate systems

The classic and Arena games grew separately. Some of the differences are justified: classic games run on the server. Most of what the player sees isn't.

| Area | Classic | Arena | Justified? |
|---|---|---|---|
| Score | `ScoreBar` | `ScoreStrip` (Cooperation has its own) | No |
| Move button | `MoveTile` | `ActionTile`, or a plain `Button` | No |
| Panel | `parts.Panel` | `kit.Panel` | No |
| Result | `ResultPanel` | `ArenaResult`, `CoopResults` | Partly: share and invite are classic only |
| Guess | `ReadOpponentPanel`: locks once, earns Insight Points | `ReadPanel`: changeable, no points | **No. The same feature follows opposite rules.** |
| Difficulty names | Easy, Medium, Hard | Easy, Normal, Hard | No |
| Opponent | "the bot" | "your opponent" | No |
| Rematch | "Play again" | "Play again", or "Rematch" in Cooperation | No |
| Scroll to result | Doesn't scroll | Scrolls once | No |

### Shared components worth improving

- **One decision shell.** It should keep the current decision on screen, and collapse the latest reveal. The Cooperation Game's separate decide and reveal views are the proven model.
- **One reveal primitive.** Most games need the same beat: hide, pause, show both sides, show the consequence. Today this ranges from none to a short zoom. Use a single, reduced-motion-aware component, with visuals per game.
- **One match log.** A small shared container for a compact per-game history strip. The content stays specific to each game.
- **One guess panel** with one set of rules.
- **One results order:** outcome, reveal, one thought, next action. Move the finished board out of the way.

### Evidence memory

The personality guess depends on evidence the UI often removes.

| The board keeps history | The board shows only the latest round |
|---|---|
| Cooperation, Signal, Inspector, Traveler's, Saboteur, Ultimatum Game, all 5 classic games | Bluff, Power Play, Liar's Dice, Market, Auction, Commons, Coalition, Mole (totals only), Gambit, Last Stand, Codebreaker |

The Defusal is a partial case: it marks cut wires and keeps shared clues, but holds no turn-by-turn record. It isn't counted in either column.

### Patterns that should stay game-specific

- The main object of each game: lake, map, dice, wire panel, board.
- Reveal content. Bluff's token flip and Inspector's stamp should stay unique.
- Direct-touch interactions. The right gesture differs for each game.
- The tint of each game.

### Inconsistencies to fix

- `app/(tabs)/games.tsx:62` says "Ten strategic games"; there are 23. `docs/ARENA.md` line 63 is wrong (see game 6), and `src/arena/core.ts` line 5 says "five deeper" games.
- Emoji icons in The Mole and The Inspector, against Lucide icons everywhere else.
- `ZoomIn` in Bluff's judge view ignores reduced motion (`BluffBoard.tsx`) [C].
- A dev-only web warning, "React does not recognize the `im…`", appears on Liar's Dice [B]. It's most likely `importantForAccessibility` passed through `Die`'s SVG **[H]**.
- A require cycle between `cooperation.ts` and `cooperation-analysis.ts` is reported by Metro [B].

### Other gaps [C]

- **No match recovery in the Arena or in classic practice.** State lives in `useState`. A reload or crash loses the match.
- **No confirmation on leaving.** No game screen uses `beforeRemove` or `usePreventRemove`. Leaving silently ends the match, and only a screen-reader label on Cooperation's Back button mentions it.
- **No sound in any game.** Haptics are present but unverified on a device.
- **The Arena setup screen hides Play** under about two and a half screens of options (Y 1536 of 1,821), even for a player who wants the default.
- **The Games tab is 5,125 px with no grouping or filter.** Every game looks equally new.

### Post-game reflection

"A thought to take with you" works well: it's specific to the match, collapsed by default, and doesn't give away the best strategy. Examples from the run [B]:

- *"Your opponent stole in round 6, and you split anyway in round 7. Was that a second chance, or a bet that the steal wouldn't repeat?"*
- *"You charged the highest price in 4 of 8 rounds. Were you holding out for margin, or hoping rivals would come up to meet you?"*

Remaining issues:

- **Position.** It starts at Y 1,120–1,772 on a 640 px screen, under the finished board plus the outcome, evidence and debrief cards.
- **Three lessons compete** on one screen: takeaway or debrief insight, opponent evidence, and the thought. Classic has a takeaway; Arena has a debrief. The brief asks not to turn results into lectures.
- **Lesson links are missing** for The Defusal, The Power Play, The Last Stand and The Gambit (`lesson: null` in `src/reflections/library.ts`) [C]. This may be right if no lesson fits; it's worth a deliberate decision.
- **Some fallbacks are generic.** One Power Play match got a general thought rather than a match-specific one [B]: "A challenge is also a decision under uncertainty."

### Opportunities to simplify

- Merge `MoveTile` and `ActionTile`, the two `Panel`s, and `ScoreBar` and `ScoreStrip`.
- Reduce to one Ultimatum game, or clearly differentiate the two.
- Split or Steal and The Cooperation Game are also close to each other. Split or Steal could be the quick version, leaving depth to Cooperation.

---

## Section E: The 10 highest-value improvements

Ranked by value, not visual excitement. Effort: S = days, M = 1–2 weeks, L = more. Impact on engagement is a hypothesis until tested.

### 1. Fix the correctness bundle

- **Games:** Two-Thirds, The Gambit, The Defusal, Liar's Dice, Games tab.
- **Problem:** Leaked hidden information, a possible soft-lock, empty clues, an invisible wire, wrong text.
- **Experience:** Mystery means mystery, no match can get stuck, every clue says something, every wire can be seen.
- **Why better:** It removes cases where the game is simply wrong and protects trust in the Insight Points.
- **Effort:** S.
- **Impact:** High. Low risk.

### 2. Keep the decision on screen

- **Games:** Market, Commons, Coalition, Auction, Ultimatum Game, Signal, Liar's Dice, Power Play, Traveler's, Gambit, Saboteur.
- **Problem:** The board grows and the action moves out of view, most severely in the eight games with every tap out of view.
- **Experience:** A compact one-line result, tap to expand, with the current decision always reachable. Stable board position in The Gambit.
- **Why better:** Less scrolling each round; the eye stays on the game. Cooperation shows it works.
- **Effort:** M. One shared pattern, then per-game tuning.
- **Impact:** High across 11 games.

### 3. Add a game-specific evidence log

- **Games:** Bluff, Power Play, Liar's Dice, Mole, Auction, Commons, Coalition, Gambit, Market, Last Stand, Codebreaker.
- **Problem:** The core loop asks you to read an opponent, then removes the evidence.
- **Experience:** Bluff's claim-vs-truth strip; Mole's accusation web; Power Play's role count; Gambit's risk tally; Liar's Dice's bid ladder. Each uses only public history.
- **Why better:** Reading becomes play rather than memorising. It also addresses the brief's "personalization" goal without inventing any metrics.
- **Effort:** M. A shared container with bespoke content.
- **Impact:** High.

### 4. Reframe shared-outcome results

- **Games:** Split or Steal, The Cooperation Game, Stag Hunt.
- **Problem:** Betrayal gets the trophy, and perfect teamwork gets "A draw".
- **Experience:** "You 50 · Bot 34, and 10 rounds of mutual split would have paid 50 each." For Stag Hunt: "You caught 6 stags together."
- **Why better:** The result finally teaches the concept. No rule, score or SQL changes.
- **Effort:** S.
- **Impact:** High. It's core to the product's purpose.

### 5. Run a balance pass on four exposed games

- **Games:** Market, Liar's Dice, Power Play, and Bluff or Signal.
- **Problem:** A fixed plan wins too much: price 10, never call, always Treasury, always call.
- **Experience:** Reading and adapting pays. Hard is actually harder.
- **Why better:** Without this, better visuals make a solved game look better.
- **Effort:** M to L. Arena only, with no SQL. Needs a decision per game and regression tests.
- **Impact:** High for players who replay.

### 6. Defusal deduction board

- **Games:** The Defusal.
- **Problem:** Logic happens in your head while you scroll between clues and wires.
- **Experience:** Wires and clues on one screen, with marks for safe, live and unknown on each wire.
- **Why better:** The puzzle becomes a real interaction, and the idea of the game finally comes through.
- **Effort:** M.
- **Impact:** High for this game, one of the weakest today.

### 7. Trend views for Market and Commons

- **Games:** The Market Rivals, The Commons.
- **Problem:** These games are stories over time, shown one round at a time.
- **Experience:** A three-line price chart; a lake-level line with who took what.
- **Why better:** Price wars and depletion become visible as they form.
- **Effort:** S to M. The data already exists.
- **Impact:** Medium to high.

### 8. A real reveal moment

- **Games:** All simultaneous games, especially Split or Steal, Stag Hunt, Auction, Saboteur, RPS and Inspector.
- **Problem:** Outcomes appear immediately, with little anticipation.
- **Experience:** Auction paddles rise in order, the Saboteur's total counts up toward the target, choices turn over together. Add sound later.
- **Why better:** Repeat games depend on the moment before you find out **[H]**.
- **Effort:** M. A shared primitive plus per-game content.
- **Impact:** Medium to high.

### 9. Coalition chamber

- **Games:** The Coalition.
- **Problem:** A game about alliances is a list of bars with no majority line.
- **Experience:** A hemicycle with a marker at 51, where you tap parties to form a bloc, and a record of who has allied with whom.
- **Why better:** Power and shifting alliances become visible.
- **Effort:** M.
- **Impact:** Medium.

### 10. Unify the two systems

- **Games:** All.
- **Problem:** The same feature follows different rules and names. Results bury the thought. Leaving silently ends a match.
- **Experience:** One guess rule, one vocabulary, one results order, a short leave confirmation, and a one-tap "Play mystery" near the top of setup.
- **Why better:** A single coherent product, and less code.
- **Effort:** M to L.
- **Impact:** Medium, but compounding.

---

## Section F: Games that should remain simple

Adding interaction to these would add complexity without benefit. Their simple choice **is** the strategic situation.

- **Rock, Paper, Scissors.** Three throws. Don't add a board. A small reveal is enough.
- **Split or Steal.** Two choices are the point. Add framing and a reveal, not interactions.
- **Stag Hunt.** Same. The whole game is whether you trust your partner.
- **The Inspector.** Two choices in each role. It has the best balance in the library, and its simplicity is part of why you can reason about it.
- **The Cooperation Game.** Keep the two cards. Improve the framing only.
- **The Traveler's Dilemma.** One number. The slider is fine; a staircase is optional.
- **The Codebreaker.** Tapping words is already the natural form. Don't build a code-cracking interface unless you choose to rename and redesign the game on purpose.

Do **not** chase these:

- A negotiation chat in The Coalition. It would need new rules and bot behaviour.
- Physics for dice or fish. Clear state changes matter more.
- A different look per game beyond its tint and central object. The shared Tactiqo identity works: navy surfaces, blue for you, orange for the rival.

---

## Section G: Recommended implementation roadmap

Each phase can ship by itself. Nothing below has been started.

### Phase 1: Correctness and honest outcomes

- Hide the Two-Thirds crowd and dot colours until the reveal.
- Resolve The Gambit's no-legal-move state. Add a test.
- Remove tautological Defusal clues. Make the black wire visible. Re-run balance.
- Correct text: Games tab count, "doesn't fail often", "1 twos", the Fragile lake label, `docs/ARENA.md`.
- Fix the Liar's Dice face row at 320 px.
- Reframe results in Split or Steal, Cooperation and Stag Hunt (presentation only; no SQL change).
- Decide whether to keep both Ultimatum games.

### Phase 2: Investigate balance, then decide

Do this before investing in visuals for these games:

- Market win condition and bot pricing.
- Liar's Dice bots reading bids on Normal.
- Power Play coin economy.
- Bluff and Signal bots against constant calling or pitching.
- Why Hard isn't harder in Coalition, Bluff, Mole and Power Play.
- Test with a stronger simulated player, then with real people.

**Stop for a decision after this phase:** which of these mechanics change?

### Phase 3: Shared interaction foundations

- The decision-on-screen pattern, starting with The Market Rivals and Liar's Dice.
- The evidence-log container, with Bluff, Mole and Gambit first.
- A shared reveal primitive.
- A leave confirmation.

### Phase 4: High-impact game-specific work

In this order: Defusal deduction board, Market and Commons trends, Auction reveal and starting bid, Coalition chamber, Hidden Signal screen, Liar's Dice cups and ladder, Power Play role counts.

### Phase 5: System cleanup and optional polish

- Merge duplicate components and vocabulary, and unify the guess rules.
- Results order and shorter Arena setup.
- Games tab grouping.
- Gambit movement animation.
- Sound, only after testing on devices.
- Android verification should happen throughout, and must happen **before** any animation work is called done.

### Testing needed that this audit couldn't do

- Android device pass over all 23 games.
- Five or six people playing, to replace the engagement hypotheses here with real observation.
- Screen reader pass on the board-based games (Gambit, Last Stand, Mole).

---

## Appendix: Supporting data

| File | Contents |
|---|---|
| [`balance-simulation-output.txt`](game-ux-audit/balance-simulation-output.txt) | Win/draw/loss for every fixed strategy, level and opponent |
| [`balance-simulation-script.txt`](game-ux-audit/balance-simulation-script.txt) | The strategies, kept as text so they aren't compiled with the app |
| [`gambit-stuck-probe.txt`](game-ux-audit/gambit-stuck-probe.txt) | The Gambit no-legal-move search: 22 stuck matches in 72,000, across the three strategies tried |
| [`defusal-clue-probe.txt`](game-ux-audit/defusal-clue-probe.txt) | The Defusal zero-information clue measurement |
