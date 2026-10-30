# Repeat play: repeating a decision or strategy

Players can let a decision or a strategy play several eligible rounds for them, then pick up by hand. Manual play is
unchanged and always available. Repeat play is optional, starts folded, and remembers nothing between runs or matches.

| Piece | Where |
|---|---|
| Plan, tick and run rules (pure, game-agnostic) | `src/repeat/plan.ts` |
| Classic-game strategies | `src/repeat/classic.ts` |
| Arena-game strategies | `src/repeat/arena.ts` |
| The audit as data (tested against the strategies) | `src/repeat/audit.ts` |
| React driver (timers, cancel, hold for Continue) | `src/features/repeat/useRepeat.ts` |
| Panel, status strip, Continue card | `src/features/repeat/RepeatPanel.tsx` |
| Screens | `app/games/play.tsx` (classic), `app/arena/play.tsx` (arena), `src/features/arena/ui/CooperationMatch.tsx` |
| Tests | `src/repeat/__tests__/repeat.test.ts` |

## The library has 23 games, not 22

The library holds 5 classic games (`src/games/`) and 18 Strategy Arena games (`src/arena/`). The 22-game brief lists
"The Ultimatum" once, but the app has two of them: the classic **The Ultimatum** and the arena **The Ultimatum Game**.
Both are audited below.

## Audit

A fixed decision · B pattern · C conditional · D manual only · E not applicable. Nothing was classified E: every game
has rounds, but most of them depend on new information each round.

| # | Game | Engine | Decisions per round | Prediction stage | Category | Why |
|---|---|---|---|---|---|---|
| 1 | Split or Steal | classic, 10 rounds | Split/Steal, simultaneous | Mystery practice: one locked read; awaited at the end | **A, C** | The same two-way choice every round; the bot reads only revealed rounds. Always Split/Steal and tit for tat are clean experiments. |
| 2 | Rock, Paper, Scissors | classic, 12 rounds | One throw, simultaneous | As above | **A, B, C** | The bots exploit habits, so fixed throws, a cycle and "beat its last" are exactly the patterns worth testing. Replaces the old RPS-only "Repeat this throw". |
| 3 | Two-Thirds Guess | classic, 5 rounds | A number 0–100 | As above | **A** | Repeating a pick (say 0, the equilibrium) shows how the crowd moves. Adjusting to each revealed target stays manual: a "⅔ of last target" rule would do the reasoning the game teaches. |
| 4 | The Ultimatum | classic, 6 rounds | Propose 1–9 or accept/reject | As above | **D** | Roles alternate every round, each response reacts to an offer revealed only that round, and there are only 3 decisions of each kind. |
| 5 | Stag Hunt | classic, 8 rounds | Stag/Hare, simultaneous | As above | **A, C** | Committing to stag (or hare) for a stretch is the trust experiment the game is about. |
| 6 | The Cooperation Game | arena, 6/10/14 | Cooperate/Defect, simultaneous | Mystery: changeable guess; offered at the end if none | **A, C** | A repeated prisoner's dilemma: Always C, Always D and tit for tat are the textbook strategies. |
| 7 | The Auction House | arena, 3/5/8 lots | A sealed bid | As above | **D** | Every lot has a fresh private estimate and range. A repeated bid ignores what each lot is about. |
| 8 | Market Rivals | arena, 5/8/12 | A price 4–20 | As above | **D** | Customers, cost and sensitivity are announced each round. On the Volatile line a fixed price can fall below cost. |
| 9 | The Hidden Signal | arena, 4/8/12 | Sender: signal; investor: test, invest or pass | As above | **D** | Roles alternate; the investor reacts to that round's signal and prior, the sender to a hidden state only it sees. |
| 10 | The Mole | arena, 3–5 + accusation | Interrogate, then accuse | As above (the style) | **D** | Deduction from each round's new clue and accusations. |
| 11 | The Commons | arena, 6/8/10 | A catch request 0–10, simultaneous | As above (Ash) | **A, C** | A steady request, or matching Ash, is the sustainability experiment. A collapse still ends the season (and the repeat) early. |
| 12 | The Coalition | arena, 4/8/12 | Propose a coalition and split, or answer a bill | As above | **D** | Negotiation: proposals rotate and responses are to specific bills. |
| 13 | The Inspector | arena, 6/8/10 | Operator: comply/cut; inspector: inspect/trust | As above | **A** (per role) | Roles alternate, but each role is a simultaneous two-way choice from history only. A plan names one choice for each role. |
| 14 | The Traveler's Dilemma | arena, 5/8/10 | A claim 2–20, simultaneous | As above | **A, C** | A fixed claim, matching its last claim, or undercutting it are the strategies the dilemma is about. |
| 15 | The Saboteur | arena, 4–6 missions + accusation | Bench, energy card, accuse | As above (the method) | **D** | Hidden roles; energy is budgeted across missions and every choice reads the revealed totals. |
| 16 | Bluff | arena, 6/8/10 | Press, claim, believe or call (multi-step) | As above | **D** | Several steps per round on privately drawn tokens. Repeating would bypass the bluff. |
| 17 | The Defusal | arena, team | Share a clue, cut a wire | As above (teammate) | **D** | A deduction puzzle: each cut depends on the clues so far, and a wrong cut ends the match. |
| 18 | The Power Play | arena, 8/12/16 turns | Act, challenge, block | As above | **D** | Turn phases react to the opponent's claims and hidden cards. |
| 19 | The Last Stand | arena, team | Douse, firebreak or refill a district | As above (teammate) | **D** | Each round reacts to the fire map and the teammate's announced plan. |
| 20 | Liar's Dice | arena, variable | Bid or call | As above | **D** | Bids depend on a fresh private roll and the bids already made; turns per round vary. |
| 21 | The Codebreaker | arena, team | Give a clue or guess words | As above (teammate) | **D** | A fresh board each round. |
| 22 | The Gambit | arena, 10/14/18 turns | Move a piece | As above | **D** | Positions change every turn; moves are about squares, not a repeated choice. |
| 23 | The Ultimatum Game | arena, 4/6/8 | Offer 0–pool or accept/reject | As above | **D** | Pools and walk-away values change every round, and roles alternate. |

**Phase/role-specific repetition.** The Inspector is the only game where repetition is role-specific (one choice per
role). The Ultimatum games' proposer rounds could take a fixed offer, but the responder rounds can't be automated
without hiding the offer, and the roles alternate every round, so a repeat would cover one round at a time.

## Strategies by game

| Game | Strategies (kind) |
|---|---|
| Split or Steal | Always Split (A), Always Steal (A), Copy its last choice: split first, then the bot's last (C) |
| Rock, Paper, Scissors | Always Rock / Paper / Scissors (A), Rock → Paper → Scissors from the first repeated round (B), Beat its last throw (C) |
| Two-Thirds Guess | Always pick *n*, 0–100 (A) |
| Stag Hunt | Always Hunt Stag (A), Always Hunt Hare (A), Copy your partner: stag first, then its last (C) |
| The Cooperation Game | Always Cooperate (A), Always Defect (A), Tit for Tat: C first, then the opponent's last *delivered* move, so on the Noisy line it answers what the reveal showed (C) |
| The Traveler's Dilemma | Always claim *n* (A), Match its last claim (C), Undercut its last claim by 1, never below 2 (C); the conditional ones open with *n* |
| The Commons | Always request *n*, 0–10 (A), Match Ash: open with *n*, then Ash's last request (C) |
| The Inspector | Comply · Inspect, Comply · Trust, Cut corners · Inspect, Cut corners · Trust: one choice per role (A) |

Conditional strategies are evaluated at every decision against the engine's real history (`next(ctx, step, amount)`),
never precomputed. Opponents, payoffs and endings stay with the engines, untouched.

## How a run works

- **Starting.** "Repeat a strategy" (a ghost button under the board) opens a compact setup: only that game's strategies,
  an amount slider where the strategy needs one, and a rounds stepper from 1 to the rounds left (default: all of them,
  never more). Nothing is pre-armed; the player presses "Repeat *n* rounds".
- **Running.** One move per round, through the match's own `play`/`act` (so validation, double-tap guards, server
  matches and busy states behave exactly as for a tap), after a pause so every reveal is seen: 900 ms on classic and
  arena boards; on the Cooperation Game 450 ms before each choice and 1.3 s on each reveal. The pause reads as time to
  watch, not motion, so reduced motion doesn't shorten it. Pauses never affect outcomes. While a run is going, the board
  is read-only (classic tiles disabled; arena boards don't take input; the Cooperation choice cards are locked), so a
  round can never get two moves.
- **Status.** A strip with the round, the strategy, a pip per repeated round, "*k* of *n* done · *m* to go", and Cancel
  Repeat.
- **Cancel Repeat.** Stops before the next decision. Completed rounds, scores and history stay; nothing resets or is
  undone. A pending move that hasn't been sent is dropped (the timer re-checks the plan when it fires). A server round
  already in flight finishes normally, once. The next decision is manual and a notice says so.
- **Ending early.** With rounds left, the run ends after its count and play returns to manual ("Repeat finished: *n*
  rounds played. Your move."). A refused move (never expected; strategies only produce legal moves, and tests check
  that for every opponent, level and variant) also ends it and returns control.

## Prediction and Continue

The existing prediction systems are reused unchanged: classic mystery practice matches (`src/games/reads.ts`, one
locked read, offered at the end when none was made) and arena mystery matches (`src/arena/reads.ts`, a changeable
guess, offered at the end when none was made). Nothing new is predicted and nothing is asked twice.

When a repeat plays the **final** round (or the match ends early during it), the screen holds the results:

1. **No prediction yet (mystery match):** the existing end-of-match prediction panel appears first. Nothing is revealed
   before it is submitted, beyond what manual play shows.
2. **After the prediction, or when there is none to make** (a chosen opponent, a prediction made earlier, a server
   match): a "Match complete" card with **Continue**.
3. Only Continue shows the results. Skipping the prediction ("Results" / "Skip") is itself an explicit request for the
   results, so it releases the hold too. The Cooperation Game is the exception: its skip stays on the Continue card.

The Cooperation Game stops on its final reveal: the prediction panel and then Continue appear under the round, and the
"View Results" button is hidden until then. A match finished by hand behaves exactly as before.

## Persistence

Classic practice and arena matches live in component state only (leaving discards them), so there's nothing to recover.
Competition and friend-challenge matches resume from the server. Repeat plans are deliberately **not persisted**: a
resumed match always starts in manual mode, never mid-run. Completed rounds are the server's record, so they can't be
duplicated or lost by the repeat.

## Known limits

- **Not verified on a native Android device or emulator.** This machine has no Android SDK. Verification so far:
  unit tests plus the web build in a phone-sized browser pane.
- Arena matches keep their existing 350 ms double-tap guard. A manual tap within 350 ms of the last repeated round
  resolving is swallowed, the same as a tap that soon after a manual round.
- A repeat may run in Game of the Week and friend-challenge matches, as the old RPS "Repeat this throw" could. Each
  repeated move is a normal server round.
