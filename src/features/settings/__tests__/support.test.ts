import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { resolveVersion } from '../about.ts';
import { CONSENT_COPY, shouldAskConsent } from '../consent.ts';
import { FAQS } from '../faq.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');

describe('the one-time analytics question', () => {
  const base = { platform: 'android', available: true, onboarded: true, consent: 'unset' as const };

  it('is asked once, after the welcome, only where analytics can run', () => {
    assert.equal(shouldAskConsent(base), true);
    assert.equal(shouldAskConsent({ ...base, onboarded: false }), false, 'never before or during the welcome');
    assert.equal(shouldAskConsent({ ...base, platform: 'web' }), false);
    assert.equal(shouldAskConsent({ ...base, available: false }), false, 'not in a build that can’t collect anything');
  });

  it('is never asked again once answered either way', () => {
    assert.equal(shouldAskConsent({ ...base, consent: 'granted' }), false);
    assert.equal(shouldAskConsent({ ...base, consent: 'denied' }), false);
  });

  it('offers two equal choices with plain wording, and says what is never collected', () => {
    assert.equal(CONSENT_COPY.accept, 'Share');
    assert.equal(CONSENT_COPY.decline, 'Not now');
    assert.match(CONSENT_COPY.body, /Never your answers, reflections or anything you type/);
    assert.match(CONSENT_COPY.body, /change this in Settings/);
    const card = readFileSync(join(ROOT, 'src', 'features', 'settings', 'UsageConsentCard.tsx'), 'utf8');
    // Same style for both buttons: no primary "Share" next to a faint "Not now", and no modal.
    const buttons = [...card.matchAll(/<Button label=\{CONSENT_COPY\.(accept|decline)\} variant="(\w+)" compact/g)];
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0][2], buttons[1][2]);
    assert.doesNotMatch(card, /<Modal|presentation: 'modal'/);
  });

  it('the Settings switch shows the real state and stores an explicit choice', () => {
    const settings = readFileSync(join(ROOT, 'app', 'settings.tsx'), 'utf8');
    assert.match(settings, /title="Share anonymous usage and diagnostic data"/);
    assert.match(settings, /body="Helps us fix crashes and improve Tactiqo\. Never your answers, reflections or anything you type\."/);
    assert.match(settings, /value=\{settings\.usageConsent === 'granted'\}/);
    assert.match(settings, /setSetting\('usageConsent', v \? 'granted' : 'denied'\)/);
  });
});

describe('About & support', () => {
  it('has a short FAQ: 6–8 questions, one or two sentences each', () => {
    assert.ok(FAQS.length >= 6 && FAQS.length <= 8);
    assert.equal(new Set(FAQS.map((f) => f.id)).size, FAQS.length);
    for (const f of FAQS) {
      assert.ok(f.question.endsWith('?'), f.id);
      assert.ok(f.answer.length <= 260, `${f.id} is ${f.answer.length} characters`);
    }
  });

  it('answers make no outcome claims and describe analytics as opt-in', () => {
    for (const f of FAQS) assert.doesNotMatch(f.answer, /\bIQ\b|intelligen|guarantee|smarter|\bbrain/i, f.id);
    assert.match(FAQS.find((f) => f.id === 'data')!.answer, /only if you choose Share/);
  });

  it('the version comes from the installed binary, except in Expo Go and on web', () => {
    assert.deepEqual(resolveVersion({ expoGo: false, nativeVersion: '1.2.0', nativeBuild: '14', configVersion: '1.0.0' }), { version: '1.2.0', build: '14' });
    assert.deepEqual(resolveVersion({ expoGo: true, nativeVersion: '2.40.1', nativeBuild: '999', configVersion: '1.0.0' }), { version: '1.0.0', build: null }, 'Expo Go’s own version is never shown');
    assert.deepEqual(resolveVersion({ expoGo: false, nativeVersion: null, nativeBuild: null, configVersion: '1.0.0' }), { version: '1.0.0', build: null }, 'web');
    assert.deepEqual(resolveVersion({ expoGo: false, nativeVersion: ' ', nativeBuild: '3', configVersion: null }), { version: null, build: null });
  });

  it('Settings has one About & support entry instead of the separate links', () => {
    const settings = readFileSync(join(ROOT, 'app', 'settings.tsx'), 'utf8');
    assert.match(settings, /router\.push\('\/about'\)/);
    for (const gone of ['LINKS.privacy', 'LINKS.terms', 'LINKS.support', 'LINKS.about', 'supportMailto']) assert.ok(!settings.includes(gone), gone);
    const about = readFileSync(join(ROOT, 'app', 'about.tsx'), 'utf8');
    for (const link of ['LINKS.privacy', 'LINKS.terms', 'LINKS.support', 'LINKS.deletion', 'LINKS.about', "router.push('/licenses')", 'supportMailto']) assert.ok(about.includes(link), link);
  });
});
