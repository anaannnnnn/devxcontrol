// Desktop navigation: a floating vertical panel on the left with every page one click away and submenus where they help.
// (Phones and narrow windows keep the top pill and the bottom dock.)
import { h, clear, icon, orb } from './ui.js';

const KEY = 'dc-side-open';
const COLLAPSE = 'dc-side-collapsed';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

const ORBIT = [['sky', 'Orbit'], ['debt', 'Design debt'], ['dna', 'DNA'], ['proving', 'Proving'], ['ghosts', 'Ghosts'], ['universes', 'Universes'], ['revenue', 'Revenue'], ['mirror', 'Mirror'], ['brain', 'Brain'], ['gift', 'Gift'], ['talk', 'Talk'], ['rooms', 'Rooms']];
const APP_TABS = [['overview', 'Overview'], ['logs', 'Logs'], ['deploy', 'Updates'], ['database', 'Database', 'db'], ['secrets', 'Secrets', 'admin'], ['domain', 'Domain', 'admin']];

/**
 * deps: { NAV, route, go, getFleet, getMe, palette, theme, paintTheme, openAppearance, signOut, schemePicker }
 * Returns { el, paint }. paint() redraws highlights, badges and the app list; call it on route and fleet changes.
 */
export function makeSidebar(deps) {
  const open = new Set(read(KEY, ['workspace', 'overview']));
  let collapsed = !!read(COLLAPSE, false);
  const live = h('div', { class: 'live', role: 'status' }, h('i'), h('span'));
  const tree = h('nav', { class: 'sb-tree', 'aria-label': 'Main navigation' });
  const el = h('aside', { class: 'sidebar', 'aria-label': 'Navigation' });

  const nav = (p) => deps.NAV.find((n) => n.path === p);
  const item = (p, over = {}) => { const n = nav(p); return n ? { path: p, label: n.label, icon: n.icon, pip: n.pip, match: n.match, ...over } : null; };

  function sections() {
    const me = deps.getMe(); const f = deps.getFleet();
    const vis = (it) => it && (me.admin || !it.admin);
    const apps = (f?.apps || []).map((a) => ({
      id: `app:${a.id}`, label: a.name, status: a.status, path: `/app/${a.id}`,
      match: (p) => p === `/app/${a.id}`,
      children: APP_TABS.filter(([, , flag]) => (flag !== 'admin' || me.admin) && (flag !== 'db' || a.hasDb)).map(([k, label]) => ({ label, path: `/app/${a.id}/${k}`, match: (p) => p === `/app/${a.id}/${k}` || (k === 'overview' && p === `/app/${a.id}`) })),
    }));
    return [
      { id: 'workspace', title: 'Workspace', items: [
        { id: 'overview', path: '/', label: 'Overview', icon: 'radar', pip: 'fleet', match: (p) => p === '/' || p.startsWith('/app/'), children: [{ label: 'Fleet', path: '/', match: (p) => p === '/' }, { id: 'apps', label: `Apps (${apps.length})`, path: '/', match: () => false, children: apps }] },
        item('/pipeline'), item('/reviews'), item('/studio'), item('/create', { admin: true }), item('/design'),
        { id: 'orbit', path: '/orbit', label: 'Orbit', icon: 'radar', match: (p) => p === '/orbit' || p.startsWith('/orbit/'), children: ORBIT.map(([k, label]) => ({ label, path: k === 'sky' ? '/orbit' : `/orbit/${k}`, match: (p) => (k === 'sky' ? p === '/orbit' : p === `/orbit/${k}`) })) },
        me.admin && { path: '/onboard', label: 'Onboard repo', icon: 'github', match: (p) => p === '/onboard' },
      ].filter(Boolean) },
      { id: 'data', title: 'Data', items: [
        item('/databases', { admin: true, id: 'databases', children: [{ label: 'Browse and edit', path: '/databases', match: (p) => p === '/databases' }, { label: 'Clusters', path: '/connections', match: () => false }] }),
        item('/backups'), item('/vault', { admin: true }),
      ].filter(vis) },
      { id: 'operate', title: 'Operate', items: [item('/updates'), item('/activity'), item('/ledger'), item('/automation'), item('/host', { admin: true })].filter(vis) },
      { id: 'settings', title: 'Settings', items: [item('/connections', { admin: true }), item('/users', { admin: true }), item('/account')].filter(vis) },
    ].map((s) => ({ ...s, items: s.items.filter(Boolean) })).filter((s) => s.items.length);
  }

  const isOn = (node, p) => (node.match ? node.match(p) : node.path === p) || (node.children || []).some((c) => isOn(c, p));
  const toggle = (id) => { if (open.has(id)) open.delete(id); else open.add(id); write(KEY, [...open]); paint(true); };

  function row(node, depth, p) {
    const hasKids = !!node.children?.length;
    const id = node.id || `${depth}:${node.path}`;
    const active = node.match ? node.match(p) : node.path === p;
    const inside = isOn(node, p);
    const expanded = hasKids && open.has(id);
    const cls = `sb-row d${depth} ${active ? 'on' : ''} ${inside && !active ? 'in' : ''}`;
    const label = h('span', { class: 'sb-lb' }, node.label);
    const lead = depth === 0 ? icon(node.icon, 18) : node.status ? orb(node.status) : h('i', { class: 'sb-dot' });
    const main = h('button', { class: 'sb-btn', type: 'button', 'aria-current': active ? 'page' : null, title: node.label, dataset: { path: node.path }, onclick: () => { if (hasKids && !expanded) { open.add(id); write(KEY, [...open]); } deps.go(node.path); } }, lead, label,
      node.pip && h('i', { class: 'pip', dataset: { pip: node.pip }, hidden: true }));
    const chev = hasKids && h('button', { class: `sb-chev ${expanded ? 'open' : ''}`, type: 'button', 'aria-label': `${expanded ? 'Collapse' : 'Expand'} ${node.label}`, 'aria-expanded': String(expanded), onclick: (e) => { e.stopPropagation(); toggle(id); } }, icon('chevron', 14));
    const out = [h('div', { class: cls }, main, chev)];
    if (expanded) out.push(h('div', { class: 'sb-sub', role: 'group', 'aria-label': node.label }, node.children.map((c) => row(c, depth + 1, p))));
    return out;
  }

  // After you navigate, open the branches that contain the page you are on (once, so closing one stays closed).
  let lastP = null;
  const openAround = (nodes, p, depth = 0) => nodes.forEach((n) => { if (n.children?.length && isOn(n, p)) { open.add(n.id || `${depth}:${n.path}`); openAround(n.children, p, depth + 1); } });

  let lastSig = '';
  function paint(force = false) {
    const p = deps.route(); const keep = tree.scrollTop;
    const f = deps.getFleet(); const sig = `${p}|${deps.getMe().admin}|${collapsed}|${(f?.apps || []).map((a) => a.id + a.status).join(',')}`;
    if (!force && sig === lastSig) return;
    lastSig = sig;
    const secs = sections();
    const navigated = p !== lastP;
    if (navigated) { lastP = p; secs.forEach((s) => openAround(s.items, p)); write(KEY, [...open]); }
    clear(tree);
    secs.forEach((s) => {
      tree.append(h('div', { class: 'sb-sec' }, h('div', { class: 'sb-title' }, s.title), s.items.map((n) => row(n, 0, p))));
    });
    tree.scrollTop = keep;
    if (navigated) requestAnimationFrame(() => tree.querySelector('.sb-row.on')?.scrollIntoView({ block: 'nearest' }));
    el.classList.toggle('collapsed', collapsed);
    document.documentElement.classList.toggle('sb-collapsed', collapsed);
    deps.afterPaint?.();
  }

  const collapseBtn = h('button', { class: 'sb-icon', type: 'button', 'aria-label': 'Shrink or widen the menu', title: 'Shrink or widen the menu', onclick: () => { collapsed = !collapsed; write(COLLAPSE, collapsed); paint(true); } }, icon('menu', 18));
  const themeBtn = h('button', { class: 'sb-icon', type: 'button', 'aria-label': 'Switch theme', title: 'Switch theme', onclick: () => { deps.theme(); deps.paintTheme?.(); } }, icon('sun', 18));
  const lookBtn = h('button', { class: 'sb-icon', type: 'button', 'aria-label': 'Console look and color', title: 'Look and color', onclick: () => deps.openAppearance() }, icon('palette', 18));
  const outBtn = h('button', { class: 'sb-icon', type: 'button', 'aria-label': 'Sign out', title: 'Sign out', onclick: () => deps.signOut() }, icon('logout', 18));
  const search = h('button', { class: 'sb-search', type: 'button', 'aria-label': 'Search and jump', onclick: () => deps.palette() }, icon('search', 16), h('span', { class: 'sb-lb' }, 'Search'), h('kbd', { class: 'sb-lb' }, '/'));
  const brand = h('a', { class: 'sb-brand', href: '#/', 'aria-label': 'DevX Control home' }, h('span', { class: 'logo' }, icon('radar', 22)), h('span', { class: 'wm sb-lb' }, h('b', {}, 'DEVX'), h('small', {}, 'CONTROL')));
  const onboard = deps.getMe().admin ? h('button', { class: 'sb-cta', type: 'button', onclick: () => deps.go('/onboard'), title: 'Onboard repo' }, icon('plus', 16), h('span', { class: 'sb-lb' }, 'Onboard repo')) : null;

  el.append(h('div', { class: 'sb-head' }, brand, collapseBtn), search, onboard, tree,
    h('div', { class: 'sb-foot' }, live, h('div', { class: 'sb-tools' }, lookBtn, themeBtn, outBtn)));
  paint();
  return { el, paint, live };
}
