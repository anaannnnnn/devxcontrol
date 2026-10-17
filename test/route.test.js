import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { blocks, findBlock, upstreamOf, upsert } from '../lib/caddyfile.js';
import { makeRoute } from '../lib/route.js';

const CF = `{\n\temail a@b.c\n}\n\ndash.example.com {\n\treverse_proxy devx-control:3000\n}\n\n# devx-control: bos\nold.example.com {\n\theader {\n\t\tX-A 1\n\t}\n\treverse_proxy bos:3000\n}\n`;

test('caddyfile: parse, upsert replaces old domain and keeps others', () => {
  assert.equal(blocks(CF).length, 2);
  assert.equal(upstreamOf(findBlock(CF, 'old.example.com').body), 'bos:3000');
  const out = upsert(CF, { id: 'bos', host: 'new.example.com', upstream: 'bos:8080', owns: ['old.example.com'] });
  assert.ok(!out.includes('old.example.com'));
  assert.ok(out.includes('dash.example.com {') && out.includes('email a@b.c'));
  assert.match(out, /# devx-control: bos\nnew\.example\.com \{\n\treverse_proxy bos:8080\n\}\n$/);
});

function rig(initial, { running = true, onWeb = false, listen = 8080 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-')); const cf = path.join(dir, 'Caddyfile'); fs.writeFileSync(cf, initial);
  const calls = []; const apps = new Map(); let updated = null;
  const app = { id: 'bos', containers: ['bos'], urls: [{ label: 'Web', url: 'https://old.example.com', host: 'old.example.com' }] };
  const registry = { serverIp: '1.2.3.4', update: (id, p) => { updated = p; Object.assign(app, p); return app; } };
  const exec = async (cmd, args) => { calls.push(args.join(' ')); if (args[0] === 'inspect') return { ok: true, out: `${running}|${JSON.stringify(onWeb ? { web: {} } : { bridge: {} })}|{"8080/tcp":{}}` }; return { ok: true, out: '', err: '' }; };
  const ops = { caddy: { validate: async () => ({ ok: true, out: '', err: '' }), reload: async () => ({ ok: true, out: '', err: '' }) } };
  const dns = { ensureA: async (h, ip) => ({ ok: true, action: 'created', message: `A ${h} -> ${ip}` }) };
  const fetchImpl = async (u) => { if (!u.includes(`:${listen}/`)) throw new Error('refused'); return { status: 200 }; };
  const r = makeRoute({ registry, dns, ops, caddyfile: cf, exec, fetchImpl, resolver: { resolve4: async () => ['9.9.9.9'] } });
  return { r, app, cf, calls, get updated() { return updated; } };
}

test('route.apply fixes network, port, dns and caddy', async () => {
  const t = rig(CF);
  const res = await t.r.apply(t.app, { domain: 'new.example.com' });
  assert.equal(res.upstream, 'bos:8080');
  assert.ok(t.calls.some((c) => c === 'network connect web bos'));
  const txt = fs.readFileSync(t.cf, 'utf8');
  assert.ok(txt.includes('new.example.com {') && txt.includes('reverse_proxy bos:8080') && !txt.includes('old.example.com'));
  assert.equal(t.updated.urls[0].url, 'https://new.example.com');
});

test('route.apply refuses a domain used by something else unless replace', async () => {
  const t = rig(CF, { onWeb: true });
  await assert.rejects(() => t.r.apply(t.app, { domain: 'dash.example.com' }), /already routes to devx-control:3000/);
  const ok = await t.r.apply(t.app, { domain: 'dash.example.com', replace: true });
  assert.equal(ok.upstream, 'bos:8080');
});

test('route.diagnose reports dns and upstream mismatch', async () => {
  const t = rig(CF.replace('bos:3000', 'bos:3000'), { onWeb: false });
  const d = await t.r.diagnose(t.app);
  assert.ok(d.problems.some((p) => /web" network/.test(p)));
  assert.ok(d.problems.some((p) => /points at 9\.9\.9\.9/.test(p)));
  assert.ok(d.problems.some((p) => /sends old\.example\.com to bos:3000/.test(p)));
});

test('route.apply still sets DNS and Caddy when the app is crash-looping, using the port you typed', async () => {
  const t = rig(CF, { running: false, onWeb: true, listen: 9 });
  const res = await t.r.apply(t.app, { domain: 'new.example.com', port: 3131 });
  assert.equal(res.upstream, 'bos:3131');
  assert.ok(res.steps.some((s) => !s.ok && /not answering/.test(s.m)));
  assert.ok(fs.readFileSync(t.cf, 'utf8').includes('reverse_proxy bos:3131'));
});

test('route finds the real listening port from /proc and flags a stale Caddy upstream', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'q-')); const cf = path.join(dir, 'Caddyfile');
  fs.writeFileSync(cf, '# devx-control: bos\nbos.example.com {\n\treverse_proxy bos:3000\n}\n');
  const tcp = '  sl  local_address rem_address   st\n   0: 00000000:0C3B 00000000:0000 0A 00000000:00000000 00:00000000 0 123\n   1: 0100007F:1F90 0100007F:D2E4 01 00000000:00000000\n';
  const exec = async (cmd, args) => {
    if (args[0] === 'inspect') return { ok: true, out: 'true|{"web":{}}|{}|["NODE_ENV=production"]' };
    if (args[0] === 'exec') return { ok: true, out: tcp, err: '' };
    return { ok: true, out: '', err: '' };
  };
  const app = { id: 'bos', containers: ['bos'], urls: [{ url: 'https://bos.example.com', host: 'bos.example.com' }] };
  const r = makeRoute({ registry: { serverIp: '1.2.3.4', update: () => {} }, dns: null, ops: {}, caddyfile: cf, exec, fetchImpl: async (u) => { if (!u.includes(':3131/')) throw new Error('x'); return { status: 200 }; }, resolver: { resolve4: async () => [] } });
  const q = await r.quick(app);
  assert.deepEqual(q.answers, { container: 'bos', port: 3131 }); assert.equal(q.stale, true); assert.equal(q.upstream, 'bos:3000');
});
