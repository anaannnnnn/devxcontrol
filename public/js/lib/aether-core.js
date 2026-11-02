// Aether look for DevX Control's own console (not the apps it manages).
// Pure data + CSS builder: no DOM, so the browser runtime and the tests share it.
// Every theme becomes the console's real design tokens (--bg, --panel, --text, --accent ...),
// contrast-checked, in both dark and light mode. User strings never reach CSS unvalidated.
import { THEMES, TEXTURES, FONTS, MOTION } from './aether-data.js';

export { THEMES, TEXTURES, FONTS, MOTION };

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const num = (v, a, b, d) => (Number.isFinite(+v) && v !== null && v !== '' ? clamp(+v, a, b) : d);

// ---------- colour math ----------
export const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
export function hsl2hex(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (!s) return rgb2hex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return rgb2hex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
}
export const hexHsl = (h) => rgb2hsl(...hex2rgb(h));
export const mix = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
export const rgbList = (hex) => hex2rgb(hex).join(',');
export const rgba = (hex, a) => `rgba(${rgbList(hex)},${a})`;
export function luminance(hex) {
  const [r, g, b] = hex2rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Move `fg` lighter (dir 1) or darker (dir -1) until it reaches `min` contrast on `bg`. */
export function ensureContrast(fg, bg, min, dir) {
  if (contrast(fg, bg) >= min) return fg;
  const [h, s, l] = hexHsl(fg);
  for (let i = 1; i <= 40; i++) {
    const c = hsl2hex(h, s, clamp(l + dir * i * 0.025, 0, 1));
    if (contrast(c, bg) >= min) return c;
  }
  return dir > 0 ? '#ffffff' : '#000000';
}
const inkOn = (bg) => (contrast('#06080c', bg) >= contrast('#ffffff', bg) ? '#06080c' : '#ffffff');

// ---------- state ----------
export const DEFAULTS = {
  on: false, theme: 'liquid-glass', accent: '', accent2: '', bodyFont: '', headFont: '', texture: '', motion: '',
  texOpacity: 0.5, texScale: 1, grain: 0.22, vignette: 0.3,
  radius: -1, blur: -1, panelAlpha: -1, border: 1, glow: 0.6,
  lift: -1, cursor: 'off', tracking: 0, favorites: [],
};
export const CURSORS = ['off', 'dot', 'ring', 'trail', 'spotlight'];

export const getTheme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
export const getTexture = (id) => TEXTURES.find((t) => t.id === id) || TEXTURES.find((t) => t.id === 'none');
const fontOk = (f) => (typeof f === 'string' && FONTS.some((x) => x.family === f) ? f : '');

export function normalize(input) {
  const s = input && typeof input === 'object' ? input : {};
  const col = (v) => (HEX.test(v || '') ? v.toLowerCase() : '');
  return {
    on: !!s.on,
    theme: THEMES.some((t) => t.id === s.theme) ? s.theme : DEFAULTS.theme,
    accent: col(s.accent), accent2: col(s.accent2),
    bodyFont: fontOk(s.bodyFont), headFont: fontOk(s.headFont),
    texture: TEXTURES.some((t) => t.id === s.texture) ? s.texture : '',
    motion: MOTION.some((m) => m.id === s.motion) ? s.motion : '',
    texOpacity: num(s.texOpacity, 0, 1, DEFAULTS.texOpacity), texScale: num(s.texScale, 0.4, 3, 1),
    grain: num(s.grain, 0, 1, DEFAULTS.grain), vignette: num(s.vignette, 0, 1, DEFAULTS.vignette),
    radius: num(s.radius, -1, 44, -1), blur: num(s.blur, -1, 60, -1), panelAlpha: num(s.panelAlpha, -1, 1, -1),
    border: num(s.border, 0, 4, 1), glow: num(s.glow, 0, 1.5, 0.6), lift: num(s.lift, -1, 14, -1),
    cursor: CURSORS.includes(s.cursor) ? s.cursor : 'off', tracking: num(s.tracking, -0.05, 0.2, 0),
    favorites: Array.isArray(s.favorites) ? s.favorites.filter((id) => THEMES.some((t) => t.id === id)).slice(0, 64) : [],
  };
}

/** Theme + overrides -> concrete values. */
export function resolve(state) {
  const s = normalize(state), t = getTheme(s.theme);
  const m = MOTION.find((x) => x.id === (s.motion || t.motion)) || MOTION[0];
  return {
    s, theme: t, motion: m,
    accent: s.accent || t.accent, accent2: s.accent2 || t.accent2,
    bodyFont: s.bodyFont || t.font, headFont: s.headFont || t.head,
    texture: s.texture || t.texture,
    radius: s.radius >= 0 ? s.radius : t.radius, blur: s.blur >= 0 ? s.blur : t.blur,
    panelAlpha: s.panelAlpha >= 0 ? s.panelAlpha : (t.blur >= 14 ? 0.62 : 0.94),
    lift: s.lift >= 0 ? s.lift : m.lift,
  };
}

// ---------- tokens ----------
/** The console's real token set for one theme in one mode. */
export function deriveTokens(r, mode) {
  const [bh, bs] = hexHsl(r.theme.bg);
  const [ah] = hexHsl(r.accent);
  const h = bs > 0.06 ? bh : ah;               // neutral blacks borrow the accent hue
  const dark = mode !== 'light';
  let bg, rail, panel, panel2, raise, line, lineSoft, text, text2, text3, accent;
  if (dark) {
    const sat = clamp(Math.max(bs, 0.14), 0.1, 0.42), L0 = clamp(hexHsl(r.theme.bg)[2], 0.012, 0.09);
    const at = (d) => hsl2hex(h, sat, L0 + d);
    bg = hsl2hex(h, sat, L0); rail = at(0.022); panel = at(0.05); panel2 = at(0.085); raise = at(0.125);
    line = at(0.17); lineSoft = at(0.1);
    text = mix(hsl2hex(h, 0.3, 0.95), '#ffffff', 0.35);
    text2 = ensureContrast(mix(text, panel, 0.34), panel, 7, 1);
    text3 = ensureContrast(mix(text, panel, 0.55), panel, 4.7, 1);
    accent = ensureContrast(r.accent, panel, 4.6, 1);
  } else {
    bg = hsl2hex(h, 0.3, 0.955); rail = hsl2hex(h, 0.28, 0.925); panel = '#ffffff'; panel2 = hsl2hex(h, 0.3, 0.975);
    raise = hsl2hex(h, 0.26, 0.925); line = hsl2hex(h, 0.2, 0.81); lineSoft = hsl2hex(h, 0.22, 0.88);
    text = hsl2hex(h, 0.4, 0.09); text2 = ensureContrast(hsl2hex(h, 0.25, 0.28), panel, 7, -1); text3 = ensureContrast(hsl2hex(h, 0.2, 0.38), panel, 4.7, -1);
    accent = ensureContrast(r.accent, panel, 4.6, -1);
  }
  const accent2 = ensureContrast(r.accent2, panel, 3.2, dark ? 1 : -1);
  const accent3 = mix(accent, accent2, 0.5);
  return {
    dark, bg, rail, panel, panel2, raise, line, lineSoft, text, text2, text3, accent, accent2, accent3,
    ink: inkOn(accent), raw: { accent: r.accent, accent2: r.accent2 },
  };
}

const stack = (f, group) => `"${f}",${group === 'Serif' ? 'Georgia,serif' : group === 'Mono' ? 'ui-monospace,Menlo,monospace' : 'system-ui,-apple-system,"Segoe UI",sans-serif'}`;
export const fontStack = (family) => stack(family, (FONTS.find((f) => f.family === family) || {}).group);

const SURF = '.panel,.vessel,.stat,.upd,.tabs,.dialog,.sysmenu,.palette,.card,.sheet';
const CHROME = `${SURF},.pill,.dock`;
const LIFT = '.vessel,.stat,.card,.upd';

/** Whole stylesheet for the Aether look in the given mode. */
export function buildCss(state, mode) {
  const r = resolve(state), s = r.s, t = deriveTokens(r, mode), m = r.motion;
  const light = !t.dark;
  const glow = s.glow * (light ? 0.55 : 1);
  const rad = Math.round(r.radius), inner = Math.max(2, Math.round(r.radius * 0.55));
  const shadow = light
    ? `0 1px 2px ${rgba(t.text, 0.06)},0 10px 28px -14px ${rgba(t.text, 0.28)},0 0 ${Math.round(34 * glow)}px -16px ${rgba(t.accent, 0.5 * glow)}`
    : `0 1px 0 rgba(255,255,255,.04) inset,0 14px 38px -14px rgba(0,0,0,.72),0 0 ${Math.round(46 * glow)}px -18px ${rgba(r.accent, 0.75 * glow)}`;
  const vars = {
    '--bg': t.bg, '--rail': t.rail, '--panel': t.panel, '--panel-2': t.panel2, '--raise': t.raise, '--line': t.line, '--line-soft': t.lineSoft,
    '--text': t.text, '--text-2': t.text2, '--text-3': t.text3, '--accent': t.accent, '--accent-2': t.accent2, '--accent-3': t.accent3,
    '--accent-ink': t.ink, '--accent-soft': rgba(t.accent, light ? 0.1 : 0.15), '--scrim': rgba(t.bg, light ? 0.42 : 0.7),
    '--shadow': shadow, '--glow': `0 0 0 1px ${rgba(t.accent, 0.22)},0 0 ${Math.round(36 * glow)}px -8px ${rgba(t.accent, 0.5 * glow)}`,
    '--grad': `linear-gradient(115deg,${t.accent},${t.accent2})`, '--glass-line': light ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.14)',
    '--glass': light ? 'rgba(255,255,255,.7)' : rgba(t.panel, 0.55), '--glass-2': light ? 'rgba(255,255,255,.55)' : rgba(t.panel2, 0.5),
    '--r-panel': `${rad}px`, '--r-inner': `${inner}px`,
    // shadcn/ui token names (v4 style, full colours) so shadcn-compatible islands inherit the look.
    // --accent is intentionally not aliased: the console already uses it as the brand colour.
    '--background': t.bg, '--foreground': t.text, '--card': t.panel, '--card-foreground': t.text,
    '--popover': t.panel2, '--popover-foreground': t.text, '--primary': t.accent, '--primary-foreground': t.ink,
    '--secondary': t.raise, '--secondary-foreground': t.text, '--muted': t.panel2, '--muted-foreground': t.text3,
    '--destructive': light ? '#c42b2b' : '#d03b3b', '--border': t.line, '--input': t.lineSoft, '--ring': t.accent, '--radius': `${rad}px`,
    '--f-display': fontStack(r.headFont), '--f-body': fontStack(r.bodyFont),
    '--ax-accent-rgb': rgbList(t.accent), '--ax-accent2-rgb': rgbList(t.accent2),
    '--ax-ease': m.ease, '--ax-dur': `${m.dur}s`, '--ax-lift': `${r.lift}px`, '--ax-press': String(m.press),
    '--ax-bw': `${s.border}px`, '--ax-tex-op': String(s.texOpacity),
  };
  const decl = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
  const blur = Math.round(r.blur), alpha = Math.round(r.panelAlpha * 100);
  const tex = getTexture(r.texture).css;
  const reduce = '@media (prefers-reduced-motion:reduce){html[data-aether] *{transition-duration:.001s!important;animation-duration:.001s!important}}';
  const css = [
    `html:root[data-aether]{${decl}}`,
    `html[data-aether] body{letter-spacing:${s.tracking}em;background:var(--bg)}`,
    // surfaces: radius, border, blur, depth
    `html[data-aether] :is(${SURF}){border-radius:var(--r-panel)!important;border-width:${s.border}px!important;border-color:var(--line)!important;box-shadow:var(--shadow)!important}`,
    `html[data-aether] :is(${CHROME}){background-color:color-mix(in srgb,var(--panel) ${alpha}%,transparent)!important;backdrop-filter:blur(${blur}px) saturate(${light ? 1.1 : 1.35})!important;-webkit-backdrop-filter:blur(${blur}px) saturate(${light ? 1.1 : 1.35})!important}`,
    `html[data-aether] :is(.btn,.field,textarea.field,.cta,.menu-row,.sheet-item){border-radius:var(--r-inner)!important}`,
    `html[data-aether] :is(.btn.primary,.cta){background:var(--grad)!important;color:var(--accent-ink)!important;border-color:transparent!important;box-shadow:0 10px 26px -12px ${rgba(t.accent, 0.8)}!important}`,
    `html[data-aether] :is(.chip,.pill,.badge){border-radius:999px}`,
    // legibility: the shipped sheets hard-code white text for stat numbers and selected states
    `html[data-aether] .stat .v{color:var(--text)!important;text-shadow:0 0 18px ${rgba(t.accent, light ? 0.25 : 0.5)}}`,
    `html[data-aether] :is(.pill .nv[aria-current="page"],.subtabs button[aria-selected="true"],.dock .dk[aria-current="page"]){color:var(--text)!important;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 34%,transparent),color-mix(in srgb,var(--accent-2) 26%,transparent))!important}`,
    `html[data-aether] :is(.seg button[aria-pressed="true"],.tm-btn[aria-pressed="true"],.ve-fam.on,.btn.primary.glow){color:var(--accent-ink)!important;background:var(--grad)!important}`,
    light && `html[data-aether] :is(.scene-wrap,.scene-host){color:var(--text)!important;text-shadow:none!important;background-color:color-mix(in srgb,var(--panel-2) 88%,transparent)!important}html[data-aether] :is(.scene-wrap,.scene-host) :is(.hud-tag,.hud-foot,.hud-foot span,.hud-eyebrow,.scene-cap,.scene-cap span){color:var(--text-2)!important;text-shadow:none!important}html[data-aether] :is(.scene-wrap,.scene-host) .hud-tag{background:color-mix(in srgb,var(--panel) 82%,transparent)!important;border-color:var(--line)!important}`,
    // motion
    `html[data-aether] :is(.btn,.nav-btn,.chip,.field,${LIFT}){transition:transform var(--ax-dur) var(--ax-ease),background-color .2s,border-color .2s,box-shadow var(--ax-dur) var(--ax-ease),color .2s!important}`,
    `html[data-aether] :is(${LIFT}):hover{transform:translateY(calc(var(--ax-lift)*-1))}`,
    `html[data-aether] :is(.btn,.cta,.nav-btn):active{transform:scale(var(--ax-press))}`,
    `html[data-aether] ::selection{background:${rgba(t.accent, 0.32)};color:var(--text)}`,
    `html[data-aether] :focus-visible{outline:2px solid var(--accent);outline-offset:2px}`,
    `html[data-aether] *{scrollbar-color:${rgba(t.accent, 0.4)} transparent}`,
    // fx layers
    `.ax-tex{${tex};opacity:var(--ax-tex-op);background-size:${scaleSize(tex, s.texScale)}}`,
    `.ax-vig{background:radial-gradient(ellipse at 50% 40%,transparent 48%,rgba(0,0,0,${light ? s.vignette * 0.35 : s.vignette}) 100%)}`,
    `.ax-grain{opacity:${light ? s.grain * 0.5 : s.grain}}`,
    reduce,
  ].filter(Boolean);
  return css.join('\n');
}

function scaleSize(css, k) {
  const m = /background-size:([^;]+)/.exec(css);
  if (!m || k === 1) return m ? m[1] : 'auto';
  return m[1].replace(/(\d+(?:\.\d+)?)px/g, (_, n) => `${(+n * k).toFixed(1)}px`);
}

/** Texture CSS minus background-size (that one is scaled separately). */
export const textureCss = (id) => getTexture(id).css.replace(/background-size:[^;]+;?/, '');

/** Plain-CSS export of the current look (what the Share tab shows). */
export function exportCss(state, mode) {
  const r = resolve(state), t = deriveTokens(r, mode);
  return `/* DevX Control — ${r.theme.name} (${mode}) */\n:root{\n${Object.entries({
    bg: t.bg, rail: t.rail, panel: t.panel, 'panel-2': t.panel2, raise: t.raise, line: t.line, 'line-soft': t.lineSoft,
    text: t.text, 'text-2': t.text2, 'text-3': t.text3, accent: t.accent, 'accent-2': t.accent2, 'accent-ink': t.ink,
  }).map(([k, v]) => `  --${k}: ${v};`).join('\n')}\n  --r-panel: ${Math.round(r.radius)}px;\n  --f-display: ${fontStack(r.headFont)};\n  --f-body: ${fontStack(r.bodyFont)};\n}`;
}
