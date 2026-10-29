import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact, redactDeep } from '../lib/jarvis/redact.js';
import { buildIndex, fleetDocs } from '../lib/jarvis/knowledge.js';
import { makeRateLimit } from '../lib/jarvis/ratelimit.js';

test('redact scrubs common secret shapes, leaves prose alone', () => {
  assert.match(redact('key sk-ABCDEF0123456789abcd here'), /\[redacted-key\]/);
  assert.match(redact('token ghp_abcdef0123456789ABCDEFghijklmnop'), /\[redacted-gh-token\]/);
  assert.match(redact('db postgres://user:supersecret@host/db'), /postgres:\/\/user:\[redacted\]@host/);
  assert.match(redact('SESSION_SECRET=hunter2hunter2'), /SESSION_SECRET=\[redacted\]/);
  assert.equal(redact('All eight apps are running normally.'), 'All eight apps are running normally.');
});

test('redactDeep walks objects and arrays', () => {
  const o = redactDeep({ a: 'ghp_abcdef0123456789ABCDEFghijklmnop', b: [{ c: 'fine' }] });
  assert.match(o.a, /redacted/);
  assert.equal(o.b[0].c, 'fine');
});

test('BM25 ranks the relevant doc first and returns a sourced snippet', () => {
  const idx = buildIndex([
    { id: 'd1', source: 'A', title: 'Backups', text: 'Nightly backups run for every app and are stored encrypted.' },
    { id: 'd2', source: 'B', title: 'Networking', text: 'Caddy routes traffic to each container over the web network.' },
  ]);
  const r = idx.search('where are backups stored', 2);
  assert.equal(r[0].id, 'd1');
  assert.equal(r[0].source, 'A');
  assert.match(r[0].snippet, /backups/i);
});

test('fleetDocs builds searchable docs from registry', () => {
  const docs = fleetDocs({ registry: { apps: [{ id: 'aquaos', name: 'AquaOS', tagline: 'water delivery', stack: 'Node', urls: [], containers: ['aquaos'] }] }, readme: 'DevX Control manages apps.' });
  const idx = buildIndex(docs);
  assert.equal(idx.search('water delivery app', 3)[0].id, 'app:aquaos');
});

test('rate limit depletes and action respects kill switch + read-only', () => {
  const rl = makeRateLimit({ now: () => 1000, limits: { action: 2 } });
  assert.ok(rl.action('s1').ok);
  assert.ok(rl.action('s1').ok);
  assert.equal(rl.action('s1').ok, false); // bucket empty
  rl.setKill(true);
  assert.deepEqual(rl.action('s2'), { ok: false, reason: 'kill-switch' });
  rl.setKill(false); rl.setReadOnly(true);
  assert.deepEqual(rl.action('s2'), { ok: false, reason: 'read-only' });
});
