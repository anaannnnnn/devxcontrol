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

export function makeOps({ registry, docker, monitor, backupDir, githubToken, tokenFor, prepare, afterDeploy, keep = 14 }) {
  fs.mkdirSync(backupDir, { recursive: true });
  const deploymentFile = path.join(backupDir, '.deployments.json');
  let deploymentState = { rows: [] };
  try { deploymentState = { ...deploymentState, ...JSON.parse(fs.readFileSync(deploymentFile, 'utf8')) }; } catch { /* first run */ }
  const saveDeployments = () => { const tmp = `${deploymentFile}.tmp`; fs.writeFileSync(tmp, JSON.stringify(deploymentState), { mode: 0o600 }); fs.renameSync(tmp, deploymentFile); };
  const byApp = (id) => deploymentState.rows.filter((x) => x.app === id).sort((a, b) => b.at - a.at);
  async function sourceSnapshot(app, log = () => {}) {
    if (DEMO) { const name = `${app.id}-${stamp()}-${Math.random().toString(36).slice(2, 7)}-source.tar.gz`; fs.writeFileSync(path.join(backupDir, name), `demo source snapshot of ${app.id}\n`, { flag: 'wx', mode: 0o600 }); return name; }
    if (!app.path || !fs.existsSync(app.path)) throw new Error(`Source folder for ${app.name} is not available; no rollback snapshot was made.`);
    const name = `${app.id}-${stamp()}-${Math.random().toString(36).slice(2, 7)}-source.tar.gz`;
    const out = path.join(backupDir, name);
    log(`Saving source snapshot ${name} ...`);
    const r = await run('tar', ['-czf', out, '--exclude=.git', '--exclude=node_modules', '-C', app.path, '.'], { timeout: 180000 });
    if (!r.ok || !fs.existsSync(out) || fs.statSync(out).size < 100) throw new Error(`Source snapshot failed: ${(r.err || r.out || 'archive is empty').trim().slice(0, 240)}`);
    try { fs.chmodSync(out, 0o600); } catch { /* preserve the archive if chmod is unavailable */ }
    log(`Source snapshot saved (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB).`);
    return name;
  }
  function overlaySource(from, to) {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'storage', 'uploads', 'logs'].includes(e.name) || e.name === '.env' || e.name.startsWith('.env.') || /\.(sqlite3?|db|dump|sql\.gz)$/i.test(e.name)) continue;
      const src = path.join(from, e.name), dst = path.join(to, e.name), st = fs.lstatSync(src);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); overlaySource(src, dst); }
      else if (st.isFile()) {
        try { if (fs.lstatSync(dst).isSymbolicLink()) continue; } catch (x) { if (x.code !== 'ENOENT') throw x; }
        fs.copyFileSync(src, dst); fs.chmodSync(dst, st.mode & 0o777);
      }
    }
  }
  async function gitVersion(app) {
    if (!app.path || !fs.existsSync(path.join(app.path, '.git'))) return { sha: null, label: 'Source snapshot' };
    const r = await run('git', ['-c', `safe.directory=${app.path}`, '-C', app.path, 'log', '-1', '--format=%H|%s|%cI']);
    if (!r.ok) return { sha: null, label: 'Source snapshot' };
    const [sha, subject, when] = r.out.trim().split('|');
    return { sha, label: subject || sha, commitAt: when || null };
  }
  async function baseline(app) {
    const prior = byApp(app.id);
    if (!prior.length) {
      const snapshot = await sourceSnapshot(app);
      const version = await gitVersion(app);
      deploymentState.rows.push({ id: `${app.id}-baseline-${Date.now()}`, app: app.id, at: Date.now(), label: version.label, sha: version.sha, snapshot, baseline: true });
      saveDeployments();
    }
    return byApp(app.id).slice(0, 5).map(({ snapshot: _snapshot, ...x }) => x);
  }

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
  async function redeploy(app, log, { pull = true, track = true } = {}) {
    if (DEMO) {
      for (const l of [`$ git pull --ff-only`, 'Already up to date.', `$ docker compose build --no-cache`, '#1 [internal] load build definition', '#5 RUN npm install --omit=dev', 'added 142 packages in 3s', `$ docker compose up -d`, ` Container ${app.containers.at(-1)} Recreated`, ` Container ${app.containers.at(-1)} Started`, 'Done.']) { log(l); await sleep(450); }
      return 0;
    }
    const code = (cmd, args, opts) => new Promise((res) => live(cmd, args, { ...opts, onData: log, onClose: res }));
    if (track) {
      const priorVersion = await gitVersion(app);
      const priorSnapshot = await sourceSnapshot(app, log);
      const latest = byApp(app.id)[0];
      if (!latest || (priorVersion.sha && priorVersion.sha !== latest.sha) || (!priorVersion.sha && !latest.sha)) {
        deploymentState.rows.push({ id: `${app.id}-before-${Date.now()}`, app: app.id, at: Date.now(), label: priorVersion.label, sha: priorVersion.sha, snapshot: priorSnapshot, baseline: !latest });
        saveDeployments();
      }
    }
    if (pull && fs.existsSync(path.join(app.path, '.git'))) {
      log('$ git pull --ff-only --autostash');
      let tk = githubToken || ''; if (app.repo && tokenFor) { try { tk = (await tokenFor(app.repo)) || tk; } catch (e) { log(`(GitHub token not available: ${e.message})`); } }
      const cred = tk ? ['-c', `credential.helper=!f(){ echo username=x-access-token; echo password=$GH_TOKEN_DC; };f`] : [];
      const gitArgs = ['-c', `safe.directory=${app.path}`, ...cred, '-C', app.path];
      const g = await code('git', [...gitArgs, 'pull', '--ff-only', '--autostash'], { env: { GH_TOKEN_DC: tk, GIT_TERMINAL_PROMPT: '0' } });
      if (g !== 0) { log('git pull failed - not rebuilding.'); return g; }
      log('$ git log -1 --oneline');
      await code('git', [...gitArgs, 'log', '-1', '--oneline'], {});
    } else if (pull) log('(no .git directory - rebuilding from files on disk)');
    const deployedSnapshot = track ? await sourceSnapshot(app, log) : null;
    if (prepare) { try { await prepare(app, log); } catch (e) { log(`(could not refresh the Dockerfile: ${e.message})`); } }
    const has = (f) => fs.existsSync(path.join(app.path, f));
    const composeFile = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].find(has);
    let c;
    // A cached image made "redeploy succeeded" while the customer app kept serving the old build.
    // Build every service from the checkout just pulled, then start those images.
    const composeBuild = async (prefix) => {
      log(`$ docker ${[...prefix, 'build', '--no-cache'].join(' ')}`);
      const built = await code('docker', [...prefix, 'build', '--no-cache'], { cwd: app.path });
      if (built !== 0) return built;
      log(`$ docker ${[...prefix, 'up', '-d'].join(' ')}`);
      return code('docker', [...prefix, 'up', '-d'], { cwd: app.path });
    };
    // Written when an app is linked to a chosen MongoDB: points the app at it and switches the bundled database off.
    const mongoFiles = has('docker-compose.devx-mongo.yml') ? ['-f', 'docker-compose.devx-mongo.yml'] : [];
    if (has('docker-compose.devx-stack.yml')) {
      // an app made of several programs (written at onboarding): the repo's own compose file only holds a local dev database
      c = await composeBuild(['compose', '-f', 'docker-compose.devx-stack.yml', '-p', app.id, ...(has('.env') ? ['--env-file', '.env'] : [])]);
    } else if (composeFile && has('docker-compose.devx.yml')) {
      c = await composeBuild(['compose', '-f', composeFile, '-f', 'docker-compose.devx.yml', ...mongoFiles, '-p', app.id, ...(has('.env') ? ['--env-file', '.env'] : [])]);
    } else if (composeFile && mongoFiles.length) {
      c = await composeBuild(['compose', '-f', composeFile, ...mongoFiles, ...(has('.env') ? ['--env-file', '.env'] : [])]);
    } else if (composeFile) {
      c = await composeBuild(['compose']);
    } else if (has('Dockerfile')) {
      log(`$ docker build --no-cache -t ${app.id} .`);
      c = await code('docker', ['build', '--no-cache', '-t', app.id, '.'], { cwd: app.path });
      if (c === 0) {
        const name = app.containers[0] || app.id;
        log(`$ docker rm -f ${name}`); await code('docker', ['rm', '-f', name], {});
        const a = ['run', '-d', '--name', name, '--restart', 'unless-stopped', '--network', 'web', ...(app.volumes || []).flatMap((v) => ['-v', v]), ...(has('.env') ? ['--env-file', path.join(app.path, '.env')] : []), app.id];
        log(`$ docker ${a.join(' ')}`); c = await code('docker', a, {});
      }
    } else { log('No docker-compose file or Dockerfile found in this app folder.'); c = 1; }
    if (c === 0 && afterDeploy) { try { await afterDeploy(app, log); } catch (e) { log(`(MongoDB follow-up skipped: ${e.message})`); } }
    if (c === 0 && track) {
      const version = await gitVersion(app);
      const row = { id: `${app.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, app: app.id, at: Date.now(), label: version.label, sha: version.sha, snapshot: deployedSnapshot, baseline: false };
      deploymentState.rows.push(row); saveDeployments();
      log(`Saved rollback point for this deployment (${version.sha ? version.sha.slice(0, 8) : 'source snapshot'}).`);
    }
    monitor.stopped.delete(app.id);
    monitor.tick().catch(() => {});
    log(c === 0 ? 'Redeploy finished.' : `Redeploy failed (exit ${c}). See the log above.`);
    return c;
  }

  /* ---------------- backups ---------------- */
  async function backup(app, log) {
    const t = app.db?.type;
    if (t !== 'postgres' && t !== 'sqlite') { log(`${app.name}: nothing to back up on this server (${t || 'no database'}).`); return 2; }
    const name = `${app.id}-${stamp()}.${t === 'postgres' ? 'sql.gz' : 'tgz'}`;
    const out = path.join(backupDir, name);
    if (fs.existsSync(out)) { log(`Backup refused: ${name} already exists, so no existing file was overwritten.`); return 1; }
    log(`Creating ${name} ...`);
    if (DEMO) { await sleep(900); await fsp.writeFile(out, `demo backup of ${app.id}\n`, { flag: 'wx', mode: 0o600 }); log('Wrote 1 KB'); return 0; }
    const code = await new Promise((resolve) => {
      let p;
      if (t === 'postgres') {
        p = spawn('docker', ['exec', app.db.container, 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip']);
        p.stdout.pipe(fs.createWriteStream(out, { mode: 0o600, flags: 'wx' }));
      } else {
        p = spawn('docker', ['run', '--rm', '-v', `${app.db.volume}:/data:ro`, '-v', `${backupDir}:/backup`, 'alpine:3.20', 'tar', 'czf', `/backup/${name}`, '-C', '/data', '.']);
      }
      p.stderr.on('data', (d) => log(d.toString()));
      p.on('error', (e) => { log(e.message); resolve(127); });
      p.on('close', resolve);
    });
    const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
    if (code !== 0 || size < 20) { log(`Backup failed; any partial output was preserved at ${name} for inspection.`); return code || 1; }
    log(`Done. ${(size / 1024).toFixed(1)} KB`);
    return 0;
  }

  async function rollback(app, deploymentId, log) {
    await baseline(app);
    const target = byApp(app.id).find((x) => x.id === deploymentId);
    if (!target || !target.snapshot) throw new Error('That deployment is no longer available for rollback.');
    if (DEMO) { log(`Demo: restored ${target.label}.`); await sleep(400); deploymentState.rows.push({ ...target, id: `${app.id}-rollback-${Date.now()}`, at: Date.now(), label: `Rollback: ${target.label}`, baseline: false, rollbackOf: target.id }); saveDeployments(); return 0; }
    const archive = path.join(backupDir, path.basename(target.snapshot));
    if (!fs.existsSync(archive)) throw new Error('The saved source snapshot is missing; the app was not changed.');
    const buildPath = path.join(path.dirname(app.path), `.rollback-build-${app.id}-${Date.now()}`);
    fs.mkdirSync(buildPath, { recursive: true });
    const unpack = await run('tar', ['-xzf', archive, '-C', buildPath], { timeout: 180000 });
    if (!unpack.ok) throw new Error(`Could not open the saved rollback point: ${(unpack.err || unpack.out).trim().slice(0, 200)}`);
    if (app.envPath && fs.existsSync(app.envPath)) {
      const targetEnv = path.join(buildPath, path.basename(app.envPath));
      if (!fs.existsSync(targetEnv)) { fs.copyFileSync(app.envPath, targetEnv, fs.constants.COPYFILE_EXCL); fs.chmodSync(targetEnv, 0o600); }
    }
    log(`Building saved version “${target.label}” from ${target.sha ? target.sha.slice(0, 8) : 'source snapshot'}.`);
    const result = await redeploy({ ...app, path: buildPath, envPath: app.envPath ? path.join(buildPath, path.basename(app.envPath)) : null }, log, { pull: false, track: false });
    if (result !== 0) return result;
    if (!app.repo) { overlaySource(buildPath, app.path); log('Restored saved source files in place; user files and environment secrets were preserved.'); }
    deploymentState.rows.push({ ...target, id: `${app.id}-rollback-${Date.now()}`, at: Date.now(), label: `Rollback: ${target.label}`, baseline: false, rollbackOf: target.id });
    saveDeployments();
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
        unmanaged: ['cloudflared'].map((n) => ({ name: n, state: 'running' })) };
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
      unmanaged: Object.entries(monitor.containers).filter(([n]) => !managed.has(n) && n !== 'pulse').map(([name, c]) => ({ name, state: c.state })),
    };
  }

  const caddy = {
    validate: () => docker.exec(registry.infra.caddy, 'caddy validate --config /etc/caddy/Caddyfile 2>&1', 20000),
    reload: () => docker.exec(registry.infra.caddy, 'caddy reload --config /etc/caddy/Caddyfile 2>&1', 20000),
  };
  const pruneImages = () => (DEMO ? Promise.resolve({ ok: true, out: 'Total reclaimed space: 412MB' }) : run('docker', ['image', 'prune', '-f'], { timeout: 120000 }));

  return { appAction, redeploy, backup, sourceSnapshot, deployments: baseline, rollback, listBackups, backupPath, dataInfo, hostInfo, caddy, pruneImages, backupDir };
}
