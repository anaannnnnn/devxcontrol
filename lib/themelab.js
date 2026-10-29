// Theme lab: many more themes, from many places, and a way to apply them to the WHOLE project.
//  - Curated packs (editor and terminal palettes people love) built in.
//  - A generator: any hue, six styles, light or dark = thousands of themes, every one contrast-checked.
//  - Online libraries (fetched by the server, cached on disk): Base16 / Tinted Theming (hundreds), DaisyUI, Bootswatch, and
//    classless CSS libraries (Pico, Water, Simple, MVP, Sakura, ...). If a source is unreachable, the rest keeps working.
//  - Three strengths when applied: Soft (low specificity, site's own rules win), Full (role-based rules with !important plus a
//    Tailwind class remap) and Total (Full plus a small script that recolours every element by what it is, for sites with custom CSS).
import fs from 'node:fs';
import path from 'node:path';
import { tokens, contrast, report } from './themes.js';

/* ------------------------------ colour helpers ------------------------------ */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
export function hexToHsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; const d = mx - mn;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: ((h * 60) + 360) % 360, s, l };
}
const mixHex = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const HEX6 = /^#[0-9a-f]{6}$/i;
const isDark = (bg) => contrast(bg, '#ffffff') > contrast(bg, '#000000');
/** Nudge a colour's lightness until it reaches a contrast ratio against a background. */
export function ensureContrast(fg, bg, min) {
  if (contrast(fg, bg) >= min) return fg; const { h, s, l } = hexToHsl(fg); const up = contrast('#ffffff', bg) >= contrast('#000000', bg);
  for (let i = 1; i <= 40; i++) { const c = hslToHex(h, s, clamp(l + (up ? 1 : -1) * i * 0.02, 0, 1)); if (contrast(c, bg) >= min) return c; }
  return up ? '#ffffff' : '#000000';
}
const onAcc = (a) => Math.max(contrast('#ffffff', a), contrast('#0b0b0f', a));
const finish = (t) => {
  t.muted = ensureContrast(t.muted, t.surface, 4.5); t.text = ensureContrast(t.text, t.bg, 7); t.accent = ensureContrast(t.accent, t.bg, 3);
  if (onAcc(t.accent) < 4.5) { const { h, s, l } = hexToHsl(t.accent); for (let i = 1; i <= 25; i++) for (const d of [-1, 1]) { const c = hslToHex(h, s, clamp(l + d * i * 0.01, 0, 1)); if (onAcc(c) >= 4.5 && contrast(c, t.bg) >= 3) { t.accent = c; i = 99; break; } } }
  return t;
};

/* ------------------------------ generator ------------------------------ */
export const GEN_STYLES = ['soft', 'vivid', 'mono', 'pastel', 'neon', 'earth'];
const FONT_BY_STYLE = { soft: 'rounded', vivid: 'system', mono: 'mono', pastel: 'rounded', neon: 'system', earth: 'serif' };
/** Any hue 0-359 in a style, light or dark, makes a complete, contrast-checked theme. Id: gen:<hue>-<style>-<mode>[-<radius>] */
export function generate({ hue = 250, style = 'soft', mode = 'dark', radius } = {}) {
  hue = ((Math.round(hue) % 360) + 360) % 360; if (!GEN_STYLES.includes(style)) style = 'soft'; mode = mode === 'light' ? 'light' : 'dark';
  const dark = mode === 'dark'; const r = radius ?? { soft: 14, vivid: 10, mono: 4, pastel: 20, neon: 6, earth: 8 }[style];
  const P = {
    soft: { bg: [0.28, dark ? 0.09 : 0.97], sf: [0.25, dark ? 0.14 : 1], tx: [0.25, dark ? 0.94 : 0.12], mu: [0.18, dark ? 0.72 : 0.38], ac: [0.7, 0.62], ah: 0 },
    vivid: { bg: [0.1, dark ? 0.07 : 0.98], sf: [0.1, dark ? 0.12 : 1], tx: [0.1, dark ? 0.95 : 0.1], mu: [0.1, dark ? 0.7 : 0.4], ac: [0.95, 0.55], ah: 0 },
    mono: { bg: [0.02, dark ? 0.07 : 0.97], sf: [0.02, dark ? 0.12 : 1], tx: [0.02, dark ? 0.95 : 0.1], mu: [0.02, dark ? 0.68 : 0.4], ac: [0.5, 0.6], ah: 0 },
    pastel: { bg: [0.5, dark ? 0.16 : 0.96], sf: [0.45, dark ? 0.21 : 0.99], tx: [0.3, dark ? 0.93 : 0.18], mu: [0.2, dark ? 0.75 : 0.4], ac: [0.65, dark ? 0.75 : 0.55], ah: 0 },
    neon: { bg: [0.35, dark ? 0.05 : 0.96], sf: [0.3, dark ? 0.1 : 1], tx: [0.2, dark ? 0.96 : 0.1], mu: [0.2, dark ? 0.72 : 0.4], ac: [1, dark ? 0.6 : 0.4], ah: 40 },
    earth: { bg: [0.22, dark ? 0.1 : 0.95], sf: [0.2, dark ? 0.15 : 0.99], tx: [0.18, dark ? 0.9 : 0.15], mu: [0.15, dark ? 0.68 : 0.38], ac: [0.55, 0.5], ah: -20 },
  }[style];
  const t = { id: `gen:${hue}-${style}-${mode}${radius != null ? `-${r}` : ''}`, name: `${style[0].toUpperCase()}${style.slice(1)} ${hue}° ${dark ? 'dark' : 'light'}`, mode, pack: 'Generated', vibe: `${style} style at hue ${hue}`,
    bg: hslToHex(hue, P.bg[0], P.bg[1]), surface: hslToHex(hue, P.sf[0], P.sf[1]), text: hslToHex(hue, P.tx[0], P.tx[1]), muted: hslToHex(hue, P.mu[0], P.mu[1]), accent: hslToHex(hue + P.ah, P.ac[0], P.ac[1]), radius: r, font: FONT_BY_STYLE[style], builtin: true, generated: true };
  return finish(t);
}
export const parseGenId = (id) => { const m = /^gen:(\d{1,3})-(soft|vivid|mono|pastel|neon|earth)-(dark|light)(?:-(\d{1,2}))?$/.exec(String(id)); return m ? generate({ hue: +m[1], style: m[2], mode: m[3], radius: m[4] != null ? +m[4] : undefined }) : null; };

/* ------------------------------ curated packs ------------------------------ */
const P = (id, name, mode, bg, surface, text, muted, accent, pack, radius = 10, font = 'system') => finish({ id, name, mode, bg, surface, text, muted, accent, radius, font, pack, vibe: `${pack} palette`, builtin: true });
export const PACKS = [
  P('dracula', 'Dracula', 'dark', '#282a36', '#343746', '#f8f8f2', '#a3a8c3', '#bd93f9', 'Editor classics'),
  P('nord', 'Nord', 'dark', '#2e3440', '#3b4252', '#eceff4', '#a7b1c4', '#88c0d0', 'Editor classics'),
  P('nord-light', 'Nord Snow', 'light', '#eceff4', '#ffffff', '#2e3440', '#4c566a', '#5e81ac', 'Editor classics'),
  P('solarized-dark', 'Solarized Dark', 'dark', '#002b36', '#073642', '#93a1a1', '#839496', '#268bd2', 'Editor classics'),
  P('solarized-light', 'Solarized Light', 'light', '#fdf6e3', '#eee8d5', '#586e75', '#657b83', '#268bd2', 'Editor classics'),
  P('gruvbox-dark', 'Gruvbox Dark', 'dark', '#282828', '#3c3836', '#ebdbb2', '#bdae93', '#fabd2f', 'Editor classics', 6),
  P('gruvbox-light', 'Gruvbox Light', 'light', '#fbf1c7', '#f2e5bc', '#3c3836', '#665c54', '#af3a03', 'Editor classics', 6),
  P('tokyo-night', 'Tokyo Night', 'dark', '#1a1b26', '#24283b', '#c0caf5', '#9aa5ce', '#7aa2f7', 'Editor classics'),
  P('tokyo-day', 'Tokyo Day', 'light', '#e1e2e7', '#f2f3f8', '#343b58', '#565a6e', '#2e7de9', 'Editor classics'),
  P('catppuccin-mocha', 'Catppuccin Mocha', 'dark', '#1e1e2e', '#313244', '#cdd6f4', '#a6adc8', '#cba6f7', 'Catppuccin', 14),
  P('catppuccin-macchiato', 'Catppuccin Macchiato', 'dark', '#24273a', '#363a4f', '#cad3f5', '#a5adcb', '#c6a0f6', 'Catppuccin', 14),
  P('catppuccin-frappe', 'Catppuccin Frappe', 'dark', '#303446', '#414559', '#c6d0f5', '#a5adce', '#ca9ee6', 'Catppuccin', 14),
  P('catppuccin-latte', 'Catppuccin Latte', 'light', '#eff1f5', '#e6e9ef', '#4c4f69', '#5c5f77', '#8839ef', 'Catppuccin', 14),
  P('one-dark', 'One Dark', 'dark', '#282c34', '#21252b', '#abb2bf', '#9099a6', '#61afef', 'Editor classics'),
  P('one-light', 'One Light', 'light', '#fafafa', '#ffffff', '#383a42', '#5c6370', '#4078f2', 'Editor classics'),
  P('rose-pine', 'Rose Pine', 'dark', '#191724', '#1f1d2e', '#e0def4', '#9d99b8', '#c4a7e7', 'Rose Pine', 14),
  P('rose-pine-moon', 'Rose Pine Moon', 'dark', '#232136', '#2a273f', '#e0def4', '#a09cbd', '#c4a7e7', 'Rose Pine', 14),
  P('rose-pine-dawn', 'Rose Pine Dawn', 'light', '#faf4ed', '#fffaf3', '#575279', '#6e6a86', '#907aa9', 'Rose Pine', 14),
  P('everforest-dark', 'Everforest Dark', 'dark', '#2d353b', '#343f44', '#d3c6aa', '#a0a899', '#a7c080', 'Editor classics', 8),
  P('everforest-light', 'Everforest Light', 'light', '#fdf6e3', '#f4f0d9', '#5c6a72', '#6b7a82', '#8da101', 'Editor classics', 8),
  P('ayu-dark', 'Ayu Dark', 'dark', '#0b0e14', '#131721', '#bfbdb6', '#9a9890', '#e6b450', 'Editor classics'),
  P('ayu-light', 'Ayu Light', 'light', '#fcfcfc', '#ffffff', '#5c6166', '#6b7078', '#d36a00', 'Editor classics'),
  P('github-dark', 'GitHub Dark', 'dark', '#0d1117', '#161b22', '#e6edf3', '#9198a1', '#2f81f7', 'GitHub', 6),
  P('github-light', 'GitHub Light', 'light', '#ffffff', '#f6f8fa', '#1f2328', '#59636e', '#0969da', 'GitHub', 6),
  P('material-dark', 'Material Dark', 'dark', '#121212', '#1e1e1e', '#e0e0e0', '#a0a0a0', '#bb86fc', 'Material', 4),
  P('material-ocean', 'Material Ocean', 'dark', '#0f111a', '#1a1c25', '#a6accd', '#8f93a2', '#82aaff', 'Material', 4),
  P('material-palenight', 'Palenight', 'dark', '#292d3e', '#34324a', '#a6accd', '#959dcb', '#c792ea', 'Material', 6),
  P('monokai', 'Monokai', 'dark', '#272822', '#3e3d32', '#f8f8f2', '#b0ab8f', '#a6e22e', 'Editor classics', 3, 'mono'),
  P('night-owl', 'Night Owl', 'dark', '#011627', '#0b2942', '#d6deeb', '#8ea4b8', '#82aaff', 'Editor classics'),
  P('zenburn', 'Zenburn', 'dark', '#3f3f3f', '#4f4f4f', '#dcdccc', '#b0b0a0', '#8cd0d3', 'Editor classics', 4),
  P('oceanic-next', 'Oceanic Next', 'dark', '#1b2b34', '#343d46', '#d8dee9', '#a7adba', '#6699cc', 'Editor classics'),
  P('cobalt2', 'Cobalt2', 'dark', '#193549', '#122738', '#ffffff', '#b5c7d6', '#ffc600', 'Editor classics'),
  P('shades-of-purple', 'Shades of Purple', 'dark', '#2d2b55', '#1e1e3f', '#ffffff', '#a599e9', '#fad000', 'Editor classics'),
  P('horizon', 'Horizon', 'dark', '#1c1e26', '#232530', '#d5d8da', '#9a9cb0', '#e95678', 'Editor classics'),
  P('synthwave', 'Synthwave 84', 'dark', '#262335', '#34294f', '#ffffff', '#b0b5e0', '#ff7edb', 'Editor classics'),
  P('moonlight', 'Moonlight', 'dark', '#222436', '#2f334d', '#c8d3f5', '#a0abdb', '#82aaff', 'Editor classics'),
  P('kanagawa', 'Kanagawa', 'dark', '#1f1f28', '#2a2a37', '#dcd7ba', '#a6a18a', '#7e9cd8', 'Editor classics', 6),
  P('nightfox', 'Nightfox', 'dark', '#192330', '#212e3f', '#cdcecf', '#9a9ea8', '#719cd6', 'Editor classics'),
  P('tailwind-slate', 'Slate', 'dark', '#0f172a', '#1e293b', '#f1f5f9', '#94a3b8', '#38bdf8', 'Neutrals'),
  P('tailwind-zinc', 'Zinc', 'dark', '#09090b', '#18181b', '#fafafa', '#a1a1aa', '#a78bfa', 'Neutrals'),
  P('tailwind-stone', 'Stone Light', 'light', '#fafaf9', '#ffffff', '#1c1917', '#57534e', '#ea580c', 'Neutrals'),
  P('ink-paper', 'Ink and Paper', 'light', '#ffffff', '#f5f5f5', '#111111', '#555555', '#111111', 'Neutrals', 0, 'serif'),
  P('paper-black', 'Paper Black', 'dark', '#000000', '#111111', '#ffffff', '#aaaaaa', '#ffffff', 'Neutrals', 0),
  P('sepia', 'Sepia', 'light', '#f4ecd8', '#fbf5e6', '#433422', '#6b5a43', '#a0522d', 'Neutrals', 6, 'serif'),
  P('high-contrast', 'High Contrast', 'dark', '#000000', '#0a0a0a', '#ffffff', '#e0e0e0', '#ffff00', 'Accessibility', 4),
  P('high-contrast-light', 'High Contrast Light', 'light', '#ffffff', '#f2f2f2', '#000000', '#2b2b2b', '#0000cc', 'Accessibility', 4),
  P('forest', 'Forest', 'dark', '#0f1a14', '#16261d', '#e6f2ea', '#9bb8a6', '#4ade80', 'Nature', 12),
  P('ocean', 'Ocean', 'dark', '#06161f', '#0c2633', '#e3f4fb', '#8fb4c4', '#22d3ee', 'Nature', 14),
  P('sand-dune', 'Sand Dune', 'light', '#f6efe4', '#fffaf0', '#3a2f22', '#6f604d', '#c2692b', 'Nature', 10, 'humanist'),
  P('lavender-fields', 'Lavender Fields', 'light', '#f5f1fb', '#ffffff', '#2a2140', '#625580', '#7c4dff', 'Nature', 16, 'rounded'),
  P('cherry-blossom', 'Cherry Blossom', 'light', '#fff5f8', '#ffffff', '#3b1623', '#7d4a5c', '#e11d74', 'Nature', 18, 'rounded'),
  P('retro-amber', 'Retro Amber', 'dark', '#120c02', '#1d1405', '#ffd88a', '#c9a35c', '#ffb000', 'Retro', 2, 'mono'),
  P('retro-green', 'Retro Green', 'dark', '#020a02', '#071407', '#9dff9d', '#6fc46f', '#33ff33', 'Retro', 2, 'mono'),
  P('vaporwave', 'Vaporwave', 'dark', '#1a1033', '#2a1a4d', '#ffe9ff', '#d0a8e8', '#ff71ce', 'Retro', 12),
  P('coffee', 'Coffee', 'dark', '#1f1612', '#2d211b', '#f0e4d6', '#bfa993', '#d4a373', 'Warm', 10, 'humanist'),
  P('midnight-gold', 'Midnight Gold', 'dark', '#0c0c14', '#16162a', '#f5efe0', '#b8b09a', '#d4af37', 'Warm', 8, 'serif'),
];

/* ------------------------------ remote sources ------------------------------ */
const fromTokens = (id, name, mode, c, pack, extra = {}) => finish({ id, name, mode, bg: c.bg, surface: c.surface, text: c.text, muted: c.muted, accent: c.accent, radius: c.radius ?? 10, font: c.font || 'system', pack, vibe: `${pack} library`, builtin: true, remote: true, ...extra });
const h6 = (v) => { const s = String(v || '').trim().replace(/^#/, '').replace(/^["']|["']$/g, ''); return /^[0-9a-f]{6}$/i.test(s) ? `#${s.toLowerCase()}` : null; };

/** Base16 / Tinted Theming scheme (YAML). */
export function parseBase16(yaml, file = '') {
  const get = (k) => { const m = new RegExp(`^\\s*${k}\\s*:\\s*["']?([0-9a-fA-F]{6})["']?`, 'm').exec(yaml); return m ? `#${m[1].toLowerCase()}` : null; };
  const b = {}; for (let i = 0; i < 16; i++) { const k = `base${i.toString(16).toUpperCase().padStart(2, '0')}`; b[k] = get(k); } if (Object.values(b).some((v) => !v)) return null;
  const name = (/^\s*name\s*:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(yaml)?.[1] || file.replace(/\.ya?ml$/, '')).trim(); const variant = /^\s*variant\s*:\s*["']?(dark|light)/m.exec(yaml)?.[1];
  const mode = variant || (isDark(b.base00) ? 'dark' : 'light');
  const accents = ['base0D', 'base0E', 'base0B', 'base0C', 'base09', 'base08', 'base0A', 'base0F'].map((k) => b[k]);
  const sat = (c) => hexToHsl(c).s; const best = [...accents].sort((x, y) => sat(y) - sat(x))[0];
  const slug = file.replace(/\.ya?ml$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return fromTokens(`b16-${slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name.slice(0, 40), mode, { bg: b.base00, surface: b.base01, text: b.base05, muted: contrast(b.base03, b.base01) >= 4.5 ? b.base03 : b.base04, accent: b.base0D && sat(b.base0D) > 0.25 ? b.base0D : best }, 'Base16', { accents });
}
/** DaisyUI themes.js (hex colours). */
export function parseDaisy(text) {
  const out = []; const re = /["']?\[data-theme=([a-z0-9-]+)\]["']?\s*:\s*\{([^}]*)\}/gi; let m;
  while ((m = re.exec(text))) {
    const kv = {}; for (const x of m[2].matchAll(/["']?([a-z0-9-]+)["']?\s*:\s*["'](#[0-9a-fA-F]{6})["']/g)) kv[x[1]] = x[2].toLowerCase();
    const scheme = /color-scheme["']?\s*:\s*["'](dark|light)/.exec(m[2])?.[1]; if (!kv['base-100'] || !kv.primary) continue;
    const mode = scheme || (isDark(kv['base-100']) ? 'dark' : 'light');
    out.push(fromTokens(`daisy-${m[1]}`, `${m[1][0].toUpperCase()}${m[1].slice(1)}`, mode, { bg: kv['base-100'], surface: kv['base-200'] || mixHex(kv['base-100'], kv['base-content'] || '#000000', 0.06), text: kv['base-content'] || (mode === 'dark' ? '#e5e7eb' : '#1f2937'), muted: mixHex(kv['base-content'] || '#888888', kv['base-100'], 0.3), accent: kv.primary, radius: 10 }, 'DaisyUI', { accents: [kv.primary, kv.secondary, kv.accent].filter(Boolean) }));
  }
  return out;
}
/** Bootswatch / Bootstrap 5 stylesheet: read the :root custom properties. */
export function parseBootswatch(css, name) {
  const v = (k) => { const m = new RegExp(`--bs-${k}\\s*:\\s*([^;}]+)`).exec(css); return m ? m[1].trim() : null; };
  const hex = (x) => { if (!x) return null; if (/^#[0-9a-f]{3}$/i.test(x)) return `#${x.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase(); if (HEX6.test(x)) return x.toLowerCase(); const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(x); return m ? '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('') : null; };
  const bg = hex(v('body-bg')), text = hex(v('body-color')), accent = hex(v('primary')); if (!bg || !text || !accent) return null;
  const mode = isDark(bg) ? 'dark' : 'light'; const rem = parseFloat(v('border-radius') || '0.375'); const surface = hex(v('tertiary-bg')) || mixHex(bg, text, 0.05);
  return fromTokens(`bs-${name}`, `${name[0].toUpperCase()}${name.slice(1)}`, mode, { bg, surface, text, muted: hex(v('secondary-color')) || mixHex(text, bg, 0.35), accent, radius: Math.round((Number.isFinite(rem) ? rem : 0.375) * 16) }, 'Bootswatch', { stylesheet: name });
}
export const BOOTSWATCH = ['cerulean', 'cosmo', 'cyborg', 'darkly', 'flatly', 'journal', 'litera', 'lumen', 'lux', 'materia', 'minty', 'morph', 'pulse', 'quartz', 'sandstone', 'simplex', 'sketchy', 'slate', 'solar', 'spacelab', 'superhero', 'united', 'vapor', 'yeti', 'zephyr'];
const CDN = 'https://cdn.jsdelivr.net/npm';
/** Whole stylesheets. They restyle plain HTML (classless) or Bootstrap/Bulma class names; added last so they win ties. */
export const STYLESHEETS = [
  { id: 'css-pico', name: 'Pico', kind: 'classless', note: 'Elegant defaults for plain HTML. Light and dark.', href: `${CDN}/@picocss/pico@2/css/pico.min.css` },
  { id: 'css-water-auto', name: 'Water.css', kind: 'classless', note: 'Drop-in, follows light or dark.', href: `${CDN}/water.css@2/out/water.css` },
  { id: 'css-water-dark', name: 'Water.css Dark', kind: 'classless', note: 'Dark.', href: `${CDN}/water.css@2/out/dark.css` },
  { id: 'css-water-light', name: 'Water.css Light', kind: 'classless', note: 'Light.', href: `${CDN}/water.css@2/out/light.css` },
  { id: 'css-simple', name: 'Simple.css', kind: 'classless', note: 'Readable, minimal.', href: `${CDN}/simpledotcss/simple.min.css` },
  { id: 'css-sakura', name: 'Sakura', kind: 'classless', note: 'Soft, light typographic.', href: `${CDN}/sakura.css/css/sakura.css` },
  { id: 'css-sakura-dark', name: 'Sakura Dark', kind: 'classless', note: 'Dark version.', href: `${CDN}/sakura.css/css/sakura-dark.css` },
  { id: 'css-newcss', name: 'new.css', kind: 'classless', note: 'Bare-bones modern.', href: `${CDN}/@exampledev/new.css@1/new.min.css` },
  { id: 'css-milligram', name: 'Milligram', kind: 'classless', note: 'Tiny and clean.', href: `${CDN}/milligram@1.4.1/dist/milligram.min.css` },
  { id: 'css-chota', name: 'Chota', kind: 'classless', note: 'Micro framework.', href: `${CDN}/chota@0.9.2/dist/chota.min.css` },
  { id: 'css-bootstrap', name: 'Bootstrap 5', kind: 'framework', note: 'For sites that use Bootstrap class names.', href: `${CDN}/bootstrap@5.3.3/dist/css/bootstrap.min.css` },
  { id: 'css-bulma', name: 'Bulma', kind: 'framework', note: 'For sites that use Bulma class names.', href: `${CDN}/bulma@1.0.2/css/bulma.min.css` },
  ...BOOTSWATCH.map((n) => ({ id: `css-bs-${n}`, name: `Bootswatch ${n[0].toUpperCase()}${n.slice(1)}`, kind: 'framework', note: 'A full Bootstrap 5 theme.', href: `${CDN}/bootswatch@5.3.3/dist/${n}/bootstrap.min.css` })),
];

/* ------------------------------ CSS for the whole project ------------------------------ */
const TW_NEUTRALS = ['gray', 'slate', 'zinc', 'neutral', 'stone'];
const TW_ACCENTS = ['blue', 'indigo', 'violet', 'purple', 'sky', 'cyan', 'teal', 'fuchsia', 'pink', 'rose', 'emerald', 'lime', 'orange', 'amber', 'yellow', 'red', 'green'];
const cls = (arr, pre) => arr.map((c) => `[class~="${pre}${c}"]`).join(',');
function tailwindRemap(t) {
  const n = (shades, pre) => TW_NEUTRALS.flatMap((c) => shades.map((s) => `[class~="${pre}${c}-${s}"]`)).join(',');
  const a = (shades, pre) => ['blue', 'indigo', 'violet', 'purple', 'sky', 'cyan', 'teal', 'fuchsia', 'pink', 'rose'].flatMap((c) => shades.map((s) => `[class~="${pre}${c}-${s}"]`)).join(',');
  const dk = t.mode === 'dark';
  return `
/* Tailwind class remap: the site's own utility classes now point at this theme */
${n([50], 'bg-')},${n([50], 'hover\\:bg-')}{background-color:var(--dx-bg)!important}
[class~="bg-white"],${n([100], 'bg-')}{background-color:var(--dx-surface)!important}
${n([200, 300], 'bg-')},${n([100, 200], 'hover\\:bg-')},[class~="hover\\:bg-white"]{background-color:var(--dx-surface-2)!important}
${n([700, 800], 'bg-')}{background-color:${dk ? 'var(--dx-surface-2)' : 'var(--dx-surface)'}!important}
${n([900, 950], 'bg-')},[class~="bg-black"]{background-color:${dk ? 'var(--dx-bg)' : 'var(--dx-surface-2)'}!important}
${n([800, 900, 950], 'text-')},[class~="text-black"]{color:var(--dx-text)!important}
${n([100, 200, 300], 'text-')},[class~="text-white"]:not([class*="bg-"]):not(button):not(a[class*="btn"]){color:var(--dx-text)!important}
${n([400, 500, 600, 700], 'text-')}{color:var(--dx-muted)!important}
${n([100, 200, 300, 400], 'border-')},[class~="border-white"],[class~="divide-gray-200"]>*+*{border-color:var(--dx-border)!important}
${a([400, 500, 600, 700], 'bg-')},${a([400, 500, 600, 700], 'hover\\:bg-')}{background-color:var(--dx-accent)!important;color:var(--dx-on-accent)!important}
${a([100, 200], 'bg-')}{background-color:color-mix(in srgb,var(--dx-accent) 16%,var(--dx-surface))!important}
${a([400, 500, 600, 700], 'text-')},${a([400, 500, 600, 700], 'hover\\:text-')}{color:var(--dx-accent)!important}
${a([300, 400, 500, 600], 'border-')},${a([300, 400, 500, 600], 'ring-')}{border-color:var(--dx-accent)!important}
${cls(['2xl', 'xl', 'lg', 'md', 'sm'].map((s) => s), 'rounded-')},[class~="rounded"]{border-radius:var(--dx-radius)!important}
[class~="rounded-full"]{border-radius:9999px!important}
${cls(['sm', 'md', 'lg', 'xl', '2xl'], 'shadow-')},[class~="shadow"]{box-shadow:var(--dx-shadow)!important}
`;
}
/** Soft keeps the site's own rules in charge; Full is role-based and wins; Total is Full (the script does the rest). */
export function toCssFull(t, { strength = 'full', tailwind = true } = {}) {
  const tk = tokens(t); const vars = Object.entries(tk).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  const head = `/* ${t.name} - ${strength} theme generated by DevX Control. Remove the link to undo. */\n:root {\n${vars}\n  color-scheme: ${t.mode};\n}\n`;
  const imp = strength === 'soft' ? '' : ' !important'; const w = (s) => (strength === 'soft' ? `:where(${s})` : s);
  const R = [];
  R.push(`${w('html')}{background:var(--dx-bg)${imp};accent-color:var(--dx-accent)}`);
  R.push(`${w('body')}{background:var(--dx-bg)${imp};color:var(--dx-text)${imp};font-family:var(--dx-font)${imp}}`);
  R.push(`${w('h1,h2,h3,h4,h5,h6,p,li,dt,dd,label,legend,summary,blockquote,figcaption,td,th,caption')}{color:var(--dx-text)${imp};font-family:var(--dx-font)${imp}}`);
  R.push(`${w('small,.muted,.text-muted,.subtitle,.hint,.help,.caption,.meta,time')}{color:var(--dx-muted)${imp}}`);
  R.push(`${w('a')}{color:var(--dx-accent)${imp}}${w('a:hover')}{color:var(--dx-accent-hover)${imp}}`);
  const btn = 'button:not([class*="ghost"]):not([class*="link"]):not([class*="close"]):not([class*="icon"]):not([aria-label]),.btn,.button,input[type=submit],input[type=button],[role=button]:not(a),a[class*="btn"],a.button';
  R.push(`${w(btn)}{background:var(--dx-accent)${imp};color:var(--dx-on-accent)${imp};border:1px solid transparent${imp};border-radius:var(--dx-radius-sm)${imp};font-family:var(--dx-font)${imp}}`);
  R.push(`${w('button:hover,.btn:hover,.button:hover,input[type=submit]:hover,a[class*="btn"]:hover')}{background:var(--dx-accent-hover)${imp}}`);
  R.push(`${w('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=submit]):not([type=button]),select,textarea')}{background:var(--dx-surface)${imp};color:var(--dx-text)${imp};border:1px solid var(--dx-border)${imp};border-radius:var(--dx-radius-sm)${imp};font-family:var(--dx-font)${imp}}`);
  R.push(`${w('input,select,textarea')}::placeholder{color:var(--dx-muted)${imp}}`);
  R.push(`${w('input,select,textarea,button,a,summary')}:focus-visible{outline:2px solid var(--dx-accent)${imp};outline-offset:2px}`);
  const surf = '.card,article,.panel,.box,.modal,dialog,aside,details,.dropdown-menu,.popover,.tooltip,.sidebar,[class*="card"],[class*="panel"],[class*="modal"],[class*="dropdown"],[class*="popover"],[class*="sidebar"],[class*="drawer"],[role=dialog],[role=menu],[role=listbox]';
  R.push(`${w(surf)}{background:var(--dx-surface)${imp};color:var(--dx-text)${imp};border-color:var(--dx-border)${imp};border-radius:var(--dx-radius)${imp};box-shadow:var(--dx-shadow)${imp}}`);
  R.push(`${w('nav,header,footer,[role=navigation],[role=banner],[role=contentinfo],.navbar,.nav,.topbar,.header,.footer')}{background:var(--dx-surface)${imp};color:var(--dx-text)${imp};border-color:var(--dx-border)${imp}}`);
  R.push(`${w('table')}{background:var(--dx-surface)${imp};color:var(--dx-text)${imp};border-color:var(--dx-border)${imp};border-collapse:collapse}`);
  R.push(`${w('th')}{background:var(--dx-surface-2)${imp};border-color:var(--dx-border)${imp}}${w('td')}{border-color:var(--dx-border)${imp}}${w('tbody tr:nth-child(even)')}{background:color-mix(in srgb,var(--dx-surface-2) 55%,transparent)${imp}}${w('tbody tr:hover')}{background:var(--dx-surface-2)${imp}}`);
  R.push(`${w('hr')}{border-color:var(--dx-border)${imp}}${w('code,pre,kbd,samp')}{background:var(--dx-surface-2)${imp};color:var(--dx-text)${imp};border-radius:var(--dx-radius-sm)${imp};font-family:ui-monospace,SFMono-Regular,Menlo,monospace}`);
  R.push(`${w('blockquote')}{border-left:3px solid var(--dx-accent)${imp};background:var(--dx-surface)${imp}}`);
  R.push(`${w('.badge,.chip,.tag,.pill,[class*="badge"],[class*="chip"],[class*="pill"]')}{background:color-mix(in srgb,var(--dx-accent) 16%,var(--dx-surface))${imp};color:var(--dx-text)${imp};border-radius:999px${imp}}`);
  R.push(`${w('.alert,.notice,.toast,[class*="alert"],[class*="notice"],[class*="toast"]')}{background:var(--dx-surface-2)${imp};color:var(--dx-text)${imp};border-left:4px solid var(--dx-accent)${imp};border-radius:var(--dx-radius-sm)${imp}}`);
  R.push(`${w('progress,meter')}{accent-color:var(--dx-accent)}::selection{background:var(--dx-accent);color:var(--dx-on-accent)}`);
  if (strength !== 'soft') R.push(`*,*::before,*::after{border-color:var(--dx-border)}`);
  let css = head + R.join('\n') + '\n';
  if (strength !== 'soft' && tailwind) css += tailwindRemap(t);
  return css;
}

/* ------------------------------ Total mode: recolour every element by role ------------------------------ */
export const recolorJs = (t) => `/* ${t.name} recolour - generated by DevX Control */
(function(){var T=${JSON.stringify({ mode: t.mode, bg: t.bg, surface: t.surface, text: t.text, muted: t.muted, accent: t.accent, border: tokens(t)['--dx-border'], s2: tokens(t)['--dx-surface-2'], on: tokens(t)['--dx-on-accent'] })};
function P(c){var m=/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+%?))?/.exec(c||'');if(m){var a=m[4]===undefined?1:(/%$/.test(m[4])?parseFloat(m[4])/100:parseFloat(m[4]));return{r:+m[1],g:+m[2],b:+m[3],a:a}}m=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c||'');return m?{r:parseInt(m[1],16),g:parseInt(m[2],16),b:parseInt(m[3],16),a:1}:null}
function hsl(c){var r=c.r/255,g=c.g/255,b=c.b/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn,h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360}return{h:h,s:s,l:l}}
function hex(c){return'#'+[c.r,c.g,c.b].map(function(x){return Math.round(x).toString(16).padStart(2,'0')}).join('')}
function mix(a,b,t){a=P(a);b=P(b);return hex({r:a.r+(b.r-a.r)*t,g:a.g+(b.g-a.g)*t,b:a.b+(b.b-a.b)*t})}
function lum(c){c=P(c);var f=function(x){x/=255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b)}
function ratio(a,b){var x=lum(a),y=lum(b);if(x<y){var z=x;x=y;y=z}return(x+.05)/(y+.05)}
var dark=T.mode==='dark';
var bb=P(getComputedStyle(document.body).backgroundColor);if(!bb||bb.a<.5)bb=P(getComputedStyle(document.documentElement).backgroundColor);
var srcDark=bb&&bb.a>=.5?hsl(bb).l<.5:dark;
function semantic(h,s){return s>.35&&((h<18||h>345)||(h>85&&h<160)||(h>30&&h<50))}
function roleBg(l){if(!srcDark)return l>=.985?'surface':l>=.93?'bg':l>=.85?'s2':l>=.6?'border':l>=.25?'mid':'deep';return l<=.04?'deepest':l<=.1?'bg':l<=.16?'surface':l<=.24?'s2':l<=.4?'border':l<=.7?'mid':'bright'}
var DEEP=mix(T.bg,'#000000',.35),MID=mix(T.border,T.muted,.5);
function themeBg(role){switch(role){case'surface':return T.surface;case'bg':return T.bg;case's2':return T.s2;case'border':return T.border;case'mid':return MID;case'deepest':return DEEP;case'deep':return dark?DEEP:T.text;case'bright':return T.text}return T.bg}
function pickText(strong,eb,min){var c=[strong,T.text,T.bg,T.surface,'#ffffff','#000000'];for(var i=0;i<c.length;i++)if(ratio(c[i],eb)>=min)return c[i];return c[1]}
var css=document.getElementById('dx-recolor-style');if(!css){css=document.createElement('style');css.id='dx-recolor-style';css.textContent='button:hover,a:hover{filter:brightness(1.08)}';document.head.appendChild(css)}
var seen=new WeakMap();
function walk(){var els=document.querySelectorAll('body, body *');
 for(var i=0;i<els.length;i++){var el=els[i];if(/^(SCRIPT|STYLE|LINK|META|BR|NOSCRIPT|PATH|G|CIRCLE|RECT|LINE|POLYGON|POLYLINE|ELLIPSE|DEFS|USE|STOP|TITLE)$/i.test(el.tagName))continue;
 var cs=getComputedStyle(el),bg=P(cs.backgroundColor),fg=P(cs.color),bd=P(cs.borderTopColor),key=cs.backgroundColor+'|'+cs.color+'|'+cs.borderTopColor+'|'+cs.backgroundImage;
 var par=el.parentElement,peb=(par&&par.__dxeb)||T.bg;if(seen.get(el)===key){el.__dxeb=el.__dxeb||peb;continue}
 var eb=peb,onAcc=false;
 if(bg&&bg.a>=.04){var k=hsl(bg);if(k.s>=.2&&k.l>.1&&k.l<.93){if(!semantic(k.h,k.s)){eb=T.accent;onAcc=true;el.style.setProperty('background-color',T.accent,'important')}}else{eb=themeBg(roleBg(k.l));el.style.setProperty('background-color',eb,'important')}}
 else if(cs.backgroundImage&&/gradient/.test(cs.backgroundImage)){eb=mix(T.accent,T.bg,.55);el.style.setProperty('background-image','linear-gradient(135deg,'+T.accent+','+eb+')','important')}
 el.__dxeb=eb;
 if(fg){var tx=null;if(onAcc)tx=pickText(T.on,eb,4.5);else{var kf=hsl(fg);if(kf.s<.2||kf.l<.1||kf.l>.9){var bl=srcDark?.1:.95;var diff=Math.abs(kf.l-(par&&par.__dxsrc!==undefined?par.__dxsrc:srcDark?.1:.97));var strong=diff>.5;tx=strong?pickText(T.text,eb,4.5):pickText(T.muted,eb,3.5)}else if(!semantic(kf.h,kf.s)){tx=pickText(T.accent,eb,3)}}
  if(tx)el.style.setProperty('color',tx,'important')}
 if(bd&&bd.a>.04&&parseFloat(cs.borderTopWidth)>0){var kb=hsl(bd);var nb=kb.s<.25?T.border:(semantic(kb.h,kb.s)?null:T.accent);if(nb)el.style.setProperty('border-color',nb,'important')}
 if(cs.boxShadow&&cs.boxShadow!=='none'&&!/inset/.test(cs.boxShadow))el.style.setProperty('box-shadow',dark?'0 8px 30px rgba(0,0,0,.45)':'0 6px 24px rgba(15,23,42,.10)','important');
 if(bg&&bg.a>=.04)el.__dxsrc=hsl(bg).l;
 seen.set(el,key)}}
function run(){try{document.documentElement.style.setProperty('background-color',T.bg,'important');document.body.style.setProperty('background-color',T.bg,'important');document.body.style.setProperty('color',T.text,'important');document.body.__dxeb=T.bg;walk()}catch(e){}}
var tm=0;function later(){clearTimeout(tm);tm=setTimeout(run,250)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
if(window.MutationObserver)new MutationObserver(later).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
window.__dxRecolor=run;})();
`;

/* ------------------------------ the lab: lookup, caching, remote sources ------------------------------ */
export function makeThemeLab({ dataDir, themes, fetchImpl = fetch, ttl = 7 * 24 * 3600 * 1000 }) {
  const dir = path.join(dataDir, 'themecache'); fs.mkdirSync(dir, { recursive: true });
  const file = (k) => path.join(dir, `${k}.json`);
  const read = (k) => { try { return JSON.parse(fs.readFileSync(file(k), 'utf8')); } catch { return null; } };
  const write = (k, v) => fs.writeFileSync(file(k), JSON.stringify(v));
  const get = async (url, ms = 12000, asText = true) => { const r = await fetchImpl(url, { signal: AbortSignal.timeout(ms), headers: { 'user-agent': 'DevX-Control', accept: '*/*' } }); if (!r.ok) throw new Error(`${url.split('/').slice(2, 3)} answered ${r.status}`); return asText ? r.text() : r.json(); };
  const pool = async (items, n, fn) => { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const x = items[i++]; try { const v = await fn(x); if (v) out.push(v); } catch { /* skip one */ } } })); return out; };
  const SOURCES = {
    base16: async () => { const list = await get('https://api.github.com/repos/tinted-theming/schemes/contents/base16', 15000, false); const names = list.filter((x) => /\.ya?ml$/.test(x.name)).map((x) => x.name); return pool(names, 8, async (n) => parseBase16(await get(`https://raw.githubusercontent.com/tinted-theming/schemes/main/base16/${n}`, 10000), n)); },
    daisyui: async () => { for (const u of [`${CDN}/daisyui@3.9.4/src/theming/themes.js`, 'https://unpkg.com/daisyui@3.9.4/src/theming/themes.js']) { try { const r = parseDaisy(await get(u)); if (r.length) return r; } catch { /* next mirror */ } } throw new Error('DaisyUI themes could not be read'); },
    bootswatch: async () => pool(BOOTSWATCH, 6, async (n) => parseBootswatch(await get(`${CDN}/bootswatch@5.3.3/dist/${n}/bootstrap.min.css`, 15000), n)),
  };
  const meta = { base16: 'Base16 / Tinted Theming', daisyui: 'DaisyUI', bootswatch: 'Bootswatch' };
  async function refresh(src, { force = false } = {}) {
    if (!SOURCES[src]) throw Object.assign(new Error('Unknown source.'), { status: 404 });
    const c = read(src); if (c && !force && Date.now() - c.at < ttl) return c;
    const items = await SOURCES[src](); if (!items.length) throw new Error(`${meta[src]} returned nothing`);
    const row = { at: Date.now(), items }; write(src, row); return row;
  }
  const remoteItems = () => Object.keys(SOURCES).flatMap((s) => read(s)?.items || []);
  return {
    SOURCES: Object.keys(SOURCES), meta, refresh,
    status: () => Object.keys(SOURCES).map((s) => { const c = read(s); return { id: s, label: meta[s], count: c?.items?.length || 0, at: c?.at || null }; }),
    /** Every theme by id: custom and builtin (themes.js), packs, generated, and cached online libraries. */
    find(id) { return themes.get(id) || PACKS.find((t) => t.id === id) || parseGenId(id) || remoteItems().find((t) => t.id === id) || null; },
    stylesheet: (id) => STYLESHEETS.find((s) => s.id === id) || null,
    /** Paged browse over everything that can be listed. */
    browse({ q = '', mode = '', pack = '', offset = 0, limit = 60 } = {}) {
      const all = [...themes.all(), ...PACKS, ...remoteItems()]; const seen = new Set(); const uniq = all.filter((t) => !seen.has(t.id) && seen.add(t.id));
      const needle = String(q).toLowerCase(); const rows = uniq.filter((t) => (!mode || t.mode === mode) && (!pack || (t.pack || 'DevX') === pack) && (!needle || `${t.name} ${t.pack || ''} ${t.vibe || ''}`.toLowerCase().includes(needle)));
      return { total: rows.length, items: rows.slice(offset, offset + limit).map((t) => ({ id: t.id, name: t.name, mode: t.mode, pack: t.pack || 'DevX', bg: t.bg, surface: t.surface, text: t.text, muted: t.muted, accent: t.accent, radius: t.radius, font: t.font, accents: t.accents || undefined })), packs: [...new Set(uniq.map((t) => t.pack || 'DevX'))] };
    },
    report,
  };
}
