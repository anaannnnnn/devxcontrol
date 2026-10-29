// Gives onboarded apps the backing services they ask for (Postgres, Redis, MongoDB) as shared containers on the "web"
// network, so nobody has to paste a connection string for a database that does not exist yet.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PLACEHOLDER = /xxx|your[-_ ]|<[^>]+>|change[-_ ]?me|replace[-_ ]?me|example\.(com|org)|\bregion\b|\.\.\.|todo|user:pass(word)?@|localhost:5432\/dbname/i;
const PG_KEYS = /^(DATABASE_URL|POSTGRES_URL|POSTGRES_URI|POSTGRESQL_URL|PG_URL|PGURL|DB_URL|DIRECT_URL)$/;
const REDIS_KEYS = /^(REDIS_URL|REDIS_URI|REDIS_TLS_URL)$/;
const MONGO_KEYS = /^(MONGO_URL|MONGO_URI|MONGODB_URI|MONGODB_URL|MONGO_CONNECTION_STRING)$/;

/** Which service does an env variable want? Uses the example value's scheme first, then the name. */
export function wantedService(key, example = '', depsText = '') {
  const v = String(example || '').trim();
  if (/^postgres(ql)?:\/\//i.test(v)) return 'postgres';
  if (/^rediss?:\/\//i.test(v)) return 'redis';
  if (/^mongodb(\+srv)?:\/\//i.test(v)) return 'mongo';
  if (/^mysql:\/\//i.test(v)) return null;
  if (REDIS_KEYS.test(key)) return 'redis';
  if (MONGO_KEYS.test(key)) return 'mongo';
  if (PG_KEYS.test(key) && /(\bpg\b|postgres|psycopg|asyncpg|pg-promise|neon)/i.test(depsText)) return 'postgres';
  return null;
}

export function makeProvision({ exec, dataDir }) {
  const file = path.join(dataDir, 'provision.json');
  const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const save = (o) => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(o), { mode: 0o600 }); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dk = (args, o = {}) => exec('docker', args, { timeout: 120000, ...o });
  const ident = (id) => `app_${String(id).toLowerCase().replace(/[^a-z0-9]/g, '_')}`.slice(0, 40);

  async function ensureContainer(name, image, runArgs, ready, log) {
    const st = await dk(['inspect', '-f', '{{.State.Running}}', name]);
    if (st.ok) {
      if (st.out.trim() !== 'true') { log(`Starting ${name} ...`); await dk(['start', name]); }
    } else {
      log(`Creating ${name} (${image}) on this server ...`);
      const r = await dk(['run', '-d', '--name', name, '--restart', 'unless-stopped', '--network', 'web', ...runArgs, image], { timeout: 600000 });
      if (!r.ok) throw new Error(`Could not start ${name}: ${(r.err || r.out).trim().split('\n').pop()}`);
    }
    for (let i = 0; i < 40; i++) { if ((await ready()).ok) return; await sleep(1500); }
    throw new Error(`${name} did not become ready.`);
  }

  async function postgres(appId, log) {
    const st = load(); const pw = st.pgPassword || crypto.randomBytes(24).toString('hex');
    const hadContainer = (await dk(['inspect', '-f', '{{.Id}}', 'devx-postgres'])).ok;
    if (hadContainer && !st.pgPassword) throw new Error('A devx-postgres container exists but its password is unknown. Remove that container or set the app\'s database URL by hand.');
    await ensureContainer('devx-postgres', 'postgres:16-alpine', ['--memory', '384m', '-e', `POSTGRES_PASSWORD=${pw}`, '-v', 'devx-postgres:/var/lib/postgresql/data'], () => dk(['exec', 'devx-postgres', 'pg_isready', '-U', 'postgres']), log);
    save({ ...st, pgPassword: pw });
    const user = ident(appId), db = user, pass = crypto.randomBytes(18).toString('hex');
    const psql = (sql) => dk(['exec', '-e', `PGPASSWORD=${pw}`, 'devx-postgres', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql]);
    const exists = (await psql(`SELECT 1 FROM pg_roles WHERE rolname='${user}'`)).out.trim() === '1';
    const r1 = await psql(exists ? `ALTER ROLE ${user} LOGIN PASSWORD '${pass}'` : `CREATE ROLE ${user} LOGIN PASSWORD '${pass}'`);
    if (!r1.ok) throw new Error(`Could not create the database user: ${(r1.err || '').trim().split('\n').pop()}`);
    if ((await psql(`SELECT 1 FROM pg_database WHERE datname='${db}'`)).out.trim() !== '1') {
      const r2 = await psql(`CREATE DATABASE ${db} OWNER ${user}`); if (!r2.ok) throw new Error(`Could not create the database: ${(r2.err || '').trim().split('\n').pop()}`);
    }
    log(`Postgres database "${db}" is ready (private to this server).`);
    return `postgresql://${user}:${pass}@devx-postgres:5432/${db}?sslmode=disable`;
  }

  async function redis(appId, log) {
    await ensureContainer('devx-redis', 'redis:7-alpine', ['--memory', '128m', '-v', 'devx-redis:/data'], () => dk(['exec', 'devx-redis', 'redis-cli', 'ping']), log);
    const n = (parseInt(crypto.createHash('sha1').update(String(appId)).digest('hex').slice(0, 2), 16) % 15) + 1;
    log('Redis is ready (private to this server).');
    return `redis://devx-redis:6379/${n}`;
  }

  async function mongo(appId, log) {
    await ensureContainer('devx-mongo', 'mongo:7', ['--memory', '512m', '-v', 'devx-mongo:/data/db'], () => dk(['exec', 'devx-mongo', 'mongosh', '--quiet', '--eval', 'db.runCommand({ping:1}).ok']), log);
    log('MongoDB is ready (private to this server).');
    return `mongodb://devx-mongo:27017/${ident(appId)}`;
  }

  /** Drop the app's private database and login (Postgres only; Redis/Mongo data is left, it is tiny and namespaced). */
  async function drop(appId, log = () => {}) {
    const pw = load().pgPassword; if (!pw) return;
    if (!(await dk(['inspect', '-f', '{{.Id}}', 'devx-postgres'])).ok) return;
    const user = ident(appId); const psql = (sql) => dk(['exec', '-e', `PGPASSWORD=${pw}`, 'devx-postgres', 'psql', '-U', 'postgres', '-tA', '-c', sql]);
    await psql(`DROP DATABASE IF EXISTS ${user} WITH (FORCE)`); await psql(`DROP ROLE IF EXISTS ${user}`);
    log(`Dropped the private database "${user}".`);
  }

  return { postgres, redis, mongo, drop, create: (kind, appId, log) => ({ postgres, redis, mongo })[kind](appId, log) };
}
