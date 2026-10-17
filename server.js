// DevX Control - fleet console for the DevX VPS. API is versioned under /api/v1 and documented in openapi.yaml.
import express from './lib/mini.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { docker, run, live } from './lib/docker.js';
import { loadRegistry, readEnv, maskValue } from './lib/registry.js';
import { makeAuth } from './lib/auth.js';
import { makeUsers, MIN_PASSWORD } from './lib/users.js';
import { Monitor } from './lib/monitor.js';
import { makeOps } from './lib/ops.js';
import { createJob, getJob, runningJob } from './lib/jobs.js';
import { problem, notFound, badRequest, conflict } from './lib/problem.js';
import { makeDbx } from './lib/dbx.js';
import { makeVault } from './lib/vault.js';
import { makeSettings } from './lib/settings.js';
import { makeGit } from './lib/gitx.js';
import { makeIntegrations } from './lib/integrations.js';
import { makeGithub } from './lib/github.js';
import { makeConfirm } from './lib/jarvis/confirm.js';
import { makeJarvisTools } from './lib/jarvis/tools.js';
import { makeBrain } from './lib/jarvis/brain.js';
import { makeSession as makeJarvisSession } from './lib/jarvis/session.js';
import { makeRateLimit } from './lib/jarvis/ratelimit.js';
import { buildIndex as buildKnowledge, fleetDocs } from './lib/jarvis/knowledge.js';
import { makeLlm } from './lib/llm.js';
import { makeAutopilot } from './lib/autopilot.js';
import { makeStudio } from './lib/studio.js';
import { makeRemove } from './lib/remove.js';
import { makeRoute } from './lib/route.js';
import { findBlock } from './lib/caddyfile.js';
import { makeDns } from './lib/dns.js';
import { makeOnboard } from './lib/onboard.js';
import { makeReleaseNotes } from './lib/releasenotes.js';
import { makeUpgrades } from './lib/upgrades.js';
import * as themeLib from './lib/themes.js';
import * as labLib from './lib/themelab.js';
import { makeCreator } from './lib/creator.js';
import * as designLib from './lib/designgen.js';
import * as previewLib from './lib/preview.js';
import { makeOrbit } from './lib/orbit.js';
import { makeRooms } from './lib/rooms.js';
import { ORBIT_FEATURES } from './lib/settings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const DEMO = !!env.DEMO;
const PORT = +env.PORT || 3000;
const DATA_DIR = env.DATA_DIR || path.join(here, 'data');
const APPS_DIR = env.APPS_DIR || '/home/anan/apps';
const BACKUP_DIR = env.BACKUP_DIR || path.join(DATA_DIR, 'backups');

const secret = env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!env.SESSION_SECRET) console.warn('SESSION_SECRET not set - sessions will reset on restart.');

fs.mkdirSync(DATA_DIR, { recursive: true });
const registry = loadRegistry(env.APPS_JSON || path.join(here, 'apps.json'), APPS_DIR, path.join(DATA_DIR, 'projects.json'));
if (env.SERVER_IP) registry.serverIp = env.SERVER_IP;

/* ---------------------------- alerts ---------------------------- */
async function notify(text) {
  const jobs = [];
  if (env.ALERT_WEBHOOK) jobs.push(fetch(env.ALERT_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(8000) }));
  if (env.TELEGRAM_TOKEN && env.TELEGRAM_CHAT)
    jobs.push(fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT, text: `DevX Control: ${text}` }), signal: AbortSignal.timeout(8000) }));
  await Promise.allSettled(jobs);
}

const monitor = new Monitor({ registry, docker, dataDir: DATA_DIR, notify });
const ops = makeOps({ registry, docker, monitor, backupDir: BACKUP_DIR, githubToken: env.GITHUB_TOKEN, tokenFor: (repo) => (github.configured() ? github.cloneToken(repo) : null), prepare: (a, l) => onboard.prepareRedeploy(a, l), keep: +env.BACKUP_KEEP || 14 });
const settings = makeSettings(DATA_DIR);
const vault = makeVault({ dataDir: DATA_DIR, key: env.VAULT_KEY || secret });
if (!env.VAULT_KEY && !DEMO) console.warn('VAULT_KEY not set - using SESSION_SECRET to encrypt saved credentials. Keep it stable.');
const dbx = makeDbx({ ops, dataDir: DATA_DIR, audit: (a, msg) => monitor.event('data', a.id, `${msg} (${a.name})`, 'warn') });
const gitx = makeGit({
  registry, githubToken: env.GITHUB_TOKEN, tokenFor: (repo) => (github.configured() ? github.cloneToken(repo) : null), settings,
  audit: (id, msg, level = 'info') => monitor.event('deploy', id, msg, level),
  onAutoPull: async (a) => {
    if (runningJob('redeploy', a.id)) return;
    const job = createJob('redeploy', a.id, async (log) => {
      const code = await ops.redeploy(a, log);
      monitor.event('deploy', a.id, `Auto-pull redeploy ${a.name} ${code === 0 ? 'succeeded' : 'failed'}`, code === 0 ? 'ok' : 'bad');
      await gitx.check(a).catch(() => {});
      return code;
    });
    await new Promise((r) => { job.subs.add((m) => m.done && r()); if (job.done) r(); });
  },
});
const integrations = makeIntegrations({ dataDir: DATA_DIR, key: env.VAULT_KEY || secret });
const github = makeGithub({ integrations });
const llm = makeLlm({ integrations });
const releases = makeReleaseNotes({ registry, llm, dataDir: DATA_DIR, audit: (id, msg, level = 'info') => monitor.event('release', id, msg, level) });
const autopilot = makeAutopilot({ registry, github, llm, ops, monitor, dataDir: DATA_DIR, appsDir: APPS_DIR, audit: (id, msg, level = 'info') => monitor.event('autopilot', id, msg, level), createJob, runningJob, remoteUrl: (repo) => `${env.GIT_REMOTE_BASE || 'https://github.com'}/${repo}.git` });
const upgrades = makeUpgrades({ registry, llm, dataDir: DATA_DIR, autopilot, audit: (id, msg, level = 'info') => monitor.event('autopilot', id, msg, level) });
const themes = themeLib.makeThemes({ dataDir: DATA_DIR });
const lab = labLib.makeThemeLab({ dataDir: DATA_DIR, themes });
const creator = makeCreator({ llm, dataDir: DATA_DIR, audit: (id, msg, level = 'info') => monitor.event('create', id, msg, level) });
const studio = makeStudio({ registry, github, dbx, ops, docker, autopilot });
const dns = makeDns({ integrations });
const onboard = makeOnboard({ dns, registry, github, ops, appsDir: APPS_DIR, caddyfile: env.CADDYFILE, domainSuffix: env.DOMAIN_SUFFIX || '', audit: (id, msg, level = 'info') => monitor.event('deploy', id, msg, level), autopilot, workRoot: autopilot.workRoot, dataDir: DATA_DIR, remoteBase: env.GIT_REMOTE_BASE || 'https://github.com' });
const route = makeRoute({ registry, dns, ops, caddyfile: env.CADDYFILE, audit: (id, msg, level = 'info') => monitor.event('deploy', id, msg, level) });
const removeApp = makeRemove({ registry, dns, ops, caddyfile: env.CADDYFILE, provision: onboard.provision, appsDir: APPS_DIR, monitor, audit: (id, msg, level = 'info') => monitor.event('deploy', id, msg, level) });
const seedPassword = env.INIT_PASSWORD || env.DASH_PASSWORD;
const users = makeUsers({ dataDir: DATA_DIR, seedNames: (env.INIT_USERS || 'admin').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean), seedPassword });
if (!users.count()) { console.error('No users yet. Set INIT_USERS and INIT_PASSWORD (or DASH_PASSWORD) for the first start.'); process.exit(1); }
if (!DEMO && seedPassword && seedPassword.length < MIN_PASSWORD) console.warn(`Initial password is shorter than ${MIN_PASSWORD} characters.`);
const auth = makeAuth({ secret });
const orbit = makeOrbit({ registry, settings, monitor, dbx, autopilot, llm, releases, ops, audit: (type, id, msg, level) => monitor.event(type, id, msg, level), dataDir: DATA_DIR, demo: DEMO });
const rooms = makeRooms({ dataDir: DATA_DIR });

/* ---- Jarvis (voice operator) wiring ---- */
const JARVIS_STT = env.JARVIS_STT_URL || 'http://jarvis-stt:8077';
const JARVIS_TTS = env.JARVIS_TTS_URL || 'http://jarvis-tts:8078';
const jarvisConfirm = makeConfirm({ audit: (type, id, msg, level) => monitor.event('jarvis', id, msg, level || 'warn') });
const jarvisRL = makeRateLimit({});
const jarvisSession = makeJarvisSession({});
const seenUser = (username, appId) => { const u = users.get(username); if (!u) return false; const allow = allowSet(u); return !allow || (appId != null && allow.has(appId)); };
const jarvisMonitor = {
  health: (id) => { try { const a = registry.apps.find((x) => x.id === id); return a ? (monitor.appView(a)?.status ?? null) : null; } catch { return null; } },
  incidents: (n = 8) => monitor.events.filter((e) => e.level === 'bad' || e.level === 'warn').slice(-n).reverse().map((e) => ({ app: e.app, msg: e.msg, level: e.level, t: e.t })),
};
const jarvisTools = makeJarvisTools({ registry, monitor: jarvisMonitor, ops, autopilot, confirm: jarvisConfirm, seen: seenUser });
let _kIdx = null, _kAt = 0;
const knowledgeIndex = () => {
  const t = Date.now(); if (_kIdx && t - _kAt < 60000) return _kIdx;
  const rd = (f) => { try { return fs.readFileSync(path.join(here, f), 'utf8'); } catch { return ''; } };
  const docs = fleetDocs({ registry, readme: rd('README.md'), openapi: rd('openapi.yaml'), reviews: (autopilot.reviewsList?.() || []), releaseNotes: (releases.all?.() || []) });
  _kIdx = buildKnowledge(docs); _kAt = t; return _kIdx;
};
const jarvisBrain = makeBrain({ llm, tools: jarvisTools, knowledge: { search: (q, n) => knowledgeIndex().search(q, n) }, session: jarvisSession, rateLimit: jarvisRL, settings: () => ({ name: settings.jarvisName ? settings.jarvisName() : 'Jarvis' }) });

/* ---------------------------- app ---------------------------- */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
/* ---- visual editor frame: signed short-lived link, so the sandboxed page needs no cookie. Handled before the JSON parser: any method, raw bodies. ---- */
const PREVIEW_URL = /^\/preview\/([a-z0-9-]+)\/([a-z0-9]+-[A-Za-z0-9_-]{32})(\/[^?]*)?(\?.*)?$/;
function injectUniverse(html, appRow, search) {
  const u = new URLSearchParams(String(search || '').replace(/^\?/, '')).get('u');
  if (!u || !settings.orbit(appRow.id).universes) return html;
  const css = orbit.universeCss(appRow.id, u);
  if (!css || !/<\/head>/i.test(html)) return html;
  return html.replace(/<\/head>/i, `<style data-devx-universe="${u.replace(/[^a-z]/g, '')}">${css}</style></head>`);
}
const readRaw = (req, max) => new Promise((ok, no) => { const c = []; let n = 0; req.on('data', (d) => { n += d.length; if (n > max) { no(new Error('too large')); req.destroy(); } else c.push(d); }); req.on('end', () => ok(Buffer.concat(c))); req.on('error', no); });
const previewHandler = async (req, res, next) => {
  const m = PREVIEW_URL.exec(req.url); if (!m) return next();
  const [, id, tok, rest = '', search = ''] = m; const p = rest || '/';
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*', 'Access-Control-Max-Age': '600' };
  res.set({ ...cors, 'Content-Security-Policy': "sandbox allow-scripts allow-forms allow-modals; frame-ancestors 'self'", 'X-Frame-Options': 'SAMEORIGIN', 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  const a = registry.byId.get(id);
  if (!a || !previewLib.verify(secret, a.id, tok)) return res.status(403).type('text/plain').send('This preview link has expired. Reopen the editor.');
  if (!previewLib.pathOk(p)) return res.status(400).type('text/plain').send('Bad path');
  const base = `/preview/${a.id}/${tok}`;
  try {
    if (DEMO) { if (p !== '/' && !/^\/(menu|contact)$/.test(p)) return res.status(404).type('text/plain').send('Not found'); return res.type('html').send(injectUniverse(previewLib.rewriteHtml(previewLib.DEMO_PAGE, base, { real: p }), a, search)); }
    const up = previewLib.upstreamOf(a); if (!up) return res.status(502).type('text/plain').send('No address for this app');
    const hasBody = !['GET', 'HEAD'].includes(req.method); const body = hasBody ? await readRaw(req, 2 * 1024 * 1024) : undefined;
    const headers = { 'user-agent': 'DevX-Control-Preview/1.0', accept: req.headers.accept || '*/*', origin: up, referer: `${up}${p}` };
    for (const k of ['content-type', 'accept-language', 'x-requested-with', 'authorization', 'x-csrf-token']) if (req.headers[k]) headers[k] = req.headers[k];
    const ck = previewLib.jarGet(tok); if (ck) headers.cookie = ck;
    const r = await fetch(`${up}${p}${search}`, { method: req.method === 'HEAD' ? 'GET' : req.method, body, redirect: 'manual', signal: AbortSignal.timeout(15000), headers });
    previewLib.jarSet(tok, r.headers.getSetCookie?.());
    if (r.status >= 300 && r.status < 400) { const loc = r.headers.get('location') || '/'; let next2; try { const u = new URL(loc, up); next2 = u.origin === new URL(up).origin || /^\//.test(loc) ? `${base}${u.pathname}${u.search}` : `${base}/`; } catch { next2 = `${base}/`; } return res.status(r.status === 301 || r.status === 308 ? 302 : r.status === 307 ? 307 : 303 === r.status ? 303 : 302).set('Location', next2).end(); }
    const ct = r.headers.get('content-type') || 'application/octet-stream'; const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return res.status(413).type('text/plain').send('Too large');
    res.status(r.status).set('Content-Type', ct);
    if (req.method === 'HEAD') return res.end();
    if (/text\/html/i.test(ct)) {
      let html = previewLib.rewriteHtml(buf.toString('utf8'), base, { real: `${p}${search}` });
      html = injectUniverse(html, a, search);
      return res.send(html);
    }
    if (/text\/css/i.test(ct)) return res.send(previewLib.rewriteCss(buf.toString('utf8'), base));
    return res.send(buf);
  } catch (e) { return res.status(502).type('text/plain').send(`Could not load the page: ${e.cause?.code || e.message || e.name}`); }
};
app.use(previewHandler);

app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => { if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store'); next(); });

app.get('/healthz', (req, res) => res.json({ ok: true, lastTick: monitor.lastTick }));

const api = express.Router();
app.use('/api/v1', api);

/* ---- session ---- */
const cookieFlags = (req) => `Path=/; HttpOnly; SameSite=Strict${req.secure ? '; Secure' : ''}`;
api.get('/session', (req, res) => {
  const s = auth.verify(auth.parseCookies(req.headers.cookie).dc_s);
  const u = s ? users.get(s.u) : null;
  res.json({ authenticated: !!(s && u), user: s?.u || null, role: u?.role || null, access: u?.access || null, apps: u?.apps || [], csrf: s?.csrf || null, demo: DEMO });
});
api.post('/session', (req, res) => {
  const { username, password, code } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 64 || password.length > 256) return badRequest(res, 'Enter your username and password.');
  const name = username.trim().toLowerCase();
  const wait = Math.max(auth.throttle(`ip:${req.ip}`), auth.throttle(`u:${name}`));
  if (wait) { res.set('Retry-After', String(wait)); return problem(res, 429, 'too-many-attempts', 'Too many attempts', `Try again in ${Math.ceil(wait / 60)} minute(s).`); }
  const r = users.verify(name, password, code);
  if (!r.ok) {
    auth.fail(`ip:${req.ip}`); auth.fail(`u:${name}`);
    monitor.event('auth', null, `Failed sign-in for "${name.slice(0, 32)}" from ${req.ip}`, 'bad');
    return problem(res, 401, 'invalid-credentials', 'Sign-in failed', r.needCode ? 'Enter the 6-digit code from your authenticator app.' : 'Username, password or code is incorrect.');
  }
  auth.clear(`ip:${req.ip}`); auth.clear(`u:${name}`);
  const { token, csrf } = auth.issue(r.name);
  res.set('Set-Cookie', `dc_s=${token}; Max-Age=${12 * 3600}; ${cookieFlags(req)}`);
  monitor.event('auth', null, `${r.name} signed in from ${req.ip}`, 'info');
  res.status(201).json({ csrf, user: r.name });
});
api.delete('/session', (req, res) => { res.set('Set-Cookie', `dc_s=; Max-Age=0; ${cookieFlags(req)}`); res.status(204).end(); });

api.use(auth.middleware);

/* ---- who may touch what ----
   admin: everything. member: only the projects they were given; read-only unless "operate"; never the server, connections,
   vault, onboarding, database contents or user management. Enforced here, so the UI hiding things is only a courtesy. */
const MEMBER_BLOCKED = [/^\/(connections|setup|github|dns|host|onboard|users|credentials|creator)(\/|$)/, /^\/autopilot\/(config|floors)/, /^\/updates\/check$/, /^\/apps\/[^/]+\/(db|credentials|secrets|route)(\/|$)/, /^\/reviews\/[^/]+\/(approve|reject|changes)$/];
const MEMBER_ACTIONS = [/^\/apps\/[^/]+\/(start|stop|restart|redeploy|backup|git\/check|settings)$/, /^\/containers\/[^/]+\/(start|stop|restart)$/, /^\/autopilot\/(scan|advise|tasks)$/, /^\/autopilot\/findings\/[^/]+\/fix$/];
// POSTs that only compute something (no change to any app or setting), so read-only members may use them too
const READ_POSTS = [/^\/design\/component$/, /^\/apps\/[^/]+\/(view-token|design\/code)$/];
const allowSet = (u) => (u.role === 'admin' ? null : new Set(u.apps));
const seen = (req, appId) => !req.allow || (appId != null && req.allow.has(appId));
api.use((req, res, next) => {
  const u = users.get(me(req));
  if (!u) { res.set('Set-Cookie', `dc_s=; Max-Age=0; ${cookieFlags(req)}`); return problem(res, 401, 'signed-out', 'Signed out', 'This account no longer exists.'); }
  req.user = u; req.allow = allowSet(u);
  if (u.role === 'admin') return next();
  const p = req.path; const hidden = () => notFound(res, 'Not found');
  if (/^\/(account|session)(\/|$)/.test(p) || p === '/fleet' || p === '/events' || p === '/updates' || p === '/backups' || p === '/autopilot' || p === '/reviews' || /^\/jobs\//.test(p)) {
    if (req.method !== 'GET' && !/^\/(account|session)/.test(p)) return problem(res, 403, 'read-only', 'Not allowed', 'Your account cannot do that.');
  } else {
    if (MEMBER_BLOCKED.some((r) => r.test(p))) return problem(res, 403, 'forbidden', 'Not allowed', 'Only an admin can do that.');
    if (req.method !== 'GET' && !READ_POSTS.some((r) => r.test(p)) && !(u.access === 'operate' && MEMBER_ACTIONS.some((r) => r.test(p)))) return problem(res, 403, 'read-only', 'Not allowed', u.access === 'operate' ? 'Only an admin can do that.' : 'Your account can view this project but not change it.');
  }
  let m;
  if ((m = /^\/(?:apps|studio)\/([^/]+)/.exec(p)) && !seen(req, m[1])) return hidden();
  if ((m = /^\/orbit\/apps\/([^/]+)/.exec(p)) && !seen(req, m[1])) return hidden();
  if (p.startsWith('/orbit') && req.method !== 'GET') return problem(res, 403, 'forbidden', 'Not allowed', 'Only an admin can change Orbit.');
  if ((m = /^\/reviews\/([^/]+)/.exec(p)) && !seen(req, autopilot.appOf('review', m[1]))) return hidden();
  if ((m = /^\/autopilot\/findings\/([^/]+)/.exec(p)) && !seen(req, autopilot.appOf('finding', m[1]))) return hidden();
  if ((m = /^\/containers\/([^/]+)/.exec(p)) && !seen(req, registry.containerOwner.get(decodeURIComponent(m[1])))) return hidden();
  if ((m = /^\/jobs\/([^/]+)/.exec(p))) { const j = getJob(m[1]); if (!j || !seen(req, j.appId)) return hidden(); }
  if ((m = /^\/backups\/(.+)$/.exec(p)) && !seen(req, (/^(.*)-\d{8}-\d{6}\./.exec(m[1]) || [])[1])) return hidden();
  if (/^\/autopilot\/(scan|advise|tasks)$/.test(p) && !seen(req, req.body?.app)) return problem(res, 403, 'forbidden', 'Not allowed', 'Choose one of your projects.');
  if (req.query?.app && !seen(req, req.query.app)) return hidden();
  next();
});

/* ---- account ---- */
const me = (req) => req.session.u;
api.get('/account', (req, res) => res.json({ ...(users.info(me(req)) || { name: me(req), twoFactor: false }), users: req.allow ? [] : users.names(), role: req.user.role, minPassword: MIN_PASSWORD }));
api.post('/account/password', (req, res) => {
  const err = users.changePassword(me(req), req.body?.current, req.body?.next);
  if (err) return problem(res, 400, 'password', 'Password not changed', err);
  monitor.event('auth', null, `${me(req)} changed their password`, 'warn'); res.json({ ok: true });
});
api.post('/account/2fa/setup', (req, res) => {
  const secret = users.startTotp(me(req));
  res.json({ secret, uri: `otpauth://totp/DevX%20Control:${encodeURIComponent(me(req))}?secret=${secret}&issuer=DevX%20Control` });
});
api.post('/account/2fa/enable', (req, res) => {
  if (!users.enableTotp(me(req), req.body?.code)) return problem(res, 400, 'code', 'Code did not match', 'Check the 6-digit code in your authenticator app and try again.');
  monitor.event('auth', null, `${me(req)} turned on two-step sign-in`, 'ok'); res.json({ ok: true });
});
api.delete('/account/2fa', (req, res) => {
  if (!users.disableTotp(me(req), req.body?.password)) return problem(res, 400, 'password', 'Password incorrect', 'Enter your current password to turn off two-step sign-in.');
  monitor.event('auth', null, `${me(req)} turned off two-step sign-in`, 'warn'); res.json({ ok: true });
});

/* ---- helpers ---- */
const getApp = (req, res) => {
  const a = registry.byId.get(req.params.id);
  if (!a) notFound(res, 'App');
  return a;
};
const getContainer = (req, res) => {
  const owner = registry.containerOwner.get(req.params.name);
  if (!owner && !registry.infra.protected.includes(req.params.name)) { notFound(res, 'Container'); return null; }
  return req.params.name;
};
const audit = (type, appId, msg, level = 'info') => monitor.event(type, appId, msg, level);
const certDays = (c) => (c?.validTo ? Math.floor((c.validTo - Date.now()) / 86400e3) : null);

/* ---- fleet ---- */
api.get('/fleet', async (req, res) => {
  const apps = registry.apps.filter((a) => seen(req, a.id)).map((a) => ({ ...monitor.appView(a), behind: gitx.status(a)?.behind || 0, autoPull: settings.autoPull(a.id), hasDb: ['postgres', 'sqlite'].includes(a.db?.type) }));
  const count = (s) => apps.filter((a) => a.status === s).length;
  const ms = apps.map((a) => a.ms).filter((v) => v != null);
  const days = apps.flatMap((a) => a.checks.map((c) => certDays(c.cert))).filter((d) => d != null);
  const host = req.allow ? null : await ops.hostInfo().catch(() => null);
  res.json({
    now: Date.now(), lastTick: monitor.lastTick, dockerError: monitor.error, demo: DEMO,
    summary: {
      total: apps.length, healthy: count('healthy'), degraded: count('degraded') + count('crashing'), down: count('down'), stopped: count('stopped'),
      reviews: autopilot.pendingCount(req.allow),
      avgMs: ms.length ? Math.round(ms.reduce((s, v) => s + v, 0) / ms.length) : null,
      cpu: +apps.reduce((s, a) => s + a.cpu, 0).toFixed(1), mem: apps.reduce((s, a) => s + a.mem, 0),
      nextCertDays: days.length ? Math.min(...days) : null,
      containers: { running: apps.reduce((s, a) => s + a.containers.filter((c) => c.state === 'running').length, 0), total: apps.reduce((s, a) => s + a.containers.length, 0) },
    },
    apps, host,
  });
});

/* ---- app detail ---- */
const gitCache = new Map();
async function gitInfo(a) {
  const hit = gitCache.get(a.id);
  if (hit && Date.now() - hit.t < 60000) return hit.v;
  let v = null;
  if (DEMO) v = { branch: 'main', commit: 'a1b2c3d', subject: 'Fix gold ingest rounding', when: new Date(Date.now() - 36 * 3600e3).toISOString(), dirty: false };
  else if (fs.existsSync(path.join(a.path, '.git'))) {
    const [l, b, s] = await Promise.all([
      run('git', ['-C', a.path, 'log', '-1', '--format=%h|%s|%cI']),
      run('git', ['-C', a.path, 'rev-parse', '--abbrev-ref', 'HEAD']),
      run('git', ['-C', a.path, 'status', '--porcelain']),
    ]);
    if (l.ok) { const [commit, subject, when] = l.out.trim().split('|'); v = { branch: b.out.trim(), commit, subject, when, dirty: !!s.out.trim() }; }
  }
  gitCache.set(a.id, { t: Date.now(), v });
  return v;
}

api.get('/apps/:id', async (req, res) => {
  const a = getApp(req, res); if (!a) return;
  const envList = DEMO
    ? (a.envFile ? [{ key: 'PORT', value: '3000', sensitive: false }, { key: 'JWT_SECRET', value: 'demo-secret-value', sensitive: true }, { key: 'DATABASE_URL', value: 'postgres://u:p@db:5432/x', sensitive: true }] : [])
    : readEnv(a.envPath);
  res.json({
    ...monitor.appView(a),
    dir: a.dir, composeDir: a.path, git: await gitInfo(a), update: gitx.status(a), autoPull: settings.autoPull(a.id), hasDb: ['postgres', 'sqlite'].includes(a.db?.type),
    vault: req.allow ? [] : vault.list(a.id),
    logins: (a.logins || []).map((l, i) => ({ index: i, label: l.label, user: l.user, weak: !!l.weak, hasSecret: !!(l.pass || l.env) })),
    env: { file: a.envFile || null, readable: envList !== null, vars: (envList || []).map((e) => ({ key: e.key, sensitive: e.sensitive, value: e.sensitive ? maskValue(e.value) : e.value })) },
  });
});

api.post('/apps/:id/secrets/reveal', (req, res) => {
  const a = getApp(req, res); if (!a) return;
  const { type, index, key } = req.body || {};
  let value = null;
  if (type === 'login' && Number.isInteger(index) && a.logins?.[index]) {
    const l = a.logins[index];
    value = l.pass ?? (DEMO ? 'demo-password' : readEnv(a.envPath)?.find((e) => e.key === l.env)?.value ?? null);
  } else if (type === 'env' && typeof key === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    value = DEMO ? 'demo-secret-value' : readEnv(a.envPath)?.find((e) => e.key === key)?.value ?? null;
  } else if (type === 'vault' && typeof req.body.id === 'string') {
    value = vault.reveal(a.id, req.body.id);
    if (value === undefined) return notFound(res, 'Credential');
    if (value === null) return problem(res, 500, 'vault-key', 'Could not decrypt', 'The vault key changed. Restore the previous VAULT_KEY or SESSION_SECRET.');
    audit('secret', a.id, `Revealed ${vault.label(a.id, req.body.id)} for ${a.name}`, 'warn');
    return res.json({ value });
  } else return badRequest(res, 'Specify type "login" with index, "env" with key, or "vault" with id.');
  if (value == null) return notFound(res, 'Secret');
  audit('secret', a.id, `Revealed ${type === 'env' ? key : a.logins[index].label} for ${a.name}`, 'warn');
  res.json({ value });
});

api.get('/apps/:id/history', (req, res) => {
  const a = getApp(req, res); if (!a) return;
  const w = { '1h': 3600e3, '6h': 6 * 3600e3, '12h': 12 * 3600e3 }[req.query.window || '1h'];
  if (!w) return badRequest(res, 'window must be 1h, 6h or 12h.');
  res.json(monitor.history(a.id, w));
});

api.get('/apps/:id/data', async (req, res) => {
  const a = getApp(req, res); if (!a) return;
  res.json({ info: await ops.dataInfo(a), backups: (await ops.listBackups()).filter((b) => b.app === a.id).slice(0, 10) });
});


/* ---- credentials you create ---- */
const vaultBody = (req, res, fn) => { try { return fn(); } catch (e) { badRequest(res, e.message); return undefined; } };
api.get('/credentials', (req, res) => res.json({ data: vault.list() }));
api.get('/apps/:id/credentials', (req, res) => { const a = getApp(req, res); if (a) res.json({ data: vault.list(a.id) }); });
api.post('/apps/:id/credentials', (req, res) => {
  const a = getApp(req, res); if (!a) return;
  const c = vaultBody(req, res, () => vault.create(a.id, req.body || {})); if (!c) return;
  audit('secret', a.id, `Saved credential "${c.label}" for ${a.name}`, 'info'); res.status(201).json(c);
});
api.put('/apps/:id/credentials/:cid', (req, res) => {
  const a = getApp(req, res); if (!a) return;
  const c = vaultBody(req, res, () => vault.update(a.id, req.params.cid, req.body || {}));
  if (c === undefined) return;
  if (c === null) return notFound(res, 'Credential');
  audit('secret', a.id, `Edited credential "${c.label}" for ${a.name}`, 'info'); res.json(c);
});
api.delete('/apps/:id/credentials/:cid', (req, res) => {
  const a = getApp(req, res); if (!a) return;
  const label = vault.label(a.id, req.params.cid);
  if (!vault.remove(a.id, req.params.cid)) return notFound(res, 'Credential');
  audit('secret', a.id, `Deleted credential "${label}" for ${a.name}`, 'warn'); res.status(204).end();
});


/* ---- release notes ---- */
api.get('/apps/:id/releases', (req, res) => { const a = getApp(req, res); if (!a) return; res.json({ notes: releases.list(a.id), ai: llm.configured(), publicPath: `/whatsnew/${a.id}` }); });
api.post('/apps/:id/releases/generate', async (req, res) => {
  const a = getApp(req, res); if (!a) return;
  try { res.status(201).json(await releases.generate(a, { useAi: req.body?.useAi !== false })); }
  catch (e) { return problem(res, e.status || 500, 'release-notes', 'Could not write release notes', e.message); }
});
api.put('/apps/:id/releases/:nid', (req, res) => { const a = getApp(req, res); if (!a) return; const n = releases.update(a.id, req.params.nid, req.body || {}); if (!n) return notFound(res, 'Release note'); audit('release', a.id, `${n.published ? 'Published' : 'Edited'} release notes "${n.title}" for ${a.name}`, 'info'); res.json(n); });
api.delete('/apps/:id/releases/:nid', (req, res) => { const a = getApp(req, res); if (!a) return; if (!releases.remove(a.id, req.params.nid)) return notFound(res, 'Release note'); res.status(204).end(); });

/* ---- upgrade suggestions ---- */
api.get('/apps/:id/upgrades', (req, res) => { const a = getApp(req, res); if (!a) return; res.json({ ...upgrades.get(a.id), ai: llm.configured(), canApply: !!a.repo || !!process.env.DEMO }); });
api.post('/apps/:id/upgrades/scan', async (req, res) => {
  const a = getApp(req, res); if (!a) return;
  try { res.json({ ...(await upgrades.scan(a, { useAi: req.body?.useAi !== false })), ai: llm.configured(), canApply: !!a.repo || !!process.env.DEMO }); }
  catch (e) { return problem(res, e.status || 500, 'upgrades', 'Could not scan for upgrades', e.message); }
});
api.post('/apps/:id/upgrades/:sid/apply', async (req, res) => {
  const a = getApp(req, res); if (!a) return;
  try { const it = await upgrades.apply(a, req.params.sid); if (!it) return notFound(res, 'Suggestion'); res.status(202).json(it); }
  catch (e) { return problem(res, e.status || 500, 'upgrades', 'Could not start this upgrade', e.message); }
});
api.post('/apps/:id/upgrades/:sid/dismiss', (req, res) => { const a = getApp(req, res); if (!a) return; const it = upgrades.dismiss(a.id, req.params.sid, req.body?.undo !== true); if (!it) return notFound(res, 'Suggestion'); res.json(it); });

/* ---- themes ---- */
api.get('/themes', (req, res) => res.json({ themes: themes.list(), assignments: themes.assignments(), fonts: themeLib.FONT_KEYS }));
api.post('/themes', (req, res) => { try { const t = themes.create(req.body || {}); audit('theme', null, `Theme "${t.name}" created`, 'info'); res.status(201).json({ ...t, report: themeLib.report(t) }); } catch (e) { return badRequest(res, e.message); } });
api.delete('/themes/:tid', (req, res) => { const t = themes.get(req.params.tid); if (!t) return notFound(res, 'Theme'); if (t.builtin) return conflict(res, 'Built-in themes cannot be deleted.'); themes.remove(t.id); res.status(204).end(); });
api.get('/apps/:id/theme', (req, res) => { const a = getApp(req, res); if (!a) return; res.json({ theme: themes.assigned(a.id), canApply: !!a.repo || !!process.env.DEMO }); });
const resolveTheme = (id, accent) => { const t = lab.find(String(id || '')); if (!t) return null; return /^#[0-9a-f]{6}$/i.test(accent || '') ? { ...t, accent: labLib.ensureContrast(accent.toLowerCase(), t.bg, 3) } : t; };
const STRENGTHS = ['soft', 'full', 'total'];
api.get('/themes/lab', (req, res) => { const q = req.query; res.json({ ...lab.browse({ q: String(q.q || '').slice(0, 60), mode: ['dark', 'light'].includes(q.mode) ? q.mode : '', pack: String(q.pack || '').slice(0, 40), offset: Math.max(0, +q.offset || 0), limit: Math.min(120, +q.limit || 60) }), sources: lab.status(), genStyles: labLib.GEN_STYLES }); });
api.get('/themes/lab/stylesheets', (req, res) => res.json({ stylesheets: labLib.STYLESHEETS }));
api.post('/themes/lab/sources/:src/refresh', async (req, res) => { try { const r = await lab.refresh(req.params.src, { force: true }); res.json({ count: r.items.length, at: r.at }); } catch (e) { return problem(res, e.status || 502, 'theme-source', 'Could not load that library', e.message); } });
api.get('/themes/lab/generate', (req, res) => { const t = labLib.generate({ hue: +req.query.hue || 0, style: String(req.query.style || 'soft'), mode: req.query.mode === 'light' ? 'light' : 'dark' }); res.json({ ...t, report: themeLib.report(t) }); });
api.get('/apps/:id/theme/preview', (req, res) => {
  const a = getApp(req, res); if (!a) return; const q = req.query; const sheet = q.stylesheet ? lab.stylesheet(String(q.stylesheet)) : null;
  if (sheet) return res.json({ stylesheet: sheet.href, css: '', js: '' });
  const t = resolveTheme(q.theme, q.accent); if (!t) return notFound(res, 'Theme'); const strength = STRENGTHS.includes(q.strength) ? q.strength : 'full';
  res.json({ css: labLib.toCssFull(t, { strength }), js: strength === 'total' ? labLib.recolorJs(t) : '', theme: { id: t.id, name: t.name, mode: t.mode, bg: t.bg, surface: t.surface, text: t.text, muted: t.muted, accent: t.accent }, report: themeLib.report(t) });
});
api.post('/apps/:id/theme/apply', async (req, res) => {
  const a = getApp(req, res); if (!a) return; const b = req.body || {}; const strength = STRENGTHS.includes(b.strength) ? b.strength : 'full';
  let name, assets, explain;
  try {
    if (b.stylesheet) {
      const s = lab.stylesheet(String(b.stylesheet)); if (!s) return notFound(res, 'Stylesheet');
      if (process.env.DEMO) { name = s.name; assets = [{ name: 'devx-theme.css', content: '/* demo */' }]; } else {
        const r = await fetch(s.href, { signal: AbortSignal.timeout(20000) }); if (!r.ok) return problem(res, 502, 'theme', 'Could not download that stylesheet', `The library answered ${r.status}.`);
        const css = await r.text(); if (css.length > 800000) return badRequest(res, 'That stylesheet is too large.'); name = s.name; assets = [{ name: 'devx-theme.css', content: `/* ${s.name} from ${s.href} */\n${css}` }];
      }
      explain = `Added the ${name} stylesheet as devx-theme.css, linked last in every page.`;
    } else {
      const t = resolveTheme(b.theme, b.accent); if (!t) return notFound(res, 'Theme'); name = t.name;
      assets = [{ name: 'devx-theme.css', content: labLib.toCssFull(t, { strength }) }]; if (strength === 'total') assets.push({ name: 'devx-theme.js', content: labLib.recolorJs(t) });
      explain = `Applied the ${t.name} theme (${strength}) to the whole project with devx-theme.css${strength === 'total' ? ' and devx-theme.js' : ''}.`;
      themes.assign(a.id, t.id);
    }
    const run = process.env.DEMO ? { id: 'demo-run' } : await autopilot.task(a.id, `Apply the "${name}" theme to the whole project`, 'Adds a stylesheet linked last in every page. No layout, text or behaviour changes.', '', { assets, explain, report: { title: `Apply the "${name}" theme`, summary: explain, cause: 'You chose a new look for the project.', frontend: ['Colors, fonts, buttons, tables, forms and cards follow the new theme on every page.'], backend: ['No change.'], risk: 'low' } });
    audit('theme', a.id, `Theme "${name}" (${strength}) sent to Autopilot for ${a.name}`, 'info'); res.status(202).json({ ok: true, run: run?.id || null });
  } catch (e) { return problem(res, e.status || 500, 'theme', 'Could not start the restyle', e.message); }
});

/* ---- design code generator + visual editor ---- */
api.get('/design/components', (req, res) => res.json({ components: Object.entries(designLib.COMPONENTS).map(([id, c]) => ({ id, label: c.label })), formats: designLib.FORMATS, themes: themes.all().map(({ id, name, mode }) => ({ id, name, mode })) }));
api.post('/design/component', (req, res) => {
  const b = req.body || {}; const t = lab.find(String(b.theme || 'deep-space'));
  if (!t) return notFound(res, 'Theme');
  try { res.json(designLib.component(String(b.component || ''), String(b.format || 'html'), t, { text: b.text })); } catch (e) { return badRequest(res, e.message); }
});
api.post('/apps/:id/view-token', (req, res) => {
  const a = getApp(req, res); if (!a) return;
  const p = String(req.body?.path || '/'); if (!previewLib.pathOk(p)) return badRequest(res, 'That page path is not allowed.');
  if (!process.env.DEMO && !previewLib.upstreamOf(a)) return conflict(res, 'This app has no address the editor can load.');
  const base = `/preview/${a.id}/${previewLib.mint(secret, a.id)}`; res.json({ base, url: `${base}${p === '/' ? '' : p}` });
});
api.get('/apps/:id/pages', async (req, res) => { const a = getApp(req, res); if (!a) return; if (process.env.DEMO) return res.json({ pages: ['/', '/menu', '/contact'] }); const up = previewLib.upstreamOf(a); if (!up) return res.json({ pages: ['/'] }); try { res.json({ pages: await previewLib.discoverPages(up) }); } catch { res.json({ pages: ['/'] }); } });
api.post('/apps/:id/design/code', (req, res) => { const a = getApp(req, res); if (!a) return; try { res.json(designLib.editsToCode(req.body?.edits)); } catch (e) { return badRequest(res, e.message); } });
api.post('/apps/:id/design/apply', async (req, res) => {
  const a = getApp(req, res); if (!a) return; const body = req.body || {}; let code = { css: '', tailwind: [], textChanges: [], count: 0 };
  try { if (body.edits?.length) code = designLib.editsToCode(body.edits); } catch (e) { return badRequest(res, e.message); }
  const comps = Array.isArray(body.components) ? body.components.slice(0, 20) : [];
  for (const c of comps) if (typeof c?.css !== 'string' || typeof c?.html !== 'string' || c.css.length > 60000 || c.html.length > 60000) return badRequest(res, 'A component in the request is malformed.');
  const count = code.count + comps.length; if (!count) return badRequest(res, 'There is nothing to apply yet.');
  const css = [code.css, ...comps.map((c) => c.css)].filter(Boolean).join('\n\n');
  const det = { assets: css ? [{ name: 'devx-edits.css', content: `/* visual edits - generated by DevX Control */\n${css}\n` }] : [], replacements: comps.filter((c) => c.from && c.from.length >= 8).map((c) => ({ from: String(c.from).slice(0, 20000), to: c.html })), explain: `${count} visual change${count === 1 ? '' : 's'} applied with devx-edits.css${comps.length ? ' and section replacements' : ''}.`,
    report: { title: `Apply ${count} visual change${count === 1 ? '' : 's'}`, summary: 'Changes you made in the visual editor, applied exactly as previewed.', cause: 'You edited the look in the visual editor.', frontend: ['The edited elements look like they did in the preview.'], backend: ['No change.'], risk: 'low' } };
  if (code.textChanges.length) { if (!llm.configured()) { if (!det.assets.length && !det.replacements.length) return conflict(res, 'Changing text in the source needs an AI model (Connections). Style changes do not.'); det.explain += ' Text changes were left out because no AI model is connected.'; } else { det.textNote = code.textChanges.map((t) => `${t.selector}: "${t.before}" -> "${t.after}"`).join('\n'); } }
  try {
    const hasDet = det.assets.length || det.replacements.length;
    const run = process.env.DEMO ? { id: 'demo-run' } : hasDet ? await autopilot.task(a.id, `Apply ${count} visual change${count === 1 ? '' : 's'} to the site`, 'Exact changes are in the specification.', '', det) : null;
    if (det.textNote && !process.env.DEMO) { const r2 = await Promise.resolve().then(() => autopilot.task(a.id, 'Change visible text from the visual editor', 'Only the text, nothing else.', `Find each element in the source and change only its visible text:\n${det.textNote}`)).catch(() => null); if (!run) return res.status(202).json({ ok: true, run: r2?.id || null, count }); }
    audit('design', a.id, `${count} visual changes sent to Autopilot for ${a.name}`, 'info'); res.status(202).json({ ok: true, run: run?.id || null, count });
  } catch (e) { return problem(res, e.status || 500, 'design', 'Could not start the change', e.message); }
});

/* ---- database explorer ---- */
const dbRoute = (fn) => async (req, res) => {
  const a = getApp(req, res); if (!a) return;
  try { await fn(a, req, res); }
  catch (e) { if (e.name === 'DbError' || e instanceof dbx.DbError) return problem(res, e.status || 400, 'database', 'Database request failed', e.message); throw e; }
};
const dbFile = (req) => (typeof req.query.file === 'string' ? req.query.file : req.body?.file);
api.get('/apps/:id/db/tables', dbRoute(async (a, req, res) => res.json(await dbx.overview(a, dbFile(req)))));
api.get('/apps/:id/db/tables/:table', dbRoute(async (a, req, res) => res.json(await dbx.browse(a, req.params.table, req.query, dbFile(req)))));
api.get('/apps/:id/db/tables/:table/export.csv', dbRoute(async (a, req, res) => {
  const csv = await dbx.csv(a, req.params.table, dbFile(req));
  audit('data', a.id, `Exported ${req.params.table} as CSV (${a.name})`, 'warn');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${a.id}-${req.params.table.replace(/[^\w.-]/g, '_')}.csv"` }).send(csv);
}));
api.post('/apps/:id/db/tables/:table/rows', dbRoute(async (a, req, res) => { await dbx.insert(a, req.params.table, req.body?.values || {}, dbFile(req)); res.status(201).json({ ok: true }); }));
api.put('/apps/:id/db/tables/:table/rows', dbRoute(async (a, req, res) => { await dbx.update(a, req.params.table, req.body?.key, req.body?.set, dbFile(req)); res.json({ ok: true }); }));
api.post('/apps/:id/db/tables/:table/rows/delete', dbRoute(async (a, req, res) => { await dbx.remove(a, req.params.table, req.body?.key, dbFile(req)); res.json({ ok: true }); }));
api.get('/apps/:id/db/tables/:table/structure', dbRoute(async (a, req, res) => res.json(await dbx.structure(a, req.params.table, dbFile(req)))));
api.post('/apps/:id/db/schema', dbRoute(async (a, req, res) => res.json(await dbx.schemaChange(a, req.body || {}, dbFile(req)))));
api.get('/apps/:id/db/schema/history', dbRoute(async (a, req, res) => res.json({ history: await dbx.schemaHistory(a) })));
api.post('/apps/:id/db/schema/undo', dbRoute(async (a, req, res) => res.json(await dbx.schemaRollback(a, req.body?.id, dbFile(req)))));
api.post('/apps/:id/db/query', dbRoute(async (a, req, res) => res.json(await dbx.query(a, req.body?.sql, req.body?.write === true, dbFile(req)))));

/* ---- GitHub updates + auto-pull ---- */
const updateRow = (a) => ({ id: a.id, name: a.name, repo: a.repo || null, group: a.group, autoPull: settings.autoPull(a.id), update: gitx.status(a) });
api.get('/updates', (req, res) => {
  const rows = registry.apps.filter((a) => seen(req, a.id)).map(updateRow);
  rows.sort((x, y) => Date.parse(y.update?.remote?.when || y.update?.local?.when || 0) - Date.parse(x.update?.remote?.when || x.update?.local?.when || 0));
  res.json({ data: rows, autoPullInterval: +env.GIT_CHECK_MIN || 5 });
});
api.post('/updates/check', async (req, res) => { await gitx.checkAll(); audit('deploy', null, 'Checked GitHub for updates', 'info'); res.json({ ok: true }); });
api.post('/apps/:id/git/check', async (req, res) => { const a = getApp(req, res); if (!a) return; await gitx.check(a); res.json(updateRow(a)); });
api.put('/apps/:id/settings', (req, res) => {
  const a = getApp(req, res); if (!a) return;
  if (typeof req.body?.autoPull !== 'boolean') return badRequest(res, 'autoPull must be true or false.');
  settings.setAutoPull(a.id, req.body.autoPull);
  audit('deploy', a.id, `Auto-pull ${req.body.autoPull ? 'enabled' : 'disabled'} for ${a.name}`, 'info');
  res.json({ autoPull: settings.autoPull(a.id) });
});

/* ---- lifecycle ---- */
api.post('/apps/:id/:action(start|stop|restart)', async (req, res) => {
  const a = getApp(req, res); if (!a) return;
  const { action } = req.params;
  const results = await ops.appAction(a, action);
  const failed = results.filter((r) => !r.ok);
  audit('action', a.id, `${action[0].toUpperCase()}${action.slice(1)} ${a.name}${failed.length ? ` (${failed.length} failed)` : ''}`, failed.length ? 'bad' : 'info');
  res.status(failed.length === results.length ? 502 : 200).json({ action, results });
});

api.post('/containers/:name/:action(start|stop|restart)', async (req, res) => {
  const name = getContainer(req, res); if (!name) return;
  if (registry.infra.protected.includes(name)) return conflict(res, `${name} is protected and cannot be controlled from here.`);
  const r = await docker.action(name, req.params.action);
  audit('action', registry.containerOwner.get(name), `${req.params.action} container ${name}`, r.ok ? 'info' : 'bad');
  if (!r.ok) return problem(res, 502, 'docker-error', 'Docker refused', (r.err || '').trim().slice(0, 300));
  monitor.tick().catch(() => {});
  res.json({ name, action: req.params.action });
});

/* ---- logs ---- */
api.get('/containers/:name/logs', async (req, res) => {
  const name = getContainer(req, res); if (!name) return;
  const tail = Math.min(2000, Math.max(10, parseInt(req.query.tail, 10) || 200));
  res.type('text/plain').send(await docker.logs(name, tail));
});
function sse(req, res) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  return { send, end: () => clearInterval(ping) };
}
api.get('/containers/:name/stream', (req, res) => {
  const name = getContainer(req, res); if (!name) return;
  const s = sse(req, res);
  const proc = docker.logStream(name, (chunk) => s.send('log', chunk), () => { s.end(); res.end(); });
  req.on('close', () => { s.end(); proc.kill(); });
});

/* ---- jobs ---- */
function startJob(kind, runner) {
  return (req, res) => {
    const a = getApp(req, res); if (!a) return;
    if (runningJob(kind, a.id)) return conflict(res, `A ${kind} for ${a.name} is already running.`);
    const job = createJob(kind, a.id, async (log) => {
      const code = await runner(a, log);
      if (kind === 'redeploy') gitx.check(a).catch(() => {});
      audit(kind, a.id, `${kind[0].toUpperCase()}${kind.slice(1)} ${a.name} ${code === 0 ? 'succeeded' : 'failed'}`, code === 0 ? 'ok' : 'bad');
      return code;
    });
    audit(kind, a.id, `Started ${kind} for ${a.name}`);
    res.status(202).set('Location', `/api/v1/jobs/${job.id}`).json({ job: job.id });
  };
}
api.post('/apps/:id/redeploy', startJob('redeploy', (a, log) => ops.redeploy(a, log)));
api.post('/apps/:id/backup', startJob('backup', (a, log) => ops.backup(a, log)));
api.get('/jobs/:id/stream', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return notFound(res, 'Job');
  const s = sse(req, res);
  job.lines.forEach((line) => s.send('line', line));
  if (job.done) { s.send('done', { code: job.code }); s.end(); return res.end(); }
  const fn = (m) => { if (m.line) s.send('line', m.line); if (m.done) { s.send('done', { code: m.code }); s.end(); res.end(); } };
  job.subs.add(fn);
  req.on('close', () => { job.subs.delete(fn); s.end(); });
});

/* ---- backups ---- */
api.get('/backups', async (req, res) => {
  const all = (await ops.listBackups()).filter((b) => seen(req, b.app));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const start = Math.max(0, parseInt(req.query.cursor, 10) || 0);
  const data = all.slice(start, start + limit);
  const more = start + limit < all.length;
  res.json({ data, pagination: { next_cursor: more ? String(start + limit) : null, has_more: more }, totalBytes: all.reduce((s, b) => s + b.size, 0), dir: ops.backupDir });
});
api.get('/backups/:name', (req, res) => {
  const p = ops.backupPath(req.params.name);
  if (!p || !fs.existsSync(p)) return notFound(res, 'Backup');
  audit('backup', null, `Downloaded ${req.params.name}`, 'info');
  res.download(p);
});
api.delete('/backups/:name', (req, res) => {
  const p = ops.backupPath(req.params.name);
  if (!p || !fs.existsSync(p)) return notFound(res, 'Backup');
  fs.unlinkSync(p);
  audit('backup', null, `Deleted ${req.params.name}`, 'warn');
  res.status(204).end();
});

/* ---- events ---- */
api.get('/events', (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const before = parseInt(req.query.before, 10) || Infinity;
  const app_ = req.query.app;
  const list = monitor.events.filter((e) => e.id < before && (!app_ || e.app === app_) && (!req.allow || seen(req, e.app))).slice(-limit).reverse();
  res.json({ data: list, pagination: { next_cursor: list.length === limit ? String(list.at(-1).id) : null, has_more: list.length === limit } });
});

/* ---- host ---- */
api.get('/host', async (req, res) => res.json(await ops.hostInfo()));
api.post('/host/caddy/:op(validate|reload)', async (req, res) => {
  const r = await ops.caddy[req.params.op]();
  audit('host', null, `Caddy ${req.params.op} ${r.ok ? 'ok' : 'failed'}`, r.ok ? 'info' : 'bad');
  res.status(r.ok ? 200 : 422).json({ ok: r.ok, output: (r.out + r.err).slice(-1500) });
});
api.post('/host/prune-images', async (req, res) => {
  const r = await ops.pruneImages();
  audit('host', null, 'Pruned unused images', 'info');
  res.json({ ok: r.ok, output: (r.out + r.err).slice(-600) });
});
api.post('/host/test-alert', async (req, res) => {
  await notify('Test alert from DevX Control');
  res.json({ sent: !!(env.ALERT_WEBHOOK || (env.TELEGRAM_TOKEN && env.TELEGRAM_CHAT)) });
});


/* ---- connections: GitHub App + AI model ---- */
const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { const st = e.status && e.status >= 400 && e.status < 600 ? e.status : 502; problem(res, st === 401 ? 502 : st, e.code || 'failed', 'That did not work', e.message); } };


/* ---- users (admin only; the middleware above already blocks members) ---- */
const validApps = () => new Set(registry.apps.map((a) => a.id));
api.get('/users', (req, res) => res.json({ data: users.list(), apps: registry.apps.map((a) => ({ id: a.id, name: a.name, repo: a.repo || null, group: a.group || null })) }));
api.post('/users', (req, res) => {
  try { const r = users.create(req.body || {}, validApps()); audit('settings', null, `${me(req)} created user ${r.name}`, 'warn'); res.status(201).json(r); } catch (e) { badRequest(res, e.message); }
});
api.put('/users/:name', (req, res) => {
  try { users.update(req.params.name, req.body || {}, validApps()); audit('settings', null, `${me(req)} changed access for ${req.params.name}`, 'warn'); res.json({ ok: true }); } catch (e) { badRequest(res, e.message); }
});
api.post('/users/:name/reset', (req, res) => {
  try { const r = users.resetPassword(req.params.name); audit('settings', null, `${me(req)} reset the password for ${r.name}`, 'warn'); res.json(r); } catch (e) { badRequest(res, e.message); }
});
api.delete('/users/:name', (req, res) => {
  if (req.params.name === me(req)) return badRequest(res, 'You cannot remove your own account.');
  try { users.remove(req.params.name); audit('settings', null, `${me(req)} removed user ${req.params.name}`, 'warn'); res.status(204).end(); } catch (e) { badRequest(res, e.message); }
});

/* ---- first-run setup ---- */
const SETUP_FILE = path.join(DATA_DIR, 'setup.json');
const SETUP_IMAGES = ['node:22-slim', 'python:3.12-slim', 'semgrep/semgrep:latest', 'hadolint/hadolint:latest-debian'];
const setupDone = () => { try { return !!JSON.parse(fs.readFileSync(SETUP_FILE, 'utf8')).done; } catch { return false; } };
api.get('/setup', wrap(async (req, res) => {
  const have = await Promise.all(SETUP_IMAGES.map((i) => run('docker', ['image', 'inspect', '-f', '{{.Id}}', i]).then((r) => r.code === 0).catch(() => false)));
  const info = users.info(me(req));
  res.json({
    show: !setupDone(),
    defaultPassword: !!seedPassword && users.usesPassword(me(req), seedPassword),
    twoFactor: !!info?.twoFactor,
    scanners: { have: have.filter(Boolean).length, total: SETUP_IMAGES.length },
    github: integrations.github() ? true : false,
    ai: llm.configured(),
    dns: { cloudflare: !!integrations.dns().cloudflare, godaddy: !!integrations.dns().godaddy },
    job: runningJob('setup-images', 'host')?.id || null,
  });
}));
api.post('/setup/scanners', wrap(async (req, res) => {
  if (runningJob('setup-images', 'host')) return conflict(res, 'Already downloading.');
  const job = createJob('setup-images', 'host', async (log) => {
    for (const img of SETUP_IMAGES) {
      log(`$ docker pull ${img}`);
      const code = await new Promise((r) => live('docker', ['pull', img], { onData: log, onClose: r }));
      if (code !== 0) return 1;
    }
    audit('settings', null, 'Downloaded scanner images', 'ok'); return 0;
  });
  res.status(202).json({ job: job.id });
}));
api.post('/setup/password', (req, res) => {
  if (!seedPassword || !users.usesPassword(me(req), seedPassword)) return problem(res, 409, 'not-default', 'Already changed', 'Your password is not the default one any more. Change it from Account.');
  const next = crypto.randomBytes(18).toString('base64url');
  users.setPassword(me(req), next);
  monitor.event('auth', null, `${me(req)} replaced the default password`, 'warn');
  res.json({ password: next });
});
api.post('/setup/dismiss', (req, res) => {
  fs.writeFileSync(SETUP_FILE, JSON.stringify({ done: true, by: me(req), at: Date.now() }), { mode: 0o600 });
  res.json({ ok: true });
});

api.get('/connections', wrap(async (req, res) => {
  const [gh, host] = await Promise.all([github.status(), ops.hostInfo().catch(() => null)]);
  res.json({ ...integrations.pub(), githubStatus: gh, ollama: { installed: !!monitor.containers.ollama, state: monitor.containers.ollama?.state || null }, memTotal: host?.memTotal || null, presets: [
    { id: 'ollama', name: 'Ollama on this server', baseUrl: 'http://ollama:11434/v1', model: 'qwen2.5-coder:7b', key: false, note: 'Free and private. Needs about 6 GB of free RAM for the 7B model.' },
    { id: 'groq', name: 'Groq (free tier)', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', key: true, note: 'Free key from console.groq.com. Fast and strong.' },
    { id: 'xai', name: 'Grok (xAI)', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini', key: true, note: 'Key from console.x.ai. Press Test, then pick any model your account lists.' },
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', key: true, note: 'Key from platform.openai.com.' },
    { id: 'anthropic', name: 'Claude (Anthropic)', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5', key: true, note: 'Key from console.anthropic.com. Uses Anthropic OpenAI-compatible endpoint.' },
    { id: 'gemini', name: 'Google Gemini (free tier)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', key: true, note: 'Free key from aistudio.google.com.' },
    { id: 'openrouter', name: 'OpenRouter (free models)', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat-v3-0324:free', key: true, note: 'Free key from openrouter.ai. Free models are rate limited.' },
  ] });
}));
api.put('/connections/github', wrap(async (req, res) => { try { integrations.setGithub(req.body || {}); } catch (e) { return badRequest(res, e.message); } audit('settings', null, 'GitHub App credentials saved', 'info'); res.json(await github.status()); }));
api.post('/connections/github/installation', wrap(async (req, res) => { const id = String(req.body?.id || ''); if (!/^\d+$/.test(id)) return badRequest(res, 'Pick an installation.'); integrations.setInstallation(id); res.json(await github.status()); }));
api.delete('/connections/github', (req, res) => { integrations.clearGithub(); audit('settings', null, 'GitHub App disconnected', 'warn'); res.status(204).end(); });
api.put('/connections/llm', wrap(async (req, res) => { try { integrations.setLlm(req.body || {}); } catch (e) { return badRequest(res, e.message); } audit('settings', null, `AI model set to ${req.body.model}`, 'info'); res.json(integrations.pub().llm); }));
api.put('/connections/dns/:provider', wrap(async (req, res) => {
  const p = req.params.provider; if (!['cloudflare', 'godaddy'].includes(p)) return notFound(res);
  const before = integrations.dns()[p];
  try { integrations.setDns(p, req.body || {}); } catch (e) { return badRequest(res, e.message); }
  const r = await dns.domains();
  if (r.errors[p]) { if (before) integrations.setDns(p, p === 'cloudflare' ? { token: before.token } : before); else integrations.clearDns(p); return badRequest(res, r.errors[p]); }
  audit('settings', null, `${p} connected (${r.domains.filter((d) => d.provider === p).length} domains)`, 'ok'); res.json(r);
}));
api.delete('/connections/dns/:provider', (req, res) => { integrations.clearDns(req.params.provider); audit('settings', null, `${req.params.provider} disconnected`, 'warn'); res.status(204).end(); });
api.get('/apps/:id/route', wrap(async (req, res) => { const a = getApp(req, res); if (a) res.json(await route.diagnose(a)); }));
api.post('/apps/:id/route', wrap(async (req, res) => {
  const a = getApp(req, res); if (!a) return;
  try { res.json(await route.apply(a, { domain: req.body?.domain, port: req.body?.port, replace: !!req.body?.replace })); }
  catch (e) { problem(res, e.status || 500, e.code || 'route-failed', 'Route not changed', e.message, { code: e.code }); }
}));
api.delete('/apps/:id', wrap(async (req, res) => {
  const a = getApp(req, res); if (!a) return;
  if (!a.onboarded) return conflict(res, 'Only apps added through Onboard can be deleted here.');
  if (req.body?.confirm !== a.id) return badRequest(res, 'Type the app id to confirm.');
  if (runningJob('delete', a.id)) return conflict(res, 'Already deleting.');
  const job = createJob('delete', a.id, (log) => removeApp(a, { data: !!req.body?.data, dns: !!req.body?.dns, folder: req.body?.folder !== false }, log));
  res.status(202).json({ job: job.id });
}));
api.get('/dns/domains', wrap(async (req, res) => res.json({ ...(await dns.domains()), serverIp: registry.serverIp })));
api.delete('/connections/llm', (req, res) => { integrations.clearLlm(); res.status(204).end(); });
api.post('/connections/llm/test', wrap(async (req, res) => res.json(await llm.test())));
api.get('/connections/llm/models', wrap(async (req, res) => res.json({ models: await llm.models() })));
api.post('/connections/ollama/install', wrap(async (req, res) => {
  const model = String(req.body?.model || 'qwen2.5-coder:7b'); if (!/^[\w.:/-]{2,60}$/.test(model)) return badRequest(res, 'Bad model name.');
  if (runningJob('ollama', 'host')) return conflict(res, 'Ollama is already being set up.');
  const job = createJob('ollama', 'host', async (log) => {
    const sh = (args, t) => new Promise((r) => live('docker', args, { onData: log, onClose: r }));
    if (!monitor.containers.ollama) { log('$ docker run ollama/ollama'); if (await sh(['run', '-d', '--name', 'ollama', '--restart', 'unless-stopped', '--network', 'web', '-v', 'ollama:/root/.ollama', 'ollama/ollama']) !== 0) return 1; await new Promise((r) => setTimeout(r, 4000)); }
    log(`$ ollama pull ${model} (this can take several minutes)`);
    if (await sh(['exec', 'ollama', 'ollama', 'pull', model]) !== 0) return 1;
    integrations.setLlm({ baseUrl: 'http://ollama:11434/v1', model }); log(`AI model set to ${model} on this server.`);
    audit('settings', null, `Installed Ollama with ${model}`, 'ok'); return 0;
  });
  res.status(202).json({ job: job.id });
}));
api.get('/github/repos', wrap(async (req, res) => res.json({ data: await github.repos() })));
api.get('/github/branches', wrap(async (req, res) => { const r = String(req.query.repo || ''); if (!/^[\w.-]+\/[\w.-]+$/.test(r)) return badRequest(res, 'Bad repo.'); res.json({ data: await github.branches(r) }); }));

/* ---- autopilot + reviews ---- */
api.get('/autopilot', (req, res) => res.json(autopilot.view(req.query.app || null, req.allow)));
api.post('/autopilot/scan', wrap(async (req, res) => { if (!github.configured()) return conflict(res, 'Connect GitHub first (Connections).'); const r = autopilot.scan(req.body?.app || null); audit('autopilot', req.body?.app || null, 'Scan started', 'info'); res.status(202).json({ run: r.id }); }));
api.post('/autopilot/findings/:id/fix', wrap(async (req, res) => { const r = autopilot.fix(req.params.id); res.status(202).json({ run: r.id }); }));
api.put('/autopilot/config', wrap(async (req, res) => { try { res.json(autopilot.setCfg(req.body || {})); } catch (e) { badRequest(res, e.message); } }));
api.post('/autopilot/floors/lock', (req, res) => res.json(autopilot.lockFloors()));
api.post('/autopilot/advise', wrap(async (req, res) => { const r = autopilot.advise(req.body?.app); res.status(202).json({ run: r.id }); }));
api.post('/autopilot/tasks', wrap(async (req, res) => { const r = autopilot.task(req.body?.app, req.body?.title, req.body?.detail); res.status(202).json({ run: r.id }); }));
api.get('/reviews', (req, res) => res.json({ data: autopilot.reviewsList().filter((r) => seen(req, r.app)) }));
api.get('/reviews/:id', wrap(async (req, res) => res.json(autopilot.reviewGet(req.params.id))));
api.post('/reviews/:id/approve', wrap(async (req, res) => {
  const before = autopilot.reviewGet(req.params.id);
  const r = autopilot.approve(req.params.id);
  try { orbit.brainRemember(before); } catch { /* brain is best-effort and never blocks an approval */ }
  audit('autopilot', null, `${req.params.id} approved by ${me(req)}`, 'info');
  res.status(202).json({ run: r.id });
}));
api.post('/reviews/:id/reject', wrap(async (req, res) => res.json(autopilot.reject(req.params.id, req.body?.note))));
api.post('/reviews/:id/changes', wrap(async (req, res) => { const r = autopilot.requestChanges(req.params.id, req.body?.note); res.status(202).json({ run: r.id }); }));

/* ---- Jarvis (voice operator) ---- */
const jarvisSid = (req) => req.session.csrf || me(req);

api.get('/jarvis/state', (req, res) => res.json({ ...jarvisRL.state(), name: 'Jarvis' }));

api.post('/jarvis/ask', async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text) return badRequest(res, 'Say something first.');
  try {
    res.json(await jarvisBrain.respond({ text, user: me(req), sessionId: jarvisSid(req) }));
  } catch (e) {
    if (e.code === 'no-llm') return res.json({ say: 'I can read your fleet status, but no AI model is connected yet. Add one in Connections.', pending: null, sources: [] });
    problem(res, e.status || 500, 'jarvis', 'Jarvis had a problem', String(e.message || e).slice(0, 200));
  }
});

api.post('/jarvis/confirm/:id', async (req, res) => {
  const peek = jarvisConfirm.get(req.params.id);
  if (!peek) return conflict(res, 'That confirmation has expired. Ask me again.');
  if (peek.tier >= 2) { // consequential: re-authenticate
    const v = users.verify(me(req), req.body?.password, req.body?.code);
    if (!v.ok) return problem(res, 403, 'reauth', v.needCode ? 'Code needed' : 'Re-authentication failed', v.needCode ? 'Enter your 2FA code to confirm this.' : 'That password was not right.');
  }
  const out = await jarvisTools.execute(req.params.id, { user: me(req), session: jarvisSid(req) });
  if (!out.ok) return problem(res, out.status || 409, 'jarvis', 'Could not run that', out.error);
  res.json(out);
});

api.post('/jarvis/kill', (req, res) => { if (req.user.role !== 'admin') return problem(res, 403, 'forbidden', 'Not allowed', 'Only an admin.'); jarvisRL.setKill(req.body?.on !== false); res.json(jarvisRL.state()); });
api.post('/jarvis/readonly', (req, res) => { if (req.user.role !== 'admin') return problem(res, 403, 'forbidden', 'Not allowed', 'Only an admin.'); jarvisRL.setReadOnly(req.body?.on !== false); res.json(jarvisRL.state()); });

api.get('/jarvis/voices', async (_req, res) => { try { const r = await fetch(`${JARVIS_TTS}/voices`, { signal: AbortSignal.timeout(5000) }); res.json(await r.json()); } catch { res.json({ voices: [], error: 'The voice service is not reachable.' }); } });

api.post('/jarvis/speak', async (req, res) => {
  const text = String(req.body?.text || '').slice(0, 2000); if (!text) return badRequest(res, 'No text to speak.');
  try {
    const r = await fetch(`${JARVIS_TTS}/speak`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice: req.body?.voice, fx: req.body?.fx, lang: req.body?.lang || 'en', speed: req.body?.speed }), signal: AbortSignal.timeout(60000) });
    if (!r.ok) return problem(res, 502, 'tts', 'Voice error', (await r.text()).slice(0, 160));
    res.set('Content-Type', 'audio/wav'); res.set('Cache-Control', 'no-store'); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { problem(res, 502, 'tts', 'Voice service unreachable', String(e.message || e).slice(0, 160)); }
});

api.post('/jarvis/stt', async (req, res) => {
  try {
    const audio = await readRaw(req, 6 * 1024 * 1024);
    if (!audio.length) return badRequest(res, 'No audio received.');
    const qs = new URLSearchParams({ lang: String(req.query?.lang || ''), prompt: registry.apps.map((a) => a.name).join(' ').slice(0, 300) }).toString();
    const r = await fetch(`${JARVIS_STT}/transcribe?${qs}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: audio, signal: AbortSignal.timeout(120000) });
    if (!r.ok) return problem(res, 502, 'stt', 'Transcription error', (await r.text()).slice(0, 160));
    res.json(await r.json());
  } catch (e) { problem(res, e.status || 502, 'stt', 'Speech service unreachable', String(e.message || e).slice(0, 160)); }
});

/* ---- studio ---- */
api.get('/studio/:id/tree', wrap(async (req, res) => res.json(await studio.tree(req.params.id))));
api.get('/studio/:id/file', wrap(async (req, res) => res.json(await studio.file(req.params.id, String(req.query.path || '')))));
api.get('/studio/:id/stores', wrap(async (req, res) => res.json({ data: await studio.stores(req.params.id) })));
api.get('/studio/:id/schema', wrap(async (req, res) => res.json(await studio.schema(req.params.id, req.query.file))));
api.get('/studio/:id/drift', wrap(async (req, res) => res.json(await studio.drift(req.params.id, req.query.file))));
api.get('/studio/:id/transforms', wrap(async (req, res) => res.json({ data: await studio.transforms(req.params.id) })));

/* ---- onboard ---- */
api.post('/onboard/scan', wrap(async (req, res) => res.json(await onboard.scan(String(req.body?.repo || '').trim()))));
api.post('/onboard/deploy', wrap(async (req, res) => {
  const b = req.body || {}; if (!b.id) return badRequest(res, 'Give the project an id.');
  if (runningJob('onboard', b.id)) return conflict(res, 'Already deploying.');
  const job = createJob('onboard', b.id, async (log) => { try { return await onboard.deploy(b, log); } catch (e) { log(`error: ${e.message}`); return 1; } });
  res.status(202).json({ job: job.id });
}));

/* ---- AI app creator ---- */
const DRAFT_ID = /^[a-z0-9][a-z0-9-]{1,29}$/;
api.get('/creator', wrap(async (req, res) => res.json({ templates: Object.entries(creator.TEMPLATES).map(([id, t]) => ({ id, label: t.label, note: t.note })), drafts: await creator.drafts(), starters: creator.STARTERS, ai: llm.configured() || !!process.env.DEMO })));
api.post('/creator/generate', wrap(async (req, res) => {
  const b = req.body || {}; const id = b.id ? String(b.id) : '';
  if (id && (!DRAFT_ID.test(id) || registry.byId.has(id))) return badRequest(res, registry.byId.has(id) ? `An app called ${id} already exists.` : 'The id must be 2-30 lowercase letters, numbers or dashes.');
  if (runningJob('create', id || 'new')) return conflict(res, 'An app is already being written.');
  const job = createJob('create', id || 'new', async (log) => { try { const r = await creator.generate({ spec: b.spec, template: b.template, id: id || undefined, starter: b.starter ? String(b.starter) : undefined, name: b.name ? String(b.name).slice(0, 60) : undefined }, log); log(`DRAFT:${r.id}`); return 0; } catch (e) { log(`error: ${e.message}`); return 1; } });
  res.status(202).json({ job: job.id });
}));
api.get('/creator/drafts/:id', wrap(async (req, res) => { if (!DRAFT_ID.test(req.params.id)) return notFound(res, 'Draft'); const d = await creator.draft(req.params.id); if (!d) return notFound(res, 'Draft'); res.json(d); }));
api.delete('/creator/drafts/:id', wrap(async (req, res) => { if (!DRAFT_ID.test(req.params.id)) return notFound(res, 'Draft'); await creator.discard(req.params.id); res.status(204).end(); }));
api.post('/creator/drafts/:id/deploy', wrap(async (req, res) => {
  const id = req.params.id; if (!DRAFT_ID.test(id)) return notFound(res, 'Draft'); const m = await creator.draft(id); if (!m) return notFound(res, 'Draft');
  if (registry.byId.has(id)) return conflict(res, `An app called ${id} already exists.`);
  if (runningJob('onboard', id)) return conflict(res, 'Already deploying.');
  const b = req.body || {}; const cfg = { id, name: String(b.name || m.name).slice(0, 60), group: String(b.group || 'Created').slice(0, 30), domain: String(b.domain || '').trim().toLowerCase(), localDir: creator.dirOf(id), scan: creator.scanFor(m), port: creator.scanFor(m).port };
  const job = createJob('onboard', id, async (log) => { try { const code = await onboard.deploy(cfg, log); if (code === 0) await creator.discard(id); return code; } catch (e) { log(`error: ${e.message}`); return 1; } });
  audit('create', id, `Deploying AI-created app ${cfg.name}`, 'info'); res.status(202).json({ job: job.id });
}));

/* ---- Orbit (feature switches default off) ---- */
const orbitErr = (res, e) => problem(res, e.status || 500, 'orbit', 'Orbit request failed', e.message || 'The request failed.');
const orbitApp = (req, res) => { const a = getApp(req, res); return a || null; };
api.get('/orbit/flags', (req, res) => {
  const apps = registry.apps.filter((a) => seen(req, a.id)).map((a) => ({ id: a.id, name: a.name, flags: settings.orbit(a.id) }));
  res.json({ features: ORBIT_FEATURES, apps });
});
api.put('/orbit/apps/:id/flags', (req, res) => {
  const a = orbitApp(req, res); if (!a) return;
  const body = req.body || {};
  const patch = {};
  for (const k of ORBIT_FEATURES) if (typeof body[k] === 'boolean') patch[k] = body[k];
  for (const k of ['rollbackErrorPct', 'rollbackP95Ms', 'watchMin', 'minSamples']) if (body[k] != null) patch[k] = body[k];
  if (typeof body.giftAllowSchema === 'boolean') patch.giftAllowSchema = body.giftAllowSchema;
  if (typeof body.giftAllowAuth === 'boolean') patch.giftAllowAuth = body.giftAllowAuth;
  if (Array.isArray(body.sensitiveColumns)) patch.sensitiveColumns = body.sensitiveColumns;
  if (Array.isArray(body.autoApply)) patch.autoApply = body.autoApply.filter((x) => x === 'debt');
  const flags = settings.setOrbit(a.id, patch);
  audit('orbit', a.id, `Orbit switches updated for ${a.name}`, 'info');
  res.json({ id: a.id, flags });
});
api.get('/orbit/apps/:id/debt', (req, res) => { const a = orbitApp(req, res); if (!a) return; res.json(orbit.debtGet(a.id) || { report: null }); });
api.post('/orbit/apps/:id/debt/scan', async (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json(await orbit.debtScan(a)); } catch (e) { orbitErr(res, e); } });
api.post('/orbit/apps/:id/debt/normalise', async (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.status(202).json(await orbit.debtAdopt(a)); } catch (e) { orbitErr(res, e); } });
api.post('/orbit/apps/:id/debt/undo', (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json(orbit.debtUndo(a)); } catch (e) { orbitErr(res, e); } });
api.get('/orbit/apps/:id/dna', (req, res) => { const a = orbitApp(req, res); if (!a) return; res.json(orbit.dnaGet(a.id) || { result: null }); });
api.post('/orbit/apps/:id/dna/scan', async (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json(await orbit.dnaScan(a)); } catch (e) { orbitErr(res, e); } });
api.put('/orbit/apps/:id/dna', async (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json(await orbit.dnaCorrect(a, String(req.body?.type || ''))); } catch (e) { orbitErr(res, e); } });
api.post('/orbit/apps/:id/dna/draft', async (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.status(202).json(await orbit.dnaDraft(a, String(req.body?.feature || ''))); } catch (e) { orbitErr(res, e); } });
api.get('/orbit/apps/:id/proving', (req, res) => { const a = orbitApp(req, res); if (!a) return; res.json({ run: orbit.provingGet(a.id) }); });
api.post('/orbit/apps/:id/proving', async (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.status(202).json(await orbit.provingStart(a, Array.isArray(req.body?.paths) ? req.body.paths : ['/'])); } catch (e) { orbitErr(res, e); } });
api.post('/orbit/apps/:id/proving/replay', (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json(orbit.provingReplay(a, Array.isArray(req.body?.pairs) ? req.body.pairs.slice(0, 30) : [])); } catch (e) { orbitErr(res, e); } });
api.post('/orbit/apps/:id/proving/watch', (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json(orbit.provingWatch(a, req.body?.before || [], req.body?.after || [])); } catch (e) { orbitErr(res, e); } });
api.get('/orbit/personas', (req, res) => res.json({ personas: orbit.personas }));
api.get('/orbit/apps/:id/ghosts', (req, res) => { const a = orbitApp(req, res); if (!a) return; res.json(orbit.ghostGet(a.id) || { findings: null }); });
api.post('/orbit/apps/:id/ghosts', async (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json(await orbit.ghostRun(a, String(req.body?.persona || 'shopper'))); } catch (e) { orbitErr(res, e); } });
api.post('/orbit/apps/:id/ghosts/apply', async (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.status(202).json(await orbit.ghostApply(a, String(req.body?.finding || ''))); } catch (e) { orbitErr(res, e); } });
api.get('/orbit/apps/:id/universes', (req, res) => { const a = orbitApp(req, res); if (!a) return; res.json(orbit.universeGet(a.id) || { directions: null }); });
api.post('/orbit/apps/:id/universes', (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json(orbit.universeBuild(a, { keepBrand: req.body?.keepBrand !== false })); } catch (e) { orbitErr(res, e); } });
api.post('/orbit/apps/:id/universes/:uid/adopt', async (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.status(202).json(await orbit.universeAdopt(a, req.params.uid)); } catch (e) { orbitErr(res, e); } });
api.get('/orbit/apps/:id/revenue', (req, res) => { const a = orbitApp(req, res); if (!a) return; res.json({ map: orbit.revenueGet(a.id), engine: a.db?.type || null }); });
api.put('/orbit/apps/:id/revenue', (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json({ map: orbit.revenueSet(a, req.body || {}) }); } catch (e) { orbitErr(res, e); } });
api.post('/orbit/apps/:id/revenue/compute', async (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json(await orbit.revenueCompute(a)); } catch (e) { orbitErr(res, e); } });
api.get('/orbit/apps/:id/mirror', (req, res) => { const a = orbitApp(req, res); if (!a) return; res.json(orbit.mirrorGet(a.id) || { urls: [] }); });
api.put('/orbit/apps/:id/mirror', (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json({ urls: orbit.mirrorSet(a, req.body?.urls || []) }); } catch (e) { orbitErr(res, e); } });
api.post('/orbit/apps/:id/mirror/fetch', async (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json(await orbit.mirrorFetch(a)); } catch (e) { orbitErr(res, e); } });
api.get('/orbit/brain', (req, res) => { if (req.allow) return problem(res, 403, 'forbidden', 'Not allowed', 'Only an admin can read the fix library.'); res.json(orbit.brainExport()); });
api.post('/orbit/brain/match', (req, res) => { if (req.allow) return problem(res, 403, 'forbidden', 'Not allowed', 'Only an admin can read the fix library.'); res.json({ matches: orbit.brainMatch(String(req.body?.text || '')) }); });
api.delete('/orbit/brain', (req, res) => { if (req.allow) return problem(res, 403, 'forbidden', 'Not allowed', 'Only an admin can delete the fix library.'); res.json(orbit.brainDelete()); });
api.get('/orbit/apps/:id/gift', (req, res) => { const a = orbitApp(req, res); if (!a) return; res.json({ gift: orbit.giftGet(a.id) }); });
api.post('/orbit/apps/:id/gift', async (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json(await orbit.giftPrepare(a)); } catch (e) { orbitErr(res, e); } });
api.post('/orbit/apps/:id/gift/decide', (req, res) => { const a = orbitApp(req, res); if (!a) return; try { res.json(orbit.giftDecide(a, String(req.body?.decision || ''))); } catch (e) { orbitErr(res, e); } });
api.post('/orbit/talk', async (req, res) => {
  if (!req.allow) { /* admin */ } else if (req.method !== 'GET') return problem(res, 403, 'forbidden', 'Not allowed', 'Only an admin can talk to Control.');
  const known = new Map(registry.apps.filter((a) => seen(req, a.id)).map((a) => [a.id, a]));
  try {
    const r = orbit.talk(String(req.body?.text || ''), known);
    if (r.intent === 'backups') {
      const list = await ops.listBackups().catch(() => null);
      if (!list) r.answer = { measured: false, reason: 'not measured: the backup list could not be read.', source: 'ops.listBackups' };
      else {
        const visible = list.filter((b) => seen(req, b.app));
        const missing = registry.apps.filter((a) => seen(req, a.id) && !visible.some((b) => b.app === a.id)).map((a) => a.name);
        r.answer = { source: 'ops.listBackups', measured: true, backupFiles: visible.length, appsWithoutABackupFile: missing };
      }
    }
    if (r.intent === 'updates') {
      const rows = registry.apps.filter((a) => seen(req, a.id)).map((a) => ({ id: a.id, name: a.name, behind: gitx.status(a)?.behind ?? null }));
      const unknown = rows.filter((x) => x.behind == null).map((x) => x.name);
      r.answer = { source: 'git', measured: rows.some((x) => x.behind != null), reason: rows.some((x) => x.behind != null) ? null : 'not measured: GitHub status has not been checked.', rows, unknown };
    }
    res.json({ ...r, modeNote: r.mode === 'keyword' ? 'Keyword intent. No AI model was required.' : null });
  } catch (e) { orbitErr(res, e); }
});
api.post('/orbit/talk/:cid/confirm', async (req, res) => {
  try {
    const r = await orbit.talkConfirm(req.params.cid, me(req));
    if (r.intent === 'restart') {
      const a = registry.byId.get(r.app);
      const results = await ops.appAction(a, 'restart');
      audit('action', a.id, `Restart ${a.name} confirmed in Talk`, 'warn');
      return res.json({ ...r, results });
    }
    res.json(r);
  } catch (e) { orbitErr(res, e); }
});
api.get('/orbit/sky', async (req, res) => {
  const apps = registry.apps.filter((a) => seen(req, a.id) && settings.orbit(a.id).orbit);
  let backups = [];
  try { backups = await ops.listBackups(); } catch { backups = []; }
  const behind = {};
  for (const a of apps) behind[a.id] = gitx.status(a)?.behind || 0;
  const views = apps.map((a) => monitor.appView(a));
  res.json(orbit.sky(views, { events: monitor.events || [], backups, behind }));
});
api.get('/orbit/apps/:id/clients', (req, res) => { const a = orbitApp(req, res); if (!a) return; if (!settings.orbit(a.id).rooms) return orbitErr(res, Object.assign(new Error('Turn on rooms for this app under Automation.'), { status: 409 })); res.json({ clients: rooms.list(a.id), requests: rooms.requests(a.id) }); });
api.post('/orbit/apps/:id/clients', (req, res) => {
  const a = orbitApp(req, res); if (!a) return;
  if (!settings.orbit(a.id).rooms) return orbitErr(res, Object.assign(new Error('Turn on rooms for this app under Automation.'), { status: 409 }));
  try {
    const c = rooms.create({ ...req.body, appId: a.id });
    audit('orbit', a.id, `Client account ${c.user} created for ${a.name}`, 'warn');
    res.status(201).json(c);
  } catch (e) { orbitErr(res, e); }
});
api.delete('/orbit/apps/:id/clients/:cid', (req, res) => {
  const a = orbitApp(req, res); if (!a) return;
  const list = rooms.list(a.id);
  if (!list.some((c) => c.id === req.params.cid)) return notFound(res, 'Client');
  rooms.remove(req.params.cid);
  audit('orbit', a.id, `Client account removed from ${a.name}`, 'warn');
  res.status(204).end();
});
api.get('/orbit/apps/:id/report', (req, res) => {
  const a = orbitApp(req, res); if (!a) return;
  if (!settings.orbit(a.id).rooms) return orbitErr(res, Object.assign(new Error('Turn on rooms for this app under Automation.'), { status: 409 }));
  const lang = req.query.lang === 'ar' ? 'ar' : 'en';
  const notes = releases.list(a.id).filter((n) => n.published).map((n) => ({ title: n.title }));
  const g = orbit.giftGet(a.id);
  const html = rooms.monthlyHtml({ app: a, notes, gifts: g ? [{ title: g.item?.title }] : [], lang });
  res.type('html').send(html);
});
api.use((req, res) => notFound(res, 'Endpoint'));

/* ---- client portal (separate from owner sessions) ---- */
const clientApi = express.Router();
app.use('/api/client', clientApi);
const clientCookie = (req) => `Path=/; HttpOnly; SameSite=Strict${req.secure ? '; Secure' : ''}`;
clientApi.post('/session', (req, res) => {
  const c = rooms.verify(req.body?.user, req.body?.password);
  if (!c) return problem(res, 401, 'invalid-credentials', 'Sign-in failed', 'Username or password is incorrect.');
  const a = registry.byId.get(c.appId);
  if (!a || !settings.orbit(a.id).rooms) return problem(res, 403, 'forbidden', 'Not allowed', 'This client room is switched off.');
  const token = rooms.issue(c.id);
  res.set('Set-Cookie', `dc_c=${token}; Max-Age=${12 * 3600}; ${clientCookie(req)}`);
  audit('orbit', a.id, `Client ${c.user} signed in`, 'info');
  res.json({ client: c, app: { id: a.id, name: a.name } });
});
clientApi.use((req, res, next) => {
  const token = auth.parseCookies(req.headers.cookie).dc_c;
  const c = token && rooms.session(token);
  if (!c) return problem(res, 401, 'signed-out', 'Signed out', 'Sign in to your client room.');
  const a = registry.byId.get(c.appId);
  if (!a || !settings.orbit(a.id).rooms) return problem(res, 403, 'forbidden', 'Not allowed', 'This client room is switched off.');
  req.client = c; req.clientApp = a; next();
});
clientApi.delete('/session', (req, res) => { rooms.drop(auth.parseCookies(req.headers.cookie).dc_c); res.set('Set-Cookie', `dc_c=; Max-Age=0; ${clientCookie(req)}`); res.status(204).end(); });
clientApi.get('/home', (req, res) => {
  const a = req.clientApp;
  const view = monitor.appView(a);
  const notes = releases.published ? releases.published(a.id) : releases.list(a.id).filter((n) => n.published);
  const g = orbit.giftGet(a.id);
  res.json({
    client: req.client,
    app: { id: a.id, name: a.name, status: view.status, uptime24h: view.uptime24h, uptime30d: view.uptime30d },
    whatsNew: (notes || []).slice(0, 8).map((n) => ({ title: n.title, at: n.publishedAt || n.created || null })),
    gifts: g ? [{ title: g.item?.title, state: g.state, week: g.week }] : [],
    measured: { uptime24h: view.uptime24h != null, note: view.uptime24h == null ? 'Uptime is not measured yet.' : null },
  });
});
clientApi.post('/requests', (req, res) => {
  try {
    const r = rooms.requestChange(req.client, req.body?.text);
    audit('orbit', req.clientApp.id, `Client ${req.client.user} requested a change`, 'info');
    res.status(201).json(r);
  } catch (e) { orbitErr(res, e); }
});
clientApi.get('/report', (req, res) => {
  const a = req.clientApp;
  const notes = releases.list(a.id).filter((n) => n.published).map((n) => ({ title: n.title }));
  const g = orbit.giftGet(a.id);
  res.type('html').send(rooms.monthlyHtml({ app: a, notes, gifts: g ? [{ title: g.item?.title }] : [], lang: req.client.lang }));
});

/* ---- public "What's new" page (published notes only) ---- */
app.get('/whatsnew/:id', (req, res) => {
  const a = registry.byId.get(req.params.id); const notes = a ? releases.published(a.id) : [];
  if (!a || !notes.length) return res.status(404).type('text/plain').send('Not found');
  res.type('html').set('Cache-Control', 'public, max-age=300').send(releases.page(a, notes));
});

/* ---- public theme files: link them from any site, or copy them ---- */
app.get('/themes/:file', (req, res) => {
  const m = /^([a-z0-9-]+)\.(css|json|tailwind\.js)$/.exec(req.params.file || ''); const t = m && themes.get(m[1]);
  if (!t) return res.status(404).type('text/plain').send('Not found');
  const kind = m[2]; res.set('Cache-Control', 'public, max-age=300').set('Access-Control-Allow-Origin', '*');
  if (kind === 'css') return res.type('text/css').send(themeLib.toCss(t));
  if (kind === 'json') return res.type('application/json').send(themeLib.toJson(t));
  res.type('text/javascript').send(themeLib.toTailwind(t));
});

/* ---- Jarvis page: served with microphone allowed on this origin (global policy disables it) ---- */
const jarvisPage = (req, res) => {
  res.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(here, 'public/jarvis/index.html'));
};
app.get('/jarvis', jarvisPage);
app.get('/jarvis/', jarvisPage);
app.get('/jarvis/index.html', jarvisPage);

/* ---- static UI ---- */
app.use(express.static(path.join(here, 'public'), { maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('index.html')) res.set('Cache-Control', 'no-cache'); } }));
app.get('/openapi.yaml', (req, res) => res.sendFile(path.join(here, 'openapi.yaml')));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return badRequest(res, 'Body must be valid JSON.');
  console.error(err);
  problem(res, 500, 'internal', 'Something went wrong', 'The server hit an unexpected error. Check its logs.');
});

/* ---- nightly backups (idempotent: only runs if today's backup is missing) ---- */
if (env.AUTO_BACKUP !== '0') {
  const hour = env.BACKUP_HOUR != null ? +env.BACKUP_HOUR : 3;
  setInterval(async () => {
    if (new Date().getHours() !== hour) return;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const existing = await ops.listBackups();
    for (const a of registry.apps) {
      if (!['postgres', 'sqlite'].includes(a.db?.type)) continue;
      if (existing.some((b) => b.app === a.id && b.name.includes(`-${today}-`)) || runningJob('backup', a.id)) continue;
      createJob('backup', a.id, async (log) => { const c = await ops.backup(a, log); audit('backup', a.id, `Nightly backup ${a.name} ${c === 0 ? 'succeeded' : 'failed'}`, c === 0 ? 'ok' : 'bad'); if (c) notify(`Nightly backup failed for ${a.name}`); return c; });
    }
  }, 60000).unref();
}

monitor.start();
autopilot.start();
setTimeout(() => { onboard.heal((m) => console.log(m)).then((f) => f.length && console.log('Repaired placeholder settings:', JSON.stringify(f))).catch((e) => console.warn('heal failed:', e.message)); }, 20000).unref();
/** An app with a domain but no Caddy route gives visitors ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR. Add the missing route (and DNS record) on its own. */
async function healRoutes() {
  if (!env.CADDYFILE || !fs.existsSync(env.CADDYFILE)) return;
  for (const a of registry.apps.filter((x) => x.onboarded && x.urls?.[0]?.host)) {
    try {
      const q = await route.quick(a); if (!q) continue;
      if (q.hasBlock && !q.stale) continue;
      if (!q.hasBlock || q.stale) { const r = await route.apply(a, { domain: q.domain }); console.log(`${q.hasBlock ? 'Corrected' : 'Added'} the route for ${q.domain} -> ${r.upstream}`); }
    } catch (e) { console.warn(`Route for ${a.id} not changed: ${e.message}`); }
  }
}
setTimeout(() => { healRoutes().catch(() => {}); }, 40000).unref();
setInterval(() => { healRoutes().catch(() => {}); }, 600000).unref();
setInterval(() => { onboard.heal((m) => console.log(m)).catch(() => {}); }, 600000).unref();
gitx.start(+env.GIT_CHECK_MIN || 5);
setInterval(() => {
  for (const a of registry.apps) {
    if (!settings.orbit(a.id).gift) continue;
    orbit.giftPrepare(a).then((g) => { if (g?.state === 'pending' && g.item) notify(`Weekly gift for ${a.name}: ${g.item.title}. Open Orbit to approve, reject or snooze it.`); }).catch(() => {});
  }
}, 60 * 60 * 1000).unref();
const server = app.listen(PORT, () => console.log(`DevX Control on :${PORT}${DEMO ? ' (DEMO MODE)' : ''}`));
const shutdown = () => { monitor.stop(); autopilot.stop(); gitx.stop(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);

export { app, monitor, auth };
