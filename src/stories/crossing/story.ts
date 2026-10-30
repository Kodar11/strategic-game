/**
 * Story One — "The Distance Between Us". The narrative state is nothing but the player's choices: every line Mira
 * says, every basket she loads and the ending are pure functions of what the player chose before. There is no
 * hidden trust score; the facts below (who held back, whether a retaliation cycle ran, what the storm-night signal
 * did to what Mira believed) are read individually wherever the story needs them.
 *
 * Mira's own decisions follow fixed rules of her character, written next to each function:
 * - She mirrors the player's openness on night one (she has been cheated before by east-bank traders).
 * - She keeps the Varn medicine on night seven no matter what — her brother is sick at Orrin's Rest. What changes
 *   with history is the note she leaves.
 * - She always tries to repair the breach afterwards (she sends a third of what she owed), but how she answers
 *   the player's response to the breach depends on it.
 * - On the storm night she reads the player's empty basket through everything that came before, and through what
 *   the player signalled.
 *
 * Pure: shared by the UI and the tests.
 */

export interface Choices {
  /** Night 1: what you tell her first. */
  open?: 'plain' | 'guarded';
  /** Night 1: what goes in the first basket. */
  basket?: 'full' | 'short';
  /** Night 4: the rope. */
  rope?: 'all' | 'one' | 'keep';
  /** Night 9: your answer to the broken agreement. */
  answer?: 'empty' | 'away' | 'anyway' | 'half';
  /** Night 10 (only after an empty basket): keep answering in kind, or stop. */
  again?: 'stop' | 'continue';
  /** Night 12: what you load on the storm night. */
  load?: 'agreed' | 'short';
  /** Night 12: what you signal after the storm. */
  signal?: 'explain' | 'ask' | 'silent' | 'accuse';
  /** Night 15: the last offer. */
  offer?: 'together' | 'staged' | 'ask' | 'alone' | 'keep';
  /** Night 15, after asking about night seven. */
  after?: 'together' | 'staged' | 'alone';
}

export type DecisionId = keyof Choices;

export const OPTIONS: { [K in DecisionId]-?: readonly NonNullable<Choices[K]>[] } = {
  open: ['plain', 'guarded'],
  basket: ['full', 'short'],
  rope: ['all', 'one', 'keep'],
  answer: ['empty', 'away', 'anyway', 'half'],
  again: ['stop', 'continue'],
  load: ['agreed', 'short'],
  signal: ['explain', 'ask', 'silent', 'accuse'],
  offer: ['together', 'staged', 'ask', 'alone', 'keep'],
  after: ['together', 'staged', 'alone'],
};

export const SCENES = ['a', 'b', 'c', 'd', 'e', 'e2', 'f', 'g', 'g2', 'h'] as const;
export type SceneId = (typeof SCENES)[number];

export const SCENE_TITLE: Record<SceneId, string> = {
  a: 'The crossing',
  b: 'The first exchange',
  c: 'Rope',
  d: 'Night seven',
  e: 'The answer',
  e2: 'Echoes',
  f: 'The storm',
  g: 'First frost',
  g2: 'First frost',
  h: 'The crossing changes',
};

/** Which decision a scene ends on (scenes without one simply flow on). */
const SCENE_DECISIONS: Partial<Record<SceneId, DecisionId[]>> = {
  a: ['open'],
  b: ['basket'],
  c: ['rope'],
  e: ['answer'],
  e2: ['again'],
  f: ['load', 'signal'],
  g: ['offer'],
  g2: ['after'],
};

export function sceneApplies(scene: SceneId, c: Choices): boolean {
  if (scene === 'e2') return c.answer === 'empty';
  if (scene === 'g2') return c.offer === 'ask';
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Facts derived from the history

/** Night 1, Mira's basket: open meets open; a guarded stranger gets a stranger's share. */
export function miraFirstBasket(c: Choices): 'full' | 'short' {
  return c.open === 'plain' ? 'full' : 'short';
}

/** Night 1 outcome, player first: ff, fs (you full, Mira short), sf, ss. */
export type FirstOutcome = 'ff' | 'fs' | 'sf' | 'ss';
export function firstOutcome(c: Choices): FirstOutcome | null {
  if (!c.basket) return null;
  return `${c.basket[0]}${miraFirstBasket(c)[0]}` as FirstOutcome;
}

/**
 * Night 4, Mira's timber: full when night one was even and generous; one test plank after you shorted her; extra
 * (planks and more bark) when she was the one who held back and wants to make it right; half when you both did.
 */
export function miraTimber(c: Choices): 'planks' | 'one-plank' | 'extra' | 'half' | null {
  switch (firstOutcome(c)) {
    case 'ff':
      return 'planks';
    case 'sf':
      return 'one-plank';
    case 'fs':
      return 'extra';
    case 'ss':
      return 'half';
    default:
      return null;
  }
}

/** Deliberate harms by the player so far, in order: the moves Mira can see (or later learns) were choices. */
export function playerHarms(c: Choices): string[] {
  const out: string[] = [];
  if (c.basket === 'short') out.push('basket');
  if (c.rope === 'keep') out.push('rope');
  if (c.answer === 'empty') out.push('answer');
  if (c.again === 'continue') out.push('again');
  if (c.load === 'short') out.push('load');
  return out;
}

/** Night 7: her note is bitter when the player had already shorted her before — the breach is also payback. */
export function breachTone(c: Choices): 'sorry' | 'bitter' {
  return c.basket === 'short' || c.rope === 'keep' ? 'bitter' : 'sorry';
}

/** Two or more nights of empty baskets in both directions. */
export const cycleRan = (c: Choices) => c.again === 'continue';
export const cycleBroken = (c: Choices) => c.answer === 'empty' && c.again === 'stop';

/** What built structure crosses the gorge after night 4 (before the ending). */
export function structure(c: Choices): 'none' | 'rail' | 'line2' {
  if (c.rope === 'all') return 'line2';
  if (c.rope === 'one') return 'rail';
  return 'none';
}

/** The guide line frays while nobody tends it: during a retaliation cycle, or the nights the line hung slack. */
export const frayed = (c: Choices) => structure(c) !== 'none' && (cycleRan(c) || c.answer === 'away');

/**
 * What Mira believes after the storm emptied the player's basket.
 * - clear: she understands it was the storm. Explaining or asking does this — unless the record says otherwise
 *   (a retaliation cycle, or two or more deliberate harms before tonight): then the truth reaches her as "maybe".
 * - doubt: she isn't sure.
 * - misread: she concludes it was deliberate. Silence does this when there is any earlier harm to read it by; an
 *   accusation always does — she wrapped that bark in her own coat.
 * Note that a short load is invisible to her: the storm emptied the basket either way.
 */
export function stormReading(c: Choices): 'clear' | 'doubt' | 'misread' | null {
  if (!c.signal) return null;
  const before = playerHarms({ ...c, load: undefined });
  const poorRecord = cycleRan(c) || before.length >= 2;
  switch (c.signal) {
    case 'explain':
    case 'ask':
      return poorRecord ? 'doubt' : 'clear';
    case 'silent':
      return before.length >= 1 || cycleRan(c) ? 'misread' : 'doubt';
    case 'accuse':
      return 'misread';
  }
}

/** The player said "storm" about a basket they had deliberately shorted. */
export const liedAboutStorm = (c: Choices) => c.load === 'short' && (c.signal === 'explain' || c.signal === 'ask');

/**
 * How Mira comes to the last night. Not a score: three distinct reasons can close her —
 * a retaliation cycle that ran, being misread after earlier harm, or three deliberate harms.
 * She is open when nothing closed her, the storm night was understood, there was at most one harm, and the player
 * didn't vanish on her (the slack line). Otherwise she's wary.
 */
export function miraStance(c: Choices): 'open' | 'wary' | 'closed' {
  const harms = playerHarms(c).length;
  const reading = stormReading(c);
  if (cycleRan(c) || (reading === 'misread' && harms >= 1) || harms >= 3) return 'closed';
  if (reading === 'clear' && harms <= 1 && c.answer !== 'away') return 'open';
  return 'wary';
}

/** Asking about night seven, and hearing the answer, can open a wary Mira — if the record allows it. */
export function stanceAfterAsking(c: Choices): 'open' | 'wary' | 'closed' {
  const s = miraStance(c);
  return s === 'wary' && playerHarms(c).length <= 1 ? 'open' : s;
}

/** The player's final move on the last night. */
export function finalMove(c: Choices): 'together' | 'staged' | 'alone' | 'keep' | null {
  if (c.offer === 'ask') return c.after ?? null;
  return c.offer ?? null;
}

/**
 * Generosity with no conditions, ever: you answered the breach by sending everything anyway, never set terms, and
 * offer to finish the span on faith. The west council takes note.
 */
export function skimmed(c: Choices): boolean {
  return c.answer === 'anyway' && finalMove(c) === 'together';
}

export type EndingId = 'span' | 'line' | 'banks';

export const ENDING_TITLE: Record<EndingId, string> = { span: 'The Span', line: 'The Line Holds', banks: 'Two Banks' };

export type EndingVariant =
  | 'span-together'
  | 'span-staged'
  | 'line-skimmed'
  | 'line-first-knot'
  | 'line-not-this-winter'
  | 'line-trade'
  | 'banks-alone'
  | 'banks-kept';

/**
 * The ending, from Mira's stance on the last night (itself a reading of the whole history) and the player's final
 * move. Retaliating on the last night ends with two banks whatever came before: she learns the lesson she taught.
 */
export function ending(c: Choices): { id: EndingId; variant: EndingVariant } | null {
  const move = finalMove(c);
  if (!move) return null;
  const stance = c.offer === 'ask' ? stanceAfterAsking(c) : miraStance(c);
  if (move === 'keep') return { id: 'banks', variant: 'banks-kept' };
  if (stance === 'closed') {
    if (move === 'alone') return { id: 'banks', variant: 'banks-alone' };
    return { id: 'line', variant: 'line-not-this-winter' };
  }
  if (move === 'alone') return { id: 'line', variant: 'line-trade' };
  if (move === 'staged') return { id: 'span', variant: 'span-staged' };
  // together
  if (stance === 'wary') return { id: 'line', variant: 'line-first-knot' };
  if (skimmed(c)) return { id: 'line', variant: 'line-skimmed' };
  return { id: 'span', variant: 'span-together' };
}

// ---------------------------------------------------------------------------------------------------------------
// Script

export type Speaker = 'narrator' | 'mira' | 'hollis' | 'note' | 'lamp' | 'insight';

export type Sky = 'dusk' | 'night' | 'storm' | 'frost' | 'dawn';
export type MiraPose = 'none' | 'stand' | 'lantern-up' | 'turned' | 'crossing';
export type BasketAt = 'east' | 'west' | 'middle' | 'gone';

/** What the illustration shows. Every beat has a complete stage, so a resumed beat always draws correctly. */
export interface Stage {
  night: number;
  sky: Sky;
  rain: boolean;
  snow: boolean;
  mira: MiraPose;
  /** Mira's lantern lit on the far post. */
  miraLight: boolean;
  basket: BasketAt;
  built: 'none' | 'rail' | 'line2' | 'span' | 'cut';
  frayed: boolean;
}

export interface LineBeat {
  kind: 'line';
  who: Speaker;
  text: string;
  stage: Stage;
}

export interface ChoiceBeat {
  kind: 'choice';
  id: DecisionId;
  prompt: string;
  options: { value: string; label: string; detail: string }[];
  stage: Stage;
}

export type Beat = LineBeat | ChoiceBeat;

class Script {
  beats: Beat[] = [];
  stage: Stage;
  constructor(stage: Stage) {
    this.stage = stage;
  }
  set(patch: Partial<Stage>) {
    this.stage = { ...this.stage, ...patch };
    return this;
  }
  say(who: Speaker, text: string, patch?: Partial<Stage>) {
    if (patch) this.set(patch);
    this.beats.push({ kind: 'line', who, text, stage: this.stage });
    return this;
  }
  /** Adds the choice; returns false (and the caller stops) when it hasn't been made yet. */
  choose<K extends DecisionId>(c: Choices, id: K, prompt: string, options: { value: NonNullable<Choices[K]>; label: string; detail: string }[]): boolean {
    this.beats.push({ kind: 'choice', id, prompt, options, stage: this.stage });
    return c[id] !== undefined;
  }
}

const builtNow = (c: Choices): Stage['built'] => structure(c);

export function sceneBeats(scene: SceneId, c: Choices): Beat[] {
  switch (scene) {
    case 'a':
      return sceneA(c);
    case 'b':
      return sceneB(c);
    case 'c':
      return sceneC(c);
    case 'd':
      return sceneD(c);
    case 'e':
      return sceneE(c);
    case 'e2':
      return sceneE2(c);
    case 'f':
      return sceneF(c);
    case 'g':
      return sceneG(c);
    case 'g2':
      return sceneG2(c);
    case 'h':
      return sceneH(c);
  }
}

const BASE: Stage = { night: 1, sky: 'dusk', rain: false, snow: false, mira: 'none', miraLight: false, basket: 'east', built: 'none', frayed: false };

function sceneA(c: Choices): Beat[] {
  const s = new Script(BASE);
  s.say('narrator', 'Three nights ago the storm took the Long Bridge. Luma is two towns now — one on each side of the Ashgill gorge — and between them hangs a single iron cable and a basket that only crosses if both banks pull.');
  s.say('narrator', 'Your side has the winter oil and the last good rope. It also has Hollis, who kept the bridge for forty years, and a gash in his leg from the storm that is starting to smell wrong.');
  s.say('hollis', 'Fever-bark, that’s what this wants. Comes up the west road from Varn.');
  s.say('hollis', 'The west road is over there.');
  s.say('narrator', 'A lantern on the far cliff. A courier in a long coat, amber scarf pulled up against the wind, studying the cable the way you are.', { mira: 'stand', miraLight: true });
  s.say('mira', 'You the new keeper? Hollis finally let someone else touch his winch?');
  s.say('mira', 'I’m Mira. I carry for the high villages. I’ve got something in this pack someone over there probably needs, and you’ve probably got something I need. Hard to tell from here.');
  if (
    !s.choose(c, 'open', 'She waits, lantern raised. What do you tell her?', [
      { value: 'plain', label: 'Tell her plainly', detail: 'Oil and rope on this side. You need fever-bark for Hollis.' },
      { value: 'guarded', label: 'Ask what she’s carrying first', detail: 'Give nothing away until you know what she has.' },
    ])
  )
    return s.beats;
  if (c.open === 'plain') {
    s.say('mira', 'Fever-bark. I’ve got a bundle from Varn, meant for Orrin’s Rest — the high hamlet. My brother Tav’s up there with the flocks.', { mira: 'lantern-up' });
    s.say('mira', 'And they’ve got no oil. When the snow shuts the pass it’s six weeks of dark up there.');
    s.say('mira', 'You’ve just told a stranger exactly what you need. Either you’re honest or you’re new.');
  } else {
    s.say('mira', 'Careful. Good. So am I.');
    s.say('mira', 'Bark, from the Varn road. Some of it could be yours. Depends what’s on your side.');
    s.say('narrator', 'You tell her: oil. She goes quiet for a moment, and you realise she wanted it more than she’s letting on.');
    s.say('mira', 'Then we’re two careful people with a basket between us.');
  }
  s.say('mira', 'You know how the line works? We each load at our own post, then we both haul. The baskets swap in the middle. Nobody sees what the other loaded until it’s on their side.', { mira: 'stand' });
  s.say('hollis', 'And nobody takes anything back once it’s moving.');
  return s.beats;
}

function sceneB(c: Choices): Beat[] {
  const s = new Script({ ...BASE, sky: 'night', mira: 'stand', miraLight: true });
  s.say('narrator', 'You fill a jar of lamp oil. It is heavy in a way that has nothing to do with weight: a full jar is a week of light for a hamlet you will never see.');
  s.say('narrator', 'You could fill it to the neck. Or fill it halfway, wrap it so it doesn’t slosh, and keep the rest for a winter that is coming either way.');
  if (
    !s.choose(c, 'basket', 'What goes in the basket?', [
      { value: 'full', label: 'A full jar', detail: 'What you’d want her to send you.' },
      { value: 'short', label: 'Half a jar, well wrapped', detail: 'Enough to look fair. Keep the rest, just in case.' },
    ])
  )
    return s.beats;
  s.say('narrator', 'You both haul. The basket shudders out over the drop, swings in the dark, and comes home.', { basket: 'middle' });
  s.set({ basket: 'east' });
  switch (firstOutcome(c)) {
    case 'ff':
      s.say('narrator', 'Inside: a bundle of fever-bark, more than you’d hoped, tied with amber thread.');
      s.say('narrator', 'Across the gorge, Mira lifts your jar to her lantern. You watch her shoulders drop as she weighs it.', { mira: 'lantern-up' });
      s.say('mira', 'Full. You actually filled it.');
      s.say('hollis', 'And she actually sent it. Well. There’s a first time for everything on this river.');
      break;
    case 'sf':
      s.say('narrator', 'Inside: a generous bundle of fever-bark, tied with amber thread.');
      s.say('narrator', 'Across the gorge, Mira lifts your jar and tips it toward the light. She holds it there a long moment.', { mira: 'lantern-up' });
      s.say('mira', 'Half.');
      s.say('mira', 'That’s — fine. You didn’t know me. I’ll remember that you didn’t know me.', { mira: 'turned' });
      s.say('hollis', 'You got the better end of tonight. Mind it’s only tonight.');
      break;
    case 'fs':
      s.say('narrator', 'Inside: a thin twist of bark. Enough for a day or two. Not a cure.');
      s.say('narrator', 'Across the gorge, Mira lifts your jar and goes still.', { mira: 'lantern-up' });
      s.say('mira', '…Full.');
      s.say('mira', 'I sent you a stranger’s share. I didn’t think you’d — I owe you for this one.');
      s.say('hollis', 'She took the better end tonight. Let’s see what she does with it.');
      break;
    case 'ss':
      s.say('narrator', 'Inside: a thin twist of bark. Across the gorge, Mira weighs a half-empty jar.', { mira: 'lantern-up' });
      s.say('mira', 'Well. We were both careful.');
      s.say('narrator', 'Each of you kept back enough to be safe. Neither of you got enough to matter. Hollis’s leg needs more than a day of bark; Orrin’s Rest needs more than half a jar.');
      s.say('hollis', 'Safe’s a cold thing to sleep in.');
      break;
  }
  return s.beats;
}

function sceneC(c: Choices): Beat[] {
  const s = new Script({ ...BASE, night: 4, sky: 'night', mira: 'stand', miraLight: true });
  s.say('narrator', 'Night four. The cold has a new edge. There is snow on the far peaks now, low enough to see by moonlight.');
  s.say('mira', 'I’ve been thinking about the line.');
  s.say('mira', 'One cable, one basket, one jar a night. The pass shuts in two weeks. At this rate Orrin’s gets a few jars, your town gets a few bundles, and we all pretend that’s enough.');
  s.say('mira', 'There’s timber on my side — planks from the old mill. With rope I could rig a second line. A walkway, eventually. A bridge, if we’re both stubborn.');
  s.say('narrator', 'Rope. You have three coils of good hemp, the last in town. If she has them, and decides she likes them better on her side, there is no more rope.');
  switch (firstOutcome(c)) {
    case 'ff':
      s.say('mira', 'We did this once and it worked. I’d like it to work every night until the snow. And then in spring. And then for as long as these two cliffs stay where they are.');
      break;
    case 'sf':
      s.say('mira', 'I’ll be honest. After the half jar, I don’t know about you. So: one plank tonight. When your baskets are honest twice, the rest come over.', { mira: 'turned' });
      break;
    case 'fs':
      s.say('mira', 'I owe you from the first night. So I’ll go first this time — the timber’s already on my post. Send what you think is fair.');
      break;
    case 'ss':
      s.say('mira', 'We’re both still holding back. I’m sending half the timber. Do what you like with that.');
      break;
  }
  s.say('hollis', 'Thing is, it’s not one trade anymore. Whatever goes over tonight, she’ll remember every night after. So will you.');
  if (
    !s.choose(c, 'rope', 'Three coils of rope. What do you send?', [
      { value: 'all', label: 'All three coils', detail: 'Enough to rig a second line properly.' },
      { value: 'one', label: 'One coil, and see', detail: 'A start. More when her planks come over.' },
      { value: 'keep', label: 'Keep the rope', detail: 'It’s the last good rope in town.' },
    ])
  )
    return s.beats;
  const timber = miraTimber(c);
  const got =
    timber === 'planks'
      ? 'The basket comes back stacked with planks.'
      : timber === 'one-plank'
        ? 'The basket comes back with a single plank, laid in it like a question.'
        : timber === 'extra'
          ? 'The basket comes back stacked with planks — and, wedged between them, a second bundle of bark.'
          : 'The basket comes back with half a stack of planks.';
  s.say('narrator', got, { basket: 'east' });
  if (c.rope === 'all') {
    if (timber === 'one-plank') s.say('mira', '…All three. All right. All right.');
    else s.say('mira', 'All three? Then I’d better be good with knots.', { mira: 'lantern-up' });
    s.say('narrator', 'By midnight there is a second line across the Ashgill — a guide rope, taut and glistening. The basket rides steadier on it.', { built: 'line2', mira: 'stand' });
    if (timber === 'one-plank' || timber === 'half') s.say('narrator', 'The rest of her planks come over the next night, without being asked.');
  } else if (c.rope === 'one') {
    s.say('narrator', 'One coil goes over. A hand-line, Mira calls it — enough to steady the basket in a wind. Not enough to build on.', { built: 'rail' });
    s.say('mira', timber === 'planks' || timber === 'extra' ? 'One coil. Fair enough. Trust by the coil.' : 'One coil for one plank. Aren’t we a pair.');
  } else {
    s.say('narrator', 'Oil goes over, and no rope. Mira looks for a long time at the space in the basket where rope would have been.', { mira: 'turned' });
    s.say('mira', 'Right.');
    s.say('narrator', timber === 'one-plank' ? 'Nothing new crosses the Ashgill.' : 'Her planks sit stacked on your side now, and there is no rope on hers. Nobody can build anything with that.');
  }
  s.say('insight', 'It was never only tonight’s trade. Every basket was also a message about the next one.');
  return s.beats;
}

function sceneD(c: Choices): Beat[] {
  const built = builtNow(c);
  const s = new Script({ ...BASE, night: 7, sky: 'night', mira: 'stand', miraLight: true, built });
  s.say('narrator', 'Night seven. By now the arrangement is simple, and spoken aloud: tonight you go first — oil and flour for Orrin’s Rest. Tomorrow she sends the big bundle. The Varn post came in. Real medicine, bark and salve, half of it for your side.');
  s.say('narrator', 'Hollis’s leg is hot to the touch. He has stopped making jokes about it.');
  s.say('narrator', 'You load the basket. You haul. It crosses, and Mira takes it, and lifts her lantern once: thank you.', { basket: 'west', mira: 'lantern-up' });
  s.say('narrator', 'The next night her lantern isn’t at the post. The basket comes back on its own.', { night: 8, mira: 'none', miraLight: false, basket: 'east' });
  s.say('narrator', 'No bundle. No salve. Only a strip of oilcloth with charcoal letters on it.');
  if (breachTone(c) === 'sorry') s.say('note', 'FEVER AT ORRIN’S. TAV IS SICK. I TOOK IT ALL UP THE PASS. I’M SORRY. I’LL MAKE IT RIGHT. — M');
  else s.say('note', 'FEVER AT ORRIN’S. TAV IS SICK. I TOOK IT ALL UP THE PASS. YOU HELD BACK BEFORE. NOW I HAVE. WE’RE EVEN. — M');
  s.say('hollis', 'Could be true.');
  s.say('hollis', 'Could be the oldest trick on this river. You can’t see up that mountain from here, and she knows it.');
  s.say('hollis', 'Either way, I’m not getting that salve.');
  s.say('narrator', 'You had an agreement. You kept your half first, because it was your turn to trust. Whatever her reasons were, she decided them without you.');
  return s.beats;
}

function sceneE(c: Choices): Beat[] {
  const built = builtNow(c);
  const s = new Script({ ...BASE, night: 9, sky: 'night', mira: 'stand', miraLight: true, built });
  s.say('narrator', 'Night nine. Mira’s lantern is back at the far post. She doesn’t call across. She loads her side of the basket and waits.');
  s.say('narrator', 'It is your move. Whatever you send now is an answer.');
  if (
    !s.choose(c, 'answer', 'How do you answer?', [
      { value: 'empty', label: 'Send it empty', detail: 'Let her open a basket with nothing in it, and see how that feels.' },
      { value: 'away', label: 'Don’t go to the post', detail: 'Let the line hang slack. You’re done depending on her.' },
      { value: 'anyway', label: 'Send the oil, as agreed', detail: 'One bad night doesn’t have to decide the rest.' },
      { value: 'half', label: 'Send half, with a note', detail: '“THE REST WHEN THE SALVE COMES.”' },
    ])
  )
    return s.beats;
  const repair = 'a small clay pot of salve and a twist of bark — a third, maybe, of what she owed';
  switch (c.answer) {
    case 'empty':
      s.say('narrator', `The baskets swap. Yours goes over empty. Hers comes back with ${repair}.`, { basket: 'middle' });
      s.say('narrator', 'Across the gorge, Mira opens an empty basket. She doesn’t shout. She stands there with her lantern for a long time, and then she puts it out.', { basket: 'east', mira: 'turned' });
      s.say('hollis', 'Well. She’ll have felt that.', { miraLight: false, mira: 'none' });
      s.say('hollis', 'Mind — she sent salve. Whatever else she is, she sent salve.');
      break;
    case 'away':
      s.say('narrator', 'You don’t go to the post. From the window you watch her lantern wait.');
      s.say('narrator', 'Near midnight she hauls her side alone. The basket jerks out over the gorge, stops dead in the middle, and hangs there in the rain.', { basket: 'middle', rain: true });
      s.say('narrator', 'In the morning you can see it from the town: a small dark shape over the drop, with something in it. When you finally haul it in, two nights later, the salve inside has gone to grey water.', { mira: 'none', miraLight: false, frayed: built !== 'none' });
      s.say('mira', 'I didn’t know if you were sick, or angry, or gone. I sent what I had. It sat out there for two nights.', { night: 11, mira: 'stand', miraLight: true, rain: false, basket: 'east' });
      s.say('insight', 'Stepping back kept you safe from her. It also kept you from hearing what she had to say.');
      break;
    case 'anyway':
      s.say('narrator', `Your oil goes over. Hers comes back with ${repair}.`, { basket: 'east' });
      s.say('mira', 'You sent it anyway.', { mira: 'lantern-up' });
      s.say('mira', 'Why?');
      s.say('narrator', 'There isn’t an answer that fits across a gorge. You lift your lantern. After a moment, she lifts hers.');
      s.say('hollis', 'Salve’s salve. I’ll take a third.');
      s.say('hollis', 'Mind you, she’s learned you’ll send whatever happens. Some people take that as a gift. Some take it as a policy.');
      s.say('insight', 'You gave her a way back without asking anything for it, and she took it. Whether that’s generosity or an invitation depends on who is on the other side.');
      break;
    case 'half':
      s.say('narrator', `Half the oil goes over, your note tied to the jar. Hers comes back with ${repair}.`, { basket: 'east' });
      s.say('narrator', 'She reads the note by her lantern.', { mira: 'lantern-up' });
      s.say('mira', 'Fair.');
      s.say('mira', 'That’s fair. I’d have done the same, and been less polite about it.');
      s.say('narrator', 'Two nights later the rest of the salve comes over, wrapped twice. The rest of your oil goes the other way.', { night: 11, mira: 'stand' });
      s.say('hollis', 'That’s not trust, exactly. It’s better. It’s a rule you can both see.');
      s.say('insight', 'Forgiving her didn’t mean letting it go. It meant leaving a door open — and saying exactly where it was.');
      break;
  }
  return s.beats;
}

function sceneE2(c: Choices): Beat[] {
  const built = builtNow(c);
  const s = new Script({ ...BASE, night: 10, sky: 'night', mira: 'stand', miraLight: true, built });
  s.say('narrator', 'Night ten. Her lantern again. She loads her side and waits, the way she always does.');
  s.say('narrator', 'You know what she must be thinking. She sent salve, and got nothing.');
  if (
    !s.choose(c, 'again', 'Her basket is loaded. Yours?', [
      { value: 'stop', label: 'Send the oil this time', detail: 'Somebody has to stop first.' },
      { value: 'continue', label: 'Empty again', detail: 'She started this.' },
    ])
  )
    return s.beats;
  if (c.again === 'continue') {
    s.say('narrator', 'Both baskets cross empty.', { basket: 'middle' });
    s.say('narrator', 'Night eleven: the same. Night twelve: the same. Neither of you could say any more whose turn it was to stop.', { night: 12, basket: 'east', mira: 'turned' });
    if (built !== 'none') s.say('narrator', 'The guide line, which nobody is tending, starts to fray where it rubs the rock.', { frayed: true });
    s.say('hollis', 'Two of you, punishing each other with nothing. It’s almost restful.');
    s.say('insight', 'Each empty basket was an answer to the one before it. That is how it keeps going: everyone is only ever responding.');
  } else {
    s.say('narrator', 'Your oil crosses. Her basket comes back empty — she is answering last night, not tonight.', { basket: 'east', mira: 'turned' });
    s.say('narrator', 'You send oil again the next night. This time her basket comes back with bark. Not much. A beginning.', { night: 11, mira: 'stand' });
    s.say('mira', 'I thought you’d keep going. I would have.');
    s.say('insight', 'The echo didn’t stop because either of you was owed less. It stopped because someone went first.');
  }
  return s.beats;
}

function sceneF(c: Choices): Beat[] {
  const built = builtNow(c);
  const s = new Script({ ...BASE, night: 13, sky: 'storm', rain: true, mira: 'stand', miraLight: true, built, frayed: frayed(c) });
  s.say('narrator', 'Night thirteen. A storm off the high peaks — not like the one that took the bridge, but close enough that Hollis sits up when the shutters bang.');
  if (cycleRan(c)) s.say('narrator', 'There has been no trade for days. But tonight a lantern blinks from the far post, in the keepers’ code: TRY AGAIN?');
  else s.say('narrator', 'There is a trade agreed for tonight, the last before the hard freeze: your oil, her bark.');
  if (
    !s.choose(c, 'load', 'What do you load?', [
      { value: 'agreed', label: 'The agreed share', detail: 'Oil, wrapped tight against the rain.' },
      { value: 'short', label: 'Less than agreed', detail: 'In weather like this, who could tell?' },
    ])
  )
    return s.beats;
  s.say('narrator', 'You haul. Halfway over, the wind catches the basket and spins it hard. Something falls out of it into the dark. You can’t see what.', { basket: 'middle' });
  s.say('narrator', 'Her basket reaches you with the bark inside soaked through — black, ruined pulp. You can’t tell if it was ever any good.', { basket: 'east' });
  s.say('narrator', 'Across the gorge, Mira holds your basket up to her lantern. Even from here, you can see that it’s empty.', { mira: 'lantern-up' });
  if (c.load === 'short') s.say('narrator', 'You know what was in it: less than you promised. Now there is nothing, and only you know it was ever less.');
  s.say('narrator', 'The signal lamp is by your hand. Shutters, a flame, the old keepers’ code. Short words only.');
  if (
    !s.choose(c, 'signal', 'What do you signal?', [
      { value: 'explain', label: 'STORM TOOK IT. SENDING AGAIN.', detail: 'Tell her what happened on your side.' },
      { value: 'ask', label: 'WHAT DID YOU SEND?', detail: 'Ask before deciding what the ruined bark means.' },
      { value: 'silent', label: 'Nothing', detail: 'Let the morning sort it out.' },
      { value: 'accuse', label: 'SPOILED. AGAIN?', detail: 'She’s done this before.' },
    ])
  )
    return s.beats;
  const reading = stormReading(c);
  switch (c.signal) {
    case 'explain':
      if (reading === 'clear') {
        s.say('lamp', 'SAME HERE. BARK WAS DRY WHEN IT LEFT. TOMORROW.');
        s.say('narrator', 'Two messages crossing in the dark, each one making the other’s basket make sense.');
      } else {
        s.say('lamp', 'MAYBE.');
        s.say('narrator', 'Just that. In her place, you might have said the same.');
      }
      break;
    case 'ask':
      s.say('lamp', 'WRAPPED IN OILCLOTH. IT TORE?');
      s.say('lamp', 'YOURS CAME EMPTY. WHY?');
      s.say('narrator', c.load === 'short' ? 'You signal back: STORM. It is true, as far as it goes.' : 'You signal back: STORM. SAME AS YOURS.');
      if (reading === 'clear') s.say('lamp', 'TOMORROW THEN.');
      else s.say('lamp', 'MAYBE.');
      break;
    case 'silent':
      s.say('narrator', 'You leave the lamp dark. Across the gorge her lantern stays at the post a while longer, and then goes.', { mira: 'none', miraLight: false });
      if (reading === 'misread') s.say('mira', 'An empty basket, on a stormy night. Very convenient.', { night: 14, sky: 'night', rain: false, mira: 'turned', miraLight: true });
      else s.say('narrator', 'She never mentions the empty basket. The next night she sends half the usual bark, like someone checking.', { night: 14, sky: 'night', rain: false, mira: 'stand', miraLight: true });
      break;
    case 'accuse':
      s.say('lamp', 'I WRAPPED IT IN MY OWN COAT.');
      s.say('narrator', 'Then nothing. Her lantern goes out.', { mira: 'none', miraLight: false });
      s.say('mira', 'You looked at wet bark and decided it was me. And your basket was empty — and I’m supposed to believe that was the weather?', { night: 14, sky: 'night', rain: false, mira: 'turned', miraLight: true });
      break;
  }
  if (reading === 'clear') s.say('insight', 'The signal didn’t change what the storm did. It changed what each of you believed the other had done.');
  else if (reading === 'misread') s.say('insight', 'Neither of you could see the other side of the storm. Each of you filled in the blank with the other person’s worst night.');
  else s.say('insight', 'The truth did cross the gorge. Whether it was believed depended on everything that had crossed before it.');
  return s.beats;
}

function gStage(c: Choices): Stage {
  return { ...BASE, night: 16, sky: 'frost', mira: 'stand', miraLight: true, built: builtNow(c), frayed: frayed(c) };
}

const LAST_OPTIONS = {
  together: { value: 'together' as const, label: 'Finish the span together', detail: 'Both walk out from the posts. Both trust the other’s knots.' },
  staged: { value: 'staged' as const, label: 'Build it in stages', detail: 'Her plank first, then your rope, then the next. Nobody stands on faith.' },
  alone: { value: 'alone' as const, label: 'Winter without the bridge', detail: 'Trade the oil for the bark, keep your distance, rely on yourselves.' },
};

function sceneG(c: Choices): Beat[] {
  const s = new Script(gStage(c));
  const stance = miraStance(c);
  s.say('narrator', 'Night sixteen. Frost on the cable, white as bone. The pass will close any day now.');
  if (stance === 'open') s.say('mira', 'All the mill timber’s on my side. Your rope’s on yours. If we both walk out from the posts tomorrow, we could tie the last span in the middle. A real walkway. Before the snow.', { mira: 'lantern-up' });
  else if (stance === 'wary') s.say('mira', 'I’ve got timber. You’ve got rope. We could finish a walkway, maybe. I’ll be honest — I don’t know that I want to stand in the middle of the Ashgill on your knots.');
  else s.say('mira', 'I’m here because Orrin’s Rest still needs oil for the dark weeks. That’s all. I’m not walking out on anything you’ve tied.', { mira: 'turned' });
  s.say('mira', 'There’s one last load of Varn bark. I’ll trade it for the winter oil. Hollis’s leg, Tav’s fever. Same as always.');
  if (liedAboutStorm(c)) s.say('narrator', 'She doesn’t mention the storm night. She believed you about it.');
  s.say('hollis', 'Your call. It’s always been your call — and hers.');
  if (
    !s.choose(c, 'offer', 'What do you offer?', [
      LAST_OPTIONS.together,
      LAST_OPTIONS.staged,
      { value: 'ask', label: 'First, ask about night seven', detail: 'You want to hear it from her before you decide.' },
      LAST_OPTIONS.alone,
      { value: 'keep', label: 'Agree — then keep the oil', detail: 'She took what she needed once. So can you.' },
    ])
  )
    return s.beats;
  if (c.offer !== 'ask') lastNightOutcome(s, c);
  return s.beats;
}

function sceneG2(c: Choices): Beat[] {
  const s = new Script(gStage(c));
  const stance = miraStance(c);
  if (stance === 'closed') {
    s.say('mira', 'Tav was sick. I chose him. That’s the whole of it.', { mira: 'turned' });
    s.say('mira', 'You want my reasons now, after all this? Fine. Those are my reasons.');
  } else {
    s.say('mira', 'Tav had the fever. He was eleven hours from anyone who could help, and I had the bark in my pack.', { mira: 'stand' });
    s.say('mira', 'I’d do it again. I want you to know that, so you don’t think I’m sorry for the wrong thing.');
    s.say('mira', 'I’m sorry I decided it alone. I should have stood at that post and told you before, not left you a note after. You’d have been angry. But you’d have known.');
    if (c.signal === 'ask') s.say('mira', 'You asked, the storm night too. Most people just decide what you meant.');
  }
  if (stanceAfterAsking(c) === 'open' && stance === 'wary') s.say('narrator', 'Something in the way she stands has changed. Not trust, exactly. Less guessing.', { mira: 'lantern-up' });
  if (!s.choose(c, 'after', 'Now that you’ve heard it — what do you offer?', [LAST_OPTIONS.together, LAST_OPTIONS.staged, LAST_OPTIONS.alone])) return s.beats;
  lastNightOutcome(s, c);
  return s.beats;
}

/** The immediate reply to the last offer; the ending scene shows what grows from it. */
function lastNightOutcome(s: Script, c: Choices) {
  const e = ending(c);
  if (!e) return;
  switch (e.variant) {
    case 'span-together':
      s.say('mira', 'Tomorrow, then. Bring good rope.', { mira: 'lantern-up' });
      break;
    case 'span-staged':
      s.say('mira', 'Plank, rope, plank, rope. Nobody stands on faith.');
      s.say('mira', 'I like that better than faith, if I’m honest.', { mira: 'lantern-up' });
      break;
    case 'line-skimmed':
      s.say('mira', 'Tomorrow. Bring rope.');
      break;
    case 'line-first-knot':
      s.say('mira', 'Together. On faith.');
      s.say('narrator', 'She doesn’t say no. She doesn’t say yes.');
      break;
    case 'line-not-this-winter':
      s.say('mira', 'Not this winter.', { mira: 'turned' });
      s.say('narrator', 'But she doesn’t cut the line.');
      break;
    case 'line-trade':
      s.say('mira', 'Oil for bark, then. Like the first night.');
      break;
    case 'banks-alone':
      s.say('mira', 'Suits me.', { mira: 'turned' });
      break;
    case 'banks-kept':
      s.say('narrator', 'The baskets swap. Hers brings you the last of the Varn bark. Yours brings her nothing.', { basket: 'east' });
      s.say('narrator', 'Across the gorge she lifts the empty basket, and you think of the night she did this to you, and you wait to feel even.', { mira: 'lantern-up' });
      s.say('mira', 'I suppose I taught you that.', { mira: 'turned' });
      break;
  }
}

function sceneH(c: Choices): Beat[] {
  const e = ending(c);
  const s = new Script({ ...gStage(c), night: 19, sky: 'dawn', snow: true });
  if (!e) return s.beats;
  switch (e.variant) {
    case 'span-together':
    case 'span-staged':
      s.say(
        'narrator',
        e.variant === 'span-staged'
          ? 'It goes up one plank at a time: her plank, your rope, her plank, your rope. Nobody has to stand on faith. By the end, nobody needs to.'
          : 'You walk out from your post as she walks out from hers, each of you on the other’s knots, and you tie the last span in the middle with the wind pulling at your coats.',
        { built: 'span', frayed: false, mira: 'crossing' },
      );
      s.say('narrator', 'The first snow comes three days later. By then there is a walkway across the Ashgill — narrow, swaying, planks lashed to hemp — with a lantern at each end.');
      s.say('narrator', 'Mira crosses it first. She stops in the middle, where the baskets used to swap, looks down at the drop, and laughs.');
      s.say('mira', 'So you’re the one who’s been eating my bark.');
      s.say('hollis', 'And you’re the one who’s been burning our oil.');
      if (cycleBroken(c)) s.say('narrator', 'Neither of you talks about the empty baskets. But both of you remember who stopped first.');
      if (c.answer === 'half') s.say('narrator', 'Some nights the old note is still tied to her post: THE REST WHEN THE SALVE COMES. She says she keeps it as a reminder of the night you both learned to say what you meant.');
      if (liedAboutStorm(c)) s.say('narrator', 'Once, on the walkway, she mentions the storm night — how glad she was you told her. You don’t correct her. It sits in you like a small stone in a boot: the kind you can walk on for years.');
      s.say('narrator', 'The old cable still runs underneath. Nobody suggests taking it down.');
      break;
    case 'line-skimmed':
      s.say('narrator', 'Her planks come over short — two in every five missing. The walkway reaches a third of the way out from each side and stops.', { built: 'line2' });
      s.say('mira', 'Councillor Dace kept back a share. He says the east will send whatever happens, so why pay full price.');
      s.say('mira', 'I told him he was wrong about you. Prove me right. Next time, ask for the planks before you send the rope.');
      s.say('narrator', 'The baskets keep crossing all winter, on two lines instead of one. In spring, you think, you’ll ask for the planks first.');
      break;
    case 'line-first-knot':
      s.say('narrator', 'You tie your end and walk out. Mira steps onto your rope as far as the first knot. Not the second.', { mira: 'crossing' });
      s.say('mira', 'Spring. Ask me again in spring.');
      s.say('narrator', 'The baskets keep crossing all winter. Every week she walks out one knot further, and back.');
      break;
    case 'line-not-this-winter':
      s.say('narrator', 'The oil and the last of the bark cross the old cable. No more than that.');
      s.say('narrator', 'Through the snow you can still see her lantern at the post, some nights. Some nights you blink yours. Once — only once — she blinks back.');
      break;
    case 'line-trade':
      s.say('narrator', 'You trade the oil for the bark across the old cable, the way you did the first night. No more, no less. It is enough to get both banks through.');
      s.say('narrator', 'When the snow comes, her lantern still appears at the post some nights. You still lift yours. The planks and the rope stay where they are, waiting for a spring that might want them.');
      break;
    case 'banks-alone':
      s.say('narrator', 'You trade one last time without a word. Then the snow comes, and the line goes slack.', { mira: 'none', miraLight: false, built: frayed(c) ? 'cut' : builtNow(c) });
      s.say('narrator', 'Hollis’s leg heals, slowly, on what bark you managed to get. Orrin’s Rest gets through the winter on what Mira can carry over the high road.');
      s.say('narrator', 'Some nights you look across for her lantern. Some nights it’s there.');
      break;
    case 'banks-kept':
      s.say('narrator', 'Hollis’s leg heals. Orrin’s Rest gets through the winter on what Mira can carry over the high road, which is not much, and not enough, and it gets through anyway.', { mira: 'none', miraLight: false });
      s.say('narrator', 'In spring the guide line is gone, cut at her post. The old cable stays. Cables don’t care.', { built: 'cut' });
      s.say('narrator', 'You are even now. It turns out even is a place two people can live, a long way apart.');
      break;
  }
  return s.beats;
}

// ---------------------------------------------------------------------------------------------------------------
// Navigation

export interface Position {
  scene: SceneId;
  beat: number;
}

export const START: Position = { scene: 'a', beat: 0 };

/** The beat at a position (clamped), or null past the end. */
export function beatAt(pos: Position, c: Choices): Beat | null {
  const beats = sceneBeats(pos.scene, c);
  return beats[Math.min(pos.beat, beats.length - 1)] ?? null;
}

/** The next position after the current beat, or null when the story is over. A pending choice blocks. */
export function next(pos: Position, c: Choices): Position | null {
  const beats = sceneBeats(pos.scene, c);
  const cur = beats[pos.beat];
  if (cur?.kind === 'choice' && c[cur.id] === undefined) return pos;
  if (pos.beat + 1 < beats.length) return { scene: pos.scene, beat: pos.beat + 1 };
  for (let i = SCENES.indexOf(pos.scene) + 1; i < SCENES.length; i++) {
    if (sceneApplies(SCENES[i], c) && sceneBeats(SCENES[i], c).length > 0) return { scene: SCENES[i], beat: 0 };
  }
  return null;
}

/** Record a choice at the current beat and move past it. Ignores a choice that isn't the one being asked. */
export function choose(pos: Position, c: Choices, id: DecisionId, value: string): { pos: Position; choices: Choices } | null {
  const beat = beatAt(pos, c);
  if (beat?.kind !== 'choice' || beat.id !== id || c[id] !== undefined) return null;
  if (!(OPTIONS[id] as readonly string[]).includes(value)) return null;
  const choices = { ...c, [id]: value } as Choices;
  const after = next(pos, choices);
  return after ? { pos: after, choices } : null;
}

/** Decisions in story order, with the scenes they belong to. */
const ORDER: DecisionId[] = SCENES.flatMap((s) => SCENE_DECISIONS[s] ?? []);

/**
 * Validate a saved run. Keeps only known values, in story order, and only decisions whose scene applies given the
 * earlier ones (so "again" without an empty basket is dropped). The position is moved back to the first unmade
 * decision before it, and clamped to the scene's beats, so a resumed run always continues from a valid beat.
 */
export function restore(raw: unknown): { pos: Position; choices: Choices } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { pos?: unknown; choices?: unknown };
  const rc = (o.choices && typeof o.choices === 'object' ? o.choices : {}) as Record<string, unknown>;
  const choices: Choices = {};
  for (const id of ORDER) {
    const v = rc[id];
    const scene = SCENES.find((s) => SCENE_DECISIONS[s]?.includes(id))!;
    if (typeof v !== 'string' || !(OPTIONS[id] as readonly string[]).includes(v) || !sceneApplies(scene, choices)) continue;
    // Within one scene a later decision needs the earlier one.
    const sameScene = SCENE_DECISIONS[scene]!;
    if (sameScene.slice(0, sameScene.indexOf(id)).some((d) => choices[d] === undefined)) continue;
    (choices as Record<string, string>)[id] = v;
  }
  const rp = (o.pos && typeof o.pos === 'object' ? o.pos : {}) as Record<string, unknown>;
  let scene: SceneId = SCENES.includes(rp.scene as SceneId) ? (rp.scene as SceneId) : 'a';
  let beat = typeof rp.beat === 'number' && Number.isInteger(rp.beat) && rp.beat >= 0 ? rp.beat : 0;
  if (!sceneApplies(scene, choices)) {
    scene = 'a';
    beat = 0;
  }
  // Walk forward from the start; stop at the first unmade decision before the saved position.
  let pos: Position = START;
  for (;;) {
    if (pos.scene === scene) {
      const beats = sceneBeats(scene, choices);
      const pending = beats.findIndex((b) => b.kind === 'choice' && choices[b.id] === undefined);
      const limit = pending === -1 ? beats.length - 1 : pending;
      return { pos: { scene, beat: Math.min(beat, limit) }, choices };
    }
    const beats = sceneBeats(pos.scene, choices);
    const pending = beats.findIndex((b) => b.kind === 'choice' && choices[b.id] === undefined);
    if (pending !== -1) return { pos: { scene: pos.scene, beat: pending }, choices };
    const n = next({ scene: pos.scene, beat: beats.length - 1 }, choices);
    if (!n) return { pos: { scene: pos.scene, beat: beats.length - 1 }, choices };
    pos = n;
  }
}

/** True once every beat of the ending scene exists, i.e. the final decision has been made. */
export function finished(c: Choices): boolean {
  return ending(c) !== null;
}

// ---------------------------------------------------------------------------------------------------------------
// Looking back

/**
 * The record of what crossed the gorge, night by night, for the reflection. Built only from the choices and
 * Mira's rules, so it never says something that didn't happen in this run.
 */
export function ledger(c: Choices): { night: string; text: string }[] {
  const out: { night: string; text: string }[] = [];
  const first = firstOutcome(c);
  if (first)
    out.push({
      night: 'Night 1',
      text: {
        ff: 'You both filled the basket.',
        sf: 'You sent half a jar; she sent a full bundle.',
        fs: 'You sent a full jar; she sent a stranger’s share.',
        ss: 'You both held back.',
      }[first],
    });
  if (c.rope) out.push({ night: 'Night 4', text: { all: 'You sent all the rope. A second line went up.', one: 'You sent one coil. A hand-line went up.', keep: 'You kept the rope. Nothing was built.' }[c.rope] });
  if (c.answer) {
    out.push({ night: 'Night 7', text: breachTone(c) === 'sorry' ? 'She kept the medicine for Orrin’s Rest, and said she was sorry.' : 'She kept the medicine for Orrin’s Rest, and called it even.' });
    out.push({
      night: 'Night 9',
      text: {
        empty: 'You answered with an empty basket. She had sent a third of what she owed.',
        away: 'You stayed away. Her repayment hung in the rain until it spoiled.',
        anyway: 'You sent the oil anyway. She sent a third of what she owed.',
        half: 'You sent half, and named your terms. She met them.',
      }[c.answer],
    });
  }
  if (c.again) out.push({ night: 'Night 10', text: c.again === 'stop' ? 'You stopped first. Two nights later, she did too.' : 'Empty baskets, both ways, for three nights.' });
  if (c.signal) {
    const r = stormReading(c);
    const what = { explain: 'You explained', ask: 'You asked what she’d sent', silent: 'You said nothing', accuse: 'You accused her' }[c.signal];
    const believed = r === 'clear' ? 'she understood' : r === 'doubt' ? 'she wasn’t sure' : 'she decided it was deliberate';
    out.push({ night: 'Night 13', text: `The storm emptied your basket${c.load === 'short' ? ' — which you had shorted' : ''}. ${what}; ${believed}.` });
  }
  const e = ending(c);
  if (e) {
    const how = { together: 'You offered to finish it together', staged: 'You offered to build in stages', alone: 'You chose to winter without the bridge', keep: 'You kept the oil' }[finalMove(c)!];
    out.push({ night: 'Night 16', text: `${c.offer === 'ask' ? 'You asked about night seven first. ' : ''}${how}.` });
  }
  return out;
}
