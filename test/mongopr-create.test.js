import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeMongoPr } from '../lib/mongopr.js';

const sh = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });

/** A throwaway "GitHub": a bare repo with the given files on main. */
function remote(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prt-'));
  const work = path.join(root, 'work'); const bare = path.join(root, 'bare.git');
  fs.mkdirSync(work); sh(['init', '-q', '-b', 'main'], work);
  for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true }); fs.writeFileSync(path.join(work, f), t); }
  sh(['add', '-A'], work); sh(['commit', '-q', '-m', 'init'], work);
  sh(['clone', '-q', '--bare', work, bare], root);
  return { bare, branches: () => sh(['branch', '--list'], bare).split('\n').map((l) => l.replace('*', '').trim()).filter(Boolean) };
}
const CONFIG = { '.env.example': 'PORT=4000\nMONGO_URI=mongodb://localhost:27017/x\n', 'docker-compose.yml': 'services:\n  api:\n    build: .\n    environment:\n      MONGO_URI: mongodb://mongo:27017/x\n    depends_on:\n      mongo: { condition: service_healthy }\n  mongo:\n    image: mongo:7.0\n' };
const PRISMA = { 'server/prisma/schema.prisma': 'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\nmodel A {\n  id String @id @default(cuid())\n}\n', 'server/src/r.ts': 'await prisma.$queryRaw`select 1`;\n', '.env.example': 'DATABASE_URL=postgresql://u:p@localhost/db\n' };

function setup(files, { mergeStatuses = [200] } = {}) {
  const r = remote(files); const calls = []; const store = new Map();
  store.set('app', { mode: 'import-only', stage: 'imported', clusterName: 'C', database: 'shop', var: 'MONGO_URI' });
  let mergeTry = 0;
  const fetchImpl = async (url, o) => {
    const u = String(url).replace('https://api.github.com/repos/o/r', ''); calls.push({ m: o.method, u, body: o.body ? JSON.parse(o.body) : null });
    if (u === '/pulls') return { ok: true, status: 201, json: async () => ({ number: 5, html_url: 'https://github.com/o/r/pull/5' }) };
    if (u.endsWith('/merge')) { const st = mergeStatuses[Math.min(mergeTry++, mergeStatuses.length - 1)]; return { ok: st === 200, status: st, json: async () => (st === 200 ? { merged: true } : { message: 'not mergeable' }) }; }
    return { ok: true, status: 204, json: async () => ({}) };
  };
  const settings = { mongo: (id) => store.get(id), setMongo: (id, b) => store.set(id, b) };
  const checks = []; const events = [];
  const pr = makeMongoPr({ settings, github: { cloneToken: async () => '' }, gitx: { status: () => ({ branch: 'main' }), check: async () => { checks.push(1); } }, audit: (...a) => events.push(a), remoteUrl: () => `file://${r.bare}`, fetchImpl, validate: async () => ({ ok: true, label: 'prisma validate', output: '' }), sleep: async () => {} });
  return { pr, calls, store, r, checks, events, app: { id: 'app', name: 'Shop', repo: 'o/r' } };
}

test('a clean change is merged automatically and the branch is tidied up', async () => {
  const t = setup(CONFIG);
  const res = await t.pr.create(t.app, { autoMerge: true });
  assert.equal(res.merged, true); assert.equal(res.draft, false);
  const open = t.calls.find((c) => c.u === '/pulls'); assert.equal(open.body.draft, false); assert.equal(open.body.base, 'main');
  const merge = t.calls.find((c) => c.u === '/pulls/5/merge'); assert.equal(merge.m, 'PUT'); assert.equal(merge.body.merge_method, 'squash');
  assert.ok(t.calls.some((c) => c.m === 'DELETE' && /\/git\/refs\/heads\/devx\/mongodb-shop/.test(c.u)));
  assert.equal(t.checks.length, 1, 'DevX Control looks at GitHub again straight after merging');
  assert.ok(t.r.branches().some((b) => b.startsWith('devx/mongodb-shop')), 'the branch really was pushed');
  assert.equal(t.store.get('app').pr.merged, true);
});

test('with automatic merging off it opens a draft and never merges', async () => {
  const t = setup(CONFIG);
  const res = await t.pr.create(t.app, { autoMerge: false });
  assert.equal(res.merged, false); assert.equal(res.draft, true);
  assert.equal(t.calls.find((c) => c.u === '/pulls').body.draft, true);
  assert.ok(!t.calls.some((c) => c.u.endsWith('/merge')));
});

test('something that needs a person is never merged by itself, even when asked to', async () => {
  const t = setup(PRISMA);
  const res = await t.pr.create(t.app, { autoMerge: true });
  assert.equal(res.merged, false); assert.equal(res.draft, true);
  assert.match(res.note, /need a person/);
  assert.ok(!t.calls.some((c) => c.u.endsWith('/merge')));
});

test('if GitHub is slow to say it can merge, it asks again; if it never agrees the pull request stays open', async () => {
  const slow = setup(CONFIG, { mergeStatuses: [405, 405, 200] });
  assert.equal((await slow.pr.create(slow.app, { autoMerge: true })).merged, true);
  assert.equal(slow.calls.filter((c) => c.u.endsWith('/merge')).length, 3);
  const never = setup(CONFIG, { mergeStatuses: [405] });
  const res = await never.pr.create(never.app, { autoMerge: true });
  assert.equal(res.merged, false); assert.equal(res.draft, false); assert.match(res.note, /would not merge/);
  assert.equal(never.store.get('app').pr.number, 5);
});

test('it refuses before the data is copied, and does not open a second pull request', async () => {
  const t = setup(CONFIG); t.store.set('app', { ...t.store.get('app'), stage: 'linked' });
  await assert.rejects(() => t.pr.create(t.app), /Copy the data/);
  const u = setup(CONFIG); await u.pr.create(u.app);
  await assert.rejects(() => u.pr.create(u.app), /already open/);
});
