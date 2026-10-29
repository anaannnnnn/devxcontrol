// Studio: what the repo and the server say about an app - files, storage, schema, drift and possible changes.
// Everything comes from GitHub (via the App) and from the live server. Nothing here is invented.
const SECRET_FILE = /(^|\/)\.env(\.(?!example|sample|template)[^/]*)?$|\.pem$|\.key$|id_rsa/i;
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|woff2?|ttf|otf|mp[34]|mov|lock|map|sqlite3?|db)$/i;

export function makeStudio({ registry, github, dbx, ops, docker, autopilot }) {
  const cache = new Map();
  const memo = async (key, ttl, fn) => { const h = cache.get(key); if (h && Date.now() - h.t < ttl) return h.v; const v = await fn(); cache.set(key, { t: Date.now(), v }); return v; };
  const appOf = (id) => { const a = registry.byId.get(id); if (!a) throw Object.assign(new Error('App not found.'), { status: 404 }); return a; };
  const repoOf = (a) => { if (!a.repo) throw Object.assign(new Error(`${a.name} has no GitHub repo set, so there is nothing to mirror.`), { status: 409 }); return a.repo; };
  const treeOf = (a) => memo(`tree:${a.id}`, 60e3, () => github.tree(repoOf(a), 'HEAD'));
  const text = async (a, p) => { try { return await github.file(repoOf(a), p, 'HEAD'); } catch { return null; } };

  function nest(files, tags) {
    const root = { name: '', kind: 'dir', kids: [] };
    for (const f of files) {
      const parts = f.path.split('/'); let cur = root;
      parts.forEach((part, i) => {
        if (i === parts.length - 1) cur.kids.push({ name: part, kind: 'file', size: f.size, path: f.path, tag: tags(f.path) });
        else { let d = cur.kids.find((k) => k.kind === 'dir' && k.name === part); if (!d) { d = { name: part, kind: 'dir', kids: [] }; cur.kids.push(d); } cur = d; }
      });
    }
    const sort = (n) => { n.kids?.sort((x, y) => (x.kind === y.kind ? x.name.localeCompare(y.name) : x.kind === 'dir' ? -1 : 1)); n.kids?.forEach(sort); };
    sort(root); return root;
  }

  const MIGRATION = /(^|\/)(migrations?|db\/migrate|alembic\/versions|prisma\/migrations)\/.+\.(sql|py)$/i;
  async function tree(id) {
    const a = appOf(id); const t = await treeOf(a);
    const changed = new Set(autopilot.reviewsList().filter((r) => r.app === id && r.state === 'pending').flatMap((r) => autopilot.reviewGet(r.id).files.map((f) => f.path)));
    const tag = (p) => (changed.has(p) ? 'changed' : MIGRATION.test(p) ? 'schema' : /(^|\/)(docker-compose[^/]*\.ya?ml|compose\.ya?ml|Dockerfile[^/]*)$/.test(p) ? 'store' : /(^|\/)README(\.md)?$/i.test(p) ? 'read' : /(^|\/)(index|main|server|app)\.(m?js|ts|py)$/.test(p) && p.split('/').length <= 2 ? 'entry' : undefined);
    const root = nest(t.files.filter((f) => !SECRET_FILE.test(f.path)), tag); root.name = a.name; root.open = true;
    return { repo: a.repo, truncated: t.truncated, count: t.files.length, tree: root };
  }

  async function file(id, p) {
    const a = appOf(id);
    if (!p || p.includes('..') || p.startsWith('/')) throw Object.assign(new Error('Bad path.'), { status: 400 });
    if (SECRET_FILE.test(p)) throw Object.assign(new Error('Secret files are never shown here. Use the Vault.'), { status: 403 });
    if (BINARY.test(p)) return { path: p, binary: true, text: '' };
    const t = await github.file(repoOf(a), p, 'HEAD');
    return { path: p, text: t.length > 60000 ? `${t.slice(0, 60000)}\n... (truncated)` : t, truncated: t.length > 60000 };
  }

  /* ---------------- storage ---------------- */
  const human = (b) => (b == null ? null : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
  async function stores(id) {
    const a = appOf(id); const out = [];
    const bk = (await ops.listBackups().catch(() => [])).filter((b) => b.app === id).sort((x, y) => y.t - x.t)[0];
    const backup = bk ? `Last backup ${new Date(bk.t).toISOString().slice(0, 10)}` : (['postgres', 'sqlite'].includes(a.db?.type) ? 'No backup yet' : 'Not backed up here');
    const info = await ops.dataInfo(a).catch(() => null);
    if (a.db?.type === 'postgres' || a.db?.type === 'sqlite') {
      const rows = info?.tables ? `${info.tables.reduce((s, t) => s + t.rows, 0).toLocaleString()} rows, ${info.tables.length} tables` : null;
      out.push({ id: 'db', kind: 'Database', name: a.db.type === 'postgres' ? 'PostgreSQL' : 'SQLite', where: a.db.container ? `container ${a.db.container}` : `volume ${a.db.volume}`, found: 'apps.json', size: info?.size || null, rows, backup, state: info?.ok === false ? 'bad' : 'ok', note: info?.error || (info?.files?.length ? `${info.files.length} file${info.files.length > 1 ? 's' : ''} in the volume.` : '') });
    } else if (a.db?.note) out.push({ id: 'db', kind: 'Database', name: String(a.db.type || 'external'), where: 'External service', found: 'apps.json', size: null, rows: null, backup: 'Managed outside this server', state: 'warn', note: a.db.note });
    // real mounts of the app's containers
    for (const c of a.containers) {
      const r = await docker.inspectMounts?.(c).catch(() => null);
      for (const m of r || []) if (m.Type === 'volume') out.push({ id: `vol:${m.Name}`, kind: 'Volume', name: m.Name, where: `${c}:${m.Destination}`, found: 'docker inspect', size: null, rows: null, backup: a.db?.volume === m.Name ? backup : 'Not backed up here', state: 'ok', note: m.RW === false ? 'Mounted read-only.' : '' });
    }
    // what the repo says it needs
    const ex = (await text(a, '.env.example')) || (await text(a, '.env.sample')) || '';
    const keys = [...ex.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
    const hint = [[/REDIS/, 'Cache', 'Redis', /redis/i], [/(S3_|AWS_S3|BUCKET)/, 'Object storage', 'S3-compatible bucket', null], [/(MONGO)/, 'Database', 'MongoDB', /mongo/i], [/(MYSQL|MARIADB)/, 'Database', 'MySQL', /(mysql|maria)/i], [/SMTP|MAIL_/, 'Mail', 'SMTP server', null]];
    const running = Object.keys(await docker.list().catch(() => ({})));
    for (const [re, kind, name, svc] of hint) {
      const used = keys.filter((k) => re.test(k)); if (!used.length) continue;
      const present = svc ? running.some((n) => svc.test(n) && (a.containers.includes(n) || n.startsWith(a.id))) : null;
      out.push({ id: `env:${name}`, kind, name, where: `Expected by ${used.slice(0, 3).join(', ')}`, found: '.env.example', size: null, rows: null, backup: 'n/a', state: svc ? (present ? 'ok' : 'bad') : 'warn', note: svc ? (present ? 'A matching container is running.' : `The repo expects ${name} but no ${name} container belongs to this app.`) : 'External service. Credentials belong in the Vault.' });
    }
    return out;
  }

  /* ---------------- schema + drift ---------------- */
  async function schema(id, file_) { const a = appOf(id); try { return { ...(await dbx.schema(a, file_)), error: null }; } catch (e) { return { engine: null, tables: [], files: null, error: e.message }; } }

  const BOOK = /^(schema_migrations|_prisma_migrations|alembic_version|knex_migrations|knex_migrations_lock|__drizzle_migrations|migrations|sqlite_sequence)$/i;
  async function drift(id, file_) {
    const a = appOf(id); const out = [];
    const sc = await schema(id, file_);
    if (sc.error) return { notes: [{ sev: 'info', msg: `Live schema not read: ${sc.error}` }], migrations: 0 };
    const t = await treeOf(a); const mig = t.files.filter((f) => /\.sql$/i.test(f.path) && MIGRATION.test(f.path)).slice(0, 40);
    if (!mig.length) return { notes: [{ sev: 'info', msg: 'No SQL migration files found in the repo, so there is nothing to compare the live database against.' }], migrations: 0 };
    const declared = new Map();
    for (const f of mig) {
      const sql = (await text(a, f.path)) || '';
      for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?(?:public\.)?([A-Za-z_][\w]*)["`]?\s*\(([\s\S]*?)\);/gi)) {
        const cols = new Set([...m[2].split(/,\s*\n|,\n|\n/)].map((l) => /^\s*["`]?([A-Za-z_]\w*)["`]?\s+\w/.exec(l)?.[1]).filter((x) => x && !/^(primary|foreign|unique|constraint|check|key|index)$/i.test(x)));
        declared.set(m[1].toLowerCase(), { cols, file: f.path });
      }
      for (const m of sql.matchAll(/alter\s+table\s+["`]?(?:public\.)?([A-Za-z_]\w*)["`]?\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?["`]?([A-Za-z_]\w*)/gi)) declared.get(m[1].toLowerCase())?.cols.add(m[2]);
    }
    const live = new Map(sc.tables.map((x) => [x.t.toLowerCase(), new Set(x.cols.map((c) => c[0]))]));
    for (const [name, d] of declared) {
      if (!live.has(name)) { out.push({ sev: 'warn', msg: `Table ${name} is created in ${d.file} but does not exist in the live database.` }); continue; }
      const missing = [...d.cols].filter((c) => !live.get(name).has(c)); if (missing.length) out.push({ sev: 'warn', msg: `Columns ${missing.join(', ')} are declared for ${name} in the migrations but are missing from the live table.` });
    }
    for (const [name, cols] of live) {
      if (BOOK.test(name)) continue;
      if (!declared.has(name)) { out.push({ sev: 'info', msg: `Table ${name} exists live but no migration in the repo creates it.` }); continue; }
      const extra = [...cols].filter((c) => !declared.get(name).cols.has(c)); if (extra.length) out.push({ sev: 'info', msg: `Live table ${name} has columns the migrations do not declare: ${extra.join(', ')}.` });
    }
    return { notes: out, migrations: mig.length };
  }

  /* ---------------- possible changes, computed from the repo ---------------- */
  async function transforms(id) {
    const a = appOf(id); const t = await treeOf(a); const paths = t.files.map((f) => f.path); const out = [];
    const df = paths.find((p) => /(^|\/)Dockerfile$/.test(p)); const dfText = df ? await text(a, df) : null;
    const nodeV = dfText && /^FROM\s+node:(\d+)/im.exec(dfText)?.[1];
    if (nodeV && +nodeV < 22) out.push({ id: 'node', group: 'Runtime', from: `Node ${nodeV}`, to: 'Node 22 LTS', files: [df, '.nvmrc', 'package.json'].filter((p) => paths.includes(p)).length, risk: 'low', agents: ['AI fixer', 'Test runner'], fe: 'No visible change.', be: 'Base image and engines field updated. Tests run before you see the report.', note: `${df} uses node:${nodeV}.`, title: `Move the Docker base image from Node ${nodeV} to Node 22 LTS`, detail: `Update ${df}, .nvmrc and the engines field in package.json to Node 22 LTS. Change nothing else.` });
    if (dfText && (!/^\s*USER\s+/im.test(dfText) || !/^\s*HEALTHCHECK\s+/im.test(dfText))) out.push({ id: 'dockerfile', group: 'Infrastructure', from: `${!/^\s*USER\s+/im.test(dfText) ? 'Runs as root' : ''}${!/^\s*USER\s+/im.test(dfText) && !/^\s*HEALTHCHECK\s+/im.test(dfText) ? ', ' : ''}${!/^\s*HEALTHCHECK\s+/im.test(dfText) ? 'no HEALTHCHECK' : ''}`, to: 'Non-root user and a healthcheck', files: 1, risk: 'low', agents: ['AI fixer', 'Hadolint'], fe: 'None.', be: 'Container runs as an unprivileged user and reports its own health.', note: `${df}`, title: `Harden ${df}: run as a non-root user and add a HEALTHCHECK`, detail: 'Add a non-root USER (make sure files the app writes stay writable) and a HEALTHCHECK that calls the existing health endpoint if there is one.' });
    const js = paths.filter((p) => /\.(m?js|jsx)$/.test(p) && !/(^|\/)(node_modules|dist|build|public|vendor)\//.test(p) && !/\.config\./.test(p));
    if (js.length && !paths.some((p) => /(^|\/)tsconfig\.json$/.test(p))) out.push({ id: 'ts', group: 'Language', from: 'JavaScript', to: 'TypeScript (first step)', files: Math.min(js.length, 3), risk: 'med', agents: ['AI fixer', 'Test runner'], fe: 'No visible change.', be: `Adds a tsconfig with allowJs and checkJs off, plus types for the first files. ${js.length} JavaScript files in total; each run converts a few.`, note: 'Incremental, one small review at a time.', title: 'Start migrating to TypeScript: add tsconfig.json with allowJs and convert the 2 smallest source files', detail: 'Do not change behaviour. Keep the test script passing. Do not rename files that other files import unless you update every import.' });
    const pk = await text(a, 'package.json'); let hasTest = true; try { const j = JSON.parse(pk || '{}'); hasTest = !!j.scripts?.test && !/no test specified/.test(j.scripts.test); if (pk && !hasTest) out.push({ id: 'tests', group: 'Quality', from: 'No test command', to: 'A first test file', files: 2, risk: 'low', agents: ['AI fixer', 'Test runner'], fe: 'None.', be: 'Adds node:test, a "test" script and a first test for a pure function.', note: 'Gives every later fix something to be checked against.', title: 'Add a first automated test with node:test and a "test" script in package.json', detail: 'Pick one pure function or one simple endpoint helper and test it. Use only node:test and node:assert. No new dependencies.' }); } catch { /* not node */ }
    return out.map((x) => ({ ...x, time: `~${Math.max(3, x.files * 4)} min (estimate)` }));
  }

  return { tree, file, stores, schema, drift, transforms };
}
