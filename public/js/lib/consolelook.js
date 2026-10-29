// Console look for DevX Control itself (not the apps it manages).
// Pure data + CSS builder: no DOM, so the browser skin and the tests share it.
// Color shifts only the violet family already in the stylesheets. Status colors stay put.
// Kit and axis CSS uses fixed tokens only — never raw user strings.

export const SCHEMES = {
  violet: { label: 'Violet', hue: null, dot: '#b69cff' },
  iris: { label: 'Iris', hue: 255, dot: '#a78bfa' },
  grape: { label: 'Grape', hue: 282, dot: '#a855f7' },
  purple: { label: 'Purple', hue: 275, dot: '#c084fc' },
  fuchsia: { label: 'Fuchsia', hue: 292, dot: '#e879f9' },
  magenta: { label: 'Magenta', hue: 322, dot: '#f472b6' },
  hot: { label: 'Hot pink', hue: 330, dot: '#ff4d8d' },
  rose: { label: 'Rose', hue: 345, dot: '#fb7185' },
  crimson: { label: 'Crimson', hue: 350, dot: '#e11d48' },
  red: { label: 'Red', hue: 4, dot: '#f87171' },
  copper: { label: 'Copper', hue: 18, dot: '#e08a62' },
  orange: { label: 'Orange', hue: 24, dot: '#fb923c' },
  amber: { label: 'Amber', hue: 36, dot: '#fbbf24' },
  gold: { label: 'Gold', hue: 48, dot: '#eab308' },
  lime: { label: 'Lime', hue: 85, dot: '#a3e635' },
  green: { label: 'Green', hue: 142, dot: '#4ade80' },
  emerald: { label: 'Emerald', hue: 158, dot: '#34d399' },
  mint: { label: 'Mint', hue: 168, dot: '#5eead4' },
  teal: { label: 'Teal', hue: 174, dot: '#2dd4bf' },
  cyan: { label: 'Cyan', hue: 188, dot: '#22d3ee' },
  arctic: { label: 'Arctic', hue: 198, dot: '#7dd3fc' },
  sky: { label: 'Sky', hue: 205, dot: '#38bdf8' },
  blue: { label: 'Blue', hue: 217, dot: '#60a5fa' },
  indigo: { label: 'Indigo', hue: 239, dot: '#818cf8' },
};

// One-click console themes: a color plus a component kit. Fine-tuning stays available after.
export const CONSOLE_THEMES = [
  { id: 'orbital', label: 'Orbital', note: 'Violet glass', scheme: 'violet', kit: 'orbital' },
  { id: 'midnight', label: 'Midnight', note: 'Indigo, flat', scheme: 'indigo', kit: 'minimal' },
  { id: 'aurora', label: 'Aurora', note: 'Cyan frost', scheme: 'cyan', kit: 'glass' },
  { id: 'signal', label: 'Signal', note: 'Green glow', scheme: 'green', kit: 'neon' },
  { id: 'ember', label: 'Ember', note: 'Amber, soft', scheme: 'amber', kit: 'soft' },
  { id: 'press', label: 'Press', note: 'Crimson serif', scheme: 'crimson', kit: 'editorial' },
  { id: 'ops', label: 'Ops', note: 'Blue terminal', scheme: 'blue', kit: 'command' },
  { id: 'forge', label: 'Forge', note: 'Orange brutal', scheme: 'orange', kit: 'brutal' },
  { id: 'blossom', label: 'Blossom', note: 'Rose, soft', scheme: 'rose', kit: 'soft' },
  { id: 'matrix', label: 'Matrix', note: 'Lime terminal', scheme: 'lime', kit: 'command' },
  { id: 'dusk', label: 'Dusk', note: 'Fuchsia frost', scheme: 'fuchsia', kit: 'glass' },
  { id: 'paper', label: 'Paper', note: 'Gold serif', scheme: 'gold', kit: 'editorial' },
];

// Component kits restyle buttons, fields, cards and type. They do not change app projects.
export const KITS = {
  orbital: { label: 'Orbital', note: 'Glass console, as shipped', radius: 'round', density: 'cozy', font: 'orbital', glass: 'full' },
  minimal: { label: 'Minimal', note: 'Flat surfaces, no glow', radius: 'sharp', density: 'compact', font: 'clean', glass: 'off' },
  soft: { label: 'Soft', note: 'Round corners and a soft shadow', radius: 'soft', density: 'roomy', font: 'orbital', glass: 'soft' },
  glass: { label: 'Glass', note: 'Frosted panels, stronger blur', radius: 'soft', density: 'cozy', font: 'orbital', glass: 'full' },
  brutal: { label: 'Brutal', note: 'Thick borders, hard offset shadow', radius: 'sharp', density: 'compact', font: 'clean', glass: 'off' },
  editorial: { label: 'Editorial', note: 'Serif type, quiet cards', radius: 'sharp', density: 'roomy', font: 'serif', glass: 'off' },
  neon: { label: 'Neon', note: 'Accent glow on buttons and cards', radius: 'round', density: 'cozy', font: 'orbital', glass: 'full' },
  command: { label: 'Command', note: 'Mono, dense, terminal', radius: 'sharp', density: 'compact', font: 'mono', glass: 'soft' },
};

export const AXES = {
  radius: { sharp: 'Sharp', round: 'Round', soft: 'Soft', pill: 'Pill' },
  density: { compact: 'Compact', cozy: 'Cozy', roomy: 'Roomy' },
  font: { orbital: 'Orbital', clean: 'Clean', mono: 'Mono', serif: 'Serif' },
  glass: { off: 'Solid', soft: 'Soft', full: 'Glass' },
};

const SURF = '.panel,.vessel,.stat,.upd,.tabs,.dialog,.sysmenu,.palette,.card,.sheet';
const CHROME = `${SURF},.pill,.dock`;

const KIT_EXTRA = {
  orbital: '',
  minimal: `.btn.primary,.cta{background:var(--accent)!important;color:var(--accent-ink)!important;background-image:none!important;box-shadow:none!important}${SURF}{box-shadow:none!important}`,
  soft: `${SURF}{box-shadow:0 18px 44px -24px rgba(0,0,0,.55)!important}.btn:hover,.cta:hover{transform:translateY(-1px)}`,
  glass: `${CHROME}{background-color:color-mix(in srgb,var(--panel) 46%,transparent)!important}`,
  brutal: `${CHROME},.btn,.field,.chip,.cta{border:2px solid var(--text)!important;box-shadow:3px 3px 0 color-mix(in srgb,var(--text) 75%,transparent)!important}.btn.primary,.cta{background:var(--accent)!important;color:var(--accent-ink)!important;background-image:none!important}.hud-eyebrow{letter-spacing:.14em}`,
  editorial: `.btn,.cta{text-transform:uppercase;letter-spacing:.08em;font-size:11px;box-shadow:none!important}${SURF}{box-shadow:none!important}`,
  neon: `.btn.primary,.cta{box-shadow:0 0 18px color-mix(in srgb,var(--accent) 75%,transparent)!important}${SURF}{box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 50%,transparent),0 0 28px -12px color-mix(in srgb,var(--accent) 60%,transparent)!important}`,
  command: `.hud-eyebrow,.chip,.btn{text-transform:uppercase;letter-spacing:.07em}${SURF},.field{box-shadow:none!important}`,
};

export function normalizeSkin(input) {
  const src = input && typeof input === 'object' ? input : {};
  const custom = /^#[0-9a-fA-F]{6}$/.test(src.custom || '') ? src.custom.toLowerCase() : '';
  let scheme = src.scheme === 'custom' ? 'custom' : (SCHEMES[src.scheme] ? src.scheme : 'violet');
  if (scheme === 'custom' && !custom) scheme = 'violet';
  const out = { scheme, kit: KITS[src.kit] ? src.kit : 'orbital' };
  if (scheme === 'custom') out.custom = custom;
  for (const key of ['radius', 'density', 'font', 'glass']) {
    if (AXES[key][src[key]]) out[key] = src[key];
  }
  return out;
}

export function resolveAxes(skin) {
  const s = normalizeSkin(skin);
  const k = KITS[s.kit];
  return {
    radius: s.radius || k.radius,
    density: s.density || k.density,
    font: s.font || k.font,
    glass: s.glass || k.glass,
  };
}

export function hexHue(hex) {
  const n = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(n)) return 265;
  const [h] = rgb2hsl(parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16));
  return h;
}

export function schemeSpec(skin) {
  const s = normalizeSkin(skin);
  if (s.scheme === 'custom') return { id: 'custom', label: 'Custom', hue: hexHue(s.custom), dot: s.custom };
  return { id: s.scheme, ...SCHEMES[s.scheme] };
}

/** Active theme id when color + kit match a preset and no axis is overridden. */
export function activeTheme(skin) {
  const s = normalizeSkin(skin);
  if (s.radius || s.density || s.font || s.glass || s.scheme === 'custom') return '';
  return CONSOLE_THEMES.find((t) => t.scheme === s.scheme && t.kit === s.kit)?.id || '';
}

const rgb2hsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
};
const hsl2rgb = (h, s, l) => {
  h = (((h % 360) + 360) % 360) / 360;
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (!s) return [l, l, l].map((x) => Math.round(x * 255));
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map((x) => Math.round(x * 255));
};
const shift = (r, g, b, T) => {
  const [h, sat, l] = rgb2hsl(r, g, b);
  if (sat < .12 || h < 235 || h > 335) return [r, g, b];
  return hsl2rgb(T + (h - 265) * .55, sat, l);
};

/** Recolor violet/magenta stops in a stylesheet toward hue T. Other hues are left alone. */
export function recolorCss(txt, T) {
  return String(txt)
    .replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,\s*[\d.]+\s*)?\)/g, (m, r, g, b, a) => {
      const [x, y, z] = shift(+r, +g, +b, T);
      return a ? `rgba(${x}, ${y}, ${z}${a})` : `rgb(${x}, ${y}, ${z})`;
    })
    .replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (m, hx) => {
      if (hx.length === 3) hx = hx.split('').map((c) => c + c).join('');
      const [x, y, z] = shift(parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4), 16), T);
      return '#' + [x, y, z].map((v) => v.toString(16).padStart(2, '0')).join('');
    });
}

function radiusCss(r) {
  const map = { sharp: ['10px', '6px', '6px'], soft: ['28px', '18px', '999px'], pill: ['36px', '22px', '999px'] };
  const v = map[r];
  if (!v) return '';
  const [panel, ctl, chip] = v;
  return `:root{--r-panel:${panel};--r-inner:${ctl}}.panel,.vessel,.stat,.dialog,.card,.sheet,.sysmenu,.palette{border-radius:${panel}!important}.btn,.field,textarea.field,.cta,.menu-row,.sheet-item{border-radius:${ctl}!important}.chip,.seg,.seg button,.pill,.dock,.subtabs,.subtabs button,.hud-tag{border-radius:${chip}!important}`;
}
function densityCss(d) {
  if (d === 'compact') return '.btn{height:34px}.btn.sm{height:30px}.field,select.field{height:38px}.panel-head{padding:10px 12px}';
  if (d === 'roomy') return '.btn{height:48px}.btn.sm{height:40px}.field,select.field{height:52px}.panel-head{padding:18px 20px}';
  return '';
}
function fontCss(f) {
  const map = {
    clean: ['system-ui,-apple-system,"Segoe UI",sans-serif', 'system-ui,-apple-system,"Segoe UI",sans-serif'],
    mono: ['"JetBrains Mono",ui-monospace,Menlo,monospace', '"JetBrains Mono",ui-monospace,Menlo,monospace'],
    serif: ['Georgia,"Iowan Old Style",Cambria,serif', 'Georgia,Cambria,serif'],
  };
  const v = map[f];
  if (!v) return '';
  return `:root{--f-display:${v[0]};--f-body:${v[1]}}`;
}
function glassCss(g) {
  if (g === 'off') return `${CHROME}{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background-color:var(--panel)!important}`;
  if (g === 'soft') return `${CHROME}{backdrop-filter:blur(10px) saturate(1.25)!important;-webkit-backdrop-filter:blur(10px) saturate(1.25)!important}`;
  return '';
}

/** Stylesheet for kits + fine tuning. Empty string means "shipped orbital look". */
export function buildConsoleCss(skin) {
  const s = normalizeSkin(skin);
  const ax = resolveAxes(s);
  return [KIT_EXTRA[s.kit] || '', radiusCss(ax.radius), densityCss(ax.density), fontCss(ax.font), glassCss(ax.glass)].filter(Boolean).join('\n');
}
