import { estimateTextWidth } from '../../components/lesson/stat-layout.ts';

/**
 * Column widths for a small data table. Columns get the width their longest cell needs; when the table is too wide,
 * cells wrap at word boundaries (never mid-word); when even that doesn't fit, the table keeps readable widths and
 * scrolls sideways inside its own container.
 */

export const TABLE_CELL_PAD = 6;
const HEAD_SIZE = 12;
const BODY_SIZE = 14;
/** The first column names the row, so it may take more room before wrapping. */
const FIRST_CAP = 150;
const OTHER_CAP = 120;
const MIN_COL = 28;

export interface TableLayout {
  widths: number[];
  /** True when the columns are wider than the space available: the table scrolls horizontally. */
  scroll: boolean;
}

function cellWidths(head: readonly string[], rows: readonly (readonly string[])[], fontScale: number, measure: (t: string) => string[]) {
  return head.map((h, j) => {
    const cells = [{ text: h, size: HEAD_SIZE }, ...rows.map((r) => ({ text: r[j] ?? '', size: BODY_SIZE }))];
    return Math.max(MIN_COL, ...cells.flatMap((c) => measure(c.text).map((t) => estimateTextWidth(t, c.size, fontScale) + TABLE_CELL_PAD * 2)));
  });
}

export function tableLayout(head: readonly string[], rows: readonly (readonly string[])[], available: number, fontScale = 1): TableLayout {
  const scale = Math.max(1, fontScale);
  const capped = (w: number, j: number) => Math.min(w, j === 0 ? FIRST_CAP : OTHER_CAP);
  // Width of the whole text, and of its longest word (the narrowest a cell can be without breaking a word).
  const natural = cellWidths(head, rows, scale, (t) => [t]);
  const minimum = cellWidths(head, rows, scale, (t) => t.split(/\s+/));
  // When scrolling, the pinned first column wraps rather than take more than ~40% of the visible width.
  const preferred = natural.map((w, j) => Math.max(minimum[j], j === 0 ? Math.min(w, FIRST_CAP, available * 0.4) : capped(w, j)));
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

  if (sum(minimum) > available) return { widths: preferred, scroll: true };
  // Start from each column's narrowest width and share out the rest in proportion to how much more each wants.
  const spare = available - sum(minimum);
  const want = natural.map((w, j) => Math.max(0, w - minimum[j]));
  const totalWant = sum(want);
  if (totalWant <= spare) {
    // Everything fits on one line: share what's left in proportion to the natural widths.
    const extra = (available - sum(natural)) / natural.length;
    return { widths: natural.map((w) => w + extra), scroll: false };
  }
  return { widths: minimum.map((m, j) => m + (spare * want[j]) / totalWant), scroll: false };
}
