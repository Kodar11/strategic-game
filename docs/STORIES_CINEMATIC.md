# Stories: the cinematic pass

How *The Distance Between Us* and *The Rules of the Game* are directed: the audit that started it, the decisions, and what is and isn't verified. See [STORIES.md](STORIES.md) for the stories themselves, and [STORY_AUDIO_ASSETS.md](STORY_AUDIO_ASSETS.md) for licences.

## Audit: what was actually there

| The brief assumed | What the repository had |
|---|---|
| Narration implemented in both stories | **None.** Only lessons were narrated. Created for this pass, with the existing pipeline. |
| Existing scene backgrounds and character illustrations | No image assets. Story One was one vector scene with small figures; Story Two was cards on a flat background. Kept and built on, not replaced. |
| Existing audio assets and story audio controls | No music, ambience or effects anywhere in the app. Only the lesson narration player and its on/off setting. |

Preserved untouched: `src/stories/crossing/story.ts` (script, branching, endings), `run.ts` and `save.ts`. The engine gained one additive function (`replayFrames`) and changes no result. Reflection copy is unchanged; Story Two's on-screen sentences moved to one shared source so voice and screen can't disagree.

## What was built

**Audio foundation**
- `features/stories/audio/mixer.ts`: music, ambience and effects as separate layers. Everything fades; loops overlap two players rather than relying on an MP3 native loop (which gaps); music and ambience duck under the voice. Pure, with injected player and clock, so it's tested without a device.
- `features/stories/audio/session.ts`: one story's sound, from opening to leaving. Pauses on backgrounding and picks up the interrupted line on return; a short fade then frees every player on exit.
- `features/audio/controller.ts`: additive `subscribe`, `setVolume`, `resumeInterrupted`. Lessons behave as before; their tests are unchanged.
- `features/stories/ui/AudioSheet.tsx`: a small speaker icon opens pause, hear-line-again, narration on/off, mute all, and four levels. Narration on/off is the existing app-wide setting, so there is one preference, not two.

**The Distance Between Us**
- `stories/crossing/direction.ts`: for each beat, what is heard and what the camera does, as a pure function of the script and history.
- Sound comes from what changes on screen (`sfxBetween`): the basket moves and you hear rope; a line goes up and you hear a plank; a lantern is lit and you hear a match. A sound can't play without its event.
- Art rebuilt in depth: sky, drifting cloud, peaks with a moon that moves across the nights, gorge with moving water and mist, town roofs, the broken bridge with its hanging planks, reeds in the foreground. A camera moves through the layers at different rates.
- Close-ups of Mira and Hollis (`Bust.tsx`), who breathe and blink. Mood is carried by brow, mouth, gaze and how much scarf she shows, driven by what has happened.

| Moment | Direction |
|---|---|
| Opening | A 9-second drift across the settlement. Mira stays a distant figure until you've actually spoken to her. |
| Trades kept | The theme warms, and the frame warms slightly with it. Warm light only rises with things that really happened. |
| **The breach** | Music fades out entirely as her lantern fails to appear. Wind and water drop. A 1.1-second hold, then a rustle of oilcloth, then the note. Hollis speaks into near silence. Music only returns, low, on the last line. |
| Retaliation | Two piano figures answer each other left and right, each lower. The picture cools. The guide line frays if the cycle runs. |
| The storm | No music; the storm is enough. Thunder when it arrives and when the basket spins. |
| Endings | **The Span**: warm dawn, birds, lit walkway, the theme resolved. **The Line Holds**: pale light, the theme ending on a question. **Two Banks**: cold, cut line, wind, solo piano giving up. |

**The Rules of the Game**
- An arena behind everything (`MeridianStage.tsx`) that changes with the hall: wide and green in the Garden, tight, square and red in Iron, with drifting fog and flickers of static in the Fog.
- Living sigils: the Open Hand ripples outward, the Mirror's halves answer each other, the Iron Wall doesn't move at all.
- Encounters played out: two moves arrive and meet. Sharing lights the space between them; a lone take presses through and the sharer dims; two takes recoil. Each outcome has its own sound. Numbers come from the matrix.
- **The tournament is watched** (`replayFrames`): pairings are revealed and the table re-sorts as they land. Every frame is computed from the real results, and a test checks the last frame equals the final standings exactly. Skippable. Conclusions wait until it's done, so you see the result before it's explained.
- Each hall has its own piece and air; the fog bed only plays in the room that actually has noise.

## Verified, and how

| Check | Result |
|---|---|
| Typecheck, lint | Clean, apart from the 4 known errors in the TTS edge function |
| Tests | 44 tests added, for 120 story tests in all: mixer, replay, direction over all 3,360 Story One paths, narration matching the script. Full suite: 1,110 of 1,120 pass; the 10 failures are the known `daily.test.ts` baseline |
| Both stories played start to finish (web preview, 375×812) | Yes, sampling live audio elements at each beat |
| Never more than one voice at a time | Confirmed by sampling |
| Music, beds and effects at the right moments | Confirmed by sampling: thread → near silence at the note → unease → echo → storm → frost → span with dawn |
| Pause, resume, mute | Confirmed: all players pause and resume; mute goes to 0 without stopping |
| Leaving the story | Confirmed: nothing still playing 1.5 s after exit |
| Small screen (320×568) | Five-option decision scrolls, no horizontal overflow |
| Reduced motion | Results appear immediately, no replay |

## Not verified: please check these

**1. Nobody has listened to any of this.** I can't hear audio. I composed and mixed by measurement (levels, peaks, pace) and by reasoning about notes. The music in particular needs human ears; it could be anywhere from lovely to wrong, and a synth pad I've never heard is the highest risk. If something sounds off, the score is plain code in `scripts/story-audio/render.mjs` and quick to change.

**2. Voices were not auditioned**, unlike the lessons' cast. `docs/AUDIO.md` says to choose by ear. To compare candidates:
```bash
npm run tts:audition -- mira
```
Listen especially for names: Orrin's, Ashgill, Luma, Varn, Tav. Pace analysis found no clips that look wrong, only natural variation in short dialogue. It can't catch a mispronunciation.

**3. Field recordings were chosen from titles and descriptions**, and measured, not heard. A recording may contain something unexpected, such as a car in the background.

**4. Nothing has run on Android or iOS.** This machine has no Android SDK. Before release, check on a real phone:
- Audio: all layers play together, and loop handovers are inaudible. A native build bundles assets differently from web.
- A phone call during a story, and audio focus returning afterwards. `expo-audio` handles focus natively; only backgrounding is handled by our code.
- Performance on a mid-range device. Up to about eight players and several transform-animated SVG layers at once. Zoomed vector layers may look slightly soft on Android, because they rasterise at layout size.
- Memory after several replays.

**5. Web only:** rapid tapping logs `AbortError: play() request was interrupted` in the console. It's a browser message about a sound stopped before it started, and playback carries on normally.

## Limits by design

- Story Two's sentences that state this run's results aren't voiced. They vary per run, so recording them all isn't feasible. They stay on screen and the sound design marks the moment.
- The story script says Mira's note in her voice, and the lamp isn't voiced at all: it is read, to the sound of its shutter.
- Characters are vector illustrations with subtle motion, not hand-painted art. They hold up at phone size, but an illustrator would go further.
