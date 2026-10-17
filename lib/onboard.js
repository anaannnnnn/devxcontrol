// Onboard a GitHub repo: shallow-clone, read what the repo says it needs, write config, bring it up with docker compose,
// add a Caddy route and register it so it shows up everywhere (monitor, backups, autopilot).
import crypto from 'node:crypto';
import dnsLookup from 'node:dns/promises';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { run, live } from './docker.js';
import { walk } from './scanners.js';
import { generateDockerfile } from './dockerize.js';
import { usedEnvNames, autoEntry, isOwnSecret, generateValue, generateNote, deriveDefault, placeholderFor } from './envscan.js';
import { makeProvision, wantedService, PLACEHOLDER } from './provision.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const slugId = (s) => String(s).split('/').pop().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

// Many repos ship more than one platform (a storefront AND a CRM, a customer AND a driver app).
// Detect those secondary surfaces so every one gets its own URL — not just the main page.
const SURFACE_LABELS = { admin: 'CRM', crm: 'CRM', dashboard: 'Dashboard', portal: 'Portal', staff: 'Staff', manage: 'Admin', console: 'Console', driver: 'Driver', customer: 'Customer', owner: 'Owner' };
export function detectSurfaces(dir) {
  const out = [], seen = new Set();
  const add = (name, label) => { const p = '/' + String(name).replace(/^\/+|\/+$/g, '') + '/'; if (p === '//' || seen.has(p)) return; seen.add(p); out.push({ path: p, label: label || (name[0].toUpperCase() + name.slice(1)) }); };
  // Vite/Rollup multi-page inputs (input: { main: ..., admin: ... })
  try {
    const vc = fs.readdirSync(dir).find((f) => /^vite\.config\.(js|ts|mjs|cjs)$/.test(f));
    if (vc) { const m = fs.readFileSync(path.join(dir, vc), 'utf8').match(/input\s*:\s*\{([\s\S]*?)\}/); if (m) for (const km of m[1].matchAll(/([A-Za-z0-9_]+)\s*:/g)) { const k = km[1]; if (!/^(main|index|app|home|public)$/i.test(k)) add(k, SURFACE_LABELS[k.toLowerCase()]); } }
  } catch { /* ignore */ }
  // Common secondary dirs with their own index.html (source tree or built output)
  for (const name of Object.keys(SURFACE_LABELS)) {
    try { if (fs.existsSync(path.join(dir, name, 'index.html')) || fs.existsSync(path.join(dir, 'dist', name, 'index.html')) || fs.existsSync(path.join(dir, 'public', name, 'index.html'))) add(name, SURFACE_LABELS[name]); } catch { /* ignore */ }
  }
  return out.slice(0, 6);
}
const cred = ['-c', 'credential.helper=!f(){ echo username=x-access-token; echo password=$GH_TOKEN_DC; };f'];

export function makeOnboard({ dns, registry, github, ops, appsDir, caddyfile, domainSuffix, audit, autopilot, workRoot, dataDir, remoteBase = 'https://github.com', exec = run }) {
  const prov = makeProvision({ exec, dataDir: dataDir || workRoot });
  const dirOk = (id) => /^[a-z0-9][a-z0-9-]{1,29}$/.test(id);

  async function scan(repo) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw Object.assign(new Error('Use the form owner/name.'), { status: 400 });
    const token = await github.cloneToken(repo);
    const dir = path.join(workRoot, `_scan-${slugId(repo)}`);
    await fsp.rm(dir, { recursive: true, force: true }); await fsp.mkdir(workRoot, { recursive: true });
    const c = await exec('git', [...cred, 'clone', '--depth', '1', `${remoteBase}/${repo}.git`, dir], { env: { GH_TOKEN_DC: token, GIT_TERMINAL_PROMPT: '0' }, timeout: 180000 });
    if (!c.ok) throw Object.assign(new Error(`Could not clone ${repo}: ${(c.err || '').trim().split('\n').pop()}`), { status: 502 });
    try {
      const files = await walk(dir, { max: 3000 });
      const has = (re) => files.find((f) => re.test(f.path));
      const read = async (p) => { try { return await fsp.readFile(path.join(dir, p), 'utf8'); } catch { return null; } };
      const rows = []; const add = (k, v) => rows.push({ k, v });
      const pkgTxt = await read('package.json'); let pkg = null; try { pkg = pkgTxt ? JSON.parse(pkgTxt) : null; } catch { /* bad json */ }
      const ext = {}; for (const f of files) { const e = path.extname(f.path).slice(1); if (e) ext[e] = (ext[e] || 0) + 1; }
      const lang = [['ts', 'TypeScript'], ['tsx', 'TypeScript'], ['js', 'JavaScript'], ['py', 'Python'], ['go', 'Go'], ['rb', 'Ruby'], ['php', 'PHP'], ['java', 'Java'], ['rs', 'Rust']].map(([e, n]) => [n, ext[e] || 0]).reduce((m, [n, c]) => { m[n] = (m[n] || 0) + c; return m; }, {});
      const top = Object.entries(lang).sort((a, b) => b[1] - a[1]).filter((x) => x[1]).slice(0, 2).map((x) => x[0]);
      const framework = pkg ? ['next', 'vite', 'express', 'fastify', 'react', 'vue', 'svelte', 'nestjs'].filter((k) => pkg.dependencies?.[k] || pkg.devDependencies?.[k] || pkg.dependencies?.[`@${k}/core`]).join(', ') : '';
      add('Language and framework', `${top.join(', ') || 'Unknown'}${framework ? `, ${framework}` : ''}${pkg ? ` (${pkg.engines?.node ? `Node ${pkg.engines.node}` : 'Node'})` : ''}`);
      // compose, normalised by docker itself
      let services = []; let composeFile = has(/^(docker-)?compose\.ya?ml$/)?.path || null;
      if (composeFile) {
        const r = await exec('docker', ['compose', 'config', '--format', 'json', '--no-interpolate'], { cwd: dir, timeout: 40000 });
        const r2 = r.ok ? r : await exec('docker', ['compose', 'config', '--format', 'json'], { cwd: dir, timeout: 40000 });
        try { const j = JSON.parse(r2.out); services = Object.entries(j.services || {}).map(([name, s]) => ({ name, image: s.image || null, build: !!s.build, ports: (s.ports || []).map((p) => +(p.target ?? String(p).split(':').pop())).filter(Boolean), published: (s.ports || []).map((p) => +(p.published || 0)).filter(Boolean), expose: (s.expose || []).map(Number), healthcheck: JSON.stringify(s.healthcheck?.test || ''), hasEnvFile: !!s.env_file, networks: Object.keys(s.networks || {}) })); } catch { /* compose unreadable */ }
      }
      const dockerfile = has(/(^|\/)Dockerfile$/)?.path || null;
      const gen = !composeFile && !dockerfile ? await generateDockerfile({ files, read }) : null;
      const exposeLine = dockerfile ? /^EXPOSE\s+(\d+)/im.exec((await read(dockerfile)) || '')?.[1] : null;
      add('Container', composeFile ? `${composeFile} found, ${services.length} service${services.length === 1 ? '' : 's'} (${services.map((s) => s.name).join(', ') || 'unreadable'})` : dockerfile ? `Dockerfile found${exposeLine ? `, exposes ${exposeLine}` : ''}, no compose file` : (gen ? `No Dockerfile. DevX will write one for you (${gen.stack}). ${gen.note}` : 'No Dockerfile or compose file, and the project type was not recognised, so it cannot be deployed automatically.'));
      const web = services.find((s) => s.build && (s.ports.length || s.expose.length)) || services.find((s) => s.build) || services[0] || null;
      const port = web ? (web.ports[0] || web.expose[0] || (exposeLine ? +exposeLine : null)) : (exposeLine ? +exposeLine : (gen?.port || null));
      add('Build steps', pkg?.scripts?.build ? `npm run build (${pkg.scripts.build.slice(0, 60)})` : dockerfile ? 'Built from the Dockerfile' : 'None detected');
      // health endpoint
      let health = null; const hc = services.map((s) => /https?:\/\/[^/'" ,]+(\/[\w\-/.]*)/.exec(s.healthcheck)?.[1]).find(Boolean); if (hc) health = hc;
      if (!health) for (const f of files.filter((x) => /\.(m?js|ts|py|go|rb)$/.test(x.path) && x.size < 100000).slice(0, 80)) { const m = /['"`](\/(?:api\/)?health(?:z|check)?)['"`]/.exec((await read(f.path)) || ''); if (m) { health = m[1]; break; } }
      add('Health endpoint', health ? `${health} (found in ${hc ? 'compose healthcheck' : 'code'})` : 'None found. Add a /healthz route so the monitor can tell the app is really working.');
      // env
      const exTxt = (await read('.env.example')) ?? (await read('.env.sample')) ?? (await read('.env.template')) ?? '';
      const depsText = `${pkgTxt || ''}\n${(await read('requirements.txt')) || ''}\n${(await read('pyproject.toml')) || ''}\n${(await read('go.mod')) || ''}\n${(await read('composer.json')) || ''}`;
      const env = [...exTxt.matchAll(/^[ \t]*([A-Z][A-Z0-9_]*)[ \t]*=[ \t]*(.*)$/gm)].map((m) => {
        let v = m[2].replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2').trim();
        const kind = wantedService(m[1], v, depsText);
        const ph = PLACEHOLDER.test(v) || (!!kind && /(localhost|127\.0\.0\.1|host\.docker\.internal)/i.test(v)); if (ph) v = '';
        const secret = /(KEY|SECRET|TOKEN|PASS|PIN|PRIVATE)/i.test(m[1]) || /^[a-z]+:\/\/[^/\s]*:[^@\s]*@/i.test(m[2]);
        return { k: m[1], req: !v, v, secret, ph, provision: kind, src: kind && !v ? 'provision' : !v && isOwnSecret(m[1]) ? 'generate' : 'value' };
      });
      const declared = new Set(env.map((e) => e.k));
      const undeclared = (await usedEnvNames(files, read)).filter((n) => !declared.has(n));
      for (const n of undeclared) { const a = autoEntry(n, { port, depsText }); env.push({ k: n, req: false, v: a.v, secret: /(KEY|SECRET|TOKEN|PASS|PIN|PRIVATE)/i.test(n), ph: false, provision: a.provision || null, src: a.src, auto: true, note: a.note }); }
      // nothing blocks a deploy: every blank gets the best automatic answer (own random secret, local service, or a boot-safe placeholder)
      for (const e of env) {
        if (e.src === 'value' && !e.v) { const ph = placeholderFor(e.k, { id: slugId(repo) }); if (ph) { e.src = 'placeholder'; e.v = ph; e.note = 'placeholder so the app starts; add the real value later under Secrets'; } }
        e.req = false;
      }
      if (undeclared.length) add('Variables the code reads but .env.example misses', `${undeclared.length} found: ${undeclared.slice(0, 8).join(', ')}${undeclared.length > 8 ? ' ...' : ''}. Safe ones were filled in for you.`);
      // PORT: give the app its own free port instead of everybody sharing 3000
      if (!composeFile) {
        const pe = env.find((e) => e.k === 'PORT');
        if (pe) {
          const taken = new Set([...(await usedHostPorts()), ...registry.apps.map((a) => +a.port).filter(Boolean)]);
          let free = 3100; while (taken.has(free)) free++;
          pe.v = String(free); pe.req = false; pe.src = 'value'; pe.note = 'a free port was picked for this app'; pe.auto = true;
          add('Port', `${free} (free on this server, set as PORT for the app)`);
        }
      }
      for (const e of env) e.genNote = generateNote(e.k);
      add('Environment variables', env.length ? `${env.filter((e) => e.req && e.src !== 'provision').length} need a value${env.some((e) => e.ph && e.src !== 'provision') ? ` (${env.filter((e) => e.ph && e.src !== 'provision').map((e) => e.k).join(', ')} only has a placeholder in .env.example)` : ''}${env.some((e) => e.src === 'provision') ? `, ${env.filter((e) => e.src === 'provision').map((e) => `${e.k} (${e.provision} will be created on this server)`).join(', ')}` : ''}, ${env.filter((e) => !e.req).length} have defaults (from .env.example)` : 'No .env.example found');
      const dbSvc = services.find((s) => /(postgres|mysql|mariadb|mongo|redis)/i.test(s.image || ''));
      add('Database', dbSvc ? `${dbSvc.image} service "${dbSvc.name}"` : /sqlite|\.db\b/i.test(exTxt + (pkgTxt || '')) ? 'SQLite file (needs a volume)' : 'None declared');
      add('Tests', pkg?.scripts?.test && !/no test specified/.test(pkg.scripts.test) ? `npm test (${pkg.scripts.test.slice(0, 50)})` : has(/(^|\/)(tests?|__tests__)\//) ? 'A tests folder exists' : 'No tests found. Autopilot cannot verify fixes without them.');
      add('OpenAPI spec', has(/(^|\/)openapi\.(ya?ml|json)$/)?.path || 'Not found');
      add('README', has(/^README(\.md)?$/i) ? 'Found' : 'Not found');
      const desc = ((await read('README.md')) || '').split('\n').find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('!') && !l.startsWith('[')) || '';
      return { repo, id: slugId(repo), branch: (await exec('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'])).out.trim(), scan: rows, env, services: services.map(({ name, image, build, ports, expose, published }) => ({ name, image, build, ports, expose, published })), service: web?.name || null, port: (!composeFile && +env.find((e) => e.k === 'PORT')?.v) || port, health, composeFile, hasDockerfile: !!dockerfile, db: dbSvc ? { name: dbSvc.name, image: dbSvc.image } : null, stack: [...top, ...(framework ? [framework] : [])].join(' · '), tagline: desc.slice(0, 100), deployable: !!(composeFile || dockerfile || gen), generated: gen ? { stack: gen.stack, note: gen.note, dockerfile: gen.dockerfile } : null, surfaces: detectSurfaces(dir), domainHint: domainSuffix ? `${slugId(repo)}.${domainSuffix}` : '' };
    } finally { fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }

  const ymlStr = (s) => JSON.stringify(String(s));

  /** Host ports already taken: published by running containers or listening on this machine. Caddy owns 80/443. */
  async function usedHostPorts() {
    const used = new Set([80, 443, 2019]);
    const ps = await exec('docker', ['ps', '--format', '{{.Ports}}'], { timeout: 20000 });
    for (const m of (ps.out || '').matchAll(/:(\d+)->/g)) used.add(+m[1]);
    const ss = await exec('ss', ['-ltnH'], { timeout: 10000 });
    for (const m of (ss.out || '').matchAll(/:(\d+)\s/g)) used.add(+m[1]);
    return used;
  }

  async function deploy(cfg, log) {
    const id = String(cfg.id || '').trim();
    if (!dirOk(id)) throw new Error('The project id must be 2-30 lowercase letters, numbers or dashes.');
    if (registry.byId.has(id)) throw new Error(`An app called ${id} already exists.`);
    const info = cfg.scan; if (!info?.deployable) throw new Error('Scan the repo first.');
    const dir = path.join(appsDir, id); if (fs.existsSync(dir)) throw new Error(`The folder ${dir} already exists.`);
    // Default to <id>.<suffix> when no domain is given, so a created app always gets a URL
    // instead of becoming an orphan with no link (the "my app is empty" bug).
    const domain = (String(cfg.domain || '').trim().toLowerCase()) || (cfg.domain === '' && cfg.noRoute ? '' : (domainSuffix ? `${id}.${domainSuffix}` : ''));
    if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error('That domain does not look right.');
    const port = +cfg.port || info.port; const code = (cmd, args, opts) => new Promise((res) => live(cmd, args, { ...opts, onData: log, onClose: res }));
    if (cfg.localDir) {
      // an app written by the AI app creator: no GitHub repo yet, so copy the files and give it its own local git history
      await fsp.cp(cfg.localDir, dir, { recursive: true });
      const gi = ['-C', dir, '-c', 'user.name=DevX Control', '-c', 'user.email=devx@localhost'];
      await exec('git', [...gi, 'init', '-q', '-b', 'main']); await exec('git', [...gi, 'add', '-A']); await exec('git', [...gi, 'commit', '-q', '-m', 'Created by DevX app creator']);
      log(`Copied the generated app to ${dir}`);
    } else {
      const token = await github.cloneToken(cfg.repo);
      log(`Cloning ${cfg.repo} (shallow) ...`);
      if (await code('git', [...cred, 'clone', '--depth', '1', ...(cfg.branch ? ['--branch', cfg.branch] : []), `${remoteBase}/${cfg.repo}.git`, dir], { env: { GH_TOKEN_DC: token, GIT_TERMINAL_PROMPT: '0' } }) !== 0) throw new Error('Clone failed.');
    }
    const sha = (await exec('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'])).out.trim(); log(`Checked out ${sha}`);
    let generated = false;
    // no Dockerfile in the repo: write one (regenerated here from the real checkout, never taken from the browser)
    if (!info.composeFile && !fs.existsSync(path.join(dir, 'Dockerfile'))) {
      const files = await walk(dir, { max: 3000 });
      const gen = await generateDockerfile({ files, read: async (p) => { try { return await fsp.readFile(path.join(dir, p), 'utf8'); } catch { return null; } } });
      if (!gen) throw new Error('This repo has no Dockerfile and its project type was not recognised.');
      generated = true; await fsp.writeFile(path.join(dir, 'Dockerfile'), gen.dockerfile);
      if (!fs.existsSync(path.join(dir, '.dockerignore'))) await fsp.writeFile(path.join(dir, '.dockerignore'), gen.dockerignore);
      log(`No Dockerfile in the repo, so one was written for ${gen.stack}. ${gen.note}`);
      log('It stays on the server only. Commit your own Dockerfile later if you want to control it.');
    }

    // env file: values you gave, generated secrets, defaults
    const lines = []; const missing = []; const genVars = []; const phVars = [];
    for (const e of info.env || []) {
      const given = (cfg.env || []).find((x) => x.k === e.k);
      // A random value only makes sense for secrets. Ports, pool sizes, flags and URLs keep their default even if "Generate" was picked.
      const secretish = /(SECRET|SALT|JWT|TOKEN|KEY|PASSWORD|PASS|PRIVATE)/i.test(e.k);
      let v = given?.v ?? e.v ?? '';
      if (given?.src === 'generate' && !secretish) { given.src = 'value'; if (!given.v) v = e.v ?? ''; }
      if ((given?.src ?? e.src) === 'provision' && ['postgres', 'redis', 'mongo'].includes(e.provision)) { log(`${e.k} needs ${e.provision}. Setting one up on this server ...`); v = await prov.create(e.provision, id, log); }
      const want = wantedService(e.k, e.v || v, '');
      if (want && v && !(given?.src === 'provision') && (PLACEHOLDER.test(v) || /(localhost|127\.0\.0\.1)/i.test(v))) { log(`${e.k} was a placeholder. Setting up ${want} on this server instead ...`); v = await prov.create(want, id, log); }
      if (given?.src === 'generate' || (!v && e.src === 'generate')) { v = generateValue(e.k); genVars.push(e.k); }
      const dv = deriveDefault(e.k, v, { domain, hasProvisionedDb: (info.env || []).some((x) => x.provision === 'postgres') }); if (dv) v = dv;
      if (!v) { const ph = placeholderFor(e.k, { id, domain }); if (ph) { v = ph; phVars.push(e.k); } }
      else if ((given?.src ?? e.src) === 'placeholder') phVars.push(e.k);
      lines.push(`${e.k}=${/[\s#"']/.test(v) ? JSON.stringify(v) : v}`);
    }
    if (genVars.length) log(`Generated working values for: ${genVars.join(', ')}. See them under Secrets (admin only) if you need to sign in.`);
    if (phVars.length) log(`Placeholders used so the app can start: ${phVars.join(', ')}. The features that need the real account stay off until you set the real values under Secrets.`);
    void missing;
    if (lines.length) { await fsp.writeFile(path.join(dir, '.env'), `${lines.join('\n')}\n`, { mode: 0o600 }); log(`Wrote .env (${lines.length} variables, values hidden)`); }

    // join the shared network without editing the repo's own files
    let container = id; let containers = [];
    const composeArgs = ['compose'];
    if (info.composeFile) {
      const web = (info.services || []).find((s) => s.name === (cfg.service || info.service));
      if (!web) throw new Error('Pick which service serves the web app.');
      const used = await usedHostPorts(); const clash = (web.published || []).filter((p) => used.has(p));
      if (clash.length) log(`Host port ${clash.join(', ')} is already in use here, so it is not published. The app stays reachable through Caddy on its own port.`);
      const cn = (info.services || []).length === 1 ? id : `${id}-${web.name}`; container = cn;
      const o = [`services:`, `  ${web.name}:`, `    container_name: ${ymlStr(cn)}`, `    restart: unless-stopped`, ...(clash.length ? ['    ports: !reset []'] : []), ...(lines.length ? ['    env_file: [".env"]'] : []), `    networks:`, `      web: {}`, `      default: {}`, `networks:`, `  web:`, `    external: true`];
      await fsp.writeFile(path.join(dir, 'docker-compose.devx.yml'), `${o.join('\n')}\n`);
      composeArgs.push('-f', info.composeFile, '-f', 'docker-compose.devx.yml', '-p', id);
      if (lines.length) composeArgs.push('--env-file', '.env');
      log('Added docker-compose.devx.yml (network "web", container name, restart policy). Your repo files are untouched.');
      log('$ docker compose up -d --build');
      if (await code('docker', [...composeArgs, 'up', '-d', '--build'], { cwd: dir }) !== 0) { await exec('docker', [...composeArgs, 'down'], { cwd: dir, timeout: 60000 }); throw new Error('docker compose failed. See the log above.'); }
      const ps = await exec('docker', [...composeArgs, 'ps', '-a', '--format', '{{.Name}}'], { cwd: dir, timeout: 30000 }); containers = ps.out.split('\n').map((x) => x.trim()).filter(Boolean);
    } else {
      log(`$ docker build -t ${id} .`);
      if (await code('docker', ['build', '-t', id, '.'], { cwd: dir }) !== 0) throw new Error('docker build failed. See the log above.');
      const args = ['run', '-d', '--name', id, '--restart', 'unless-stopped', '--network', 'web', ...(generated ? ['-v', `${id}-data:/app/data`] : []), ...(lines.length ? ['--env-file', path.join(dir, '.env')] : []), id];
      log(`$ docker ${args.join(' ')}`); if (await code('docker', args, {}) !== 0) throw new Error('docker run failed.');
      containers = [id];
    }
    log(`Containers: ${containers.join(', ')}`);

    // wait for it to answer, and find the port it really listens on (the configured one first, then what the image exposes, then common ones)
    let livePort = port;
    {
      const ex = await exec('docker', ['inspect', '-f', '{{json .Config.ExposedPorts}}', container], { timeout: 15000 }); let exposed = []; try { exposed = Object.keys(JSON.parse(ex.out.trim()) || {}).map((k) => +k.split('/')[0]); } catch { /* none */ }
      const envPort = +(lines.find((l) => l.startsWith('PORT='))?.slice(5) || 0);
      const cands = [...new Set([port, envPort, ...exposed, ...(info.services || []).flatMap((x) => [...(x.ports || []), ...(x.expose || [])]), 3000, 8080, 80, 5000, 8000, 4000, 3001, 8888].filter((p) => p > 0))];
      log(`Looking for the port the app answers on (${cands.slice(0, 6).join(', ')} ...)`);
      let ok = false; const t0 = Date.now();
      while (Date.now() - t0 < 120000 && !ok) {
        for (const p of cands) { try { const r = await fetch(`http://${container}:${p}${p === port && info.health ? info.health : '/'}`, { signal: AbortSignal.timeout(2500), redirect: 'manual' }); if (r.status < 500 || p !== port) { ok = true; livePort = p; break; } } catch { /* not this one */ } }
        if (!ok) await sleep(3000);
      }
      if (ok) log(`The app answers on port ${livePort}${livePort !== port ? ` (not ${port}, so the route uses ${livePort})` : ''} after ${Math.round((Date.now() - t0) / 1000)} s`);
      else log(`The app did not answer on any port within 2 minutes. The route will use port ${port || 3000}. It is registered anyway so you can read its logs.`);
    }
    const routePort = livePort || port || 3000;

    // route
    if (domain) {
      if (dns) { const d = await dns.ensureA(domain, registry.serverIp); log(d.ok ? d.message : `DNS record not created automatically: ${d.message}`); if (d.ok && d.action !== 'unchanged') await sleep(3000); }
      let ips = []; try { ips = await dnsLookup.resolve4(domain); } catch { /* not resolving yet */ }
      log(ips.includes(registry.serverIp) ? `DNS: ${domain} points at this server` : `DNS: ${domain} does not point at ${registry.serverIp} yet (${ips.join(', ') || 'no record'}). Create an A record for it.`);
      const block = `\n# devx-control: ${id}\n${domain} {\n\treverse_proxy ${container}:${routePort}\n}\n`;
      if (caddyfile && fs.existsSync(caddyfile)) {
        const before = fs.readFileSync(caddyfile, 'utf8');
        if (before.includes(`${domain} {`)) log(`Caddy already has a block for ${domain}.`);
        else {
          fs.writeFileSync(caddyfile, before + block);
          const v = await ops.caddy.validate();
          if (!v.ok) { fs.writeFileSync(caddyfile, before); log(`Caddy rejected the new block, restored the old Caddyfile: ${(v.out + v.err).trim().split('\n').pop()}`); }
          else { const r = await ops.caddy.reload(); log(r.ok ? `Caddy route added and reloaded for ${domain}` : `Caddy reload failed: ${(r.out + r.err).trim().split('\n').pop()}`); }
        }
      } else log(`Caddyfile is not reachable from here. Add this block yourself and reload Caddy:${block}`);
    }

    const dbName = containers.find((n) => info.db && n.includes(info.db.name));
    const dbType = info.db ? (/postgres/i.test(info.db.image) ? 'postgres' : null) : null;
    registry.add({ id, port: routePort, volumes: generated ? [`${id}-data:/app/data`] : undefined, name: cfg.name || id, tagline: info.tagline || cfg.repo || id, group: cfg.group || 'Platforms', dir: id, repo: cfg.repo || undefined, containers, urls: domain ? [{ label: 'Web', url: `https://${domain}`, ...(info.health ? { path: info.health } : {}) }, ...((info.surfaces || []).map((s) => ({ label: s.label, url: `https://${domain}${s.path}`, probe: false })))] : [], db: dbType && dbName ? { type: 'postgres', container: dbName } : (info.db ? { type: info.db.image.split(':')[0], note: `${info.db.image} runs as a compose service. Browsing is only supported for PostgreSQL and SQLite.` } : { type: 'none' }), envFile: lines.length ? '.env' : undefined, stack: info.stack });
    audit(id, `Onboarded ${cfg.repo || 'a generated app'} as ${cfg.name || id}`, 'ok'); log(`Registered ${cfg.name || id}. It now appears on the Overview and in Backups.`);
    if (cfg.repo && cfg.baseline !== false && github.configured()) { try { autopilot.scan(id); log('Baseline Autopilot scan queued.'); } catch (e) { log(`Baseline scan not queued: ${e.message}`); } }
    return 0;
  }

  /** Apps deployed earlier may carry placeholder connection strings (for example a fake Neon URL copied from .env.example).
   *  Give them a real database on this server, rewrite .env, and recreate the container so it picks the change up. */
  async function recreate(app, log) {
    const dir = app.path; const id = app.id;
    const composeFile = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].find((f) => fs.existsSync(path.join(dir, f)));
    if (fs.existsSync(path.join(dir, 'docker-compose.devx.yml')) && composeFile) {
      const a = ['compose', '-f', composeFile, '-f', 'docker-compose.devx.yml', '-p', id, '--env-file', '.env', 'up', '-d', '--force-recreate'];
      return exec('docker', a, { cwd: dir, timeout: 300000 });
    }
    await exec('docker', ['rm', '-f', id], { timeout: 60000 });
    return exec('docker', ['run', '-d', '--name', id, '--restart', 'unless-stopped', '--network', 'web', ...(app.volumes || []).flatMap((v) => ['-v', v]), '--env-file', path.join(dir, '.env'), id], { timeout: 120000 });
  }
  async function heal(log = () => {}) {
    const fixed = [];
    for (const app of registry.apps.filter((x) => x.onboarded && x.envPath)) {
      let txt; try { txt = await fsp.readFile(app.envPath, 'utf8'); } catch { continue; }
      const changes = [];
      const out = [];
      for (const line of txt.split('\n')) {
        const m = /^[ \t]*([A-Z][A-Z0-9_]*)[ \t]*=[ \t]*(.*)$/.exec(line);
        if (m) {
          const v = m[2].replace(/^(['"])(.*)\1$/, '$2').trim();
          const kind = wantedService(m[1], v, '');
          if (kind && v && (PLACEHOLDER.test(v) || /(localhost|127\.0\.0\.1)/i.test(v))) {
            try { out.push(`${m[1]}=${await prov.create(kind, app.id, (l) => log(`${app.id}: ${l}`))}`); changes.push(m[1]); continue; } catch (e) { log(`${app.id}: could not set up ${kind} for ${m[1]}: ${e.message}`); }
          }
        }
        out.push(line);
      }
      if (!changes.length) continue;
      await fsp.writeFile(app.envPath, out.join('\n'), { mode: 0o600 });
      const r = await recreate(app, log); fixed.push({ app: app.id, vars: changes, ok: r.ok });
      audit(app.id, `Replaced placeholder ${changes.join(', ')} with a real service on this server and restarted${r.ok ? '' : ' (restart failed)'}`, r.ok ? 'ok' : 'warn');
    }
    for (const app of registry.apps.filter((x) => x.onboarded)) {
      try { if (await fixPermissions(app, log)) { const r = await recreate(app, log); fixed.push({ app: app.id, vars: ['folder permissions'], ok: r.ok }); } } catch (e) { log(`${app.id}: permission check failed: ${e.message}`); }
    }
    return fixed;
  }

  /** A container that crashes with EACCES on a folder gets a persistent volume at that folder, owned by the image's own user. */
  async function fixPermissions(app, log = () => {}, { restart = false } = {}) {
    const dir = app.path; const name = app.containers?.[0] || app.id;
    if (!app.onboarded || ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].some((f) => fs.existsSync(path.join(dir, f)))) return false;
    const st = await exec('docker', ['inspect', '-f', '{{.State.Status}}|{{.State.Restarting}}', name], { timeout: 15000 });
    if (!st.ok) return false;
    const [status, restarting] = st.out.trim().split('|'); if (status === 'running' && restarting !== 'true' && !restart) return false;
    const lg = await exec('docker', ['logs', '--tail', '120', name], { timeout: 20000 });
    const m = /EACCES[^\n]*?'(\/[^']+)'/.exec(`${lg.out}\n${lg.err}`); if (!m) return false;
    let target = m[1]; if (/\.[a-z0-9]{1,6}$/i.test(path.posix.basename(target))) target = path.posix.dirname(target);
    if (!target || target === '/' || ['/etc', '/usr', '/bin', '/lib', '/proc', '/sys'].some((r) => target === r || target.startsWith(`${r}/`))) return false;
    if ((app.volumes || []).some((v) => v.split(':')[1] === target)) return false;
    const vol = `${app.id}-${target.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`.slice(0, 60);
    const uid = (await exec('docker', ['run', '--rm', '--entrypoint', 'id', app.id, '-u'], { timeout: 60000 })).out.trim() || '1000';
    const gid = (await exec('docker', ['run', '--rm', '--entrypoint', 'id', app.id, '-g'], { timeout: 60000 })).out.trim() || uid;
    await exec('docker', ['volume', 'create', vol], { timeout: 20000 });
    const ch = await exec('docker', ['run', '--rm', '-v', `${vol}:/d`, 'alpine:3.20', 'chown', '-R', `${uid}:${gid}`, '/d'], { timeout: 180000 });
    if (!ch.ok) { log(`${app.id}: could not prepare ${target}: ${(ch.err || ch.out).trim().split('\n').pop()}`); return false; }
    registry.update(app.id, { volumes: [...(app.volumes || []), `${vol}:${target}`] });
    log(`${app.id}: the app could not write to ${target}. Gave it a persistent volume there, owned by its own user.`);
    audit(app.id, `Fixed folder permissions: ${target} is now a persistent volume`, 'ok');
    return true;
  }

  /** Before a redeploy: a Dockerfile we generated (untracked in git) is rewritten with the current template, and gets its data volume. */
  async function prepareRedeploy(app, log = () => {}) {
    await fixPermissions(app, log, { restart: true }).catch(() => {});
    const dir = app.path; if (!app.onboarded || !fs.existsSync(path.join(dir, 'Dockerfile'))) return;
    if (['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].some((f) => fs.existsSync(path.join(dir, f)))) return;
    const tracked = (await exec('git', ['-C', dir, 'ls-files', '--error-unmatch', 'Dockerfile'], { timeout: 15000 })).ok;
    if (tracked) return;
    const files = await walk(dir, { max: 3000 });
    const gen = await generateDockerfile({ files, read: async (p) => { try { return await fsp.readFile(path.join(dir, p), 'utf8'); } catch { return null; } } });
    if (gen) { await fsp.writeFile(path.join(dir, 'Dockerfile'), gen.dockerfile); log('Refreshed the generated Dockerfile (writable data folder, non-root user).'); }
    if (!app.volumes) { registry.update(app.id, { volumes: [`${app.id}-data:/app/data`] }); log('Added a persistent data volume at /app/data.'); }
  }

  return { scan, deploy, heal, prepareRedeploy, provision: prov };
}
