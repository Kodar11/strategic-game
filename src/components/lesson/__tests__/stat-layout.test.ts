import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chunkRows, statColumns } from '../stat-layout.ts';

// Inner widths of a stat row inside a card: the screen minus page and card padding.
const PHONE_320 = 320 - 64;
const PHONE_360 = 360 - 64;
const PHONE_430 = 430 - 64;

const cournot = [
  { label: 'Your best reply', value: '3.5 units' },
  { label: 'Your profit', value: '12.25' },
  { label: 'Price', value: '5.0' },
];

test('values with units fall back to a list on narrow phones and use two columns on wide ones', () => {
  assert.equal(statColumns(cournot, PHONE_360), 1);
  assert.equal(statColumns(cournot, PHONE_430), 2);
});

test('long labels keep three narrow columns from forming', () => {
  const attrition = [
    { label: 'Expected gain per round', value: '4.00' },
    { label: 'Cost per round', value: '1' },
    { label: 'Value of staying in', value: '3.12' },
  ];
  assert.notEqual(statColumns(attrition, PHONE_360), 3);
});

test('short values with short labels use three columns', () => {
  const core = ['A', 'B', 'C'].map((label) => ({ label, value: '30' }));
  assert.equal(statColumns(core, PHONE_320), 3);
});

test('percentages fit two columns at 360dp but large system text moves them to a list', () => {
  const evolution = [
    { label: 'After 60 generations', value: '100.0%' },
    { label: 'Prediction (V/C)', value: '100%' },
  ];
  assert.equal(statColumns(evolution, PHONE_360), 2);
  assert.equal(statColumns(evolution, PHONE_360, 1.6), 1);
});

test('never more columns than stats', () => {
  assert.equal(statColumns([{ label: 'Average', value: '60' }], PHONE_430), 1);
  assert.equal(statColumns([{ label: 'A', value: '1' }, { label: 'B', value: '2' }], PHONE_430), 2);
});

test('chunkRows keeps every item in order', () => {
  assert.deepEqual(chunkRows([1, 2, 3], 2), [[1, 2], [3]]);
  assert.deepEqual(chunkRows([1, 2, 3], 3), [[1, 2, 3]]);
});
