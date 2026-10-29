/**
 * How many columns a row of stats can use without breaking a value mid-number or squeezing labels into a tall
 * column. Text widths are estimated from character counts (Inter's average advance at each size), scaled by the
 * system font scale, so the layout adapts to the device width and the user's text-size setting.
 */

export interface StatText {
  label: string;
  value: string;
  caption?: string;
}

/** Font size of a stat value in the grid layout. */
export const STAT_VALUE_SIZE = 28;
/** Font size of a stat value in the single-column list layout. */
export const STAT_LIST_VALUE_SIZE = 22;
export const STAT_GAP = 8;
/** Horizontal padding plus border inside one stat card. */
const CELL_CHROME = 26;
const LABEL_SIZE = 12;
/** Word wrapping leaves ragged line ends; allow for it when counting label lines. */
const WRAP_SLACK = 1.15;

/** Approximate advance of a glyph as a fraction of the font size (Inter, tabular digits), rounded up slightly. */
function glyphEm(ch: string) {
  if (/[0-9]/.test(ch)) return 0.64;
  if (/[\s.,:;'’!|ijlft1()/]/.test(ch)) return 0.32;
  if (/[%mwMW—−×]/.test(ch)) return 0.9;
  if (/[A-Z]/.test(ch)) return 0.7;
  return 0.58;
}

/**
 * Estimated rendered width of a single line of text, in dp. Errs on the wide side (letter spacing, and small
 * differences between platforms' text rendering), since an underestimate breaks a word mid-way.
 */
export function estimateTextWidth(text: string, size: number, fontScale = 1) {
  let em = 0;
  for (const ch of text) em += glyphEm(ch);
  return em * size * fontScale * 1.06 + 2;
}
const textWidth = estimateTextWidth;

/**
 * 3 or 2 columns when every value fits on one line and labels stay within a couple of lines; otherwise 1, which the
 * grid draws as a compact label-and-value list.
 */
export function statColumns(stats: readonly StatText[], width: number, fontScale = 1, max: 2 | 3 = 3): 1 | 2 | 3 {
  const scale = Math.max(1, fontScale);
  for (let n = Math.min(max, stats.length); n >= 2; n--) {
    const inner = (width - STAT_GAP * (n - 1)) / n - CELL_CHROME;
    if (inner <= 0) continue;
    const valuesFit = stats.every((s) => textWidth(s.value, STAT_VALUE_SIZE, scale) <= inner);
    const maxLines = n === 3 ? 2 : 3;
    const labelsFit = stats.every((s) =>
      [s.label, s.caption ?? ''].every((t) => Math.ceil((textWidth(t, LABEL_SIZE, scale) * WRAP_SLACK) / inner) <= maxLines),
    );
    if (valuesFit && labelsFit) return n as 2 | 3;
  }
  return 1;
}

/** Splits items into rows of `n`. The last row may be shorter; its cards stretch to fill it. */
export function chunkRows<T>(items: readonly T[], n: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
  return rows;
}
