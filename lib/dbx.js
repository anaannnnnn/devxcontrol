// Database explorer: browse and edit Postgres (via docker exec psql) and SQLite (via a tiny helper image).
// Identifiers are checked against the live catalog and values are quoted as SQL literals, never concatenated raw.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { run } from './docker.js';
import { buildPlan, buildCreateTable, buildDropTable, SchemaError, PG_TYPES, SQLITE_TYPES } from './schema.js';

const DEMO = !!process.env.DEMO;
const MAX_ROWS = 500;
export class DbError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v);
  if (s.includes('\0')) throw new DbError('Value contains a NUL byte.');
  return `'${s.replace(/'/g, "''")}'`;
};
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

/* ------------------------------ postgres ------------------------------ */
function psql(container, sql, { timeout = 30000 } = {}) {
  return new Promise((resolve) => {
    const script = 'psql -X -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"';
    const p = spawn('docker', ['exec', '-i', container, 'sh', '-c', script]);
    let out = '', err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.stdout.on('data', (d) => { out += d; if (out.length > 32e6) p.kill('SIGKILL'); });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, out, err: err.trim() }); });
    p.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, out: '', err: e.message }); });
    p.stdin.end(`SET standard_conforming_strings=on;\nSET statement_timeout=20000;\n${sql}\n`);
  });
}
const pgJson = async (container, sql, opts) => {
  const r = await psql(container, `SELECT '@@' || coalesce(json_agg(t), '[]'::json)::text FROM (${sql}) t;`, opts);
  if (!r.ok) throw new DbError(cleanErr(r.err));
  // The JSON payload can span several lines (psql prints it unwrapped but with newlines between
  // array elements), so take everything after the @@ marker, not just the first line.
  const idx = r.out.indexOf('@@');
  if (idx < 0) return [];
  const payload = r.out.slice(idx + 2).trim();
  if (!payload) return [];
  try { return JSON.parse(payload); } catch { throw new DbError('Could not read the database response.'); }
};
const cleanErr = (e) => String(e || 'Database error').replace(/^psql: error: /, '').replace(/^ERROR:\s+/m, '').split('\n').slice(0, 3).join(' ').slice(0, 400);

const pg = (container) => ({
  engine: 'postgres',
  async tables() {
    return pgJson(container, `SELECT c.relname AS name, GREATEST(c.reltuples,0)::bigint AS rows, pg_total_relation_size(c.oid)::bigint AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname='public' ORDER BY c.relname`);
  },
  async columns(table) {
    const cols = await pgJson(container, `SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, NOT a.attnotnull AS nullable,
      pg_get_expr(d.adbin,d.adrelid) AS "default", COALESCE(i.indisprimary,false) AS pk, COALESCE((to_jsonb(a) ->> 'attgenerated') IN ('s','v'), false) AS generated
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      LEFT JOIN pg_index i ON i.indrelid=a.attrelid AND i.indisprimary AND a.attnum = ANY(i.indkey)
      WHERE n.nspname='public' AND c.relname=${lit(table)} AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`);
    if (!cols.length) throw new DbError(`No table named ${table}.`, 404);
    return cols;
  },
  async rows(table, cols, { limit, offset, q, sort, dir }) {
    const where = q ? `WHERE ${cols.map((c) => `${ident(c.name)}::text ILIKE ${lit(`%${q.replace(/[\\%_]/g, '\\$&')}%`)}`).join(' OR ')}` : '';
    const pks = cols.filter((c) => c.pk).map((c) => ident(c.name));
    const order = sort ? `${ident(sort)} ${dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST` : pks.join(', ');
    const rows = await pgJson(container, `SELECT * FROM ${ident(table)} ${where} ${order ? `ORDER BY ${order}` : ''} LIMIT ${limit} OFFSET ${offset}`);
    const c = await pgJson(container, `SELECT count(*)::bigint AS n FROM ${ident(table)} ${where}`);
    return { rows, total: Number(c[0]?.n || 0) };
  },
  async insert(table, values) {
    const keys = Object.keys(values);
    const sql = keys.length ? `INSERT INTO ${ident(table)} (${keys.map(ident).join(',')}) VALUES (${keys.map((k) => lit(values[k])).join(',')})` : `INSERT INTO ${ident(table)} DEFAULT VALUES`;
    const r = await psql(container, `${sql};`); if (!r.ok) throw new DbError(cleanErr(r.err));
  },
  async update(table, cols, key, set) {
    const w = Object.keys(key).map((k) => `${ident(k)}::text = ${lit(key[k])}`).join(' AND ');
    const s = Object.keys(set).map((k) => `${ident(k)} = ${lit(set[k])}`).join(', ');
    const r = await psql(container, `WITH u AS (UPDATE ${ident(table)} SET ${s} WHERE ${w} RETURNING 1) SELECT '@@'||count(*) FROM u;`);
    if (!r.ok) throw new DbError(cleanErr(r.err));
    if (r.out.trim() !== '@@1') throw new DbError(`Expected to change 1 row, changed ${r.out.trim().slice(2) || 0}. Nothing was applied.`, 409);
  },
  async remove(table, cols, key) {
    const w = Object.keys(key).map((k) => `${ident(k)}::text = ${lit(key[k])}`).join(' AND ');
    const r = await psql(container, `WITH d AS (DELETE FROM ${ident(table)} WHERE ${w} RETURNING 1) SELECT '@@'||count(*) FROM d;`);
    if (!r.ok) throw new DbError(cleanErr(r.err));
    if (r.out.trim() !== '@@1') throw new DbError('Expected to delete 1 row. Nothing was applied.', 409);
  },
  async indexes(table) {
    const r = await pgJson(container, `SELECT indexname AS name, indexdef AS def FROM pg_indexes WHERE schemaname='public' AND tablename=${lit(table)}
      AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conname = indexname) ORDER BY indexname`);
    return r.map((i) => ({ name: i.name, def: i.def, unique: /^CREATE UNIQUE/i.test(i.def), columns: (/\((.*)\)\s*$/.exec(i.def)?.[1] || '').split(',').map((x) => x.trim().replace(/^"|"$/g, '')) }));
  },
  async exec(statements, dry) {
    const r = await psql(container, `BEGIN;\n${statements.join(';\n')};\n${dry ? 'ROLLBACK' : 'COMMIT'};`, { timeout: 60000 });
    if (!r.ok) throw new DbError(cleanErr(r.err));
  },
  async query(sql, write) {
    const s = sql.trim().replace(/;+\s*$/, '');
    if (s.includes('\\')) throw new DbError('Backslashes are not supported in the SQL console (they can trigger psql meta-commands).');
    if (/^(select|with|table|values)\b/i.test(s) && !/;/.test(s)) {
      const r = await psql(container, `BEGIN READ ONLY;\nSELECT '@@' || coalesce(json_agg(t), '[]'::json) FROM (SELECT * FROM (${s}\n) q LIMIT ${MAX_ROWS}) t;\nROLLBACK;`);
      if (!r.ok) throw new DbError(cleanErr(r.err));
      const line = r.out.split('\n').find((l) => l.startsWith('@@'));
      const rows = line ? JSON.parse(line.slice(2)) : [];
      return { kind: 'rows', rows, columns: rows[0] ? Object.keys(rows[0]) : [], truncated: rows.length >= MAX_ROWS };
    }
    if (!write) throw new DbError('This looks like a change. Turn on "Allow changes" to run it.', 403);
    const r = await psql(container, `BEGIN;\n${s};\nCOMMIT;`);
    if (!r.ok) throw new DbError(cleanErr(r.err));
    return { kind: 'ok', message: r.out.trim() || 'Statement ran and was committed.' };
  },
});

/* ------------------------------ sqlite ------------------------------ */
const IMAGE = 'devx-sqlite:1';
let imageReady = null;
function ensureImage() {
  imageReady ??= (async () => {
    const have = await run('docker', ['image', 'inspect', IMAGE]);
    if (have.ok) return;
    await new Promise((resolve, reject) => {
      const p = spawn('docker', ['build', '-t', IMAGE, '-']);
      p.on('close', (c) => (c === 0 ? resolve() : reject(new DbError('Could not build the SQLite helper image.', 502))));
      p.stdin.end('FROM alpine:3.20\nRUN apk add --no-cache sqlite\n');
    });
  })().catch((e) => { imageReady = null; throw e; });
  return imageReady;
}
async function sqlite3(volume, file, sql, { json = true, write = false } = {}) {
  await ensureImage();
  const args = ['run', '--rm', '-v', `${volume}:/d`, IMAGE, 'sqlite3', '-cmd', '.timeout 5000', ...(write ? ['-bail'] : ['-readonly']), ...(json ? ['-json'] : []), `/d/${file}`, sql];
  const r = await run('docker', args, { timeout: 40000 });
  if (!r.ok) throw new DbError((r.err || 'SQLite error').trim().split('\n')[0].replace(/^Error: /, '').slice(0, 400));
  return json ? (r.out.trim() ? JSON.parse(r.out) : []) : r.out;
}
const sl = (volume, file) => ({
  engine: 'sqlite',
  async tables() {
    const t = await sqlite3(volume, file, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    if (!t.length) return [];
    const counts = await sqlite3(volume, file, t.map((x) => `SELECT '${x.name.replace(/'/g, "''")}' AS name, count(*) AS rows FROM ${ident(x.name)}`).join(' UNION ALL '));
    return counts.map((c) => ({ name: c.name, rows: c.rows, bytes: null }));
  },
  async columns(table) {
    const c = await sqlite3(volume, file, `PRAGMA table_info(${lit(table)})`);
    if (!c.length) throw new DbError(`No table named ${table}.`, 404);
    return c.map((x) => ({ name: x.name, type: x.type || 'any', nullable: !x.notnull, default: x.dflt_value, pk: x.pk > 0, generated: false }));
  },
  async rows(table, cols, { limit, offset, q, sort, dir }) {
    const where = q ? `WHERE ${cols.map((c) => `CAST(${ident(c.name)} AS TEXT) LIKE ${lit(`%${q.replace(/[\\%_]/g, '\\$&')}%`)} ESCAPE '\\'`).join(' OR ')}` : '';
    const order = sort ? `ORDER BY ${ident(sort)} ${dir === 'desc' ? 'DESC' : 'ASC'}` : 'ORDER BY rowid';
    const rows = await sqlite3(volume, file, `SELECT rowid AS _rowid_, * FROM ${ident(table)} ${where} ${order} LIMIT ${limit} OFFSET ${offset}`);
    const c = await sqlite3(volume, file, `SELECT count(*) AS n FROM ${ident(table)} ${where}`);
    return { rows, total: Number(c[0]?.n || 0) };
  },
  async insert(table, values) {
    const keys = Object.keys(values);
    const sql = keys.length ? `INSERT INTO ${ident(table)} (${keys.map(ident).join(',')}) VALUES (${keys.map((k) => lit(values[k])).join(',')})` : `INSERT INTO ${ident(table)} DEFAULT VALUES`;
    await sqlite3(volume, file, sql, { write: true, json: false });
  },
  async update(table, cols, key, set) {
    const s = Object.keys(set).map((k) => `${ident(k)} = ${lit(set[k])}`).join(', ');
    const rid = Number(key._rowid_); if (!Number.isInteger(rid)) throw new DbError('Missing row id.');
    const out = await sqlite3(volume, file, `UPDATE ${ident(table)} SET ${s} WHERE rowid=${rid}; SELECT changes();`, { write: true, json: false });
    if (out.trim() !== '1') throw new DbError('Expected to change 1 row. Nothing was applied.', 409);
  },
  async remove(table, cols, key) {
    const rid = Number(key._rowid_); if (!Number.isInteger(rid)) throw new DbError('Missing row id.');
    const out = await sqlite3(volume, file, `DELETE FROM ${ident(table)} WHERE rowid=${rid}; SELECT changes();`, { write: true, json: false });
    if (out.trim() !== '1') throw new DbError('Expected to delete 1 row. Nothing was applied.', 409);
  },
  async indexes(table) {
    const r = await sqlite3(volume, file, `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=${lit(table)} AND sql IS NOT NULL ORDER BY name`);
    return r.map((i) => ({ name: i.name, def: i.sql, unique: /^CREATE UNIQUE/i.test(i.sql), columns: (/\((.*)\)\s*$/.exec(i.sql)?.[1] || '').split(',').map((x) => x.trim().replace(/^"|"$/g, '')) }));
  },
  async exec(statements, dry) {
    await sqlite3(volume, file, `BEGIN;\n${statements.join(';\n')};\n${dry ? 'ROLLBACK' : 'COMMIT'};`, { write: true, json: false });
  },
  async query(sql, write) {
    const s = sql.trim().replace(/;+\s*$/, '');
    if (/(^|\n)\s*\./.test(s)) throw new DbError('Lines starting with a dot are SQLite shell commands and are not allowed here.');
    if (/^(select|with|pragma table_info|values)\b/i.test(s) && !/;/.test(s)) {
      const rows = await sqlite3(volume, file, `SELECT * FROM (${s}\n) LIMIT ${MAX_ROWS}`);
      return { kind: 'rows', rows, columns: rows[0] ? Object.keys(rows[0]) : [], truncated: rows.length >= MAX_ROWS };
    }
    if (!write) throw new DbError('This looks like a change. Turn on "Allow changes" to run it.', 403);
    const out = await sqlite3(volume, file, `${s}; SELECT changes();`, { write: true, json: false });
    return { kind: 'ok', message: `Done. Rows changed: ${out.trim() || 0}.` };
  },
});

/* ------------------------------ demo ------------------------------ */
const demoStores = new Map();
function demoStore(appId) {
  if (demoStores.has(appId)) return demoStores.get(appId);
  const now = Date.now();
  const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));
  const names = ['Ayesha', 'Omar', 'Lina', 'Hamad', 'Sara', 'Yusuf', 'Noor', 'Khalid', 'Mariam', 'Zayed'];
  const t = {
    customers: { cols: [['id', 'integer', true], ['name', 'text'], ['email', 'text'], ['plan', 'text'], ['created_at', 'timestamp']], rows: mk(37, (i) => ({ id: i, name: `${names[i % 10]} ${['Al Nuaimi', 'Khan', 'Haddad', 'Rao'][i % 4]}`, email: `user${i}@example.com`, plan: ['free', 'pro', 'business'][i % 3], created_at: new Date(now - i * 86400e3).toISOString() })) },
    orders: { cols: [['id', 'integer', true], ['customer_id', 'integer'], ['total_aed', 'numeric'], ['status', 'text']], rows: mk(120, (i) => ({ id: i, customer_id: (i % 37) + 1, total_aed: (i * 37.5 % 900 + 20).toFixed(2), status: ['paid', 'pending', 'shipped', 'refunded'][i % 4] })) },
    settings: { cols: [['key', 'text', true], ['value', 'text']], rows: [{ key: 'currency', value: 'AED' }, { key: 'tax_rate', value: '0.05' }, { key: 'region', value: 'dubai' }] },
  };
  demoStores.set(appId, t);
  return t;
}
const demoEngine = (appId, engine) => {
  const S = () => demoStore(appId);
  const tbl = (n) => { const x = S()[n]; if (!x) throw new DbError(`No table named ${n}.`, 404); return x; };
  const colsOf = (x) => x.cols.map(([name, type, pk]) => ({ name, type, pk: !!pk, nullable: !pk, default: null, generated: false }));
  return {
    engine,
    async tables() { return Object.entries(S()).map(([name, x]) => ({ name, rows: x.rows.length, bytes: x.rows.length * 120 })); },
    async columns(n) { return colsOf(tbl(n)); },
    async rows(n, cols, { limit, offset, q, sort, dir }) {
      let r = tbl(n).rows.map((x, i) => (engine === 'sqlite' ? { _rowid_: i + 1, ...x } : x));
      if (q) r = r.filter((x) => Object.values(x).some((v) => String(v).toLowerCase().includes(q.toLowerCase())));
      if (sort) r = [...r].sort((a, b) => (a[sort] > b[sort] ? 1 : -1) * (dir === 'desc' ? -1 : 1));
      return { rows: r.slice(offset, offset + limit), total: r.length };
    },
    async insert(n, values) { const x = tbl(n); const row = {}; x.cols.forEach(([c, , pk]) => { row[c] = values[c] ?? (pk && typeof x.rows[0]?.[c] === 'number' ? Math.max(0, ...x.rows.map((z) => z[c])) + 1 : null); }); x.rows.push(row); },
    async update(n, cols, key, set) {
      const x = tbl(n); const i = engine === 'sqlite' ? Number(key._rowid_) - 1 : x.rows.findIndex((r) => Object.keys(key).every((k) => String(r[k]) === String(key[k])));
      if (!x.rows[i]) throw new DbError('Row not found.', 409); Object.assign(x.rows[i], set);
    },
    async remove(n, cols, key) {
      const x = tbl(n); const i = engine === 'sqlite' ? Number(key._rowid_) - 1 : x.rows.findIndex((r) => Object.keys(key).every((k) => String(r[k]) === String(key[k])));
      if (!x.rows[i]) throw new DbError('Row not found.', 409); x.rows.splice(i, 1);
    },
    async indexes(n) { return (tbl(n).indexes || []).map((i) => ({ ...i })); },
    async exec(statements, dry) {
      const base = S(); const w = dry ? structuredClone(base) : base;
      const unq = (x) => x.replace(/^"|"$/g, '').replace(/""/g, '"');
      for (const st of statements) {
        let m;
        if ((m = /^ALTER TABLE "(.+?)" ADD COLUMN "(.+?)" ([^\s,]+)/.exec(st))) { const x = w[m[1]]; if (x.cols.some((c) => c[0] === m[2])) throw new DbError(`column "${m[2]}" already exists`); x.cols.push([m[2], m[3]]); x.rows.forEach((r) => { r[m[2]] = null; }); }
        else if ((m = /^ALTER TABLE "(.+?)" DROP COLUMN "(.+?)"/.exec(st))) { const x = w[m[1]]; x.cols = x.cols.filter((c) => c[0] !== m[2]); x.rows.forEach((r) => { delete r[m[2]]; }); }
        else if ((m = /^ALTER TABLE "(.+?)" RENAME COLUMN "(.+?)" TO "(.+?)"/.exec(st))) { const x = w[m[1]]; x.cols.forEach((c) => { if (c[0] === m[2]) c[0] = m[3]; }); x.rows.forEach((r) => { r[m[3]] = r[m[2]]; delete r[m[2]]; }); }
        else if ((m = /^ALTER TABLE "(.+?)" RENAME TO "(.+?)"/.exec(st))) { w[m[2]] = w[m[1]]; delete w[m[1]]; }
        else if ((m = /^ALTER TABLE "(.+?)" ALTER COLUMN "(.+?)" TYPE (\S+)/.exec(st))) { const c = w[m[1]].cols.find((z) => z[0] === m[2]); if (c) c[1] = m[3]; }
        else if (/^ALTER TABLE "(.+?)" ALTER COLUMN/.test(st)) { /* NOT NULL / DEFAULT: nothing to model in the demo */ }
        else if ((m = /^CREATE (UNIQUE )?INDEX "(.+?)" ON "(.+?)" \((.*)\)$/.exec(st))) { const x = w[m[3]]; (x.indexes ||= []).push({ name: m[2], def: st, unique: !!m[1], columns: m[4].split(',').map((c) => unq(c.trim())) }); }
        else if ((m = /^DROP INDEX (?:"public"\.)?"(.+?)"/.exec(st))) { for (const x of Object.values(w)) if (x.indexes) x.indexes = x.indexes.filter((i) => i.name !== m[1]); }
        else if ((m = /^CREATE TABLE "(.+?)" \((.*)\)$/.exec(st))) { if (w[m[1]]) throw new DbError(`relation "${m[1]}" already exists`); const cols = [...m[2].matchAll(/"(\w+)" (\w+)( [^,]*)?/g)].map((z) => [z[1], z[2].toLowerCase(), /PRIMARY KEY/i.test(z[3] || '')]); w[m[1]] = { cols, rows: [] }; }
        else if ((m = /^DROP TABLE "(.+?)"/.exec(st))) { delete w[m[1]]; }
        else throw new DbError('Demo mode cannot run that statement.');
      }
    },
    async query(sql, write) {
      const m = /^\s*select\s+(.+?)\s+from\s+"?(\w+)"?(?:\s+limit\s+(\d+))?\s*;?\s*$/i.exec(sql);
      if (m) { const x = tbl(m[2]); const rows = x.rows.slice(0, +m[3] || MAX_ROWS); return { kind: 'rows', rows, columns: x.cols.map((c) => c[0]), truncated: false }; }
      if (/^\s*(select|with)/i.test(sql)) return { kind: 'rows', rows: [{ demo: 'Demo mode answers "select * from <table>" only.' }], columns: ['demo'], truncated: false };
      if (!write) throw new DbError('This looks like a change. Turn on "Allow changes" to run it.', 403);
      return { kind: 'ok', message: 'Demo mode: statement accepted but not executed.' };
    },
  };
};

/* ------------------------------ facade ------------------------------ */
export function makeDbx({ ops, audit, dataDir = null }) {
  const histFile = dataDir ? path.join(dataDir, 'schema-history.json') : null;
  let mem = [];
  const loadHist = () => { if (!histFile) return mem; try { return JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch { return []; } };
  const saveHist = (h) => { h = h.slice(-300); if (!histFile) { mem = h; return; } const t = `${histFile}.tmp`; fs.writeFileSync(t, JSON.stringify(h), { mode: 0o600 }); fs.renameSync(t, histFile); };
  const wrapSchema = async (fn) => { try { return await fn(); } catch (e) { if (e instanceof SchemaError) throw new DbError(e.message, e.status); throw e; } };
  const summary = (plan) => ({ statements: plan.statements, warnings: plan.warnings, destructive: plan.destructive, reversible: plan.reversible && plan.down.length > 0 });
  async function engineFor(app, file) {
    const db = app.db || {};
    if (DEMO && (db.type === 'postgres' || db.type === 'sqlite')) return { eng: demoEngine(app.id, db.type), files: db.type === 'sqlite' ? ['app.db'] : null, file: 'app.db' };
    if (db.type === 'postgres' && !db.container) throw new DbError(db.note || 'This app\'s database cannot be browsed here.', 404);
    if (db.type === 'postgres') return { eng: pg(db.container), files: null };
    if (db.type === 'sqlite') {
      const info = await ops.dataInfo(app);
      const files = (info.files || []).filter((f) => /\.(db|sqlite3?|sqlite)$/i.test(f));
      if (!files.length) throw new DbError('No SQLite database file found in this volume.', 404);
      const pick = file ? files.find((f) => f === file) : files[0];
      if (!pick) throw new DbError('Unknown database file.', 400);
      return { eng: sl(db.volume, pick), files, file: pick };
    }
    throw new DbError(db.note || 'This app has no database on this server.', 404);
  }
  async function table(app, name, file) {
    const ctx = await engineFor(app, file);
    const tables = await ctx.eng.tables();
    if (!tables.some((t) => t.name === name)) throw new DbError(`No table named ${name}.`, 404);
    return { ...ctx, cols: await ctx.eng.columns(name) };
  }
  const checkCols = (cols, obj, what) => {
    for (const k of Object.keys(obj || {})) {
      const c = cols.find((x) => x.name === k);
      if (!c && !(k === '_rowid_')) throw new DbError(`Unknown column ${k} in ${what}.`);
      if (c?.generated) throw new DbError(`Column ${k} is generated and cannot be set.`);
    }
  };
  const keyOf = (ctx, cols, key) => {
    if (ctx.eng.engine === 'sqlite') { if (key?._rowid_ == null) throw new DbError('Missing row id.'); return { _rowid_: key._rowid_ }; }
    const pks = cols.filter((c) => c.pk).map((c) => c.name);
    if (!pks.length) throw new DbError('This table has no primary key, so rows cannot be edited safely here. Use the SQL console.', 409);
    const out = {}; for (const k of pks) { if (key?.[k] === undefined) throw new DbError(`Missing key ${k}.`); out[k] = key[k]; }
    return out;
  };
  const clean = (v) => (v && typeof v === 'object' ? JSON.stringify(v) : v);
  const norm = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, clean(v)]));

  return {
    DbError,
    async overview(app, file) {
      const { eng, files, file: f } = await engineFor(app, file);
      return { engine: eng.engine, files, file: f || null, tables: await eng.tables() };
    },
    async schema(app, file) {
      const { eng, files, file: f } = await engineFor(app, file);
      const tables = await eng.tables(); const out = [];
      for (const t of tables.slice(0, 60)) out.push({ t: t.name, rows: t.rows, bytes: t.bytes, cols: (await eng.columns(t.name)).map((c) => [c.name, c.type, c.pk ? 'pk' : c.nullable ? '' : 'not null']) });
      return { engine: eng.engine, files, file: f || null, tables: out };
    },
    async browse(app, name, q, file) {
      const ctx = await table(app, name, file);
      const limit = Math.min(Math.max(+q.limit || 50, 1), MAX_ROWS), offset = Math.max(+q.offset || 0, 0);
      const sort = ctx.cols.some((c) => c.name === q.sort) || q.sort === '_rowid_' ? q.sort : null;
      const r = await ctx.eng.rows(name, ctx.cols, { limit, offset, q: (q.q || '').slice(0, 200), sort, dir: q.dir });
      const editable = ctx.eng.engine === 'sqlite' || ctx.cols.some((c) => c.pk);
      return { engine: ctx.eng.engine, table: name, columns: ctx.cols, editable, limit, offset, ...r };
    },
    async insert(app, name, values, file) {
      const ctx = await table(app, name, file); const v = norm(values); checkCols(ctx.cols, v, 'insert');
      await ctx.eng.insert(name, v); audit(app, `Inserted a row into ${name}`);
    },
    async update(app, name, key, set, file) {
      const ctx = await table(app, name, file); const s = norm(set); if (!Object.keys(s).length) throw new DbError('Nothing to change.');
      checkCols(ctx.cols, s, 'update');
      await ctx.eng.update(name, ctx.cols, keyOf(ctx, ctx.cols, key), s); audit(app, `Edited ${Object.keys(s).join(', ')} in ${name}`);
    },
    async remove(app, name, key, file) {
      const ctx = await table(app, name, file);
      await ctx.eng.remove(name, ctx.cols, keyOf(ctx, ctx.cols, key)); audit(app, `Deleted a row from ${name}`);
    },
    async query(app, sql, write, file) {
      if (typeof sql !== 'string' || !sql.trim()) throw new DbError('Write some SQL first.');
      if (sql.length > 20000) throw new DbError('That statement is too long.');
      const { eng } = await engineFor(app, file);
      const r = await eng.query(sql, !!write);
      if (r.kind === 'ok') audit(app, `Ran SQL change: ${sql.trim().replace(/\s+/g, ' ').slice(0, 80)}`);
      return r;
    },
    async structure(app, name, file) {
      const ctx = await table(app, name, file);
      const indexes = await ctx.eng.indexes(name);
      const history = loadHist().filter((h) => h.app === app.id && (h.table === name || h.tableBefore === name)).slice(-15).reverse().map(({ down, ...h }) => h);
      return { engine: ctx.eng.engine, table: name, columns: ctx.cols, indexes, types: ctx.eng.engine === 'sqlite' ? SQLITE_TYPES : PG_TYPES, canAlter: ctx.eng.engine !== 'sqlite', history };
    },
    async schemaChange(app, body, file) {
      return wrapSchema(async () => {
        const ctx = await engineFor(app, file); const engine = ctx.eng.engine; const tables = await ctx.eng.tables();
        let plan; let name = null;
        if (body?.create) {
          name = body.create.name; if (tables.some((t) => t.name === name)) throw new DbError(`A table called ${name} already exists.`, 409);
          plan = buildCreateTable(engine, name, body.create.columns, body.create.autoId !== false);
        } else if (body?.drop) {
          name = body.drop.name; if (!tables.some((t) => t.name === name)) throw new DbError(`No table named ${name}.`, 404);
          if (body.drop.confirm !== name) throw new DbError(`Type the table name (${name}) to confirm dropping it.`, 400);
          plan = buildDropTable(name);
        } else {
          name = body?.table; const t = await table(app, name, file);
          plan = buildPlan(engine, name, body?.ops, t.cols, await ctx.eng.indexes(name));
        }
        await ctx.eng.exec(plan.statements, true); // dry run inside a transaction that is rolled back
        if (body?.dry) return { dry: true, ok: true, ...summary(plan) };
        let backupName = null; const lines = [];
        const code = await ops.backup(app, (l) => lines.push(String(l)));
        backupName = /Creating (\S+) \.\.\./.exec(lines.join('\n'))?.[1] || null;
        if (code !== 0 && code !== 2) throw new DbError('The safety backup failed, so nothing was changed. Fix the backup first.', 502);
        await ctx.eng.exec(plan.statements, false);
        const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), app: app.id, file: ctx.file || null, engine, table: plan.tableAfter ?? name, tableBefore: name, ops: body?.ops || (body?.create ? [{ op: 'create_table', name }] : [{ op: 'drop_table', name }]), up: plan.statements, down: plan.down, reversible: plan.reversible && plan.down.length > 0, backup: backupName, rolledBack: null };
        const h = loadHist(); h.push(entry); saveHist(h);
        audit(app, `Changed structure of ${name}: ${plan.statements.length} statement${plan.statements.length === 1 ? '' : 's'}`);
        return { dry: false, ok: true, id: entry.id, backup: backupName, ...summary(plan) };
      });
    },
    async schemaHistory(app) { return loadHist().filter((h) => h.app === app.id).slice(-40).reverse().map(({ down, up, ...h }) => ({ ...h, statements: up })); },
    async schemaRollback(app, id, file) {
      return wrapSchema(async () => {
        const h = loadHist(); const e = h.find((x) => x.id === id && x.app === app.id);
        if (!e) throw new DbError('That change is not in the history.', 404);
        if (e.rolledBack) throw new DbError('That change was already undone.', 409);
        if (!e.reversible) throw new DbError(`This change cannot be undone automatically${e.backup ? `. Restore the backup ${e.backup} from the Backups page.` : '.'}`, 409);
        const newer = h.filter((x) => x.app === app.id && !x.rolledBack && x.at > e.at);
        if (newer.length) throw new DbError('Undo the newer changes first (newest first).', 409);
        const ctx = await engineFor(app, e.file || file);
        await ctx.eng.exec(e.down, true); await ctx.eng.exec(e.down, false);
        e.rolledBack = Date.now(); saveHist(h); audit(app, `Undid structure change on ${e.tableBefore}`);
        return { ok: true };
      });
    },
    async csv(app, name, file) {
      const ctx = await table(app, name, file); const out = [ctx.cols.map((c) => c.name).join(',')];
      const esc = (v) => { if (v == null) return ''; let t = typeof v === 'object' ? JSON.stringify(v) : String(v); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
      for (let off = 0; off < 20000; off += 500) {
        const { rows } = await ctx.eng.rows(name, ctx.cols, { limit: 500, offset: off });
        for (const r of rows) out.push(ctx.cols.map((c) => esc(r[c.name])).join(','));
        if (rows.length < 500) break;
      }
      return out.join('\n');
    },
  };
}
