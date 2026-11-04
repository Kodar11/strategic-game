import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ABOUT_TEXT, LINKS, SITE, SUPPORT_EMAIL, supportMailto, versionLabel } from '../about.ts';

describe('settings: about and support', () => {
  it('links only to the website pages that were checked to exist', () => {
    assert.deepEqual(Object.values(LINKS).sort(), ['/about', '/contact', '/delete-account', '/privacy', '/terms'].map((p) => SITE + p).sort());
    for (const url of Object.values(LINKS)) assert.match(url, /^https:\/\/tactiqo\.vercel\.app\/[a-z-]+$/);
  });

  it('shows the real version, never an invented build', () => {
    assert.equal(versionLabel({ version: '1.0.0', build: '12' }), '1.0.0 (build 12)');
    assert.equal(versionLabel({ version: '1.0.0', build: null }), '1.0.0');
    assert.equal(versionLabel({ version: null, build: '12' }), 'Unknown');
  });

  it('support mail goes to the published address with the version, and no account data', () => {
    const m = supportMailto('problem', { version: '1.0.0', build: '3' }, 'android 34');
    assert.ok(m.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`));
    const body = decodeURIComponent(m.split('&body=')[1]);
    assert.match(body, /App 1\.0\.0 \(build 3\) · android 34/);
    assert.doesNotMatch(body, /[0-9a-f]{8}-[0-9a-f]{4}-/, 'no user id');
  });

  it('the about text makes no outcome claims', () => {
    assert.doesNotMatch(ABOUT_TEXT, /\bIQ\b|intelligen|guarantee|\bcure|\btreat|smarter|\bbrain/i);
  });
});
