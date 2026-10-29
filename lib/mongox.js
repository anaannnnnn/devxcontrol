// MongoDB support: list the databases on a saved cluster, spot a repo that wants MongoDB, and swap the database
// that ships with an app for the one you pick. Everything shells out to docker (mongosh runs in a throwaway
// container), so DevX Control keeps zero npm dependencies. Connection strings travel only in environment
// variables, never in arguments, logs or API answers.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { run } from './docker.js';

const DEMO = !!process.env.DEMO;
export const IMAGE = 'mongo:7.0';
export const OVERRIDE = 'docker-compose.devx-mongo.yml';
export const LOCAL_PROFILE = 'devx-local-db';
const COMPOSE = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
const PEEK = ['.env.example', '.env.sample', 'env.example', 'server/.env.example', 'api/.env.example', 'backend/.env.example', ...COMPOSE, 'render.yaml'];
const VAR_RE = /\b(MONGO(?:DB)?_(?:URI|URL)|MONGO(?:DB)?_CONNECTION_STRING)\b/;
const BUNDLED_RE = /^\s*image:\s*["']?(?:docker\.io\/)?(?:library\/)?(?:mongo|mongodb\/mongodb-community-server)(?::|["']?\s*$)/m;
const SYSTEM = new Set(['admin', 'local', 'config']);
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

export const validDb = (n) => typeof n === 'string' && /^[A-Za-z0-9_-]{1,38}$/.test(n);
export const validVar = (n) => typeof n === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(n);

/** Parse and check a connection string. Returns { host, user } or throws a plain-language error. */
export function parseUri(raw) {
  const s = String(raw || '').trim();
  if (!/^mongodb(\+srv)?:\/\//i.test(s)) throw new Error('A MongoDB connection string starts with mongodb+srv:// or mongodb://');
  if (/<[^>]*(password|username|user)[^>]*>/i.test(s)) throw new Error('Replace <db_username> and <db_password> with the real database user and password.');
  let u; try { u = new URL(s); } catch { throw new Error('That connection string is not valid. Special characters in the password must be URL-encoded (@ becomes %40).'); }
  if (!u.hostname) throw new Error('The connection string has no host.');
  if (!u.username) throw new Error('The connection string has no username. Use mongodb+srv://USER:PASSWORD@host/');
  if (!u.password) throw new Error('The connection string has no password.');
  return { host: u.host, user: decodeURIComponent(u.username) };
}

/** The cluster string with a database name and sane options. */
export function buildUri(base, dbName) {
  if (!validDb(dbName)) throw new Error('A database name may use letters, numbers, - and _ (up to 38 characters).');
  const u = new URL(base); u.pathname = `/${dbName}`;
  if (!u.searchParams.has('retryWrites')) u.searchParams.set('retryWrites', 'true');
  if (!u.searchParams.has('w')) u.searchParams.set('w', 'majority');
  return u.toString();
}

/** Remove anything that looks like credentials from text before it is shown or logged. */
export const scrub = (text, ...secrets) => {
  let t = String(text || '').replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]+@/gi, '$1<hidden>@');
  for (const s of secrets) { if (!s) continue; try { const u = new URL(s); if (u.password) t = t.split(decodeURIComponent(u.password)).join('<hidden>').split(u.password).join('<hidden>'); } catch { /* not a url */ } }
  return t;
};

/** Run a snippet of mongosh against a connection string, in a throwaway container. */
async function mongosh(uri, js, timeout = 60000) {
  const r = await run('docker', ['run', '--rm', '-e', 'MU', '-e', 'JS', IMAGE, 'sh', '-c', 'mongosh "$MU" --quiet --eval "$JS"'], { env: { MU: uri, JS: js }, timeout });
  const lines = r.out.split('\n').map((l) => l.trim()).filter(Boolean);
  return { ok: r.ok, out: lines.at(-1) || '', err: scrub(r.err || r.out, uri).trim().split('\n').filter((l) => !/Pulling|Pull complete|Digest|Status:|Unable to find image/.test(l)).slice(-2).join(' ') };
}

/** Connect and list databases. Never throws: { ok, databases, listed, error }. */
export async function listDatabases(uri) {
  if (DEMO) return { ok: true, listed: true, databases: ['app_db', 'analytics'] };
  const js = 'try{print(JSON.stringify({ok:1,dbs:db.adminCommand({listDatabases:1,nameOnly:true}).databases.map(d=>d.name)}))}catch(e){let p=0;try{p=db.runCommand({ping:1}).ok}catch(x){};print(JSON.stringify({ok:p,err:String(e.message||e)}))}';
  const r = await mongosh(uri, js);
  let j = null; try { j = JSON.parse(r.out); } catch { /* not json */ }
  if (!r.ok || !j) return { ok: false, listed: false, databases: [], error: friendly(r.err) };
  if (!j.ok) return { ok: false, listed: false, databases: [], error: friendly(j.err) };
  if (!j.dbs) return { ok: true, listed: false, databases: [], error: 'Connected, but this user cannot list databases. Type the database name instead.' };
  return { ok: true, listed: true, databases: j.dbs.filter((d) => !SYSTEM.has(d)).sort() };
}

/** Prove the exact string the app will use can log in and write. */
export async function ping(uri) {
  if (DEMO) return { ok: true };
  const r = await mongosh(uri, 'print(JSON.stringify({ok:db.runCommand({ping:1}).ok}))', 45000);
  let j = null; try { j = JSON.parse(r.out); } catch { /* not json */ }
  return r.ok && j?.ok === 1 ? { ok: true } : { ok: false, error: friendly(r.err) };
}

function friendly(msg) {
  const m = String(msg || '');
  if (/bad auth|Authentication failed/i.test(m)) return 'The username or password was rejected by Atlas.';
  if (/ENOTFOUND|querySrv|getaddrinfo/i.test(m)) return 'That host name could not be found. Check the cluster address.';
  if (/timed out|ServerSelection|ETIMEDOUT|ECONNREFUSED/i.test(m)) return 'Could not reach the cluster. In Atlas, open Network Access and allow this server\'s IP address.';
  if (/not authorized|requires authentication/i.test(m)) return 'The user is not allowed to do that. Give it readWrite on the database.';
  return m.slice(0, 220) || 'Could not connect.';
}

/* ------------------------------------------------------------------ */
/* Spot a repo that wants MongoDB                                      */
/* ------------------------------------------------------------------ */

/** read(path) resolves to file text or null. */
export async function detect(read) {
  let envVar = null; let bundled = false; const from = [];
  for (const f of PEEK) {
    let t; try { t = await read(f); } catch { t = null; }
    if (!t) continue;
    const m = VAR_RE.exec(t);
    if (m && !envVar) { envVar = m[1]; from.push(f); }
    if (COMPOSE.includes(f) && BUNDLED_RE.test(t)) { bundled = true; if (!from.includes(f)) from.push(f); }
    if (!envVar && /^\s*#?\s*DATABASE_URL\s*=\s*["']?mongodb/m.test(t)) { envVar = 'DATABASE_URL'; from.push(f); }
  }
  return { uses: !!(envVar || bundled), envVar: envVar || (bundled ? 'MONGO_URI' : null), bundled, from };
}

/** Read files straight from a checkout on disk. */
export const diskReader = (dir) => async (f) => { try { return await fsp.readFile(path.join(dir, f), 'utf8'); } catch { return null; } };

/* ------------------------------------------------------------------ */
/* Compose override: use the chosen database, drop the bundled one      */
/* ------------------------------------------------------------------ */

const composeFile = (dir) => COMPOSE.find((f) => fs.existsSync(path.join(dir, f))) || null;

/** What the app's own compose file says about Mongo, using docker itself to resolve it. */
export async function composeInfo(app, envVar) {
  const file = composeFile(app.path); if (!file) return null;
  const args = ['compose', '-f', file, ...(fs.existsSync(path.join(app.path, 'docker-compose.devx.yml')) ? ['-f', 'docker-compose.devx.yml'] : []), 'config', '--format', 'json', '--no-interpolate'];
  const r = await run('docker', args, { cwd: app.path, timeout: 30000 });
  if (!r.ok) return null;
  let cfg; try { cfg = JSON.parse(r.out); } catch { return null; }
  const services = cfg.services || {};
  const names = Object.keys(services);
  const mongoServices = names.filter((n) => /(^|\/)(mongo|mongodb-community-server)(:|$)/.test(services[n].image || ''));
  const asKeys = (e) => (Array.isArray(e) ? e.map((x) => String(x).split('=')[0]) : Object.keys(e || {}));
  const consumers = envVar ? names.filter((n) => asKeys(services[n].environment).includes(envVar)) : [];
  const dependants = names.filter((n) => !mongoServices.includes(n) && Object.keys(services[n].depends_on || {}).some((d) => mongoServices.includes(d)));
  return { file, services, mongoServices, consumers, dependants };
}

/** Text of the override file, or null when the app needs none. */
export function overrideText(info, envVar) {
  if (!info) return null;
  const touched = [...new Set([...info.consumers, ...info.dependants])];
  if (!touched.length && !info.mongoServices.length) return null;
  const out = ['# Written by DevX Control. Uses the MongoDB chosen in Connections instead of the database bundled with the app.', 'services:'];
  for (const n of touched) {
    out.push(`  ${n}:`);
    if (info.consumers.includes(n)) out.push('    environment:', `      ${envVar}: \${${envVar}}`);
    if (info.dependants.includes(n)) {
      const rest = Object.entries(info.services[n].depends_on || {}).filter(([k]) => !info.mongoServices.includes(k));
      if (!rest.length) out.push('    depends_on: !reset null');
      else { out.push('    depends_on: !override'); for (const [k, v] of rest) out.push(`      ${k}:`, `        condition: ${(v && v.condition) || 'service_started'}`); }
    }
  }
  for (const m of info.mongoServices) out.push(`  ${m}:`, `    profiles: ["${LOCAL_PROFILE}"]`);
  return `${out.join('\n')}\n`;
}

/** Write (or remove) the override beside the app's compose file. Returns what was done. */
export async function writeOverride(app, envVar) {
  const target = path.join(app.path, OVERRIDE);
  const info = await composeInfo(app, envVar);
  const text = overrideText(info, envVar);
  if (!text) { await fsp.rm(target, { force: true }); return { written: false, mongoServices: [], info }; }
  await fsp.writeFile(target, text, { mode: 0o644 });
  return { written: true, mongoServices: info.mongoServices, info };
}

export const clearOverride = (app) => fsp.rm(path.join(app.path, OVERRIDE), { force: true });

/** Set KEY=value in an env file, adding the line when it is missing. Creates the file if needed. */
export function setEnvLine(file, key, value) {
  if (!validVar(key)) throw new Error('Bad variable name.');
  if (/[\r\n\0]/.test(value)) throw new Error('Bad value.');
  let lines = []; let mode = 0o600;
  try { lines = fs.readFileSync(file, 'utf8').split('\n'); mode = fs.statSync(file).mode & 0o777; } catch { /* new file */ }
  const re = new RegExp(`^\\s*(export\\s+)?${key}\\s*=`);
  let hit = false;
  lines = lines.map((l) => { if (hit || !re.test(l)) return l; hit = true; return `${/^\s*export\s/.test(l) ? 'export ' : ''}${key}=${value}`; });
  if (!hit) { while (lines.length && lines.at(-1) === '') lines.pop(); lines.push(`${key}=${value}`, ''); }
  const tmp = `${file}.tmp`; fs.writeFileSync(tmp, lines.join('\n'), { mode }); fs.renameSync(tmp, file);
  return hit ? 'updated' : 'added';
}

/* ------------------------------------------------------------------ */
/* After the app is running on the chosen database                     */
/* ------------------------------------------------------------------ */

async function localContainers(app, services) {
  const out = [];
  for (const svc of services) {
    const r = await run('docker', ['ps', '-a', '--filter', `label=com.docker.compose.project.working_dir=${app.path}`, '--filter', `label=com.docker.compose.service=${svc}`, '--format', '{{.Names}}'], { timeout: 20000 });
    r.out.split('\n').map((x) => x.trim()).filter(Boolean).forEach((n) => out.push(n));
  }
  return out;
}

/**
 * Copy what is in the bundled database into the chosen one, keep a file backup, then remove the bundled container.
 * Data volumes are never deleted. Safe to call repeatedly: it does nothing when the bundled container is gone.
 */
export async function retireLocal(app, binding, { backupDir, log, targetUri }) {
  const services = binding.mongoServices || [];
  if (!services.length) return;
  const names = await localContainers(app, services);
  if (!names.length) { log('The bundled MongoDB container is already gone.'); return; }
  for (const c of names) {
    const st = await run('docker', ['inspect', '-f', '{{.State.Running}}', c], { timeout: 15000 });
    if (st.out.trim() !== 'true') { log(`${c} is stopped. Leaving it and its data volume as they are.`); continue; }
    const file = path.join(backupDir, `${app.id}-local-mongo-${stamp()}.archive.gz`);
    log(`Saving a copy of the bundled database to ${path.basename(file)} ...`);
    const dump = await new Promise((resolve) => {
      import('node:child_process').then(({ spawn }) => {
        const p = spawn('docker', ['exec', c, 'mongodump', '--quiet', '--archive', '--gzip']);
        const w = fs.createWriteStream(file, { mode: 0o600 });
        p.stdout.pipe(w); let err = ''; p.stderr.on('data', (d) => { err += d; });
        p.on('close', (code) => { w.end(); resolve({ code, err }); });
        p.on('error', (e) => resolve({ code: 127, err: e.message }));
      });
    });
    const size = (() => { try { return fs.statSync(file).size; } catch { return 0; } })();
    if (dump.code !== 0 || size < 20) { log(`Could not back up ${c} (${scrub(dump.err).slice(0, 120)}). It was NOT removed.`); try { fs.rmSync(file, { force: true }); } catch { /* none */ } continue; }
    log(`Backup saved (${(size / 1024).toFixed(0)} KB).`);
    if (binding.copy && targetUri) {
      const dbs = await run('docker', ['exec', c, 'mongosh', '--quiet', '--eval', 'print(JSON.stringify(db.adminCommand({listDatabases:1,nameOnly:true}).databases.map(d=>d.name)))'], { timeout: 30000 });
      let names2 = []; try { names2 = JSON.parse(dbs.out.trim().split('\n').at(-1)); } catch { /* none */ }
      names2 = names2.filter((d) => !SYSTEM.has(d));
      const one = names2.length === 1 ? names2[0] : null;
      for (const d of names2) {
        const to = one ? binding.database : d;
        log(`Copying ${d} into ${to} on ${binding.clusterName || 'the cluster'} ...`);
        const cp = await new Promise((resolve) => {
          import('node:child_process').then(({ spawn }) => {
            const dumpP = spawn('docker', ['exec', c, 'mongodump', '--quiet', '--archive', `--db=${d}`]);
            const rest = spawn('docker', ['run', '--rm', '-i', '-e', 'MU', IMAGE, 'sh', '-c', `mongorestore --quiet --archive --uri "$MU" --nsFrom '${d}.*' --nsTo '${to}.*'`], { env: { ...process.env, MU: targetUri } });
            dumpP.stdout.pipe(rest.stdin); let err = ''; rest.stderr.on('data', (x) => { err += x; });
            rest.on('close', (code) => resolve({ code, err }));
            rest.on('error', (e) => resolve({ code: 127, err: e.message }));
          });
        });
        log(cp.code === 0 ? `Copied ${d}.` : `Copy of ${d} failed: ${scrub(cp.err, targetUri).slice(0, 160)}. The bundled container was NOT removed.`);
        if (cp.code !== 0) return;
      }
    }
    log(`Stopping and removing ${c} (its data volume is kept) ...`);
    await run('docker', ['rm', '-f', c], { timeout: 60000 });
  }
}

/* ------------------------------------------------------------------ */
/* Browse and edit data (the Databases page)                           */
/* ------------------------------------------------------------------ */

// One fixed script. Everything the caller controls goes in through the ARGS environment variable as Extended JSON,
// so nothing the user types is ever spliced into code.
const DATA_JS = `
const a = EJSON.parse(process.env.ARGS);
const out = (v) => print(EJSON.stringify(v, { relaxed: true }));
try {
  const d = a.db ? db.getSiblingDB(a.db) : db;
  const c = a.coll ? d.getCollection(a.coll) : null;
  if (a.op === 'databases') out(db.adminCommand({ listDatabases: 1 }).databases.filter(x => !['admin','local','config'].includes(x.name)).map(x => ({ name: x.name, size: x.sizeOnDisk, empty: x.empty })));
  else if (a.op === 'collections') out(d.getCollectionInfos({}, { nameOnly: false }).filter(x => !x.name.startsWith('system.')).map(x => ({ name: x.name, type: x.type, count: x.type === 'view' ? null : d.getCollection(x.name).estimatedDocumentCount() })).sort((p, q) => p.name.localeCompare(q.name)));
  else if (a.op === 'find') { const f = a.filter || {}; const total = c.countDocuments(f, { maxTimeMS: 15000 }); const docs = c.find(f).sort(a.sort || { _id: 1 }).skip(a.skip || 0).limit(a.limit || 25).maxTimeMS(15000).toArray(); out({ total, docs }); }
  else if (a.op === 'insert') { const r = c.insertOne(a.doc); out({ id: r.insertedId }); }
  else if (a.op === 'replace') { const r = c.replaceOne({ _id: a.id }, a.doc); out({ matched: r.matchedCount, modified: r.modifiedCount }); }
  else if (a.op === 'delete') { const r = c.deleteOne({ _id: a.id }); out({ deleted: r.deletedCount }); }
  else if (a.op === 'createCollection') { d.createCollection(a.coll); out({ ok: 1 }); }
  else if (a.op === 'dropCollection') out({ dropped: c.drop() });
  else if (a.op === 'counts') out(Object.fromEntries((a.colls || []).map(n => [n, d.getCollection(n).countDocuments({})])));
  else out({ error: 'Unknown operation.' });
} catch (e) { out({ error: String((e && e.message) || e) }); }
`;

export const validColl = (n) => typeof n === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(n) && !n.startsWith('system.');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Run one data operation. Resolves to the parsed result, or throws an Error with a safe message. */
export async function dataOp(uri, args) {
  if (DEMO) return demo(args);
  const r = await run('docker', ['run', '--rm', '-e', 'MU', '-e', 'JS', '-e', 'ARGS', IMAGE, 'sh', '-c', 'mongosh "$MU" --quiet --eval "$JS"'], { env: { MU: uri, JS: DATA_JS, ARGS: JSON.stringify(args) }, timeout: 60000 });
  const last = r.out.split('\n').map((l) => l.trim()).filter(Boolean).at(-1) || '';
  let j = null; try { j = JSON.parse(last); } catch { /* not json */ }
  if (!r.ok || j === null) throw new Error(friendly(scrub(r.err || r.out, uri)));
  if (j && j.error) throw new Error(friendly(j.error));
  return j;
}

/** Check the pieces of a data request so only well-formed ones reach the database. */
export function cleanArgs(op, b = {}) {
  const a = { op };
  if (op !== 'databases') {
    if (!validDb(b.db)) throw new Error('Pick a database.');
    a.db = b.db;
  }
  if (['find', 'insert', 'replace', 'delete', 'createCollection', 'dropCollection'].includes(op)) {
    if (!validColl(b.coll)) throw new Error('Pick a collection. Names use letters, numbers, . - and _.');
    a.coll = b.coll;
  }
  if (op === 'counts') {
    if (!Array.isArray(b.colls) || b.colls.length > 300 || !b.colls.every(validColl)) throw new Error('Bad collection list.');
    a.colls = b.colls;
  }
  if (op === 'find') {
    if (b.filter != null && !isObj(b.filter)) throw new Error('The filter must be a JSON object, for example {"status":"open"}.');
    if (b.sort != null && !isObj(b.sort)) throw new Error('The sort must be a JSON object, for example {"createdAt":-1}.');
    a.filter = b.filter || {}; a.sort = b.sort || { _id: 1 };
    a.skip = Math.max(0, Math.min(1e6, parseInt(b.skip, 10) || 0));
    a.limit = Math.max(1, Math.min(100, parseInt(b.limit, 10) || 25));
  }
  if (op === 'insert' || op === 'replace') {
    if (!isObj(b.doc)) throw new Error('A document must be a JSON object.');
    if (JSON.stringify(b.doc).length > 1_000_000) throw new Error('That document is larger than 1 MB.');
    a.doc = b.doc;
  }
  if (op === 'replace' || op === 'delete') {
    if (b.id == null) throw new Error('Missing the document _id.');
    a.id = b.id;
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* Bring an app's own database into MongoDB                            */
/* ------------------------------------------------------------------ */

const TABLE_RE = /^[A-Za-z0-9_]{1,63}$/;

/** What kind of local database the app has, and what is in it. */
export async function describeLocal(app, { sqliteFiles } = {}) {
  if (DEMO) return app.db?.type ? { kind: app.db.type, tables: [{ name: 'users', rows: 12 }, { name: 'orders', rows: 40 }] } : null;
  const t = app.db?.type;
  if (t === 'postgres') {
    const tg = await pgTarget(app);
    if (!tg) return { kind: 'postgres', error: 'No running Postgres was found for this app.', tables: [] };
    if (tg.loginFailed) return { kind: 'postgres', error: `Could not log in to the database in ${tg.container} (tried ${tg.tried.join(', ')}).`, tables: [], target: tg };
    const q = await psql(tg.container, "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1", tg);
    if (!q.ok) return { kind: 'postgres', error: 'Could not read the database.', tables: [], target: tg };
    const names = q.out.split('\n').map((x) => x.trim()).filter((n) => TABLE_RE.test(n) && !n.startsWith('_prisma'));
    const tables = [];
    for (const n of names) { const c = await psql(tg.container, `select count(*) from "${n}"`, tg); tables.push({ name: n, rows: c.ok ? Number(c.out.trim()) : null }); }
    return { kind: 'postgres', tables, target: tg };
  }
  if (t === 'sqlite' && app.db.volume) {
    const files = (sqliteFiles || []).filter((f) => /\.(db|sqlite3?|sqlite)$/i.test(f));
    if (!files.length) return { kind: 'sqlite', tables: [] };
    const r = await run('docker', ['run', '--rm', '-v', `${app.db.volume}:/d:ro`, 'devx-sqlite:1', 'sqlite3', '-readonly', `/d/${files[0]}`, "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by 1"], { timeout: 30000 });
    const tables = r.out.split('\n').map((x) => x.trim()).filter((n) => TABLE_RE.test(n)).map((name) => ({ name, rows: null }));
    return { kind: 'sqlite', file: files[0], tables };
  }
  return null;
}

const psql = (container, sql, t = {}) => run('docker', ['exec', '-e', 'SQL', '-e', 'PGDB', '-e', 'PGUSER', '-e', 'PGPASSWORD', container, 'sh', '-c', 'psql -U "${PGUSER:-${POSTGRES_USER:-postgres}}" -d "${PGDB:-${POSTGRES_DB:-postgres}}" -At -c "$SQL"'], { env: { SQL: sql, PGDB: typeof t === 'string' ? t : (t.db || ''), PGUSER: t.user || '', PGPASSWORD: t.password || '' }, timeout: 60000 });
const PG_EXEC = 'psql -U "${PGUSER:-${POSTGRES_USER:-postgres}}" -d "${PGDB:-${POSTGRES_DB:-postgres}}" -At -c "$SQL"';

async function containerEnv(name) {
  const r = await run('docker', ['inspect', '-f', '{{json .Config.Env}}', name], { timeout: 15000 });
  const out = {}; try { for (const l of JSON.parse(r.out.trim()) || []) { const i = l.indexOf('='); if (i > 0) out[l.slice(0, i)] = l.slice(i + 1); } } catch { /* none */ }
  return out;
}

/** Find a login that works: the app's own (from its connection string), then the container's own, then the standard superuser. */
async function pgAuth(container, db, url) {
  const tried = []; const cands = [];
  if (url) { try { const u = new URL(url); if (u.username) cands.push({ user: decodeURIComponent(u.username), password: decodeURIComponent(u.password || '') }); } catch { /* odd url */ } }
  const env = await containerEnv(container);
  if (env.POSTGRES_USER) cands.push({ user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD || '' });
  cands.push({ user: 'postgres', password: env.POSTGRES_PASSWORD || '' });
  for (const c of cands) {
    if (tried.includes(c.user)) continue; tried.push(c.user);
    const r = await psql(container, 'select 1', { db, ...c });
    if (r.ok) return { ...c, tried };
  }
  return { tried, failed: true };
}

/** Which Postgres holds this app's data: its own container, or the one its DATABASE_URL points at, or any Postgres among its containers. */
export async function pgTarget(app) {
  let url = null;
  try { const env = app.envPath ? fs.readFileSync(app.envPath, 'utf8') : ''; url = /^\s*(?:DATABASE_URL|POSTGRES_URL|POSTGRESQL_URL|DB_URL)\s*=\s*["']?(postgres(?:ql)?:\/\/[^\s"']+)/m.exec(env)?.[1] || null; } catch { /* no env file */ }
  const isPg = async (name) => { const r = await run('docker', ['inspect', '-f', '{{.Config.Image}}', name], { timeout: 15000 }); return r.ok && /postgres/i.test(r.out); };
  let found = null;
  if (app.db?.container) found = { container: app.db.container, db: '' };
  if (!found && url) { try { const u = new URL(url); if (await isPg(u.hostname)) found = { container: u.hostname, db: decodeURIComponent(u.pathname.slice(1)) }; } catch { /* odd url */ } }
  if (!found) for (const c of app.containers || []) if (await isPg(c)) { found = { container: c, db: '' }; break; }
  if (!found) return null;
  const auth = await pgAuth(found.container, found.db, url);
  return { ...found, user: auth.user, password: auth.password, loginFailed: !!auth.failed, tried: auth.tried };
}

/**
 * The SELECT that turns each row of a Postgres table into a MongoDB document:
 * the primary key becomes _id (that is what Prisma and most Mongo code expect), dates become real dates,
 * decimals and big integers keep their exact value. Pure function, so it can be tested without a database.
 */
export function pgExportSql(table, columns, pk) {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const id = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const value = (c) => {
    const col = `x.${id(c.name)}`; const t = c.type;
    if (/^timestamp/.test(t)) return `CASE WHEN ${col} IS NULL THEN NULL ELSE jsonb_build_object('$date', to_char(${col} ${t.includes('with time zone') ? "AT TIME ZONE 'UTC'" : ''}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END`;
    if (t === 'date') return `CASE WHEN ${col} IS NULL THEN NULL ELSE jsonb_build_object('$date', to_char(${col}, 'YYYY-MM-DD"T00:00:00.000Z"')) END`;
    if (t === 'numeric') return `CASE WHEN ${col} IS NULL THEN NULL ELSE jsonb_build_object('$numberDecimal', ${col}::text) END`;
    if (t === 'bigint') return `CASE WHEN ${col} IS NULL THEN NULL ELSE jsonb_build_object('$numberLong', ${col}::text) END`;
    if (t === 'bytea') return `CASE WHEN ${col} IS NULL THEN NULL ELSE jsonb_build_object('$binary', jsonb_build_object('base64', replace(encode(${col}, 'base64'), E'\\n', ''), 'subType', '00')) END`;
    return `to_jsonb(${col})`;
  };
  const single = pk.length === 1 ? pk[0] : null;
  const cols = columns.filter((c) => c.name !== single);
  const parts = [];
  for (let i = 0; i < cols.length; i += 40) parts.push(`jsonb_build_object(${cols.slice(i, i + 40).map((c) => `${q(c.name)}, ${value(c)}`).join(', ')})`);
  if (single) { const c = columns.find((k) => k.name === single); parts.push(`jsonb_build_object('_id', ${value(c)})`); }
  if (!parts.length) parts.push("'{}'::jsonb");
  return `SELECT (${parts.join(' || ')})::text FROM ${id(table)} x`;
}

async function pgShape(container, table, db = {}) {
  const cols = await psql(container, `select column_name||'|'||data_type from information_schema.columns where table_schema='public' and table_name='${table}' order by ordinal_position`, db);
  const pk = await psql(container, `select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid='public."${table}"'::regclass and i.indisprimary order by a.attnum`, db);
  if (!cols.ok) return null;
  return { columns: cols.out.split('\n').filter(Boolean).map((l) => { const [name, type] = l.split('|'); return { name, type }; }), pk: pk.ok ? pk.out.split('\n').map((x) => x.trim()).filter(Boolean) : [] };
}

/** Pipe one process into another and wait for both. Resolves { code, err }. */
async function pipe(a, b) {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const p1 = spawn(a.cmd, a.args, { env: { ...process.env, ...(a.env || {}) } });
    const p2 = spawn(b.cmd, b.args, { env: { ...process.env, ...(b.env || {}) } });
    let e1 = ''; let e2 = ''; let o2 = ''; let code1 = null; let code2 = null; let bytes = 0;
    p1.stdout.on('data', (d) => { bytes += d.length; });
    p1.stdout.pipe(p2.stdin); p1.stderr.on('data', (d) => { e1 += d; }); p2.stderr.on('data', (d) => { e2 += d; }); p2.stdout.on('data', (d) => { o2 += d; });
    p1.stdin.end();
    const done = () => { if (code1 !== null && code2 !== null) resolve({ code: code1 || code2, err: `${e1}\n${e2}`.trim(), out: o2, bytes, srcCode: code1 }); };
    p1.on('close', (c) => { code1 = c; done(); }); p2.on('close', (c) => { code2 = c; done(); });
    p1.on('error', (e) => { e1 += e.message; code1 = 127; done(); }); p2.on('error', (e) => { e2 += e.message; code2 = 127; done(); });
  });
}

/**
 * Copy the app's local data into the chosen MongoDB database, one collection per table.
 * Postgres and SQLite rows become documents; a bundled MongoDB is copied as it is. The source is only read.
 * `replace` empties each target collection first; without it, running twice adds the rows twice.
 */
export async function importLocal(app, { uri, database, replace = false, sqliteFiles, mongoServices = [] }, log) {
  const loc = await describeLocal(app, { sqliteFiles });
  const summary = [];
  if (!loc && !mongoServices.length) { log('This app has no local database DevX Control can read, so there is nothing to copy.'); return { ok: true, summary, empty: true }; }
  if (loc?.error && !loc.tables.length) { log(`${loc.error} Nothing was copied.`); return { ok: false, summary }; }
  const importer = (coll, jsonArray) => ({ cmd: 'docker', args: ['run', '--rm', '-i', '-e', 'MU', IMAGE, 'sh', '-c', `mongoimport --uri "$MU" --collection '${coll}' --type json ${jsonArray ? '--jsonArray ' : ''}${replace ? '--drop ' : ''}2>&1`], env: { MU: uri } });
  if (loc?.kind === 'postgres') {
    const tg = loc.target; log(`Reading ${loc.tables.length} table${loc.tables.length === 1 ? '' : 's'} from ${tg.container}${tg.db ? ` (${tg.db})` : ''} ...`);
    for (const t of loc.tables) {
      if (t.rows === 0) { log(`  ${t.name}: empty, skipped.`); continue; }
      const shape = await pgShape(tg.container, t.name, tg);
      if (!shape || !shape.columns.length) { log(`  ${t.name}: could not read its columns.`); summary.push({ name: t.name, rows: t.rows, ok: false }); continue; }
      const sql = pgExportSql(t.name, shape.columns, shape.pk);
      const r = await pipe(
        { cmd: 'docker', args: ['exec', '-e', 'SQL', '-e', 'PGDB', '-e', 'PGUSER', '-e', 'PGPASSWORD', tg.container, 'sh', '-c', PG_EXEC], env: { SQL: sql, PGDB: tg.db || '', PGUSER: tg.user || '', PGPASSWORD: tg.password || '' } },
        importer(t.name, false));
      if (!r.bytes && r.srcCode === 0) { log(`  ${t.name}: empty, skipped.`); summary.push({ name: t.name, rows: 0, imported: 0, ok: true }); continue; }   // nothing came out of the source, so there is nothing to import
      const n = /(\d+) document\(s\) imported/.exec(r.out || r.err || '')?.[1];
      const ok = r.code === 0;
      const why = (txt) => { const lines = scrub(txt, uri).split('\n').map((l) => l.trim()).filter(Boolean); return (lines.filter((l) => /(error|fail|too large|exceeds|duplicate)/i.test(l)).pop() || lines.pop() || 'unknown error').replace(/^\d{4}-\d\d-\d\dT[\d:.+]+\s*/, '').slice(0, 200); };
      log(ok ? `  ${t.name}: ${n ?? '?'} of ${t.rows ?? '?'} rows copied.` : `  ${t.name}: failed (${why(r.out || r.err)}).`);
      summary.push({ name: t.name, rows: t.rows, imported: n ? Number(n) : null, ok });
    }
  } else if (loc?.kind === 'sqlite') {
    log(`Reading ${loc.tables.length} table${loc.tables.length === 1 ? '' : 's'} from ${loc.file} ...`);
    for (const t of loc.tables) {
      const r = await pipe(
        { cmd: 'docker', args: ['run', '--rm', '-v', `${app.db.volume}:/d:ro`, 'devx-sqlite:1', 'sqlite3', '-readonly', '-json', `/d/${loc.file}`, `select * from "${t.name}"`] },
        importer(t.name, true));
      if (!r.bytes && r.srcCode === 0) { log(`  ${t.name}: empty, skipped.`); summary.push({ name: t.name, imported: 0, ok: true }); continue; }   // sqlite3 -json prints nothing for a table with no rows
      const n = /(\d+) document\(s\) imported/.exec(r.out || r.err || '')?.[1];
      const ok = r.code === 0;
      log(ok ? `  ${t.name}: ${n ?? '0'} rows copied.` : `  ${t.name}: failed (${scrub(r.out || r.err, uri).slice(-140)}).`);
      summary.push({ name: t.name, imported: n ? Number(n) : 0, ok });
    }
  } else if (mongoServices.length) {
    const names = await localContainers(app, mongoServices);
    if (!names.length) { log('The bundled MongoDB container is not running.'); return { ok: false, summary }; }
    const c = names[0];
    const dbs = await run('docker', ['exec', c, 'mongosh', '--quiet', '--eval', 'print(JSON.stringify(db.adminCommand({listDatabases:1,nameOnly:true}).databases.map(d=>d.name)))'], { timeout: 30000 });
    let list = []; try { list = JSON.parse(dbs.out.trim().split('\n').at(-1)); } catch { /* none */ }
    list = list.filter((d) => !SYSTEM.has(d));
    const one = list.length === 1;
    // mongorestore renames namespaces only when the address does not name a database, so connect to the cluster itself.
    const cluster = (() => { const u = new URL(uri); u.pathname = '/'; return u.toString(); })();
    for (const d of list) {
      const to = one ? database : d;
      if (!validDb(d) || !validDb(to)) { log(`  ${d}: skipped (unusual database name).`); summary.push({ name: d, ok: false }); continue; }
      log(`Copying ${d} into ${to} ...`);
      const src = await run('docker', ['exec', c, 'mongosh', '--quiet', '--eval', `const x=db.getSiblingDB('${d}');const o={};x.getCollectionNames().forEach(n=>{o[n]=x.getCollection(n).countDocuments()});print(JSON.stringify(o))`], { timeout: 60000 });
      let counts = {}; try { counts = JSON.parse(src.out.trim().split('\n').at(-1)); } catch { /* none */ }
      const r = await pipe(
        { cmd: 'docker', args: ['exec', c, 'mongodump', '--quiet', '--archive', `--db=${d}`] },
        { cmd: 'docker', args: ['run', '--rm', '-i', '-e', 'MU', IMAGE, 'sh', '-c', `mongorestore --archive --uri "$MU" ${replace ? '--drop ' : ''}--nsFrom '${d}.*' --nsTo '${to}.*' 2>&1`], env: { MU: cluster } });
      // Trust the numbers in the target, not the exit code.
      let ok = r.code === 0; let detail = '';
      const names = Object.keys(counts).filter(validColl);
      if (ok && names.length) {
        try {
          const got = await dataOp(uri, cleanArgs('counts', { db: to, colls: names }));
          const bad = names.filter((n) => (got[n] ?? 0) < counts[n]);
          if (bad.length) { ok = false; detail = bad.map((n) => `${n} has ${got[n] ?? 0} of ${counts[n]}`).join('; '); }
        } catch (e) { ok = false; detail = e.message; }
      }
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      log(ok ? `  ${d}: ${total} documents in ${names.length} collection${names.length === 1 ? '' : 's'} copied and counted in MongoDB.` : `  ${d}: failed (${detail || scrub(r.out || r.err, uri).slice(-140)}).`);
      summary.push({ name: d, target: to, collections: counts, ok });
    }
  }
  const failed = summary.filter((s) => !s.ok).length;
  log(failed ? `${failed} table${failed === 1 ? '' : 's'} did not copy. Nothing was removed from the source.` : 'Done. The source database was only read, nothing was removed from it.');
  return { ok: failed === 0, summary };
}

/* ---- demo data so the Databases page can be tried without a real cluster ---- */
const demoDb = {
  app_db: {
    users: [{ _id: { $oid: '650000000000000000000001' }, name: 'Aisha', role: 'admin', active: true }, { _id: { $oid: '650000000000000000000002' }, name: 'Omar', role: 'staff', active: true }, { _id: { $oid: '650000000000000000000003' }, name: 'Lina', role: 'staff', active: false }],
    orders: [{ _id: { $oid: '650000000000000000000011' }, total: 120.5, status: 'paid' }, { _id: { $oid: '650000000000000000000012' }, total: 80, status: 'open' }],
  },
  analytics: { events: [{ _id: { $oid: '650000000000000000000021' }, type: 'login', at: { $date: '2026-10-20T08:00:00Z' } }] },
};
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
function demo(a) {
  const d = demoDb[a.db]; const rows = d && d[a.coll];
  if (a.op === 'databases') return Object.keys(demoDb).map((name) => ({ name, size: 40960, empty: false }));
  if (a.op === 'createCollection') { demoDb[a.db] = demoDb[a.db] || {}; demoDb[a.db][a.coll] = demoDb[a.db][a.coll] || []; return { ok: 1 }; }
  if (!d) throw new Error('No such database.');
  if (a.op === 'collections') return Object.keys(d).map((name) => ({ name, type: 'collection', count: d[name].length }));
  if (!rows) throw new Error('No such collection.');
  if (a.op === 'dropCollection') { delete d[a.coll]; return { dropped: true }; }
  if (a.op === 'counts') return Object.fromEntries(a.colls.map((n) => [n, (d[n] || []).length]));
  if (a.op === 'find') { const keys = Object.entries(a.filter || {}); const hit = rows.filter((r) => keys.every(([k, v]) => same(r[k], v))); return { total: hit.length, docs: hit.slice(a.skip, a.skip + a.limit) }; }
  if (a.op === 'insert') { const doc = { _id: { $oid: String(Date.now()).padStart(24, '0') }, ...a.doc }; rows.push(doc); return { id: doc._id }; }
  const i = rows.findIndex((r) => same(r._id, a.id));
  if (a.op === 'replace') { if (i < 0) return { matched: 0, modified: 0 }; rows[i] = { ...a.doc, _id: rows[i]._id }; return { matched: 1, modified: 1 }; }
  if (a.op === 'delete') { if (i >= 0) rows.splice(i, 1); return { deleted: i >= 0 ? 1 : 0 }; }
  throw new Error('Unknown operation.');
}
