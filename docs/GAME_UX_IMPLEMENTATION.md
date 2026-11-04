# Tactiqo game library: implementation report

Started from `main` at `d3e82c6`, the commit the audit used. Nothing is committed. `docs/GAME_UX_AUDIT.md` stays as the historical audit. Data and scripts are in [`docs/game-ux-audit/`](game-ux-audit/).

## Where this stands

- **Done:** Phases 1, 3, 4 and 5, plus the bot-only part of Phase 2.
- **Waiting for your decision:** three rule changes (see [Decisions needed](#decisions-needed)). None has been applied.
- **Not done:** Android verification (no SDK or device here) and a human play test. See [Android checklist](#android-verification-checklist).

## Checks

| Check | Before | After |
|---|---|---:|
| `npm test` | 1,139 passed | **1,181 passed, 0 failed** |
| `npx expo lint` | No errors | No errors or warnings |
| `npx tsc --noEmit` | 4 errors, all in `supabase/functions/text-to-speech/index.ts` | The same 4, nothing new |
| SQL and classic engines | | **Unchanged.** No file in `supabase/` or the classic rule files (`rps`, `split-steal`, `stag-hunt`, `two-thirds`, `ultimatum`) was touched |

## Mobile results

Measured in the web preview at 360×640 with scripted taps, from the top of the page. Coach tips were not showing in this run, because the first-time flag was already set. A first-time player sees one extra tip, about 50 px tall.

| | Audit | Now |
|---|---:|---:|
| Games with most taps out of view | 14 of 18 Arena games | **0 of 23** |
| Taps out of view, all games | 117 of 207 | **0** |
| Tallest screen in play | 1,426 px | 868 px |
| "Play again" position on results | Y 1,325–2,001 | Y 580–822 |
| "A thought to take with you" | Y 1,120–1,772 | Y 391–617 |
| Games tab height | 5,125 px | 2,665 px |
| Arena setup: Play position | Y 1,536 (Bluff) | Top half of the screen (Y 560 for a first-time rules view in The Inspector) |
| Horizontal overflow at 320 px | Liar's Dice | None in the 6 games checked |

| Game | Action Y | Result height | Play again Y | Game | Action Y | Result height | Play again Y |
|---|---:|---:|---:|---|---:|---:|---:|
| Rock, Paper, Scissors | 252–272 | 850 | 622 | The Commons | 278–331 | 1,052 | 703 |
| Split or Steal | 158–272 | 942 | 714 | The Coalition | 360–536 | 972 | 623 |
| Two-Thirds Guess | 350–424 | 854 | 626 | The Inspector | 217–357 | 950 | 600 |
| The Ultimatum | 302–360 | 808 | 580 | The Traveler's Dilemma | 295–364 | 1,018 | 668 |
| The Ultimatum Game | 273–326 | 972 | 623 | The Saboteur | 201–472 | 1,028 | 678 |
| Stag Hunt | 158–278 | 966 | 738 | Bluff | 293–347 | 1,022 | 672 |
| The Cooperation Game | 326–537 | 1,264 | 822 | The Defusal | 81–410 | 1,018 | 668 |
| The Auction House | 264–346 | 948 | 599 | The Power Play | 296–416 | 1,012 | 663 |
| The Market Rivals | 262–335 | 952 | 603 | Liar's Dice | 292–379 | 996 | 647 |
| The Hidden Signal | 360–471 | 972 | 623 | The Codebreaker | 171–574 | 998 | 648 |
| The Mole | 210–434 | 974 | 624 | The Gambit | 241–433 | 1,058 | 708 |
| The Last Stand | 88–464 | not captured | not captured | | | | |

The Last Stand's scripted run was still going when I read its numbers, so its results height wasn't captured.

## Phase 1: correctness

| Finding | Change | Type | Proof |
|---|---|---|---|
| Two-Thirds names the hidden crowd | Footer and intro are neutral; dots look the same; picks are drawn and read out in number order until the reveal (`src/games/two-thirds-view.ts`) | Presentation | Tests: all four crowds produce identical public output. Browser: no personality name in recorded text |
| The Gambit can get stuck | A side with no legal move skips its turn, which counts toward the turn limit. The other side moves again. Nothing moves for the player. If neither side can move, the match ends and is settled by the turn-limit order | Core rule, rare case | Tests: the reported A2 position, a stuck bot, the turn limit, and 4,800 random matches |
| Defusal empty clues | Clues that every arrangement satisfies are never dealt | Rule fix | Tests across all lengths and levels; every hand still gets its full set of true clues |
| Black wire | Dark core with a light outline, and every wire now names its colour and number | Presentation | Browser screenshot |
| Wrong text | Games tab count, the Gambit 50% line, "1 twos", Fragile lake's screen-reader label, `docs/ARENA.md`, `docs/GAMES.md`, `src/arena/core.ts`, a Saboteur comment | Text | Tests for the debrief wording |
| Liar's Dice at 320 px | Faces fit, with 45×44 targets | Presentation | Browser: no overflow |
| Honest outcomes | Split or Steal, The Cooperation Game and Stag Hunt now report who out-scored whom, what you made together, and what mutual play would have paid. Stag Hunt leads with hunts caught. The Cooperation Game says plainly when betrayal did pay more (`src/games/shared-outcome.ts`) | Presentation. **Scores, payoffs, recorded outcomes and SQL unchanged** | Tests and browser |

One limit on the no-move rule: a position where *both* sides are stuck seems unreachable with three pieces each. The rule handles it anyway, but no test reaches it through play.

## Phase 2: balance

Scripts and full output: [`balance-v2-script.txt`](game-ux-audit/balance-v2-script.txt), [before](game-ux-audit/balance-v2-before.txt), [after](game-ux-audit/balance-v2-after.txt), [proposed rule options](game-ux-audit/balance-v2-proposed-rule-options.txt). "Before" is the audited engine; "after" is the current code. Runs use fixed and adaptive strategies against the real engines (150 seeds per opponent and level before, 300 after). These are simulated players, not people, so a good number here doesn't prove the game is fun. Win rates are Easy / Normal / Hard.

### Applied: bot behaviour only

No payoff, win condition or rule changed in this group.

| Game | Change | Strategy | Before | After |
|---|---|---|---:|---:|
| Liar's Dice | Normal and Hard read the faces you bid. They also notice a player who never calls, and raise instead of calling so readily | Never call | 52 / 84 / 56 | **52 / 36 / 24** |
| | | Careful player, call below 30% | 66 / 71 / 48 | 67 / 44 / 33 |
| The Power Play | Normal and Hard always challenge a claim that would win you the game on the spot | Always Treasury | 47 / 40 / 41 | **48 / 23 / 24** |
| | | Real roles, counts cards | 49 / 42 / 48 | 51 / 41 / 47 |
| Bluff | Risk Taker and Performer stop bluffing a player who has called most claims. Observant Hard bluffs only when the claim looks ordinary | Honest, always call | 53 / 62 / 65 | **54 / 56 / 52** |
| | | Honest, call long odds | 64 / 64 / 75 | **65 / 65 / 63** |
| The Hidden Signal | Investor pitches a weak venture in its final send on Normal too. Hard Deal Maker holds a grudge after a bluff | Always pitch, invest unless warned | 83 / 71 / 75 | 82 / 70 / 71 |
| The Last Stand | Resource Guardian refills at 2 water instead of 3, always answers a district at 3 first, and douses at 2 when tanks are comfortable | Sensible player with the Guardian | 100 / 53 / 13 | 100 / 62 / 27 |

What these runs don't fix:

- **Bluff:** always calling still beats the Risk Taker about 95% of the time, because it presses deep and often busts or under-delivers.
- **The Hidden Signal:** this barely moved, and that's mostly correct. A pitch costs nothing and only a stake is a costly signal, so "always pitch" follows from the rules. The bots' honesty is the real gap, and it's part of who they are. I recommend leaving this as it is.
- **The Last Stand:** doing nothing on Easy now holds 100% of the time, up from 79%, because the Guardian is stronger. Normal and Hard still need real play. Tell me if Easy should be harder.

### Investigated, nothing changed

- **The Coalition.** With stronger simulated players (cheapest proven partner, rejecting lowballs) no strategy beats about 25%, the one-in-four baseline. Bills fail more on Normal and Hard. It isn't broken; the audit's concern came from a weak test strategy. Hard still isn't measurably harder.
- **The Auction House.** Shading still scales well: 56 / 39 / 33. The new opening bid (see below) only removes the free answer.

### Decisions needed

These change rules or win conditions, so I haven't applied them. The option runs patched a scratch copy of the engines.

**1. The Market Rivals: what counts as winning?**

- **Why it happens:** rivals settle near 10. Always pricing at 10 finishes a few units ahead of them and takes the win. Pricing at 11 earns more on Normal (1,150 vs 1,124) but never wins.

| Rule tested | Fixed 10 | Fixed 11 | Undercut by 1 | Best reply to last prices |
|---|---:|---:|---:|---:|
| Today: most profit, strictly | 96 / 91 / 93 | 36 / 0 / 0 | 98 / 62 / 73 | 67 / 14 / 8 |
| Option: must lead by 2%, otherwise a draw | 82 / 48 / 50 | 28 / 0 / 0 | 97 / 62 / 73 | 52 / 2 / 0 |

- **Recommendation:** don't adopt the 2% rule alone. It halves the fixed-price win, but undercutting by 1 then becomes the best plan, and adaptive best-reply drops to almost nothing. The better fix is probably a mix: a small lead margin plus Hard bots that respond to a held price. That needs another pass, and I'd want your go-ahead on changing the win rule first.
- **Risk to the game's identity:** low. It's still a pricing game.

**2. The Power Play: change the coin economy?**

- **Now:** with the bot fix, always Treasury dropped to about 23% on Normal and Hard. A real-roles player who counts cards does best (41–47%).
- **Option tested:** win at 12 coins instead of 10. Matches run about 2 turns longer (9 vs 7.3 for the adaptive player), with similar win rates.
- **Recommendation:** leave the economy alone for now. The bot fix solved most of the problem, and three unchallenged Treasuries still ending the game on turn 5 is a fair threat to play around. "Turn 1 of 12" remains a little misleading.

**3. The Mole: should difficulty change the evidence?**

- **Now:** exact probability wins 75% at every level, and "most accused" 68–69%. Difficulty only affects how the Mole accuses, which barely moves who you catch.
- **Option tested:** lower the camera's accuracy from 75% to 60% (a stand-in for a harder level). Exact probability falls to 63%, and following accusations falls to 43%, so careful reasoning matters more.
- **Recommendation:** make Hard use weaker evidence. This breaks an existing principle (random draws never depend on difficulty) but The Defusal and The Last Stand already make the puzzle their difficulty, so there's precedent.

## Phase 3: shared foundations

New in `src/components/game/`:

| Component | What it does |
|---|---|
| `MatchChrome` | One-row `MatchHeader`, one-row `ScoreLine`, and `ChoiceTile`, which replaces `MoveTile` and `ActionTile`. Replaces `ScoreBar` and `ScoreStrip` |
| `MatchLog` | `MatchLog` (folded history) and `CompactReveal` (a one-line result that expands) |
| `Reveal` | `useRevealStep`, `CountUp`, `SealedPair`, `Stamp`, `FadeInOnce`. All show everything at once under reduced motion (`reveal-plan.ts`, tested) |
| `LeaveGuard` | Stay or Leave dialog on `beforeRemove`, so it also covers Android Back. Only for active, unsaved matches; server matches can be resumed, so they don't ask |
| `ReadCard` | One opponent-read panel for both systems, with wording and rules in `src/games/read-rules.ts` |

Other shared changes:

- **Unified read.** One read per match, locked when made, in every game. **This changes the Arena:** guesses used to be changeable until the end. Saved records are unaffected.
- **Vocabulary.** Easy / Normal / Hard everywhere (the stored id stays `medium`, so SQL and saved rows are unchanged). "Opponent" instead of "bot" in games. "Play again" and "Game library" in The Cooperation Game.
- **Setup screens.** Play is near the top with a one-line summary of the current settings; every option is still there under Customize.
- **Games tab.** Six strategy groups, a filter row and smaller cards (`src/games/library.ts`; a test checks that all 23 appear exactly once). Game of the Week and the leaderboards are unchanged.

## Phase 4: game by game

| Game | What changed |
|---|---|
| Split or Steal | Sealed cards open together. Duplicate coin bars removed. Running note of what mutual splitting pays. Matrix and history folded |
| Rock, Paper, Scissors | Hands open together. History for both sides with a count of each throw |
| Two-Thirds Guess | Picks land one by one, then the target. Target trail chart. "Rounds to the crowd" replaces "Bot rounds". Tap the line to aim, slider kept |
| The Ultimatum | Rejected coins are visibly lost. Tap a coin to set the split, slider kept |
| The Ultimatum Game | One pool bar with walk-away ticks, and whether each side clears its walk-away |
| Stag Hunt | Two hunters and a stag that's caught or gets away. Tally of hunts caught |
| The Cooperation Game | Relationship line from the moves. Each reveal shows what you made together. Structure kept |
| The Auction House | Paddles rise lowest first, then the hammer and the true value. Lot history. **Bid starts at the public low, not near the answer** (tapping through now wins 2–7%, was 32–37%; thoughtful shading unchanged) |
| The Market Rivals | Price chart for all three firms. The profit sum stays visible. Projection folded away |
| The Hidden Signal | Far less text. Distinct signal cards. Sender's record shown as stamped chips |
| The Mole | Icons replace emoji. Accusation web with arrows, plus a round log. Only public data |
| The Commons | Compact lake. Level chart. Requests by boat and round |
| The Coalition | 100-seat chamber with a 51 needle; invited parties light up. Alliance grid. Compact builder |
| The Inspector | The screen changes with your role. Icons replace emoji in the log |
| The Traveler's Dilemma | Staircase showing both claims. What-if line kept |
| The Saboteur | Tiles for energy cards instead of a stepper. Bar that counts up to the target. Crew-by-mission grid with no cards in it |
| The Defusal | Safe / Live / ? marks on each wire (your own notes, never checked). Clues and wires on one screen. Warning before cutting a wire you marked Live. Segmented fuse |
| The Power Play | Coin race bars. Dots for role copies you can account for. Log of public claims. Bluff actions styled the same as true ones. Clean labels |
| The Last Stand | Roads between districts light up when hot. Spread preview from known rules, never ignitions. Tap a district, then choose an action |
| Liar's Dice | A round's dice get their own reveal screen. Compact bidding. Bid ladder. Optional odds helper using only your own dice. "Liar!" is visually distinct |
| The Codebreaker | Reveal explains how strongly each word links to the theme. Earlier boards kept. Name unchanged |
| The Gambit | Pieces slide. Board position no longer shifts. Safe and risky tally. Last-move marker. Message when a turn is skipped |

Both Ultimatum games stay, as asked. The classic is the quick, fixed ten-coin version; the Arena game is the one with changing pools and walk-away values.

## Phase 5: results and polish

- **Results order:** outcome, reveal, one thought, one next action. The finished board, debrief, evidence and other opponents fold away under that.
- **Lesson links added:** The Power Play → `credibility`, The Last Stand → `coordination-problem`. **Not added:** The Defusal and The Gambit, because no existing lesson really teaches them.
- **Accessibility:** Bluff's `ZoomIn` respects reduced motion. Native accessibility props no longer reach SVG on web. Small targets raised to 44 px (Rules, Match history, rematch pills).
- **Consolidation:** merged the tile and score components as above, and removed `RevealChip`, `FadeInView`, `iconFor` and other dead code. The require cycle is fixed with a new `src/arena/cooperation-model.ts`. **Not merged:** `parts.Panel` and `kit.Panel`, whose APIs differ and where merging would only churn working screens.

## Known limitations

- **Android:** not run at all. Everything above is mobile-sized web.
- **No human play yet.** Whether these feel better is still a judgment until people play them.
- **Hidden-information testing:** the repo has no React Native renderer, so tests cover pure helpers. I also scanned recorded page text for personality names in all 23 games (first decision and sixth tap, not every screen) and found none.
- **Not exercised in the browser:** dragging sliders, the Two-Thirds line tap and coin tap, Defusal marks, Repeat with the new layouts, reduced motion, Easy and Hard levels, challenge variants, and server matches.
- **Screenshots** taken mid-animation appear blank in this pane, so I saw the Auction paddles and result fades only as page text, not settled visuals.
- **Arena Insight Points** appear at the reveal but aren't banked as a total. The local record still counts right and wrong reads, so a total could be derived later.
- **Optional items skipped:** Mole suspicion marks and Commons drag-to-fish. The Commons stepper works and dragging didn't seem worth the extra complexity.
- **Match recovery** is still absent, as you asked. A reload loses an active practice or Arena match.
- **The Codebreaker's name** is unchanged; it plays like Codenames, so a rename is your call.

## Android verification checklist

No SDK or device is available here. On a development build, on one small phone (about 360×640) and one larger:

1. Play one match of each of the 23 games to the results screen.
2. Press hardware Back during a match: Stay and Leave both work, and it doesn't ask once the match is over. Also check the iOS swipe-back if you ship iOS.
3. **The Gambit:** pieces slide smoothly with no wrong jump after a capture.
4. **The Mole:** arrowheads draw on the accusation web (SVG markers on native).
5. **The Coalition:** the 100-seat chamber stays smooth.
6. **Sliders:** drag them, and tap the Two-Thirds line (`locationX` differs across platforms).
7. Haptics fire. Turn on Remove Animations and confirm reveals show everything at once.
8. Run TalkBack through The Gambit, The Last Stand, The Mole and The Defusal.
9. Check The Defusal's Black wire outdoors or at low brightness.
10. Start a Game of the Week match and a friend challenge: the labels read "Normal", and leaving doesn't ask.
