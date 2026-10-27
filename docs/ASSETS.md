# Artwork and asset manifest

The app ships with **vector fallback art** so it is complete without any raster files:

- **Characters:** `src/components/characters/Portrait.tsx` draws every cast member from one spec in `src/components/characters/cast.ts` (skin, hair style, outfit, colours, glasses/beard). Expressions only change the brows, eyes and mouth, so faces stay the same everywhere.
- **Scenes:** `src/components/art/SceneArt.tsx` draws the five lesson environment plates (`market`, `crowd`, `meetup`, `shootout`, `policy`). The five original lessons still use them inside their own intros.
- **Lesson thumbnails:** `src/components/art/LessonArt.tsx` draws one concept-specific illustration per lesson (all 22), used on the home lesson cards and the intro of the 17 curriculum lessons. See "Lesson thumbnails" below.

No UI text, numbers or choices are baked into artwork. Everything readable is native text.

Narration audio is documented separately in [AUDIO.md](AUDIO.md).

## Swapping in approved illustrations

1. Put files in `assets/characters/` or `assets/scenes/` using the names below.
2. Characters: add an `images` map to the character in `cast.ts`, for example
   `images: { neutral: require('@/assets/characters/aarav-neutral.png'), happy: require('@/assets/characters/aarav-happy.png') }`.
   `Portrait` uses the matching expression, falls back to `neutral`, and then to the vector portrait.
3. Scenes: render an `expo-image` `Image` in `SceneArt` for the scene id, and keep the vector version as the fallback.

Portraits are shown in circles from 36 to 88 pt. Export square 512×512 PNG/WebP files with the face centred in the top two-thirds. Scenes are cropped to 360×180 (2:1) with `cover`. Export them at 1080×540 WebP.

## Requested files

| File | Content |
|---|---|
| `aarav-{neutral,curious,thinking,surprised,happy,confused,confident,frustrated,concerned}.png` | Learner, blue hoodie, tousled dark hair |
| `maya-{neutral,thinking,skeptical,confident,surprised,frustrated}.png` | Rival, long dark hair, muted red top |
| `rohan-{neutral,confident,satisfied,frustrated}.png` | Competitor, short dark hair, deep red jacket |
| `meera-{neutral,explaining,satisfied}.png` | Analyst, glasses, hair bun, blue blazer |
| `sen-{neutral,explaining,thinking,satisfied,happy}.png` | Mentor, grey receding hair, glasses, dark sweater |
| `kavya-{neutral,thinking,concerned}.png` | Customer, long dark hair, tan cardigan |
| `arjun-{neutral,thinking,concerned}.png` | Market operator, short beard, teal shirt |
| `nina-{neutral,happy,concerned}.png` | Friend, dark bob, warm rust top |
| `scene-market.webp` | Night street with two rival delivery storefronts (blue left, orange right) |
| `scene-crowd.webp` | A group of players with a number line and a target marker |
| `scene-meetup.webp` | Old town at dusk: clocktower café on the left, riverside park on the right |
| `scene-shootout.webp` | Goal and keeper from the penalty spot, stadium lights |
| `scene-policy.webp` | City skyline with a balance scale (blue and orange pans) |

Lighting: cool blue key light from the upper left and a warm orange rim light from the right, on a deep navy (#081220) background.

## Lesson thumbnails

One vector illustration per lesson, keyed by lesson ID in `LessonArt.tsx` (`ART` map). They ship in the bundle — no image files, no network, no runtime generation. A lesson missing from the map falls back to its `SceneArt` plate, so a card never shows a broken image.

**Specification**

- **Canvas:** viewBox 360 × 150, rendered with `preserveAspectRatio="xMidYMid slice"`. Cards show it at full card width × 104 pt (about 3.3 : 1, so roughly y 20–130 is visible); the curriculum-lesson intro shows it at 170 pt (about 2 : 1 on a phone, so roughly x 30–330 is visible). Keep every subject inside the **safe area x 40–320, y 22–128**, and keep focal subjects out of the top corners (x < 50 or x > 245 while y < 58), where cards overlay the lesson number and the "Completed" pill.
- **Shared stage:** deep-navy gradient, cool blue key light from the upper left, warm orange rim light from the lower right, and a faint perspective floor from y 118. Supplied by `LessonArt`, so every image has the same lighting and grade.
- **Palette and meaning:** `palette` tokens only. Blue = you / the learner's side, orange = the other side, amber = the focal insight (one soft amber halo per image), cyan = information or a third party, slate = bystanders and structure.
- **Figures:** one shared `Person` silhouette (blue, orange or slate) so people read the same in every lesson. No faces, text, numbers, logos or UI in the art.
- **Composition:** one focal point carrying the lesson's dilemma; at most two or three supporting elements; no element reused as the main subject of another lesson.

**Mapping**

| # | Lesson ID | Concept | Visual metaphor |
|---|---|---|---|
| 1 | `cooperation-trap` | Prisoner's Dilemma | Two sealed rooms, one switch each, an unfinished dashed bridge between them |
| 2 | `iterated-dominance` | Dominance | Payoff board with rows struck out, one cell left glowing, magnifier |
| 3 | `best-response` | Nash equilibrium | 2×2 grid where blue and orange best-reply arrows all flow into one cell |
| 4 | `coordination-problem` | Multiple equilibria | Two people, two lit meeting places (café, tree), dashed paths to both |
| 5 | `predictability-trap` | Mixed strategies | Goal and keeper, two shot paths, a half-blue/half-orange coin above |
| 6 | `market-competition` | Cournot & Bertrand | Two factories facing across a staircase of falling price bars |
| 7 | `evolution` | Evolutionary stability | Population dish with a stable hawk/dove mix and balancing arrows |
| 8 | `sequential-moves` | Backward induction | Game tree with the solution path traced back from a leaf in amber |
| 9 | `credibility` | Credible commitment | Entrant walking through a dashed, outline-only wall before a fortress |
| 10 | `incentive-shift` | Incentive design | Reward/penalty levers and a worker hidden behind frosted glass |
| 11 | `bargaining` | Ultimatum & alternating offers | One pie with an uneven cut, two people reaching in, a shrinking ring |
| 12 | `war-of-attrition` | War of attrition | Two candles burning down on either side of a trophy |
| 13 | `repeated-cooperation` | Repeated games | Stepping stones receding into the distance, two lights on each |
| 14 | `strategy-detective` | Rationalizability | Nested thought bubbles over a number line pulled towards zero |
| 15 | `bayesian-uncertainty` | Bayesian reasoning | A beam of evidence cutting through fog to an ambiguous figure; belief bar |
| 16 | `signaling` | Signalling & screening | Someone who climbed costly steps holding up a badge; an observer |
| 17 | `auctions` | Auction formats | Sealed envelopes around a gavel; the winning envelope glows |
| 18 | `market-quality` | Pooling & adverse selection | Used-car lot, identical price tags, one smoking lemon |
| 19 | `coalitions` | The core | Three parties: a strong pair link and a third pulling on a breaking link |
| 20 | `voting` | Strategic voting | A three-option majority cycle above a ballot box |
| 21 | `brinkmanship` | Chicken & strategic risk | Two cars head-on on a narrow bridge under a risk gauge |
| 22 | `strategic-practice` | Synthesis | A crossroads of signposts marked with earlier lessons' glyphs; a lantern |

To replace one with an approved raster illustration later: export 1080 × 450 WebP following the same safe area, render it with `expo-image` in `LessonArt` for that lesson ID, and keep the vector version as the fallback.
