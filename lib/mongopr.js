// The pull request that makes a repo use MongoDB: what to change, a check that the change is sound, and opening it as a draft.
// transform() is a pure function of the repo's files, so it can be tested without GitHub or a database.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { run } from './docker.js';

const DEMO = !!process.env.DEMO;
const ENV_FILES = ['.env.example', '.env.sample', 'env.example', 'server/.env.example', 'api/.env.example', 'backend/.env.example'];
const COMPOSE = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
const PLACEHOLDER = 'mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/DBNAME';
const PG_NATIVE = /\s@db\.(VarChar|Char|Text|Uuid|Citext|Inet|Xml|Timestamp|Timestamptz|Time|Timetz|Date|Decimal|Money|SmallInt|Integer|BigInt|Real|DoublePrecision|Json|JsonB|Bit|VarBit|ByteA|Boolean|Oid)(\([^)]*\))?/g;

/* ---------------------------- Prisma ---------------------------- */

/** Postgres schema.prisma in, MongoDB schema.prisma out, plus what a person still has to look at. */
export function transformPrisma(text) {
  const notes = []; const warnings = [];
  const lines = text.split('\n');
  const out = [];
  // pass 1: models, their id kind, and the datasource
  const models = new Map(); // name -> { start, end, idKind }
  let cur = null; let inDs = false; let dsName = null;
  lines.forEach((l, i) => {
    let m;
    if ((m = /^\s*model\s+(\w+)\s*\{/.exec(l))) { cur = { name: m[1], start: i, end: i, idKind: null }; models.set(m[1], cur); }
    else if (cur && /^\s*\}/.test(l)) { cur.end = i; cur = null; }
    if (/^\s*datasource\s+\w+\s*\{/.test(l)) inDs = true;
    else if (inDs && /^\s*\}/.test(l)) inDs = false;
    else if (inDs) { const p = /^\s*provider\s*=\s*"(\w+)"/.exec(l); if (p) dsName = p[1]; }
  });
  if (dsName === 'mongodb') return { text, notes: ['Already uses MongoDB.'], warnings, changed: false };
  if (dsName && !/^(postgresql|postgres|mysql|sqlite|sqlserver|cockroachdb)$/.test(dsName)) warnings.push(`Unknown database provider "${dsName}".`);

  const idRe = /^(\s*)(\w+)(\s+)(\w+)(\?)?(.*)$/;
  const objectIdModels = new Set();
  models.forEach((mod) => {
    for (let i = mod.start + 1; i < mod.end; i++) {
      const l = lines[i];
      if (/^\s*\/\//.test(l) || /^\s*@@/.test(l)) continue;
      if (/@id\b/.test(l)) {
        const m = idRe.exec(l); if (!m) continue;
        const type = m[4];
        if (type === 'Int' && /@default\(autoincrement\(\)\)/.test(l)) { mod.idKind = 'objectid'; objectIdModels.add(mod.name); }
        else if (type === 'String') mod.idKind = 'string';
        else { mod.idKind = 'other'; warnings.push(`${mod.name}.${m[2]} is a ${type} id. MongoDB ids are strings or ObjectIds, so this model needs a manual change.`); }
      }
    }
  });

  // pass 2: rewrite
  const fkToObjectId = new Map(); // model -> Set(field)
  models.forEach((mod) => {
    for (let i = mod.start + 1; i < mod.end; i++) {
      const m = /^\s*(\w+)\s+(\w+)(\[\])?(\?)?\s+.*@relation\(([^)]*)\)/.exec(lines[i]);
      if (!m) continue;
      const target = m[2]; const rel = m[5];
      const f = /fields:\s*\[([^\]]*)\]/.exec(rel);
      if (f && objectIdModels.has(target)) { const set = fkToObjectId.get(mod.name) || new Set(); f[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((x) => set.add(x)); fkToObjectId.set(mod.name, set); }
    }
  });

  let inDatasource = false; let curModel = null;
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    let m;
    if (/^\s*datasource\s+\w+\s*\{/.test(l)) inDatasource = true;
    else if (inDatasource && /^\s*\}/.test(l)) inDatasource = false;
    if (inDatasource) {
      if (/^\s*(directUrl|shadowDatabaseUrl)\s*=/.test(l)) { notes.push(`Removed ${/^\s*(\w+)/.exec(l)[1]} (not used with MongoDB).`); continue; }
      if (/^\s*provider\s*=/.test(l)) { l = l.replace(/"[^"]*"/, '"mongodb"'); notes.push('Database provider set to mongodb.'); }
      out.push(l); continue;
    }
    if ((m = /^\s*model\s+(\w+)\s*\{/.exec(l))) curModel = models.get(m[1]);
    else if (curModel && /^\s*\}/.test(l)) curModel = null;
    if (curModel) {
      if (/^\s*@@id\(/.test(l)) warnings.push(`${curModel.name} has a composite @@id, which MongoDB does not support. Give it a single id field.`);
      if (/^\s*@@schema\(/.test(l)) { warnings.push(`${curModel.name}: @@schema is not supported with MongoDB and was removed.`); continue; }
      const fm = /^(\s*)(\w+)(\s+)(\w+)(\[\])?(\?)?(.*)$/.exec(l);
      if (fm && !/^\s*@@/.test(l) && !/^\s*\/\//.test(l)) {
        const [, ind, name, sp, type, arr, opt, rest0] = fm; let rest = rest0 || '';
        if (/@id\b/.test(rest)) {
          if (curModel.idKind === 'objectid') { rest = rest.replace(/@default\(autoincrement\(\)\)/, '@default(auto())'); if (!/@map\("_id"\)/.test(rest)) rest = rest.replace(/@id\b(\s*@default\(auto\(\)\))?/, '@id @default(auto()) @map("_id") @db.ObjectId').replace(/(@default\(auto\(\)\))\s*@default\(auto\(\)\)/, '$1'); l = `${ind}${name}${sp}String${rest}`; notes.push(`${curModel.name}.${name}: Int autoincrement id became an ObjectId string.`); out.push(l); continue; }
          if (curModel.idKind === 'string' && !/@map\("_id"\)/.test(rest)) { rest = rest.replace(/@id\b/, '@id @map("_id")'); notes.push(`${curModel.name}.${name}: stored as _id.`); }
        }
        if (fkToObjectId.get(curModel.name)?.has(name) && type === 'Int') { rest = ` @db.ObjectId${rest}`.replace(/\s@db\.ObjectId(\s@db\.\w+)?/, ' @db.ObjectId'); l = `${ind}${name}${sp}String${arr || ''}${opt || ''}${rest.startsWith(' ') ? rest : ` ${rest}`}`; notes.push(`${curModel.name}.${name}: foreign key now an ObjectId string.`); out.push(l.replace(PG_NATIVE, '')); continue; }
        if (/autoincrement\(\)/.test(rest)) warnings.push(`${curModel.name}.${name} uses autoincrement(), which MongoDB does not support.`);
        if (/dbgenerated\(/.test(rest)) warnings.push(`${curModel.name}.${name} uses dbgenerated(), which MongoDB does not support.`);
        if (type === 'Unsupported') warnings.push(`${curModel.name}.${name} uses an Unsupported type.`);
        l = `${ind}${name}${sp}${type}${arr || ''}${opt || ''}${rest}`;
      }
      l = l.replace(PG_NATIVE, '');
    }
    out.push(l);
  }
  const result = out.join('\n');
  return { text: result, notes: [...new Set(notes)], warnings: [...new Set(warnings)], changed: result !== text };
}

/* ---------------------------- env example ---------------------------- */

export function transformEnv(text, envVar) {
  const re = new RegExp(`^(\\s*)(#\\s*)?${envVar}\\s*=.*$`, 'm');
  const note = '# MongoDB connection string. Put the real one in .env on the server, never in the repository.';
  if (re.test(text)) {
    const next = text.replace(re, (_, ind) => `${ind}${envVar}=${PLACEHOLDER}`);
    return { text: /MongoDB connection string/.test(next) ? next : next.replace(new RegExp(`^(\\s*)${envVar}=`, 'm'), `${note}\n$1${envVar}=`), changed: next !== text };
  }
  return { text: `${text.replace(/\n*$/, '\n')}${note}\n${envVar}=${PLACEHOLDER}\n`, changed: true };
}

/* ---------------------------- compose ---------------------------- */

const indentOf = (l) => l.length - l.trimStart().length;
const isBundledMongoImage = (l) => /^\s*image:\s*["']?(?:docker\.io\/)?(?:library\/)?(?:mongo|mongodb\/mongodb-community-server)(?::|["']?\s*$)/.test(l);
const isPostgresImage = (l) => /^\s*image:\s*["']?(?:docker\.io\/)?(?:library\/)?(?:postgres|postgis\/postgis|bitnami\/postgresql)(?::|["']?\s*$)/.test(l);

/** Service blocks of a compose file: { name, start, end } over line numbers (end exclusive). */
function serviceBlocks(lines) {
  const s = lines.findIndex((l) => /^services:\s*(#.*)?$/.test(l)); if (s < 0) return [];
  const blocks = [];
  for (let i = s + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() && indentOf(l) === 0 && !l.trim().startsWith('#')) { if (blocks.length) blocks.at(-1).end = i; break; }
    const m = /^ {2}([A-Za-z0-9_.-]+):\s*(#.*)?$/.exec(l);
    if (m) { if (blocks.length) blocks.at(-1).end = i; blocks.push({ name: m[1], start: i, end: lines.length }); }
  }
  if (blocks.length && blocks.at(-1).end > lines.length) blocks.at(-1).end = lines.length;
  return blocks;
}

/** Make a compose file read the database address from .env and stop starting the bundled database. */
export function transformCompose(text, { envVar, engine }) {
  const lines = text.split('\n'); const notes = [];
  const blocks = serviceBlocks(lines);
  const bundledNames = new Set();
  blocks.forEach((b) => { for (let i = b.start + 1; i < b.end; i++) { if ((engine === 'mongo' ? isBundledMongoImage : isPostgresImage)(lines[i])) bundledNames.add(b.name); } });
  const remove = new Set();
  // 1. the address pinned inside "environment"
  if (engine === 'mongo' && envVar) {
    for (const b of blocks) {
      for (let i = b.start + 1; i < b.end; i++) {
        if (new RegExp(`^\\s+(?:-\\s*)?["']?${envVar}["']?\\s*[:=]\\s*["']?mongodb(\\+srv)?://`).test(lines[i])) { remove.add(i); notes.push(`${b.name}: removed the ${envVar} line that pointed at the bundled database.`); }
      }
    }
  }
  // 2. depends_on the bundled database
  for (const b of blocks) {
    if (bundledNames.has(b.name)) continue;
    for (let i = b.start + 1; i < b.end; i++) {
      if (!/^ {4}depends_on:\s*(#.*)?$/.test(lines[i]) && !/^ {4}depends_on:\s*\[/.test(lines[i])) continue;
      if (/^ {4}depends_on:\s*\[/.test(lines[i])) { const names = lines[i].replace(/^[^[]*\[|\].*$/g, '').split(',').map((s) => s.trim().replace(/["']/g, '')).filter(Boolean); const rest = names.filter((n) => !bundledNames.has(n)); if (rest.length !== names.length) { lines[i] = rest.length ? `    depends_on: [${rest.join(', ')}]` : null; if (!rest.length) remove.add(i); notes.push(`${b.name}: no longer waits for ${[...bundledNames].join(', ')}.`); } continue; }
      let j = i + 1; const kids = [];
      while (j < b.end && (lines[j].trim() === '' || indentOf(lines[j]) > 4)) { if (lines[j].trim()) kids.push(j); j++; }
      // group child lines per dependency (indent 6) and drop the bundled ones with their detail lines
      const groups = []; kids.forEach((k) => { if (indentOf(lines[k]) === 6 || /^\s+-\s/.test(lines[k]) && indentOf(lines[k]) === 6) groups.push([k]); else groups.at(-1)?.push(k); });
      const nameOf = (g) => /^\s*-?\s*([A-Za-z0-9_.-]+)\s*:?/.exec(lines[g[0]])?.[1];
      const drop = groups.filter((g) => bundledNames.has(nameOf(g)));
      if (drop.length) { drop.forEach((g) => g.forEach((k) => remove.add(k))); notes.push(`${b.name}: no longer waits for ${[...bundledNames].join(', ')}.`); if (drop.length === groups.length) remove.add(i); }
    }
  }
  // 3. keep the bundled database from starting unless asked for
  const profile = engine === 'mongo' ? 'local-db' : 'legacy-postgres';
  for (const b of blocks) {
    if (!bundledNames.has(b.name)) continue;
    let has = false; for (let i = b.start + 1; i < b.end; i++) if (/^ {4}profiles:/.test(lines[i])) has = true;
    if (has) continue;
    let at = b.start + 1; for (let i = b.start + 1; i < b.end; i++) if (isBundledMongoImage(lines[i]) || isPostgresImage(lines[i])) { at = i + 1; break; }
    lines.splice(at, 0, `    profiles: ["${profile}"]  # added by DevX Control: start it only with --profile ${profile}`);
    // line numbers after the insert shift: shift the removal set accordingly
    const shifted = new Set(); remove.forEach((r) => shifted.add(r >= at ? r + 1 : r)); remove.clear(); shifted.forEach((r) => remove.add(r));
    blocks.forEach((o) => { if (o.start >= at) o.start++; if (o.end >= at) o.end++; });
    notes.push(`${b.name}: now starts only with --profile ${profile}.`);
  }
  const next = lines.filter((l, i) => l !== null && !remove.has(i)).join('\n');
  return { text: next, notes: [...new Set(notes)], changed: next !== text };
}

/* ---------------------------- the whole repo ---------------------------- */

const SCRIPT_FILES = /(^|\/)(Dockerfile[^/]*|package\.json|[^/]*\.(mjs|cjs|js|sh|ya?ml)|render\.yaml|vercel\.json)$/;
function rewriteCommands(text) {
  return text
    .replace(/prisma migrate deploy/g, 'prisma db push --skip-generate')
    .replace(/prisma migrate dev(\s+--name\s+[\w.-]+)?/g, 'prisma db push')
    .replace(/(["'])migrate\1\s*,\s*(["'])deploy\2/g, '"db", "push", "--skip-generate"');
}

/**
 * files: { path: text } for every text file worth looking at (the caller reads them from a checkout).
 * Returns { kind, edits: {path: text}, deletes: [path], notes, warnings, summary }.
 */
export function transform(files, { envVar = 'MONGO_URI' } = {}) {
  const edits = {}; const deletes = []; const notes = []; const warnings = [];
  const paths = Object.keys(files);
  const prismaPath = paths.find((p) => /(^|\/)schema\.prisma$/.test(p));
  let kind = 'config';
  let usesVar = envVar;
  if (prismaPath) {
    const r = transformPrisma(files[prismaPath]);
    if (r.changed) {
      kind = 'prisma'; edits[prismaPath] = r.text; notes.push(...r.notes); warnings.push(...r.warnings);
      usesVar = 'DATABASE_URL';
      const dir = prismaPath.replace(/schema\.prisma$/, '');
      paths.filter((p) => p.startsWith(`${dir}migrations/`)).forEach((p) => deletes.push(p));
      if (deletes.length) notes.push(`Removed ${deletes.length} Postgres migration file${deletes.length === 1 ? '' : 's'} (MongoDB has no migrations; "prisma db push" creates the collections).`);
      const raw = paths.filter((p) => /\.(ts|tsx|js|mjs|cjs)$/.test(p) && !p.startsWith('node_modules/')).filter((p) => /\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)/.test(files[p]));
      if (raw.length) warnings.push(`Raw SQL is used in ${raw.length} file${raw.length === 1 ? '' : 's'} and will not work on MongoDB: ${raw.slice(0, 5).join(', ')}${raw.length > 5 ? ', ...' : ''}.`);
      for (const p of paths) {
        if (!SCRIPT_FILES.test(p) || edits[p] || deletes.includes(p)) continue;
        const t = rewriteCommands(files[p]);
        if (t !== files[p]) { edits[p] = t; notes.push(`${p}: "prisma migrate" replaced with "prisma db push".`); }
      }
    }
  }
  // env example
  for (const p of paths.filter((x) => ENV_FILES.includes(x))) {
    const hasVar = new RegExp(`^\\s*#?\\s*${usesVar}\\s*=`, 'm').test(files[p]);
    if (!hasVar && kind === 'config' && !/MONGO/i.test(files[p])) continue;
    const r = transformEnv(files[p], usesVar);
    if (r.changed) { edits[p] = r.text; notes.push(`${p}: ${usesVar} now shows a MongoDB connection string placeholder.`); }
  }
  if (!paths.some((p) => ENV_FILES.includes(p))) { edits['.env.example'] = transformEnv('', usesVar).text; notes.push(`.env.example: added ${usesVar} with a MongoDB placeholder.`); }
  // compose
  for (const p of paths.filter((x) => COMPOSE.includes(x))) {
    const hasMongo = /^\s*image:\s*["']?(?:docker\.io\/)?(?:library\/)?mongo\b/m.test(files[p]);
    const r = transformCompose(files[p], { envVar: usesVar, engine: kind === 'prisma' ? 'postgres' : 'mongo' });
    if (r.changed && (hasMongo || kind === 'prisma' || r.notes.length)) { edits[p] = r.text; notes.push(...r.notes.map((n) => `${p}: ${n}`)); }
  }
  const summary = { files: Object.keys(edits).length + deletes.length, edited: Object.keys(edits), deleted: deletes.length };
  return { kind, edits, deletes, notes, warnings, summary, envVar: usesVar };
}

/** The written explanation that goes into the repo and the PR. */
export function describe({ app, binding, result, validation }) {
  const w = result.warnings;
  return [
    `# Move ${app.name || app.id} to MongoDB`,
    '',
    `Opened by DevX Control after the data was copied into **${binding.clusterName} / ${binding.database}**.`,
    '',
    '## What changed',
    ...result.notes.map((n) => `- ${n}`),
    '',
    '## Needs a person',
    ...(w.length ? w.map((x) => `- [ ] ${x}`) : ['- Nothing flagged automatically.']),
    '- [ ] Look through any code that treats ids as numbers (parseInt of an id, z.number() ids).',
    '- [ ] Run the tests and click through the app against a MongoDB database before merging.',
    '',
    '## Check run by DevX Control',
    validation ? (validation.ok ? `- ${validation.label}: passed.` : `- ${validation.label}: **failed**\n\n\`\`\`\n${validation.output}\n\`\`\``) : '- No schema check was needed.',
    '',
    '## Deploying',
    `1. Put the real connection string in the server's \`.env\` as \`${result.envVar}\` (never commit it).`,
    '2. After this is merged, press **Switch to MongoDB** on the app in DevX Control. It copies the latest data, points the app at MongoDB, deploys, runs its checks, and only then offers to remove the old database.',
    '',
  ].join('\n');
}

/* ---------------------------- clone, change, check, push ---------------------------- */

const git = (args, { cwd, token, timeout = 120000 } = {}) => new Promise((resolve) => {
  const cred = token ? ['-c', 'credential.helper=!f(){ echo username=x-access-token; echo password=$GH_TOKEN_DC; };f'] : [];
  execFile('git', [...cred, ...args], { cwd, timeout, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GH_TOKEN_DC: token || '', GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'DevX Control', GIT_AUTHOR_EMAIL: 'devx-control@users.noreply.github.com', GIT_COMMITTER_NAME: 'DevX Control', GIT_COMMITTER_EMAIL: 'devx-control@users.noreply.github.com' } },
    (e, out, err) => resolve({ ok: !e, out: String(out || ''), err: String(err || '') }));
});

async function readCandidates(dir) {
  const ls = await git(['ls-files'], { cwd: dir }); const files = {}; const all = ls.out.split('\n').filter(Boolean);
  for (const p of all) {
    if (/(^|\/)node_modules\//.test(p)) continue;
    const want = /(^|\/)schema\.prisma$/.test(p) || ENV_FILES.includes(p) || COMPOSE.includes(p) || SCRIPT_FILES.test(p) || /\.(ts|tsx|js|mjs|cjs)$/.test(p) || /(^|\/)migrations\//.test(p);
    if (!want) continue;
    if (/(^|\/)migrations\//.test(p)) { files[p] = ''; continue; } // only the names matter
    try { const st = await fsp.stat(path.join(dir, p)); if (st.size > 400000) continue; files[p] = await fsp.readFile(path.join(dir, p), 'utf8'); } catch { /* skip */ }
  }
  return files;
}

/** Run `prisma validate` on the new schema in a throwaway container. */
async function validatePrisma(dir, schemaPath, pkgText) {
  let ver = 'latest';
  try { const pj = JSON.parse(pkgText || '{}'); const v = (pj.devDependencies?.prisma || pj.dependencies?.prisma || '').replace(/^[^\d]*/, ''); if (/^\d/.test(v)) ver = v; } catch { /* default */ }
  const r = await run('docker', ['run', '--rm', '-v', `${dir}:/w:ro`, '-e', 'DATABASE_URL=mongodb://localhost:27017/check', 'node:22-alpine', 'sh', '-c', `cd /tmp && cp -r /w/${path.dirname(schemaPath)} ./prisma && npx -y prisma@${ver} validate --schema ./prisma/${path.basename(schemaPath)} 2>&1 | tail -15`], { timeout: 240000 });
  const out = (r.out + r.err).trim();
  return { ok: r.ok && /is valid|valid\s*🚀/i.test(out), label: `prisma ${ver} validate`, output: out.slice(-1500) };
}

export function makeMongoPr({ settings, github, gitx, audit, remoteUrl = (repo) => `https://github.com/${repo}.git`, fetchImpl = fetch, validate = validatePrisma, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  async function prepare(app, binding) {
    if (!app.repo) throw Object.assign(new Error('This app has no GitHub repository saved.'), { status: 409 });
    const token = await github.cloneToken(app.repo);
    const base = gitx.status(app)?.branch || 'main';
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mongopr-'));
    const c = await git(['clone', '--quiet', '--depth', '1', '--branch', base, remoteUrl(app.repo), dir], { token });
    if (!c.ok) { await fsp.rm(dir, { recursive: true, force: true }); throw new Error(`Could not read the repository (${c.err.trim().split('\n').pop().slice(0, 120)}).`); }
    const files = await readCandidates(dir);
    const result = transform(files, { envVar: binding.var || 'MONGO_URI' });
    return { dir, token, base, files, result };
  }

  /** What the pull request would do. Nothing is pushed. */
  async function plan(app) {
    if (DEMO) return { kind: 'prisma', summary: { files: 4, edited: ['server/prisma/schema.prisma', '.env.example', 'docker-compose.yml'], deleted: 6 }, notes: ['Database provider set to mongodb.', 'Removed 6 Postgres migration files.'], warnings: ['Raw SQL is used in 1 file and will not work on MongoDB: src/routes/report.ts.'], validation: { ok: true, label: 'prisma validate', output: '' }, base: 'main' };
    const b = settings.mongo(app.id); if (!b || b.mode === 'local') throw Object.assign(new Error('Link a MongoDB database first.'), { status: 409 });
    const p = await prepare(app, b);
    try {
      const r = p.result; let validation = null;
      if (r.kind === 'prisma') {
        for (const [f, t] of Object.entries(r.edits)) { await fsp.mkdir(path.dirname(path.join(p.dir, f)), { recursive: true }); await fsp.writeFile(path.join(p.dir, f), t); }
        const schemaPath = Object.keys(r.edits).find((x) => /schema\.prisma$/.test(x));
        validation = await validate(p.dir, schemaPath, p.files[schemaPath.replace(/prisma\/schema\.prisma$|schema\.prisma$/, '') + 'package.json'] ?? p.files['package.json']);
      }
      return { kind: r.kind, summary: r.summary, notes: r.notes, warnings: r.warnings, validation, base: p.base };
    } finally { await fsp.rm(p.dir, { recursive: true, force: true }); }
  }

  /** Push a branch and open a draft pull request. */
  async function create(app, { autoMerge = true } = {}) {
    if (DEMO) { const pr = { number: 7, url: `https://github.com/${app.repo || 'owner/repo'}/pull/7`, branch: 'devx/mongodb', at: Date.now(), merged: !!autoMerge, draft: !autoMerge }; const b = settings.mongo(app.id); if (b) settings.setMongo(app.id, { ...b, pr }); return pr; }
    const b = settings.mongo(app.id);
    if (!b || b.mode === 'local') throw Object.assign(new Error('Link a MongoDB database first.'), { status: 409 });
    if (!['imported', 'verified', 'retired'].includes(b.stage)) throw Object.assign(new Error('Copy the data into MongoDB first.'), { status: 409 });
    if (b.pr) throw Object.assign(new Error(`A pull request is already open: #${b.pr.number}.`), { status: 409 });
    const p = await prepare(app, b);
    try {
      const r = p.result;
      if (!r.summary.files) throw Object.assign(new Error('Nothing to change: the repository already looks ready for MongoDB.'), { status: 409 });
      for (const [f, t] of Object.entries(r.edits)) { await fsp.mkdir(path.dirname(path.join(p.dir, f)), { recursive: true }); await fsp.writeFile(path.join(p.dir, f), t); }
      for (const f of r.deletes) await fsp.rm(path.join(p.dir, f), { force: true });
      let validation = null;
      if (r.kind === 'prisma') {
        const schemaPath = Object.keys(r.edits).find((x) => /schema\.prisma$/.test(x));
        validation = await validate(p.dir, schemaPath, p.files[schemaPath.replace(/prisma\/schema\.prisma$|schema\.prisma$/, '') + 'package.json'] ?? p.files['package.json']);
        if (!validation.ok) throw Object.assign(new Error(`The converted schema did not pass "${validation.label}", so no pull request was opened. ${validation.output.split('\n').slice(-3).join(' ').slice(0, 300)}`), { status: 422 });
      }
      // Merge it ourselves only when nothing needs a person: the schema check passed and no warning was raised.
      const clean = r.warnings.length === 0 && (!validation || validation.ok);
      const willMerge = !!autoMerge && clean;
      const why = !autoMerge ? '' : clean ? '' : r.warnings.length ? 'It was not merged automatically because some things need a person (see the checklist).' : 'It was not merged automatically because the schema check did not pass.';
      const body = describe({ app, binding: b, result: r, validation }) + (willMerge ? '\nThis pull request was merged automatically by DevX Control because every check passed and nothing needed a person.\n' : why ? `\n${why}\n` : '');
      await fsp.writeFile(path.join(p.dir, 'MONGODB_MIGRATION.md'), body);
      const branch = `devx/mongodb-${String(b.database).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
      for (const step of [['checkout', '-q', '-b', branch], ['add', '-A'], ['commit', '-q', '-m', `Move to MongoDB (${b.database})\n\nChanges made by DevX Control after copying the data into ${b.clusterName}.`], ['push', '-q', 'origin', branch]]) {
        const st = await git(step, { cwd: p.dir, token: p.token }); if (!st.ok) throw new Error(`git ${step[0]} failed: ${st.err.trim().split('\n').pop().slice(0, 160)}`);
      }
      const api = (method, url, payload) => fetchImpl(`https://api.github.com/repos/${app.repo}${url}`, { method, headers: { authorization: `Bearer ${p.token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'devx-control' }, body: payload ? JSON.stringify(payload) : undefined });
      const res = await api('POST', '/pulls', { title: `Move ${app.name || app.id} to MongoDB`, head: branch, base: p.base, body, draft: !willMerge });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`GitHub refused the pull request (${res.status}${j.message ? `: ${String(j.message).slice(0, 120)}` : ''}). The branch ${branch} was pushed.`);
      const pr = { number: j.number, url: j.html_url, branch, at: Date.now(), draft: !willMerge, merged: false, note: why || null };
      if (willMerge) {
        // GitHub needs a moment to work out whether the branch can be merged; ask a few times.
        for (let i = 0; i < 6 && !pr.merged; i++) {
          const m = await api('PUT', `/pulls/${j.number}/merge`, { merge_method: 'squash', commit_title: `Move ${app.name || app.id} to MongoDB (#${j.number})` });
          if (m.ok) { pr.merged = true; pr.mergedAt = Date.now(); break; }
          const mj = await m.json().catch(() => ({})); pr.mergeError = `${m.status}${mj.message ? `: ${String(mj.message).slice(0, 140)}` : ''}`;
          if (![405, 409, 422].includes(m.status)) break;
          await sleep(2000);
        }
        if (pr.merged) { delete pr.mergeError; await api('DELETE', `/git/refs/heads/${branch}`).catch(() => {}); await gitx.check(app).catch(() => {}); }
        else { pr.draft = false; pr.note = `Opened, but GitHub would not merge it yet (${pr.mergeError}). Merge it on GitHub.`; }
      }
      settings.setMongo(app.id, { ...settings.mongo(app.id), pr });
      audit(app.id, `${pr.merged ? 'Opened and merged' : 'Opened'} pull request #${pr.number} on ${app.repo} to move ${app.name} to MongoDB`, 'warn');
      return pr;
    } finally { await fsp.rm(p.dir, { recursive: true, force: true }); }
  }
  return { plan, create };
}
