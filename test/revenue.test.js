import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, revenueAtRisk, selectAll, assertMapping, dynamoNote } from '../lib/revenue.js';

test('mapping rejects bad names and the query is a single select', () => {
  assert.throws(() => assertMapping({ table: 'orders;drop', amount: 'amount', created: 'created' }));
  assert.equal(selectAll('orders'), 'SELECT * FROM "orders"');
  assert.match(dynamoNote().reason, /not measurable/);
});

test('revenue at risk needs two earlier weeks and shows the method', () => {
  const rows = [];
  for (const day of ['2026-01-05', '2026-01-12', '2026-01-19']) {
    rows.push({ amount: 100, created_at: `${day}T09:00:00.000Z` });
  }
  rows.push({ amount: 40, created_at: '2026-01-26T09:00:00.000Z' });
  const agg = aggregate(rows, { table: 'orders', amount: 'amount', created: 'created_at' });
  assert.equal(agg.measured, true);
  assert.equal(agg.used, 4);
  const risk = revenueAtRisk(agg.hours, Date.parse('2026-01-26T09:00:00.000Z'));
  assert.equal(risk.measured, true);
  assert.equal(risk.atRisk, 60);
  assert.match(risk.method, /same hour/i);
  assert.ok(risk.uncertaintyPct != null);
  const thin = revenueAtRisk(agg.hours.slice(0, 1), Date.parse('2026-01-05T09:00:00.000Z'));
  assert.equal(thin.measured, false);
});
