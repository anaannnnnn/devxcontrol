// Operations: app lifecycle, redeploy, backups, database facts, host facts. All commands use argument arrays (no shell interpolation of user input).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { run, live } from './docker.js';

const DEMO = !!process.env.DEMO;
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeOps({ registry, docker, monitor, backupDir, githubToken, tokenFor, prepare, keep = 14 }) {
  fs.mkdirSync(backupDir, { recursive: true });

  /* ---------------- lifecycle ---------------- */
  async function appAction(app, action) {
    const order = action === 'stop' ? [...app.containers].reverse() : app.containers; // DB first up, last down
    const results = [];
    for (const name of order) {
      if (registry.infra.protected.includes(name)) { results.push({ name, ok: false, err: 'protected' }); continue; }
      const r = await docker.action(name, action);
      results.push({ name, ok: r.ok, err: r.ok ? '' : (r.err || '').trim().slice(0, 200) });
      if (action === 'start' && name.endsWith('-db')) await sleep(DEMO ? 0 : 2500);
    }
    if (action === 'stop') monitor.stopped.add(app.id); else monitor.stopped.delete(app.id);
    monitor.tick().catch(() => {});
    return results;
  }

  /* ---------------- redeploy ---------------- */
  async function redeploy(app, log) {
    if (DEMO) {
      for (const l of [`$ git pull --ff-only`, 'Already up to date.', `$ docker compose up -d --build`, '#1 [internal] load build definition', '#5 RUN npm install --omit=dev', 'added 142 packages in 3s', ` Container ${app.containers.at(-1)} Recreated`, ` Container ${app.containers.at(-1)} Started`, 'Done.']) { log(l); await sleep(450); }
      return 0;
    }
    const code = (cmd, args, opts) => new Promise((res) => live(cmd, args, { ...opts, onData: log, onClose: res }));
    if (fs.existsSync(path.join(app.path, '.git'))) {
      log('$ git pull --ff-only');
      let tk = githubToken || ''; if (app.repo && tokenFor) { try { tk = (await tokenFor(app.repo)) || tk; } catch (e) { log(`(GitHub token not available: ${e.message})`); } }
      const cred = tk ? ['-c', `credential.helper=!f(){ echo username=x-access-token; echo password=$GH_TOKEN_DC; };f`] : [];
      const g = await code('git', [...cred, '-C', app.path, 'pull', '--ff-only'], { env: { GH_TOKEN_DC: tk, GIT_TERMINAL_PROMPT: '0' } });
      if (g !== 0) { log('git pull failed - not rebuilding.'); return g; }
    } else log('(no .git directory - rebuilding from files on disk)');
    if (prepare) { try { await prepare(app, log); } catch (e) { log(`(could not refresh the Dockerfile: ${e.message})`); } }
    const has = (f) => fs.existsSync(path.join(app.path, f));
    const composeFile = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].find(has);
    let c;
    if (composeFile && has('docker-compose.devx.yml')) {
      const a = ['compose', '-f', composeFile, '-f', 'docker-compose.devx.yml', '-p', app.id, ...(has('.env') ? ['--env-file', '.env'] : []), 'up', '-d', '--build'];
      log(`$ docker ${a.join(' ')}`); c = await code('docker', a, { cwd: app.path });
    } else if (composeFile) {
      log('$ docker compose up -d --build'); c = await code('docker', ['compose', 'up', '-d', '--build'], { cwd: app.path });
    } else if (has('Dockerfile')) {
      log(`$ docker build -t ${app.id} .`);
      c = await code('docker', ['build', '-t', app.id, '.'], { cwd: app.path });
      if (c === 0) {
        const name = app.containers[0] || app.id;
        log(`$ docker rm -f ${name}`); await code('docker', ['rm', '-f', name], {});
        const a = ['run', '-d', '--name', name, '--restart', 'unless-stopped', '--network', 'web', ...(app.volumes || []).flatMap((v) => ['-v', v]), ...(has('.env') ? ['--env-file', path.join(app.path, '.env')] : []), app.id];
        log(`$ docker ${a.join(' ')}`); c = await code('docker', a, {});
      }
    } else { log('No docker-compose file or Dockerfile found in this app folder.'); c = 1; }
    monitor.stopped.delete(app.id);
    monitor.tick().catch(() => {});
    log(c === 0 ? 'Redeploy finished.' : `Redeploy failed (exit ${c}). See the log above.`);
    return c;
  }

  /* ---------------- backups ---------------- */
  async function prune(appId) {
    const files = (await listBackups()).filter((f) => f.app === appId).sort((a, b) => b.t - a.t);
    for (const f of files.slice(keep)) await fsp.unlink(path.join(backupDir, f.name)).catch(() => {});
  }

  async function backup(app, log) {
    const t = app.db?.type;
    if (t !== 'postgres' && t !== 'sqlite') { log(`${app.name}: nothing to back up on this server (${t || 'no database'}).`); return 2; }
    const name = `${app.id}-${stamp()}.${t === 'postgres' ? 'sql.gz' : 'tgz'}`;
    const out = path.join(backupDir, name);
    log(`Creating ${name} ...`);
    if (DEMO) { await sleep(900); await fsp.writeFile(out, `demo backup of ${app.id}\n`); log('Wrote 1 KB'); await prune(app.id); return 0; }
    const code = await new Promise((resolve) => {
      let p;
      if (t === 'postgres') {
        p = spawn('docker', ['exec', app.db.container, 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip']);
        p.stdout.pipe(fs.createWriteStream(out, { mode: 0o600 }));
      } else {
        p = spawn('docker', ['run', '--rm', '-v', `${app.db.volume}:/data:ro`, '-v', `${backupDir}:/backup`, 'alpine:3.20', 'tar', 'czf', `/backup/${name}`, '-C', '/data', '.']);
      }
      p.stderr.on('data', (d) => log(d.toString()));
      p.on('error', (e) => { log(e.message); resolve(127); });
      p.on('close', resolve);
    });
    const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
    if (code !== 0 || size < 20) { await fsp.unlink(out).catch(() => {}); log('Backup failed.'); return code || 1; }
    log(`Done. ${(size / 1024).toFixed(1)} KB`);
    await prune(app.id);
    return 0;
  }

  async function listBackups() {
    const names = await fsp.readdir(backupDir).catch(() => []);
    const out = [];
    for (const name of names) {
      const m = /^([a-z0-9-]+)-(\d{8}-\d{6})\.(sql\.gz|tgz)$/.exec(name);
      if (!m) continue;
      const st = await fsp.stat(path.join(backupDir, name));
      out.push({ name, app: m[1], kind: m[3], size: st.size, t: st.mtimeMs });
    }
    return out.sort((a, b) => b.t - a.t);
  }
  const backupPath = (name) => (/^[a-z0-9-]+-\d{8}-\d{6}\.(sql\.gz|tgz)$/.test(name) ? path.join(backupDir, name) : null);

  /* ---------------- database facts ---------------- */
  const cache = new Map();
  async function dataInfo(app) {
    const hit = cache.get(app.id);
    if (hit && Date.now() - hit.t < 60000) return hit.v;
    const db = app.db || { type: 'none' };
    let v = { type: db.type, note: db.note || null };
    if (db.type === 'postgres') {
      const r = await docker.exec(db.container, `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F'|' -c "select 'size', pg_size_pretty(pg_database_size(current_database()))" -c "select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc limit 20"`, 20000);
      const rows = r.out.split('\n').filter(Boolean).map((l) => l.split('|'));
      v = { ...v, container: db.container, ok: r.ok, size: rows.find((x) => x[0] === 'size')?.[1] || null,
        tables: rows.filter((x) => x[0] !== 'size').map(([name, n]) => ({ name, rows: +n || 0 })), error: r.ok ? null : r.err.slice(0, 200) };
    } else if (db.type === 'sqlite') {
      const r = DEMO ? { ok: true, out: '2048\t/d\n' } : await run('docker', ['run', '--rm', '-v', `${db.volume}:/d:ro`, 'alpine:3.20', 'sh', '-c', 'du -sk /d; ls -la /d | tail -n +4'], { timeout: 40000 });
      const kb = parseInt(r.out.split('\n')[0], 10);
      v = { ...v, volume: db.volume, ok: r.ok, size: Number.isFinite(kb) ? (kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB') : null, files: r.out.split('\n').slice(1).filter(Boolean).map((l) => l.trim().split(/\s+/).slice(-1)[0]) };
    }
    cache.set(app.id, { t: Date.now(), v });
    return v;
  }

  /* ---------------- host ---------------- */
  async function hostInfo() {
    if (DEMO) {
      return { hostname: 'devx-vps', cpus: 8, load: [0.42, 0.51, 0.47], memTotal: 16 * 1073741824, memUsed: 6.1 * 1073741824, diskTotal: 320e9, diskUsed: 96e9,
        uptimeSec: 86400 * 12 + 4000, docker: '27.3.1', images: 19, volumes: 11, reclaimable: '1.4GB', kernel: '6.8.0-demo',
        unmanaged: ['pulse', 'cloudflared'].map((n) => ({ name: n, state: 'running' })) };
    }
    const meminfo = await fsp.readFile('/proc/meminfo', 'utf8').catch(() => '');
    const kb = (k) => +(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(meminfo)?.[1] || 0) * 1024;
    const [df, dv, sd, up] = await Promise.all([
      run('df', ['-B1', '-P', '/']),
      run('docker', ['version', '--format', '{{.Server.Version}}']),
      run('docker', ['system', 'df', '--format', '{{json .}}']),
      fsp.readFile('/proc/uptime', 'utf8').catch(() => '0'),
    ]);
    const d = df.out.split('\n')[1]?.split(/\s+/) || [];
    const sys = Object.fromEntries(sd.out.split('\n').filter(Boolean).map((l) => { try { const j = JSON.parse(l); return [j.Type, j]; } catch { return []; } }).filter((x) => x[0]));
    const managed = new Set(registry.apps.flatMap((a) => a.containers).concat(registry.infra.protected));
    return {
      hostname: os.hostname(), cpus: os.cpus().length, load: os.loadavg(), memTotal: kb('MemTotal'), memUsed: kb('MemTotal') - kb('MemAvailable'),
      diskTotal: +d[1] || 0, diskUsed: +d[2] || 0, uptimeSec: parseFloat(up), docker: dv.out.trim(), kernel: os.release(),
      images: +sys.Images?.TotalCount || 0, volumes: +sys['Local Volumes']?.TotalCount || 0, reclaimable: sys.Images?.Reclaimable || '',
      unmanaged: Object.entries(monitor.containers).filter(([n]) => !managed.has(n)).map(([name, c]) => ({ name, state: c.state })),
    };
  }

  const caddy = {
    validate: () => docker.exec(registry.infra.caddy, 'caddy validate --config /etc/caddy/Caddyfile 2>&1', 20000),
    reload: () => docker.exec(registry.infra.caddy, 'caddy reload --config /etc/caddy/Caddyfile 2>&1', 20000),
  };
  const pruneImages = () => (DEMO ? Promise.resolve({ ok: true, out: 'Total reclaimed space: 412MB' }) : run('docker', ['image', 'prune', '-f'], { timeout: 120000 }));

  return { appAction, redeploy, backup, listBackups, backupPath, dataInfo, hostInfo, caddy, pruneImages, backupDir };
}
