import test from 'node:test';
import assert from 'node:assert/strict';
import { safeEqual, b32decode, totp, totpValid } from '../lib/auth.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { maskValue, readEnv, writeEnv } from '../lib/registry.js';

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
test('writeEnv changes one existing key and keeps the rest', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'env-')), '.env');
  fs.writeFileSync(f, '# note\nYOUTUBE_API_KEY=\nexport PORT=3000\n', { mode: 0o600 });
  assert.equal(writeEnv(f, 'YOUTUBE_API_KEY', 'AIza-test'), true);
  assert.equal(writeEnv(f, 'PORT', '4000'), true);
  assert.equal(writeEnv(f, 'MISSING', 'x'), false);
  assert.equal(fs.readFileSync(f, 'utf8'), '# note\nYOUTUBE_API_KEY=AIza-test\nexport PORT=4000\n');
  assert.equal(readEnv(f).find((e) => e.key === 'YOUTUBE_API_KEY').value, 'AIza-test');
  if (process.platform !== 'win32') assert.equal(fs.statSync(f).mode & 0o777, 0o600); // Windows has no POSIX modes
});
