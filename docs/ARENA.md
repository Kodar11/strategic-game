# Strategy Arena

Five deeper strategy games against bot opponents at Easy, Normal and Hard. Four games share the Investor, the Banker,
the Deal Maker and the Opportunist; the Cooperation Game has its own four (below). They sit under the existing five games on the Games tab.

The Arena is deliberately separate from `src/games/` (see [GAMES.md](GAMES.md)): those games have exact SQL ports, a
fixed `GameId` set in Supabase and power the Game of the Week. Arena games run entirely on the device, make no
backend calls during or after a match, and need no sign-in. Nothing in Supabase changed.

| Piece | Where |
|---|---|
| Shared contract: setup, personas, levels, lengths, results, par rule | `src/arena/core.ts` |
| Engines (pure TypeScript, no React) | `src/arena/cooperation.ts` (+ `cooperation-analysis.ts`), `ultimatum-game.ts`, `auction.ts`, `market.ts`, `signal.ts`, `registry.ts` |
| Player-facing copy (rules, persona summaries, modes, coach tips) | `src/arena/catalog.ts` |
| Local records (W/L/D per game and opponent, best, recent, coach seen, last setup) | `src/features/arena/records.ts` (AsyncStorage, validated on load) |
| Match driver | `src/features/arena/useArenaMatch.ts` |
| Boards, result/debrief, shared parts | `src/features/arena/ui/` (the Cooperation Game: `CooperationMatch.tsx`, `CoopResults.tsx`) |
| Screens | `app/arena/[gameId].tsx` (intro + setup), `app/arena/play.tsx` (match + result) |
| Tests | `src/arena/__tests__/arena.test.ts`, `src/arena/__tests__/cooperation.test.ts` |

## Engine rules every game follows

- **Reducer.** `create(setup)` → `validate(state, action)` → `apply(state, action)`. `apply` throws on an illegal action;
  the hook refuses it and shows why. A tap within 350 ms of a resolved round is treated as a double tap.
- **No current-move leak.** Bots decide from the state before the player's action. Tests apply different player moves to
  the same state and require identical bot actions. By the rules, an ultimatum responder sees the offer and a signal
  investor sees the signal; a signal sender knows the hidden state.
- **Seeded, counter-based randomness** via `draw(seed, round, k)` from `src/games/core.ts`. Items, values, estimates,
  market conditions, hidden states, test results and slips are fixed by the seed and never depend on difficulty.
- **Difficulty changes reasoning only** — memory, thresholds, curse correction, forecasting, endgame awareness. Rules
  and payoffs are identical. Each bot function documents its exact policy per persona and level.
- **Debriefs are generated from the match** (`debrief(state)`): up to three specific moments in round order, an insight
  tied to them, and the opponent's revealed tendencies with evidence counted from the rounds.

## Outcomes and par

- **Cooperation:** higher score wins, equal scores draw (by design). In a prisoner's dilemma that means always-defect
  never loses on points; the results screen says so plainly ("you out-scored it 15–9, but cooperating every round would
  have paid you 30").
- **Market Rivals:** win = strictly the most profit *and* at least 95 % of the one-round-equilibrium profit
  (`marketPar`). A race to the bottom can't win.
- **Auction House:** most profit wins, but only with a profit above zero.
- **Ultimatum Game, Hidden Signal:** most tokens wins.

## The games

| Game | Match (quick / standard / long) | Core model |
|---|---|---|
| Cooperation | 6 / 10 / 14 rounds (10 default) | Prisoner's dilemma, T>R>P>S and 2R>T+S. Classic 5/3/1/0; High stakes 8/5/1/−2; Noisy (10 % slips, revealed) |
| Ultimatum Game | 4 / 6 / 8, roles alternate | Pools 8–20; offers 0–pool; rejection pays walk-aways (0, or up to 35 % of the pool in Outside options) |
| Auction House | 3 / 5 / 8 lots | Sealed-bid first price, common value, private estimates ±u (8–16; Fog 20–30); 4 bidders; budget 45 per lot |
| Market Rivals | 5 / 8 / 12 rounds | Logit demand with an outside option (p₀ = 14, β = 0.35; Price war β = 0.6; Volatile cost 4–9), prices 4–20 |
| Hidden Signal | 4 / 8 / 12, roles alternate | Prior 30–70 %; warn / pitch (free) / stake (costly if false); test 80 % (Murky 70 %); invest ±6, fee 2, stake 4 |

Challenge modes unlock after one finished match of that game.

## Calibration

A scratch simulation of fixed player strategies over 300 seeds per persona × level was used to tune bots. Examples:
bidding your raw estimate against Normal rooms loses ~90 % of auctions (winner's curse); a careful shading bidder earns
the most against Easy rooms and the least against Hard; always-defect never wins Cooperation; Hard Banker takes the
final-round defection; greedy ultimatum offers beat Easy bots and mostly fail against Hard. The durable versions of
these checks are in the test file.

## The Cooperation Game in detail

Flow: briefing → secret decision (cards lock on tap) → reveal (your choice, theirs, points, an outcome sentence, a note on
the sequence) → Next Round / Final Round / View Results → results. Moves carry the round they answer
(`{ move, round }`), so a duplicate or stale submission is refused rather than resolving a round twice. Leaving the
screen discards the match.

| Opponent | Easy | Normal | Hard |
|---|---|---|---|
| Collaborator | forgives 75 % of defections | forgives 50 %; defensive after 3 defections in 4 rounds | absorbs a one-off defection; defensive after 2 in 4 until you cooperate twice; reads alternation |
| Retaliator | answers a defection, but lets 40 % go | strict tit-for-tat | one answer to an isolated defection (10 % mercy), two to repeated ones; forgives slips |
| Opportunist | defects after you cooperate twice in a row | probes after 3 mutual cooperations; exploits you while you never answer, backs off once you do | models your forgiveness, exploits predictable cooperators, always defects last round |
| Chameleon | C, C, then mirrors your last-3 majority (15 % mistakes) | C, C, probe; then by your cooperation rate | C, C, probe; profiles you (pushover / reciprocal / cooperative / aggressive / erratic), anticipates plain patterns, defects last round unless you're aggressive |

Tuning numbers live in `COOP_TUNING`, separate from the four policy functions. Everything the screens say about a
match — briefings, the opponent-history notes, statistics, insights, lessons — comes from `cooperation-analysis.ts` and
states its evidence; pattern claims need at least two or three observations.
