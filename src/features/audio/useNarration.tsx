import { type ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { AUDIO_ASSETS } from './audio-manifest';
import type { ClipId } from './clips';
import { nextNarrationId } from './controller';
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

/** Declarative form of useNarrateOnMount for use inside a step's render function. Renders nothing. */
export function NarrateOnMount({ clip, narrationKey }: { clip: ClipId | null | undefined; narrationKey?: string }) {
  useNarrateOnMount(clip, narrationKey);
  return null;
}
