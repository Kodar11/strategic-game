# Lesson quality audit (October 2026)

An audit of all 22 lessons and 66 scenarios against one quality standard, and what was changed. Earlier the same month the scenario mathematics and wording were audited separately (see the commit history and `src/features/lessons/__tests__/audit-fixes.test.ts`); this pass is about the learning experience.

## 1. What makes the original five lessons work

Read from the code of `cooperation-trap`, `strategy-detective`, `coordination-problem`, `predictability-trap` and `incentive-shift`, not from summaries.

| Principle | Where the originals do it | Incidental (not required elsewhere) |
|---|---|---|
| **A concrete stake before any theory.** The learner runs a business, meets a friend, takes a shot. | L1 QuickEats vs FoodKart; L4 meeting Nina | The recurring cast and narration audio |
| **Predict, rate confidence, lock — then act.** Prediction and decision are separate, and prediction is locked before any reveal. | `PredictionPrompt` + `prediction-state.ts` everywhere | Exact step count (10–12 screens) |
| **See the consequence of the other choice.** After acting, the learner sets the other side's move or their own both ways and sees what each would have paid. | L1 `whatif` (cut pays 2 more either way); L5 sandbox sliders; L2 crowd presets | Animated counters |
| **Name the concept after the evidence.** | "Dominant strategy" only after the what-if | — |
| **Graded feedback, not right/wrong.** `match`, `defensible`, `depends`, `reasonable`, `misconception`; guesses about unknowable things are never called misconceptions. | `verdict.ts`, every `copy.ts` | — |
| **Honest opponents.** Scripted rules are stated and revealed. | Rohan's fixed rule, Maya reads past shots only | — |
| **Change one assumption and reason again.** | L1 penalty slider; L5 detection rate | — |
| **Transfer without naming the concept, then say what carries over and what doesn't.** | `TransferQuestion` analogy (holds / differs) | — |
| **A takeaway that is a usable rule, with its limits.** | L1 caveat step (better for firms ≠ better for customers) | — |

Verified problems in the originals were fixed in the earlier audit (E1–E7 in `AUDIT_REPORT.md`) and are pinned by `correctness.test.ts`. This pass found none of the five lacking a stage, so their flows are unchanged; they gain the shared improvements below in their paired scenarios.

## 2. The rubric

Every lesson is checked against: (1) a motivating problem a beginner understands; (2) a plain explanation, with terms introduced after the evidence; (3) meaningful decisions; (4) a prediction before the reveal; (5) confidence attached and recorded; (6) a mechanism that makes consequences observable — including the choices *not* taken; (7) feedback that explains why, separating sound reasoning from luck; (8) a changed assumption (Scenario B); (9) a genuine transfer (Scenario C); (10) an accurate, memorable takeaway; (11) consistent behaviour across lessons.

## 3. Cross-curriculum findings (shared — fixed once for all lessons)

| # | Priority | Finding | Fix |
|---|---|---|---|
| S1 | High | In the 66 scenarios the learner saw only the outcome of the choice they made. The originals' strongest move — showing what the other choices would have paid — was missing everywhere else. "Play again" needs a fresh prediction, so experimenting was costly. | **Compare your options** card after every single-decision scenario: each alternative is replayed through the scenario's own rules (`alternatives()` in `scenarios/runtime.ts`). Now shown in 39 scenarios. |
| S2 | High | After a random scenario the comparison was labelled "What happened" but showed the *model's* answer, while the run above might have gone the other way — mixing up luck and sound reasoning. | The panel now reads **"The model's answer"**, and random scenarios add one line: a lucky or unlucky run doesn't change whether the reasoning was sound. |
| S3 | High (design rule for S1) | A naive comparison would mislead: one random draw can make a worse choice look better (a one-round repeated game "shows" defecting wins); sampled slider values can skip the optimum (Cournot sampled 3 but not 4). | Random scenarios get a comparison only through an **expected-value** stat (opt-in `explore.expected`); short ranges show every value; longer ranges list hand-picked values that include the key thresholds. Tests enforce both. Off for multi-step games, allocations, and scenarios whose other choices continue the game. |
| S4 | Medium | Two curriculum labs (L20 voting, L22 synthesis checklist) were passive "tap to reveal". | Reveal cards can carry a **guess**: the learner commits to an answer before the reveal and is told whether it matched. Used for every pairwise vote in L20 and the timing, model and decision steps in L22. |
| S5 | — (verified, no change) | Confidence: one 1–5 scale everywhere, never pre-selected, stored on the attempt, shown back in the result, excluded from verdicts. First attempts are kept; replays add attempts. The profile compares confidence with results only for calculable first answers and only with enough of them. | None needed. Transfer questions deliberately don't ask confidence (documented in `LESSON_DESIGN.md`). |

## 4. Lesson-by-lesson

Prediction format codes: **O** opponent's action · **E** equilibrium · **S** which strategy does better · **A** effect of a changed assumption · **X** expected value / probability · **P** policy consequence.

| # | Lesson | Concept | A / B / C roles | Predictions | What was missing | Pri. | Changed |
|---|---|---|---|---|---|---|---|
| 1 | The Cooperation Trap | Prisoner's Dilemma | A classic PD · B yes/no → "how much" · C n-player pot | O, S, S | B's point ("every hour still loses 0.25") was only stated. | High | S1 shows every hour's payoff (13.75 → 11.25) in B and every contribution in C. |
| 2 | Strategy Detective | Dominance | A dominant row · B iterated deletion · C elections | S, E, E | — (strong lab) | Medium | S1 on all three; candidate positions show 1.5 / 2 / 2.5 votes. |
| 3 | Finding the Best Move | Nash equilibrium | A 3×3 · B no pure eq. · C unfair eq. | E, E, E | Learner saw only their own cell's payoff. | High | S1 (best replies visible against the rival's actual move); S2 on B. |
| 4 | Coordination Problem | Multiple equilibria | A stag hunt · B battle of sexes · C focal point | X, E, O (uncertain) | Stag hunt comparison would have depended on Arjun's draw. | Medium | S2; S1 for B and C (the comparison is off for A because it's random — the expected payoffs are in the reasoning). |
| 5 | Predictability Trap | Mixed strategies | A pennies · B asymmetric mix · C inspection | S, S, X | The value of each mix against a keeper who knows it was shown only for the learner's mix. | High | S1 with guaranteed chances for 0/33/50/67/100% (peak ≈ 70% at 2/3) and inspection rates incl. 40%. |
| 6 | Competing for Advantage | Cournot & Bertrand | A quantities · B prices · C positions | S, E, S | Profit as a function of output was invisible. | High | S1: the full profit curve (peaks at 4), every price vs a $3 rival, every platform position (5 → 53 votes). |
| 7 | Rules of Evolution | ESS | A hawk–dove · B driving · C invasion | E, A, A | Each run showed one starting share. | High | S1 compares end states across starts: every start → 2/3 hawks; the driving tip at 50%; invasion tips between 6% and 7% (≈ 1/17). |
| 8 | Move First, Win More | Backward induction | A Stackelberg · B centipede · C first offer | S, S, S | — | Medium | S1 for A (10/16/18/16) and C (every offer). |
| 9 | Threats and Credibility | Credible commitment | A entry · B capacity · **C was a reskin of A** ("same structure as the entry game") | O, O, O | **C didn't test transfer.** | High | **C redesigned (v2): "The weekend bonus"** — a non-binding promise of a bonus after weekend work. Same test (will they follow through when the time comes?), applied to a promise in a workplace; shows both sides lose (0, 0 instead of 2, 3). Transfer analogy text updated. |
| 10 | Incentives and Hidden Actions | Incentive design | A commission · B inspection · C metric hacking | P, P, P | Thresholds were stated, not seen. | High | S1: expected profit by commission (jumps at 25%), cost by inspection rate (drops at 40%), problems solved by bonus scheme. |
| 11 | Bargaining and Fairness | Ultimatum & offers | A ultimatum/dictator · B alternating · C hold-up | S, X, X | — (B is multi-step: different offers lead to further rounds, so no one-step comparison) | Polish | S1 for C (20 / 25 / 35). |
| 12 | The Cost of Waiting | War of attrition | A endurance · B all-pay · C strike | S, X, S | All-pay comparison could have shown one rival draw. | Medium | S1 on B by expected payoff (0.45 at 0 down to −0.45 at 10). |
| 13 | Cooperation Over Time | Repeated games | A TFT · B grim, lower δ · C detection lag | S, A, A | — | Polish | Explorer deliberately off: game length is random, so a one-run comparison would teach the wrong lesson (S3). |
| 14 | Reasoning from Beliefs | Rationalizability / level-k | A 2/3 game · B never-best-response · C 11–20 | E, E, S | — | Medium | S1: guesses 0–50 against the stated crowd (only 18 wins outright); expected value of every request 11–20 (18 best). |
| 15 | Decisions Under Uncertainty | Bayesian reasoning | A expected payoff · B value of info · C updating | X, S, X | — | Polish | S2. |
| 16 | Signals and Secrets | Signalling & screening | A certificate · B receiver's view · C menu design | O, X, O | — | Medium | S1 for A and C (all four price menus). |
| 17 | Winning the Auction | Auction formats | A first-price · B second-price · C winner's curse | S, S, S | Bid shading was explained, never compared. | High | S1 by expected profit: first-price peaks at 30; second-price peaks at 60 (your value). |
| 18 | Market Quality | Pooling & adverse selection | A exam cost · B cascade · C lemons | A, X, X | — | Medium | S1: exam costs (separation from 7); expected surplus at every lemons price (non-negative only to 30). |
| 19 | Coalitions and Power | The core | A minimal coalition · B core test · C empty core | S, E, E | — | Polish | — (allocation and multi-step; strong as is). |
| 20 | The Politics of Voting | Strategic voting | A strategic vote · B agenda · C package | S, S, S | The lab was passive. | Medium | S4 (guess each pairwise vote); S1 shows each agenda's winner (C / A / B) and each vote's expected utility. |
| 21 | Brinkmanship | Chicken & risk | A chicken · B ladder · C lock-in | E, S, S | (Engine defect in C fixed in the earlier audit.) | Polish | S2. |
| 22 | Strategic Thinking in Practice | Synthesis | A launch · B volunteer's dilemma · C negotiation | O, A, S | The checklist lab was a passive reveal. | Medium | S4 (commit to timing, model and decision before each reveal). |

## 5. What stayed the same, and why

- Lesson IDs, scenario IDs, order, modules, checkpoint and final-assessment rules: unchanged.
- Only L9.C's rules changed meaning, so it is now version 2. Its in-progress saved run (prediction plus inputs) is discarded on load, as for any version change; "played" status and recorded first attempts are kept.
- The original five lessons' step flows are unchanged (their saved step indices keep their meaning).
- Curriculum labs other than the two reveal labs were already interactive (sliders, matrices, trees); no change.

## 6. Verification

- Automated: `src/features/scenarios/__tests__/explore.test.ts` (no comparison ever uses one run's luck; configured values are on-grid; the comparisons show the claimed relationships — Cournot peak 4, first-price 30, commission 25%, 11–20 → 18, invasion tipping point; L9.C's backward induction; every reveal-lab guess has its answer among the options), plus the full existing suite.
- Manual (web preview, mobile width): see the final report for what was actually clicked through.
