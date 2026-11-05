import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAuthCallback } from '../browser-callback.ts';

describe('browser sign-in callback (Expo Go development fallback)', () => {
  const base = 'exp://192.168.0.103:8082/--/auth-callback';

  it('reads the PKCE code', () => {
    assert.deepEqual(parseAuthCallback(`${base}?code=34e770dd-9ff9-416c-87fa-43b31d7ef225`), { type: 'code', code: '34e770dd-9ff9-416c-87fa-43b31d7ef225' });
    assert.deepEqual(parseAuthCallback(`${base}#code=abc`), { type: 'code', code: 'abc' });
  });

  it('treats a declined consent as cancelling, not an error', () => {
    assert.deepEqual(parseAuthCallback(`${base}?error=access_denied&error_description=User+cancelled`), { type: 'cancelled' });
    assert.deepEqual(parseAuthCallback(`${base}#error=access_denied`), { type: 'cancelled' });
  });

  it('reports other refusals by code only', () => {
    assert.deepEqual(parseAuthCallback(`${base}?error=server_error&error_description=Unable+to+exchange`), { type: 'error', code: 'server_error' });
    assert.deepEqual(parseAuthCallback(`${base}#error_code=bad_oauth_state`), { type: 'error', code: 'bad_oauth_state' });
    assert.deepEqual(parseAuthCallback(base), { type: 'error', code: 'no_code' });
  });
});
