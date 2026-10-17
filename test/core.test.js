import test from 'node:test';
import assert from 'node:assert/strict';
import { safeEqual, b32decode, totp, totpValid } from '../lib/auth.js';
import { maskValue } from '../lib/registry.js';

test('safeEqual compares in constant-time style and rejects mismatches', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});
test('totp matches RFC 6238 vector (SHA1, T=59 -> 94287082)', () => {
  const b32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(b32decode(b32).toString('ascii'), '12345678901234567890');
  assert.equal(totp(b32, 59_000).slice(-6), '287082');
});
test('totpValid accepts current code and rejects a wrong one', () => {
  const b32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpValid(b32, totp(b32)), true);
  assert.equal(totpValid(b32, '000000') && totp(b32) !== '000000', false);
});
test('maskValue hides secrets', () => {
  const m = maskValue('supersecretvalue');
  assert.ok(!m.includes('supersecret'));
});
