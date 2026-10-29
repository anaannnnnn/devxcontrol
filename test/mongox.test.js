import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseUri, buildUri, scrub, detect, overrideText, setEnvLine, cleanArgs, validDb } from '../lib/mongox.js';

test('parseUri rejects placeholders and missing parts, accepts a real string', () => {
  assert.throws(() => parseUri('mongodb+srv://<db_username>:<db_password>@c.mongodb.net/'), /Replace/);
  assert.throws(() => parseUri('postgres://a:b@h/db'), /starts with mongodb/);
  assert.throws(() => parseUri('mongodb+srv://c.mongodb.net/'), /username/);
  assert.deepEqual(parseUri('mongodb+srv://anan:pw@cluster0.x.mongodb.net/'), { host: 'cluster0.x.mongodb.net', user: 'anan' });
});

test('buildUri adds the database and safe options', () => {
  const u = buildUri('mongodb+srv://anan:pw@cluster0.x.mongodb.net/', 'wasl_hrms');
  assert.match(u, /^mongodb\+srv:\/\/anan:pw@cluster0\.x\.mongodb\.net\/wasl_hrms\?/);
  assert.match(u, /retryWrites=true/); assert.match(u, /w=majority/);
  assert.throws(() => buildUri('mongodb+srv://a:b@h/', 'bad name!'), /database name/);
  assert.ok(validDb('app_db-1')); assert.ok(!validDb('')); assert.ok(!validDb('a'.repeat(39)));
});

test('scrub hides credentials in text', () => {
  assert.equal(scrub('failed mongodb+srv://anan:secret@host/db oops'), 'failed mongodb+srv://<hidden>@host/db oops');
  assert.equal(scrub('pw is Devx2026 here', 'mongodb+srv://anan:Devx2026@h/'), 'pw is <hidden> here');
});

test('detect finds Mongo variables and bundled mongo images', async () => {
  const files = { '.env.example': 'PORT=4000\nMONGO_URI=mongodb://localhost:27017/x\n', 'docker-compose.yml': 'services:\n  mongo:\n    image: mongo:7.0\n' };
  const r = await detect(async (f) => files[f] || null);
  assert.equal(r.uses, true); assert.equal(r.envVar, 'MONGO_URI'); assert.equal(r.bundled, true);
  const none = await detect(async (f) => ({ '.env.example': 'DATABASE_URL="postgresql://u:p@h/db"\n', 'docker-compose.yml': 'services:\n  postgres:\n    image: postgres:16\n' })[f] || null);
  assert.equal(none.uses, false);
  const viaDbUrl = await detect(async (f) => ({ '.env.example': 'DATABASE_URL=mongodb://localhost/x\n' })[f] || null);
  assert.equal(viaDbUrl.envVar, 'DATABASE_URL');
});

test('overrideText points the app at the env var, drops the dependency and switches the bundled db off', () => {
  const info = { services: { api: { depends_on: { mongo: { condition: 'service_healthy' }, redis: { condition: 'service_started' } } }, mongo: {}, redis: {} }, mongoServices: ['mongo'], consumers: ['api'], dependants: ['api'] };
  const t = overrideText(info, 'MONGO_URI');
  assert.match(t, /api:\n    environment:\n      MONGO_URI: \$\{MONGO_URI\}/);
  assert.match(t, /depends_on: !override\n      redis:\n        condition: service_started/);
  assert.match(t, /mongo:\n    profiles: \["devx-local-db"\]/);
  assert.equal(overrideText({ services: {}, mongoServices: [], consumers: [], dependants: [] }, 'X'), null);
  const only = overrideText({ services: { api: { depends_on: { mongo: {} } } }, mongoServices: ['mongo'], consumers: [], dependants: ['api'] }, 'MONGO_URI');
  assert.match(only, /depends_on: !reset null/);
});

test('setEnvLine updates or adds a line and keeps the rest', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'env-')), '.env');
  fs.writeFileSync(f, 'A=1\nMONGO_URI=old\nB=2\n');
  assert.equal(setEnvLine(f, 'MONGO_URI', 'new'), 'updated');
  assert.equal(fs.readFileSync(f, 'utf8'), 'A=1\nMONGO_URI=new\nB=2\n');
  assert.equal(setEnvLine(f, 'C', '3'), 'added');
  assert.equal(fs.readFileSync(f, 'utf8'), 'A=1\nMONGO_URI=new\nB=2\nC=3\n');
  assert.throws(() => setEnvLine(f, 'bad key', 'x'));
  assert.throws(() => setEnvLine(f, 'K', 'a\nb'));
});

test('cleanArgs only lets well-formed requests through', () => {
  assert.throws(() => cleanArgs('find', { db: 'x', coll: 'system.users' }), /collection/);
  assert.throws(() => cleanArgs('find', { db: 'x', coll: 'ok', filter: [] }), /filter/);
  assert.throws(() => cleanArgs('insert', { db: 'x', coll: 'ok', doc: 'no' }), /JSON object/);
  assert.throws(() => cleanArgs('delete', { db: 'x', coll: 'ok' }), /_id/);
  const a = cleanArgs('find', { db: 'app', coll: 'users', limit: 9999, skip: -5 });
  assert.equal(a.limit, 100); assert.equal(a.skip, 0); assert.deepEqual(a.sort, { _id: 1 });
  assert.deepEqual(cleanArgs('databases', {}), { op: 'databases' });
  assert.deepEqual(cleanArgs('counts', { db: 'a', colls: ['x', 'y'] }).colls, ['x', 'y']);
});

test('pgExportSql: primary key becomes _id, dates/decimals/bigints/bytea keep their real types', async () => {
  const { pgExportSql } = await import('../lib/mongox.js');
  const sql = pgExportSql('Model3DAsset', [{ name: 'productId', type: 'text' }, { name: 'glb', type: 'bytea' }, { name: 'updatedAt', type: 'timestamp without time zone' }, { name: 'price', type: 'numeric' }, { name: 'n', type: 'bigint' }], ['productId']);
  assert.match(sql, /'_id', to_jsonb\(x\."productId"\)/);
  assert.match(sql, /'\$binary'/); assert.match(sql, /'base64'/); assert.doesNotMatch(sql, /'hex'/);
  assert.match(sql, /'\$date'/); assert.match(sql, /'\$numberDecimal'/); assert.match(sql, /'\$numberLong'/);
  assert.doesNotMatch(sql, /'productId', /, 'the key column is not repeated as a normal field');
  const composite = pgExportSql('link', [{ name: 'a', type: 'text' }, { name: 'b', type: 'text' }], ['a', 'b']);
  assert.doesNotMatch(composite, /'_id'/);
});
