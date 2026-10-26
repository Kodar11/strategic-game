/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SETTINGS, sanitizeSettings } from '../settings.ts';

describe('Settings persistence', () => {
  it('narration is on for a new install', () => {
    assert.equal(DEFAULT_SETTINGS.narration, true);
    assert.equal(sanitizeSettings(undefined).narration, true);
  });

  it('a saved mute survives a restart', () => {
    const saved = JSON.parse(JSON.stringify({ ...DEFAULT_SETTINGS, narration: false }));
    assert.equal(sanitizeSettings(saved).narration, false);
  });

  it('an older save without the narration key gets the default and keeps its other settings', () => {
    assert.deepEqual(sanitizeSettings({ reduceMotion: true, haptics: false }), { reduceMotion: true, haptics: false, narration: true });
  });

  it('malformed values fall back to defaults', () => {
    assert.deepEqual(sanitizeSettings({ narration: 'no', haptics: 0, extra: true }), DEFAULT_SETTINGS);
    assert.deepEqual(sanitizeSettings('garbage'), DEFAULT_SETTINGS);
  });
});
