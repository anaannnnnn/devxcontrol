// Git status for each app checkout: what is the latest change on GitHub, are we behind, and the auto-pull loop.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './docker.js';

const DEMO = !!process.env.DEMO;
const HOUR = 3600e3;

export function makeGit({ registry, githubToken, tokenFor, settings, onAutoPull, audit }) {
  const cache = new Map(); // appId -> status
  const credFor = (tk) => (tk ? ['-c', `credential.helper=!f(){ echo username=x-access-token; echo password=$GH_TOKEN_DC; };f`] : []);
  const git = async (app, args, timeout = 30000) => {
    let tk = githubToken || ''; if (app.repo && tokenFor) { try { tk = (await tokenFor(app.repo)) || tk; } catch { /* use the static token */ } }
    return run('git', [...credFor(tk), '-C', app.path, ...args], { env: { GH_TOKEN_DC: tk, GIT_TERMINAL_PROMPT: '0' }, timeout });
  };

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
    const s = { checkout: true, branch: branch.out.trim(), dirty: !!dirty.out.trim(), behind: 0, ahead: 0, local: parse(local.out), remote: null, pending: [], checkedAt: Date.now(), error: f.ok ? null : (f.err.trim().split('\n')[0] || 'fetch failed').slice(0, 200) };
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
    cache.set(app.id, s);
    return s;
  }

  async function checkAll() {
    for (const app of registry.apps) { try { await check(app); } catch { /* keep last */ } }
  }

  async function autoPull() {
    for (const app of registry.apps) {
      const s = cache.get(app.id);
      if (!settings.autoPull(app.id) || !s?.checkout || !s.behind || s.dirty || s.ahead) continue;
      audit(app.id, `Auto-pull: ${s.behind} new commit${s.behind > 1 ? 's' : ''} on GitHub, redeploying ${app.name}`);
      try { await onAutoPull(app); } catch (e) { audit(app.id, `Auto-pull failed for ${app.name}: ${e.message}`, 'bad'); }
    }
  }

  let timer = null;
  return {
    status: (app) => cache.get(app.id) || null,
    check, checkAll,
    start(everyMin) {
      const ms = Math.max(1, everyMin) * 60e3;
      const loop = async () => { await checkAll(); await autoPull(); };
      setTimeout(loop, 8000).unref?.();
      timer = setInterval(loop, ms); timer.unref?.();
    },
    stop() { clearInterval(timer); },
  };
}
