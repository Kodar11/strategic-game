# Lesson categories

Five themes for browsing the 22 lessons. Lesson ids, order, modules, content and progress are unchanged. Categories are an extra lens on the home screen. **All** is the original module view, with its checkpoints.

- **Stored in Supabase:** `content_categories` and `content_lesson_categories`. The second table is keyed by lesson, so each lesson has exactly one primary category. Migration: `supabase/migrations/20261027130000_lesson_categories.sql`.
- **Read with** `get_lesson_categories()`, separately from `get_published_content()`. App builds from before categories keep loading their catalog unchanged.
- **Seeded only when missing.** Seeding never moves a lesson that was moved in the database. Run `content_admin.seed_lesson_categories()`: `seed.sql` calls it after importing lessons.
- **Optional in the app.** If categories can't be loaded, the lesson list shows no filter and everything else works.
- **Edits show up** on the next app launch, or on "Try again".

```sql
-- Move a lesson to another category
update public.content_lesson_categories set category_id = 'negotiation-bargaining' where lesson_id = 'credibility';
-- Reorder categories (positions may be swapped in one statement)
update public.content_categories set position = case id when 'a' then 1 when 'b' then 0 else position end;
-- Rename or describe
update public.content_categories set title = '…', description = '…', revision = revision + 1 where id = '…';
```

## Mapping

| # | Lesson (id) | Concept | Category |
|---|---|---|---|
| 2 | Strategy Detective (`iterated-dominance`) | Dominance | Strategic Foundations |
| 3 | Finding the Best Move (`best-response`) | Nash equilibrium | Strategic Foundations |
| 8 | Move First, Win More (`sequential-moves`) | Backward induction | Strategic Foundations |
| 14 | Reasoning from Beliefs (`strategy-detective`) | Rationalizability | Strategic Foundations |
| 22 | Strategic Thinking in Practice (`strategic-practice`) | Synthesis | Strategic Foundations ¹ |
| 1 | The Cooperation Trap (`cooperation-trap`) | Prisoner's Dilemma | Cooperation and Competition |
| 4 | The Coordination Problem (`coordination-problem`) | Multiple equilibria | Cooperation and Competition |
| 5 | The Predictability Trap (`predictability-trap`) | Mixed strategies | Cooperation and Competition ² |
| 6 | Competing for Advantage (`market-competition`) | Cournot & Bertrand | Cooperation and Competition |
| 7 | Rules of Evolution (`evolution`) | Evolutionary stability | Cooperation and Competition |
| 13 | Cooperation Over Time (`repeated-cooperation`) | Repeated games | Cooperation and Competition |
| 9 | Threats and Credibility (`credibility`) | Credible commitment | Incentives and Decision-Making |
| 10 | Incentives and Hidden Actions (`incentive-shift`) | Incentive design | Incentives and Decision-Making |
| 20 | The Politics of Voting (`voting`) | Strategic voting | Incentives and Decision-Making |
| 11 | Bargaining and Fairness (`bargaining`) | Ultimatum & alternating offers | Negotiation and Bargaining |
| 12 | The Cost of Waiting (`war-of-attrition`) | War of attrition | Negotiation and Bargaining |
| 19 | Coalitions and Power (`coalitions`) | The core | Negotiation and Bargaining ³ |
| 21 | Brinkmanship and Escalation (`brinkmanship`) | Chicken & strategic risk | Negotiation and Bargaining |
| 15 | Decisions Under Uncertainty (`bayesian-uncertainty`) | Bayesian reasoning | Information and Uncertainty |
| 16 | Signals and Secrets (`signaling`) | Signaling & screening | Information and Uncertainty |
| 17 | Winning the Auction (`auctions`) | Auction formats | Information and Uncertainty |
| 18 | Signals, Imitation and Market Quality (`market-quality`) | Pooling & adverse selection | Information and Uncertainty |

Counts: Foundations 5 · Cooperation and Competition 6 · Incentives and Decision-Making 3 · Negotiation and Bargaining 4 · Information and Uncertainty 4.

## Validation notes

I checked each lesson's objective (its `question` and description in the content) against the proposed five categories. They hold up, with these judgement calls:

1. **`strategic-practice` (synthesis)** doesn't fit any of the five themes. It applies all of them to unlabelled problems. I put it in *Strategic Foundations* and widened that category's description to say so ("…and apply it when nobody labels the problem"), rather than add a sixth category for one lesson. **Alternative:** a sixth category such as "Putting It Together", which is one SQL insert plus one update.
2. **`predictability-trap` (mixed strategies)** could sit under *Information and Uncertainty*, because its skill area is `uncertainty`. Its objective is about being unpredictable against a competitor, though, so it is in *Cooperation and Competition*.
3. **`coalitions` (the core)** is about how a group divides a surplus and which deals survive. That is bargaining, so it is in *Negotiation and Bargaining*, not *Cooperation and Competition*.

*Incentives and Decision-Making* is the smallest category (3 lessons) but it holds together. *Credibility* could also be read as bargaining power. It stays here because the lesson's focus is whether carrying out a threat is in the threatener's own interest.
