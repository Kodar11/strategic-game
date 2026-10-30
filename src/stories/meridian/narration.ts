import { MATCH_ROUNDS, PAYOFFS, ROOMS, entrant, playMatch } from './engine.ts';

/**
 * Spoken lines for Story Two, read by the Steward. Each is the on-screen sentence, verbatim. Sentences that state this
 * run's results (ranks, winners, scores) are deliberately not voiced: they differ per run, and recording every
 * combination would be absurd, so they stay on screen and the sound design marks them instead.
 *
 * The echo illustration's scripted slip lives here so the line about it and the match on screen can't disagree.
 */

export const ECHO = { slips: [{ side: 'a' as const, round: 3 }], rounds: 14 };
const echoLongMemory = playMatch(entrant('mirror'), entrant('long-memory'), ECHO);
const echoPerfect = ECHO.rounds * PAYOFFS.R;

export const MERIDIAN_LINES = {
  'mer.enter.1': 'Under the dome, twelve plinths stand in a ring. On each one, a contestant has left a rule: a short instruction for what to do when it meets someone.',
  'mer.enter.2': `Every rule meets every other, one by one, for ${MATCH_ROUNDS} rounds at a time. Each round both sides choose at the same moment — to share, or to take — and points are paid out. Then they choose again.`,
  'mer.enter.3': 'Whoever earns the most points across the whole hall wins the Trials.',
  'mer.enter.4': 'You have one plinth. What you put on it is up to you.',
  'mer.pick.1': 'Three rules are already written. Pick one to place on your plinth.',
  'mer.single.1': 'Before your rule plays, the stewards ask you to play one meeting yourself, against a stranger you will never see again.',
  'mer.single.took': 'They shared. You took. Five points to nothing — the best result there is, for you.',
  'mer.single.shared': 'They shared too. Three points each.',
  'mer.single.2': 'Look at the table again. Whatever the stranger does, taking pays you more: 5 instead of 3 if they share, 1 instead of 0 if they take. In a single meeting, taking is the safe bet.',
  'mer.single.3': 'Now add both sides together. If you both share, the pair makes 6. If you both follow the safe bet and take, the pair makes 2.',
  'mer.single.insight': 'What is best for each of you alone leaves both of you worse off together.',
  'mer.single.name': 'This shape of situation has a name: the prisoner’s dilemma. Sharing is usually called cooperating; taking, defecting.',
  'mer.repeat.insight': 'When you meet again, a move isn’t only a move. It’s what the other side will answer next round.',
  'mer.echo.1': 'In the practice hall, two Mirrors are paired. They should share forever. But in round 4, the first Mirror’s hand slips — it meant to share, and took.',
  'mer.echo.mirror': 'Watch what the one slip does. Mirror B answers it — fairly. Mirror A answers that. Then B answers A. The defection bounces back and forth for the rest of the match, and neither of them ever chooses to stop.',
  'mer.echo.long-memory': `The Long Memory never forgets a defection. One slip, and both sides take for the rest of the match — ${echoLongMemory.b} points each where there could have been ${echoPerfect}.`,
  'mer.echo.patient': 'This partner waits for two defections in a row before hitting back. It lets the single slip pass, and the echo dies after one round.',
  'mer.echo.insight': 'Hitting back stops you from being used. It can also keep a fight going long after anyone remembers why it started.',
  'mer.trials.1': `Twelve rules: yours, and one of each kind the stewards could find. Everyone meets everyone, including a copy of itself. ${MATCH_ROUNDS} rounds a match.`,
  'mer.trials.insight': 'A rule that never beats anyone can still come out on top — by doing well with everyone.',
  'mer.trials.tft': 'In 1980 the political scientist Robert Axelrod invited researchers to submit rules for a repeated prisoner’s dilemma tournament. Tit for Tat — cooperate first, then copy the other side’s last move — was one of the simplest entries, and it won. It won a second, larger tournament too.',
  'mer.rooms.1': 'The stewards open three more halls. Same rules, same table — different company. Try each, with any of the three starting rules.',
  'mer.rooms.friendly': ROOMS.friendly.blurb,
  'mer.rooms.hostile': ROOMS.hostile.blurb,
  'mer.rooms.noisy': ROOMS.noisy.blurb,
  'mer.rooms.friendly.insight': 'A room full of unconditional sharers is a feast for anyone willing to take.',
  'mer.rooms.hostile.insight': 'Forgiveness that never stops is a weakness in a room like this one.',
  'mer.rooms.noisy.insight': 'When mistakes happen, a little forgiveness keeps one accident from becoming a feud.',
  'mer.population.1': 'One last experiment before your final entry. Suppose each season, rules that scored well are copied by more contestants, and rules that scored badly are abandoned. The hall fills up with whatever is working.',
  'mer.population.insight': 'The room decides which rules do well — and the rules that do well remake the room.',
  'mer.design.1': 'The last trial runs your rule through every hall at once: the Open Trials, the Garden, the Iron Hall and the Fog. Build it however you like.',
  'mer.final.insight': '“What’s the best strategy?” has no answer on its own. Best against whom, in what room, under which rules?',
  'mer.reflect.1': 'You came looking for the best strategy.',
  'mer.reflect.2': 'But a strategy never plays alone. It meets other strategies, under particular rules, in a room that can change — and that its own success helps to change.',
  'mer.reflect.3': 'Sometimes you gain more by shaping the conditions so that cooperating becomes worthwhile than by trying to outsmart everyone in the room.',
  'mer.reflect.question': 'Where could changing the structure of an interaction create a better outcome than simply trying to win it?',
} as const;

export type MeridianClip = keyof typeof MERIDIAN_LINES;

/** Story One's reflection, read by the storyteller after the ending has been left to settle. */
export const CROSSING_REFLECTION_LINES = {
  'dbu.reflect.1': 'Trust is not a promise that nothing will go wrong. It is something people build out of what they do, how they answer when something does go wrong, and whether they can find a way forward together.',
  'dbu.reflect.2': 'Cooperating doesn’t mean ignoring harm. Forgiving doesn’t mean giving up your boundaries. And sometimes the difference between a broken arrangement and a repaired one starts with a message that makes the truth a little clearer.',
  'dbu.reflect.question': 'What is one situation where you could make cooperation easier without giving up your boundaries?',
} as const;
