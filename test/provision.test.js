import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { wantedService, PLACEHOLDER, makeProvision } from '../lib/provision.js';

test('placeholder values are recognised, real ones are not', () => {
  assert.ok(PLACEHOLDER.test('postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/db?sslmode=require'));
  assert.ok(PLACEHOLDER.test('your_api_key_here'));
  assert.ok(!PLACEHOLDER.test('postgresql://neondb_owner:abc123@ep-cool-sun-123456.us-east-2.aws.neon.tech/neondb'));
});
test('service is chosen from the example scheme, then the variable name', () => {
  assert.equal(wantedService('DATABASE_URL', 'postgresql://x'), 'postgres');
  assert.equal(wantedService('CACHE', 'redis://x'), 'redis');
  assert.equal(wantedService('MONGODB_URI', ''), 'mongo');
  assert.equal(wantedService('DATABASE_URL', '', '{"dependencies":{"pg":"8"}}'), 'postgres');
  assert.equal(wantedService('DATABASE_URL', 'mysql://x'), null);
  assert.equal(wantedService('API_KEY', ''), null);
});
test('postgres: container is created once, role and database made, URL has no ssl and a private host', async () => {
  const calls = []; let running = false;
  const exec = async (cmd, args) => {
    calls.push(args.join(' '));
    if (args[0] === 'inspect') return running ? { ok: true, out: 'true' } : { ok: false, out: '', err: 'no such' };
    if (args[0] === 'run') { running = true; return { ok: true, out: 'id' }; }
    if (args.includes('pg_isready')) return { ok: true, out: '' };
    if (args.includes('psql')) return { ok: true, out: args.join(' ').includes('SELECT') ? '' : 'ok' };
    return { ok: true, out: '' };
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-'));
  const p = makeProvision({ exec, dataDir: dir });
  const url = await p.postgres('business-os', () => {});
  assert.match(url, /^postgresql:\/\/app_business_os:[0-9a-f]{36}@devx-postgres:5432\/app_business_os\?sslmode=disable$/);
  assert.ok(calls.some((c) => c.startsWith('run -d --name devx-postgres')));
  assert.ok(calls.some((c) => c.includes('CREATE ROLE app_business_os')) && calls.some((c) => c.includes('CREATE DATABASE app_business_os')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'provision.json'), 'utf8')).pgPassword.length, 48);
  const runs = calls.filter((c) => c.startsWith('run -d')).length; await p.postgres('other', () => {});
  assert.equal(calls.filter((c) => c.startsWith('run -d')).length, runs, 'second app reuses the running container');
});
