import test from 'node:test';
import assert from 'node:assert/strict';
import { stripSecrets, signatureOf, similarFixes, bumpTaste, tasteRank } from '../lib/brain.js';

test('patterns strip secrets and match a similar signature', () => {
  const cleaned = stripSecrets('token=abc123 password: hunter2 user a@b.co');
  assert.equal(cleaned.includes('hunter2'), false);
  assert.equal(cleaned.includes('a@b.co'), false);
  const sig = signatureOf({ title: 'SQL injection in orders', rule: 'sqli', file: 'src/orders.js' });
  const matches = similarFixes([{ id: '1', app: 'nexus', signature: sig, summary: 'bound the query' }], { title: 'SQL injection in orders file src/orders.js' });
  assert.ok(matches[0].score >= 0.45);
  const taste = bumpTaste({ up: {}, down: {} }, 'a11y', false);
  const ranked = tasteRank([{ id: 'a11y', area: 'a11y' }, { id: 'design', area: 'design' }], taste);
  assert.equal(ranked[0].id, 'design');
});
