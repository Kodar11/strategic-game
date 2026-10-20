# Artwork and asset manifest

The app ships with **vector fallback art** so it is complete without any raster files:

- **Characters:** `src/components/characters/Portrait.tsx` draws every cast member from one spec in `src/components/characters/cast.ts` (skin, hair style, outfit, colours, glasses/beard). Expressions only change the brows, eyes and mouth, so faces stay the same everywhere.
- **Scenes:** `src/components/art/SceneArt.tsx` draws the five lesson environment plates (`market`, `crowd`, `meetup`, `shootout`, `policy`).

No UI text, numbers or choices are baked into artwork. Everything readable is native text.

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
