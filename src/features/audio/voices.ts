import type { CharacterId } from '../../components/characters/cast.ts';

/**
 * One voice per speaking character, used for every clip that character speaks. Change a voice here, then
 * regenerate that character's clips (see docs/AUDIO.md). Names are Google Cloud Text-to-Speech voice names;
 * `generate-tts.mjs` checks each one against the live voice list before generating anything.
 *
 * `auditionCandidates` are the alternatives compared by `npm run tts:audition`. Keep the chosen voice first.
 */
export interface VoiceConfig {
  languageCode: string;
  name: string;
  /** 1.0 is the voice's natural pace. Kept close to 1 so all characters feel like one cast. */
  speakingRate: number;
  /** Direction for whoever auditions or reassigns the voice. Not sent to the API. */
  direction: string;
  auditionCandidates: string[];
}

/** Every cast member currently has spoken lines. A character without lines should not get a voice. */
export type SpeakingCharacter = CharacterId;

export const AUDIO_FORMAT = {
  audioEncoding: 'MP3',
  sampleRateHertz: 24000,
  effectsProfileId: ['handset-class-device'],
} as const;

export const VOICES: Record<SpeakingCharacter, VoiceConfig> = {
  sen: {
    languageCode: 'en-IN',
    name: 'en-IN-Chirp3-HD-Sadaltager',
    speakingRate: 0.95,
    direction: 'Narrator and mentor. Calm, measured, warm, reassuring.',
    auditionCandidates: ['en-IN-Chirp3-HD-Sadaltager', 'en-IN-Chirp3-HD-Umbriel', 'en-IN-Chirp3-HD-Schedar'],
  },
  aarav: {
    languageCode: 'en-IN',
    name: 'en-IN-Chirp3-HD-Umbriel',
    speakingRate: 1.0,
    direction: 'Young adult learner. Curious, conversational, sometimes unsure.',
    auditionCandidates: ['en-IN-Chirp3-HD-Umbriel', 'en-IN-Chirp3-HD-Achird', 'en-IN-Chirp3-HD-Puck'],
  },
  maya: {
    languageCode: 'en-IN',
    name: 'en-IN-Chirp3-HD-Despina',
    speakingRate: 1.0,
    direction: 'Rival strategist. Composed, analytical, quietly competitive.',
    auditionCandidates: ['en-IN-Chirp3-HD-Despina', 'en-IN-Chirp3-HD-Kore', 'en-IN-Chirp3-HD-Pulcherrima'],
  },
  rohan: {
    languageCode: 'en-IN',
    name: 'en-IN-Chirp3-HD-Fenrir',
    speakingRate: 1.0,
    direction: 'Competitor. Ambitious and confident, natural rather than theatrical.',
    auditionCandidates: ['en-IN-Chirp3-HD-Fenrir', 'en-IN-Chirp3-HD-Alnilam', 'en-IN-Chirp3-HD-Algieba'],
  },
  meera: {
    languageCode: 'en-IN',
    name: 'en-IN-Chirp3-HD-Erinome',
    speakingRate: 0.97,
    direction: 'Analyst. Clear, precise, composed.',
    auditionCandidates: ['en-IN-Chirp3-HD-Erinome', 'en-IN-Chirp3-HD-Vindemiatrix', 'en-IN-Chirp3-HD-Gacrux'],
  },
  kavya: {
    languageCode: 'en-IN',
    name: 'en-IN-Chirp3-HD-Callirrhoe',
    speakingRate: 1.0,
    direction: 'Customer. Natural, relatable, conversational.',
    auditionCandidates: ['en-IN-Chirp3-HD-Callirrhoe', 'en-IN-Chirp3-HD-Aoede', 'en-IN-Chirp3-HD-Autonoe'],
  },
  arjun: {
    languageCode: 'en-IN',
    name: 'en-IN-Chirp3-HD-Orus',
    speakingRate: 0.98,
    direction: 'Market operator and council adviser. Grounded, practical, confident.',
    auditionCandidates: ['en-IN-Chirp3-HD-Orus', 'en-IN-Chirp3-HD-Iapetus', 'en-IN-Chirp3-HD-Rasalgethi'],
  },
  nina: {
    languageCode: 'en-IN',
    name: 'en-IN-Chirp3-HD-Achernar',
    speakingRate: 1.0,
    direction: 'Friend. Friendly, thoughtful, natural.',
    auditionCandidates: ['en-IN-Chirp3-HD-Achernar', 'en-IN-Chirp3-HD-Leda', 'en-IN-Chirp3-HD-Sulafat'],
  },
};

/** Short lines each audition candidate reads: neutral, a question, and a reaction. */
export const AUDITION_LINES = [
  { id: 'neutral', text: 'Every Monday both companies set prices for the week.' },
  { id: 'question', text: 'What would you do if you knew the other side’s choice?' },
  { id: 'reaction', text: 'Wait — really? I did not see that coming.' },
] as const;
