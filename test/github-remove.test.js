import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeGithub } from '../lib/github.js';
import { makeRemove } from '../lib/remove.js';
import { removeFor } from '../lib/caddyfile.js';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });

test('github: each repo uses the installation of its own account', async () => {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    const u = String(url).replace('https://api.github.com', ''); calls.push(`${o.method} ${u}`);
    const j = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
    if (u === '/repos/alice/a/installation') return j({ id: 11, account: { login: 'alice' }, permissions: { contents: 'write', pull_requests: 'write' } });
    if (u === '/repos/bob/b/installation') return j({ id: 22, account: { login: 'bob' }, permissions: { contents: 'read' } });
    if (u === '/repos/zed/z/installation') return j({ message: 'Not Found' }, 404);
    if (/\/app\/installations\/(\d+)\/access_tokens/.test(u)) return j({ token: `tok-${/(\d+)\/access/.exec(u)[1]}`, expires_at: new Date(Date.now() + 3600e3).toISOString() }, 201);
    return j({}, 404);
  };
  try {
    const gh = makeGithub({ integrations: { github: () => ({ appId: '1', privateKey, installationId: '11' }), setInstallation() {} } });
    assert.equal(await gh.cloneToken('alice/a'), 'tok-11');
    assert.equal(await gh.cloneToken('bob/b'), 'tok-22');
    const acc = await gh.access('bob/b'); assert.deepEqual(acc.missing, ['Contents', 'Pull requests']); assert.equal(acc.account, 'bob');
    await assert.rejects(() => gh.cloneToken('zed/z'), /not installed on zed/);
  } finally { globalThis.fetch = real; }
});

test('caddyfile.removeFor drops the marked block and its host only', () => {
  const t = `a.com {\n\treverse_proxy a:1\n}\n\n# devx-control: x\nx.com {\n\treverse_proxy x:3000\n}\n`;
  const r = removeFor(t, { id: 'x', hosts: ['x.com'] });
  assert.equal(r.removed, 1); assert.ok(r.text.includes('a.com {') && !r.text.includes('x.com') && !r.text.includes('devx-control'));
});

test('remove deletes containers, route, dns, folder and registry entry', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-')); const dir = path.join(root, 'bos'); fs.mkdirSync(dir);
  const cf = path.join(root, 'Caddyfile'); fs.writeFileSync(cf, `# devx-control: bos\nbos.example.com {\n\treverse_proxy bos:3000\n}\n`);
  const calls = []; let removed = null; const logs = [];
  const registry = { serverIp: '1.2.3.4', remove: (id) => { removed = id; return true; } };
  const ops = { caddy: { validate: async () => ({ ok: true, out: '', err: '' }), reload: async () => ({ ok: true, out: '', err: '' }) } };
  const dns = { deleteA: async (h, ip) => ({ ok: true, message: `del ${h} ${ip}` }) };
  const exec = async (cmd, args) => { calls.push(`${cmd} ${args.join(' ')}`); return { ok: true, out: '', err: '' }; };
  const rm = makeRemove({ registry, dns, ops, caddyfile: cf, provision: { drop: async () => calls.push('dropdb') }, appsDir: root, exec });
  const app = { id: 'bos', name: 'BOS', onboarded: true, path: dir, containers: ['bos'], volumes: ['bos-data:/app/data'], urls: [{ host: 'bos.example.com' }] };
  await rm(app, { data: true, dns: true, folder: true }, (l) => logs.push(l));
  assert.ok(calls.includes('docker rm -f bos') && calls.includes('docker volume rm bos-data') && calls.includes('dropdb'));
  assert.ok(!fs.existsSync(dir) && !fs.readFileSync(cf, 'utf8').includes('bos.example.com'));
  assert.equal(removed, 'bos'); assert.ok(logs.some((l) => /del bos.example.com 1.2.3.4/.test(l)));
  await assert.rejects(() => rm({ ...app, onboarded: false }, {}), /Only apps added/);
});
