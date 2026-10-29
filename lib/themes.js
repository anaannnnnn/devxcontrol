// Theme engine: a theme is a small set of design tokens. From tokens we generate CSS (custom properties plus low-specificity
// element rules, so it restyles most sites without editing them), Tailwind config, and JSON. Custom themes are stored on disk.
// Applying a theme to an app goes through Autopilot as a reviewed change, never live.
import fs from 'node:fs';
import path from 'node:path';

const HEX = /^#([0-9a-f]{6})$/i;
const FONTS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif', humanist: '"Segoe UI", Optima, Candara, "Noto Sans", sans-serif',
};
export const FONT_KEYS = Object.keys(FONTS);
const T = (id, name, mode, bg, surface, text, muted, accent, radius, font, vibe) => ({ id, name, mode, bg, surface, text, muted, accent, radius, font, vibe, builtin: true });

export const BUILTIN = [
  T('deep-space', 'Deep Space', 'dark', '#0b0718', '#1a1230', '#f1eeff', '#b6acd9', '#9b7bff', 16, 'system', 'Glassy, cosmic violet'),
  T('crimson-nova', 'Crimson Nova', 'dark', '#14070b', '#2a1118', '#fff0f2', '#d9aeb6', '#ff5a6e', 16, 'system', 'Warm red glow'),
  T('aurora', 'Aurora', 'dark', '#06130f', '#10281f', '#eafff6', '#a6d4c1', '#2ee59d', 16, 'system', 'Northern-lights green'),
  T('midnight-blue', 'Midnight Blue', 'dark', '#060d1a', '#0f1d36', '#eaf3ff', '#9fb6d9', '#4da3ff', 14, 'system', 'Calm and corporate'),
  T('solar', 'Solar Amber', 'dark', '#150e04', '#2b1d08', '#fff6e5', '#d9c08f', '#ffb020', 14, 'system', 'Golden hour'),
  T('paper', 'Paper', 'light', '#faf8f4', '#ffffff', '#1c1917', '#57534e', '#b4532a', 6, 'serif', 'Editorial, warm paper'),
  T('clean-light', 'Clean Light', 'light', '#f6f8fb', '#ffffff', '#0f172a', '#475569', '#2563eb', 10, 'system', 'Neutral SaaS'),
  T('mint', 'Mint', 'light', '#f1fbf6', '#ffffff', '#10261c', '#3d5c4e', '#0f9d6b', 14, 'rounded', 'Fresh and friendly'),
  T('mono-terminal', 'Terminal', 'dark', '#050805', '#0d140d', '#d7ffd7', '#88b388', '#39ff14', 2, 'mono', 'Hacker green on black'),
  T('rose-quartz', 'Rose Quartz', 'light', '#fff5f7', '#ffffff', '#3b1220', '#7a4a5a', '#d6336c', 18, 'rounded', 'Soft and playful'),
  T('graphite', 'Graphite', 'dark', '#101114', '#1b1d22', '#eceef2', '#a0a6b2', '#8ab4ff', 8, 'system', 'Quiet developer dark'),
  T('sunset', 'Sunset', 'dark', '#160a14', '#2c1428', '#fff1f7', '#d7a9c4', '#ff7a45', 20, 'humanist', 'Magenta to orange dusk'),
];

const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');

export class ThemeError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

export function checkTheme(t) {
  const out = { name: String(t?.name || '').trim().slice(0, 40), mode: t?.mode === 'light' ? 'light' : 'dark', radius: Math.max(0, Math.min(32, Math.round(Number(t?.radius ?? 12)))), font: FONT_KEYS.includes(t?.font) ? t.font : 'system', vibe: String(t?.vibe || '').slice(0, 80) };
  if (out.name.length < 2) throw new ThemeError('Give the theme a name.');
  for (const k of ['bg', 'surface', 'text', 'muted', 'accent']) { const v = String(t?.[k] || '').trim(); if (!HEX.test(v)) throw new ThemeError(`${k} must be a color like #1a2b3c.`); out[k] = v.toLowerCase(); }
  return out;
}

export function report(t) {
  const checks = [['Text on background', t.text, t.bg, 4.5], ['Muted text on surface', t.muted, t.surface, 4.5], ['Accent on background', t.accent, t.bg, 3], ['Text on accent buttons', onAccent(t), t.accent, 4.5]];
  return checks.map(([label, fg, bg, min]) => { const r = contrast(fg, bg); return { label, ratio: Math.round(r * 100) / 100, min, ok: r >= min }; });
}
const onAccent = (t) => (contrast('#ffffff', t.accent) >= contrast('#0b0b0f', t.accent) ? '#ffffff' : '#0b0b0f');

export function tokens(t) {
  const border = mix(t.bg, t.text, 0.16), hover = mix(t.accent, t.mode === 'dark' ? '#ffffff' : '#000000', 0.14);
  return { '--dx-bg': t.bg, '--dx-surface': t.surface, '--dx-surface-2': mix(t.surface, t.text, 0.05), '--dx-text': t.text, '--dx-muted': t.muted, '--dx-accent': t.accent, '--dx-accent-hover': hover, '--dx-on-accent': onAccent(t), '--dx-border': border, '--dx-radius': `${t.radius}px`, '--dx-radius-sm': `${Math.max(2, Math.round(t.radius * 0.6))}px`, '--dx-font': FONTS[t.font], '--dx-shadow': t.mode === 'dark' ? '0 8px 30px rgba(0,0,0,.45)' : '0 6px 24px rgba(15,23,42,.10)' };
}

/** CSS for a theme. Element rules sit inside :where() so the site's own more specific rules still win where they exist. */
export function toCss(t, { elements = true } = {}) {
  const tk = tokens(t);
  const vars = Object.entries(tk).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  let css = `/* ${t.name} - generated by DevX Control */\n:root {\n${vars}\n  color-scheme: ${t.mode};\n}\n`;
  if (elements) css += `
:where(html) { background: var(--dx-bg); }
:where(body) { background: var(--dx-bg); color: var(--dx-text); font-family: var(--dx-font); }
:where(h1, h2, h3, h4, h5, h6) { color: var(--dx-text); font-family: var(--dx-font); }
:where(p, li, label, td, th) { color: var(--dx-text); }
:where(small, .muted, .text-muted) { color: var(--dx-muted); }
:where(a) { color: var(--dx-accent); }
:where(a:hover) { color: var(--dx-accent-hover); }
:where(button, .btn, input[type=submit], input[type=button]) { background: var(--dx-accent); color: var(--dx-on-accent); border: 1px solid transparent; border-radius: var(--dx-radius-sm); font-family: var(--dx-font); }
:where(button:hover, .btn:hover) { background: var(--dx-accent-hover); }
:where(input, select, textarea) { background: var(--dx-surface); color: var(--dx-text); border: 1px solid var(--dx-border); border-radius: var(--dx-radius-sm); font-family: var(--dx-font); }
:where(input, select, textarea, button, a):focus-visible { outline: 2px solid var(--dx-accent); outline-offset: 2px; }
:where(.card, article, section.panel, .panel, .box, .modal, dialog, aside) { background: var(--dx-surface); color: var(--dx-text); border: 1px solid var(--dx-border); border-radius: var(--dx-radius); box-shadow: var(--dx-shadow); }
:where(table) { border-color: var(--dx-border); }
:where(th, td) { border-color: var(--dx-border); }
:where(hr) { border-color: var(--dx-border); }
:where(code, pre, kbd) { background: var(--dx-surface-2); color: var(--dx-text); border-radius: var(--dx-radius-sm); }
`;
  return css;
}

export function toTailwind(t) {
  const tk = tokens(t);
  return `// tailwind.config.js (generated by DevX Control: ${t.name})\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: { bg: '${tk['--dx-bg']}', surface: '${tk['--dx-surface']}', ink: '${tk['--dx-text']}', muted: '${tk['--dx-muted']}', accent: '${tk['--dx-accent']}', 'accent-hover': '${tk['--dx-accent-hover']}', line: '${tk['--dx-border']}' },\n      borderRadius: { DEFAULT: '${tk['--dx-radius-sm']}', xl: '${tk['--dx-radius']}' },\n      fontFamily: { sans: [${JSON.stringify(FONTS[t.font])}] },\n    },\n  },\n};\n`;
}
export const toJson = (t) => JSON.stringify({ name: t.name, mode: t.mode, tokens: tokens(t) }, null, 2) + '\n';

export function makeThemes({ dataDir }) {
  const file = path.join(dataDir, 'themes.json');
  const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { custom: [], assign: {} }; } };
  const save = (d) => { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, file); };
  const all = () => [...BUILTIN, ...(load().custom || [])];
  const get = (id) => all().find((t) => t.id === id) || null;
  return {
    all, get,
    list: () => all().map((t) => ({ ...t, report: report(t) })),
    assignments: () => load().assign || {},
    assigned: (appId) => (load().assign || {})[appId] || null,
    create(input) {
      const d = load(); const t = checkTheme(input);
      let id = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'theme';
      if (all().some((x) => x.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;
      const row = { id, ...t, builtin: false, at: Date.now() };
      d.custom = [...(d.custom || []), row].slice(-60); save(d); return row;
    },
    remove(id) { const d = load(); const n = (d.custom || []).length; d.custom = (d.custom || []).filter((t) => t.id !== id); if (d.custom.length === n) return false; for (const k of Object.keys(d.assign || {})) if (d.assign[k] === id) delete d.assign[k]; save(d); return true; },
    looks: () => load().looks || {},
    lookOf: (appId) => (load().looks || {})[appId] || null,
    assignLook(appId, v) { const d = load(); d.looks = d.looks || {}; if (v) d.looks[appId] = { ...v, at: Date.now() }; else delete d.looks[appId]; save(d); },
    assign(appId, themeId) { const d = load(); d.assign = d.assign || {}; if (themeId) d.assign[appId] = themeId; else delete d.assign[appId]; save(d); },
  };
}
