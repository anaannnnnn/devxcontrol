// UI kits: 150+ complete, one-click design systems. A kit is a coherent bundle (palette, type pair, shape, depth, buttons, cards,
// navigation, tables, forms, focus rings) compiled to ONE stylesheet that restyles a whole app and never touches layout or
// behaviour. The 41 hand-tuned Looks are included; the rest come from sixteen design systems, each drawn in eight hues, with
// every colour pair pushed to a readable contrast. No dependencies: used by the browser, the server and the tests.
import { LOOKS, buildLookCss, lookTokens, fontImport } from './looks.js';

/* ------------------------------ colour helpers ------------------------------ */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex) => { const [r, g, b] = rgb(hex).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const mixHex = (a, b, t) => '#' + [0, 1, 2].map((i) => Math.round(rgb(a)[i] * (1 - t) + rgb(b)[i] * t).toString(16).padStart(2, '0')).join('');
const toHsl = (hex) => { const [r, g, b] = rgb(hex).map((c) => c / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return { h: 0, s: 0, l }; const s = d / (1 - Math.abs(2 * l - 1)); const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: (h * 60 + 360) % 360, s, l }; };
/** Nudge a colour's lightness until it reaches a contrast ratio on a background. */
export function readable(fg, bg, min) {
  if (contrast(fg, bg) >= min) return fg; const { h, s, l } = toHsl(fg); const up = contrast('#ffffff', bg) >= contrast('#000000', bg);
  for (let i = 1; i <= 50; i++) { const c = hsl(h, s, clamp(l + (up ? 1 : -1) * i * 0.02, 0, 1)); if (contrast(c, bg) >= min) return c; }
  return up ? '#ffffff' : '#000000';
}
const onColor = (bg) => (contrast('#ffffff', bg) >= contrast('#0b0b0f', bg) ? '#ffffff' : '#0b0b0f');

/** Make every colour pair of a kit readable: text 7:1, muted text 4.5:1, accent 3:1 on the page, and a label colour that reads on the accent. */
export function finishKit(k) {
  const base = k.bgBase || k.bg; const surf = k.surfaceBase || k.surface;
  if (!/^#[0-9a-f]{6}$/i.test(base) || !/^#[0-9a-f]{6}$/i.test(surf)) return k;
  k.text = readable(k.text, base, 7); k.muted = readable(k.muted, surf, 4.5);
  k.accent = readable(k.accent, base, 4.5);
  if (!k.btnBg) { const on = onColor(k.accent); k.on = on; }
  return k;
}

/* ------------------------------ type pairs ------------------------------ */
const SANS = (n) => `'${n}',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif`;
const SERIF = (n) => `'${n}',Georgia,'Iowan Old Style',Cambria,serif`;
const MONO = (n) => `'${n}',ui-monospace,SFMono-Regular,Menlo,monospace`;

/* ------------------------------ the sixteen systems ------------------------------ */
/* Each system is a function of a hue (0-359) and returns the kit's colours and shape. `style` records the personality in words. */
const SYSTEMS = [
  { id: 'swiss', name: 'Swiss', family: 'Swiss / Grid', mode: 'light', style: 'Strict grid, hard rules, one loud colour',
    make: (h) => ({ bg: hsl(h, 0.04, 0.98), surface: '#ffffff', text: hsl(h, 0.2, 0.08), muted: hsl(h, 0.08, 0.36), accent: hsl(h, 0.85, 0.46), border: hsl(h, 0.1, 0.12), font: SANS('Archivo'), head: SANS('Archivo'), radius: 0, hw: 800, hls: '-.035em', cardBorder: `2px solid ${hsl(h, 0.2, 0.08)}`, btnBorder: `2px solid ${hsl(h, 0.2, 0.08)}`, navBorder: 1, upper: 0 }) },
  { id: 'neobrutal', name: 'Neo Brutal', family: 'Brutalist', mode: 'light', style: 'Thick outlines, hard shadows, flat colour blocks',
    make: (h) => ({ bg: hsl(h, 0.9, 0.93), surface: '#ffffff', text: '#0a0a0a', muted: '#2b2b2b', accent: hsl(h + 180, 0.9, 0.55), border: '#0a0a0a', font: SANS('Space Grotesk'), head: SANS('Space Grotesk'), radius: 6, hw: 800, btnBg: hsl(h, 0.95, 0.62), btnText: '#0a0a0a', btnBorder: '3px solid #0a0a0a', btnShadow: '4px 4px 0 #0a0a0a', cardBorder: '3px solid #0a0a0a', cardShadow: '6px 6px 0 #0a0a0a', hoverShadow: '7px 7px 0 #0a0a0a', hoverLift: 1 }) },
  { id: 'soft', name: 'Soft UI', family: 'Soft / Neumorphic', mode: 'light', style: 'Pillowy surfaces, two-sided shadows, no borders',
    make: (h) => { const bg = hsl(h, 0.2, 0.9); return { bg, surface: bg, text: hsl(h, 0.3, 0.2), muted: hsl(h, 0.15, 0.36), accent: hsl(h, 0.6, 0.45), border: 'transparent', font: SANS('Nunito'), head: SANS('Nunito'), radius: 22, hw: 800, cardBorder: '0', cardShadow: `9px 9px 20px ${hsl(h, 0.2, 0.78)}, -9px -9px 20px #ffffffcc`, btnShadow: `5px 5px 12px ${hsl(h, 0.2, 0.74)}, -5px -5px 12px #ffffffcc`, inputBorder: '0', hoverLift: 0 }; } },
  { id: 'glass', name: 'Glass', family: 'Glass / Aurora', mode: 'dark', style: 'Frosted panes floating over a glowing gradient',
    make: (h) => ({ bgBase: hsl(h, 0.5, 0.09), bg: `linear-gradient(135deg,${hsl(h, 0.6, 0.12)},${hsl(h + 50, 0.55, 0.09)} 55%,${hsl(h + 100, 0.5, 0.12)})`, surfaceBase: hsl(h, 0.4, 0.17), surface: 'rgba(255,255,255,.08)', text: hsl(h, 0.6, 0.96), muted: hsl(h, 0.3, 0.76), accent: hsl(h + 20, 0.9, 0.7), border: 'rgba(255,255,255,.16)', font: SANS('Plus Jakarta Sans'), head: SANS('Plus Jakarta Sans'), radius: 20, cardBackdrop: 'blur(18px) saturate(1.3)', navBackdrop: 'blur(14px)', navBg: 'rgba(255,255,255,.06)', cardShadow: '0 18px 44px rgba(0,0,0,.4)', btnBg: `linear-gradient(120deg,${hsl(h + 20, 0.9, 0.7)},${hsl(h + 70, 0.85, 0.7)})`, btnText: '#0b0b12', hoverLift: 1 }) },
  { id: 'luxe', name: 'Luxe', family: 'Luxury', mode: 'dark', style: 'Near-black, hairlines, serif display, one metallic accent',
    make: (h) => ({ bg: hsl(h, 0.08, 0.06), surface: hsl(h, 0.08, 0.1), text: hsl(h, 0.15, 0.93), muted: hsl(h, 0.1, 0.7), accent: hsl(h, 0.55, 0.62), border: hsl(h, 0.2, 0.2), font: SANS('Manrope'), head: SERIF('Cormorant Garamond'), radius: 2, hw: 600, hls: '.01em', upper: 0, btnBg: 'transparent', btnText: hsl(h, 0.55, 0.62), btnBorder: `1px solid ${hsl(h, 0.55, 0.62)}`, cardBorder: `1px solid ${hsl(h, 0.2, 0.2)}`, navBorder: 1 }) },
  { id: 'pastel', name: 'Pastel', family: 'Pastel', mode: 'light', style: 'Candy tints, fat radii, pill buttons',
    make: (h) => ({ bg: hsl(h, 0.8, 0.96), surface: '#ffffff', text: hsl(h, 0.35, 0.2), muted: hsl(h, 0.25, 0.38), accent: hsl(h, 0.65, 0.5), border: hsl(h, 0.6, 0.88), font: SANS('Poppins'), head: SANS('Poppins'), radius: 26, pill: 1, hw: 700, cardShadow: `0 14px 36px ${hsl(h, 0.7, 0.85)}`, btnShadow: `0 10px 22px ${hsl(h, 0.7, 0.82)}`, hoverLift: 1 }) },
  { id: 'dash', name: 'Dashboard', family: 'Dashboard', mode: 'dark', style: 'Dense slate panels, thin borders, data first',
    make: (h) => ({ bg: hsl(h, 0.2, 0.08), surface: hsl(h, 0.18, 0.12), text: hsl(h, 0.2, 0.92), muted: hsl(h, 0.12, 0.68), accent: hsl(h, 0.8, 0.64), border: hsl(h, 0.15, 0.2), font: SANS('IBM Plex Sans'), head: SANS('IBM Plex Sans'), radius: 8, hw: 600, hls: '-.01em', navBorder: 1, cardShadow: '0 1px 0 rgba(255,255,255,.04) inset', ls: '0' }) },
  { id: 'editorial', name: 'Editorial', family: 'Editorial', mode: 'light', style: 'Warm paper, serif headlines, quiet rules',
    make: (h) => ({ bg: hsl(h, 0.35, 0.96), surface: hsl(h, 0.4, 0.985), text: hsl(h, 0.25, 0.11), muted: hsl(h, 0.12, 0.38), accent: hsl(h, 0.7, 0.34), border: hsl(h, 0.25, 0.86), font: SERIF('Lora'), head: SERIF('Fraunces'), radius: 3, hw: 700, hls: '-.015em', cardBorder: `1px solid ${hsl(h, 0.25, 0.86)}`, ls: '.002em' }) },
  { id: 'neon', name: 'Neon', family: 'Dark Neon', mode: 'dark', style: 'Black glass, glowing edges, electric accent',
    make: (h) => ({ bg: hsl(h, 0.5, 0.04), surface: hsl(h, 0.4, 0.08), text: hsl(h, 0.9, 0.95), muted: hsl(h, 0.35, 0.7), accent: hsl(h, 1, 0.6), border: hsl(h, 0.5, 0.18), font: SANS('Chakra Petch'), head: SANS('Chakra Petch'), radius: 6, upper: 1, btnShadow: `0 0 22px ${hsl(h, 1, 0.5)}88`, cardShadow: `0 0 26px ${hsl(h, 1, 0.5)}26`, cardBorder: `1px solid ${hsl(h, 0.7, 0.3)}`, hoverLift: 1 }) },
  { id: 'terminal', name: 'Terminal', family: 'Terminal', mode: 'dark', style: 'Monospace, square corners, phosphor on black',
    make: (h) => ({ bg: hsl(h, 0.35, 0.05), surface: hsl(h, 0.3, 0.08), text: hsl(h, 0.8, 0.84), muted: hsl(h, 0.3, 0.62), accent: hsl(h, 0.95, 0.58), border: hsl(h, 0.35, 0.18), font: MONO('JetBrains Mono'), head: MONO('JetBrains Mono'), radius: 0, hw: 700, btnBg: 'transparent', btnText: hsl(h, 0.95, 0.62), btnBorder: `1px solid ${hsl(h, 0.95, 0.58)}`, cardBorder: `1px solid ${hsl(h, 0.35, 0.18)}`, hls: '0' }) },
  { id: 'corporate', name: 'Corporate', family: 'Corporate', mode: 'light', style: 'Calm, trustworthy, a little shadow',
    make: (h) => ({ bg: hsl(h, 0.2, 0.965), surface: '#ffffff', text: hsl(h, 0.35, 0.14), muted: hsl(h, 0.12, 0.38), accent: hsl(h, 0.75, 0.42), border: hsl(h, 0.15, 0.89), font: SANS('Inter'), head: SANS('Inter'), radius: 8, hw: 700, navBorder: 1, cardShadow: `0 6px 18px ${hsl(h, 0.3, 0.2)}14` }) },
  { id: 'organic', name: 'Organic', family: 'Warm / Retro', mode: 'light', style: 'Earthy creams, round corners, humane type',
    make: (h) => ({ bg: hsl(h, 0.4, 0.94), surface: hsl(h, 0.5, 0.975), text: hsl(h, 0.35, 0.16), muted: hsl(h, 0.2, 0.36), accent: hsl(h, 0.6, 0.36), border: hsl(h, 0.3, 0.84), font: SANS('DM Sans'), head: SERIF('Fraunces'), radius: 18, hw: 600, cardShadow: `0 8px 24px ${hsl(h, 0.4, 0.3)}18` }) },
  { id: 'gradient', name: 'Gradient', family: 'Playful / Bold', mode: 'light', style: 'White canvas, gradient buttons, big friendly type',
    make: (h) => ({ bg: '#ffffff', surface: hsl(h, 0.6, 0.975), text: hsl(h + 20, 0.4, 0.13), muted: hsl(h, 0.15, 0.4), accent: hsl(h, 0.8, 0.5), border: hsl(h, 0.4, 0.9), font: SANS('Outfit'), head: SANS('Outfit'), radius: 16, hw: 800, hls: '-.03em', btnBg: `linear-gradient(120deg,${hsl(h, 0.85, 0.5)},${hsl(h + 55, 0.85, 0.55)})`, btnText: '#ffffff', btnShadow: `0 10px 24px ${hsl(h, 0.8, 0.5)}55`, cardShadow: `0 12px 32px ${hsl(h, 0.6, 0.5)}18`, hoverLift: 1 }) },
  { id: 'mono', name: 'Mono', family: 'Monochrome', mode: 'dark', style: 'Greyscale with a single tinted accent',
    make: (h) => ({ bg: '#0a0a0a', surface: '#141414', text: '#ededed', muted: '#a3a3a3', accent: hsl(h, 0.55, 0.7), border: '#262626', font: SANS('Inter'), head: SANS('Inter'), radius: 6, hw: 600, hls: '-.025em', navBorder: 1, cardShadow: '0 1px 0 rgba(255,255,255,.04) inset' }) },
  { id: 'print', name: 'Retro Print', family: 'Retro Print', mode: 'light', style: 'Cream stock, inked outlines, offset colour shadows',
    make: (h) => ({ bg: hsl(h + 30, 0.55, 0.9), surface: hsl(h + 30, 0.6, 0.96), text: hsl(h + 200, 0.5, 0.12), muted: hsl(h + 200, 0.2, 0.3), accent: hsl(h, 0.8, 0.42), border: hsl(h + 200, 0.5, 0.12), font: SANS('Work Sans'), head: SERIF('Fraunces'), radius: 8, hw: 800, cardBorder: `2px solid ${hsl(h + 200, 0.5, 0.12)}`, cardShadow: `5px 5px 0 ${hsl(h, 0.8, 0.5)}`, btnBorder: `2px solid ${hsl(h + 200, 0.5, 0.12)}`, btnShadow: `3px 3px 0 ${hsl(h + 200, 0.5, 0.12)}`, hoverLift: 1 }) },
  { id: 'access', name: 'High Contrast', family: 'Accessible', mode: 'dark', style: 'Maximum legibility, big focus rings, generous type',
    make: (h) => ({ bg: '#000000', surface: '#0d0d0d', text: '#ffffff', muted: '#d4d4d4', accent: hsl(h, 1, 0.65), border: '#ffffff', font: SANS('Lexend'), head: SANS('Lexend'), radius: 6, hw: 700, cardBorder: '2px solid #ffffff', btnBorder: '2px solid #ffffff', inputBorder: '2px solid #ffffff', extra: 'body{font-size:1.06em!important;line-height:1.6!important}:focus-visible{outline:3px solid #ffd60a!important;outline-offset:3px!important}' }) },
];

const HUES = [{ n: 'Ember', h: 16 }, { n: 'Cobalt', h: 222 }, { n: 'Moss', h: 140 }, { n: 'Plum', h: 292 }, { n: 'Lagoon', h: 188 }, { n: 'Saffron', h: 42 }, { n: 'Rose', h: 340 }, { n: 'Slate', h: 212 }];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const GENERATED = SYSTEMS.flatMap((sys) => HUES.map(({ n, h }) => {
  const k = { id: `${sys.id}-${slug(n)}`, name: `${sys.name} ${n}`, family: sys.family, mode: sys.mode, system: sys.id, hueName: n, hue: h, blurb: sys.style, ...sys.make(h) };
  k.on ||= '#ffffff';
  return finishKit(k);
}));

/** The hand-tuned Looks, tagged as kits. Their muted text is lifted to a readable contrast too. */
const CURATED = LOOKS.map((l) => finishKit({ ...l, system: 'curated', blurb: `${l.family} look`, hueName: '' }));

export const KITS = [...CURATED, ...GENERATED];
export const KIT_FAMILIES = [...new Set(KITS.map((k) => k.family))];
export const kitById = (id) => KITS.find((k) => k.id === id) || null;

/* ------------------------------ compile ------------------------------ */
/** The full stylesheet for a kit: the Look engine plus focus rings, selection, tables, code, scrollbars and reduced motion. */
export function buildKitCss(k) {
  const bd = k.border === 'transparent' ? mixHex(k.bgBase || (/^#/.test(k.bg) ? k.bg : '#808080'), k.text, 0.14) : k.border;
  const r = Math.min(k.cardRadius ?? k.radius ?? 12, 14);
  return [
    buildLookCss(k),
    roleCss(k),
    `::selection{background:${k.accent};color:${k.on || '#fff'}}`,
    `:where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:2px solid ${k.accent};outline-offset:2px}`,
    `table{border-collapse:collapse}th{color:${k.muted}!important;text-align:left;font-weight:600;border-bottom:1px solid ${bd}!important;background:transparent!important}td{border-bottom:1px solid ${bd}!important}`,
    `hr{border:0!important;border-top:1px solid ${bd}!important}`,
    `code,pre,kbd{background:${k.surfaceBase || k.surface}!important;color:${k.text}!important;border-radius:${r}px!important;font-family:${/mono/i.test(k.font || '') ? k.font : "ui-monospace,SFMono-Regular,Menlo,monospace"}!important}`,
    `html{scrollbar-color:${bd} transparent}`,
    `@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}}`,
  ].join('\n');
}
export const kitTokens = (k) => lookTokens(k);

/** Tokens as JSON and a Tailwind colour block, for people who copy a kit into a codebase. */
export const kitToJson = (k) => JSON.stringify({ id: k.id, name: k.name, family: k.family, mode: k.mode, colors: { bg: k.bgBase || k.bg, surface: k.surfaceBase || k.surface, text: k.text, muted: k.muted, accent: k.accent, border: k.border, onAccent: k.on || '#ffffff' }, radius: k.radius ?? 12, fonts: { body: k.font, heading: k.head || k.font } }, null, 2) + '\n';
export const kitToTailwind = (k) => `// tailwind.config.js (generated by DevX Control: ${k.name})\nmodule.exports = { theme: { extend: {\n  colors: { bg: '${k.bgBase || k.bg}', surface: '${k.surfaceBase || k.surface}', ink: '${k.text}', muted: '${k.muted}', accent: '${k.accent}', line: '${k.border}' },\n  borderRadius: { kit: '${k.radius ?? 12}px' },\n  fontFamily: { body: [${JSON.stringify(k.font)}], display: [${JSON.stringify(k.head || k.font)}] },\n} } };\n`;

/** Same kit with the accent colour swapped, still readable. */
export function withAccent(k, hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return k;
  const c = { ...k, accent: hex.toLowerCase() }; delete c.on;
  return finishKit({ ...c, id: k.id, name: k.name });
}

/** Check a kit sent from a browser (for example one sampled from a live site) before it is compiled into CSS. */
export function checkKit(d) {
  const HEX = /^#[0-9a-f]{6}$/i; const bad = (m) => { const e = new Error(m); e.status = 400; throw e; };
  if (!d || typeof d !== 'object') bad('That look is not valid.');
  const o = { id: String(d.id || 'custom').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'custom', name: String(d.name || 'Custom look').slice(0, 60), family: String(d.family || 'Sampled').slice(0, 30), mode: d.mode === 'light' ? 'light' : 'dark', blurb: String(d.blurb || '').slice(0, 120) };
  for (const key of ['bg', 'surface', 'text', 'muted', 'accent', 'border']) { if (!HEX.test(String(d[key] || ''))) bad(`${key} must be a colour like #1a2b3c.`); o[key] = String(d[key]).toLowerCase(); }
  const stack = (v) => { const s = String(v || ''); if (!s) return undefined; if (/[;{}<>\\]/.test(s) || s.length > 200) bad('That font is not valid.'); return s; };
  o.font = stack(d.font) || SANS('Inter'); o.head = stack(d.head) || o.font;
  o.radius = clamp(Math.round(Number(d.radius ?? 12)), 0, 32); o.cardShadow = d.cardShadow && /^[0-9a-z#.,()\s-]{1,120}$/i.test(d.cardShadow) ? d.cardShadow : undefined;
  return finishKit(o);
}

/** A kit from just a few colours: used for looks sampled from a running site. */
export function kitFromColors({ id = 'site', name = 'Sampled look', bg, text, accent, font, radius = 12 }) {
  const dark = contrast(bg, '#ffffff') > contrast(bg, '#000000');
  const surface = mixHex(bg, text, dark ? 0.07 : 0.03); const border = mixHex(bg, text, 0.16);
  return finishKit({ id, name, family: 'Sampled', mode: dark ? 'dark' : 'light', blurb: 'Colours and type taken from the running site', bg, surface, text, muted: mixHex(bg, text, 0.62), accent, border, font: font || SANS('Inter'), head: font || SANS('Inter'), radius, cardShadow: dark ? '0 8px 24px rgba(0,0,0,.3)' : '0 6px 18px rgba(0,0,0,.07)', navBorder: 1 });
}


/* ------------------------------ beyond class names ------------------------------ */
/* Real apps rarely call their cards "card". These rules reach what an element IS: the roles a small script reads off the rendered
   page (see kitRolesJs), the Tailwind utility classes (bg-white, text-gray-500, border-gray-200, rounded-xl ...) and the
   custom properties design systems such as shadcn/ui build on. */
function roleCss(k) {
  const on = k.on || '#ffffff', r = k.radius ?? 12, cr = k.cardRadius ?? r, btnR = k.pill ? '999px' : `${k.btnRadius ?? r}px`;
  const bd = k.border === 'transparent' ? mixHex(k.bgBase || '#808080', k.text, 0.14) : k.border;
  const card = `background:${k.cardBg || k.surface}!important;color:${k.text}!important;border:${k.cardBorder || `1px solid ${bd}`}!important;border-radius:${cr}px!important;box-shadow:${k.cardShadow || 'none'}!important;${k.cardBackdrop ? `backdrop-filter:${k.cardBackdrop}!important;` : ''}`;
  const base = k.bgBase || (/^#/.test(k.bg) ? k.bg : '#808080'), surf = k.surfaceBase || (/^#/.test(k.surface) ? k.surface : mixHex(base, k.text, 0.06)), s2 = mixHex(surf, k.text, 0.06);
  return [
    `[data-dx=card]{${card}}`,
    `[data-dx=card] :where(div,span,p,li,label,dt,dd,h1,h2,h3,h4,h5,h6):not([data-dx=btn]):not([data-dx=btn2]):not([data-dx=badge]){color:inherit!important}`,
    `[data-dx=btn]{background:${k.btnBg || k.accent}!important;color:${k.btnText || on}!important;border:${k.btnBorder || '0'}!important;border-radius:${btnR}!important;font-weight:600!important;box-shadow:${k.btnShadow || 'none'}!important;cursor:pointer}`,
    `[data-dx=btn2]{background:transparent!important;color:${k.accent}!important;border:1px solid ${k.accent}!important;border-radius:${btnR}!important;font-weight:600!important}`,
    `[data-dx=btn] *,[data-dx=btn2] *{color:inherit!important}`,
    `[data-dx=badge]{background:${mixHex(base, k.accent, 0.16)}!important;color:${k.accent}!important;border:1px solid ${mixHex(base, k.accent, 0.35)}!important;border-radius:999px!important}`,
    `[data-dx=nav]{${k.navBg ? `background:${k.navBg}!important;` : `background:${surf}!important;`}border-bottom:1px solid ${bd}!important;${k.navBackdrop ? `backdrop-filter:${k.navBackdrop}!important;` : ''}color:${k.text}!important}`,
    `[data-dx=foot]{background:${k.footerBg || surf}!important;color:${k.muted}!important;border-top:1px solid ${bd}!important}`,
    `[data-dx=input]{background:${k.inputBg || surf}!important;color:${k.text}!important;border:${k.inputBorder || `1px solid ${bd}`}!important;border-radius:${k.inputRadius ?? r}px!important}`,
    /* Tailwind utilities */
    `[class*="bg-white"],[class*="bg-gray-50"],[class*="bg-gray-100"],[class*="bg-slate-50"],[class*="bg-slate-100"],[class*="bg-zinc-50"],[class*="bg-zinc-100"],[class*="bg-neutral-50"],[class*="bg-neutral-100"],[class*="bg-stone-50"]{background-color:${surf}!important}`,
    `[class*="bg-black"],[class*="bg-gray-9"],[class*="bg-slate-9"],[class*="bg-zinc-9"],[class*="bg-neutral-9"],[class*="bg-stone-9"]{background-color:${k.mode === 'dark' ? mixHex(base, k.text, 0.07) : mixHex(base, k.text, 0.06)}!important}`,
    `[class*="text-white"]:not([data-dx=btn]):not([data-dx=btn] *):not([data-dx=hero] *):not([class*="bg-blue"]):not([class*="bg-indigo"]):not([class*="bg-violet"]):not([class*="bg-purple"]):not([class*="bg-primary"]):not([class*="bg-sky"]){color:${k.text}!important}`,
    `[data-dx=icon] [fill]:not([fill=none]):not([fill=currentColor]),[data-dx=icon][fill]:not([fill=none]):not([fill=currentColor]){fill:${k.accent}!important}[data-dx=icon] [stroke]:not([stroke=none]):not([stroke=currentColor]),[data-dx=icon][stroke]:not([stroke=none]):not([stroke=currentColor]){stroke:${k.accent}!important}`,
    `[class*="bg-gray-2"],[class*="bg-gray-3"],[class*="bg-gray-8"],[class*="bg-gray-7"],[class*="bg-slate-2"],[class*="bg-slate-8"],[class*="bg-zinc-2"],[class*="bg-zinc-8"],[class*="bg-neutral-2"],[class*="bg-neutral-8"]{background-color:${s2}!important}`,
    `[class*="bg-blue-5"],[class*="bg-blue-6"],[class*="bg-blue-7"],[class*="bg-indigo-5"],[class*="bg-indigo-6"],[class*="bg-indigo-7"],[class*="bg-violet-5"],[class*="bg-violet-6"],[class*="bg-purple-5"],[class*="bg-purple-6"],[class*="bg-sky-5"],[class*="bg-sky-6"],[class*="bg-cyan-6"],[class*="bg-teal-6"],[class*="bg-primary"]{background:${k.btnBg || k.accent}!important;color:${k.btnText || on}!important}`,
    `[class*="text-gray"],[class*="text-slate"],[class*="text-zinc"],[class*="text-neutral"],[class*="text-stone"],[class*="text-muted"]{color:${k.muted}!important}`,
    `[class*="text-black"],[class*="text-gray-9"],[class*="text-slate-9"],[class*="text-zinc-9"],[class*="text-foreground"]{color:${k.text}!important}`,
    `[class*="text-blue-"],[class*="text-indigo-"],[class*="text-violet-"],[class*="text-purple-"],[class*="text-sky-"],[class*="text-primary"]{color:${k.accent}!important}`,
    `[class*="border-gray"],[class*="border-slate"],[class*="border-zinc"],[class*="border-neutral"],[class*="border-stone"],[class*="divide-"]>*,[class*="border-border"]{border-color:${bd}!important}`,
    `[class*="rounded-md"],[class*="rounded-lg"],[class*="rounded-xl"],[class*="rounded-2xl"],[class*="rounded-3xl"]{border-radius:${cr}px!important}`,
    `[class*="ring-"]:focus-visible{--tw-ring-color:${k.accent}!important}`,
    `body[class],html[class]{background:${k.bg}!important${/gradient/.test(k.bg) ? ';background-attachment:fixed!important;background-repeat:no-repeat!important' : ''}}`,
    /* design-system variables, in the two common spellings */
    `:root,.dark,[data-theme],html.dark{--radius:${(r / 16).toFixed(3)}rem;--color-accent-dx:${k.accent}}`,
  ].join('\n');
}

/** A script that tags every element with what it is (card, button, outline button, badge, nav, footer, input) from how it renders,
 *  keeps tagging as the page changes, and sets shadcn/ui-style variables. Safe to run again with another kit. */
export function kitRolesJs(k) {
  const bd = k.border === 'transparent' ? mixHex(k.bgBase || '#808080', k.text, 0.14) : k.border;
  const base = k.bgBase || (/^#/.test(k.bg) ? k.bg : '#808080'), surf = k.surfaceBase || (/^#/.test(k.surface) ? k.surface : mixHex(base, k.text, 0.06));
  const T = { bg: base, surface: surf, s2: mixHex(surf, k.text, 0.06), text: k.text, muted: k.muted, accent: k.accent, on: k.on || '#ffffff', border: bd, radius: k.radius ?? 12 };
  return `(function(){if(typeof window==='undefined'||typeof document==='undefined')return;var T=${JSON.stringify(T)};window.__dxKitT=T;
function hex2(h){return[1,3,5].map(function(i){return parseInt(h.slice(i,i+2),16)})}
function tri(h){var c=hex2(h).map(function(v){return v/255}),mx=Math.max.apply(0,c),mn=Math.min.apply(0,c),l=(mx+mn)/2,d=mx-mn,hh=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));hh=mx===c[0]?((c[1]-c[2])/d)%6:mx===c[1]?(c[2]-c[0])/d+2:(c[0]-c[1])/d+4;hh=(hh*60+360)%360}return Math.round(hh)+' '+Math.round(s*100)+'% '+Math.round(l*100)+'%'}
function setVars(){var st=document.documentElement.style,cs=getComputedStyle(document.documentElement);
var M={background:T.bg,foreground:T.text,card:T.surface,'card-foreground':T.text,popover:T.surface,'popover-foreground':T.text,primary:T.accent,'primary-foreground':T.on,secondary:T.s2,'secondary-foreground':T.text,muted:T.s2,'muted-foreground':T.muted,accent:T.s2,'accent-foreground':T.text,border:T.border,input:T.border,ring:T.accent};
for(var n in M){var cur=cs.getPropertyValue('--'+n).trim();if(!cur)continue;st.setProperty('--'+n,/^[\\d.]+\\s+[\\d.]+%\\s+[\\d.]+%$/.test(cur)?tri(M[n]):M[n],'important')}}
function rgba(c){var m=/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+%?))?/.exec(c||'');if(!m)return null;var a=m[4]===undefined?1:(/%$/.test(m[4])?parseFloat(m[4])/100:parseFloat(m[4]));return[+m[1],+m[2],+m[3],a]}
var SKIP=/^(SCRIPT|STYLE|LINK|META|BR|NOSCRIPT|HEAD|HTML|BODY|IMG|VIDEO|CANVAS|PATH|G|CIRCLE|RECT|LINE|POLYGON|POLYLINE|ELLIPSE|DEFS|USE|STOP|TITLE|OPTION|TR|TD|TH|TBODY|THEAD|UL|OL|H1|H2|H3|H4|H5|H6|P|CODE|PRE|HR|IFRAME|PICTURE|SOURCE)$/i;
var vw=function(){return Math.max(document.documentElement.clientWidth,320)};
function roleOf(el,cs){var t=el.tagName;
 if(t.toLowerCase()==='svg'){var q=el.getBoundingClientRect();return q.width>0&&q.width<=72&&q.height<=72&&!el.closest('[data-dx=btn],[data-dx=btn2]')?'icon':null}
 if(t==='INPUT'){var ty=(el.type||'').toLowerCase();return/^(submit|button|reset)$/.test(ty)?'btn':/^(checkbox|radio|range|hidden|file|color)$/.test(ty)?null:'input'}
 if(t==='SELECT'||t==='TEXTAREA')return'input';
 if(t==='FOOTER')return'foot';
 var r=el.getBoundingClientRect(),bg=rgba(cs.backgroundColor),txt=(el.textContent||'').trim(),hasBg=(bg&&bg[3]>=.5)||(cs.backgroundImage&&cs.backgroundImage!=='none'),hasBd=parseFloat(cs.borderTopWidth)>0&&(rgba(cs.borderTopColor)||[0,0,0,0])[3]>.05,rad=parseFloat(cs.borderTopLeftRadius)||0,sh=cs.boxShadow&&cs.boxShadow!=='none';
 var isBtn=((t==='BUTTON'||el.getAttribute('role')==='button')&&(hasBg||hasBd))||((t==='A'||t==='DIV'||t==='SPAN'||t==='LABEL')&&cs.cursor==='pointer'&&(hasBg||hasBd)&&txt.length>0&&txt.length<=32&&r.height<=72&&r.height>=24&&el.children.length<=3&&parseFloat(cs.paddingLeft)>=6);
 var H=document.documentElement.scrollHeight;
 if(t!=='NAV'&&t!=='HEADER'&&t!=='FOOTER'&&r.width>=vw()*.96&&r.height>=Math.max(300,H*.7)&&hasBg&&el.children.length>=1&&cs.position!=='fixed'&&cs.position!=='absolute')return'canvas';
 if(t!=='NAV'&&t!=='HEADER'&&t!=='FOOTER'&&r.width>=vw()*.96&&r.height>=140&&/url\\(/.test(cs.backgroundImage))return'hero';
 if(t==='BUTTON'&&!txt&&r.width<=56&&r.height<=56&&hasBg&&!el.querySelector('svg,img'))return'swatch';
 if(isBtn){if(t!=='INPUT'&&el.parentElement){var sib=0,pe=el.parentElement.children;for(var j=0;j<pe.length;j++)if(pe[j].tagName===t)sib++;if(sib>=3)return'btnx'}return hasBg?'btn':'btn2'}
 if(el.parentElement&&el.parentElement.closest('[data-dx=nav]')&&(t==='NAV'||t==='HEADER'))return null;
 if(t==='NAV'||el.getAttribute('role')==='navigation'||t==='HEADER'||((cs.position==='fixed'||cs.position==='sticky')&&r.top<=4&&r.width>=vw()*.6&&r.height<=140&&el.querySelector('a')))return(r.height>260||!(hasBg||parseFloat(cs.borderBottomWidth)>0))?null:'nav';
 if(r.width>=vw()*.96&&r.height>=140&&(t==='SECTION'||t==='DIV'||t==='MAIN')&&(hasBg||parseFloat(cs.paddingTop)>=24)&&el.children.length)return'sec';
 if(r.height<=32&&r.width<=160&&txt.length>0&&txt.length<=18&&(hasBg||hasBd)&&rad>=4&&el.children.length===0)return'badge';
 if(r.width>=140&&r.height>=56&&r.width<=vw()*.94&&txt.length>0&&(t==='DIV'||t==='SECTION'||t==='ARTICLE'||t==='LI'||t==='ASIDE'||t==='FORM'||t==='A'||t==='FIELDSET'||t==='DETAILS'||t==='DL')&&((hasBg&&(rad>=4||sh||hasBd))||sh||(hasBd&&rad>=4)))return'card';
 return null}
var queued=0;
function tag(){queued=0;setVars();var els=document.body?document.body.querySelectorAll('*'):[],n=0;
 for(var i=0;i<els.length&&n<6000;i++){var el=els[i];if(el.hasAttribute('data-dx')||SKIP.test(el.tagName))continue;n++;
  var cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')continue;var role=roleOf(el,cs);if(role)el.setAttribute('data-dx',role)}}
function later(){if(!queued){queued=1;setTimeout(tag,120)}}
tag();setTimeout(tag,700);
if(!window.__dxRolesObs&&window.MutationObserver){window.__dxRolesObs=new MutationObserver(later);window.__dxRolesObs.observe(document.documentElement,{childList:true,subtree:true})}
})();`;
}

/* ------------------------------ previews ------------------------------ */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BASE = '*{box-sizing:border-box;margin:0}body{line-height:1.5}img{max-width:100%}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.btn{display:inline-block;padding:10px 18px;border:0;cursor:pointer;font-size:14px;text-decoration:none}input,select,textarea{padding:9px 12px;width:100%;font-size:14px}table{width:100%;font-size:13px}th,td{padding:9px 10px}.card{padding:18px}';
/** A small mock UI for a gallery tile. */
export function kitThumb(k) {
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>${BASE}body{padding:16px;display:grid;gap:11px}.btn{padding:8px 14px;font-size:12px}.card{padding:12px}${buildKitCss(k)}</style>
  <nav class="row" style="justify-content:space-between"><b style="font-size:14px">Brand</b><div class="row" style="gap:12px;font-size:12px"><a href="#">Home</a><a href="#">Pricing</a></div></nav>
  <h1 style="font-size:22px;line-height:1.1">${esc(k.name)}</h1>
  <p style="font-size:12px" class="muted">One click restyles the whole app.</p>
  <div class="row"><button class="btn">Get started</button><a href="#" style="font-size:12px">Learn more</a></div>
  <div class="card"><b style="font-size:13px">Card title</b><p style="font-size:11px" class="muted">Supporting copy sits here.</p></div>
  <input placeholder="you@example.com">`;
}

/** A whole page in the kit: navigation, hero, features, stats, pricing, form, table, alert, footer. */
export function kitPreviewDoc(k) {
  const css = `${BASE}.wrap{max-width:1080px;margin:0 auto;padding:0 28px}.hero{padding:72px 0 56px;text-align:center}.hero h1{font-size:clamp(34px,5vw,56px);line-height:1.05;max-width:16ch;margin:0 auto 16px}.hero p{max-width:52ch;margin:0 auto 26px;font-size:18px}.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.sec{padding:36px 0}.sec h2{font-size:26px;margin-bottom:18px}.stat b{font-size:34px;display:block}.badge{display:inline-block;padding:2px 10px;font-size:12px;border:1px solid currentColor;border-radius:999px}.alert{padding:12px 16px;font-size:14px}footer{padding:28px 0;margin-top:30px;font-size:13px}`;
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>${css}${buildKitCss(k)}</style>
<header><div class="wrap row" style="justify-content:space-between;padding-top:16px;padding-bottom:16px"><b style="font-size:18px">Brand</b><nav class="row" style="gap:20px;font-size:14px"><a href="#">Product</a><a href="#">Pricing</a><a href="#">Docs</a><button class="btn">Sign up</button></nav></div></header>
<main class="wrap">
<section class="hero"><span class="badge">New</span><h1 style="margin-top:14px">${esc(k.name)}: a complete look</h1><p class="muted">Colour, type, shape, depth and every control, from one click.</p><div class="row" style="justify-content:center"><button class="btn">Get started</button><a href="#">See how it works</a></div></section>
<section class="sec"><h2>Everything in one kit</h2><div class="grid"><div class="card"><b>Fast</b><p class="muted">Cards, panels and tiles share one surface style.</p></div><div class="card"><b>Readable</b><p class="muted">Every colour pair passes a contrast check.</p></div><div class="card"><b>Consistent</b><p class="muted">Buttons, inputs and links follow the same shape.</p></div></div></section>
<section class="sec"><div class="grid"><div class="stat card"><b>99.9%</b><span class="muted">Uptime</span></div><div class="stat card"><b>48ms</b><span class="muted">Median response</span></div><div class="stat card"><b>12k</b><span class="muted">Daily users</span></div></div></section>
<section class="sec"><h2>Pricing</h2><div class="grid"><div class="card"><b>Starter</b><p class="muted">For side projects</p><h3 style="margin:10px 0">$0</h3><button class="btn">Choose</button></div><div class="card"><b>Pro</b><p class="muted">For growing teams</p><h3 style="margin:10px 0">$24</h3><button class="btn">Choose</button></div></div></section>
<section class="sec"><h2>Form</h2><div class="grid"><div class="card" style="display:grid;gap:10px"><input placeholder="Full name"><input placeholder="Email address"><select><option>Choose a plan</option></select><textarea rows="3" placeholder="Message"></textarea><button class="btn">Send</button></div><div class="card"><table><thead><tr><th>Name</th><th>Status</th><th>Total</th></tr></thead><tbody><tr><td>Order 1042</td><td>Paid</td><td>$120</td></tr><tr><td>Order 1043</td><td>Pending</td><td>$64</td></tr><tr><td>Order 1044</td><td>Shipped</td><td>$310</td></tr></tbody></table><p class="alert card" style="margin-top:14px">Heads up: this is an alert box.</p></div></div></section>
</main>
<footer><div class="wrap row" style="justify-content:space-between"><span>© Brand</span><span class="row" style="gap:16px"><a href="#">Privacy</a><a href="#">Terms</a></span></div></footer>`;
}
