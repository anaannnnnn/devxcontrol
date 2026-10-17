import test from 'node:test';
import assert from 'node:assert/strict';
import { maskRow, comparePair, verdict, rollbackDecision } from '../lib/proving.js';

test('sensitive columns are nulled and other columns stay', () => {
  const row = maskRow({ id: 1, email: 'a@b.c', amount: 12, note: 'ok' }, ['note']);
  assert.equal(row.email, null);
  assert.equal(row.note, null);
  assert.equal(row.amount, 12);
});

test('verdict reports status and shape differences and stays quiet when empty', () => {
  const none = verdict([]);
  assert.equal(none.measured, false);
  const v = verdict([{ live: { path: '/', status: 200, ms: 40, body: '{"ok":true}' }, shadow: { path: '/', status: 500, ms: 90, body: '{"ok":false,"err":1}' } }]);
  assert.equal(v.measured, true);
  assert.equal(v.ok, false);
  assert.equal(v.statusMismatches, 1);
  assert.equal(v.shapeMismatches, 1);
  const same = comparePair({ path: '/a', status: 200, ms: 10, body: '{"a":1}' }, { path: '/a', status: 200, ms: 12, body: '{"a":1}' });
  assert.equal(same.shapeSame, true);
  assert.equal(same.statusSame, true);
});

test('rollback holds when there are too few samples and fires when error rate jumps', () => {
  const hold = rollbackDecision({ before: [{ ok: true, ms: 10 }], after: [{ ok: false, ms: 10 }], minSamples: 4 });
  assert.equal(hold.measured, false);
  assert.equal(hold.action, 'hold');
  const before = Array.from({ length: 8 }, () => ({ ok: true, ms: 100 }));
  const after = Array.from({ length: 8 }, () => ({ ok: false, ms: 100 }));
  const bad = rollbackDecision({ before, after, minSamples: 8, errorRatePct: 5, p95ExtraMs: 50 });
  assert.equal(bad.action, 'rollback');
  assert.match(bad.why, /Error rate/);
  const fine = rollbackDecision({ before, after: before, minSamples: 8, errorRatePct: 5, p95ExtraMs: 50 });
  assert.equal(fine.action, 'keep');
});
