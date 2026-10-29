import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { run } from '../lib/docker.js';
import { makeAutopilot } from '../lib/autopilot.js';

const sh = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-'));
  const origin = path.join(root, 'origin.git'); const seed = path.join(root, 'seed');
  fs.mkdirSync(seed); sh(seed, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(seed, 'orders.js'), "export function total(items) {\n  return items.map((i) => i.price).reduce((a, b) => a + b);\n}\n");
  fs.writeFileSync(path.join(seed, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'node --test' } }));
  sh(seed, 'add', '-A'); sh(seed, 'commit', '-q', '-m', 'init');
  execFileSync('git', ['clone', '-q', '--bare', seed, origin]);
  const events = []; const pushed = [];
  const registry = { apps: [{ id: 'shop', name: 'Shop', repo: 'o/shop', containers: [], stack: 'Node' }] };
  registry.byId = new Map(registry.apps.map((a) => [a.id, a]));
  const semgrepHit = { results: [{ check_id: 'js.empty-reduce', path: '/src/orders.js', start: { line: 2 }, extra: { severity: 'ERROR', message: 'reduce without initial value throws on empty input' } }] };
  let fixed = false;
  // pretend docker: tests pass, semgrep reports the issue until orders.js contains "reduce((a, b) => a + b, 0)"
  const exec = (cmd, args, o) => {
    if (cmd !== 'docker') return run(cmd, args, o);
    const dir = args[args.indexOf('-v') + 1].replace(/:\/.*$/, ''); const img = args.find((a) => /^(node|semgrep|hadolint|python)/.test(a));
    if (img?.startsWith('semgrep')) { const src = fs.readFileSync(path.join(dir, 'orders.js'), 'utf8'); fixed = src.includes(', 0)'); return Promise.resolve({ ok: true, out: JSON.stringify(fixed ? { results: [] } : semgrepHit), err: '' }); }
    if (args.join(' ').includes('npm audit')) return Promise.resolve({ ok: true, out: JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: {} } }), err: '' });
    return Promise.resolve({ ok: true, out: '# pass 3\n# fail 0\n', err: '' });
  };
  const llm = {
    configured: () => true,
    async json(msgs) {
      const sys = msgs[0].content;
      if (sys.includes('triage')) return { fixable: true, impact: 'Order totals crash on an empty cart.', reason: '' };
      if (sys.includes('change reports')) return { title: 'Fix crash when cart is empty', summary: 'Totals no longer throw on empty carts.', cause: 'reduce had no initial value.', frontend: ['Empty cart shows 0.'], backend: ['total() returns 0 for no items.'], risk: 'low' };
      if (sys.includes('ONE problem')) {
        if (!llm.n++) return { explanation: 'bad first try', edits: [{ path: 'orders.js', find: 'does not exist', replace: 'x' }] };
        return { explanation: 'Add initial value', edits: [{ path: 'orders.js', find: '.reduce((a, b) => a + b);', replace: '.reduce((a, b) => a + b, 0);' }], new_files: [] };
      }
      return { suggestions: [{ title: 'Add tests', why: 'none exist', impact: 'High', effort: 'Low', area: 'Backend' }] };
    }, n: 0,
  };
  const github = {
    configured: () => true, cloneToken: async () => 'tok',
    openPr: async (repo, p) => { pushed.push(['pr', repo, p.head]); return { number: 7, html_url: 'https://github.com/o/shop/pull/7' }; }, mergePr: async () => ({ merged: true }),
  };
  const monitor = { status: {}, uptime: () => 99.9 };
  const redeploys = [];
  const ap = makeAutopilot({
    registry, github, llm, ops: { appAction: async () => [], redeploy: async () => { redeploys.push(1); return 0; } }, monitor, dataDir: root, appsDir: root,
    audit: (a, m) => events.push(m), createJob: (k, id, fn) => { const job = { subs: new Set(), done: false, code: null }; fn(() => {}).then((c) => { job.code = c; job.done = true; job.subs.forEach((f) => f({ done: true })); }); return job; }, runningJob: () => null, exec,
    remoteUrl: () => origin,
  });
  return { ap, root, origin, events, redeploys, llm };
}
const settle = async (ap) => { for (let i = 0; i < 400; i++) { if (!ap.view().busy) return; await new Promise((r) => setTimeout(r, 50)); } throw new Error('run did not settle'); };

test('scan finds a real semgrep issue and scores it', async () => {
  const { ap } = fixture();
  ap.scan(); await settle(ap);
  const v = ap.view(); if (process.env.DBG) console.log(JSON.stringify(v.run.log, null, 1));
  const f = v.findings.find((x) => x.tool === 'semgrep');
  assert.ok(f, 'semgrep finding recorded'); assert.equal(f.sev, 'high'); assert.equal(f.file, 'orders.js');
  assert.equal(v.scores.find((s) => s.k === 'Security').v, 85);
  assert.equal(v.scores.find((s) => s.k === 'Tests').v, 100);
});

test('fix: first edit is rejected (find mismatch), second passes, review has a real diff', async () => {
  const { ap } = fixture();
  ap.scan(); await settle(ap);
  const f = ap.view().findings.find((x) => x.tool === 'semgrep');
  ap.fix(f.id); await settle(ap);
  const rv = ap.reviewsList()[0]; assert.ok(rv, 'review created');
  assert.equal(rv.state, 'pending'); assert.equal(rv.attempts, 2);
  const full = ap.reviewGet(rv.id);
  assert.equal(full.files[0].path, 'orders.js'); assert.equal(full.files[0].add, 1);
  assert.ok(full.files[0].lines.some((l) => l[0] === 'a' && l[1].includes(', 0)')));
  assert.equal(full.tests.find((t) => t.n === 'Semgrep').before, 'fail'); assert.equal(full.tests.find((t) => t.n === 'Semgrep').after, 'pass');
  assert.match(full.title, /empty/i);
});

test('approve pushes the branch, opens a PR, merges, redeploys', async () => {
  const { ap, origin, redeploys } = fixture();
  ap.scan(); await settle(ap);
  ap.fix(ap.view().findings.find((x) => x.tool === 'semgrep').id); await settle(ap);
  const id = ap.reviewsList()[0].id;
  ap.approve(id); await settle(ap);
  const rv = ap.reviewGet(id);
  assert.equal(rv.state, 'deployed'); assert.equal(rv.pr.n, 7); assert.equal(redeploys.length, 1);
  assert.match(execFileSync('git', ['-C', origin, 'branch', '--list', 'autopilot/*'], { encoding: 'utf8' }), /autopilot\/f-\d+/);
});

test('reject marks the finding wontfix; request-changes reruns with the note', async () => {
  const { ap } = fixture();
  ap.scan(); await settle(ap);
  ap.fix(ap.view().findings.find((x) => x.tool === 'semgrep').id); await settle(ap);
  const id = ap.reviewsList()[0].id;
  ap.requestChanges(id, 'also handle null items'); await settle(ap);
  const list = ap.reviewsList(); assert.equal(list.find((r) => r.id === id).state, 'superseded'); assert.equal(list.filter((r) => r.state === 'pending').length, 1);
  ap.reject(list.find((r) => r.state === 'pending').id);
  assert.equal(ap.view().findings.filter((f) => f.state === 'wontfix').length, 1);
});

test('protected paths and bad edits are refused', async () => {
  const { ap, llm } = fixture();
  ap.scan(); await settle(ap);
  const orig = llm.json.bind(llm);
  llm.json = async (m) => (m[0].content.includes('ONE problem') ? { explanation: 'x', edits: [{ path: '.env', find: 'A', replace: 'B' }] } : orig(m));
  ap.fix(ap.view().findings.find((x) => x.tool === 'semgrep').id); await settle(ap);
  assert.equal(ap.reviewsList().length, 0);
  const f = ap.view().findings.find((x) => x.tool === 'semgrep'); assert.equal(f.state, 'open'); assert.match(f.why, /not allowed/);
});
