import { type ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { LessonId } from '@/src/content/lessons';
import type { CurriculumLessonSpec } from '@/src/features/lessons/curriculum/specs';
import { AUDIO_ASSETS } from './audio-manifest';
import { type ClipId, getClip } from './clips';
import { nextNarrationId } from './controller';
import { curriculumLines } from './curriculum-lines';
import { narration } from './narration';

interface Scope {
  run: number;
  context: number;
}

const NarrationContext = createContext<Scope | null>(null);

/**
 * Wraps one lesson. A run lasts for one mount of the lesson; each step gets a fresh context, so moving
 * to another step stops the previous step's narration, and leaving the lesson stops it entirely.
 */
export function NarrationScope({ step, children }: { step: string | number; children: ReactNode }) {
  const [run] = useState(nextNarrationId);
  const [current, setCurrent] = useState(() => ({ step, context: nextNarrationId() }));
  // Derive a new context id as soon as the step changes, during render, so the new step's lines carry it.
  if (current.step !== step) setCurrent({ step, context: nextNarrationId() });
  const context = current.step === step ? current.context : 0;
  const scope = useMemo(() => ({ run, context }), [run, context]);

  useEffect(() => {
    narration.beginRun(run);
    return () => narration.endRun(run);
  }, [run]);

  useEffect(() => {
    // Child effects run first, so a new step's own line has already claimed this context.
    narration.enterContext(context);
  }, [context]);

  return <NarrationContext.Provider value={scope}>{children}</NarrationContext.Provider>;
}

/** Speak `clip` once per run when this component appears (queued after any line already playing on this step). */
export function useNarrateOnMount(clip: ClipId | null | undefined, key?: string) {
  const scope = useContext(NarrationContext);
  useEffect(() => {
    if (!scope || !clip) return;
    narration.request({ clip, key, run: scope.run, context: scope.context, mode: 'queue' });
  }, [scope, clip, key]);
}

/**
 * Speak `clip` when `trigger` changes after mount — a reaction to something the learner just did.
 * The value present at mount (including restored state) never triggers, and each trigger value plays once.
 */
export function useNarrateOnEvent(
  clip: ClipId | null | undefined,
  trigger: string | number | boolean | null | undefined,
  { key, mode = 'replace' }: { key?: string; mode?: 'queue' | 'replace' } = {},
) {
  const scope = useContext(NarrationContext);
  const initial = useRef(trigger);
  useEffect(() => {
    if (!scope || !clip || trigger === initial.current || trigger === null || trigger === undefined || trigger === false) return;
    narration.request({ clip, key: key ?? `${clip}@${String(trigger)}`, run: scope.run, context: scope.context, mode });
  }, [scope, clip, trigger, key, mode]);
}

/** Declarative form of useNarrateOnEvent for use inside a step's render function. Renders nothing. */
export function NarrateOn({
  clip,
  trigger,
  mode,
  narrationKey,
}: {
  clip: ClipId | null | undefined;
  trigger: string | number | boolean | null | undefined;
  mode?: 'queue' | 'replace';
  narrationKey?: string;
}) {
  useNarrateOnEvent(clip, trigger, { key: narrationKey, mode });
  return null;
}

export function hasClipAudio(clip: ClipId | null | undefined): clip is ClipId {
  return !!clip && AUDIO_ASSETS[clip] !== undefined;
}

/**
 * Clips for a curriculum lesson's lines, looked up by slot (`'intro.heading'`, `'transfer.<option>'`, …). Content
 * arrives from the database at run time, so a slot only gets its clip while the generated text still matches the
 * text shown; an edited line stays silent until its audio is regenerated.
 */
export function useCurriculumClips(lesson: LessonId, spec: CurriculumLessonSpec): (slot: string) => ClipId | undefined {
  const clips = useMemo(() => {
    const map = new Map<string, ClipId>();
    for (const line of curriculumLines(lesson, spec)) {
      if (getClip(line.id)?.text === line.text) map.set(line.id, line.id as ClipId);
      else if (__DEV__) console.warn(`[narration] "${line.id}" has no generated audio for its current text; showing it without audio.`);
    }
    return map;
  }, [lesson, spec]);
  return (slot) => clips.get(`${lesson}.${slot}`);
}

/** Declarative form of useNarrateOnMount for use inside a step's render function. Renders nothing. */
export function NarrateOnMount({ clip, narrationKey }: { clip: ClipId | null | undefined; narrationKey?: string }) {
  useNarrateOnMount(clip, narrationKey);
  return null;
}
