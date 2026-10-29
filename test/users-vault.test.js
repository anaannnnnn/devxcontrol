import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeUsers } from '../lib/users.js';
import { makeVault } from '../lib/vault.js';
import { totp } from '../lib/auth.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dc-'));

test('users: seeded accounts sign in, wrong password and unknown user fail the same way', () => {
  const u = makeUsers({ dataDir: tmp(), seedNames: ['anan', 'subunu'], seedPassword: 'Devx@2026' });
  assert.equal(u.verify('anan', 'Devx@2026').ok, true);
  assert.equal(u.verify('SUBUNU', 'Devx@2026').ok, true);
  assert.deepEqual(u.verify('anan', 'nope'), { ok: false });
  assert.deepEqual(u.verify('ghost', 'Devx@2026'), { ok: false });
});
test('users: hashes only on disk, survive restart, password change works', () => {
  const dir = tmp();
  const a = makeUsers({ dataDir: dir, seedNames: ['anan'], seedPassword: 'Devx@2026' });
  assert.ok(!fs.readFileSync(path.join(dir, 'users.json'), 'utf8').includes('Devx@2026'));
  assert.match(a.changePassword('anan', 'wrong', 'NewPassw0rd!'), /incorrect/);
  assert.match(a.changePassword('anan', 'Devx@2026', 'short'), /at least/);
  assert.equal(a.changePassword('anan', 'Devx@2026', 'NewPassw0rd!'), null);
  const b = makeUsers({ dataDir: dir, seedNames: ['x'], seedPassword: 'other-seed-pass' });
  assert.equal(b.verify('anan', 'NewPassw0rd!').ok, true);
  assert.equal(b.verify('anan', 'Devx@2026').ok, false);
  assert.equal(b.verify('x', 'other-seed-pass').ok, false, 'seeding runs only when no users exist');
});
test('users: two-step sign-in needs the current code', () => {
  const u = makeUsers({ dataDir: tmp(), seedNames: ['anan'], seedPassword: 'Devx@2026' });
  const secret = u.startTotp('anan');
  assert.equal(u.enableTotp('anan', '000000') && false, false);
  assert.equal(u.enableTotp('anan', totp(secret)), true);
  assert.equal(u.verify('anan', 'Devx@2026').ok, false);
  assert.equal(u.verify('anan', 'Devx@2026', totp(secret)).ok, true);
  assert.equal(u.disableTotp('anan', 'bad'), false);
  assert.equal(u.disableTotp('anan', 'Devx@2026'), true);
  assert.equal(u.verify('anan', 'Devx@2026').ok, true);
});
test('vault: encrypts at rest, round-trips, wrong key cannot read', () => {
  const dir = tmp();
  const v = makeVault({ dataDir: dir, key: 'key-one' });
  const c = v.create('nexus', { label: 'Stripe', user: 'a', secret: 'sk_live_abc' });
  assert.ok(!fs.readFileSync(path.join(dir, 'vault.json'), 'utf8').includes('sk_live_abc'));
  assert.equal(v.reveal('nexus', c.id), 'sk_live_abc');
  assert.equal(v.reveal('aquaos', c.id), undefined, 'scoped to its app');
  assert.equal(makeVault({ dataDir: dir, key: 'key-two' }).reveal('nexus', c.id), null);
  assert.throws(() => v.create('nexus', { label: '' }), /label/);
  assert.throws(() => v.create('nexus', { label: 'x', url: 'javascript:alert(1)' }), /http/);
  assert.equal(v.remove('nexus', c.id), true);
});
