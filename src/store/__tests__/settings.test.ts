/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SETTINGS, sanitizeSettings } from '../settings.ts';

describe('Settings persistence', () => {
  it('a new install has haptics on, in-app reduce motion off and onboarding still to do', () => {
    assert.deepEqual(sanitizeSettings(undefined), { reduceMotion: false, haptics: true, onboarded: false });
    assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  });

  it('saved preferences survive a restart', () => {
    const saved = JSON.parse(JSON.stringify({ reduceMotion: true, haptics: false, onboarded: true }));
    assert.deepEqual(sanitizeSettings(saved), { reduceMotion: true, haptics: false, onboarded: true });
  });

  it('a save from before onboarding existed is treated as a returning user', () => {
    assert.deepEqual(sanitizeSettings({ reduceMotion: true, haptics: false, narration: true }), { reduceMotion: true, haptics: false, onboarded: true });
  });

  it('an explicit not-yet-onboarded save is kept, so an unfinished welcome shows again', () => {
    assert.equal(sanitizeSettings({ ...DEFAULT_SETTINGS, onboarded: false }).onboarded, false);
  });

  it('the removed narration preference is dropped', () => {
    assert.equal('narration' in sanitizeSettings({ narration: false }), false);
  });

  it('malformed values fall back to defaults', () => {
    assert.deepEqual(sanitizeSettings({ reduceMotion: 'no', haptics: 0, onboarded: 'yes', extra: true }), { ...DEFAULT_SETTINGS, onboarded: true });
    assert.deepEqual(sanitizeSettings('garbage'), DEFAULT_SETTINGS);
  });
});
