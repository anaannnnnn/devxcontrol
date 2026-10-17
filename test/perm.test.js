import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeOnboard } from '../lib/onboard.js';

test('heal gives a crash-looping app a chowned volume at the EACCES folder', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-'));
  const calls = []; let patch = null;
  const app = { id: 'bos', onboarded: true, path: dir, containers: ['bos'], envPath: null };
  const registry = { apps: [app], update: (id, p) => { patch = p; Object.assign(app, p); return app; } };
  const exec = async (cmd, args) => {
    calls.push(args.join(' '));
    if (args[0] === 'inspect') return { ok: true, out: 'restarting|true', err: '' };
    if (args[0] === 'logs') return { ok: true, out: '', err: "Error: EACCES: permission denied, mkdir '/app/data'\n" };
    if (args.includes('id') && args.includes('-u')) return { ok: true, out: '1000\n', err: '' };
    if (args.includes('id') && args.includes('-g')) return { ok: true, out: '1000\n', err: '' };
    return { ok: true, out: '', err: '' };
  };
  const ob = makeOnboard({ dns: null, registry, github: {}, ops: {}, appsDir: dir, caddyfile: null, audit: () => {}, autopilot: {}, workRoot: dir, dataDir: dir, exec });
  const fixed = await ob.heal(() => {});
  assert.deepEqual(patch.volumes, ['bos-app-data:/app/data']);
  assert.ok(calls.some((c) => c === 'run --rm -v bos-app-data:/d alpine:3.20 chown -R 1000:1000 /d'));
  assert.ok(calls.some((c) => /^run -d --name bos .*-v bos-app-data:\/app\/data/.test(c)));
  assert.equal(fixed[0].app, 'bos');
  const again = await ob.heal(() => {}); assert.equal(again.length, 0);
});
