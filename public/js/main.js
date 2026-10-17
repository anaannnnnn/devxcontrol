// App shell: auth gate, router, polling, theme, command palette wiring.
import { schemePicker, openAppearance } from './scheme-ui.js';
import { h, clear, icon, toast, fmt, $, modal } from './ui.js';
import { api, setCsrf, setUnauthHandler } from './api.js';
import { loginView } from './pages/login.js';
import { fleetPage } from './pages/fleet.js';
import { appPage } from './pages/app.js';
import { backupsPage } from './pages/backups.js';
import { activityPage } from './pages/activity.js';
import { hostPage } from './pages/host.js';
import { updatesPage } from './pages/updates.js';
import { vaultPage } from './pages/vault.js';
import { accountPage } from './pages/account.js';
import { connectionsPage } from './pages/connections.js';
import { openPalette } from './palette.js';
import { fx } from './fx.js';
import { motion } from './motion.js';
import { pipelinePage } from './pages/pipeline.js';
import { reviewsPage } from './pages/reviews.js';
import { onboardPage } from './pages/onboard.js';
import { studioPage } from './pages/studio.js';
import { createPage } from './pages/create.js';
import { designPage } from './pages/design.js';
import { maybeSetup } from './pages/setup.js';
import { usersPage } from './pages/users.js';
import { orbitPage } from './pages/orbit.js';
import { automationPage } from './pages/automation.js';

const root = document.getElementById('app');
const state = { fleet: null, page: null, session: null, timer: null, ticker: null, failures: 0 };

const NAV = [
  { path: '/', label: 'Overview', icon: 'radar', pip: 'fleet', g: 'main', match: (p) => p === '/' || p.startsWith('/app/') },
  { path: '/pipeline', label: 'Autopilot', icon: 'flow', g: 'main', match: (p) => p === '/pipeline' },
  { path: '/reviews', label: 'Reviews', icon: 'diff', pip: 'reviews', g: 'main', match: (p) => p.startsWith('/reviews') },
  { path: '/studio', label: 'Studio', icon: 'cube', g: 'main', match: (p) => p === '/studio' },
  { path: '/create', label: 'Create', icon: 'sparkle', g: 'main', match: (p) => p === '/create' },
  { path: '/design', label: 'Design', icon: 'palette', g: 'main', match: (p) => p === '/design' },
  { path: '/orbit', label: 'Orbit', icon: 'radar', g: 'main', match: (p) => p === '/orbit' || p.startsWith('/orbit/') },
  { path: '/users', label: 'Users', icon: 'user', g: 'system', note: 'Who can see which project', match: (p) => p === '/users' },
  { path: '/connections', label: 'Connections', icon: 'key', g: 'system', note: 'GitHub and AI model', match: (p) => p === '/connections' },
  { path: '/updates', label: 'Updates', icon: 'bolt', pip: 'updates', g: 'system', note: 'Pull new commits', match: (p) => p === '/updates' },
  { path: '/backups', label: 'Backups', icon: 'archive', g: 'system', note: 'Nightly copies', match: (p) => p === '/backups' },
  { path: '/vault', label: 'Vault', icon: 'lock', g: 'system', note: 'Encrypted logins', match: (p) => p === '/vault' },
  { path: '/activity', label: 'Activity', icon: 'activity', g: 'system', note: 'Audit log', match: (p) => p === '/activity' },
  { path: '/host', label: 'Server', icon: 'server', g: 'system', note: 'Caddy and TLS', match: (p) => p === '/host' },
  { path: '/account', label: 'Account', icon: 'user', g: 'system', note: 'Password and 2FA', match: (p) => p === '/account' },
  { path: '/automation', label: 'Automation', icon: 'gauge', g: 'system', note: 'Orbit switches, all off', match: (p) => p === '/automation' },
];
const ADMIN_ONLY = new Set(['/connections', '/vault', '/host', '/users', '/onboard', '/create']);
let MAIN = [], SYSTEM = [];
const me = { admin: true, operate: true };
function applyRole(s) {
  me.admin = s.role === 'admin'; me.operate = me.admin || s.access === 'operate';
  const vis = (n) => me.admin || !ADMIN_ONLY.has(n.path);
  MAIN = NAV.filter((n) => n.g === 'main' && vis(n)); SYSTEM = NAV.filter((n) => n.g === 'system' && vis(n));
}
applyRole({ role: 'admin' });
const dockList = () => ['/', '/pipeline', '/onboard', '/reviews'].filter((p) => me.admin || p !== '/onboard');
const route = () => { const p = location.hash.replace(/^#/, '') || '/'; return p.startsWith('/') ? p : '/' + p; };
const go = (p) => { if (route() === p) renderPage(); else location.hash = p; };

function theme(next) {
  const cur = document.documentElement.dataset.theme;
  const val = next || (cur === 'dark' ? 'light' : 'dark');
  document.documentElement.classList.add('theme-switching');
  document.documentElement.dataset.theme = val;
  try { localStorage.setItem('dc-theme', val); } catch { /* ignore */ }
  void document.documentElement.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('theme-switching')));
  return val;
}

async function refresh() {
  try {
    state.fleet = await api('/fleet');
    state.failures = 0;
    state.page?.update?.(state.fleet);
    paintChrome();
  } catch (e) {
    if (e.status === 401) return;
    state.failures++;
    paintChrome();
  }
}

let shell = null;
const navBtn = (n, cls = 'nv') => h('button', { class: cls, dataset: { path: n.path }, 'aria-label': n.label, onclick: () => go(n.path) }, icon(n.icon, 20), h('span', { class: 'lb' }, n.label), n.pip && h('i', { class: 'pip', dataset: { pip: n.pip }, hidden: true }));
function spaceBg() {
  return h('div', { class: 'space', 'aria-hidden': 'true' }, h('i', { class: 'neb n1' }), h('i', { class: 'neb n2' }), h('i', { class: 'stars s1' }), h('i', { class: 'stars s2' }), h('i', { class: 'stars s3' }), h('i', { class: 'planet' }));
}

// Mobile and desktop: one button opens colors, themes, kits and fine tuning.
function colorMenu() {
  const S = window.dcScheme; if (!S) return null;
  const dot = h('i', { class: 'cdot' });
  const paint = () => {
    const skin = S.getSkin?.() || { scheme: S.get() };
    const dotc = skin.scheme === 'custom' && skin.custom ? skin.custom : (S.SCHEMES[skin.scheme] || S.SCHEMES.violet).dot;
    dot.style.setProperty('--c', dotc);
  };
  const btn = h('button', { class: 'nv ico', type: 'button', 'aria-label': 'Console color, themes and kits', title: 'Console look', onclick: () => openAppearance() }, dot);
  window.addEventListener('dc:scheme', paint);
  window.addEventListener('dc:look', paint);
  paint();
  return h('div', { class: 'sys-wrap mob-only' }, btn);
}
function buildShell() {
  const live = h('div', { class: 'live', role: 'status' }, h('i'), h('span'));
  const themeBtn = h('button', { class: 'menu-row', onclick: () => { theme(); paintTheme(); } });
  let menu = null;
  const closeMenu = () => { menu?.remove(); menu = null; sysBtn.setAttribute('aria-expanded', 'false'); };
  const openMenu = () => {
    menu = h('div', { class: 'sysmenu', role: 'menu' }, h('div', { class: 'hud-eyebrow' }, 'System'),
      SYSTEM.map((n) => h('button', { class: 'menu-row', role: 'menuitem', dataset: { path: n.path }, onclick: () => { closeMenu(); go(n.path); } }, icon(n.icon, 18), h('span', {}, h('b', {}, n.label), h('small', {}, n.note)), n.pip && h('i', { class: 'pip', dataset: { pip: n.pip }, hidden: true }))),
      h('hr'), themeBtn,
      h('div', { class: 'look-block' }, h('div', { class: 'hud-eyebrow' }, 'Color'), schemePicker(), h('button', { class: 'menu-row', type: 'button', role: 'menuitem', onclick: () => { closeMenu(); openAppearance(); } }, icon('palette', 18), h('span', {}, h('b', {}, 'Themes, kits, customize'), h('small', {}, 'Component look for this console')))),
      h('button', { class: 'menu-row', role: 'menuitem', onclick: () => { closeMenu(); signOut(); } }, icon('logout', 18), h('span', {}, h('b', {}, 'Sign out'))));
    paintTheme(); sysWrap.append(menu); sysBtn.setAttribute('aria-expanded', 'true'); paintChrome();
  };
  const sysBtn = h('button', { class: 'nv', 'aria-haspopup': 'menu', 'aria-expanded': 'false', dataset: { group: 'system' }, onclick: (e) => { e.stopPropagation(); menu ? closeMenu() : openMenu(); } }, icon('grid', 20), h('span', { class: 'lb' }, 'System'), h('i', { class: 'pip', dataset: { pip: 'updates' }, hidden: true }));
  const sysWrap = h('div', { class: 'sys-wrap' }, sysBtn);
  document.addEventListener('click', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) { closeMenu(); sysBtn.focus(); } });
  const pill = h('nav', { class: 'pill', 'aria-label': 'Main' },
    h('a', { class: 'brand', href: '#/', 'aria-label': 'DevX Control home' }, h('span', { class: 'logo' }, icon('radar', 22)), h('span', { class: 'wm' }, h('b', {}, 'DEVX'), h('small', {}, 'CONTROL'))),
    h('div', { class: 'nvs' }, MAIN.map((n) => navBtn(n)), sysWrap),
    h('span', { class: 'vr' }),
    live,
    h('button', { class: 'nv ico', 'aria-label': 'Search', onclick: () => palette() }, icon('search', 19)),
    me.admin && h('button', { class: 'cta', onclick: () => go('/onboard') }, icon('plus', 16), h('span', {}, 'Onboard repo')),
    colorMenu(),
    h('button', { class: 'nv ico mob-only', 'aria-label': 'Theme', onclick: () => { theme(); paintTheme(); } }, icon('sun', 19)));
  const more = () => {
    const sec = (title, list) => [h('div', { class: 'hud-eyebrow' }, title), h('div', { class: 'sheet-grid' }, list.map((n) => h('button', { class: 'sheet-item', onclick: () => { m.close(); go(n.path); } }, icon(n.icon, 22), h('b', {}, n.label), h('small', {}, n.note || '')))) ];
    const d = h('div', { class: 'dialog sheet hud', role: 'dialog', 'aria-label': 'More' },
      ...sec('Workspace', [MAIN.find((n) => n.path === '/studio'), MAIN.find((n) => n.path === '/create'), MAIN.find((n) => n.path === '/design'), me.admin && { path: '/onboard', label: 'Onboard repo', icon: 'github', note: 'Add a project' }].filter(Boolean)),
      ...sec('System', SYSTEM),
      h('div', { class: 'sheet-foot' }, h('button', { class: 'btn', onclick: () => { m.close(); openAppearance(); } }, icon('palette', 16), 'Look'), h('button', { class: 'btn', onclick: () => { m.close(); theme(); paintTheme(); } }, icon('sun', 16), 'Theme'), h('button', { class: 'btn', onclick: () => { m.close(); signOut(); } }, icon('logout', 16), 'Sign out')));
    const m = modal(d);
  };
  const dock = h('nav', { class: 'dock', 'aria-label': 'Quick navigation' },
    dockList().map((p) => { if (p === '/onboard') return h('button', { class: 'dk fab', 'aria-label': 'Onboard repo', onclick: () => go('/onboard') }, icon('plus', 24)); return navBtn(NAV.find((n) => n.path === p), 'dk'); }),
    h('button', { class: 'dk', 'aria-label': 'More', dataset: { group: 'system' }, onclick: more }, icon('menu', 20), h('span', { class: 'lb' }, 'More')));
  const crumbs = h('div', { class: 'crumbs', 'aria-label': 'Breadcrumb' });
  const main = h('main', { id: 'main', tabindex: -1 });
  const bar = h('header', { class: 'hud-top' }, pill);
  const el = h('div', { class: 'shell' }, spaceBg(), bar, h('div', { class: 'main-col' }, crumbs, main), dock);
  const paintTheme = () => { const dark = document.documentElement.dataset.theme === 'dark'; clear(themeBtn).append(icon(dark ? 'sun' : 'moon', 18), h('span', {}, h('b', {}, dark ? 'Light theme' : 'Dark theme'))); };
  paintTheme();
  addEventListener('scroll', () => bar.classList.toggle('scrolled', scrollY > 8), { passive: true });
  return { el, rail: el, pill, dock, crumbs, live, main, paintTheme };
}

function paintChrome() {
  if (!shell) return;
  const f = state.fleet;
  const dot = shell.live;
  const age = f ? Date.now() - f.lastTick : Infinity;
  dot.classList.toggle('stale', state.failures === 0 && age > 45000);
  dot.classList.toggle('dead', state.failures >= 2);
  dot.lastChild.textContent = state.failures >= 2 ? 'Connection lost, retrying' : f?.lastTick ? `Updated ${fmt.dur(age)} ago` : 'Starting';
  const set = (k, n) => shell.el.querySelectorAll(`.pip[data-pip="${k}"]`).forEach((i) => { i.hidden = !n; i.textContent = n > 1 || k !== 'fleet' ? String(n) : ''; });
  set('fleet', f ? f.summary.down + f.summary.degraded : 0);
  set('updates', f ? f.apps.filter((a) => a.behind > 0).length : 0);
  set('reviews', f?.summary.reviews || 0);
  const p = route();
  shell.el.querySelectorAll('[data-path]').forEach((b) => { const n = NAV.find((x) => x.path === b.dataset.path); if (n.match(p)) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const inSys = SYSTEM.some((n) => n.match(p) ) || p === '/onboard' || p === '/studio' && false;
  shell.el.querySelectorAll('[data-group="system"]').forEach((b) => { if (inSys) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}

function crumbs(parts) {
  clear(shell.crumbs);
  shell.crumbs.hidden = parts.length < 2;
  if (parts.length < 2) return;
  parts.forEach((c, i) => {
    if (i) shell.crumbs.append(h('span', { class: 'sep', 'aria-hidden': 'true' }, '/'));
    shell.crumbs.append(c.href ? h('a', { href: c.href }, c.label) : h('span', { class: 'here' }, c.label));
  });
}

function renderPage() {
  if (!shell || !state.fleet) return;
  state.page?.destroy?.();
  const p = route();
  if (!me.admin && ADMIN_ONLY.has(p)) return go('/');
  const ctx = { fleet: state.fleet, go, refresh, crumbs, state, palette, me };
  let page;
  const m = /^\/app\/([a-z0-9-]+)(?:\/([a-z]+))?$/.exec(p);
  if (m) {
    const app = state.fleet.apps.find((a) => a.id === m[1]);
    if (!app) { toast('That app does not exist', 'bad'); return go('/'); }
    page = appPage({ ...ctx, id: m[1], tab: m[2] || 'overview' });
  } else if (p === '/pipeline') page = pipelinePage(ctx);
  else if (p === '/onboard') page = onboardPage(ctx);
  else if (p === '/studio') page = studioPage(ctx);
  else if (p === '/create') page = createPage(ctx);
  else if (p === '/design') page = designPage(ctx);
  else if (/^\/reviews(?:\/([A-Za-z0-9-]+))?$/.test(p)) page = reviewsPage({ ...ctx, id: /^\/reviews\/([A-Za-z0-9-]+)$/.exec(p)?.[1] });
  else if (p === '/updates') page = updatesPage(ctx);
  else if (p === '/vault') page = vaultPage(ctx);
  else if (p === '/account') page = accountPage(ctx);
  else if (p === '/connections') page = connectionsPage(ctx);
  else if (p === '/users') page = usersPage(ctx);
  else if (p === '/automation') page = automationPage(ctx);
  else if (p === '/orbit' || p.startsWith('/orbit/')) page = orbitPage({ ...ctx, section: p === '/orbit' ? 'sky' : p.slice('/orbit/'.length) });
  else if (p === '/backups') page = backupsPage(ctx);
  else if (p === '/activity') page = activityPage(ctx);
  else if (p === '/host') page = hostPage(ctx);
  else { crumbs([{ label: 'Overview' }]); page = fleetPage(ctx); }
  state.page = page;
  clear(shell.main).append(page.el);
  document.title = `${page.title || 'Fleet'} · DevX Control`;
  paintChrome();
  window.scrollTo(0, 0);
  motion.page(shell.main); motion.decode(shell.main);
}

function palette() {
  openPalette({ admin: me.admin, fleet: state.fleet, go, refresh, toggleTheme: () => { theme(); shell.paintTheme(); }, signOut });
}

async function signOut() {
  try { await api('/session', { method: 'DELETE' }); } catch { /* already out */ }
  setCsrf(null); showLogin();
}

function start() {
  fx.init();
  clear(root);
  shell = buildShell();
  root.append(shell.el);
  motion.shell(shell);
  refresh().then(() => { if (state.fleet) { renderPage(); if (me.admin) maybeSetup({ go }); } else shell.main.append(h('div', { class: 'banner' }, 'Could not load the fleet. Check the server logs.')); });
  clearInterval(state.timer); clearInterval(state.ticker);
  state.timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 8000);
  state.ticker = setInterval(paintChrome, 5000);
}

async function showLogin(info) {
  fx.init();
  clearInterval(state.timer); clearInterval(state.ticker);
  state.page?.destroy?.(); state.page = null; shell = null; state.fleet = null;
  const s = info || await api('/session');
  clear(root).append(loginView({ demo: s.demo, onDone: () => { boot(); } }));
}

async function boot() {
  const s = await api('/session').catch(() => null);
  if (!s) { clear(root).append(h('div', { class: 'login' }, h('div', { class: 'card' }, h('h1', {}, 'Cannot reach the server'), h('p', { class: 'lede' }, 'Check your connection and reload.')))); return; }
  if (!s.authenticated) return showLogin(s);
  setCsrf(s.csrf); applyRole(s); state.session = s;
  start();
}

setUnauthHandler(() => { if (shell) { toast('Your session expired. Sign in again.', 'bad'); showLogin(); } });
window.addEventListener('hashchange', renderPage);
window.addEventListener('dc:setup', () => me.admin && maybeSetup({ force: true, go }));
window.addEventListener('dc:content', () => shell && (motion.page(shell.main), motion.decode(shell.main)));
document.addEventListener('keydown', (e) => {
  if (!shell) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); }
  else if (e.key === '/' && !typing) { e.preventDefault(); palette(); }
  else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'g') {
    const once = (ev) => { const m = { f: '/', u: '/updates', v: '/vault', b: '/backups', a: '/activity', s: '/host', p: '/pipeline', r: '/reviews', d: '/studio', o: '/onboard', y: '/orbit' }[ev.key.toLowerCase()]; if (m) { ev.preventDefault(); go(m); } document.removeEventListener('keydown', once, true); };
    setTimeout(() => document.addEventListener('keydown', once, true), 0);
    setTimeout(() => document.removeEventListener('keydown', once, true), 1200);
  }
});
boot();
