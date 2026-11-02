// Aether look runtime + Studio for the DevX Control console (not the apps it manages).
// Persists in localStorage ("dc-aether"). While on, it owns the console tokens; turning it off
// restores the classic look (scheme / kit / axes) that was active before.
import { h, clear } from './ui.js';
import {
  THEMES, TEXTURES, FONTS, MOTION, CURSORS, DEFAULTS, normalize, resolve, buildCss, exportCss, textureCss, getTexture, fontStack,
} from './lib/aether-core.js';

const KEY = 'dc-aether', PREV = 'dc-aether-prev';
const root = document.documentElement;

function read() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return normalize({}); }
}
let state = read();
const mode = () => (root.dataset.theme === 'light' ? 'light' : 'dark');
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } };

// ---------- fonts ----------
const loaded = new Set();
function loadFont(family) {
  if (!family || loaded.has(family) || !FONTS.some((f) => f.family === family)) return;
  loaded.add(family);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css?family=${encodeURIComponent(family).replace(/%20/g, '+')}:400,500,600,700&display=swap`;
  document.head.append(l);
}

// ---------- layers ----------
function layers(on) {
  for (const cls of ['ax-tex', 'ax-vig', 'ax-grain']) {
    let el = document.querySelector('.' + cls);
    if (!on) { el?.remove(); continue; }
    if (!el) { el = h('div', { class: `ax-layer ${cls}`, 'aria-hidden': 'true' }); document.body.append(el); }
  }
}

// ---------- classic scheme sync (hard-coded violet stops in the shipped CSS follow the accent hue) ----------
let syncT;
function snapshotClassic() {
  if (localStorage.getItem(PREV)) return;
  try { localStorage.setItem(PREV, localStorage.getItem('dc-look') || '{}'); } catch { /* ignore */ }
}
function syncScheme() {
  clearTimeout(syncT);
  syncT = setTimeout(() => {
    const S = window.dcScheme; if (!S || !state.on) return;
    const accent = resolve(state).accent;
    S.setSkin({ scheme: 'custom', custom: accent, kit: 'orbital', radius: '', density: '', font: '', glass: '' });
  }, 140);
}
function restoreClassic() {
  const S = window.dcScheme; if (!S) return;
  let prev = null;
  try { prev = JSON.parse(localStorage.getItem(PREV) || 'null'); localStorage.removeItem(PREV); } catch { /* ignore */ }
  if (prev && Object.keys(prev).length) S.setSkin({ radius: '', density: '', font: '', glass: '', custom: '', ...prev });
  else S.reset();
}

// ---------- apply ----------
function apply() {
  let el = document.getElementById('dc-aether');
  if (!state.on) {
    el?.remove(); delete root.dataset.aether; layers(false); cursor(false); return;
  }
  const r = resolve(state);
  loadFont(r.bodyFont); loadFont(r.headFont);
  root.dataset.aether = r.theme.id;
  if (!el) { el = document.createElement('style'); el.id = 'dc-aether'; }
  el.textContent = buildCss(state, mode());
  document.head.append(el);                       // keep last so it wins over scheme/kit sheets
  layers(true);
  const tex = document.querySelector('.ax-tex'); if (tex) tex.style.cssText = textureCss(r.texture);
  cursor(state.cursor);
}
new MutationObserver(() => state.on && apply()).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
window.addEventListener('dc:look', () => { const el = document.getElementById('dc-aether'); if (el) document.head.append(el); });

function commit(patch, { scheme = true } = {}) {
  const wasOn = state.on;
  state = normalize({ ...state, ...patch });
  save();
  if (state.on && !wasOn) snapshotClassic();
  if (!state.on && wasOn) restoreClassic();
  apply();
  if (state.on && scheme) syncScheme();
  window.dispatchEvent(new CustomEvent('dc:aether', { detail: state }));
  refreshStudio();
}

// ---------- cursor ----------
let cur = { mode: 'off', raf: 0, off: null };
function cursor(m) {
  if (cur.mode === m) return;
  cur.off?.(); cur = { mode: 'off', raf: 0, off: null };
  if (m === 'off' || !window.matchMedia('(pointer:fine)').matches || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const dot = h('div', { class: 'ax-cur ax-cur-dot' }), ring = h('div', { class: 'ax-cur ax-cur-ring' }), spot = h('div', { class: 'ax-cur ax-cur-spot' });
  const cv = h('canvas', { class: 'ax-cur ax-cur-trail' });
  const els = m === 'dot' ? [dot] : m === 'ring' ? [dot, ring] : m === 'spotlight' ? [dot, spot] : [dot, cv];
  document.body.append(...els);
  root.classList.add('ax-cursor-none');
  const p = { x: innerWidth / 2, y: innerHeight / 2 }, q = { ...p }, pts = [];
  let big = false;
  const ctx = m === 'trail' ? cv.getContext('2d') : null;
  const size = () => { cv.width = innerWidth; cv.height = innerHeight; };
  size();
  const move = (e) => { p.x = e.clientX; p.y = e.clientY; const t = e.target; big = !!(t.closest && t.closest('a,button,[role=button],.btn,.nav-btn')); };
  const loop = () => {
    q.x += (p.x - q.x) * 0.16; q.y += (p.y - q.y) * 0.16;
    dot.style.transform = `translate3d(${p.x}px,${p.y}px,0) translate(-50%,-50%) scale(${big ? 0.4 : 1})`;
    ring.style.transform = `translate3d(${q.x}px,${q.y}px,0) translate(-50%,-50%) scale(${big ? 1.8 : 1})`;
    spot.style.transform = `translate3d(${q.x}px,${q.y}px,0) translate(-50%,-50%)`;
    if (ctx) {
      pts.push({ x: p.x, y: p.y, t: performance.now() });
      while (pts.length && performance.now() - pts[0].t > 420) pts.shift();
      ctx.clearRect(0, 0, cv.width, cv.height);
      const rgb = getComputedStyle(root).getPropertyValue('--ax-accent-rgb') || '125,211,252';
      for (let i = 1; i < pts.length; i++) {
        const a = i / pts.length;
        ctx.strokeStyle = `rgba(${rgb},${a * 0.8})`; ctx.lineWidth = a * 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      }
    }
    cur.raf = requestAnimationFrame(loop);
  };
  addEventListener('pointermove', move); addEventListener('resize', size);
  loop();
  cur = { mode: m, raf: cur.raf, off: () => { cancelAnimationFrame(cur.raf); removeEventListener('pointermove', move); removeEventListener('resize', size); els.forEach((e) => e.remove()); root.classList.remove('ax-cursor-none'); } };
}

// ============================ Studio UI ============================
let drawer = null, tab = 'themes', q = '', cat = 'All', shown = 48, favOnly = false, tq = '', tgroup = 'All', fq = '', fgroup = 'All';
const TABS = [['themes', 'Themes'], ['surface', 'Surface'], ['type', 'Type'], ['motion', 'Motion'], ['fx', 'Effects'], ['share', 'Share']];
const CATS = ['All', ...new Set(THEMES.map((t) => t.cat))];
const GROUPS = ['All', ...new Set(TEXTURES.map((t) => t.group))];
const FGROUPS = ['All', ...new Set(FONTS.map((f) => f.group))];

const row = (label, value, ...kids) => h('label', { class: 'ax-row' }, h('span', { class: 'ax-row-h' }, h('span', {}, label), h('b', {}, value)), ...kids);
function range(label, key, min, max, step, unit = '', { auto, get } = {}) {
  const r = resolve(state), cur = get ? get(r) : state[key];
  const inherit = state[key] < 0;
  const input = h('input', { type: 'range', min, max, step, value: cur, 'aria-label': label });
  const val = h('b', {}, `${step < 1 ? (+cur).toFixed(2) : Math.round(cur)}${unit}${inherit && auto ? ' · theme' : ''}`);
  input.addEventListener('input', () => { val.textContent = `${step < 1 ? (+input.value).toFixed(2) : Math.round(+input.value)}${unit}`; commit({ [key]: +input.value }, { scheme: false }); });
  return h('label', { class: 'ax-row' }, h('span', { class: 'ax-row-h' }, h('span', {}, label), val), input);
}
const seg = (items, value, on) => h('div', { class: 'ax-seg', role: 'group' }, items.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => on(v) }, l)));
const chips = (items, value, on) => h('div', { class: 'ax-chips' }, items.map((i) => h('button', { type: 'button', class: 'ax-chip', 'aria-pressed': String(i === value), onclick: () => on(i) }, i)));
const color = (label, key, cur) => {
  const input = h('input', { type: 'color', value: cur, 'aria-label': label });
  input.addEventListener('input', () => commit({ [key]: input.value }));
  return h('label', { class: 'ax-row ax-color' }, h('span', {}, label), h('span', {}, h('code', {}, cur), input));
};
const select = (label, items, cur, on) => {
  const s = h('select', { class: 'field', 'aria-label': label }, items.map(([v, l]) => h('option', { value: v, selected: v === cur }, l)));
  s.addEventListener('change', () => on(s.value));
  return h('label', { class: 'ax-row' }, h('span', { class: 'ax-row-h' }, h('span', {}, label)), s);
};

function themeCard(t) {
  const r = resolve(state), active = state.on && r.theme.id === t.id, fav = state.favorites.includes(t.id);
  const card = h('div', { class: 'ax-tc', role: 'button', tabindex: '0', 'aria-pressed': String(active), 'aria-label': `${t.name} theme`, title: `${t.name} · ${t.cat}` });
  card.setAttribute('style', `background:${t.bg};--c:${t.accent};--c2:${t.accent2}`);
  card.append(
    h('i', { class: 'ax-tc-tex', style: {} }),
    h('div', { class: 'ax-tc-body' },
      h('span', { class: 'ax-tc-bars' }, h('em', {}), h('em', {})),
      h('b', {}, t.name),
      h('span', { class: 'ax-tc-dots' }, h('u', { style: { background: t.accent } }), h('u', { style: { background: t.accent2 } }), h('small', {}, t.cat))),
    h('button', { type: 'button', class: 'ax-heart', 'aria-label': fav ? 'Unfavorite' : 'Favorite', 'aria-pressed': String(fav), onclick: (e) => { e.stopPropagation(); commit({ favorites: fav ? state.favorites.filter((x) => x !== t.id) : [...state.favorites, t.id] }, { scheme: false }); } }, fav ? '♥' : '♡'));
  card.querySelector('.ax-tc-tex').setAttribute('style', textureCss(t.texture));
  const pick = () => commit({ on: true, theme: t.id, accent: '', accent2: '', bodyFont: '', headFont: '', texture: '', motion: '', radius: -1, blur: -1, panelAlpha: -1, lift: -1 });
  card.addEventListener('click', pick);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  return card;
}

function themesTab() {
  const list = THEMES.filter((t) => (cat === 'All' || t.cat === cat) && (!favOnly || state.favorites.includes(t.id)) && `${t.name} ${t.cat}`.toLowerCase().includes(q.toLowerCase()));
  const search = h('input', { class: 'field ax-search', type: 'search', placeholder: `Search ${THEMES.length} themes…`, value: q, 'aria-label': 'Search themes' });
  search.addEventListener('input', () => { q = search.value; shown = 48; renderTab(); const s = drawer.querySelector('.ax-search'); s.focus(); s.setSelectionRange(q.length, q.length); });
  return h('div', { class: 'ax-stack' },
    h('div', { class: 'ax-tools' }, search,
      h('button', { type: 'button', class: 'btn sm', title: 'Random theme', onclick: () => { const t = THEMES[Math.floor(Math.random() * THEMES.length)]; commit({ on: true, theme: t.id, accent: '', accent2: '', bodyFont: '', headFont: '', texture: '', motion: '', radius: -1, blur: -1, panelAlpha: -1, lift: -1 }); } }, 'Random'),
      h('button', { type: 'button', class: 'btn sm', 'aria-pressed': String(favOnly), onclick: () => { favOnly = !favOnly; renderTab(); } }, `♥ ${state.favorites.length}`)),
    chips(CATS, cat, (c) => { cat = c; shown = 48; renderTab(); }),
    h('div', { class: 'ax-grid' }, list.slice(0, shown).map(themeCard)),
    list.length > shown && h('button', { type: 'button', class: 'btn', onclick: () => { shown += 48; renderTab(); } }, `Show more (${list.length - shown})`),
    !list.length && h('p', { class: 'ax-muted' }, 'No themes match.'));
}

function surfaceTab() {
  const r = resolve(state);
  const texSearch = h('input', { class: 'field ax-search', type: 'search', placeholder: `Search ${TEXTURES.length} textures…`, value: tq, 'aria-label': 'Search textures' });
  texSearch.addEventListener('input', () => { tq = texSearch.value; renderTab(); const s = drawer.querySelector('.ax-search'); s.focus(); s.setSelectionRange(tq.length, tq.length); });
  const tl = TEXTURES.filter((t) => (tgroup === 'All' || t.group === tgroup) && t.name.toLowerCase().includes(tq.toLowerCase()));
  return h('div', { class: 'ax-stack' },
    h('p', { class: 'ax-eyebrow' }, 'Colors'),
    color('Accent', 'accent', resolve(state).accent), color('Secondary', 'accent2', resolve(state).accent2),
    h('button', { type: 'button', class: 'btn sm', onclick: () => commit({ accent: '', accent2: '' }) }, 'Use theme colors'),
    h('p', { class: 'ax-eyebrow' }, 'Glass'),
    range('Corner radius', 'radius', 0, 44, 1, 'px', { auto: true, get: () => r.radius }),
    range('Blur', 'blur', 0, 60, 1, 'px', { auto: true, get: () => r.blur }),
    range('Panel opacity', 'panelAlpha', 0.2, 1, 0.02, '', { auto: true, get: () => r.panelAlpha }),
    range('Border width', 'border', 0, 4, 0.5, 'px'),
    range('Glow', 'glow', 0, 1.5, 0.05),
    h('p', { class: 'ax-eyebrow' }, `Texture · ${getTexture(r.texture).name}`),
    texSearch, chips(TGROUPS(), tgroup, (g) => { tgroup = g; renderTab(); }),
    h('div', { class: 'ax-tgrid' }, tl.map((t) => {
      const b = h('button', { type: 'button', class: 'ax-tx', 'aria-pressed': String(r.texture === t.id), title: t.name, 'aria-label': t.name, onclick: () => commit({ on: true, texture: t.id }, { scheme: false }) }, h('i', {}), h('span', {}, t.name));
      b.querySelector('i').setAttribute('style', t.css);
      return b;
    })),
    range('Texture opacity', 'texOpacity', 0, 1, 0.01), range('Texture scale', 'texScale', 0.4, 3, 0.05));
}
const TGROUPS = () => GROUPS;

function typeTab() {
  const r = resolve(state);
  const fl = FONTS.filter((f) => (fgroup === 'All' || f.group === fgroup) && f.family.toLowerCase().includes(fq.toLowerCase())).slice(0, 60);
  fl.forEach((f) => loadFont(f.family));
  const search = h('input', { class: 'field ax-search', type: 'search', placeholder: `Search ${FONTS.length} fonts…`, value: fq, 'aria-label': 'Search fonts' });
  search.addEventListener('input', () => { fq = search.value; renderTab(); const s = drawer.querySelector('.ax-search'); s.focus(); s.setSelectionRange(fq.length, fq.length); });
  return h('div', { class: 'ax-stack' },
    h('p', { class: 'ax-eyebrow' }, `Heading · ${r.headFont}   Body · ${r.bodyFont}`),
    search, chips(FGROUPS, fgroup, (g) => { fgroup = g; renderTab(); }),
    h('div', { class: 'ax-fonts' }, fl.map((f) => h('div', { class: 'ax-font' },
      h('span', { class: 'ax-font-s', style: { fontFamily: fontStack(f.family) } }, f.family),
      h('span', { class: 'ax-font-b' },
        h('button', { type: 'button', 'aria-pressed': String(r.bodyFont === f.family), onclick: () => commit({ on: true, bodyFont: f.family }, { scheme: false }) }, 'Body'),
        h('button', { type: 'button', 'aria-pressed': String(r.headFont === f.family), onclick: () => commit({ on: true, headFont: f.family }, { scheme: false }) }, 'Heading'))))),
    range('Letter spacing', 'tracking', -0.05, 0.2, 0.005, 'em'),
    h('button', { type: 'button', class: 'btn sm', onclick: () => commit({ bodyFont: '', headFont: '' }, { scheme: false }) }, 'Use theme fonts'));
}

function motionTab() {
  const r = resolve(state);
  return h('div', { class: 'ax-stack' },
    h('p', { class: 'ax-eyebrow' }, 'Physics preset'),
    h('div', { class: 'ax-list' }, MOTION.map((m) => h('button', { type: 'button', class: 'ax-opt', 'aria-pressed': String(r.motion.id === m.id), onclick: () => commit({ on: true, motion: m.id, lift: -1 }, { scheme: false }) }, h('b', {}, m.name), h('small', {}, `${m.blurb} · ${m.dur}s`)))),
    range('Hover lift', 'lift', 0, 14, 1, 'px', { auto: true, get: () => r.lift }),
    h('p', { class: 'ax-muted' }, 'Easing, duration and lift apply to buttons, cards, tiles and fields. Reduced-motion is always respected.'));
}

function fxTab() {
  return h('div', { class: 'ax-stack' },
    h('p', { class: 'ax-eyebrow' }, 'Cursor'),
    seg(CURSORS.map((c) => [c, c]), state.cursor, (c) => commit({ on: true, cursor: c }, { scheme: false })),
    h('p', { class: 'ax-muted' }, 'Custom cursors only run with a fine pointer and never on touch or reduced-motion.'),
    h('p', { class: 'ax-eyebrow' }, 'Layers'),
    range('Film grain', 'grain', 0, 1, 0.01), range('Vignette', 'vignette', 0, 1, 0.01));
}

function shareTab() {
  const css = exportCss(state, mode());
  const ta = h('textarea', { class: 'field ax-ta', placeholder: 'Paste exported JSON…', 'aria-label': 'Import JSON' });
  const note = h('p', { class: 'ax-muted', role: 'status' });
  return h('div', { class: 'ax-stack' },
    h('p', { class: 'ax-eyebrow' }, 'Export'),
    h('pre', { class: 'ax-pre' }, css),
    h('div', { class: 'ax-tools' },
      h('button', { type: 'button', class: 'btn sm', onclick: () => { navigator.clipboard?.writeText(css); note.textContent = 'CSS copied.'; } }, 'Copy CSS'),
      h('button', { type: 'button', class: 'btn sm', onclick: () => { navigator.clipboard?.writeText(JSON.stringify(state, null, 2)); note.textContent = 'JSON copied.'; } }, 'Copy JSON')),
    h('p', { class: 'ax-eyebrow' }, 'Import'), ta,
    h('button', { type: 'button', class: 'btn sm', onclick: () => { try { commit({ ...normalize(JSON.parse(ta.value)), on: true }); note.textContent = 'Applied.'; } catch { note.textContent = 'That is not valid JSON.'; } } }, 'Apply'),
    note,
    h('p', { class: 'ax-eyebrow' }, 'Console'),
    h('div', { class: 'ax-tools' },
      h('button', { type: 'button', class: 'btn sm', onclick: () => { commit({ ...DEFAULTS, favorites: state.favorites, on: false }); } }, 'Turn Aether off'),
      h('button', { type: 'button', class: 'btn sm', onclick: () => { closeStudio(); window.__dcClassic?.(); } }, 'Classic editor')));
}

const BODY = { themes: themesTab, surface: surfaceTab, type: typeTab, motion: motionTab, fx: fxTab, share: shareTab };
let tabScroll = {};
function renderTab() {
  if (!drawer) return;
  const box = drawer.querySelector('.ax-body'); tabScroll[tab] = box.scrollTop;
  clear(box).append(BODY[tab]());
  box.scrollTop = tabScroll[tab] || 0;
  drawer.querySelectorAll('.ax-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
}
function refreshStudio() {
  if (!drawer) return;
  const r = resolve(state);
  drawer.querySelector('.ax-title small').textContent = state.on ? r.theme.name : 'Off — classic look';
  drawer.querySelector('.ax-power').setAttribute('aria-pressed', String(state.on));
  drawer.querySelectorAll('.ax-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode())));
  // light refresh: re-render only tabs that mirror state outside of inputs being dragged
  if (!drawer.contains(document.activeElement) || document.activeElement.tagName !== 'INPUT') renderTab();
}

function setMode(m) {
  root.dataset.theme = m;
  try { localStorage.setItem('dc-theme', m); } catch { /* ignore */ }
}

function openStudio() {
  if (drawer) return;
  const prevFocus = document.activeElement;
  drawer = h('aside', { class: 'ax-drawer', role: 'dialog', 'aria-label': 'Aether Studio' },
    h('div', { class: 'ax-head' },
      h('div', { class: 'ax-title' }, h('span', { class: 'ax-eyebrow' }, 'Console look'), h('b', {}, 'Aether Studio'), h('small', {}, '')),
      h('div', { class: 'ax-head-b' },
        h('button', { type: 'button', class: 'ax-power btn sm', 'aria-pressed': String(state.on), onclick: () => commit({ on: !state.on }) }, 'On'),
        h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Close', onclick: () => closeStudio() }, '✕'))),
    h('div', { class: 'ax-mode' }, h('span', {}, 'Mode'), ...[['dark', 'Dark'], ['light', 'Light']].map(([m, l]) => h('button', { type: 'button', 'data-mode': m, 'aria-pressed': String(mode() === m), onclick: () => { setMode(m); refreshStudio(); } }, l))),
    h('div', { class: 'ax-tabs', role: 'tablist' }, TABS.map(([id, l]) => h('button', { type: 'button', role: 'tab', 'data-tab': id, 'aria-selected': String(id === tab), onclick: () => { tab = id; renderTab(); } }, l))),
    h('div', { class: 'ax-body' }),
    h('div', { class: 'ax-foot' }, h('span', {}, `${THEMES.length} themes · ${TEXTURES.length} textures · ${FONTS.length} fonts`), h('span', {}, 'autosaved')));
  const scrim = h('div', { class: 'ax-scrim', onclick: () => closeStudio() });
  document.body.append(scrim, drawer);
  drawer._scrim = scrim; drawer._prev = prevFocus;
  requestAnimationFrame(() => { drawer.classList.add('open'); scrim.classList.add('open'); });
  refreshStudio(); renderTab();
  drawer.querySelector('.ax-head .btn[aria-label=Close]').focus();
  drawer._esc = (e) => { if (e.key === 'Escape') closeStudio(); };
  addEventListener('keydown', drawer._esc);
}
function closeStudio() {
  if (!drawer) return;
  const d = drawer; drawer = null;
  removeEventListener('keydown', d._esc);
  d.classList.remove('open'); d._scrim.classList.remove('open');
  setTimeout(() => { d.remove(); d._scrim.remove(); d._prev?.focus?.(); }, 260);
}

addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 't' || e.key === 'T') && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); drawer ? closeStudio() : openStudio(); }
});

window.dcAether = {
  open: openStudio, close: closeStudio, get: () => state, set: (p) => commit(p), THEMES, TEXTURES, FONTS,
};
apply();
if (state.on) syncScheme();
