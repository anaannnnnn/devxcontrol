import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeConfirm } from '../lib/jarvis/confirm.js';
import { makeJarvisTools, TIER } from '../lib/jarvis/tools.js';

function harness({ clock } = {}) {
  const calls = []; // side-effects actually executed
  const registry = { apps: [
    { id: 'aquaos', name: 'AquaOS', containers: ['aquaos'] },
    { id: 'secretapp', name: 'Secret', containers: ['secretapp'] },
  ] };
  const monitor = { health: (id) => ({ ok: true, id }), incidents: () => [{ app: 'aquaos', msg: 'high memory', level: 'warn' }] };
  const ops = {
    appAction: (app, act) => { calls.push(['appAction', app.id, act]); return [{ ok: true }]; },
    backup: (app) => { calls.push(['backup', app.id]); return { ok: true }; },
    redeploy: (app) => { calls.push(['redeploy', app.id]); return { ok: true }; },
  };
  const autopilot = {
    reviewsList: () => [{ id: 'R1', app: 'aquaos' }],
    approve: (id) => { calls.push(['approve', id]); return { ok: true, id }; },
    task: (id, title, detail) => { calls.push(['task', id, title, detail]); return { id: 'T1', app: id, title }; },
  };
  const now = clock || (() => Date.now());
  const confirm = makeConfirm({ now, ttlMs: 1000 });
  // user "owner" sees everything except secretapp
  const seen = (user, id) => !(id === 'secretapp');
  const tools = makeJarvisTools({ registry, monitor, ops, autopilot, confirm, seen });
  return { tools, confirm, calls };
}

test('T0 read tools run immediately, no confirmation', async () => {
  const { tools, calls } = harness();
  const r = await tools.call({ name: 'fleet.status', args: {}, user: 'owner', session: 's1' });
  assert.ok(r.ok && r.result);
  assert.equal(r.result.apps.length, 1); // secretapp filtered out by visibility
  assert.equal(r.result.apps[0].id, 'aquaos');
  assert.equal(calls.length, 0);
});

test('T1 reversible call mints a confirmation and does NOT execute', async () => {
  const { tools, calls } = harness();
  const r = await tools.call({ name: 'app.restart', args: { id: 'aquaos' }, user: 'owner', session: 's1' });
  assert.ok(r.ok && r.confirm && r.confirm.id);
  assert.equal(r.reAuth, false);
  assert.equal(calls.length, 0, 'nothing runs until confirmed');
});

test('T2 consequential call requires re-auth and does not execute', async () => {
  const { tools, calls } = harness();
  const r = await tools.call({ name: 'reviews.approve', args: { id: 'R1' }, user: 'owner', session: 's1' });
  assert.ok(r.ok && r.confirm);
  assert.equal(r.reAuth, true);
  assert.equal(calls.length, 0);
});

test('T3 forbidden tools are refused and hidden from the planner list', async () => {
  const { tools } = harness();
  const r = await tools.call({ name: 'vault.reveal', args: {}, user: 'owner', session: 's1' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.ok(!tools.list().some((t) => t.name === 'vault.reveal'));
});

test('unknown tool -> 404', async () => {
  const { tools } = harness();
  const r = await tools.call({ name: 'shell.exec', args: {}, user: 'owner', session: 's1' });
  assert.equal(r.status, 404);
});

test('app visibility enforced: cannot act on an app the user cannot see', async () => {
  const { tools } = harness();
  const r = await tools.call({ name: 'app.restart', args: { id: 'secretapp' }, user: 'owner', session: 's1' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test('confirmation executes with STORED args (model cannot alter at execute time)', async () => {
  const { tools, confirm, calls } = harness();
  const r = await tools.call({ name: 'app.restart', args: { id: 'aquaos' }, user: 'owner', session: 's1' });
  const ex = await tools.execute(r.confirm.id, { user: 'owner', session: 's1' });
  assert.ok(ex.ok);
  assert.deepEqual(calls, [['appAction', 'aquaos', 'restart']]);
  assert.equal(confirm.size(), 0, 'consumed');
});

test('confirmation is single-use', async () => {
  const { tools } = harness();
  const r = await tools.call({ name: 'app.backup', args: { id: 'aquaos' }, user: 'owner', session: 's1' });
  const ok = await tools.execute(r.confirm.id, { user: 'owner', session: 's1' });
  assert.ok(ok.ok);
  const again = await tools.execute(r.confirm.id, { user: 'owner', session: 's1' });
  assert.equal(again.ok, false);
  assert.match(again.error, /already-used/);
});

test('confirmation is bound to the same user and session', async () => {
  const { tools } = harness();
  const r = await tools.call({ name: 'app.restart', args: { id: 'aquaos' }, user: 'owner', session: 's1' });
  assert.match((await tools.execute(r.confirm.id, { user: 'intruder', session: 's1' })).error, /wrong-user/);
  assert.match((await tools.execute(r.confirm.id, { user: 'owner', session: 'other' })).error, /wrong-session/);
});

test('brief (T0) returns a composite situational summary', async () => {
  const { tools } = harness();
  const r = await tools.call({ name: 'brief', args: {}, user: 'owner', session: 's1' });
  assert.ok(r.ok);
  assert.equal(r.result.apps, 1);            // secretapp filtered
  assert.equal(r.result.reviewsPending, 1);
  assert.equal(r.result.incidents.length, 1);
});

test('task.draft (T1) confirms then calls autopilot.task with stored args', async () => {
  const { tools, calls } = harness();
  const r = await tools.call({ name: 'task.draft', args: { id: 'aquaos', title: 'Calmer home page', detail: 'soften colors' }, user: 'owner', session: 's1' });
  assert.ok(r.confirm && !r.reAuth);
  assert.equal(calls.length, 0);
  const ex = await tools.execute(r.confirm.id, { user: 'owner', session: 's1' });
  assert.ok(ex.ok);
  assert.deepEqual(calls, [['task', 'aquaos', 'Calmer home page', 'soften colors']]);
});

test('confirmation expires', async () => {
  let t = 1000;
  const { tools } = harness({ clock: () => t });
  const r = await tools.call({ name: 'app.restart', args: { id: 'aquaos' }, user: 'owner', session: 's1' });
  t += 2000; // past ttlMs (1000)
  const ex = await tools.execute(r.confirm.id, { user: 'owner', session: 's1' });
  assert.equal(ex.ok, false);
  assert.match(ex.error, /expired/);
});
