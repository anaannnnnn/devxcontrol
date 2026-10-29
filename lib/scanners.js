// Real scanners. Each runs against a checked-out clone and returns { tool, ok, ran, summary, items[], ms, tail }.
// Heavy tools run in throw-away Docker containers (no install on the host). Items: { sev: high|med|low, title, file, line, rule }.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { run } from './docker.js';

let runner = run;
export const setRunner = (fn) => { runner = fn; };

const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', '__pycache__', '.venv', 'coverage']);
const BIN = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|woff2?|ttf|otf|mp[34]|mov|lock|map|min\.js|svg)$/i;

export async function walk(dir, { max = 4000, maxBytes = 500_000 } = {}) {
  const out = [];
  async function rec(d, rel) {
    if (out.length >= max) return;
    let ents; try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= max) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) await rec(path.join(d, e.name), r); }
      else if (e.isFile()) { const st = await fsp.stat(path.join(d, e.name)).catch(() => null); if (st && st.size <= maxBytes) out.push({ path: r, size: st.size }); }
    }
  }
  await rec(dir, '');
  return out;
}

const dk = (dir, image, cmd, { user = '1000:1000', rw = false, env = {}, timeout = 600000, mem = '1g' } = {}) => runner('docker', [
  'run', '--rm', '--user', user, '--memory', mem, '--cpus', '1', '--pids-limit', '512',
  '-v', `${dir}:/src${rw ? '' : ':ro'}`, '-w', '/src', '-e', 'HOME=/tmp', '-e', 'npm_config_cache=/tmp/.npm',
  ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), image, ...cmd,
], { timeout });

const tailOf = (s, n = 40) => String(s).trim().split('\n').slice(-n).join('\n');
const done = (tool, t0, o) => ({ tool, ran: true, ms: Date.now() - t0, items: [], ok: true, summary: '', ...o });
const skipped = (tool, why) => ({ tool, ran: false, ok: true, items: [], summary: why, ms: 0 });

/* ---------------- tests ---------------- */
export async function detectTestCmd(dir) {
  try {
    const pkg = JSON.parse(await fsp.readFile(path.join(dir, 'package.json'), 'utf8'));
    const t = pkg.scripts?.test;
    if (t && !/no test specified/.test(t)) return { kind: 'node', cmd: t };
  } catch { /* no package.json */ }
  if (fs.existsSync(path.join(dir, 'requirements.txt')) && (fs.existsSync(path.join(dir, 'tests')) || fs.existsSync(path.join(dir, 'test')))) return { kind: 'python', cmd: 'pytest -q' };
  return null;
}

export async function testScan(dir) {
  const t0 = Date.now(); const d = await detectTestCmd(dir);
  if (!d) return skipped('tests', 'No test command found (no "test" script in package.json, no pytest setup).');
  const sh = d.kind === 'node'
    ? 'if [ -f package-lock.json ]; then npm ci --no-audit --no-fund --ignore-scripts=false; else npm install --no-audit --no-fund; fi; npm test'
    : 'pip install --quiet --no-cache-dir --target /tmp/py -r requirements.txt && PYTHONPATH=/tmp/py python -m pytest -q 2>&1 || (pip install --quiet --target /tmp/py pytest && PYTHONPATH=/tmp/py python -m pytest -q)';
  const r = await dk(dir, d.kind === 'node' ? 'node:22-slim' : 'python:3.12-slim', ['sh', '-c', sh], { rw: true, timeout: 900000, mem: '1500m' });
  const out = r.out + r.err;
  const pass = +(/# pass (\d+)/.exec(out)?.[1] ?? /(\d+) passed/.exec(out)?.[1] ?? NaN), fail = +(/# fail (\d+)/.exec(out)?.[1] ?? /(\d+) failed/.exec(out)?.[1] ?? 0);
  return done('tests', t0, {
    ok: r.ok, pass: Number.isNaN(pass) ? null : pass, fail,
    summary: r.ok ? `Tests passed${Number.isNaN(pass) ? '' : ` (${pass})`}` : `Tests failed${fail ? ` (${fail} failing)` : ''}`,
    items: r.ok ? [] : [{ sev: 'high', title: `Test suite fails: ${d.cmd}`, rule: 'tests', file: '', line: 0 }], tail: tailOf(out),
  });
}

/* ---------------- dependency audit ---------------- */
export async function auditScan(dir) {
  const t0 = Date.now();
  if (!fs.existsSync(path.join(dir, 'package.json'))) return skipped('npm-audit', 'No package.json.');
  const sh = '[ -f package-lock.json ] || npm install --package-lock-only --ignore-scripts --no-audit --no-fund >/dev/null 2>&1; npm audit --json || true';
  const r = await dk(dir, 'node:22-slim', ['sh', '-c', sh], { rw: true, timeout: 300000 });
  let j; try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { return done('npm-audit', t0, { ok: false, ran: false, summary: 'Audit could not run: ' + tailOf(r.err || r.out, 3) }); }
  const sevMap = { critical: 'high', high: 'high', moderate: 'med', low: 'low', info: 'low' };
  const items = Object.values(j.vulnerabilities || {}).map((v) => ({ sev: sevMap[v.severity] || 'low', title: `Vulnerable dependency ${v.name} (${v.severity})`, rule: `audit:${v.name}`, file: 'package.json', line: 0, fixable: !!v.fixAvailable, raw: v.severity }));
  const m = j.metadata?.vulnerabilities || {};
  return done('npm-audit', t0, { ok: !items.length, summary: items.length ? `${items.length} vulnerable package${items.length > 1 ? 's' : ''}` : 'No known vulnerable dependencies', items, counts: m });
}

/* ---------------- semgrep ---------------- */
export async function semgrepScan(dir) {
  const t0 = Date.now();
  const r = await dk(dir, 'semgrep/semgrep:latest', ['semgrep', 'scan', '--config', 'p/default', '--metrics=off', '--json', '--quiet', '--timeout', '30', '--exclude', 'node_modules', '--exclude', 'vendor', '/src'], { timeout: 900000, mem: '1500m' });
  let j; try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { return done('semgrep', t0, { ok: false, ran: false, summary: 'Semgrep could not run: ' + tailOf(r.err || r.out, 3) }); }
  const sev = { ERROR: 'high', WARNING: 'med', INFO: 'low' };
  const seen = new Map();
  for (const x of j.results || []) {
    const file = String(x.path).replace(/^\/src\//, ''); const key = `${x.check_id}|${file}`;
    if (!seen.has(key)) seen.set(key, { sev: sev[x.extra?.severity] || 'low', title: String(x.extra?.message || x.check_id).split('\n')[0].slice(0, 160), rule: x.check_id, file, line: x.start?.line || 0 });
  }
  const items = [...seen.values()].slice(0, 60);
  return done('semgrep', t0, { ok: !items.length, summary: items.length ? `${items.length} code issue${items.length > 1 ? 's' : ''}` : 'No code issues found', items });
}

/* ---------------- hadolint ---------------- */
export async function hadolintScan(dir, files) {
  const t0 = Date.now();
  const dfs = files.filter((f) => /(^|\/)Dockerfile[^/]*$/.test(f.path)).slice(0, 5);
  if (!dfs.length) return skipped('hadolint', 'No Dockerfile.');
  const items = [];
  for (const f of dfs) {
    const r = await dk(dir, 'hadolint/hadolint:latest-debian', ['hadolint', '-f', 'json', `/src/${f.path}`], { timeout: 120000, user: '1000:1000' });
    let j; try { j = JSON.parse(r.out || '[]'); } catch { return done('hadolint', t0, { ok: false, ran: false, summary: 'Hadolint could not run: ' + tailOf(r.err || r.out, 3) }); }
    for (const x of j) { if (x.level === 'style') continue; items.push({ sev: x.level === 'error' ? 'med' : 'low', title: `${x.code}: ${String(x.message).slice(0, 140)}`, rule: x.code, file: f.path, line: x.line || 0 }); }
  }
  return done('hadolint', t0, { ok: !items.length, summary: items.length ? `${items.length} Dockerfile issue${items.length > 1 ? 's' : ''}` : 'Dockerfile is clean', items });
}

/* ---------------- secrets (built in) ---------------- */
const SECRET_RULES = [
  ['aws-key', /AKIA[0-9A-Z]{16}/], ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/], ['github-token', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['slack-token', /xox[baprs]-[A-Za-z0-9-]{10,}/], ['google-key', /AIza[0-9A-Za-z_-]{35}/],
  ['hardcoded-secret', /(?:api[_-]?key|secret|token|passwd|password)\s*[:=]\s*['"][A-Za-z0-9+/_\-=]{20,}['"]/i],
];
const SECRET_SKIP = /(^|\/)(\.env\.example|\.env\.sample|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|(^|\/)(tests?|__tests__|fixtures|examples?)\/|\.(test|spec)\./i;
export async function secretScan(dir, files) {
  const t0 = Date.now(); const items = [];
  for (const f of files) {
    if (BIN.test(f.path) || SECRET_SKIP.test(f.path)) continue;
    let txt; try { txt = await fsp.readFile(path.join(dir, f.path), 'utf8'); } catch { continue; }
    const lines = txt.split('\n');
    for (let i = 0; i < lines.length && items.length < 40; i++) {
      if (lines[i].length > 400) continue;
      for (const [rule, re] of SECRET_RULES) if (re.test(lines[i]) && !/(example|placeholder|your[_-]|changeme|xxxx|<.*>|process\.env|\$\{)/i.test(lines[i])) { items.push({ sev: 'high', title: `Possible secret in code (${rule})`, rule: `secret:${rule}`, file: f.path, line: i + 1, noAutofix: true }); break; }
    }
  }
  return done('secrets', t0, { ok: !items.length, summary: items.length ? `${items.length} possible secret${items.length > 1 ? 's' : ''} in code` : 'No secrets found in code', items });
}

export const SCANNERS = { tests: testScan, 'npm-audit': auditScan, semgrep: semgrepScan, hadolint: hadolintScan, secrets: secretScan };
export const SEV_RANK = { high: 3, med: 2, low: 1 };

/** Scores 0-100 from check results. null = not measured. */
export function scoreChecks(c, uptime) {
  const pen = (items, w) => Math.max(0, 100 - items.reduce((s, i) => s + (w[i.sev] || 0), 0));
  const ran = (x) => x && x.ran;
  return {
    Security: ran(c.semgrep) || ran(c.secrets) ? pen([...(c.semgrep?.items || []), ...(c.secrets?.items || [])], { high: 15, med: 5, low: 1 }) : null,
    Dependencies: ran(c['npm-audit']) ? pen(c['npm-audit'].items, { high: 12, med: 4, low: 1 }) : null,
    Tests: ran(c.tests) ? (c.tests.ok ? 100 : 0) : null,
    Infrastructure: ran(c.hadolint) ? pen(c.hadolint.items, { high: 10, med: 6, low: 2 }) : null,
    Reliability: uptime == null ? null : Math.round(uptime),
  };
}
