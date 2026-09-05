import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { API_KEY_PREFIX, generateApiKey, hashApiKey, isApiKey } from './apiKeys.ts';

describe('generateApiKey', () => {
  it('has the documented shape: the prefix and 40 alphanumerics', () => {
    for (let i = 0; i < 50; i++) {
      assert.match(generateApiKey(), /^vela_[A-Za-z0-9]{40}$/);
    }
  });

  it('does not repeat', () => {
    const keys = new Set(Array.from({ length: 200 }, generateApiKey));
    assert.equal(keys.size, 200);
  });

  it('uses the whole alphabet — rejection sampling did not quietly drop a range', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++)
      for (const c of generateApiKey().slice(API_KEY_PREFIX.length)) seen.add(c);
    assert.equal(seen.size, 62);
  });
});

describe('hashApiKey', () => {
  it('is sha256 hex, and deterministic', async () => {
    const a = await hashApiKey('vela_abc');
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(a, await hashApiKey('vela_abc'));
    assert.notEqual(a, await hashApiKey('vela_abd'));
  });
});

describe('isApiKey', () => {
  it('tells a key from a Supabase JWT', () => {
    assert.equal(isApiKey(generateApiKey()), true);
    assert.equal(isApiKey('eyJhbGciOiJIUzI1NiJ9.x.y'), false);
  });
});
