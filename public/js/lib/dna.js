// Design DNA: a look is not a colour set, it is six independent decisions made together.
//   palette    - the colours (72 of them, light and dark)
//   structure  - the anatomy of every component: nav, cards, buttons, inputs, badges, tables, footer, links, headings (24)
//   backdrop   - the art behind the page: meshes, aurora, grids, grain, stars, waves, horizon ... some of it animated (20)
//   imagery    - what happens to every picture and picture-background: duotone, frames, masks, glow, ken-burns ... (14)
//   motion     - how the page moves: scroll reveals, stagger, 3D tilt, magnetic buttons, cursor light, parallax,
//                split headlines, curtain, progress bar, shrinking header (16)
//   type       - the font pair, scale, case and tracking (24)
// compose() turns one choice per axis into a stylesheet and a small script. Presets are 1,000+ coherent picks; the builder
// can make any of the roughly 4 million combinations. No dependencies: used by the browser, the server and the tests.
import { hsl, mixHex, readable, contrast, buildKitCss, kitRolesJs, finishKit } from './kits.js';
import { fontImport } from './looks.js';
import { harmonizeJs } from './harmonize.js';

/* ------------------------------ helpers ------------------------------ */
/** Add !important to every declaration (splitting on ; outside brackets). */
export function imp(css) {
  const out = []; let d = 0, cur = '';
  for (const ch of String(css || '')) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ';' && !d) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim());
  return out.map((x) => (/!important$/.test(x) ? x : `${x}!important`)).join(';');
}
const svgUri = (s) => `data:image/svg+xml,${encodeURIComponent(s)}`;
const svg = (s) => `url("${svgUri(s)}")`;
const alpha = (hex, a) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ------------------------------ palettes ------------------------------ */
const HUES = [['Ember', 16], ['Cobalt', 222], ['Moss', 140], ['Plum', 292], ['Lagoon', 188], ['Saffron', 42], ['Rose', 340], ['Slate', 212], ['Coral', 6], ['Violet', 262], ['Mint', 160], ['Gold', 50]];
const SCHEMES = [
  ['Midnight', 'dark', (h) => ({ bg: hsl(h, 0.45, 0.07), surface: hsl(h, 0.4, 0.115), text: hsl(h, 0.5, 0.96), muted: hsl(h, 0.25, 0.74), accent: hsl(h, 0.92, 0.66), accent2: hsl(h + 45, 0.88, 0.64), border: hsl(h, 0.3, 0.2) })],
  ['Ink', 'dark', (h) => ({ bg: hsl(h, 0.08, 0.055), surface: hsl(h, 0.08, 0.1), text: hsl(h, 0.1, 0.94), muted: hsl(h, 0.06, 0.7), accent: hsl(h, 0.8, 0.68), accent2: hsl(h + 30, 0.8, 0.7), border: hsl(h, 0.08, 0.19) })],
  ['Dusk', 'dark', (h) => ({ bg: hsl(h + 10, 0.35, 0.13), surface: hsl(h + 10, 0.32, 0.18), text: hsl(h, 0.4, 0.95), muted: hsl(h, 0.2, 0.76), accent: hsl(h - 20, 0.95, 0.68), accent2: hsl(h + 60, 0.9, 0.66), border: hsl(h, 0.25, 0.27) })],
  ['Daylight', 'light', (h) => ({ bg: hsl(h, 0.25, 0.97), surface: '#ffffff', text: hsl(h, 0.4, 0.12), muted: hsl(h, 0.12, 0.36), accent: hsl(h, 0.8, 0.42), accent2: hsl(h + 40, 0.8, 0.5), border: hsl(h, 0.15, 0.88) })],
  ['Paper', 'light', (h) => ({ bg: hsl(h + 25, 0.4, 0.94), surface: hsl(h + 25, 0.5, 0.98), text: hsl(h + 200, 0.35, 0.13), muted: hsl(h + 25, 0.15, 0.36), accent: hsl(h, 0.7, 0.36), accent2: hsl(h + 35, 0.75, 0.42), border: hsl(h + 25, 0.25, 0.83) })],
  ['Sorbet', 'light', (h) => ({ bg: hsl(h, 0.75, 0.95), surface: '#ffffff', text: hsl(h, 0.45, 0.17), muted: hsl(h, 0.22, 0.38), accent: hsl(h, 0.75, 0.47), accent2: hsl(h + 50, 0.8, 0.5), border: hsl(h, 0.55, 0.86) })],
];
export const PALETTES = SCHEMES.flatMap(([sn, mode, mk]) => HUES.map(([hn, h]) => {
  const p = { id: `${slug(hn)}-${slug(sn)}`, name: `${hn} ${sn}`, mode, hue: h, ...mk(h) };
  p.text = readable(p.text, p.bg, 7); p.muted = readable(p.muted, p.surface, 4.5); p.accent = readable(p.accent, p.bg, 4.5); p.accent2 = readable(p.accent2, p.bg, 3);
  p.on = contrast('#ffffff', p.accent) >= contrast('#0b0b0f', p.accent) ? '#ffffff' : '#0b0b0f';
  return p;
}));

/* ------------------------------ type ------------------------------ */
const sans = (n, f = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif') => `'${n}',${f}`;
const serif = (n) => `'${n}',Georgia,'Iowan Old Style',serif`;
const mono = (n) => `'${n}',ui-monospace,SFMono-Regular,Menlo,monospace`;
const T = (id, name, hf, bf, o = {}) => ({ id, name, hf, bf, hw: 700, hls: '-.02em', upper: 0, h1: 'clamp(2.2rem,5vw,3.8rem)', ...o });
export const TYPES = [
  T('inter', 'Neutral Sans', sans('Inter'), sans('Inter')),
  T('geo', 'Geometric', sans('Outfit'), sans('Outfit'), { hw: 700, hls: '-.03em' }),
  T('grot', 'Grotesk', sans('Space Grotesk'), sans('DM Sans'), { hw: 700 }),
  T('jakarta', 'Friendly', sans('Plus Jakarta Sans'), sans('Plus Jakarta Sans'), { hw: 800, hls: '-.035em' }),
  T('manrope', 'Modern', sans('Manrope'), sans('Manrope'), { hw: 800, hls: '-.03em' }),
  T('bricolage', 'Quirky', sans('Bricolage Grotesque'), sans('Work Sans'), { hw: 800, hls: '-.04em' }),
  T('archivo', 'Swiss Heavy', sans('Archivo'), sans('Archivo'), { hw: 900, hls: '-.045em', h1: 'clamp(2.6rem,6.4vw,5rem)' }),
  T('anton', 'Poster', sans('Anton'), sans('Barlow'), { hw: 400, hls: '.01em', upper: 1, h1: 'clamp(2.8rem,7vw,5.6rem)' }),
  T('oswald', 'Condensed', sans('Oswald'), sans('Karla'), { hw: 600, hls: '.02em', upper: 1 }),
  T('barlowc', 'Sport', sans('Barlow Condensed'), sans('Barlow'), { hw: 700, hls: '.02em', upper: 1, h1: 'clamp(2.8rem,6.6vw,5.2rem)' }),
  T('playfair', 'Classic Serif', serif('Playfair Display'), sans('Inter'), { hw: 700, hls: '-.01em' }),
  T('fraunces', 'Soft Serif', serif('Fraunces'), sans('DM Sans'), { hw: 700, hls: '-.02em' }),
  T('dmserif', 'Display Serif', serif('DM Serif Display'), sans('DM Sans'), { hw: 400, hls: '-.01em' }),
  T('cormorant', 'Fashion', serif('Cormorant Garamond'), sans('Manrope'), { hw: 600, hls: '.01em', h1: 'clamp(2.6rem,6vw,4.6rem)' }),
  T('spectral', 'Literary', serif('Spectral'), serif('Lora'), { hw: 700, hls: '-.01em' }),
  T('baskerville', 'Press', serif('Libre Baskerville'), serif('Libre Baskerville'), { hw: 700, hls: '0' }),
  T('abril', 'Fat Face', serif('Abril Fatface'), sans('Work Sans'), { hw: 400, hls: '0', h1: 'clamp(2.6rem,6.4vw,5rem)' }),
  T('mono', 'Code', mono('JetBrains Mono'), mono('JetBrains Mono'), { hw: 700, hls: '-.02em' }),
  T('plexmono', 'Terminal', mono('IBM Plex Mono'), mono('IBM Plex Mono'), { hw: 600, hls: '0' }),
  T('chakra', 'Techno', sans('Chakra Petch'), sans('Chakra Petch'), { hw: 700, hls: '.01em', upper: 1 }),
  T('orbitron', 'Sci-fi', sans('Orbitron'), sans('Rubik'), { hw: 700, hls: '.04em', upper: 1, h1: 'clamp(2rem,4.6vw,3.4rem)' }),
  T('righteous', 'Retro Rounded', sans('Righteous'), sans('Nunito'), { hw: 400, hls: '.01em' }),
  T('quick', 'Soft Round', sans('Quicksand'), sans('Quicksand'), { hw: 700, hls: '-.01em' }),
  T('bungee', 'Signage', sans('Bungee'), sans('Rubik'), { hw: 400, hls: '.01em', upper: 1, h1: 'clamp(2.2rem,5.4vw,4rem)' }),
];

/* ------------------------------ structure ------------------------------ */
/* A structure answers "what is a card, a button, a nav bar in this design?". Fields are CSS declarations (no selectors). */
const lift = (n) => `transform:translateY(-${n}px)`;
const S = (id, name, family, modes, f) => ({ id, name, family, modes, f });
export const STRUCTURES = [
  S('flat', 'Flat Clean', 'Clean', 'any', (t) => ({ r: 10, card: `background:${t.surface};border:1px solid ${t.border};box-shadow:none`, cardHover: `border-color:${t.accent}`, btn: `background:${t.accent};color:${t.on};border:0;font-weight:600`, btnHover: `filter:brightness(1.08)`, btn2: `background:transparent;color:${t.text};border:1px solid ${t.border}`, input: `background:${t.surface};border:1px solid ${t.border}`, nav: `background:${alpha(t.bg, 0.85)};backdrop-filter:blur(10px);border-bottom:1px solid ${t.border}`, badge: `background:${mixHex(t.bg, t.accent, 0.14)};color:${t.accent};border:0`, foot: `background:${t.surface};border-top:1px solid ${t.border}` })),
  S('lifted', 'Lifted Soft', 'Soft', 'any', (t) => ({ r: 16, card: `background:${t.surface};border:1px solid ${alpha(t.border, 0.6)};box-shadow:0 10px 30px ${alpha('#000000', t.mode === 'dark' ? 0.35 : 0.09)}`, cardHover: `${lift(6)};box-shadow:0 22px 50px ${alpha('#000000', t.mode === 'dark' ? 0.5 : 0.14)}`, btn: `background:${t.accent};color:${t.on};border:0;box-shadow:0 8px 20px ${alpha(t.accent, 0.4)};font-weight:600`, btnHover: `${lift(2)};box-shadow:0 12px 26px ${alpha(t.accent, 0.5)}`, btn2: `background:${t.surface};color:${t.text};border:1px solid ${t.border};box-shadow:0 4px 12px ${alpha('#000000', 0.08)}`, input: `background:${t.surface};border:1px solid ${t.border};box-shadow:inset 0 1px 2px ${alpha('#000000', 0.08)}`, nav: `background:${alpha(t.surface, 0.9)};backdrop-filter:blur(14px);box-shadow:0 6px 24px ${alpha('#000000', 0.12)}`, badge: `background:${mixHex(t.bg, t.accent, 0.16)};color:${t.accent}`, foot: `background:${t.surface};box-shadow:0 -8px 30px ${alpha('#000000', 0.08)}` })),
  S('swiss', 'Swiss Grid', 'Typographic', 'any', (t) => ({ r: 0, card: `background:${t.surface};border:2px solid ${t.text};box-shadow:none`, cardHover: `background:${t.text};color:${t.bg}`, btn: `background:${t.text};color:${t.bg};border:2px solid ${t.text};font-weight:800;`, btnHover: `background:${t.accent};border-color:${t.accent};color:${t.on}`, btn2: `background:transparent;color:${t.text};border:2px solid ${t.text}`, input: `background:transparent;border:0;border-bottom:2px solid ${t.text};border-radius:0`, nav: `background:${t.bg};border-bottom:2px solid ${t.text}`, badge: `background:${t.accent};color:${t.on};border:0;border-radius:0`, foot: `background:${t.text};color:${t.bg};border-top:0`, h: 'border-bottom:2px solid currentColor;', extra: `hr{border-top:2px solid ${t.text}!important}` })),
  S('neobrutal', 'Neo Brutal', 'Brutalist', 'any', (t) => ({ r: 6, card: `background:${t.surface};border:3px solid ${t.mode === 'dark' ? t.text : '#0a0a0a'};box-shadow:7px 7px 0 ${t.mode === 'dark' ? t.accent : '#0a0a0a'}`, cardHover: `transform:translate(-3px,-3px);box-shadow:11px 11px 0 ${t.mode === 'dark' ? t.accent : '#0a0a0a'}`, btn: `background:${t.accent2};color:#0a0a0a;border:3px solid #0a0a0a;box-shadow:4px 4px 0 #0a0a0a;font-weight:800`, btnHover: `transform:translate(2px,2px);box-shadow:2px 2px 0 #0a0a0a`, btn2: `background:${t.surface};color:${t.text};border:3px solid ${t.mode === 'dark' ? t.text : '#0a0a0a'};box-shadow:4px 4px 0 ${t.mode === 'dark' ? t.text : '#0a0a0a'}`, input: `background:${t.surface};border:3px solid ${t.mode === 'dark' ? t.text : '#0a0a0a'};box-shadow:3px 3px 0 ${t.mode === 'dark' ? t.text : '#0a0a0a'}`, nav: `background:${t.accent};color:#0a0a0a;border-bottom:4px solid #0a0a0a`, badge: `background:${t.accent2};color:#0a0a0a;border:2px solid #0a0a0a;border-radius:4px`, foot: `background:${t.accent};color:#0a0a0a;border-top:4px solid #0a0a0a` })),
  S('glass', 'Glass Pane', 'Glass', 'dark', (t) => ({ r: 20, card: `background:${alpha('#ffffff', 0.07)};border:1px solid ${alpha('#ffffff', 0.16)};backdrop-filter:blur(18px) saturate(1.4);box-shadow:0 18px 44px ${alpha('#000000', 0.4)},inset 0 1px 0 ${alpha('#ffffff', 0.18)}`, cardHover: `${lift(5)};border-color:${alpha('#ffffff', 0.34)}`, btn: `background:linear-gradient(120deg,${t.accent},${t.accent2});color:${t.on};border:0;box-shadow:0 10px 26px ${alpha(t.accent, 0.4)};font-weight:700`, btnHover: `${lift(2)};filter:brightness(1.1)`, btn2: `background:${alpha('#ffffff', 0.08)};color:${t.text};border:1px solid ${alpha('#ffffff', 0.22)};backdrop-filter:blur(10px)`, input: `background:${alpha('#ffffff', 0.07)};border:1px solid ${alpha('#ffffff', 0.18)};backdrop-filter:blur(8px)`, nav: `background:${alpha('#ffffff', 0.06)};backdrop-filter:blur(18px);border-bottom:1px solid ${alpha('#ffffff', 0.12)}`, badge: `background:${alpha('#ffffff', 0.1)};color:${t.text};border:1px solid ${alpha('#ffffff', 0.2)}`, foot: `background:${alpha('#ffffff', 0.05)};backdrop-filter:blur(14px);border-top:1px solid ${alpha('#ffffff', 0.1)}` })),
  S('soft', 'Soft Neumorph', 'Soft', 'light', (t) => { const lo = mixHex(t.bg, '#000000', 0.12), hi = mixHex(t.bg, '#ffffff', 0.8); return { r: 24, card: `background:${t.bg};border:0;box-shadow:9px 9px 20px ${lo},-9px -9px 20px ${hi}`, cardHover: `box-shadow:12px 12px 26px ${lo},-12px -12px 26px ${hi}`, btn: `background:${t.bg};color:${t.accent};border:0;box-shadow:5px 5px 12px ${lo},-5px -5px 12px ${hi};font-weight:700`, btnHover: `box-shadow:inset 4px 4px 9px ${lo},inset -4px -4px 9px ${hi}`, btn2: `background:${t.bg};color:${t.text};border:0;box-shadow:inset 3px 3px 7px ${lo},inset -3px -3px 7px ${hi}`, input: `background:${t.bg};border:0;box-shadow:inset 4px 4px 9px ${lo},inset -4px -4px 9px ${hi}`, nav: `background:${t.bg};box-shadow:0 8px 20px ${lo}`, badge: `background:${t.bg};color:${t.accent};box-shadow:inset 2px 2px 5px ${lo},inset -2px -2px 5px ${hi}`, foot: `background:${t.bg};box-shadow:0 -8px 20px ${lo}` }; }),
  S('luxe', 'Luxe Hairline', 'Luxury', 'any', (t) => ({ r: 2, card: `background:${t.surface};border:1px solid ${alpha(t.accent, 0.4)};box-shadow:none`, cardHover: `border-color:${t.accent};box-shadow:0 0 0 1px ${t.accent}`, btn: `background:transparent;color:${t.accent};border:1px solid ${t.accent};font-weight:600`, btnHover: `background:${t.accent};color:${t.on}`, btn2: `background:transparent;color:${t.text};border:1px solid ${alpha(t.text, 0.4)};`, input: `background:transparent;border:0;border-bottom:1px solid ${alpha(t.accent, 0.6)};border-radius:0`, nav: `background:${alpha(t.bg, 0.9)};border-bottom:1px solid ${alpha(t.accent, 0.3)};`, badge: `background:transparent;color:${t.accent};border:1px solid ${t.accent};`, foot: `background:${t.surface};border-top:1px solid ${alpha(t.accent, 0.3)}`, a: `text-decoration:none;border-bottom:1px solid ${alpha(t.accent, 0.5)}` })),
  S('pill', 'Pill Playful', 'Playful', 'any', (t) => ({ r: 28, cr: 28, br: 999, card: `background:${t.surface};border:2px solid ${t.border};box-shadow:0 14px 34px ${alpha(t.accent, 0.18)}`, cardHover: `${lift(6)}`, btn: `background:${t.accent};color:${t.on};border:0;box-shadow:0 8px 0 ${mixHex(t.accent, '#000000', 0.3)};font-weight:800`, btnHover: `transform:translateY(4px);box-shadow:0 4px 0 ${mixHex(t.accent, '#000000', 0.3)}`, btn2: `background:${t.surface};color:${t.text};border:2px solid ${t.border}`, input: `background:${t.surface};border:2px solid ${t.border};border-radius:999px;`, nav: `background:${t.surface};border-radius:999px;box-shadow:0 10px 30px ${alpha('#000000', 0.14)};border:2px solid ${t.border}`, badge: `background:${t.accent2};color:${t.mode === 'dark' ? '#0b0b0f' : '#ffffff'};border:0`, foot: `background:${t.surface};border-radius:32px 32px 0 0` })),
  S('editorial', 'Editorial Rules', 'Typographic', 'light', (t) => ({ r: 2, card: `background:transparent;border:0;border-top:3px double ${t.text};border-radius:0;box-shadow:none`, cardHover: `border-top-color:${t.accent}`, btn: `background:${t.text};color:${t.bg};border:0;border-radius:0;font-weight:600;`, btnHover: `background:${t.accent};color:${t.on}`, btn2: `background:transparent;color:${t.text};border:1px solid ${t.text};border-radius:0`, input: `background:transparent;border:0;border-bottom:1px solid ${t.text};border-radius:0`, nav: `background:${t.bg};border-bottom:3px double ${t.text}`, badge: `background:transparent;color:${t.accent};border:0;`, foot: `background:${t.bg};border-top:3px double ${t.text}`, h: 'font-variant-numeric:oldstyle-nums', a: `text-decoration-thickness:1px;text-underline-offset:4px` })),
  S('terminal', 'Terminal Box', 'Hacker', 'dark', (t) => ({ r: 0, card: `background:${t.bg};border:1px solid ${t.accent};box-shadow:0 0 0 3px ${alpha(t.accent, 0.1)};border-radius:0`, cardHover: `box-shadow:0 0 0 3px ${alpha(t.accent, 0.35)}`, btn: `background:transparent;color:${t.accent};border:1px solid ${t.accent};border-radius:0;font-weight:700`, btnHover: `background:${t.accent};color:${t.on}`, btn2: `background:transparent;color:${t.muted};border:1px dashed ${t.muted};border-radius:0`, input: `background:${t.bg};border:1px solid ${t.accent};border-radius:0;caret-color:${t.accent}`, nav: `background:${t.bg};border-bottom:1px solid ${t.accent}`, badge: `background:transparent;color:${t.accent};border:1px solid ${t.accent};border-radius:0`, foot: `background:${t.bg};border-top:1px solid ${t.accent}`,  })),
  S('neon', 'Neon Edge', 'Neon', 'dark', (t) => ({ r: 8, card: `background:${alpha(t.surface, 0.8)};border:1px solid ${alpha(t.accent, 0.55)};box-shadow:0 0 22px ${alpha(t.accent, 0.25)},inset 0 0 18px ${alpha(t.accent, 0.08)}`, cardHover: `border-color:${t.accent};box-shadow:0 0 36px ${alpha(t.accent, 0.5)},inset 0 0 24px ${alpha(t.accent, 0.15)}`, btn: `background:${alpha(t.accent, 0.12)};color:${t.accent};border:1px solid ${t.accent};box-shadow:0 0 18px ${alpha(t.accent, 0.5)};text-shadow:0 0 8px ${t.accent};font-weight:700`, btnHover: `background:${t.accent};color:${t.on};text-shadow:none;box-shadow:0 0 34px ${t.accent}`, btn2: `background:transparent;color:${t.accent2};border:1px solid ${t.accent2};box-shadow:0 0 14px ${alpha(t.accent2, 0.4)}`, input: `background:${alpha(t.bg, 0.8)};border:1px solid ${alpha(t.accent, 0.5)};box-shadow:0 0 12px ${alpha(t.accent, 0.18)}`, nav: `background:${alpha(t.bg, 0.8)};backdrop-filter:blur(10px);border-bottom:1px solid ${alpha(t.accent, 0.5)};box-shadow:0 0 24px ${alpha(t.accent, 0.2)}`, badge: `background:transparent;color:${t.accent2};border:1px solid ${t.accent2};box-shadow:0 0 10px ${alpha(t.accent2, 0.4)}`, foot: `background:${t.bg};border-top:1px solid ${alpha(t.accent, 0.5)}`, h: `text-shadow:0 0 22px ${alpha(t.accent, 0.5)}` })),
  S('ticket', 'Ticket Stub', 'Print', 'light', (t) => ({ r: 10, card: `background:${t.surface};border:2px dashed ${alpha(t.text, 0.5)};box-shadow:6px 6px 0 ${alpha(t.accent, 0.35)}`, cardHover: `${lift(3)}`, btn: `background:${t.accent};color:${t.on};border:2px solid ${t.text};box-shadow:3px 3px 0 ${t.text};font-weight:800;`, btnHover: `transform:translate(2px,2px);box-shadow:1px 1px 0 ${t.text}`, btn2: `background:${t.surface};color:${t.text};border:2px dashed ${t.text}`, input: `background:${t.surface};border:2px dashed ${alpha(t.text, 0.5)}`, nav: `background:${t.surface};border-bottom:3px dashed ${alpha(t.text, 0.5)}`, badge: `background:${t.accent2};color:${t.on};border:2px solid ${t.text}`, foot: `background:${t.surface};border-top:3px dashed ${alpha(t.text, 0.5)}` })),
  S('layered', 'Paper Layers', 'Print', 'light', (t) => ({ r: 6, card: `background:${t.surface};border:1px solid ${t.border};box-shadow:0 1px 0 ${t.border},0 6px 0 -2px ${t.surface},0 7px 0 -2px ${t.border},0 12px 0 -4px ${t.surface},0 13px 0 -4px ${t.border}`, cardHover: `${lift(3)}`, btn: `background:${t.accent};color:${t.on};border:0;box-shadow:0 3px 0 ${mixHex(t.accent, '#000000', 0.35)};font-weight:700`, btnHover: `transform:translateY(2px);box-shadow:0 1px 0 ${mixHex(t.accent, '#000000', 0.35)}`, btn2: `background:${t.surface};color:${t.text};border:1px solid ${t.border};box-shadow:0 3px 0 ${t.border}`, input: `background:${t.surface};border:1px solid ${t.border};box-shadow:inset 0 2px 0 ${alpha('#000000', 0.06)}`, nav: `background:${t.surface};border-bottom:1px solid ${t.border};box-shadow:0 3px 0 ${t.border}`, badge: `background:${t.bg};color:${t.accent};border:1px solid ${t.border}`, foot: `background:${t.surface};border-top:1px solid ${t.border}` })),
  S('sticker', 'Sticker Pop', 'Playful', 'any', (t) => ({ r: 14, card: `background:${t.surface};border:3px solid ${t.mode === 'dark' ? t.text : '#111111'};box-shadow:0 0 0 4px ${t.accent2},0 10px 0 0 ${alpha('#000000', 0.25)}`, cardHover: `transform:scale(1.02)`, btn: `background:${t.accent};color:${t.on};border:3px solid ${t.mode === 'dark' ? t.text : '#111111'};box-shadow:0 5px 0 ${t.mode === 'dark' ? t.text : '#111111'};font-weight:800`, btnHover: ` translateY(2px);box-shadow:0 3px 0 ${t.mode === 'dark' ? t.text : '#111111'}`, btn2: `background:${t.surface};color:${t.text};border:3px solid ${t.mode === 'dark' ? t.text : '#111111'}`, input: `background:${t.surface};border:3px solid ${t.mode === 'dark' ? t.text : '#111111'};border-radius:12px`, nav: `background:${t.accent2};color:#111111;border-bottom:4px solid #111111`, badge: `background:${t.accent2};color:#111111;border:2px solid #111111;font-weight:800`, foot: `background:${t.accent2};color:#111111;border-top:4px solid #111111` })),
  S('gradborder', 'Gradient Edge', 'Modern', 'any', (t) => ({ r: 16, card: `border:1px solid transparent;background:linear-gradient(${t.surface},${t.surface}) padding-box,linear-gradient(135deg,${t.accent},${t.accent2}) border-box;box-shadow:0 14px 34px ${alpha(t.accent, 0.16)}`, cardHover: `${lift(4)};box-shadow:0 20px 44px ${alpha(t.accent, 0.3)}`, btn: `background:linear-gradient(120deg,${t.accent},${t.accent2});color:${t.on};border:0;box-shadow:0 10px 24px ${alpha(t.accent, 0.35)};font-weight:700`, btnHover: `filter:brightness(1.1) saturate(1.15)`, btn2: `border:1px solid transparent;background:linear-gradient(${t.bg},${t.bg}) padding-box,linear-gradient(120deg,${t.accent},${t.accent2}) border-box;color:${t.text}`, input: `background:${t.surface};border:1px solid ${t.border}`, nav: `background:${alpha(t.bg, 0.8)};backdrop-filter:blur(12px);border-bottom:1px solid ${alpha(t.accent, 0.3)}`, badge: `background:linear-gradient(120deg,${alpha(t.accent, 0.2)},${alpha(t.accent2, 0.2)});color:${t.text};border:1px solid ${alpha(t.accent, 0.4)}`, foot: `background:${t.surface};border-top:1px solid ${alpha(t.accent, 0.3)}`, h: `background:linear-gradient(120deg,${t.text} 30%,${t.accent});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent` })),
  S('underline', 'Quiet Underline', 'Minimal', 'any', (t) => ({ r: 0, card: `background:transparent;border:0;border-bottom:1px solid ${t.border};border-radius:0;box-shadow:none`, cardHover: `border-bottom-color:${t.accent}`, btn: `background:transparent;color:${t.text};border:0;border-bottom:2px solid ${t.accent};border-radius:0;font-weight:600`, btnHover: `color:${t.accent};`, btn2: `background:transparent;color:${t.muted};border:0;border-bottom:1px solid ${t.border};border-radius:0`, input: `background:transparent;border:0;border-bottom:1px solid ${t.border};border-radius:0`, nav: `background:${t.bg};border-bottom:1px solid ${t.border}`, badge: `background:transparent;color:${t.muted};border:0;border-bottom:1px solid ${t.muted};border-radius:0`, foot: `background:${t.bg};border-top:1px solid ${t.border}` })),
  S('bento', 'Bento Tiles', 'Modern', 'any', (t) => ({ r: 28, card: `background:${t.surface};border:1px solid ${t.border};box-shadow:0 1px 0 ${alpha('#ffffff', t.mode === 'dark' ? 0.06 : 0.9)} inset`, cardHover: `transform:scale(1.015);border-color:${t.accent}`, btn: `background:${t.text};color:${t.bg};border:0;font-weight:700;border-radius:999px`, btnHover: `background:${t.accent};color:${t.on}`, btn2: `background:${t.surface};color:${t.text};border:1px solid ${t.border};border-radius:999px`, input: `background:${t.surface};border:1px solid ${t.border};border-radius:18px`, nav: `background:${alpha(t.surface, 0.9)};border:1px solid ${t.border};border-radius:22px;backdrop-filter:blur(12px)`, badge: `background:${t.bg};color:${t.text};border:1px solid ${t.border}`, foot: `background:${t.surface};border-radius:28px 28px 0 0;border:1px solid ${t.border}` })),
  S('retroos', 'Retro Window', 'Retro', 'light', (t) => ({ r: 0, card: `background:${t.surface};border:2px solid #111111;box-shadow:inset -2px -2px 0 ${alpha('#000000', 0.25)},inset 2px 2px 0 ${alpha('#ffffff', 0.9)},4px 4px 0 #111111`, cardHover: `transform:translate(-1px,-1px)`, btn: `background:${mixHex(t.surface, '#c0c0c0', 0.6)};color:#111111;border:2px solid #111111;box-shadow:inset -2px -2px 0 ${alpha('#000000', 0.3)},inset 2px 2px 0 #ffffff;font-weight:700`, btnHover: `box-shadow:inset 2px 2px 0 ${alpha('#000000', 0.3)},inset -2px -2px 0 #ffffff`, btn2: `background:${t.surface};color:#111111;border:2px solid #111111`, input: `background:#ffffff;color:#111111;border:2px solid #111111;box-shadow:inset 2px 2px 0 ${alpha('#000000', 0.25)}`, nav: `background:${t.accent};color:${t.on};border-bottom:3px solid #111111`, badge: `background:${t.accent2};color:#111111;border:2px solid #111111;border-radius:0`, foot: `background:${t.surface};border-top:3px solid #111111` })),
  S('blueprint', 'Blueprint Lines', 'Technical', 'dark', (t) => ({ r: 0, card: `background:${alpha(t.surface, 0.6)};border:1px dashed ${alpha(t.accent, 0.7)};box-shadow:none`, cardHover: `border-style:solid;background:${alpha(t.accent, 0.1)}`, btn: `background:transparent;color:${t.accent};border:1px solid ${t.accent};`, btnHover: `background:${t.accent};color:${t.on}`, btn2: `background:transparent;color:${t.muted};border:1px dashed ${t.muted};`, input: `background:transparent;border:1px dashed ${alpha(t.accent, 0.7)}`, nav: `background:${alpha(t.bg, 0.9)};border-bottom:1px dashed ${alpha(t.accent, 0.7)}`, badge: `background:transparent;color:${t.accent};border:1px solid ${t.accent};border-radius:0;`, foot: `background:transparent;border-top:1px dashed ${alpha(t.accent, 0.7)}` })),
  S('comic', 'Comic Panel', 'Playful', 'light', (t) => ({ r: 4, card: `background:${t.surface};border:3px solid #111111;box-shadow:6px 6px 0 ${t.accent};background-image:radial-gradient(${alpha('#000000', 0.12)} 1px,transparent 1.4px);background-size:7px 7px`, cardHover: ``, btn: `background:${t.accent2};color:#111111;border:3px solid #111111;box-shadow:4px 4px 0 #111111;font-weight:900`, btnHover: ` translate(2px,2px);box-shadow:2px 2px 0 #111111`, btn2: `background:${t.surface};color:#111111;border:3px solid #111111`, input: `background:${t.surface};border:3px solid #111111`, nav: `background:${t.accent2};color:#111111;border-bottom:4px solid #111111`, badge: `background:${t.accent};color:${t.on};border:2px solid #111111;font-weight:900`, foot: `background:${t.accent2};color:#111111;border-top:4px solid #111111` })),
  S('material', 'Material Elevated', 'Clean', 'any', (t) => ({ r: 12, card: `background:${t.surface};border:0;box-shadow:0 1px 3px ${alpha('#000000', 0.2)},0 4px 10px ${alpha('#000000', 0.12)}`, cardHover: `box-shadow:0 8px 24px ${alpha('#000000', 0.28)}`, btn: `background:${t.accent};color:${t.on};border:0;box-shadow:0 2px 4px ${alpha('#000000', 0.3)};font-weight:600;`, btnHover: `box-shadow:0 6px 14px ${alpha('#000000', 0.35)}`, btn2: `background:transparent;color:${t.accent};border:0;font-weight:600;`, input: `background:${mixHex(t.surface, t.text, 0.05)};border:0;border-bottom:2px solid ${t.muted};border-radius:6px 6px 0 0`, nav: `background:${t.accent};color:${t.on};box-shadow:0 3px 8px ${alpha('#000000', 0.3)}`, badge: `background:${mixHex(t.bg, t.accent, 0.2)};color:${t.accent};border:0`, foot: `background:${t.surface};box-shadow:0 -2px 8px ${alpha('#000000', 0.15)}` })),
  S('liquid', 'Liquid Glass', 'Glass', 'dark', (t) => ({ r: 30, card: `background:linear-gradient(135deg,${alpha('#ffffff', 0.14)},${alpha('#ffffff', 0.03)});border:1px solid ${alpha('#ffffff', 0.22)};backdrop-filter:blur(26px) saturate(1.8);box-shadow:inset 0 1px 1px ${alpha('#ffffff', 0.4)},inset 0 -8px 18px ${alpha(t.accent, 0.1)},0 22px 50px ${alpha('#000000', 0.45)}`, cardHover: `${lift(5)};box-shadow:inset 0 1px 1px ${alpha('#ffffff', 0.5)},0 28px 60px ${alpha('#000000', 0.5)}`, btn: `background:linear-gradient(180deg,${alpha('#ffffff', 0.35)},${alpha(t.accent, 0.55)});color:#ffffff;border:1px solid ${alpha('#ffffff', 0.4)};backdrop-filter:blur(10px);box-shadow:inset 0 1px 1px ${alpha('#ffffff', 0.6)},0 8px 22px ${alpha(t.accent, 0.4)};text-shadow:0 1px 2px ${alpha('#000000', 0.4)};font-weight:700`, btnHover: `filter:brightness(1.15)`, btn2: `background:${alpha('#ffffff', 0.08)};color:${t.text};border:1px solid ${alpha('#ffffff', 0.28)};backdrop-filter:blur(10px)`, input: `background:${alpha('#ffffff', 0.08)};border:1px solid ${alpha('#ffffff', 0.22)};box-shadow:inset 0 2px 6px ${alpha('#000000', 0.3)}`, nav: `background:${alpha('#ffffff', 0.08)};backdrop-filter:blur(24px) saturate(1.6);border:1px solid ${alpha('#ffffff', 0.18)};border-radius:26px`, badge: `background:${alpha('#ffffff', 0.12)};color:${t.text};border:1px solid ${alpha('#ffffff', 0.25)}`, foot: `background:${alpha('#ffffff', 0.05)};backdrop-filter:blur(20px);border-top:1px solid ${alpha('#ffffff', 0.14)}` })),
  S('emboss', 'Skeuo Emboss', 'Soft', 'light', (t) => ({ r: 12, card: `background:linear-gradient(180deg,${mixHex(t.surface, '#ffffff', 0.5)},${t.surface});border:1px solid ${t.border};box-shadow:inset 0 1px 0 #ffffff,0 2px 4px ${alpha('#000000', 0.1)},0 10px 22px ${alpha('#000000', 0.08)}`, cardHover: `box-shadow:inset 0 1px 0 #ffffff,0 4px 8px ${alpha('#000000', 0.12)},0 16px 30px ${alpha('#000000', 0.12)}`, btn: `background:linear-gradient(180deg,${mixHex(t.accent, '#ffffff', 0.25)},${t.accent});color:${t.on};border:1px solid ${mixHex(t.accent, '#000000', 0.3)};box-shadow:inset 0 1px 0 ${alpha('#ffffff', 0.5)},0 2px 4px ${alpha('#000000', 0.25)};text-shadow:0 -1px 0 ${alpha('#000000', 0.3)};font-weight:700`, btnHover: `filter:brightness(1.06)`, btn2: `background:linear-gradient(180deg,#ffffff,${mixHex(t.surface, t.text, 0.06)});color:${t.text};border:1px solid ${t.border};box-shadow:inset 0 1px 0 #ffffff,0 1px 3px ${alpha('#000000', 0.15)}`, input: `background:#ffffff;border:1px solid ${t.border};box-shadow:inset 0 2px 4px ${alpha('#000000', 0.12)}`, nav: `background:linear-gradient(180deg,#ffffff,${t.surface});border-bottom:1px solid ${t.border};box-shadow:0 2px 6px ${alpha('#000000', 0.1)}`, badge: `background:linear-gradient(180deg,${mixHex(t.accent, '#ffffff', 0.3)},${t.accent});color:${t.on};border:1px solid ${mixHex(t.accent, '#000000', 0.3)}`, foot: `background:linear-gradient(180deg,${t.surface},${t.bg});border-top:1px solid ${t.border}` })),
  S('mono', 'Mono Strict', 'Minimal', 'any', (t) => ({ r: 4, card: `background:${t.surface};border:1px solid ${t.text};box-shadow:none`, cardHover: `background:${t.text};color:${t.bg}`, btn: `background:${t.text};color:${t.bg};border:1px solid ${t.text};font-weight:600;`, btnHover: `background:transparent;color:${t.text}`, btn2: `background:transparent;color:${t.text};border:1px solid ${t.text}`, input: `background:transparent;border:1px solid ${t.text}`, nav: `background:${t.bg};border-bottom:1px solid ${t.text}`, badge: `background:${t.text};color:${t.bg};border:0;border-radius:2px`, foot: `background:${t.bg};border-top:1px solid ${t.text}` })),
];

/* ------------------------------ backdrops ------------------------------ */
const B = (id, name, modes, f, anim = false) => ({ id, name, modes, f, anim });
const layer = (css) => `body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;${css}}`;
export const BACKDROPS = [
  B('plain', 'Plain', 'any', () => ''),
  B('mesh', 'Mesh Gradient', 'any', (t) => layer(`background:radial-gradient(60% 50% at 12% 8%,${alpha(t.accent, 0.35)},transparent 70%),radial-gradient(55% 45% at 90% 12%,${alpha(t.accent2, 0.3)},transparent 70%),radial-gradient(60% 55% at 70% 100%,${alpha(t.accent, 0.22)},transparent 70%)`)),
  B('aurora', 'Aurora Drift', 'dark', (t) => layer(`background:radial-gradient(40% 35% at 20% 20%,${alpha(t.accent, 0.5)},transparent 70%),radial-gradient(35% 30% at 80% 30%,${alpha(t.accent2, 0.45)},transparent 70%),radial-gradient(45% 40% at 50% 90%,${alpha(t.accent, 0.3)},transparent 70%);background-size:140% 140%;filter:blur(40px) saturate(1.3);animation:dx-drift 22s ease-in-out infinite alternate`), true),
  B('grid', 'Grid Lines', 'any', (t) => layer(`background-image:linear-gradient(${alpha(t.text, 0.13)} 1px,transparent 1px),linear-gradient(90deg,${alpha(t.text, 0.13)} 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(ellipse at 50% 30%,#000 30%,transparent 80%);mask-image:radial-gradient(ellipse at 50% 30%,#000 30%,transparent 80%)`)),
  B('dots', 'Dot Matrix', 'any', (t) => layer(`background-image:radial-gradient(${alpha(t.text, 0.3)} 1.4px,transparent 1.9px);background-size:22px 22px`)),
  B('grain', 'Film Grain', 'any', (t) => layer(`opacity:${t.mode === 'dark' ? 0.16 : 0.1};background-image:${svg("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .8 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")}`)),
  B('stripes', 'Diagonal Stripes', 'any', (t) => layer(`background:repeating-linear-gradient(135deg,${alpha(t.accent, 0.13)} 0 14px,transparent 14px 28px)`)),
  B('spotlight', 'Top Spotlight', 'dark', (t) => layer(`background:radial-gradient(70% 55% at 50% -10%,${alpha(t.accent, 0.4)},transparent 70%)`)),
  B('horizon', 'Retro Horizon', 'dark', (t) => layer(`background:linear-gradient(180deg,transparent 0 52%,${alpha(t.accent2, 0.25)} 52.2%,transparent 70%),repeating-linear-gradient(90deg,${alpha(t.accent, 0.35)} 0 1px,transparent 1px 60px) bottom/100% 48% no-repeat,repeating-linear-gradient(0deg,${alpha(t.accent, 0.35)} 0 1px,transparent 1px 44px) bottom/100% 48% no-repeat;-webkit-mask-image:linear-gradient(180deg,transparent 40%,#000 60%);mask-image:linear-gradient(180deg,transparent 40%,#000 60%)`)),
  B('stars', 'Starfield', 'dark', (t) => layer(`background-image:radial-gradient(1.4px 1.4px at 20px 30px,${t.text},transparent),radial-gradient(1px 1px at 90px 110px,${alpha(t.text, 0.8)},transparent),radial-gradient(1.6px 1.6px at 160px 60px,${t.accent},transparent),radial-gradient(1px 1px at 230px 170px,${alpha(t.text, 0.7)},transparent);background-size:260px 200px;opacity:.6;animation:dx-twinkle 6s ease-in-out infinite alternate`), true),
  B('blueprint', 'Blueprint Grid', 'dark', (t) => layer(`background-image:linear-gradient(${alpha(t.accent, 0.25)} 1px,transparent 1px),linear-gradient(90deg,${alpha(t.accent, 0.25)} 1px,transparent 1px),linear-gradient(${alpha(t.accent, 0.1)} 1px,transparent 1px),linear-gradient(90deg,${alpha(t.accent, 0.1)} 1px,transparent 1px);background-size:120px 120px,120px 120px,24px 24px,24px 24px`)),
  B('paper', 'Paper Fibre', 'light', (t) => layer(`opacity:.5;background-image:${svg("<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='.04 .8' numOctaves='3'/><feColorMatrix values='0 0 0 0 .55 0 0 0 0 .45 0 0 0 0 .3 0 0 0 .35 0'/></filter><rect width='100%' height='100%' filter='url(#p)'/></svg>")}`)),
  B('waves', 'Soft Waves', 'any', (t) => layer(`background:${svg(`<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='200' viewBox='0 0 1200 200'><path d='M0 120 C200 40 400 200 600 120 S1000 40 1200 120 V200 H0Z' fill='${t.accent}' fill-opacity='.14'/><path d='M0 150 C250 90 450 210 700 150 S1050 90 1200 150 V200 H0Z' fill='${t.accent2}' fill-opacity='.14'/></svg>`)} bottom/100% 220px repeat-x`)),
  B('conic', 'Conic Sunrise', 'any', (t) => layer(`background:conic-gradient(from 200deg at 50% 110%,${alpha(t.accent, 0.35)},${alpha(t.accent2, 0.3)},transparent 40%,transparent 60%,${alpha(t.accent, 0.3)})`)),
  B('bokeh', 'Bokeh Lights', 'dark', (t) => layer(`background:radial-gradient(circle at 15% 25%,${alpha(t.accent, 0.35)} 0 70px,transparent 72px),radial-gradient(circle at 80% 18%,${alpha(t.accent2, 0.3)} 0 110px,transparent 112px),radial-gradient(circle at 65% 78%,${alpha(t.accent, 0.25)} 0 90px,transparent 92px),radial-gradient(circle at 25% 85%,${alpha(t.accent2, 0.25)} 0 60px,transparent 62px);filter:blur(22px);animation:dx-float 18s ease-in-out infinite alternate`), true),
  B('scan', 'CRT Scanlines', 'dark', (t) => layer(`background:repeating-linear-gradient(0deg,${alpha('#000000', 0.25)} 0 1px,transparent 1px 3px);mix-blend-mode:multiply`)),
  B('shift', 'Shifting Gradient', 'any', (t) => layer(`background:linear-gradient(120deg,${alpha(t.accent, 0.28)},${alpha(t.accent2, 0.24)},${alpha(t.accent, 0.1)},${alpha(t.accent2, 0.28)});background-size:300% 300%;animation:dx-shift 16s ease infinite`), true),
  B('memphis', 'Memphis Shapes', 'light', (t) => layer(`background:${svg(`<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><circle cx='40' cy='50' r='12' fill='${t.accent}' fill-opacity='.35'/><rect x='170' y='40' width='28' height='28' fill='${t.accent2}' fill-opacity='.35' transform='rotate(20 184 54)'/><path d='M60 190 l18 -30 l18 30z' fill='${t.accent}' fill-opacity='.3'/><path d='M180 190 q10 -20 20 0 t20 0' stroke='${t.accent2}' stroke-opacity='.5' stroke-width='4' fill='none'/></svg>`)}`)),
  B('topo', 'Topographic', 'any', (t) => layer(`background:repeating-radial-gradient(circle at 30% 20%,transparent 0 22px,${alpha(t.text, 0.14)} 22px 23px),repeating-radial-gradient(circle at 80% 80%,transparent 0 30px,${alpha(t.text, 0.12)} 30px 31px)`)),
  B('checker', 'Soft Checker', 'any', (t) => layer(`background:conic-gradient(${alpha(t.text, 0.09)} 25%,transparent 0 50%,${alpha(t.text, 0.09)} 0 75%,transparent 0) 0 0/60px 60px`)),
];

/* ------------------------------ imagery ------------------------------ */
const M = (id, name, f, anim = false) => ({ id, name, f, anim });
const IMG = 'img,picture,video,[data-dx=media]';
export const IMAGERY = [
  M('natural', 'Natural', () => `${IMG}{transition:transform .5s ease,filter .5s ease}`),
  M('duo', 'Duotone', (t) => `${IMG}{filter:grayscale(1) contrast(1.05);mix-blend-mode:luminosity}[data-dx=hero],[style*="background-image"]{background-color:${t.accent}!important;background-blend-mode:multiply!important}`),
  M('mono-hover', 'Mono to colour', () => `${IMG}{filter:grayscale(1);transition:filter .5s ease,transform .5s ease}${IMG.split(',').map((x) => `${x}:hover`).join(',')}{filter:none}`),
  M('vivid', 'Vivid', () => `${IMG}{filter:saturate(1.35) contrast(1.06);transition:transform .5s ease}`),
  M('cinema', 'Cinematic', (t) => `${IMG}{filter:contrast(1.1) saturate(.9) brightness(.95);box-shadow:inset 0 0 120px ${alpha('#000000', 0.5)}}[data-dx=hero]{background-blend-mode:overlay!important;background-color:${alpha(t.bg, 0.5)}!important}`),
  M('polaroid', 'Polaroid', (t) => `img{outline:8px solid #ffffff!important;outline-offset:-1px!important;box-shadow:0 12px 28px ${alpha('#000000', 0.3)}!important;transition:transform .4s ease}img:hover{transform:scale(1.03)}`),
  M('offset', 'Offset frame', (t) => `img{outline:3px solid ${t.accent}!important;outline-offset:8px!important;transition:outline-offset .3s ease}img:hover{outline-offset:14px!important}`),
  M('arch', 'Arch masks', () => `img{border-radius:999px 999px 18px 18px!important}`),
  M('circle', 'Circles', () => `img{border-radius:50%!important}`),
  M('blob', 'Blob masks', () => `img{clip-path:polygon(50% 0%,83% 12%,100% 43%,94% 78%,68% 100%,32% 100%,6% 78%,0% 43%,17% 12%)!important}`),
  M('glow', 'Accent glow', (t) => `img{box-shadow:0 0 0 1px ${alpha(t.accent, 0.5)},0 18px 50px ${alpha(t.accent, 0.35)}!important;border-radius:14px!important}`),
  M('kenburns', 'Ken Burns', () => `[data-dx=media],picture{overflow:hidden}img{animation:dx-kenburns 16s ease-in-out infinite alternate}`, true),
  M('zoom', 'Hover zoom', () => `picture,[data-dx=media]{overflow:hidden}img{transition:transform .7s cubic-bezier(.2,.8,.2,1)}img:hover{transform:scale(1.08)}`),
  M('retro', 'Retro print', (t) => `${IMG}{filter:sepia(.45) contrast(1.1) saturate(1.2) hue-rotate(-8deg)}img{outline:2px solid ${t.text}!important;border-radius:4px!important;box-shadow:5px 5px 0 ${t.accent}!important}`),
];

/* ------------------------------ motion ------------------------------ */
const Mo = (id, name, o) => ({ id, name, reveal: 'none', stagger: 0, hover: 'none', tilt: 0, shine: 0, magnet: 0, spot: 0, parallax: 0, progress: 0, shrink: 0, split: 0, ambient: 'none', curtain: 0, ...o });
export const MOTIONS = [
  Mo('still', 'Still', {}),
  Mo('gentle', 'Gentle rise', { reveal: 'rise', hover: 'lift' }),
  Mo('stagger', 'Staggered cascade', { reveal: 'rise', stagger: 1, hover: 'lift', shine: 1 }),
  Mo('pop', 'Pop in', { reveal: 'pop', hover: 'press' }),
  Mo('blur', 'Blur focus', { reveal: 'blur', hover: 'glow', stagger: 1 }),
  Mo('slide', 'Side slide', { reveal: 'slide', hover: 'underline' }),
  Mo('wipe', 'Clip wipe', { reveal: 'wipe', hover: 'lift' }),
  Mo('tilt', '3D tilt + shine', { reveal: 'rise', tilt: 1, shine: 1, hover: 'glow' }),
  Mo('magnet', 'Magnetic + spotlight', { reveal: 'fade', magnet: 1, spot: 1, hover: 'glow' }),
  Mo('parallax', 'Parallax depth', { reveal: 'fade', parallax: 1, progress: 1, shrink: 1, hover: 'lift' }),
  Mo('aurora', 'Ambient drift', { reveal: 'blur', ambient: 'drift', spot: 1, hover: 'glow' }),
  Mo('float', 'Floating cards', { reveal: 'pop', ambient: 'float', hover: 'lift' }),
  Mo('kinetic', 'Kinetic cascade', { reveal: 'rise', stagger: 1, shine: 1, hover: 'underline' }),
  Mo('curtain', 'Curtain open', { reveal: 'rise', stagger: 1, curtain: 1, hover: 'lift', progress: 1 }),
  Mo('depth', 'Full depth', { reveal: 'blur', stagger: 1, tilt: 1, parallax: 1, spot: 1, magnet: 1, progress: 1, shrink: 1, shine: 1, hover: 'glow' }),
  Mo('cinema', 'Cinematic', { reveal: 'fade', parallax: 1, progress: 1, shrink: 1, ambient: 'breathe', hover: 'lift' }),
];

/** CSS for a motion bundle: keyframes, initial states, hover effects. Reduced-motion users get none of it. */
export function motionCss(m, t) {
  const rv = { rise: 'translate:0 28px', pop: 'scale:.92', blur: 'filter:blur(14px);translate:0 12px', slide: 'translate:var(--dx-sx,-40px) 0', wipe: 'clip-path:inset(0 100% 0 0)', fade: '' }[m.reveal];
  const parts = [
    '@keyframes dx-drift{from{background-position:0% 0%;transform:scale(1)}to{background-position:100% 100%;transform:scale(1.15)}}@keyframes dx-twinkle{from{opacity:.25}to{opacity:.7}}@keyframes dx-float{from{transform:translate3d(-2%,-1%,0)}to{transform:translate3d(2%,2%,0)}}@keyframes dx-shift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}@keyframes dx-kenburns{from{transform:scale(1) translate(0,0)}to{transform:scale(1.12) translate(-2%,-1.5%)}}@keyframes dx-shine{from{transform:translateX(-120%) skewX(-20deg)}to{transform:translateX(220%) skewX(-20deg)}}@keyframes dx-bob{0%,100%{translate:0 0}50%{translate:0 -8px}}@keyframes dx-breathe{0%,100%{filter:brightness(1)}50%{filter:brightness(1.08)}}@keyframes dx-curtain{to{transform:translateY(-101%)}}@keyframes dx-word{from{opacity:0;translate:0 .6em;filter:blur(6px)}to{opacity:1;translate:0 0;filter:none}}',
    m.reveal !== 'none' ? `[data-dx-r]:not(.dx-in){opacity:0;${rv}}[data-dx-r].dx-in{animation:dx-in .85s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--dx-d,0ms)}@keyframes dx-in{from{opacity:0;${rv}}}` : '',
    { lift: `[data-dx=card],[data-dx=btn]{transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s ease,background .25s ease,color .25s ease,border-color .25s ease}`, glow: `[data-dx=card],[data-dx=btn]{transition:box-shadow .35s ease,border-color .35s ease,transform .35s ease,filter .3s ease}[data-dx=card]:hover,[data-dx=btn]:hover{box-shadow:0 0 0 1px ${alpha(t.accent, 0.6)},0 16px 44px ${alpha(t.accent, 0.35)}!important}`, press: `[data-dx=btn]{transition:transform .15s ease,box-shadow .15s ease}[data-dx=btn]:active{transform:scale(.94)!important}`, underline: `a{background:linear-gradient(currentColor,currentColor) 0 100%/0 2px no-repeat;transition:background-size .35s ease;text-decoration:none}a:hover{background-size:100% 2px}`, none: '' }[m.hover],
    m.shine ? `[data-dx=btn]{position:relative;overflow:hidden}[data-dx=btn]::after{content:"";position:absolute;inset:0;width:40%;background:linear-gradient(90deg,transparent,${alpha('#ffffff', 0.45)},transparent);transform:translateX(-120%) skewX(-20deg);pointer-events:none}[data-dx=btn]:hover::after{animation:dx-shine .8s ease}` : '',
    m.tilt ? `[data-dx=card]{transform:perspective(900px) rotateX(var(--dx-rx,0deg)) rotateY(var(--dx-ry,0deg));transition:transform .2s ease-out,box-shadow .3s ease;will-change:transform}` : '',
    m.ambient === 'float' ? `[data-dx=card]{animation:dx-bob 6s ease-in-out infinite}[data-dx=card]:nth-child(2n){animation-delay:-2s}[data-dx=card]:nth-child(3n){animation-delay:-4s}` : '',
    m.ambient === 'breathe' ? `[data-dx=hero],h1{animation:dx-breathe 7s ease-in-out infinite}` : '',
    m.parallax ? `img{translate:0 var(--dx-py,0px)}` : '',
    m.progress ? `#dx-progress{position:fixed;top:0;left:0;height:3px;width:100%;transform-origin:0 50%;transform:scaleX(var(--dx-p,0));background:linear-gradient(90deg,${t.accent},${t.accent2});z-index:2147483000;pointer-events:none}` : '',
    m.shrink ? `[data-dx=nav].dx-shrunk{box-shadow:0 8px 30px ${alpha('#000000', 0.25)}!important;transition:padding .3s ease,box-shadow .3s ease}` : '',
    m.spot ? `#dx-spot{position:fixed;inset:0;pointer-events:none;z-index:2147482000;background:radial-gradient(420px circle at var(--dx-mx,50%) var(--dx-my,30%),${alpha(t.accent, 0.16)},transparent 60%);transition:opacity .4s}` : '',
    m.split ? '.dx-w{display:inline-block;opacity:0;animation:dx-word .7s cubic-bezier(.2,.7,.2,1) forwards;animation-delay:calc(var(--i)*55ms)}' : '',
    m.curtain ? `#dx-curtain{position:fixed;inset:0;background:linear-gradient(135deg,${t.accent},${t.accent2});z-index:2147483600;animation:dx-curtain .9s cubic-bezier(.7,0,.2,1) .25s forwards;pointer-events:none}` : '',
  ];
  return `${parts.filter(Boolean).join('\n')}\n@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}[data-dx-r]:not(.dx-in){opacity:1!important;translate:none!important;scale:none!important;filter:none!important;clip-path:none!important}#dx-curtain,#dx-spot,#dx-progress{display:none!important}.dx-w{opacity:1!important}}`;
}

/** The behaviour half of motion. Written as a real function so it is testable; sent to pages as source text. */
function dxMotionRuntime(cfg) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var d = document, root = d.documentElement; root.setAttribute('data-dx-m', cfg.id);
  if (window.__dxM && window.__dxM.stop) window.__dxM.stop();
  var cleanup = [], seen = new WeakSet(), io = null, raf = 0;
  function on(t, ev, fn, o) { t.addEventListener(ev, fn, o || { passive: true }); cleanup.push(function () { t.removeEventListener(ev, fn); }); }
  function mk(id) { var e = d.getElementById(id); if (!e) { e = d.createElement('div'); e.id = id; d.body.appendChild(e); } return e; }
  if (cfg.reveal !== 'none' && 'IntersectionObserver' in window) {
    io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('dx-in'); io.unobserve(e.target); } }); }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    var scan = function () {
      var sel = '[data-dx=card],h1,h2,h3,img,[data-dx=media],[data-dx=sec]>*,.hero>*', nodes = d.querySelectorAll(sel), groups = new Map();
      for (var i = 0; i < nodes.length && i < 800; i++) { var el = nodes[i]; if (seen.has(el) || el.closest('#dx-curtain')) continue; seen.add(el); el.setAttribute('data-dx-r', ''); var p = el.parentElement, n = groups.get(p) || 0; groups.set(p, n + 1); if (cfg.stagger) el.style.setProperty('--dx-d', Math.min(n, 8) * 80 + 'ms'); if (cfg.reveal === 'slide') el.style.setProperty('--dx-sx', (n % 2 ? 40 : -40) + 'px'); io.observe(el); }
    };
    scan(); var mo = new MutationObserver(function () { clearTimeout(scan.t); scan.t = setTimeout(scan, 200); }); mo.observe(d.body, { childList: true, subtree: true }); cleanup.push(function () { mo.disconnect(); io.disconnect(); });
    setTimeout(function () { d.querySelectorAll('[data-dx-r]:not(.dx-in)').forEach(function (e) { var r = e.getBoundingClientRect(); if (r.top < innerHeight * 1.1) e.classList.add('dx-in'); }); }, 1800);
    setTimeout(function () { d.querySelectorAll('[data-dx-r]:not(.dx-in)').forEach(function (e) { e.classList.add('dx-in'); }); }, 6000);
  }
  if (cfg.tilt) {
    on(d, 'mousemove', function (ev) { var c = ev.target.closest && ev.target.closest('[data-dx=card]'); if (!c) return; var r = c.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5; c.style.setProperty('--dx-ry', (x * 10).toFixed(2) + 'deg'); c.style.setProperty('--dx-rx', (-y * 10).toFixed(2) + 'deg'); });
    on(d, 'mouseout', function (ev) { var c = ev.target.closest && ev.target.closest('[data-dx=card]'); if (c) { c.style.setProperty('--dx-rx', '0deg'); c.style.setProperty('--dx-ry', '0deg'); } });
  }
  if (cfg.magnet) {
    on(d, 'mousemove', function (ev) { var b = ev.target.closest && ev.target.closest('[data-dx=btn]'); if (!b) return; var r = b.getBoundingClientRect(); b.style.translate = ((ev.clientX - r.left - r.width / 2) * 0.22).toFixed(1) + 'px ' + ((ev.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + 'px'; });
    on(d, 'mouseout', function (ev) { var b = ev.target.closest && ev.target.closest('[data-dx=btn]'); if (b) b.style.translate = ''; });
  }
  if (cfg.spot) { mk('dx-spot'); on(d, 'mousemove', function (ev) { root.style.setProperty('--dx-mx', ev.clientX + 'px'); root.style.setProperty('--dx-my', ev.clientY + 'px'); }); }
  if (cfg.progress) mk('dx-progress');
  if (cfg.curtain) { var cu = mk('dx-curtain'); setTimeout(function () { if (cu.parentNode) cu.remove(); }, 1600); }
  if (cfg.split) {
    var h1 = d.querySelector('h1');
    if (h1 && !h1.getAttribute('data-dx-split') && h1.children.length === 0 && h1.textContent.trim().length < 140) { h1.setAttribute('data-dx-split', '1'); var words = h1.textContent.trim().split(/\s+/); h1.textContent = ''; words.forEach(function (w, i) { var s = d.createElement('span'); s.className = 'dx-w'; s.style.setProperty('--i', i); s.textContent = w; h1.appendChild(s); if (i < words.length - 1) h1.appendChild(d.createTextNode(' ')); }); }
  }
  if (cfg.parallax || cfg.progress || cfg.shrink) {
    var tick = function () { raf = 0; var y = window.scrollY || root.scrollTop, max = Math.max(1, root.scrollHeight - innerHeight);
      if (cfg.progress) root.style.setProperty('--dx-p', Math.min(1, y / max).toFixed(4));
      if (cfg.shrink) d.querySelectorAll('[data-dx=nav]').forEach(function (n) { n.classList.toggle('dx-shrunk', y > 40); });
      if (cfg.parallax) d.querySelectorAll('img').forEach(function (im) { var r = im.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; im.style.setProperty('--dx-py', (((r.top + r.height / 2) - innerHeight / 2) * -0.06).toFixed(1) + 'px'); }); };
    on(window, 'scroll', function () { if (!raf) raf = requestAnimationFrame(tick); }); on(window, 'resize', tick); tick();
  }
  window.__dxM = { stop: function () { cleanup.forEach(function (f) { f(); }); cleanup = []; } };
}
export const motionJs = (m) => `(${dxMotionRuntime.toString()})(${JSON.stringify(m)});`;

/* ------------------------------ compose ------------------------------ */
const byId = (arr) => (id) => arr.find((x) => x.id === id) || null;
export const paletteById = byId(PALETTES), structureById = byId(STRUCTURES), backdropById = byId(BACKDROPS), imageryById = byId(IMAGERY), motionById = byId(MOTIONS), typeById = byId(TYPES);

/** One id for one combination, so any look can be saved, sent to the server and rebuilt there. */
export const dnaId = (d) => `dna:${d.structure}.${d.backdrop}.${d.imagery}.${d.motion}.${d.type}.${d.palette}`;
export function parseDna(id) {
  const m = /^dna:([a-z0-9-]+)\.([a-z0-9-]+)\.([a-z0-9-]+)\.([a-z0-9-]+)\.([a-z0-9-]+)\.([a-z0-9-]+)$/.exec(String(id || '')); if (!m) return null;
  const d = { structure: m[1], backdrop: m[2], imagery: m[3], motion: m[4], type: m[5], palette: m[6] };
  return structureById(d.structure) && backdropById(d.backdrop) && imageryById(d.imagery) && motionById(d.motion) && typeById(d.type) && paletteById(d.palette) ? d : null;
}

/** Everything a page needs for one look: a stylesheet, a script, and the pieces that made them. */
export function compose(d) {
  const pal = paletteById(d.palette), st = structureById(d.structure), bd = backdropById(d.backdrop), im = imageryById(d.imagery), mo = motionById(d.motion), ty = typeById(d.type);
  if (!pal || !st || !bd || !im || !mo || !ty) throw new Error('That look is not valid.');
  const t = { ...pal, hf: ty.hf, bf: ty.bf };
  const f = st.f(t); const r = f.r ?? 12, cr = f.cr ?? r, br = f.br ?? r;
  /* the kit underneath supplies colour roles, the Tailwind remap, forms, tables, focus rings; the structure then redraws every component */
  const base = finishKit({ id: dnaId(d), name: '', family: st.family, mode: pal.mode, bg: pal.bg, surface: pal.surface, text: pal.text, muted: pal.muted, accent: pal.accent, border: pal.border, on: pal.on, font: ty.bf, head: ty.hf, radius: r, hw: ty.hw, hls: ty.hls, upper: 0 });
  base.accent = pal.accent; base.on = pal.on;
  /* Colour is the harmonizer's job (it recolours every element in context). The stylesheet below owns only shape, depth, type,
     backdrop, pictures and motion, so a page can never end up half in one palette and half in another. */
  const css = [
    fontImport(ty.bf, ty.hf),
    `html[data-dx-font] :where(body,p,li,a,span,div,button,input,select,textarea,label,td,th,small,b,strong,em,summary,dt,dd):not([class*=icon i]):not([class*=material i]):not([class*=glyph i]):not([class~=fa]):not([class~=fas]):not([class~=far]):not([class~=fab]):not([class*=" fa-"]):not([class^=fa-]):not(code):not(pre):not(kbd){font-family:${ty.bf}!important}`,
    `html[data-dx-font] :where(h1,h2,h3,h4,h5,h6){font-family:${ty.hf}!important;font-weight:${ty.hw}!important;letter-spacing:${ty.hls}!important;${imp(f.h || '')}}`,
    `::selection{background:${pal.accent};color:${pal.on}}`,
    `:where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:2px solid ${pal.accent};outline-offset:2px}`,
    `html{scrollbar-color:${pal.border} transparent}`,
    f.a ? `a{${imp(f.a)}}` : '',
    `[data-dx=nav]{${imp(f.nav)}}`,
    /color:/.test(f.nav) ? `[data-dx=nav] :where(a,span,b,strong,div,p,li,svg,svg *):not([data-dx=btn]):not([data-dx=btn] *):not([data-dx=btn2]){color:inherit!important}` : '',
    `[data-dx=card]{border-radius:${cr}px!important;${imp(f.card)}}`,
    f.cardHover ? `[data-dx=card]:hover{${imp(f.cardHover)}}` : '',
    `[data-dx=btn]{border-radius:${br}px!important;${imp(f.btn)}}`,
    f.btnHover ? `[data-dx=btn]:hover{${imp(f.btnHover)}}` : '',
    `[data-dx=btn2]{border-radius:${br}px!important;${imp(f.btn2)}}`,
    `[data-dx=btnx]{border-radius:${br}px!important}`,
    `input,select,textarea,[data-dx=input]{border-radius:${Math.min(r, 18)}px!important;${imp(f.input)}}`,
    `[data-dx=badge]{${imp(f.badge)}}`,
    `footer,[data-dx=foot]{${imp(f.foot)}}`,
    /color:/.test(f.foot) ? `[data-dx=foot] :where(a,span,b,strong,div,p,li,small):not([data-dx=btn]):not([data-dx=btn] *){color:inherit!important}` : '',
    /color:/.test(f.badge) ? `[data-dx=badge] *{color:inherit!important}` : '',
    `[data-dx=btn] *,[data-dx=btn2] *{color:inherit!important}`,
    `[data-dx=icon] [fill]:not([fill=none]):not([fill=currentColor]),[data-dx=icon][fill]:not([fill=none]):not([fill=currentColor]){fill:${pal.accent}!important}[data-dx=icon] [stroke]:not([stroke=none]):not([stroke=currentColor]),[data-dx=icon][stroke]:not([stroke=none]):not([stroke=currentColor]){stroke:${pal.accent}!important}`,
    f.extra || '',
    `[data-dx=hero]{position:relative;isolation:isolate;background-color:${mixHex(pal.accent, '#000000', 0.5)}!important;background-blend-mode:multiply!important;background-size:cover!important;background-position:center!important}`,
    `[data-dx=hero]::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:linear-gradient(135deg,${alpha(mixHex(pal.accent, '#000000', 0.55), 0.78)},${alpha(mixHex(pal.accent2, '#000000', 0.62), 0.7)})}`,
    `[data-dx=hero]>*:not([class*="absolute"]):not([class*="fixed"]):not(img):not(video):not(picture){position:relative;z-index:1}`,
    `[data-dx=hero] :where(h1,h2,h3,h4,p,span,li,div,small,label,a):not([data-dx=btn]):not([data-dx=btn] *):not([data-dx=btn2]):not([data-dx=card] *){color:#ffffff!important}`,
    `[data-dx=hero] [data-dx=btn2]{color:#ffffff!important;border-color:#ffffff!important;background:transparent!important}`,
    bd.f(t),
    im.f(t),
    motionCss(mo, t),
    `@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}}`,
  ].filter(Boolean).join('\n');
  const famName = (st2) => (/^'([^']+)'/.exec(st2) || [])[1];
  const hz = { fonts: [famName(ty.bf), famName(ty.hf)].filter(Boolean), mode: pal.mode, bg: pal.bg, surface: pal.surface, text: pal.text, muted: pal.muted, accent: pal.accent, accent2: pal.accent2, border: pal.border, s2: mixHex(pal.surface, pal.text, 0.06), on: pal.on };
  return { css, js: motionJs(mo), roles: kitRolesJs(base) + '\n' + harmonizeJs(hz), kit: base, parts: { palette: pal, structure: st, backdrop: bd, imagery: im, motion: mo, type: ty } };
}

/* ------------------------------ business fit ------------------------------ */
/* A bakery, a bank and a game studio should not get the same components. Every piece of every axis is tagged with the kinds of
   business it suits, a preset is built for ONE kind, and the studio starts from the kind it reads off the app. */
export const CATS = [
  ['saas', 'Software & SaaS', 'software saas platform app cloud api startup automation analytics subscription workspace crm'],
  ['dev', 'Developer tools', 'developer devops code git github docs sdk cli terminal open source infrastructure monitoring deploy'],
  ['admin', 'Dashboards & admin', 'dashboard admin panel backoffice internal erp inventory hrms hr payroll management reports tracker control'],
  ['ecom', 'Shop & e-commerce', 'shop store ecommerce cart product checkout retail marketplace order catalog boutique jewelry jewellery'],
  ['food', 'Restaurant & food', 'restaurant cafe coffee bakery menu food kitchen chef catering pizza burger bar recipe drive-thru delivery'],
  ['fin', 'Finance & banking', 'bank banking finance fintech payments invoice accounting insurance loan invest trading wallet crypto tax'],
  ['health', 'Health & wellness', 'health clinic hospital doctor medical dental pharmacy fitness yoga wellness therapy care gym spa'],
  ['edu', 'Education', 'school course learn learning education university academy student teacher tutor training lesson exam quiz'],
  ['creative', 'Portfolio & agency', 'portfolio agency studio design designer photography creative branding freelance showcase gallery'],
  ['luxury', 'Fashion & luxury', 'fashion luxury couture jewellery watch perfume beauty salon atelier premium boutique wedding'],
  ['kids', 'Kids & playful', 'kids children toy toys play game family baby fun cartoon parent school-kids'],
  ['media', 'News, blog & editorial', 'news blog magazine journal press article podcast publication newsletter story editorial'],
  ['game', 'Gaming & entertainment', 'game gaming esports music movie film stream entertainment event concert club nightlife anime'],
  ['community', 'Non-profit & community', 'nonprofit charity community church ngo donate volunteer foundation club association society neighbourhood'],
  ['travel', 'Travel & real estate', 'travel hotel resort tour booking flight trip property real estate rental villa holiday airline'],
].map(([id, label, kw]) => ({ id, label, kw: kw.split(' ') }));
const ALL = CATS.map((c) => c.id);
const fit = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '*' ? ALL : v.split(' ')]));
const STRUCT_FIT = fit({ flat: 'saas admin fin health edu travel community', lifted: 'saas ecom health edu travel food community', swiss: 'creative media fin saas', neobrutal: 'creative game kids ecom', glass: 'saas dev game creative fin', soft: 'health food community edu kids', luxe: 'luxury food travel creative', pill: 'kids ecom food community edu', editorial: 'media luxury creative edu', terminal: 'dev game', neon: 'game dev creative', ticket: 'food travel community ecom', layered: 'media edu food community', sticker: 'kids ecom game creative', gradborder: 'saas dev fin creative', underline: 'luxury media creative fin travel', bento: 'saas ecom creative travel health', retroos: 'game dev creative', blueprint: 'dev admin saas', comic: 'kids game creative', material: 'admin saas edu health community fin', liquid: 'saas luxury creative game travel', emboss: 'fin admin health edu community', mono: 'creative media dev fin admin luxury' });
const BACK_FIT = fit({ plain: '*', mesh: 'saas creative fin travel health edu', aurora: 'saas dev game creative luxury', grid: 'dev admin saas fin edu', dots: 'admin edu community saas media', grain: 'media luxury food creative travel', stripes: 'ecom kids community game', spotlight: 'saas creative luxury game dev', horizon: 'game dev creative', stars: 'game dev creative', blueprint: 'dev admin', paper: 'media food edu community luxury', waves: 'health travel food community kids edu', conic: 'saas creative travel ecom', bokeh: 'luxury food creative travel game', scan: 'game dev', shift: 'saas creative ecom game kids', memphis: 'kids creative ecom edu', topo: 'travel community health edu', checker: 'kids ecom game community' });
const IMG_FIT = fit({ natural: '*', duo: 'creative media saas fin', 'mono-hover': 'creative media luxury fin', vivid: 'food travel ecom kids community', cinema: 'luxury creative game travel media', polaroid: 'community travel food kids creative', offset: 'creative media edu ecom', arch: 'luxury health food travel', circle: 'community edu health kids', blob: 'kids health creative community', glow: 'saas dev game fin', kenburns: 'travel luxury food creative health', zoom: 'ecom food travel media saas', retro: 'food community media creative game' });
const MOTION_FIT = fit({ still: 'admin fin health edu dev community', gentle: 'fin health edu admin saas community', stagger: 'saas ecom food travel edu', pop: 'kids ecom food game community', blur: 'luxury saas creative health travel', slide: 'media edu ecom community', wipe: 'creative media luxury game', tilt: 'ecom saas game creative dev', magnet: 'creative saas luxury ecom', parallax: 'travel luxury creative media food', aurora: 'saas dev game creative', float: 'kids health food community ecom', kinetic: 'creative game media ecom', curtain: 'luxury creative media game', depth: 'creative game luxury saas', cinema: 'luxury travel media creative food' });
const TYPE_FIT = fit({ inter: 'saas admin fin health edu dev', geo: 'saas ecom health edu', grot: 'saas creative dev ecom', jakarta: 'saas health edu community ecom', manrope: 'saas fin health travel luxury', bricolage: 'creative ecom community food', archivo: 'creative media fin ecom', anton: 'game creative ecom media', oswald: 'media game ecom community', barlowc: 'game ecom community media', playfair: 'luxury media food travel edu', fraunces: 'food health community edu media', dmserif: 'food luxury media travel', cormorant: 'luxury food travel', spectral: 'media edu luxury', baskerville: 'media edu fin luxury', abril: 'food luxury creative media', mono: 'dev admin game', plexmono: 'dev admin fin game', chakra: 'game dev creative', orbitron: 'game dev', righteous: 'kids game food community', quick: 'kids health edu community food', bungee: 'game kids ecom' });
const SCHEME_FIT = fit({ Midnight: 'saas dev game fin creative luxury', Ink: 'dev admin creative luxury media game', Dusk: 'luxury travel food game creative community', Daylight: 'saas admin fin health edu ecom travel community dev', Paper: 'media food luxury edu community travel creative', Sorbet: 'kids health food ecom edu community creative' });
const HUE_FIT = fit({ Ember: 'food ecom kids game community media', Cobalt: 'fin saas admin dev health edu travel', Moss: 'health food community travel edu', Plum: 'creative luxury kids game health', Lagoon: 'health travel saas edu fin', Saffron: 'food ecom kids community media', Rose: 'luxury creative kids health food', Slate: 'fin saas admin dev media', Coral: 'food ecom kids community creative', Violet: 'creative luxury game saas kids', Mint: 'health food community travel edu', Gold: 'luxury food ecom media fin' });
const hueName = (p) => HUES.find(([, h]) => h === p.hue)?.[0];
const palFit = (p) => { const sc = SCHEME_FIT[p.name.split(' ').slice(1).join(' ')] || ALL, hu = HUE_FIT[hueName(p)] || ALL; const x = sc.filter((c) => hu.includes(c)); return x.length ? x : sc; };
/** Which kinds of business a finished combination suits: those that at least four of its six pieces agree on. */
export function fitsOf(d) {
  const pal = paletteById(d.palette); const lists = [STRUCT_FIT[d.structure], BACK_FIT[d.backdrop], IMG_FIT[d.imagery], MOTION_FIT[d.motion], TYPE_FIT[d.type], pal ? palFit(pal) : ALL];
  return ALL.filter((c) => lists.filter((l) => l?.includes(c)).length >= 4);
}
/** Read the kind of business off the words an app uses about itself. */
export function classifyBusiness(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9+ -]/g, ' ').split(/\s+/).filter(Boolean); const bag = new Set(words); const hay = ` ${words.join(' ')} `;
  const scored = CATS.map((c) => { const hits = c.kw.filter((k) => (k.includes(' ') ? hay.includes(` ${k} `) : bag.has(k) || bag.has(`${k}s`))); return { id: c.id, label: c.label, score: hits.length, hits }; }).sort((a, b) => b.score - a.score);
  const top = scored[0]; return top.score ? { id: top.id, label: top.label, reason: `mentions ${top.hits.slice(0, 3).join(', ')}` } : { id: 'saas', label: CATS[0].label, reason: 'no clear business words, so a general software look is suggested', guess: true };
}

/* ------------------------------ the preset catalogue ------------------------------ */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const ADJ = ['Velvet', 'Neon', 'Quiet', 'Electric', 'Midnight', 'Golden', 'Paper', 'Crystal', 'Wild', 'Soft', 'Bold', 'Lunar', 'Solar', 'Rustic', 'Cosmic', 'Mellow', 'Hyper', 'Silent', 'Ember', 'Frosted', 'Vintage', 'Atomic', 'Royal', 'Urban', 'Tropic', 'Misty', 'Prime', 'Twilight', 'Crisp', 'Dreamy', 'Iron', 'Candy', 'Noble', 'Pixel', 'Marble', 'Coastal', 'Nordic', 'Desert', 'Polar', 'Amber'];
const NOUN = ['Atlas', 'Meridian', 'Harbor', 'Orbit', 'Studio', 'Gallery', 'Signal', 'Canvas', 'Pulse', 'Bloom', 'Forge', 'Horizon', 'Circuit', 'Lantern', 'Garden', 'Vertex', 'Journal', 'Arcade', 'Summit', 'Mosaic', 'Compass', 'Prism', 'Ledger', 'Voyage', 'Atelier', 'Beacon', 'Cascade', 'Echo', 'Fable', 'Grove', 'Haven', 'Ink', 'Jade', 'Kiln', 'Loom', 'Nimbus', 'Onyx', 'Parade', 'Quartz', 'Relay'];
const modeOk = (modes, mode) => modes === 'any' || modes === mode;
/** 1,200 coherent looks, 80 for each of 15 kinds of business. Each is built from pieces that suit that business AND each other. */
export const PRESETS = (() => {
  const rand = rng(20261023); const seen = new Set(); const out = [];
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const palsFor = Object.fromEntries(ALL.map((c) => [c, PALETTES.filter((p) => palFit(p).includes(c))]));
  let guard = 0;
  while (out.length < 1200 && guard++ < 60000) {
    const cat = ALL[out.length % ALL.length];
    const pal = pick(palsFor[cat].length ? palsFor[cat] : PALETTES);
    const cand = (arr, table, modes) => { const a = arr.filter((x) => (table[x.id] || ALL).includes(cat) && (!modes || modeOk(x.modes, pal.mode))); return a.length ? a : arr.filter((x) => !modes || modeOk(x.modes, pal.mode)); };
    const st = pick(cand(STRUCTURES, STRUCT_FIT, 1)), bd = pick(cand(BACKDROPS, BACK_FIT, 1));
    const d = { structure: st.id, backdrop: bd.id, imagery: pick(cand(IMAGERY, IMG_FIT)).id, motion: pick(cand(MOTIONS, MOTION_FIT)).id, type: pick(cand(TYPES, TYPE_FIT)).id, palette: pal.id };
    const id = dnaId(d); if (seen.has(id)) continue; seen.add(id);
    const n = out.length; const name = `${ADJ[n % ADJ.length]} ${NOUN[Math.floor(n / ADJ.length) % NOUN.length]}${n >= ADJ.length * NOUN.length ? ` ${Math.floor(n / (ADJ.length * NOUN.length)) + 1}` : ''}`;
    const fits = fitsOf(d); if (!fits.includes(cat)) fits.unshift(cat);
    out.push({ id, name, family: st.family, mode: pal.mode, cat, fits, dna: d, blurb: `${st.name} · ${bd.name} backdrop · ${imageryById(d.imagery).name} images · ${motionById(d.motion).name} · ${typeById(d.type).name}` });
  }
  return out;
})();
export const PRESET_FAMILIES = [...new Set(PRESETS.map((p) => p.family))];
export const presetById = (id) => PRESETS.find((p) => p.id === id) || null;
export const randomDna = (seed = Date.now()) => { const r = rng(seed); const pick = (a) => a[Math.floor(r() * a.length)]; const pal = pick(PALETTES); return { structure: pick(STRUCTURES.filter((s) => modeOk(s.modes, pal.mode))).id, backdrop: pick(BACKDROPS.filter((b) => modeOk(b.modes, pal.mode))).id, imagery: pick(IMAGERY).id, motion: pick(MOTIONS).id, type: pick(TYPES).id, palette: pal.id }; };

/** A small standalone page for a gallery tile: the look applied to a mock UI with a picture, a card, a button row and a form. */
export function dnaThumb(d, { animate = false } = {}) {
  const c = compose(d); const pic = svgUri(`<svg xmlns='http://www.w3.org/2000/svg' width='400' height='240'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c.parts.palette.accent}'/><stop offset='1' stop-color='${c.parts.palette.accent2}'/></linearGradient></defs><rect width='400' height='240' fill='url(#g)'/><circle cx='300' cy='70' r='46' fill='#fff' fill-opacity='.35'/><path d='M0 240 L120 110 L200 190 L280 120 L400 240Z' fill='#000' fill-opacity='.25'/></svg>`);
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0}body{padding:0 0 12px;min-height:100vh}main{padding:12px 14px;display:grid;gap:9px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.b{padding:7px 12px;font-size:11px;cursor:pointer;border:0}input{padding:6px 9px;width:100%;font-size:11px}.card{padding:10px}img{width:100%;height:64px;object-fit:cover;display:block}${c.css}</style>
<nav class="row" style="justify-content:space-between;padding:9px 14px"><b style="font-size:13px">Brand</b><span class="row" style="gap:10px;font-size:10.5px"><a href="#">Home</a><a href="#">Pricing</a></span></nav>
<main><h1 style="font-size:20px">${(presetById(dnaId(d))?.name || 'Your look').replace(/[<&]/g, '')}</h1><p style="font-size:11px" class="muted">One click redesigns the whole app.</p>
<div class="row"><button class="b">Get started</button><button class="b" style="background:transparent">Learn more</button><span style="font-size:10px;padding:2px 8px;border:1px solid">New</span></div>
<img alt="" src="${pic}"><div class="card"><b style="font-size:12px">Card title</b><p style="font-size:10.5px" class="muted">Supporting copy sits here.</p></div><input placeholder="you@example.com"></main>
${animate ? `<script>${c.roles}${c.js}</script>` : `<script>${c.roles}</script>`}`;
}

/** A full page in a look, with pictures and motion, for the preview window. */
export function dnaPreviewDoc(d, name = 'Your look') {
  const c = compose(d); const pal = c.parts.palette;
  const pic = (a, b, n) => svgUri(`<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='640' height='400' fill='url(#g)'/><circle cx='${120 + n * 90}' cy='110' r='${50 + n * 8}' fill='#fff' fill-opacity='.3'/><path d='M0 400 L180 190 L300 300 L430 170 L640 400Z' fill='#000' fill-opacity='.28'/></svg>`);
  const safe = String(name).replace(/[<&"]/g, '');
  const css = `*{box-sizing:border-box;margin:0}body{line-height:1.5}.wrap{max-width:1080px;margin:0 auto;padding:0 28px}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.b{display:inline-block;padding:10px 18px;cursor:pointer;font-size:14px;border:0;text-decoration:none}.hero{min-height:360px;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;background:url("${pic(pal.accent, pal.accent2, 1)}") center/cover}.hero h1{max-width:18ch;margin:0 auto 14px}.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.sec{padding:44px 0}.card{padding:16px}.card img{width:100%;height:150px;object-fit:cover;display:block;margin-bottom:12px}input,select,textarea{padding:10px 12px;width:100%;font-size:14px}table{width:100%;font-size:14px}th,td{padding:10px}footer{padding:28px 0;font-size:13px}`;
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>${css}${c.css}</style>
<header class="wrap row" style="justify-content:space-between;padding-top:14px;padding-bottom:14px"><b style="font-size:19px">Brand</b><nav class="row" style="gap:20px;font-size:14px"><a href="#">Product</a><a href="#">Pricing</a><a href="#">Docs</a><a class="b" href="#">Sign up</a></nav></header>
<section class="hero"><div class="wrap"><span style="font-size:12px;padding:3px 12px;border:1px solid #fff;border-radius:99px">New</span><h1 style="margin-top:12px">${safe}</h1><p style="margin-bottom:22px">A complete look: colour, type, shape, backdrop, pictures and motion, all changed together.</p><div class="row" style="justify-content:center"><a class="b" href="#">Get started</a><a class="b" href="#" style="background:transparent;border:1px solid #fff">See how it works</a></div></div></section>
<main class="wrap"><section class="sec"><h2 style="margin-bottom:18px">Everything restyled</h2><div class="grid"><div class="card"><img alt="" src="${pic(pal.accent, pal.accent2, 0)}"><b>Pictures</b><p class="muted">Frames, masks and treatments follow the look.</p></div><div class="card"><img alt="" src="${pic(pal.accent2, pal.accent, 1)}"><b>Components</b><p class="muted">Cards, buttons and forms are drawn new.</p></div><div class="card"><img alt="" src="${pic(pal.accent, pal.text, 2)}"><b>Motion</b><p class="muted">Reveals, hovers and ambient movement.</p></div></div></section>
<section class="sec"><h2 style="margin-bottom:18px">Pricing</h2><div class="grid"><div class="card"><b>Starter</b><p class="muted">For side projects</p><h3 style="margin:8px 0">$0</h3><a class="b" href="#">Choose</a></div><div class="card"><b>Pro <span style="font-size:11px;padding:2px 9px;border:1px solid">Popular</span></b><p class="muted">For growing teams</p><h3 style="margin:8px 0">$24</h3><a class="b" href="#">Choose</a></div></div></section>
<section class="sec"><h2 style="margin-bottom:18px">Forms and tables</h2><div class="grid"><div class="card" style="display:grid;gap:10px"><input placeholder="Full name"><input placeholder="Email address"><select><option>Choose a plan</option></select><textarea rows="3" placeholder="Message"></textarea><button class="b">Send</button></div><div class="card"><table><thead><tr><th>Order</th><th>Status</th><th>Total</th></tr></thead><tbody><tr><td>#1042</td><td>Paid</td><td>$120</td></tr><tr><td>#1043</td><td>Pending</td><td>$64</td></tr><tr><td>#1044</td><td>Shipped</td><td>$310</td></tr></tbody></table></div></div></section></main>
<footer><div class="wrap row" style="justify-content:space-between"><span>© Brand</span><span class="row" style="gap:16px"><a href="#">Privacy</a><a href="#">Terms</a></span></div></footer>
<script>${c.roles}${c.js}</script>`;
}
/** The look in words, for the AI rebuild and for captions. */
export function dnaDescribe(d) {
  const c = compose(d); const P = c.parts;
  return `Component anatomy "${P.structure.name}" (${P.structure.family}); page backdrop "${P.backdrop.name}"; images "${P.imagery.name}"; motion "${P.motion.name}" (scroll reveals ${P.motion.reveal}${P.motion.tilt ? ', 3D tilt on cards' : ''}${P.motion.magnet ? ', magnetic buttons' : ''}${P.motion.parallax ? ', parallax images' : ''}${P.motion.split ? ', split-word headline' : ''}${P.motion.curtain ? ', page-load curtain' : ''}${P.motion.spot ? ', cursor spotlight' : ''}, hover "${P.motion.hover}"); typography "${P.type.name}" (headings ${P.type.hf}, body ${P.type.bf}); palette "${P.palette.name}".`;
}
