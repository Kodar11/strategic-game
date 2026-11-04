import { personality } from './catalog.ts';
import { TT_GROUP, type TwoThirdsBot, lineup } from './two-thirds.ts';

/**
 * What the Two-Thirds board may show about the group. While a mystery crowd is hidden, every bot looks the same and the
 * picks are listed in number order, so nothing but the picks themselves (the evidence the read is about) says who the
 * crowd is. Pure, so the guarantee can be tested without rendering.
 */
export interface TwoThirdsPublicView {
  intro: string;
  groupLine: string;
  /** One tone per bot pick, in the order `picks` returns them. */
  dotTones: ('crowd' | 'other' | 'neutral')[];
  /** Bot picks in the order they may be drawn and read out. */
  picks: number[];
}

export function twoThirdsPublic(crowd: TwoThirdsBot, hidden: boolean, bots: readonly number[] = []): TwoThirdsPublicView {
  const base = `Target = ⅔ × the average of all ${TT_GROUP + 1} picks (yours included). Closest wins. The other ${TT_GROUP} are simulated reasoners`;
  if (hidden) {
    return {
      intro: `${base}, and who they are stays hidden until the reveal.`,
      groupLine: `The group: ${TT_GROUP} simulated players. Their type stays hidden until the reveal.`,
      dotTones: bots.map(() => 'neutral'),
      picks: [...bots].sort((a, b) => a - b),
    };
  }
  const types = lineup(crowd);
  return {
    intro: `${base}: see who they are below.`,
    groupLine: `The group: 5 × ${personality('two-thirds', crowd)?.name ?? crowd}, plus one each of the other types. Simulated, not real people.`,
    dotTones: bots.map((_, i) => (types[i] === crowd ? 'crowd' : 'other')),
    picks: [...bots],
  };
}
