import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DEMO = '1';
const { makeDbx } = await import('../lib/dbx.js');

const events = [];
const dbx = makeDbx({ ops: {}, audit: (a, m) => events.push(m) });
const app = { id: 'nexus', name: 'Nexus', db: { type: 'postgres', container: 'nexus-db' } };

test('browse, search and sort', async () => {
  const r = await dbx.browse(app, 'customers', { limit: '5', q: 'business', sort: 'id', dir: 'desc' });
  assert.equal(r.rows.length, 5); assert.ok(r.total > 5); assert.ok(r.editable);
  assert.ok(r.rows[0].id > r.rows[1].id);
});
test('unknown tables and columns are rejected, not interpolated', async () => {
  await assert.rejects(dbx.browse(app, 'x"; drop table customers; --', {}), /No table/);
  await assert.rejects(dbx.update(app, 'customers', { id: 1 }, { 'plan"; drop': 'x' }), /Unknown column/);
});
test('edit, insert, delete are audited', async () => {
  await dbx.update(app, 'customers', { id: 1 }, { plan: 'enterprise' });
  assert.equal((await dbx.browse(app, 'customers', { q: 'enterprise' })).total >= 1, true);
  const before = (await dbx.browse(app, 'settings', {})).total;
  await dbx.insert(app, 'settings', { key: 'k', value: 'v' });
  await dbx.remove(app, 'settings', { key: 'k' });
  assert.equal((await dbx.browse(app, 'settings', {})).total, before);
  assert.ok(events.length >= 3);
});
test('SQL console is read-only unless changes are allowed', async () => {
  await assert.rejects(dbx.query(app, 'delete from orders', false), /Allow changes/);
  const r = await dbx.query(app, 'select * from customers limit 3', false);
  assert.equal(r.rows.length, 3);
});
test('CSV export neutralises spreadsheet formulas', async () => {
  await dbx.update(app, 'customers', { id: 2 }, { name: '=HYPERLINK("http://evil")' });
  const csv = await dbx.csv(app, 'customers');
  assert.match(csv, /"'=HYPERLINK/);
});
