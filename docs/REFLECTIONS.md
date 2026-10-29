# Post-game reflections

After every match, the result screen shows one card — **A thought to take with you** — with one or two sentences tied
to something that happened in that match. **Explore this idea** expands it in place: the idea behind it, another way
to see it, one open question, and (when a lesson teaches exactly that idea) a link to the lesson. The card is collapsed
by default and sits just above the replay controls, after the existing result, personality reveal and debrief.

It's play first, reflect briefly, explore if curious. It isn't a lesson or a strategy guide: no best move, no formula,
nothing about the opponent's personality or policy.

| Piece | Where |
|---|---|
| Model, rule contract, spoiler rules | `src/reflections/types.ts` |
| Selection (deterministic) and rule helpers | `src/reflections/select.ts` |
| Content: classic games / first five arena games / library | `src/reflections/classic.ts`, `arena.ts`, `library.ts` |
| Registry (all 23 games) and `reflect(game, record)` | `src/reflections/registry.ts` |
| Card, `MatchReflection`, lesson-link check | `src/features/reflections/ReflectionCard.tsx` |
| Choose once per match, session recency | `src/features/reflections/useReflection.ts` |
| Mounted in | `ResultPanel` (classic, practice and server matches), `ArenaResult` via `app/arena/play.tsx`, `CoopResults` |
| Tests | `src/reflections/__tests__/reflections.test.ts` |

## How a reflection is chosen

Each game has 4–6 **rules** and a **general** fallback. A rule's `when(record)` returns the facts it needs, or `null`
when its event didn't happen; `write(facts)` builds the copy from those facts only. For a finished match:

1. Evaluate every rule on the match record (classic: the rounds; arena: the final engine state). Nothing is stored or
   derived anew — no schema, storage or server change.
2. Keep the most specific tier present: tier ¹ is a single moment (a rejection, a failed gamble), tier ² a pattern.
3. Within that tier, take the first rule in authored order that wasn't shown after this game's last three matches this
   session (in memory only); if all were, the first. Rotation never drops to a weaker tier and never invents an event.
4. No rule fired: the game's general reflection, marked `general` with no evidence.

The choice is made once when the result first renders. A reflection reads the record and never writes it.

## Rules per game

`¹` moment, `²` pattern. The lesson link appears only when that lesson is in the loaded catalog.

| Game | Lesson | Rules |
|---|---|---|
| split-steal | repeated-cooperation | split-after-steal¹, last-round-steal¹, stole-back¹, split-run², stole-first², steal-lock² |
| rps | predictability-trap | losing-streak¹, winning-streak¹, favourite-throw², win-stay², lose-shift² |
| two-thirds | strategy-detective | highest-pick¹, chased-last-target¹, target-drift², won-round² |
| ultimatum | bargaining | you-rejected¹, offer-rejected¹, lean-offer-accepted², accepted-little², even-splitter² |
| stag-hunt | coordination-problem | stag-alone¹, hare-while-they-stag¹, stag-run², hare-lock² |
| cooperation | repeated-cooperation | slip¹, coop-after-defection¹, final-defection¹, answered², mutual-coop-run², mutual-defection-run² |
| ultimatum-game | bargaining | refused-gain¹, walked-away¹, offer-refused¹, lean-accepted², generous² |
| auction | auctions | won-at-a-loss¹, above-estimate¹, won-with-profit², won-nothing² |
| market | market-competition | below-cost¹, cut-then-rivals¹, cheapest², priced-high² |
| signal | signaling | trusted-free-pitch¹, test-vs-signal¹, your-bluff¹, honest-warnings², passed-strong² |
| mole | bayesian-uncertainty | followed-the-room¹, nervous-tell¹, off-camera¹, same-suspect² |
| commons | cooperation-trap | collapse¹, rationed¹, took-more², held-back² |
| coalition | coalitions | proposal-failed¹, you-vetoed¹, left-out¹, deal-passed² |
| inspector | incentive-shift | inspected-clean¹, caught¹, trusted-cut¹, fined¹, cut-unseen², always-complied² |
| travelers | iterated-dominance | undercut-you¹, you-undercut¹, matched-high², spiral² |
| saboteur | bayesian-uncertainty | your-zero¹, failed-mission¹, you-benched², clean-run² |
| bluff | signaling | bluff-called¹, honest-called¹, bluff-believed¹, cracked¹, your-call² |
| defusal | — | live-cut¹, teammate-live-cut¹, first-share², defused² |
| power-play | — | challenge-lost¹, challenge-won¹, your-bluff-caught¹, truth-challenged¹, quiet-income² |
| last-stand | — | burned-out¹, double-douse¹, firebreaks², refills², held² |
| liars-dice | bayesian-uncertainty | called-and-lost¹, your-bid-called¹, called-and-won¹, your-bid-held² |
| codebreaker | coordination-problem | your-clue-trap¹, you-hit-trap¹, clue-landed², stopped-short² |
| gambit | — | failed-risk¹, strike-landed¹, lost-a-piece¹, only-steps², risk-heavy² |

Each rule's trigger, evidence and wording are next to each other in the content files; the `when` function is the
eligibility condition and its return value is the evidence.

## Spoiler rules

- Never name or describe the opponent's personality (the reveal does that), its policy or thresholds. The Ultimatum
  Game's `botMin` and the Cooperation Game's intended move before a slip (`bi`) are never read.
- The Mole and the Saboteur: only public evidence (camera pairs, accusations, mission totals) and the player's own
  actions (interrogations, own card). The hidden player's identity is never used.
- Bluff and Power Play: whether a claim was true is mentioned only when a challenge revealed it, or when the claim was
  the player's own.
- The card is rendered only with the result, which already waits for the personality reveal.

The tests check these: they move the Mole or saboteur to another seat, swap the opponent's personality and mask
`botMin`, and require an identical reflection each time.

## Tests

`reflections.test.ts` plays 7,400+ real matches through the engines (random and steady players across every
opponent, level, variant and length, plus two scripted cases for moves the move lists don't offer) and checks:

- copy: at most two sentences and 240 characters for the thought; one question; no opponent names, and no "bot",
  "policy", "optimal", "best move", "should have" or "mistake";
- every personalized reflection carries evidence, the general one none;
- every rule's event actually occurs in real play, and every game produces several different personalized reflections;
- selection order, rotation, fallback, determinism, and that a frozen record is never changed;
- hand-built records for eligibility (e.g. "cooperated after a defection" needs a delivered defection).

## Known limits

- Recency is per session and in memory; it resets when the app restarts.
- No comparisons across matches ("you improved"): there is no reliable baseline for that yet.
- Lesson links exist only where a lesson teaches the same idea; Defusal, Power Play, Last Stand and the Gambit have none.
