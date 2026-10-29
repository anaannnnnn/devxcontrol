// Works out what a repo is made of when it is more than one program: an API plus one or more web front ends in a monorepo.
// It reads what the repo already declares (render.yaml, vercel.json, npm workspaces) and turns it into a deployable plan:
// one Dockerfile and one compose service per program, and one address per program. Pure functions, no I/O beyond the reader you pass in.

/* ----------------------------- infrastructure images ----------------------------- */

const INFRA = /(^|\/)(postgres|postgis\/postgis|bitnami\/postgresql|mysql|mariadb|mongo|mongodb\/mongodb-community-server|redis|valkey|memcached|rabbitmq|elasticsearch|opensearch|clickhouse|cockroachdb\/cockroach|minio\/minio|kafka|zookeeper|mailhog|mailpit|adminer|pgadmin4?)(:|$|@)/i;
/** True for images that are databases, caches, queues and similar: they are never "the app" and must never get a public address. */
export const isInfraImage = (img) => INFRA.test(String(img || ''));

/* ----------------------------- a small YAML reader ----------------------------- */
// Enough YAML for Render blueprints and similar config: nested maps, lists of maps, scalars, comments, [] and {}.

function scalar(s) {
  s = String(s ?? '').trim();
  if (s === '' || s === '~' || s === 'null') return null;
  const q = /^(['"])(.*)\1$/.exec(s); if (q) return q[2];
  if (s === 'true') return true; if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === '[]') return []; if (s === '{}') return {};
  if (/^\[.*\]$/.test(s)) return s.slice(1, -1).split(',').map((x) => scalar(x)).filter((x) => x !== null);
  return s;
}
const stripComment = (s) => { let q = null; for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i); } return s; };

export function parseYaml(text) {
  const lines = String(text || '').split('\n').map((raw) => { const body = stripComment(raw).replace(/\s+$/, ''); return { ind: body.length - body.trimStart().length, t: body.trim() }; }).filter((l) => l.t);
  let i = 0;
  const block = () => (lines[i].t.startsWith('- ') || lines[i].t === '-' ? list(lines[i].ind) : map(lines[i].ind));
  function map(ind) {
    const o = {};
    while (i < lines.length && lines[i].ind === ind && !lines[i].t.startsWith('- ') && lines[i].t !== '-') {
      const m = /^("[^"]*"|'[^']*'|[^:]+?):(?:\s+(.*))?$/.exec(lines[i].t);
      if (!m) { i++; continue; }
      const key = m[1].replace(/^["']|["']$/g, ''); const rest = m[2] ?? '';
      i++;
      if (rest !== '') o[key] = scalar(rest);
      else if (i < lines.length && (lines[i].ind > ind || (lines[i].ind === ind && lines[i].t.startsWith('-')))) o[key] = block();
      else o[key] = null;
    }
    return o;
  }
  function list(ind) {
    const a = [];
    while (i < lines.length && lines[i].ind === ind && (lines[i].t.startsWith('- ') || lines[i].t === '-')) {
      const body = lines[i].t.replace(/^-\s*/, '');
      if (body === '') { i++; if (i < lines.length && lines[i].ind > ind) a.push(block()); else a.push(null); continue; }
      if (/^("[^"]*"|'[^']*'|[^:\s][^:]*?):(\s|$)/.test(body)) { lines[i] = { ind: ind + (lines[i].t.length - body.length), t: body }; a.push(map(lines[i].ind)); }
      else { a.push(scalar(body)); i++; }
    }
    return a;
  }
  try { return lines.length ? block() : null; } catch { return null; }
}

/* ----------------------------- discovery ----------------------------- */

const INSTALL = /^(npm\s+(ci|install|i)\b|yarn(\s+install)?\b|pnpm\s+(install|i)\b)/;
const RUNTIME = /(prisma\s+(migrate|db\s+(push|seed))|\bdb:seed\b|\bseed\b|\bmigrate\b|typeorm\s+migration|sequelize\s+db:migrate|knex\s+migrate|alembic\s+upgrade|manage\.py\s+migrate)/i;
const SEED = /(\bseed\b|db:seed)/i;
const STATIC_DEPS = ['vite', 'react-scripts', '@vue/cli-service', '@sveltejs/vite-plugin-svelte', 'parcel', 'astro', '@angular/cli'];
const SERVER_NAMES = /^(server|api|backend|service|app)$/i;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function splitCommands(cmd) {
  const segs = String(cmd || '').split('&&').map((s) => s.trim()).filter(Boolean);
  return {
    build: segs.filter((s) => !INSTALL.test(s) && !RUNTIME.test(s)),
    runtime: segs.filter((s) => RUNTIME.test(s)).map((s) => ({ cmd: s, once: SEED.test(s) })),
  };
}

async function portOf(root, files, read, fallback = 3000) {
  const cand = files.filter((f) => f.path.startsWith(root === '.' ? '' : `${root}/`) && /(^|\/)(env|config|index|server|app|main)\.(ts|js|mjs|cjs)$/.test(f.path) && !/node_modules|test/.test(f.path)).slice(0, 12);
  for (const f of cand) {
    const t = (await read(f.path)) || '';
    const m = /PORT[^\n]{0,60}?(?:default\(|\?\?|\|\||:|=)\s*["']?(\d{4,5})\b/.exec(t) || /\.listen\(\s*(\d{4,5})/.exec(t);
    if (m) return +m[1];
  }
  return fallback;
}

/**
 * files: [{ path }] listing, read(path) -> text|null.
 * Returns { source, services: [...] , databases: [...] , notes: [] } or null when the repo is a single program.
 */
export async function discover({ files, read }) {
  const notes = []; const out = [];
  const has = (p) => files.some((f) => f.path === p);
  const pkg = async (dir) => { try { return JSON.parse((await read(dir === '.' ? 'package.json' : `${dir}/package.json`)) || 'null'); } catch { return null; } };
  const rootPkg = await pkg('.');
  const workspaces = [].concat(rootPkg?.workspaces?.packages || rootPkg?.workspaces || []).filter((x) => typeof x === 'string');
  const render = parseYaml((await read('render.yaml')) || (await read('render.yml')) || '');
  let source = null; let databases = [];

  if (render && Array.isArray(render.services) && render.services.length) {
    source = 'render.yaml';
    databases = (render.databases || []).map((d) => ({ name: d.name, engine: 'postgres' }));
    for (const s of render.services) {
      const root = String(s.rootDir || '.').replace(/^\.\//, '').replace(/\/$/, '') || '.';
      const runtime = s.runtime || s.env || '';
      const env = (s.envVars || []).map((e) => ({ key: e.key, value: e.value ?? null, generate: e.generateValue === true, sync: e.sync === false, fromDb: e.fromDatabase ? true : false, fromService: e.fromService ? true : false }));
      if (s.type && !['web', 'pserv', 'private_service'].includes(s.type)) { notes.push(`${s.name}: a ${s.type} is not deployed automatically.`); continue; }
      if (runtime === 'static') {
        out.push({ name: s.name, kind: 'static', root, build: splitCommands(s.buildCommand).build, runtime: [], publish: String(s.staticPublishPath || 'dist').replace(/^\.\//, ''), env, health: null });
      } else if (runtime === 'node' || runtime === '') {
        const c = splitCommands(s.buildCommand);
        out.push({ name: s.name, kind: 'node', root, build: c.build, runtime: c.runtime, start: s.startCommand || 'npm start', env, health: s.healthCheckPath || null });
      } else notes.push(`${s.name}: runtime "${runtime}" is not supported for automatic setup.`);
    }
  } else if (workspaces.length) {
    source = 'workspaces';
    const dirs = [];
    for (const w of workspaces) {
      if (w.endsWith('/*')) { const base = w.slice(0, -2); const seen = new Set(); files.forEach((f) => { const m = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)/package\\.json$`).exec(f.path); if (m && !seen.has(m[1])) { seen.add(m[1]); dirs.push(`${base}/${m[1]}`); } }); }
      else if (has(`${w}/package.json`)) dirs.push(w);
    }
    for (const dir of dirs) {
      const p = await pkg(dir); if (!p) continue;
      const dep = (k) => p.dependencies?.[k] || p.devDependencies?.[k];
      const base = dir.split('/').pop();
      if (p.scripts?.start || (SERVER_NAMES.test(base) && p.scripts?.build && !STATIC_DEPS.some(dep))) out.push({ name: base, kind: 'node', root: dir, build: p.scripts?.build ? ['npm run build'] : [], runtime: [], start: p.scripts?.start ? 'npm start' : `node ${p.main || 'dist/index.js'}`, env: [], health: null });
      else if (p.scripts?.build && STATIC_DEPS.some(dep)) out.push({ name: base, kind: 'static', root: dir, build: ['npm run build'], runtime: [], publish: dep('react-scripts') ? 'build' : 'dist', env: [], health: null });
    }
    // a server at "server/" that is not a workspace member still counts
    if (!out.some((s) => s.kind === 'node') && has('server/package.json')) { const p = await pkg('server'); if (p?.scripts?.build || p?.scripts?.start) out.push({ name: 'server', kind: 'node', root: 'server', build: p.scripts?.build ? ['npm run build'] : [], runtime: [], start: p.scripts?.start ? 'npm start' : 'node dist/index.js', env: [], health: null }); }
  }
  if (!out.length) return null;
  // one program at the repo root is an ordinary app, not a stack
  if (out.length === 1 && out[0].root === '.') return null;
  for (const s of out) if (s.kind === 'node') s.port = (s.env.find((e) => e.key === 'PORT' && e.value) ? +s.env.find((e) => e.key === 'PORT').value : await portOf(s.root, files, read, 3000)) || 3000;
  const prismaPostgres = (await Promise.all(files.filter((f) => /(^|\/)schema\.prisma$/.test(f.path)).map((f) => read(f.path)))).some((t) => /provider\s*=\s*"postgres/.test(t || ''));
  if (prismaPostgres && !databases.length) databases.push({ name: 'database', engine: 'postgres' });
  return { source, services: out, databases, notes, hasWorkspaces: workspaces.length > 0, lock: has('package-lock.json') ? 'npm' : has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : 'npm-nolock' };
}

/* ----------------------------- naming and addresses ----------------------------- */

const LABELS = { crm: 'CRM', admin: 'Admin', web: 'Web', api: 'API', server: 'API', dashboard: 'Dashboard', portal: 'Portal', boutique: 'Web', shop: 'Shop', site: 'Web', app: 'App', staff: 'Staff', driver: 'Driver' };

/** Short names (the part that differs between services) and one host per service. The main web front end gets the chosen domain. */
export function nameServices(stack, { id, domain }) {
  const toks = stack.services.map((s) => slug(s.name).split('-'));
  let common = 0;
  if (toks.length > 1) while (toks.every((t) => t.length > common + 1 && t[common] === toks[0][common])) common++;
  const used = new Set();
  stack.services.forEach((s, i) => {
    let short = toks[i].slice(common).join('-') || slug(s.name);
    if (s.kind === 'node' && /^(server|backend|service)$/.test(short)) short = 'api';
    while (used.has(short)) short += '-2';
    used.add(short); s.short = short; s.key = short.replace(/[^a-z0-9]/g, '') ? short : `svc${i}`;
    s.container = `${id}-${short}`.slice(0, 60);
    s.label = LABELS[short] || LABELS[short.split('-').pop()] || short.replace(/(^|-)(\w)/g, (_, a, b) => (a ? ' ' : '') + b.toUpperCase());
  });
  const webs = stack.services.filter((s) => s.kind === 'static');
  const main = webs.find((s) => /^(web|boutique|shop|site|app|frontend|client|www|store)$/.test(s.short)) || webs[0] || stack.services[0];
  stack.main = main.short;
  if (domain) {
    const [first, ...rest] = domain.split('.'); const base = rest.join('.');
    stack.services.forEach((s) => { s.host = s === main ? domain : `${s.short}-${first}.${base}`.toLowerCase(); });
  }
  return stack;
}

/* ----------------------------- files to write ----------------------------- */

const q = (s) => JSON.stringify(String(s));

function installLine(stack) {
  if (stack.lock === 'pnpm') return 'corepack enable && pnpm install --frozen-lockfile';
  if (stack.lock === 'yarn') return 'corepack enable && yarn install --frozen-lockfile';
  return stack.lock === 'npm' ? 'npm ci --no-audit --no-fund || npm install --no-audit --no-fund' : 'npm install --no-audit --no-fund';
}

/** The Dockerfile text for one service. The whole repo is the build context, so workspace packages and shared folders resolve. */
export function dockerfileFor(stack, s, { node = '22' } = {}) {
  const inRoot = (cmd) => (s.root === '.' ? cmd : `cd ${s.root} && ${cmd}`);
  const install = stack.hasWorkspaces || s.root === '.' ? installLine(stack) : `cd ${s.root} && npm install --no-audit --no-fund`;
  const build = s.build.length ? s.build.map((c) => inRoot(c)).join(' && ') : 'true';
  if (s.kind === 'static') {
    const args = (s.buildArgs || []).map((k) => `ARG ${k}\nENV ${k}=$${k}`).join('\n');
    return `FROM node:${node}-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN ${install}
${args}
RUN ${build}

FROM caddy:2-alpine
COPY --from=build /app/${s.root === '.' ? '' : `${s.root}/`}${s.publish} /srv
RUN printf ':80 {\\n  root * /srv\\n  encode gzip\\n  try_files {path} /index.html\\n  file_server\\n}\\n' > /etc/caddy/Caddyfile
EXPOSE 80
`;
  }
  const pre = s.runtime.map((r) => (r.once ? `{ [ -f /devx-state/.seeded-${slug(r.cmd).slice(0, 30)} ] || { ${r.cmd} && touch /devx-state/.seeded-${slug(r.cmd).slice(0, 30)}; }; }` : r.cmd));
  const start = [...pre, `exec ${s.start}`].join(' && ');
  return `FROM node:${node}-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN ${install}
RUN ${build}
ENV NODE_ENV=production PORT=${s.port}
WORKDIR /app/${s.root === '.' ? '' : s.root}
RUN mkdir -p /devx-state
EXPOSE ${s.port}
CMD ["sh", "-c", ${q(start)}]
`;
}

/** docker-compose.devx-stack.yml: every program on the shared "web" network, no database ports published. */
export function composeFor(stack, { envFile = true } = {}) {
  const L = ['# Written by DevX Control from the repository\'s own configuration. Safe to delete: onboarding writes it again.', 'services:'];
  for (const s of stack.services) {
    L.push(`  ${s.key}:`, '    build:', '      context: .', `      dockerfile: .devx/Dockerfile.${s.short}`);
    if ((s.buildArgs || []).length) { L.push('      args:'); s.buildArgs.forEach((k) => L.push(`        ${k}: ${q(stack.argValues?.[k] ?? '')}`)); }
    L.push(`    container_name: ${q(s.container)}`, '    restart: unless-stopped');
    if (s.kind === 'node') { if (envFile) L.push('    env_file: [".env"]'); L.push('    volumes:', `      - ${q(`${s.container}-state:/devx-state`)}`); }
    L.push('    networks:', '      web: {}');
  }
  L.push('networks:', '  web:', '    external: true');
  const vols = stack.services.filter((s) => s.kind === 'node');
  if (vols.length) { L.push('volumes:'); vols.forEach((s) => L.push(`  ${q(`${s.container}-state`)}: {}`)); }
  return `${L.join('\n')}\n`;
}

/** What the .env needs, as instructions the caller fulfils (it owns secrets generation and database provisioning). */
export function envPlan(stack) {
  const hostOf = (k) => stack.services.find((s) => s.short === k)?.host;
  const api = stack.services.find((s) => s.kind === 'node');
  const webUrls = stack.services.filter((s) => s.kind === 'static' && s.host).map((s) => `https://${s.host}`);
  const entries = []; const seen = new Set();
  const push = (e) => { if (!seen.has(e.key)) { seen.add(e.key); entries.push(e); } };
  for (const s of stack.services) {
    for (const e of s.env) {
      if (s.kind === 'static') { if (/^(VITE_|REACT_APP_|NEXT_PUBLIC_|PUBLIC_|NG_APP_)/.test(e.key) || /(API|BACKEND|SERVER)_(URL|BASE|ORIGIN)$/.test(e.key)) { s.buildArgs = [...new Set([...(s.buildArgs || []), e.key])]; stack.argValues = stack.argValues || {}; if (e.value != null) stack.argValues[e.key] = String(e.value); else if (api?.host && /(API|BACKEND|SERVER)/.test(e.key)) stack.argValues[e.key] = `https://${api.host}`; } continue; }
      if (e.fromDb) push({ key: e.key, provision: 'postgres' });
      else if (e.generate) push({ key: e.key, generate: true });
      else if (e.value != null) push({ key: e.key, value: String(e.value) });
      else if (/(CORS|ORIGIN|ALLOWED_HOSTS)/i.test(e.key)) push({ key: e.key, value: webUrls.join(',') });
      else push({ key: e.key, value: '', optional: true });
    }
  }
  if (api) { push({ key: 'PORT', value: String(api.port) }); push({ key: 'NODE_ENV', value: 'production' }); }
  if (stack.databases?.length && !entries.some((e) => e.provision)) push({ key: 'DATABASE_URL', provision: 'postgres' });
  void hostOf;
  return entries;
}
