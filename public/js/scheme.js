// Applies the console look as early as possible: color shift, component kit, fine tuning.
// Persists in localStorage. Does not touch the apps DevX Control manages.
import { SCHEMES, KITS, AXES, CONSOLE_THEMES, normalizeSkin, schemeSpec, buildConsoleCss, recolorCss, activeTheme } from './lib/consolelook.js';

const FILES = ['app', 'fx', 'glass', 'v2', 'space', 'orbit', 'sidebar', 'assistant'];
const KEY = 'dc-look';
let sources = null;
const cache = {};
let gen = 0;

const load = () => sources || (sources = Promise.all(FILES.map((f) => fetch(`/css/${f}.css`).then((r) => r.text()))).then((a) => a.join('\n')));

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeSkin(JSON.parse(raw));
    const legacy = localStorage.getItem('dc-scheme');
    if (SCHEMES[legacy]) return normalizeSkin({ scheme: legacy });
  } catch { /* private mode or bad JSON */ }
  return normalizeSkin({});
}
function write(skin) {
  const s = normalizeSkin(skin);
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem('dc-scheme', s.scheme === 'custom' ? 'violet' : s.scheme);
  } catch { /* private mode */ }
  return s;
}
function emit(skin) {
  window.dispatchEvent(new CustomEvent('dc:scheme', { detail: skin.scheme }));
  window.dispatchEvent(new CustomEvent('dc:look', { detail: skin }));
}
function paintKit(skin) {
  const css = buildConsoleCss(skin);
  let el = document.getElementById('dc-kit');
  if (!css) { el?.remove(); return; }
  if (!el) { el = document.createElement('style'); el.id = 'dc-kit'; document.head.append(el); }
  el.textContent = css;
  document.head.append(el);
}
async function paintScheme(skin) {
  const mine = ++gen;
  const spec = schemeSpec(skin);
  document.documentElement.dataset.scheme = spec.id;
  document.documentElement.dataset.kit = skin.kit;
  let el = document.getElementById('dc-scheme');
  if (spec.hue == null) { el?.remove(); document.documentElement.style.removeProperty('--scene-hue'); return; }
  try {
    const key = String(Math.round(spec.hue));
    if (!cache[key]) cache[key] = recolorCss(await load(), spec.hue);
    if (mine !== gen) return;
    if (!el) { el = document.createElement('style'); el.id = 'dc-scheme'; document.head.append(el); }
    el.textContent = `${cache[key]}\n.scene-canvas{filter:hue-rotate(${Math.round(spec.hue - 265)}deg)}`;
    const kit = document.getElementById('dc-kit');
    if (kit) document.head.append(kit);
  } catch { /* shipped colors stay if a stylesheet cannot be read */ }
}
function apply(skin) {
  const s = normalizeSkin(skin);
  paintKit(s);
  return paintScheme(s);
}

const getSkin = () => read();
const get = () => read().scheme;
const set = (name) => {
  if (!SCHEMES[name]) return;
  const skin = write({ ...read(), scheme: name, custom: '' });
  emit(skin);
  return apply(skin);
};
const setSkin = (partial) => {
  const prev = read();
  const next = { ...prev, ...partial };
  if (partial && partial.scheme && partial.scheme !== 'custom') next.custom = '';
  for (const key of ['radius', 'density', 'font', 'glass', 'custom']) {
    if (partial && partial[key] === '') delete next[key];
  }
  const skin = write(next);
  emit(skin);
  return apply(skin);
};
const applyTheme = (id) => {
  const t = CONSOLE_THEMES.find((x) => x.id === id);
  if (!t) return;
  return setSkin({ scheme: t.scheme, kit: t.kit, radius: '', density: '', font: '', glass: '', custom: '' });
};
const reset = () => {
  try { localStorage.removeItem(KEY); localStorage.setItem('dc-scheme', 'violet'); } catch { /* ignore */ }
  const skin = normalizeSkin({});
  emit(skin);
  return apply(skin);
};

window.dcScheme = { SCHEMES, KITS, AXES, CONSOLE_THEMES, FILES, get, set, getSkin, setSkin, applyTheme, reset, recolor: recolorCss, activeTheme: () => activeTheme(read()) };
apply(read());
