/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SETTINGS, consentFromSave, sanitizeSettings } from '../settings.ts';

describe('Settings persistence', () => {
  it('a new install has haptics and narration on, in-app reduce motion off and onboarding still to do', () => {
    assert.deepEqual(sanitizeSettings(undefined), { reduceMotion: false, haptics: true, narration: true, sounds: true, onboarded: false, usageConsent: 'unset' });
    assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  });

  it('saved preferences survive a restart', () => {
    const saved = JSON.parse(JSON.stringify({ reduceMotion: true, haptics: false, narration: false, sounds: false, onboarded: true }));
    assert.deepEqual(sanitizeSettings(saved), { reduceMotion: true, haptics: false, narration: false, sounds: false, onboarded: true, usageConsent: 'unset' });
  });

  it('a save from before onboarding existed is treated as a returning user', () => {
    assert.deepEqual(sanitizeSettings({ reduceMotion: true, haptics: false, narration: true }), { reduceMotion: true, haptics: false, narration: true, sounds: true, onboarded: true, usageConsent: 'unset' });
  });

  it('analytics consent defaults to unset, and only an explicit choice is kept', () => {
    assert.equal(DEFAULT_SETTINGS.usageConsent, 'unset');
    for (const c of ['unset', 'granted', 'denied'] as const) assert.equal(sanitizeSettings({ ...DEFAULT_SETTINGS, usageConsent: c }).usageConsent, c);
    for (const bad of ['yes', true, 1, null, 'GRANTED']) assert.equal(sanitizeSettings({ usageConsent: bad }).usageConsent, 'unset', String(bad));
  });

  it('old boolean saves migrate safely: the old default (true) is not consent; an explicit off stays off', () => {
    assert.equal(consentFromSave({ shareUsageData: true }), 'unset');
    assert.equal(consentFromSave({ shareUsageData: false }), 'denied');
    assert.equal(consentFromSave({}), 'unset');
    assert.equal(sanitizeSettings({ reduceMotion: false, haptics: true, narration: true, onboarded: true, shareUsageData: true }).usageConsent, 'unset');
    assert.equal(sanitizeSettings({ reduceMotion: false, haptics: true, narration: true, onboarded: true, shareUsageData: false }).usageConsent, 'denied');
    // The old key is not carried forward.
    assert.ok(!('shareUsageData' in sanitizeSettings({ shareUsageData: true })));
    // A new value wins over an old one.
    assert.equal(consentFromSave({ shareUsageData: false, usageConsent: 'granted' }), 'granted');
  });

  it('an explicit not-yet-onboarded save is kept, so an unfinished welcome shows again', () => {
    assert.equal(sanitizeSettings({ ...DEFAULT_SETTINGS, onboarded: false }).onboarded, false);
  });

  it('a save from before narration existed gets narration on', () => {
    assert.equal(sanitizeSettings({ reduceMotion: false, haptics: true, onboarded: true }).narration, true);
  });

  it('malformed values fall back to defaults', () => {
    assert.deepEqual(sanitizeSettings({ reduceMotion: 'no', haptics: 0, narration: 'off', onboarded: 'yes', extra: true }), { ...DEFAULT_SETTINGS, onboarded: true });
    assert.deepEqual(sanitizeSettings('garbage'), DEFAULT_SETTINGS);
  });
});
