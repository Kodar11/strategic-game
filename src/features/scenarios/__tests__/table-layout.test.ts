import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tableLayout } from '../table-layout.ts';

// A table sits inside the rules card: the screen minus page and card padding.
const inner = (screen: number) => screen - 64;
const total = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

const METRIC = {
  head: ['Style', 'Calls/h', 'Solved', 'Min/call', 'Effort'],
  rows: [
    ['Thorough', '8', '90%', '7.5', '2'],
    ['Quick but careful', '15', '60%', '4', '2'],
    ['Rush and close', '30', '20%', '2', '1'],
  ],
};

test('a table that fits fills the width exactly', () => {
  const l = tableLayout(METRIC.head, METRIC.rows, inner(430));
  assert.equal(l.scroll, false);
  assert.ok(Math.abs(total(l.widths) - inner(430)) < 0.01);
});

test('when the table is too wide even with wrapped words, it scrolls instead of squeezing', () => {
  for (const screen of [320, 360, 390, 430]) {
    const l = tableLayout(METRIC.head, METRIC.rows, inner(screen));
    if (l.scroll) assert.ok(total(l.widths) > inner(screen));
    // No column is ever narrower than its header word plus padding.
    assert.ok(l.widths.every((w) => w >= 28));
  }
  assert.equal(tableLayout(METRIC.head, METRIC.rows, inner(320)).scroll, true);
});

test('the eleven-column voter table scrolls on a small phone', () => {
  const head = Array.from({ length: 11 }, (_, i) => String(i));
  const rows = [['2', '3', '5', '8', '10', '12', '14', '12', '8', '4', '3']];
  assert.equal(tableLayout(head, rows, inner(320)).scroll, true);
});

test('large system text never makes columns narrower', () => {
  const normal = tableLayout(METRIC.head, METRIC.rows, 2000);
  const large = tableLayout(METRIC.head, METRIC.rows, 2000, 1.5);
  assert.equal(large.scroll, false);
  // With room to spare both fill the width; the large-text columns need at least as much.
  assert.ok(total(large.widths) >= total(normal.widths) - 0.01);
});
