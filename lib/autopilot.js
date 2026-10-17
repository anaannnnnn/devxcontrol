// Autopilot: scans every repo-linked app with real tools, files findings, and (when allowed) has the AI write a fix on a
// branch, verifies it with independent checks, and turns the result into a change report you approve before anything ships.
import { applyDet } from './detpatch.js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { run } from './docker.js';
import { SCANNERS, SEV_RANK, walk, scoreChecks, detectTestCmd, setRunner } from './scanners.js';

export const LEVELS = [
  { id: 0, name: 'Watch', blurb: 'Scans and reports only. Nothing is touched.' },
  { id: 1, name: 'Heal', blurb: 'Also restarts an app that is down. No code changes.' },
  { id: 2, name: 'Fix and report', blurb: 'Also writes fixes on a branch with a change report. You approve before anything ships.' },
];
export const STAGES = [
  { id: 'detect', name: 'Detect', by: 'Scanners + monitor', blurb: 'Tests, dependency audit, Semgrep, Hadolint, secret scan and uptime.' },
  { id: 'triage', name: 'Triage', by: 'AI model', blurb: 'Explains the impact and decides if it can be fixed safely.' },
  { id: 'locate', name: 'Locate', by: 'git blame', blurb: 'Finds the file, line and the commit that introduced it.' },
  { id: 'fix', name: 'Fix', by: 'AI model', blurb: 'Edits files on a throwaway branch. Retries with the failure shown.' },
  { id: 'verify', name: 'Verify', by: 'Independent checks', blurb: 'Re-runs the tests and the tool that found the problem.' },
  { id: 'report', name: 'Report', by: 'AI model', blurb: 'Frontend and backend impact in plain words.' },
  { id: 'approve', name: 'You approve', by: 'You', blurb: 'Read the report, then approve, request changes or reject.' },
  { id: 'deploy', name: 'Deploy', by: 'GitHub + DevX Control', blurb: 'Opens and merges the pull request, then redeploys the app.' },
  { id: 'learn', name: 'Learn', by: 'Score floors', blurb: 'Scores are re-measured so they cannot slip back.' },
];
export const AGENTS = [
  { id: 'monitor', name: 'Uptime monitor', role: 'Monitor', lic: 'Built in', good: 'Container state, HTTP status, response time and TLS expiry every 15 seconds.', weak: 'Sees that something broke, not why.', scope: 'All apps' },
  { id: 'tests', name: 'Test runner', role: 'Tester', lic: 'Built in', good: 'Runs the repo\'s own tests in a clean Docker container (npm test or pytest).', weak: 'Only as good as the tests the repo has.', scope: 'Code' },
  { id: 'npm-audit', name: 'npm audit', role: 'Tester', lic: 'Artistic-2.0', good: 'Known vulnerabilities in Node dependencies.', weak: 'Node only. Reports known issues, not unknown ones.', scope: 'Dependencies' },
  { id: 'semgrep', name: 'Semgrep', role: 'Tester', lic: 'LGPL-2.1', good: 'Security patterns: injection, unsafe eval, weak crypto.', weak: 'The free rules look at one file at a time.', scope: 'Code' },
  { id: 'hadolint', name: 'Hadolint', role: 'Tester', lic: 'GPL-3.0', good: 'Dockerfile mistakes: root user, missing healthcheck, unpinned tags.', weak: 'Style and safety only, not runtime behaviour.', scope: 'Infrastructure' },
  { id: 'secrets', name: 'Secret scan', role: 'Tester', lic: 'Built in', good: 'Keys, tokens and private keys committed in code.', weak: 'Pattern based. Cannot rotate a leaked key for you.', scope: 'Code' },
  { id: 'fixer', name: 'AI fixer', role: 'Fixer', lic: 'Your model', good: 'Small, well-described bugs. Edits files, then every check re-runs.', weak: 'Struggles with changes across many files. Small local models make weaker fixes.', scope: 'Code' },
  { id: 'reporter', name: 'Report writer', role: 'Reporter', lic: 'Your model', good: 'Turns a diff into plain words for the frontend and backend.', weak: 'Describes what changed, not whether it is a good idea.', scope: 'Reviews' },
  { id: 'advisor', name: 'Advisor', role: 'Advisor', lic: 'Your model', good: 'Reads the README and file layout and suggests improvements.', weak: 'Suggests only. Never writes to the repo.', scope: 'All apps' },
];

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'fix';
const now = () => Date.now();
const trim = (s, n) => (s.length > n ? `${s.slice(0, n)}\n... (truncated)` : s);

export function makeAutopilot({ registry, github, llm, ops, monitor, dataDir, appsDir, audit, createJob, runningJob, exec = run, remoteUrl = (repo) => `https://github.com/${repo}.git` }) {
  setRunner(exec);
  const file = path.join(dataDir, 'autopilot.json');
  const workRoot = path.join(appsDir, '.autopilot');
  let S = { cfg: { level: 0, maxAttempts: 3, scanEveryMin: 360, protectedPaths: ['.env', '.git/', '.github/workflows/', 'node_modules/'], floors: {} }, seq: { F: 0, R: 0, S: 0, run: 0 }, findings: [], reviews: [], runs: [], suggestions: [], stats: {}, apps: {}, heals: [] };
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); S = { ...S, ...j, cfg: { ...S.cfg, ...(j.cfg || {}) }, seq: { ...S.seq, ...(j.seq || {}) } }; } catch { /* first start */ }
  const save = () => { try { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(S)); fs.renameSync(tmp, file); } catch (e) { console.error('autopilot save failed:', e.message); } };
  const stat = (id, ok) => { const s = (S.stats[id] ||= { runs: 0, pass: 0, last: 0 }); s.runs++; if (ok) s.pass++; s.last = now(); };
  const nextId = (k, pre, w = 0) => `${pre}-${String(++S.seq[k]).padStart(w, '0')}`;

  /* ------------------------------ run log + queue ------------------------------ */
  let chain = Promise.resolve();
  function newRun(kind, app, extra = {}) {
    const r = { id: nextId('run', 'run'), kind, app: app?.id || null, stage: null, attempt: 0, started: now(), ended: null, state: 'queued', log: [], ...extra };
    S.runs.unshift(r); if (S.runs.length > 30) S.runs.length = 30; save(); return r;
  }
  const mkLog = (r) => (level, stage, text) => { if (stage) r.stage = stage; r.log.push([level, stage || r.stage, String(text).slice(0, 400), now()]); if (r.log.length > 250) r.log.shift(); };
  function enqueue(r, fn) {
    chain = chain.then(async () => {
      r.state = 'running'; r.started = now(); const log = mkLog(r);
      try { await fn(log, r); r.state = r.state === 'running' ? 'done' : r.state; }
      catch (e) { log('bad', r.stage, e.message); r.state = 'failed'; r.error = e.message; audit(r.app, `Autopilot ${r.kind} failed: ${e.message}`, 'bad'); }
      r.ended = now(); r.stage = null; save();
    });
    return r;
  }
  const busy = () => S.runs.some((r) => r.state === 'queued' || r.state === 'running');

  /* ------------------------------ clone ------------------------------ */
  const gitEnv = (token) => ({ GH_TOKEN_DC: token || '', GIT_TERMINAL_PROMPT: '0' });
  const cred = ['-c', 'credential.helper=!f(){ echo username=x-access-token; echo password=$GH_TOKEN_DC; };f', '-c', 'user.name=DevX Autopilot', '-c', 'user.email=autopilot@devx.local'];
  const g = (dir, args, token, timeout = 120000) => exec('git', [...cred, '-C', dir, ...args], { env: gitEnv(token), timeout });
  const dirOf = (app) => path.join(workRoot, app.id);

  async function sync(app, log) {
    if (!app.repo) throw new Error(`${app.name} has no GitHub repo set.`);
    const token = await github.cloneToken(app.repo);
    fs.mkdirSync(workRoot, { recursive: true });
    const dir = dirOf(app); const url = remoteUrl(app.repo);
    const bmap = (S.branches ||= {});
    if (!fs.existsSync(path.join(dir, '.git'))) {
      log('info', null, `Cloning ${app.repo} (shallow)`);
      const r = await exec('git', [...cred, 'clone', '--depth', '1', url, dir], { env: gitEnv(token), timeout: 300000 });
      if (!r.ok) throw new Error(`Clone failed: ${(r.err || r.out).trim().split('\n').pop()}`);
      bmap[app.id] = (await g(dir, ['rev-parse', '--abbrev-ref', 'HEAD'], token)).out.trim();
    } else {
      await g(dir, ['checkout', '-q', '--detach'], token);
      const f = await g(dir, ['fetch', '--depth', '1', 'origin', bmap[app.id] || 'HEAD'], token, 180000);
      if (!f.ok) throw new Error(`Fetch failed: ${(f.err || f.out).trim().split('\n').pop()}`);
      await g(dir, ['reset', '--hard', '-q', 'FETCH_HEAD'], token); await g(dir, ['clean', '-fdxq'], token);
    }
    const sha = (await g(dir, ['rev-parse', '--short', 'HEAD'], token)).out.trim();
    const defBranch = bmap[app.id] || 'main';
    return { dir, token, sha, branch: defBranch };
  }

  /* ------------------------------ scan ------------------------------ */
  function fp(app, it, tool) { return [app, tool, it.rule, it.file, it.line || '', it.title.slice(0, 80)].join('|'); }

  function mergeFindings(appId, tool, items, scanTime) {
    const seenFp = new Set();
    for (const it of items) {
      const f = fp(appId, it, tool); seenFp.add(f);
      const ex = S.findings.find((x) => x.fp === f);
      if (ex) { ex.seen = scanTime; ex.sev = it.sev; if (ex.state === 'resolved') { ex.state = 'open'; ex.reopened = scanTime; } continue; }
      S.findings.push({ id: nextId('F', 'F', 3), fp: f, app: appId, tool, sev: it.sev, title: it.title, file: it.file || '', line: it.line || 0, rule: it.rule, fixable: it.fixable ?? !it.noAutofix, state: 'open', first: scanTime, seen: scanTime, tries: 0 });
    }
    for (const x of S.findings) if (x.app === appId && x.tool === tool && !seenFp.has(x.fp) && (x.state === 'open' || x.state === 'review' || x.state === 'fixing')) { x.state = 'resolved'; x.resolved = scanTime; }
    if (S.findings.length > 600) S.findings = S.findings.filter((x) => x.state !== 'resolved').concat(S.findings.filter((x) => x.state === 'resolved').slice(-150));
  }

  const uptimeOf = (app) => monitor.uptime(app.id, 7) ?? monitor.uptime(app.id, 30);

  async function scanApp(app, log, only) {
    const c = await sync(app, log);
    log('ok', 'detect', `${app.name}: checked out ${c.sha} on ${c.branch}`);
    const files = await walk(c.dir);
    const checks = { ...(S.apps[app.id]?.checks || {}) }; const t = now();
    const tools = only || Object.keys(SCANNERS);
    for (const tool of tools) {
      log('info', 'detect', `Running ${tool} ...`);
      const r = await SCANNERS[tool](c.dir, files);
      checks[tool] = { ran: r.ran, ok: r.ok, summary: r.summary, ms: r.ms, pass: r.pass, fail: r.fail, count: r.items.length, tail: r.tail, items: r.items.slice(0, 60) };
      stat(tool, r.ran && r.ok); log(!r.ran ? 'info' : r.ok ? 'ok' : 'warn', 'detect', `${tool}: ${r.summary}`);
      if (r.ran) mergeFindings(app.id, tool, r.items, t);
    }
    const st = monitor.status[app.id];
    const downItems = st && !['healthy', 'stopped', 'unknown'].includes(st) ? [{ sev: st === 'degraded' ? 'med' : 'high', title: `${app.name} is ${st}`, rule: 'uptime', file: '', line: 0, fixable: false }] : [];
    mergeFindings(app.id, 'monitor', downItems, t); stat('monitor', !downItems.length);
    const prev = S.apps[app.id]?.scores || null;
    const scores = scoreChecks(checks, uptimeOf(app));
    S.apps[app.id] = { scannedAt: t, sha: c.sha, branch: c.branch, checks, scores, prevScores: prev, hasTests: !!(await detectTestCmd(c.dir)) };
    for (const [k, fl] of Object.entries(S.cfg.floors)) if (scores[k] != null && scores[k] < fl && !S.findings.some((x) => x.app === app.id && x.rule === `floor:${k}` && x.state === 'open'))
      S.findings.push({ id: nextId('F', 'F', 3), fp: `${app.id}|floor|${k}|${t}`, app: app.id, tool: 'floor', sev: 'med', title: `${k} score ${scores[k]} is below your floor of ${fl}`, file: '', line: 0, rule: `floor:${k}`, fixable: false, state: 'open', first: t, seen: t, tries: 0 });
    save();
    return c;
  }

  async function heal(app, log) {
    const st = monitor.status[app.id]; if (!['down', 'crashing'].includes(st)) return;
    const last = S.heals.filter((h) => h.app === app.id).at(-1);
    if (last && now() - last.t < 30 * 60e3) { log('info', 'detect', `${app.name} is ${st}; already restarted ${Math.round((now() - last.t) / 60000)} min ago, waiting.`); return; }
    log('warn', 'fix', `${app.name} is ${st}. Restarting its containers (Heal level).`);
    const res = await ops.appAction(app, 'restart');
    S.heals.push({ app: app.id, t: now(), ok: res.every((r) => r.ok || r.err === 'protected') }); S.heals = S.heals.slice(-100);
    audit(app.id, `Autopilot restarted ${app.name} (was ${st})`, 'warn'); save();
  }

  const eligible = () => registry.apps.filter((a) => a.repo);

  function scan(appId) {
    const apps = appId ? [registry.byId.get(appId)].filter(Boolean) : eligible();
    if (!apps.length) throw Object.assign(new Error('No apps with a GitHub repo to scan.'), { status: 400 });
    const r = newRun('scan', apps.length === 1 ? apps[0] : null, { label: apps.length === 1 ? apps[0].name : `${apps.length} apps` });
    return enqueue(r, async (log) => {
      for (const a of apps) {
        try { await scanApp(a, log); if (S.cfg.level >= 1) await heal(a, log); }
        catch (e) { log('bad', 'detect', `${a.name}: ${e.message}`); }
      }
      log('ok', 'learn', 'Scores updated.');
      audit(null, `Autopilot scanned ${apps.length} app${apps.length > 1 ? 's' : ''}`, 'info');
      if (S.cfg.level >= 2 && llm.configured()) autoFix(apps);
    });
  }

  function autoFix(apps) {
    for (const a of apps) {
      const f = S.findings.filter((x) => x.app === a.id && x.state === 'open' && x.fixable && x.tries < 2 && x.sev !== 'low').sort((p, q) => SEV_RANK[q.sev] - SEV_RANK[p.sev])[0];
      if (f && !S.reviews.some((r) => r.app === a.id && r.state === 'pending')) fix(f.id, { auto: true });
    }
  }

  /* ------------------------------ fix ------------------------------ */
  const protectedPath = (p) => S.cfg.protectedPaths.some((x) => p === x.replace(/\/$/, '') || p.startsWith(x.endsWith('/') ? x : `${x}/`) || (x === '.env' && /(^|\/)\.env(\.|$)/.test(p) && !/example|sample/.test(p)));
  const safeRel = (p) => typeof p === 'string' && p && !p.startsWith('/') && !p.split('/').includes('..') && !p.includes('\0');

  async function fileContext(dir, rel, line) {
    let txt; try { txt = await fsp.readFile(path.join(dir, rel), 'utf8'); } catch { return null; }
    const lines = txt.split('\n');
    if (txt.length <= 14000) return { rel, text: lines.map((l, i) => `${i + 1}: ${l}`).join('\n') };
    const a = Math.max(0, (line || 1) - 80), b = Math.min(lines.length, (line || 1) + 80);
    return { rel, text: lines.slice(a, b).map((l, i) => `${a + i + 1}: ${l}`).join('\n'), partial: true };
  }

  function applyEdits(dir, out, log) {
    const edits = Array.isArray(out.edits) ? out.edits : []; const news = Array.isArray(out.new_files) ? out.new_files : [];
    if (!edits.length && !news.length) throw new Error('The model proposed no changes.');
    if (edits.length + news.length > 6) throw new Error('Too many files changed at once (limit 6).');
    const plan = [];
    for (const e of edits) {
      if (!safeRel(e.path) || protectedPath(e.path)) throw new Error(`Edit to ${e.path} is not allowed.`);
      const fp_ = path.join(dir, e.path); if (!fs.existsSync(fp_)) throw new Error(`${e.path} does not exist.`);
      const cur = fs.readFileSync(fp_, 'utf8'); const find = String(e.find ?? '');
      if (!find) throw new Error(`Edit for ${e.path} has an empty "find".`);
      const n = cur.split(find).length - 1; if (n !== 1) throw new Error(`"find" text in ${e.path} matched ${n} times (must be exactly 1). Quote more surrounding lines.`);
      plan.push([fp_, cur.replace(find, () => String(e.replace ?? ''))]);
    }
    for (const nf of news) {
      if (!safeRel(nf.path) || protectedPath(nf.path)) throw new Error(`New file ${nf.path} is not allowed.`);
      if (fs.existsSync(path.join(dir, nf.path))) throw new Error(`${nf.path} already exists; use an edit instead.`);
      plan.push([path.join(dir, nf.path), String(nf.content ?? '')]);
    }
    for (const [p, c] of plan) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); log('info', 'fix', `Wrote ${path.relative(dir, p)}`); }
    return plan.map(([p]) => path.relative(dir, p));
  }

  async function syntaxOk(dir, changed) {
    for (const f of changed.filter((x) => /\.(m?js|cjs)$/.test(x))) { const r = await exec('node', ['--check', path.join(dir, f)], { timeout: 20000 }); if (!r.ok) return `${f}: ${r.err.trim().split('\n').slice(0, 3).join(' ')}`; }
    return null;
  }

  async function parseDiff(dir, base, token) {
    const r = await g(dir, ['diff', '--no-color', '-U3', base, 'HEAD'], token, 60000);
    const files = []; let cur = null;
    for (const l of r.out.split('\n')) {
      if (l.startsWith('diff --git')) { cur = { path: l.split(' b/')[1], add: 0, del: 0, lines: [] }; files.push(cur); }
      else if (!cur || /^(index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(l)) continue;
      else if (l.startsWith('@@')) cur.lines.push(['c', l]);
      else if (l.startsWith('+')) { cur.add++; if (cur.lines.length < 400) cur.lines.push(['a', l.slice(1)]); }
      else if (l.startsWith('-')) { cur.del++; if (cur.lines.length < 400) cur.lines.push(['d', l.slice(1)]); }
      else if (cur.lines.length < 400) cur.lines.push(['x', l.slice(1)]);
    }
    return { files, patch: trim(r.out, 400000) };
  }

  const SYS_FIX = 'You are a careful senior engineer fixing ONE problem in a repository. Make the smallest correct change. Do not refactor. Do not touch secrets, env files or CI config. Reply with JSON only: {"explanation": string, "edits": [{"path": string, "find": string, "replace": string}], "new_files": [{"path": string, "content": string}]}. Each "find" must be copied EXACTLY from the file shown (without the leading line numbers) and must occur exactly once in that file; include 2-3 surrounding lines to make it unique. Use new_files only for a regression test or a missing file.';

  function fix(findingId, { auto = false, note = '' } = {}) {
    const f = S.findings.find((x) => x.id === findingId); if (!f) throw Object.assign(new Error('Finding not found.'), { status: 404 });
    const app = registry.byId.get(f.app); if (!app) throw Object.assign(new Error('App not found.'), { status: 404 });
    if (!f.det && !llm.configured()) throw Object.assign(new Error('Connect an AI model first (Connections).'), { status: 409 });
    if (!f.fixable) throw Object.assign(new Error('This finding cannot be fixed automatically. It needs a person (for example rotating a leaked key).'), { status: 409 });
    if (busy() && !auto) throw Object.assign(new Error('Another run is in progress. Try again when it finishes.'), { status: 409 });
    const r = newRun('fix', app, { finding: f.id, label: f.title });
    f.state = 'fixing'; f.tries++; save();
    return enqueue(r, async (log) => {
      const t0 = now(); const timeline = [['Detected', f.tool, f.first]];
      const c = await sync(app, log); log('ok', 'detect', `Working copy at ${c.sha}`);
      const branch = `autopilot/${f.id.toLowerCase()}-${slug(f.title)}`;
      await g(c.dir, ['checkout', '-q', '-B', branch], c.token);

      // triage
      log('info', 'triage', 'Asking the model to explain the impact and check it is safe to fix automatically');
      let triage = { fixable: true, impact: '' };
      if (!f.det) try { triage = await llm.json([{ role: 'system', content: 'You triage software findings. Reply with JSON only: {"fixable": boolean, "impact": string (one plain sentence about what users or the system suffer), "reason": string}. fixable=false if the fix needs secrets, infrastructure access, product decisions or broad rewrites.' }, { role: 'user', content: `App ${app.name}. Finding: ${f.title}\nTool: ${f.tool}  Rule: ${f.rule}  File: ${f.file}:${f.line}` }], { maxTokens: 400 }); } catch (e) { log('warn', 'triage', `Triage skipped: ${e.message}`); }
      if (triage.fixable === false) { f.state = 'open'; f.fixable = false; f.why = triage.reason || ''; log('warn', 'triage', `Not fixed automatically: ${triage.reason || 'needs a person'}`); r.state = 'done'; return; }
      log('ok', 'triage', triage.impact || 'Triage done');

      // locate
      let blame = '';
      if (f.file && f.line) {
        const b = await g(c.dir, ['blame', '-L', `${f.line},${f.line}`, '--porcelain', 'HEAD', '--', f.file], c.token);
        const m = /^([0-9a-f]{7,40}) /.exec(b.out); const who = /^author (.*)$/m.exec(b.out)?.[1]; const sum = /^summary (.*)$/m.exec(b.out)?.[1];
        if (m) { blame = `${m[1].slice(0, 7)} "${sum || ''}" by ${who || 'unknown'}`; log('ok', 'locate', `${f.file}:${f.line} comes from ${blame}`); }
      }
      if (!blame) log('info', 'locate', f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : 'No single file for this finding');

      const base = (await g(c.dir, ['rev-parse', 'HEAD'], c.token)).out.trim();
      const before = S.apps[app.id]?.checks || {};
      const tree = (await walk(c.dir, { max: 300 })).map((x) => x.path).slice(0, 200).join('\n');
      let readme = ''; try { readme = (await fsp.readFile(path.join(c.dir, 'README.md'), 'utf8')).slice(0, 2000); } catch { /* none */ }
      let feedback = note ? `The reviewer asked for changes: ${note}` : '';
      let ok = false, changed = [], explanation = '', after = {}, lastReason = '';

      for (let attempt = 1; attempt <= S.cfg.maxAttempts; attempt++) {
        r.attempt = attempt; await g(c.dir, ['reset', '--hard', '-q', base], c.token); await g(c.dir, ['clean', '-fdq'], c.token);
        log('info', 'fix', `Attempt ${attempt} of ${S.cfg.maxAttempts}`);
        try {
          // dependency findings have a mechanical fixer; everything else goes to the model
          if (f.det) {
            changed = applyDet(c.dir, f.det, log); if (!changed.length) throw new Error('Nothing needed to change (already applied).');
            explanation = f.det.explain || f.title; log('ok', 'fix', `Applied without AI: ${changed.join(', ')}`);
          } else if (f.tool === 'npm-audit') {
            const rr = await exec('docker', ['run', '--rm', '--user', '1000:1000', '-v', `${c.dir}:/src`, '-w', '/src', '-e', 'HOME=/tmp', '-e', 'npm_config_cache=/tmp/.npm', 'node:22-slim', 'sh', '-c', 'npm audit fix --no-fund --ignore-scripts'], { timeout: 300000 });
            changed = (await g(c.dir, ['status', '--porcelain'], c.token)).out.split('\n').filter(Boolean).map((l) => l.slice(3));
            if (!changed.length) throw new Error('npm audit fix changed nothing (a breaking upgrade is needed).');
            explanation = `Ran npm audit fix for ${f.title}.`; log('ok', 'fix', `npm audit fix updated ${changed.join(', ')}`); void rr;
          } else {
            const ctxs = [];
            if (f.file) { const x = await fileContext(c.dir, f.file, f.line); if (x) ctxs.push(x); }
            const user = `Repository ${app.repo} (${app.stack || 'unknown stack'}).\nProblem: ${f.title}\nTool: ${f.tool}, rule ${f.rule}\nLocation: ${f.file || 'n/a'}${f.line ? `:${f.line}` : ''}\n${blame ? `Introduced by: ${blame}\n` : ''}${triage.impact ? `Impact: ${triage.impact}\n` : ''}${f.spec ? `\nExact specification (follow it literally):\n${f.spec}\n` : ''}${feedback ? `\n${feedback}\n` : ''}\nFiles in the repo:\n${tree}\n\nREADME start:\n${readme}\n\n${ctxs.map((x) => `----- ${x.rel}${x.partial ? ' (part)' : ''}\n${x.text}`).join('\n\n')}`;
            const out = await llm.json([{ role: 'system', content: SYS_FIX }, { role: 'user', content: trim(user, 24000) }], { maxTokens: 4096, timeout: 600000 });
            explanation = String(out.explanation || '').slice(0, 600);
            changed = applyEdits(c.dir, out, log);
          }
          const syn = await syntaxOk(c.dir, changed); if (syn) throw new Error(`Syntax error after the change: ${syn}`);
          await g(c.dir, ['add', '-A'], c.token); await g(c.dir, ['commit', '-q', '-m', `autopilot: ${f.title.slice(0, 70)}`], c.token);

          // verify: tests + the tool that found it, run independently of the fixer
          log('info', 'verify', 'Re-running the checks');
          after = {};
          const files = await walk(c.dir);
          const toRun = ['tests', ...(f.tool !== 'tests' && SCANNERS[f.tool] ? [f.tool] : [])];
          const results = {};
          for (const tool of [...new Set(toRun)]) { results[tool] = await SCANNERS[tool](c.dir, files); stat(tool, results[tool].ran && results[tool].ok); log(results[tool].ok ? 'ok' : 'warn', 'verify', `${tool}: ${results[tool].summary}`); after[tool] = results[tool]; }
          const tOk = !results.tests?.ran || results.tests.ok || (before.tests && before.tests.ran && !before.tests.ok);
          if (!tOk) throw new Error(`Tests fail after the change: ${trim(results.tests.tail || '', 600)}`);
          if (f.tool !== 'tests' && results[f.tool]?.ran) {
            const still = results[f.tool].items.some((it) => fp(app.id, it, f.tool) === f.fp);
            if (still) throw new Error(`${f.tool} still reports this problem.`);
            const worse = results[f.tool].items.filter((it) => it.sev === 'high' && !(before[f.tool]?.items || []).some((b) => fp(app.id, b, f.tool) === fp(app.id, it, f.tool)));
            if (worse.length) throw new Error(`The change introduced a new serious ${f.tool} finding: ${worse[0].title}`);
          }
          ok = true; stat('fixer', true); timeline.push([`Attempt ${attempt} passed`, 'AI fixer', now()]); break;
        } catch (e) {
          lastReason = e.message; stat('fixer', false); timeline.push([`Attempt ${attempt} rejected`, 'AI fixer', now()]);
          log('warn', 'fix', `Attempt ${attempt} rejected: ${e.message.split('\n')[0]}`);
          feedback = `${note ? `Reviewer note: ${note}\n` : ''}Your previous attempt was rejected: ${e.message}\nTry a different, smaller change.`;
        }
      }
      if (!ok) { await g(c.dir, ['reset', '--hard', '-q', base], c.token); f.state = 'open'; f.why = `Automatic fix failed: ${lastReason.split('\n')[0]}`; log('bad', 'fix', f.why); r.state = 'failed'; audit(app.id, `Autopilot could not fix ${f.id} after ${S.cfg.maxAttempts} attempts`, 'warn'); return; }

      // report
      log('info', 'report', 'Writing the change report');
      const { files, patch } = await parseDiff(c.dir, base, c.token);
      let rep = {};
      if (f.det) rep = f.det.report || {}; else try { rep = await llm.json([{ role: 'system', content: 'You write change reports for non-experts. Reply with JSON only: {"title": string (max 80 chars, plain), "summary": string (2-3 sentences, what was wrong and what changed), "cause": string (one sentence root cause), "frontend": string[] (what users will see; ["No visible change."] if none), "backend": string[] (what the server does differently; ["No change."] if none), "risk": "low"|"med"|"high"}' }, { role: 'user', content: trim(`Finding: ${f.title}\nModel explanation: ${explanation}\nBlame: ${blame}\nFiles changed: ${files.map((x) => `${x.path} (+${x.add} -${x.del})`).join(', ')}\n\nDiff:\n${patch}`, 16000) }], { maxTokens: 900 }); stat('reporter', true); }
      catch (e) { stat('reporter', false); log('warn', 'report', `Report writer failed (${e.message}); using a plain summary.`); }
      const list = (v, d) => (Array.isArray(v) && v.length ? v.map(String).slice(0, 6) : [d]);
      const review = {
        id: nextId('R', 'R', 4), state: 'pending', app: app.id, title: String(rep.title || f.title).slice(0, 120), finding: f.id, created: now(), attempts: r.attempt, risk: ['low', 'med', 'high'].includes(rep.risk) ? rep.risk : (files.length > 3 ? 'med' : 'low'), agent: f.tool === 'npm-audit' ? 'npm audit fix' : 'AI fixer', branch, base, baseSha: S.apps[app.id]?.sha, repo: app.repo, defaultBranch: c.branch,
        summary: String(rep.summary || explanation || f.title), cause: String(rep.cause || (blame ? `Introduced in ${blame}.` : f.title)), frontend: list(rep.frontend, 'No visible change.'), backend: list(rep.backend, 'No change.'), files, patch,
        tests: [...new Set(['tests', f.tool])].filter((t) => before[t]?.ran || after[t]?.ran).map((t) => ({ n: AGENTS.find((a) => a.id === t)?.name || t, before: before[t]?.ran ? (before[t].ok ? 'pass' : 'fail') : 'n/a', after: after[t]?.ran ? (after[t].ok ? 'pass' : 'fail') : 'n/a', note: t === 'tests' && after.tests?.pass != null ? `${after.tests.pass} passing` : '' })),
        scores: (() => { const a = scoreChecks({ ...before, ...after }, uptimeOf(app)), b = S.apps[app.id]?.scores || {}; return Object.keys(a).filter((k) => a[k] != null && b[k] != null && a[k] !== b[k]).map((k) => ({ k, a: b[k], b: a[k] })); })(),
        rollback: `Revert the merge commit on ${c.branch} (git revert) and redeploy ${app.name}. ${files.some((x) => /migrat|schema|\.sql$/i.test(x.path)) ? 'This change touches database files, so check the data before reverting.' : 'No database files are touched by this change.'}`,
        timeline: [...timeline, ['Report ready', 'Report writer', now()]],
      };
      S.reviews.unshift(review); f.state = 'review'; f.review = review.id; f.why = '';
      log('ok', 'approve', `${review.id} is waiting for your decision`); audit(app.id, `Autopilot prepared ${review.id}: ${review.title}`, 'info');
      void t0; save();
    });
  }

  /* ------------------------------ review decisions ------------------------------ */
  const reviewOf = (id) => { const x = S.reviews.find((r) => r.id === id); if (!x) throw Object.assign(new Error('Review not found.'), { status: 404 }); return x; };

  function approve(id) {
    const rv = reviewOf(id); if (rv.state !== 'pending') throw Object.assign(new Error('This review is already decided.'), { status: 409 });
    const app = registry.byId.get(rv.app);
    const r = newRun('deploy', app, { label: rv.title, finding: rv.finding });
    rv.state = 'deploying'; save();
    return enqueue(r, async (log) => {
      try {
        log('info', 'deploy', 'Preparing the branch'); const c = await sync(app, log);
        await g(c.dir, ['checkout', '-q', '-B', rv.branch], c.token);
        const pf = path.join(workRoot, `${rv.id}.patch`); fs.writeFileSync(pf, rv.patch);
        const ap = await g(c.dir, ['apply', '--index', pf], c.token); fs.rmSync(pf, { force: true });
        if (!ap.ok) throw new Error(`The repo moved on and the change no longer applies cleanly (${(ap.err || '').trim().split('\n')[0]}). Run the fix again.`);
        await g(c.dir, ['commit', '-q', '-m', `autopilot: ${rv.title}\n\nReview ${rv.id}, finding ${rv.finding}`], c.token);
        log('info', 'deploy', `Pushing ${rv.branch}`);
        const push = await g(c.dir, ['push', '--force-with-lease', 'origin', `${rv.branch}:${rv.branch}`], c.token, 180000);
        if (!push.ok) {
          let why = 'The GitHub App needs "Contents: write" permission.';
          try { const a = await github.access(rv.repo); if (a.missing.length) why = `On ${a.account || 'this account'} the app only has read access to: ${a.missing.join(', ')}. On GitHub open Settings > Applications > Installed GitHub Apps > Configure${a.account ? ` for ${a.account}` : ''}, accept the new permissions, then approve again. (If the app itself only asks for read, change it under Settings > Developer settings > GitHub Apps > Permissions.)`; else why = `The app has write access on ${a.account || 'this account'}, so a branch rule may be blocking the push.`; } catch (e) { why = e.message; }
          throw new Error(`Push failed: ${(push.err || push.out).trim().split('\n').pop()}. ${why}`);
        }
        const body = `${rv.summary}\n\n**Root cause:** ${rv.cause}\n\n**Frontend**\n${rv.frontend.map((x) => `- ${x}`).join('\n')}\n\n**Backend**\n${rv.backend.map((x) => `- ${x}`).join('\n')}\n\n_Review ${rv.id} · finding ${rv.finding} · approved in DevX Control_`;
        const pr = await github.openPr(rv.repo, { head: rv.branch, base: rv.defaultBranch, title: rv.title, body });
        rv.pr = { n: pr.number, url: pr.html_url }; log('ok', 'deploy', `Opened pull request #${pr.number}`);
        try { await github.mergePr(rv.repo, pr.number); rv.merged = true; log('ok', 'deploy', 'Merged'); }
        catch (e) { rv.state = 'pr-open'; log('warn', 'deploy', `Not merged: ${e.message}. Merge it on GitHub, then redeploy.`); audit(app.id, `${rv.id}: pull request #${pr.number} opened, merge it on GitHub`, 'info'); save(); return; }
        if (!runningJob('redeploy', app.id)) {
          const job = createJob('redeploy', app.id, async (jl) => ops.redeploy(app, jl));
          await new Promise((res) => { job.subs.add((m) => m.done && res()); if (job.done) res(); });
          log(job.code === 0 ? 'ok' : 'bad', 'deploy', job.code === 0 ? `${app.name} redeployed` : `Redeploy exited with ${job.code}`);
        }
        rv.state = 'deployed'; rv.decided = now(); rv.timeline.push(['Deployed', 'You', now()]);
        const f = S.findings.find((x) => x.id === rv.finding); if (f) { f.state = 'resolved'; f.resolved = now(); }
        audit(app.id, `${rv.id} approved and deployed: ${rv.title}`, 'ok');
        log('info', 'learn', 'Re-scanning to lock in the new scores'); await scanApp(app, log);
      } catch (e) { rv.state = 'pending'; throw e; }
    });
  }
  function reject(id, note = '') { const rv = reviewOf(id); if (rv.state !== 'pending') throw Object.assign(new Error('This review is already decided.'), { status: 409 }); rv.state = 'rejected'; rv.decided = now(); rv.note = String(note).slice(0, 500); const f = S.findings.find((x) => x.id === rv.finding); if (f) { f.state = 'wontfix'; } audit(rv.app, `${rv.id} rejected`, 'info'); save(); return rv; }
  function requestChanges(id, note) {
    const rv = reviewOf(id); if (rv.state !== 'pending') throw Object.assign(new Error('This review is already decided.'), { status: 409 });
    if (!String(note || '').trim()) throw Object.assign(new Error('Say what should change.'), { status: 400 });
    rv.state = 'superseded'; rv.decided = now(); rv.note = String(note).slice(0, 500);
    const f = S.findings.find((x) => x.id === rv.finding); if (f) f.state = 'open';
    save(); return fix(rv.finding, { note: rv.note });
  }

  /* ------------------------------ advisor ------------------------------ */
  function advise(appId) {
    if (!llm.configured()) throw Object.assign(new Error('Connect an AI model first (Connections).'), { status: 409 });
    const app = registry.byId.get(appId); if (!app?.repo) throw Object.assign(new Error('Pick an app that has a GitHub repo.'), { status: 400 });
    const r = newRun('advisor', app, { label: app.name });
    return enqueue(r, async (log) => {
      const c = await sync(app, log); log('info', 'detect', 'Reading README and file layout');
      let readme = ''; try { readme = (await fsp.readFile(path.join(c.dir, 'README.md'), 'utf8')).slice(0, 4000); } catch { /* none */ }
      const tree = (await walk(c.dir, { max: 400 })).map((x) => x.path).join('\n');
      const open = S.findings.filter((x) => x.app === app.id && x.state === 'open').slice(0, 15).map((x) => `${x.sev} ${x.title}`).join('\n');
      const out = await llm.json([{ role: 'system', content: 'You are a pragmatic staff engineer. Suggest 3 to 6 concrete improvements for this project, most valuable first. Reply with JSON only: {"suggestions":[{"title": string, "why": string (1-2 sentences, specific to this repo), "impact": "High"|"Med"|"Low", "effort": "High"|"Med"|"Low", "area": "Backend"|"Frontend"|"Database"|"Infrastructure"|"Security"|"Docs"}]}. Never invent files that are not in the list.' }, { role: 'user', content: trim(`Project ${app.name} (${app.stack || ''}).\n\nREADME:\n${readme}\n\nFiles:\n${tree}\n\nOpen findings:\n${open || 'none'}`, 16000) }], { maxTokens: 1500 });
      S.suggestions = S.suggestions.filter((x) => x.app !== app.id);
      for (const s of (out.suggestions || []).slice(0, 6)) S.suggestions.push({ id: nextId('S', 'S'), app: app.id, title: String(s.title).slice(0, 120), why: String(s.why).slice(0, 300), impact: ['High', 'Med', 'Low'].includes(s.impact) ? s.impact : 'Med', effort: ['High', 'Med', 'Low'].includes(s.effort) ? s.effort : 'Med', area: String(s.area || 'Backend').slice(0, 20), t: now() });
      stat('advisor', true); log('ok', 'report', `${S.suggestions.filter((x) => x.app === app.id).length} suggestions saved`); save();
    });
  }

  /* ------------------------------ tasks from Studio ------------------------------ */
  // A task is a finding written by a person ("add a /healthz endpoint"); it goes through the same fix pipeline and review.
  function task(appId, title, detail = '', spec = '', det = null) {
    const app = registry.byId.get(appId); if (!app?.repo) throw Object.assign(new Error('Pick an app that has a GitHub repo.'), { status: 400 });
    const t = String(title || '').trim().slice(0, 140); if (t.length < 6) throw Object.assign(new Error('Describe the change in a sentence.'), { status: 400 });
    const f = { id: nextId('F', 'F', 3), fp: `${appId}|task|${now()}`, app: appId, tool: 'task', sev: 'med', title: `${t}${detail ? ` - ${String(detail).slice(0, 300)}` : ''}`.slice(0, 400), file: '', line: 0, rule: 'task', fixable: true, state: 'open', first: now(), seen: now(), tries: 0, manual: true, ...(spec ? { spec: String(spec).slice(0, 6000) } : {}), ...(det ? { det } : {}) };
    S.findings.push(f); save(); return fix(f.id);
  }

  /* ------------------------------ views ------------------------------ */
  function scoresView(appId, allow = null) {
    const ids = appId ? [appId] : Object.keys(S.apps).filter((i) => !allow || allow.has(i));
    const cats = ['Security', 'Dependencies', 'Tests', 'Infrastructure', 'Reliability'];
    const out = cats.map((k) => {
      const vals = ids.map((i) => S.apps[i]?.scores?.[k]).filter((v) => v != null);
      const prevs = ids.map((i) => S.apps[i]?.prevScores?.[k]).filter((v) => v != null);
      if (!vals.length) return { k, v: null, d: null, floor: S.cfg.floors[k] ?? null };
      const avg = (a) => Math.round(a.reduce((s, v) => s + v, 0) / a.length);
      return { k, v: avg(vals), d: prevs.length === vals.length ? avg(vals) - avg(prevs) : null, floor: S.cfg.floors[k] ?? null };
    });
    return out;
  }

  function schedule() {
    const apps = eligible().length; const last = Math.max(0, ...Object.values(S.apps).map((a) => a.scannedAt || 0));
    const rows = [{ every: 'Every 15 seconds', what: 'Container, HTTP and response-time checks', by: 'Monitor', live: true }];
    if (apps) rows.push({ every: `Every ${S.cfg.scanEveryMin >= 60 ? `${S.cfg.scanEveryMin / 60} h` : `${S.cfg.scanEveryMin} min`}`, what: `Full scan of ${apps} app${apps > 1 ? 's' : ''}: tests, dependencies, code, Dockerfile, secrets`, by: 'Scanners', next: last ? last + S.cfg.scanEveryMin * 60e3 : null });
    if (S.cfg.level >= 2) rows.push({ every: 'After each scan', what: 'Fix the most serious open finding per app (one at a time)', by: 'AI fixer' });
    return rows;
  }

  function view(appId, allow = null) {
    const cur = S.runs.find((r) => r.state === 'running') || S.runs.find((r) => r.state === 'queued') || S.runs[0] || null;
    const fl = S.findings.filter((f) => (!appId || f.app === appId) && (!allow || allow.has(f.app)) && f.state !== 'resolved').sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev] || b.seen - a.seen);
    return {
      connected: { github: github.configured(), llm: llm.configured() },
      cfg: S.cfg, levels: LEVELS, stages: STAGES,
      scores: scoresView(appId, allow), scanned: Object.keys(S.apps).filter((i) => !allow || allow.has(i)).length, eligible: eligible().filter((a) => !allow || allow.has(a.id)).map((a) => ({ id: a.id, name: a.name, repo: a.repo, scannedAt: S.apps[a.id]?.scannedAt || null, sha: S.apps[a.id]?.sha || null })),
      run: cur && { ...cur, stageIndex: cur.stage ? STAGES.findIndex((s) => s.id === cur.stage) : -1 },
      findings: fl.slice(0, 80).map(({ fp: _fp, ...f }) => f), openCount: fl.filter((f) => f.state === 'open').length,
      suggestions: S.suggestions.filter((s) => (!appId || s.app === appId) && (!allow || allow.has(s.app))),
      agents: AGENTS.map((a) => ({ ...a, ...(S.stats[a.id] ? { runs: S.stats[a.id].runs, pass: S.stats[a.id].runs ? +((S.stats[a.id].pass / S.stats[a.id].runs) * 100).toFixed(1) : null, last: S.stats[a.id].last } : { runs: 0, pass: null, last: null }), state: S.stats[a.id]?.runs ? 'live' : 'idle', needs: a.role === 'Fixer' || a.role === 'Reporter' || a.role === 'Advisor' ? 'llm' : null })),
      schedule: schedule(), busy: busy(), pending: S.reviews.filter((r) => r.state === 'pending' && (!allow || allow.has(r.app))).length,
    };
  }
  const reviewsList = () => S.reviews.map(({ patch: _p, files, ...r }) => ({ ...r, fileCount: files.length, add: files.reduce((s, x) => s + x.add, 0), del: files.reduce((s, x) => s + x.del, 0) }));
  const reviewGet = (id) => { const { patch: _p, ...r } = reviewOf(id); return r; };

  /* ------------------------------ config + scheduler ------------------------------ */
  function setCfg(b) {
    if (b.level !== undefined) { const l = +b.level; if (![0, 1, 2].includes(l)) throw new Error('Unknown autonomy level.'); if (l === 2 && !llm.configured()) throw new Error('Fix and report needs an AI model. Connect one first.'); S.cfg.level = l; audit(null, `Autopilot level set to ${LEVELS[l].name}`, 'info'); }
    if (b.maxAttempts !== undefined) S.cfg.maxAttempts = Math.min(5, Math.max(1, +b.maxAttempts || 3));
    if (b.scanEveryMin !== undefined) S.cfg.scanEveryMin = Math.min(1440, Math.max(30, +b.scanEveryMin || 360));
    if (Array.isArray(b.protectedPaths)) S.cfg.protectedPaths = b.protectedPaths.map((x) => String(x).trim()).filter(Boolean).slice(0, 30);
    if (b.floors && typeof b.floors === 'object') { S.cfg.floors = {}; for (const [k, v] of Object.entries(b.floors)) if (v != null && v !== '' && +v >= 0 && +v <= 100) S.cfg.floors[k] = Math.round(+v); }
    save(); return S.cfg;
  }
  function lockFloors() { const f = {}; for (const s of scoresView()) if (s.v != null) f[s.k] = Math.max(0, s.v - 2); S.cfg.floors = f; save(); return f; }

  let timer = null;
  function start() {
    // a restart loses the queue; mark anything that was mid-flight as interrupted instead of leaving it running forever
    for (const r of S.runs) if (r.state === 'running' || r.state === 'queued') { r.state = 'failed'; r.error = 'Interrupted by a restart'; r.ended = now(); }
    for (const f of S.findings) if (f.state === 'fixing') f.state = 'open';
    for (const rv of S.reviews) if (rv.state === 'deploying') rv.state = 'pending';
    save();
    timer = setInterval(() => { if (!github.configured() || busy()) return; const last = Math.max(0, ...Object.values(S.apps).map((a) => a.scannedAt || 0)); if (now() - last >= S.cfg.scanEveryMin * 60e3 && eligible().length) { try { scan(); } catch { /* retry next tick */ } } }, 60e3);
    timer.unref?.();
  }

  const pendingCount = (allow = null) => S.reviews.filter((r) => r.state === 'pending' && (!allow || allow.has(r.app))).length;
  const appOf = (kind, id) => (kind === 'review' ? S.reviews : S.findings).find((x) => x.id === id)?.app || null;
  return { appOf, view, pendingCount, reviewsList, reviewGet, scan, fix, approve, reject, requestChanges, advise, task, setCfg, lockFloors, start, stop: () => clearInterval(timer), state: () => S, dirOf, sync, workRoot };
}
