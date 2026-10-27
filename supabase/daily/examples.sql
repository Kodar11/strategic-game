-- Daily Strategic Challenge: example publishing statements. Each one is a single statement — paste it into the
-- Supabase SQL editor and run it. Re-running a statement is safe (it reports `unchanged`). See
-- docs/DAILY_CHALLENGE.md for every field. Dates are UTC calendar days; a challenge appears in the app on its date.
-- These three are tested against the real migrations in supabase/__tests__/daily.test.ts.

-- 1 · Multiple choice with confidence, graded on the server from a private answer key.
select * from content_admin.publish_daily_challenge($challenge$
{
  "id": "price-match-promise",
  "date": "2026-10-28",
  "version": 1,
  "title": "The price-match promise",
  "intro": "Two electronics shops sit across the street from each other. Both sell the same headphones for ₹4,000, and each makes ₹1,000 profit per pair at that price.",
  "prompt": "One shop puts up a sign: “Find it cheaper across the street and we’ll match the price.” The other shop copies the sign the next day. What is the most likely effect on prices?",
  "instructions": "Pick one answer, then say how sure you are.",
  "interaction": "choice",
  "config": {
    "options": [
      { "id": "fall", "label": "Prices fall — matching makes the shops compete harder" },
      { "id": "stay-high", "label": "Prices stay high — undercutting no longer wins any customers" },
      { "id": "no-change", "label": "Nothing changes — customers rarely ask for a match" },
      { "id": "one-wins", "label": "One shop takes the whole market" }
    ]
  },
  "askConfidence": true,
  "difficulty": 2,
  "skill": "incentives",
  "basis": "calculable",
  "lesson": "market-competition",
  "key": {
    "evaluation": {
      "options": {
        "fall": { "verdict": "misconception", "feedback": "It sounds pro-customer, but think about what a price cut now buys a shop: the rival matches it instantly, so the cut wins nobody and just lowers both margins." },
        "stay-high": { "verdict": "match", "feedback": "Right. With both promises in place, a price cut can’t steal customers — the rival matches automatically. The temptation to undercut disappears, so both can keep ₹4,000." },
        "no-change": { "verdict": "defensible", "feedback": "Fair point that few customers ask — but the promise works even if nobody uses it. What matters is that a shop considering a cut knows it can’t win customers with it." },
        "one-wins": { "verdict": "misconception", "feedback": "Matching means neither shop can be undercut, so neither can pull the market away from the other." }
      }
    },
    "modelAnswer": "Prices stay high: matching removes the reward for undercutting.",
    "explanation": [
      "Without the signs, each shop is tempted to cut to ₹3,900 and steal the other’s customers — the familiar price war.",
      "A price-match promise changes the rival’s incentive, not the customer’s. Any cut is matched at once, so it gains no customers and only lowers margins.",
      "A promise that looks like fierce competition can work as a quiet agreement to keep prices high."
    ],
    "takeaway": "Before judging a rule by how it sounds, ask how it changes the other side’s best response."
  }
}
$challenge$::jsonb);

-- 2 · Numeric slider, graded on the server by private answer bands.
select * from content_admin.publish_daily_challenge($challenge$
{
  "id": "inspectors-odds",
  "date": "2026-10-29",
  "version": 1,
  "title": "The inspector’s odds",
  "intro": "A street vendor can skip the licence fee and keep ₹30 a day. If an inspector checks that day, the vendor pays a ₹120 fine and keeps nothing extra.",
  "prompt": "What is the lowest chance of inspection (per day) that makes skipping the fee not worth it for a vendor who only cares about money?",
  "instructions": "Set the slider, then say how sure you are.",
  "interaction": "number",
  "config": { "min": 0, "max": 100, "step": 5, "initial": 50, "unit": "%", "minLabel": "Never checked", "maxLabel": "Checked every day" },
  "askConfidence": true,
  "difficulty": 2,
  "skill": "incentives",
  "basis": "calculable",
  "lesson": "incentive-shift",
  "key": {
    "evaluation": {
      "bands": [
        { "min": 0, "max": 10, "verdict": "misconception", "feedback": "At this rate skipping still pays: the expected fine is well below the ₹30 the vendor keeps." },
        { "min": 15, "max": 15, "verdict": "defensible", "feedback": "Close. At 15% the vendor expects to keep 85% × ₹30 = ₹25.50 and pay 15% × ₹120 = ₹18 — skipping still pays a little." },
        { "min": 20, "max": 20, "verdict": "match", "feedback": "Exactly. At 20% the expected gain (80% × ₹30 = ₹24) equals the expected fine (20% × ₹120 = ₹24). Any more inspection and skipping stops paying." },
        { "min": 25, "max": 40, "verdict": "defensible", "feedback": "That deters cheating, but it isn’t the lowest rate that does — every extra inspection costs the city money." },
        { "min": 45, "max": 100, "verdict": "misconception", "feedback": "Far more inspection than needed. Deterrence depends on the expected fine, so a large fine lets a modest inspection rate do the work." }
      ]
    },
    "modelAnswer": "20% — where the expected fine equals the expected gain.",
    "explanation": [
      "Skipping pays (1 − p) × ₹30 and costs p × ₹120 in expected fines.",
      "Setting them equal: 30 − 30p = 120p, so p = 30 / 150 = 20%.",
      "Below 20% the vendor should skip; above it, paying the fee is cheaper on average."
    ],
    "takeaway": "Deterrence is about the expected penalty: a bigger fine means you can check less often."
  }
}
$challenge$::jsonb);

-- 3 · Reuse an existing paired scenario (prediction, then play it with its own engine). Grading uses the scenario's
--     public prediction options, so this kind of challenge has no secret answer; `key` stays empty unless you want to
--     override the scenario's model answer, explanation or takeaway.
select * from content_admin.publish_daily_challenge($challenge$
{
  "id": "splitting-the-bonus",
  "date": "2026-10-30",
  "version": 1,
  "title": "Splitting the bonus",
  "intro": "You and a colleague share a bonus, and you get to propose the split. What your colleague gets if they refuse decides how little you can offer.",
  "prompt": "Predict the smallest offer your colleague will accept, then make your offer and see what happens.",
  "interaction": "scenario",
  "config": { "scenario": "l8.c.first-offer", "version": 1 },
  "askConfidence": true,
  "difficulty": 2,
  "key": {}
}
$challenge$::jsonb);
