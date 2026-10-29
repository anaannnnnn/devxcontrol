// Git status for each app checkout: what is the latest change on GitHub, are we behind, and the auto-pull loop.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './docker.js';
import { detect, diskReader } from './mongox.js';

const DEMO = !!process.env.DEMO;
const HOUR = 3600e3;

/* Dockerfiles, compose files and env files are how this server runs the app.
   They are not application edits, so they must not block a pull. */
const DEPLOY_FILE = /^(?:Dockerfile(?:\.[^/]+)?|docker-compose(?:\.[^/]+)?\.ya?ml|compose\.ya?ml|\.dockerignore|\.env(?:\.[^/]+)?|[^/]+\.env)$/;

export function worktreeChanges(porcelain) {
  const source = [];
  const deploy = [];
  for (const line of String(porcelain || '').split('\n')) {
    if (line.length < 4) continue;
    let file = line.slice(3);
    if (file.startsWith('"') && file.endsWith('"')) file = file.slice(1, -1);
    const pathName = file.includes(' -> ') ? file.split(' -> ').pop() : file;
    const base = pathName.split('/').pop();
    (DEPLOY_FILE.test(base) ? deploy : source).push(pathName);
  }
  return { source, deploy, dirty: source.length > 0 };
}

export function makeGit({ registry, githubToken, tokenFor, settings, onAutoPull, audit }) {
  const cache = new Map(); // appId -> status
  const credFor = (tk) => (tk ? ['-c', `credential.helper=!f(){ echo username=x-access-token; echo password=$GH_TOKEN_DC; };f`] : []);
  const git = async (app, args, timeout = 30000) => {
    let tk = githubToken || ''; if (app.repo && tokenFor) { try { tk = (await tokenFor(app.repo)) || tk; } catch { /* use the static token */ } }
    return run('git', ['-c', `safe.directory=${app.path}`, ...credFor(tk), '-C', app.path, ...args], { env: { GH_TOKEN_DC: tk, GIT_TERMINAL_PROMPT: '0' }, timeout });
  };

  /** Reads a file as it is in the newest version on GitHub (after the last fetch). With no upstream, reads the checkout. */
  const reader = async (app) => {
    const up = fs.existsSync(path.join(app.path, '.git')) ? await git(app, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) : { ok: false };
    if (!up.ok) return diskReader(app.path);
    const ref = up.out.trim();
    return async (f) => { const r = await git(app, ['show', `${ref}:${f}`], 15000); return r.ok ? r.out : null; };
  };
  const wantsMongo = async (app) => { try { return await detect(await reader(app)); } catch { return null; } };
  const warned = new Set();

  const demoStatus = (app) => {
    const i = registry.apps.indexOf(app);
    const behind = [0, 2, 0, 1, 0, 3, 0, 0][i] || 0;
    const mk = (n, subj, h) => ({ hash: `${(0xa1b2c3 + n * 7919).toString(16)}`.slice(0, 7), subject: subj, author: 'Anan', when: new Date(Date.now() - h * HOUR).toISOString() });
    return {
      checkout: true, branch: 'main', dirty: false, behind, ahead: 0, checkedAt: Date.now(),
      local: mk(1, 'Fix gold ingest rounding', 36 + i * 5),
      remote: behind ? mk(9, 'Add dashboard export and fix login redirect', 2 + i) : mk(1, 'Fix gold ingest rounding', 36 + i * 5),
      pending: Array.from({ length: behind }, (_, n) => mk(10 + n, ['Add dashboard export', 'Fix login redirect', 'Bump dependencies'][n % 3], 1 + n * 3 + i)),
    };
  };

  async function check(app) {
    if (DEMO) { const s = demoStatus(app); cache.set(app.id, s); return s; }
    if (!fs.existsSync(path.join(app.path, '.git'))) { const s = { checkout: false, checkedAt: Date.now() }; cache.set(app.id, s); return s; }
    const f = await git(app, ['fetch', '--quiet', 'origin']);
    const [branch, local, dirty, up] = await Promise.all([
      git(app, ['rev-parse', '--abbrev-ref', 'HEAD']),
      git(app, ['log', '-1', '--format=%h|%s|%an|%cI']),
      git(app, ['status', '--porcelain']),
      git(app, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
    ]);
    const parse = (l) => { const [hash, subject, author, when] = l.trim().split('|'); return hash ? { hash, subject, author, when } : null; };
    const wt = worktreeChanges(dirty.out);
    const s = { checkout: true, branch: branch.out.trim(), dirty: wt.dirty, behind: 0, ahead: 0, local: parse(local.out), remote: null, pending: [], checkedAt: Date.now(), error: f.ok ? null : (f.err.trim().split('\n')[0] || 'fetch failed').slice(0, 200) };
    if (up.ok) {
      const upstream = up.out.trim();
      const [counts, remote, pend] = await Promise.all([
        git(app, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`]),
        git(app, ['log', '-1', '--format=%h|%s|%an|%cI', upstream]),
        git(app, ['log', 'HEAD..' + upstream, '--format=%h|%s|%an|%cI', '-n', '15']),
      ]);
      const [ahead, behind] = counts.out.trim().split(/\s+/).map(Number);
      Object.assign(s, { ahead: ahead || 0, behind: behind || 0, remote: parse(remote.out), pending: pend.out.split('\n').filter(Boolean).map(parse).filter(Boolean) });
    } else s.error ||= 'No upstream branch is set for this checkout.';
    s.mongo = await wantsMongo(app);
    cache.set(app.id, s);
    return s;
  }

  const demoMongo = new Set(['nexus']);
  /** Does the newest code want MongoDB while nobody has chosen one for this app yet? Fetches first so it is current. */
  async function mongoGate(app) {
    if (DEMO) return demoMongo.has(app.id) && !settings.mongo(app.id) ? { uses: true, envVar: 'MONGO_URI', bundled: false, from: [] } : null;
    const s = await check(app).catch(() => cache.get(app.id));
    return s?.mongo?.uses && !settings.mongo(app.id) ? s.mongo : null;
  }

  async function checkAll() {
    for (const app of registry.apps) { try { await check(app); } catch { /* keep last */ } }
  }

  async function autoPull() {
    for (const app of registry.apps) {
      const s = cache.get(app.id);
      if (!settings.autoPull(app.id) || !s?.checkout || !s.behind || s.dirty || s.ahead) continue;
      if (s.mongo?.uses && !settings.mongo(app.id)) {
        if (!warned.has(app.id)) { warned.add(app.id); audit(app.id, `Auto-pull paused for ${app.name}: it uses MongoDB and no database is chosen yet. Open Updates and pick one.`, 'warn'); }
        continue;
      }
      if (s.mongo?.uses && settings.mongo(app.id)?.mode === 'import-only') {
        if (!warned.has(app.id)) { warned.add(app.id); audit(app.id, `Auto-pull paused for ${app.name}: its code now uses MongoDB but the app is not switched yet. Press Switch to MongoDB on the app page.`, 'warn'); }
        continue;
      }
      warned.delete(app.id);
      audit(app.id, `Auto-pull: ${s.behind} new commit${s.behind > 1 ? 's' : ''} on GitHub, redeploying ${app.name}`);
      try { await onAutoPull(app); } catch (e) { audit(app.id, `Auto-pull failed for ${app.name}: ${e.message}`, 'bad'); }
    }
  }

  let timer = null;
  return {
    status: (app) => cache.get(app.id) || null,
    check, checkAll, mongoGate, reader,
    start(everyMin) {
      const ms = Math.max(1, everyMin) * 60e3;
      const loop = async () => { await checkAll(); await autoPull(); };
      setTimeout(loop, 8000).unref?.();
      timer = setInterval(loop, ms); timer.unref?.();
    },
    stop() { clearInterval(timer); },
  };
}
