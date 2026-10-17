// Shared UI toolkit. All text goes through textContent (no innerHTML), which keeps the CSP strict and XSS out.
const SVG = new Set(['svg', 'path', 'circle', 'line', 'rect', 'g', 'text', 'defs', 'polyline', 'title', 'linearGradient', 'stop', 'ellipse']);
const NS = 'http://www.w3.org/2000/svg';

/** Hyperscript: h('div', {class:'x', onclick}, 'text', child) */
// Native append() prints "null"/"false" as text. Conditional children (cond && node) are used everywhere, so drop them.
for (const m of ['append', 'prepend']) {
  const native = Element.prototype[m];
  Element.prototype[m] = function (...nodes) { return native.apply(this, nodes.filter((n) => n != null && n !== false && n !== true)); };
}
export function h(tag, props = {}, ...kids) {
  const el = SVG.has(tag) ? document.createElementNS(NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') for (const [a, b] of Object.entries(v)) a.startsWith('--') ? el.style.setProperty(a, b) : (el.style[a] = b);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);

/* ---------------- icons (24px grid, 1.5 stroke to match regular-weight text) ---------------- */
const P = {
  radar: 'M12 21a9 9 0 1 1 9-9M12 17a5 5 0 1 1 5-5M12 12l6.5-6.5M12 12.01V12',
  fleet: 'M3 7.5 12 3l9 4.5-9 4.5-9-4.5ZM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5',
  archive: 'M4 7h16v3H4zM5.5 10v9h13v-9M10 14h4',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  server: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
  code: 'M8 7 3 12l5 5M16 7l5 5-5 5M14 4l-4 16',
  terminal: 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h4',
  key: 'M14.5 9.5a4.5 4.5 0 1 1-1.2-3.1L21 14v3h-3v-2h-2v-2h-2M8.5 9.5h.01',
  rocket: 'M5 15c-1.5 1.2-2 4-2 6 2 0 4.8-.5 6-2M9 15l-3-3c1-4 4-8 13-9 0 9-5 12-9 13l-1-1ZM14.5 9.5h.01',
  play: 'M7 4.5v15l12-7.5z',
  stop: 'M6 6h12v12H6z',
  restart: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14ZM20 20l-4-4',
  sun: 'M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8ZM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z',
  eyeoff: 'M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.1 3.7M6.6 7.6C3.9 9.4 2 12 2 12s4 7 10 7c1.5 0 2.8-.4 4-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  branch: 'M6 4v12M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 12c0-3 3-4 6-4h4',
  chevron: 'M9 5l7 7-7 7',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  alert: 'M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z',
  db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3ZM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  cpu: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  disk: 'M4 15h16v5H4zM6 15l2-9h8l2 9M8 17.5h.01',
  refresh: 'M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4',
  plus: 'M12 5v14M5 12h14',
  command: 'M9 9V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V9',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  pause: 'M8 5v14M16 5v14',
  wrap: 'M3 6h18M3 12h14a3 3 0 1 1 0 6h-4M13 15l-3 3 3 3M3 18h4',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  book: 'M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4ZM5 18a2 2 0 0 1 2-2h12',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-4 3.6-6 8-6s8 2 8 6',
  bolt: 'M13 3 5 13h6l-1 8 8-10h-6l1-8Z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2ZM10 20a2 2 0 0 0 4 0',
  flow: 'M5 5h5v5H5zM14 14h5v5h-5zM10 7.5h4a2 2 0 0 1 2 2V14M7.5 10v4.5a2 2 0 0 0 2 2H14',
  palette: 'M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3ZM7.5 11a1 1 0 1 0 0-.01M10 7.5a1 1 0 1 0 0-.01M14.5 7.5a1 1 0 1 0 0-.01',
  diff: 'M7 3v10M2 8h10M13 19h9M17.5 4v9M13 8.5h9',
  github: 'M9 19c-4 1.3-4-2-6-2.5M15 21v-3.2a2.8 2.8 0 0 0-.8-2.2c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.3 1.3a11.4 11.4 0 0 0-6 0C6.700 2.900 5.700 3.200 5.700 3.200a4.300 4.300 0 0 0-.1 3.200A4.600 4.600 0 0 0 4.300 9.600c0 4.600 2.800 5.700 5.500 6A2.800 2.800 0 0 0 9 17.800V21',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16',
  cube: 'M12 3 4 7.500v9L12 21l8-4.500v-9L12 3ZM4 7.500l8 4.500 8-4.500M12 12v9',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.500a4.500 4.500 0 1 0 0-9 4.500 4.500 0 0 0 0 9ZM12 12h.01',
  wand: 'M5 19 15 9M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2ZM19 13l.7 1.300L21 15l-1.300.7L19 17l-.7-1.300L17 15l1.300-.7L19 13Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  shieldcheck: 'M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6l8-3ZM8.500 12l2.500 2.500 4.500-5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  gauge: 'M4 18a8 8 0 1 1 16 0M12 18l4-6',
  layers: 'M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5',
};
export function icon(name, size = 18) {
  return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' }, h('path', { d: P[name] || P.alert }));
}

/* ---------------- formatting ---------------- */
export const fmt = {
  bytes(n) {
    if (n == null || isNaN(n)) return '-';
    const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; n = +n;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${u[i]}`;
  },
  ms: (n) => (n == null ? '-' : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`),
  pct: (n, d = 1) => (n == null ? '-' : `${(+n).toFixed(d)}%`),
  dur(ms) {
    if (ms == null) return '-';
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${hh}h` : hh ? `${hh}h ${m}m` : m ? `${m}m` : `${s}s`;
  },
  ago(t) { return t ? `${fmt.dur(Date.now() - t)} ago` : 'never'; },
  clock: (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  stamp: (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
};
export const STATUS_LABEL = { healthy: 'Healthy', degraded: 'Degraded', crashing: 'Crash-looping', down: 'Down', stopped: 'Stopped', unknown: 'Checking' };

export const orb = (s) => h('span', { class: 'orb', dataset: { s }, role: 'img', 'aria-label': STATUS_LABEL[s] || s });

/* ---------------- toast / copy / confirm ---------------- */
export function toast(msg, kind = 'info') {
  const el = h('div', { class: 'toast', dataset: { k: kind }, role: kind === 'bad' ? 'alert' : 'status' }, h('span', { class: 'ti' }, icon(kind === 'bad' ? 'alert' : 'check')), h('span', {}, msg));
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 7000 : 3200);
}
export async function copy(text, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = h('textarea', { style: { position: 'fixed', opacity: 0 } }); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
  toast(what);
}

let lastFocus = null;
function trap(root, onEsc) {
  const keys = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onEsc(); }
    if (e.key === 'Tab') {
      const f = [...root.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  root.addEventListener('keydown', keys);
}
export function modal(content, { onClose } = {}) {
  lastFocus = document.activeElement;
  const scrim = h('div', { class: 'scrim' });
  const close = (v) => { scrim.remove(); lastFocus?.focus?.(); onClose?.(v); };
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
  scrim.append(content);
  document.body.append(scrim);
  trap(scrim, () => close());
  // focus the dialog itself (not a button, so Enter never confirms by accident) so Escape and Tab work straight away
  if (content instanceof HTMLElement) { if (!content.hasAttribute('tabindex')) content.tabIndex = -1; content.style.outline = 'none'; content.focus({ preventScroll: true }); }
  return { close, scrim };
}
export function confirmDialog({ title, body, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const ok = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => m.close(true) }, confirm);
    const no = h('button', { class: 'btn', onclick: () => m.close(false) }, 'Cancel');
    const d = h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-t' }, h('h2', { id: 'dlg-t' }, title), h('p', {}, body), h('div', { class: 'acts' }, no, ok));
    const m = modal(d, { onClose: (v) => resolve(!!v) });
    no.focus();
  });
}

/** Button that shows a spinner while its async handler runs. */
export function actionBtn({ label, ic, cls = '', title, onClick, icon: iconOnly = false, sm = false, disabled = false }) {
  const b = h('button', { class: `btn ${cls} ${iconOnly ? 'icon' : ''} ${sm ? 'sm' : ''}`, title: title || label, 'aria-label': title || label });
  const fill = () => { clear(b); if (ic) b.append(icon(ic, 16)); if (!iconOnly) b.append(h('span', { class: 'lab' }, label)); };
  fill(); b.disabled = !!disabled;
  b.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (b.disabled) return;
    b.disabled = true; clear(b); b.append(h('span', { class: 'spin' }));
    try { await onClick(); } finally { b.disabled = !!disabled; fill(); }
  });
  return b;
}
