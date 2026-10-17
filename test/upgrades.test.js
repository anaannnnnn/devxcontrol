import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { scanTree, makeUpgrades } = await import('../lib/upgrades.js');

function project(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'up-'));
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); }
  return d;
}
test('finds real gaps in a dated site', () => {
  const d = project({
    'index.html': '<html><head></head><body><img src="a.png"></body></html>',
    'style.css': 'a{outline:none;transition:all .3s} .x{font-size:14px}',
    'package.json': JSON.stringify({ dependencies: { moment: '^2.0.0', jquery: '^1.12.0', express: '^4.18.0' } }),
  });
  const ids = scanTree(d).map((s) => s.id);
  for (const want of ['viewport', 'lang', 'title', 'description', 'alt', 'focus', 'motion', 'dark', 'olddeps', 'tests', 'ci', 'readme', 'lockfile']) assert.ok(ids.includes(want), want);
});
test('a tidy site gets few suggestions and is ranked by impact', () => {
  const d = project({
    'index.html': '<!doctype html><html lang="en"><head><title>Hi there</title><meta name="viewport" content="width=device-width"><meta name="description" content="x"><meta property="og:title" content="x"><link rel="icon" href="/f.ico"></head><body><img src="a.png" alt="a"></body></html>',
    'style.css': ':root{--bg:#fff} @media (prefers-color-scheme: dark){:root{--bg:#000}} @media (max-width:600px){a{x:y}} a:focus-visible{outline:2px solid}',
    'robots.txt': '', 'manifest.webmanifest': '{}', 'README.md': '# x', '.github/workflows/ci.yml': 'on: push',
  });
  assert.deepEqual(scanTree(d), []);
  const s = scanTree(project({ 'index.html': '<html><head></head></html>', 'README.md': 'x' }));
  const order = s.map((x) => x.impact); assert.deepEqual(order, [...order].sort((a, b) => ({ High: 3, Med: 2, Low: 1 }[b] - { High: 3, Med: 2, Low: 1 }[a])));
});
test('scan stores results; dismiss and apply update state', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-'));
  const root = project({ 'index.html': '<html><head></head><body></body></html>' });
  const tasks = [];
  const u = makeUpgrades({ registry: {}, llm: { configured: () => false }, dataDir, autopilot: { task: async (...a) => { tasks.push(a); return { id: 'run1' }; } } });
  const app = { id: 'a1', name: 'A', path: root, repo: 'o/r' };
  const r = await u.scan(app); assert.ok(r.items.length && r.items.every((i) => i.state === 'open'));
  const first = r.items[0].id;
  assert.equal(u.dismiss('a1', first).state, 'dismissed');
  assert.equal((await u.scan(app)).items.find((i) => i.id === first).state, 'dismissed');
  const other = r.items[1].id; const it = await u.apply(app, other);
  assert.equal(it.state, 'queued'); assert.equal(tasks[0][0], 'a1'); assert.match(tasks[0][2], /small/);
  assert.equal(await u.apply(app, 'zzz'), null);
});
