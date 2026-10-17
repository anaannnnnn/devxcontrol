import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DEMO = '1';
const { buildPlan, buildCreateTable, buildDropTable, checkType, defaultSql, SchemaError } = await import('../lib/schema.js');
const { makeDbx } = await import('../lib/dbx.js');

const cols = [{ name: 'id', type: 'integer', pk: true, nullable: false, default: null }, { name: 'email', type: 'text', nullable: true, default: null }];

test('add column builds SQL and its undo', () => {
  const p = buildPlan('postgres', 'users', [{ op: 'add_column', name: 'age', type: 'integer', nullable: false, default: '0' }], cols);
  assert.equal(p.statements[0], 'ALTER TABLE "users" ADD COLUMN "age" integer NOT NULL DEFAULT 0');
  assert.deepEqual(p.down, ['ALTER TABLE "users" DROP COLUMN "age"']);
  assert.equal(p.reversible, true);
});
test('names, types and defaults are validated', () => {
  assert.throws(() => buildPlan('postgres', 'users', [{ op: 'add_column', name: 'a"; drop table users;--', type: 'text' }], cols), SchemaError);
  assert.throws(() => checkType('postgres', 'text; drop table x'), SchemaError);
  assert.throws(() => checkType('sqlite', 'jsonb'), SchemaError);
  assert.equal(defaultSql('postgres', "it's"), "'it''s'");
  assert.equal(defaultSql('sqlite', 'true'), '1');
  assert.equal(defaultSql('postgres', 'now()'), 'now()');
});
test('drop column is destructive, irreversible, and the primary key is protected', () => {
  const p = buildPlan('postgres', 'users', [{ op: 'drop_column', name: 'email' }], cols);
  assert.equal(p.destructive, true); assert.equal(p.reversible, false);
  assert.throws(() => buildPlan('postgres', 'users', [{ op: 'drop_column', name: 'id' }], cols), /primary key/);
});
test('rename, type, nullable, default and indexes', () => {
  const p = buildPlan('postgres', 'users', [{ op: 'rename_column', from: 'email', to: 'mail' }, { op: 'set_type', name: 'mail', type: 'varchar(120)' }, { op: 'set_nullable', name: 'mail', nullable: false }, { op: 'add_index', columns: ['mail'], unique: true }], cols);
  assert.equal(p.statements.length, 4);
  assert.match(p.statements[1], /TYPE varchar\(120\) USING "mail"::varchar\(120\)/);
  assert.match(p.statements[3], /CREATE UNIQUE INDEX "idx_users_mail" ON "users" \("mail"\)/);
  assert.equal(p.down.length, 4); assert.match(p.down[0], /DROP INDEX "public"\."idx_users_mail"/);
});
test('sqlite refuses in-place type changes but supports add/rename/drop', () => {
  assert.throws(() => buildPlan('sqlite', 'users', [{ op: 'set_type', name: 'email', type: 'TEXT' }], cols), /SQLite cannot/);
  const p = buildPlan('sqlite', 'users', [{ op: 'add_column', name: 'n', type: 'integer' }], cols);
  assert.match(p.statements[0], /ADD COLUMN "n" INTEGER/);
});
test('create and drop table', () => {
  const c = buildCreateTable('postgres', 'notes', [{ name: 'body', type: 'text' }]);
  assert.match(c.statements[0], /CREATE TABLE "notes" \("id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "body" text\)/);
  assert.equal(buildDropTable('notes').destructive, true);
});

test('facade (demo): dry run changes nothing, apply backs up, history, undo in order', async () => {
  const lines = [];
  const ops = { backup: async (a, log) => { log('Creating app1-20260101-000000.sql.gz ...'); lines.push(1); return 0; } };
  const audits = [];
  const dbx = makeDbx({ ops, audit: (a, m) => audits.push(m) });
  const app = { id: 'app1', name: 'App', db: { type: 'postgres', container: 'x' } };
  const colNames = async () => (await dbx.structure(app, 'customers')).columns.map((c) => c.name);
  const before = await colNames();
  const dry = await dbx.schemaChange(app, { table: 'customers', dry: true, ops: [{ op: 'add_column', name: 'phone', type: 'text' }] });
  assert.equal(dry.dry, true); assert.deepEqual(await colNames(), before); assert.equal(lines.length, 0);
  const r1 = await dbx.schemaChange(app, { table: 'customers', ops: [{ op: 'add_column', name: 'phone', type: 'text' }] });
  assert.ok((await colNames()).includes('phone')); assert.equal(r1.backup, 'app1-20260101-000000.sql.gz'); assert.equal(lines.length, 1);
  const r2 = await dbx.schemaChange(app, { table: 'customers', ops: [{ op: 'rename_column', from: 'phone', to: 'mobile' }, { op: 'add_index', columns: ['mobile'] }] });
  assert.ok((await colNames()).includes('mobile'));
  assert.equal((await dbx.structure(app, 'customers')).indexes.length, 1);
  await assert.rejects(() => dbx.schemaRollback(app, r1.id), /newer changes first/);
  await dbx.schemaRollback(app, r2.id);
  assert.ok((await colNames()).includes('phone')); assert.equal((await dbx.structure(app, 'customers')).indexes.length, 0);
  await dbx.schemaRollback(app, r1.id);
  assert.deepEqual(await colNames(), before);
  await assert.rejects(() => dbx.schemaRollback(app, r1.id), /already undone/);
  const hist = await dbx.schemaHistory(app); assert.equal(hist.length, 2); assert.ok(hist.every((h) => h.rolledBack));
});
test('facade: drop table needs the name typed; drop column cannot be undone automatically', async () => {
  const dbx = makeDbx({ ops: { backup: async (a, log) => { log('Creating app2-1.sql.gz ...'); return 0; } }, audit: () => {} });
  const app = { id: 'app2', name: 'App2', db: { type: 'postgres', container: 'x' } };
  await assert.rejects(() => dbx.schemaChange(app, { drop: { name: 'settings', confirm: 'nope' } }), /Type the table name/);
  const r = await dbx.schemaChange(app, { table: 'customers', ops: [{ op: 'drop_column', name: 'plan' }] });
  await assert.rejects(() => dbx.schemaRollback(app, r.id), /cannot be undone automatically/);
  await dbx.schemaChange(app, { create: { name: 'notes', columns: [{ name: 'body', type: 'text' }] } });
  assert.ok((await dbx.overview(app)).tables.some((t) => t.name === 'notes'));
});
test('a failed backup stops the change', async () => {
  const dbx = makeDbx({ ops: { backup: async () => 1 }, audit: () => {} });
  const app = { id: 'app3', name: 'App3', db: { type: 'postgres', container: 'x' } };
  await assert.rejects(() => dbx.schemaChange(app, { table: 'customers', ops: [{ op: 'add_column', name: 'z', type: 'text' }] }), /backup failed/);
  assert.ok(!(await dbx.structure(app, 'customers')).columns.some((c) => c.name === 'z'));
});
