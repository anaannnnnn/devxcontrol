// Component library: every common part of a site (navigation, hero, table, button, card, form, footer, pricing, tabs, list, alert,
// badge) as a family of designs built from independent choices (layout x surface x density x links x radius x palette x hue ...).
// One kind has thousands to millions of distinct designs. Designs are made from the CONTENT already on the page, so a navigation
// keeps its own links, a table keeps its own rows. Output is plain HTML plus scoped CSS that works in any project.
// This file has no dependencies, so the browser (live gallery) and the tests use the same code.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const safeHref = (h) => (/^(https?:|mailto:|tel:|\/|#|\.\.?\/)/i.test(String(h || '')) ? String(h) : '#');
const hash = (o) => { let h = 2166136261; for (const c of JSON.stringify(o)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const DEFAULT_ITEMS = [{ t: 'Home', h: '/' }, { t: 'About', h: '/about' }, { t: 'Services', h: '/services' }, { t: 'Contact', h: '/contact' }];

export const PALETTES = ['theme', 'accent', 'dark', 'light', 'tinted'];
function pal(p, hue) {
  const h = (hue % 24) * 15;
  if (p === 'accent') return { bg: 'var(--dx-accent,#2563eb)', fg: 'var(--dx-on-accent,#fff)', mut: 'color-mix(in srgb,var(--dx-on-accent,#fff) 75%,transparent)', line: 'color-mix(in srgb,var(--dx-on-accent,#fff) 30%,transparent)', acc: 'var(--dx-on-accent,#fff)', on: 'var(--dx-accent,#2563eb)', soft: 'color-mix(in srgb,var(--dx-on-accent,#fff) 16%,transparent)' };
  if (p === 'dark') return { bg: `hsl(${h} 25% 10%)`, fg: `hsl(${h} 20% 96%)`, mut: `hsl(${h} 12% 70%)`, line: `hsl(${h} 20% 22%)`, acc: `hsl(${h} 90% 66%)`, on: `hsl(${h} 40% 8%)`, soft: `hsl(${h} 30% 18%)` };
  if (p === 'light') return { bg: `hsl(${h} 30% 99%)`, fg: `hsl(${h} 30% 12%)`, mut: `hsl(${h} 10% 40%)`, line: `hsl(${h} 20% 90%)`, acc: `hsl(${h} 80% 45%)`, on: '#fff', soft: `hsl(${h} 60% 95%)` };
  if (p === 'tinted') return { bg: `hsl(${h} 70% 96%)`, fg: `hsl(${h} 40% 15%)`, mut: `hsl(${h} 20% 38%)`, line: `hsl(${h} 50% 85%)`, acc: `hsl(${h} 75% 42%)`, on: '#fff', soft: `hsl(${h} 70% 90%)` };
  return { bg: 'var(--dx-surface,#fff)', fg: 'var(--dx-text,#111827)', mut: 'var(--dx-muted,#6b7280)', line: 'var(--dx-border,#e5e7eb)', acc: 'var(--dx-accent,#2563eb)', on: 'var(--dx-on-accent,#fff)', soft: 'color-mix(in srgb,var(--dx-accent,#2563eb) 14%,var(--dx-surface,#fff))' };
}
const RADII = [0, 6, 14, 28];
const DENS = { pad: ['6px 10px', '10px 16px', '16px 24px'], gap: ['8px', '16px', '28px'], fs: ['14px', '16px', '18px'] };
const SHADOW = ['none', '0 1px 2px rgba(0,0,0,.08)', '0 8px 24px rgba(0,0,0,.14)', '0 18px 50px rgba(0,0,0,.28)'];

// Two orthogonal axes applied to EVERY kind in render(): typography pairing and an entrance animation.
// They multiply every kind's design space by 8 x 7 = 56 and add real, useful design controls, without
// any renderer needing to know about them. Keys are stored in params; the stacks/CSS are resolved centrally.
export const FONTS = ['default', 'inter', 'sora', 'serif', 'playfair', 'mono', 'poppins', 'dmsans'];
const FONT_STACKS = {
  default: '', inter: "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
  sora: "'Sora',system-ui,sans-serif", serif: "Georgia,'Times New Roman',Cambria,serif",
  playfair: "'Playfair Display',Georgia,serif", mono: "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace",
  poppins: "'Poppins',system-ui,sans-serif", dmsans: "'DM Sans',system-ui,sans-serif",
};
export const ANIMS = ['none', 'fade', 'rise', 'zoom', 'slide-left', 'slide-right', 'pop'];
const ANIM_FRAMES = {
  fade: 'from{opacity:0}to{opacity:1}', rise: 'from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}',
  zoom: 'from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}',
  'slide-left': 'from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:none}',
  'slide-right': 'from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}',
  pop: '0%{opacity:0;transform:scale(.9)}60%{transform:scale(1.02)}100%{opacity:1;transform:none}',
};
const ANIM_DUR = { fade: '.5s ease', rise: '.55s cubic-bezier(.22,1,.36,1)', zoom: '.5s ease', 'slide-left': '.55s cubic-bezier(.22,1,.36,1)', 'slide-right': '.55s cubic-bezier(.22,1,.36,1)', pop: '.5s ease' };
function extrasCss(k, p) {
  let css = '';
  const stack = FONT_STACKS[p.font];
  if (stack) css += `.${k}{--dx-font:${stack};font-family:${stack}}`;
  if (p.anim && p.anim !== 'none' && ANIM_FRAMES[p.anim]) {
    css += `@media(prefers-reduced-motion:no-preference){@keyframes ${k}-in{${ANIM_FRAMES[p.anim]}}.${k}{animation:${k}-in ${ANIM_DUR[p.anim]} both}}`;
  }
  return css;
}

/** Axis lists. A design is one choice per axis. */
export const KINDS = {
  nav: { label: 'Navigation', axes: { layout: ['left', 'center', 'split', 'stack', 'pill', 'sidebar', 'tabs-bar', 'brand-center'], surface: ['solid', 'glass', 'bordered', 'flat', 'gradient', 'shadow', 'contrast'], density: [0, 1, 2], links: ['plain', 'underline', 'pill', 'bar', 'dot', 'caps'], cta: ['none', 'solid', 'outline'], sticky: [0, 1], radius: [0, 1, 2, 3], palette: PALETTES, hue: 24, font: FONTS, anim: ANIMS } },
  hero: { label: 'Hero / banner', axes: { layout: ['center', 'left', 'split', 'banner', 'card', 'minimal', 'badge', 'stats'], bg: ['solid', 'gradient', 'radial', 'dots', 'grid', 'glow', 'stripes'], density: [0, 1, 2], size: [0, 1, 2], cta: ['one', 'two', 'link'], radius: [0, 1, 2, 3], palette: PALETTES, hue: 24, font: FONTS, anim: ANIMS } },
  button: { label: 'Button', axes: { variant: ['solid', 'outline', 'ghost', 'soft', 'gradient', 'pill', 'raised', 'glow', 'underline', 'brutal'], size: [0, 1, 2, 3, 4], radius: [0, 1, 2, 3], shadow: [0, 1, 2, 3], arrow: [0, 1], weight: [0, 1, 2], palette: PALETTES, hue: 24, font: FONTS, anim: ANIMS } },
  card: { label: 'Card', axes: { layout: ['stack', 'row', 'overlay', 'top-bar', 'icon', 'minimal', 'elevated', 'outlined'], density: [0, 1, 2], radius: [0, 1, 2, 3], shadow: [0, 1, 2, 3], hover: ['none', 'lift', 'glow', 'border'], palette: PALETTES, hue: 24, font: FONTS, anim: ANIMS } },
  table: { label: 'Table', axes: { style: ['plain', 'zebra', 'bordered', 'minimal', 'cards', 'dark-header', 'accent-header', 'glass'], density: [0, 1, 2], radius: [0, 1, 2, 3], hover: ['none', 'row', 'accent'], head: ['normal', 'upper'], align: ['left', 'center'], palette: PALETTES, hue: 24, font: FONTS, anim: ANIMS } },
  form: { label: 'Form', axes: { layout: ['stacked', 'two-col', 'inline', 'boxed', 'underline', 'filled', 'pill', 'glass'], density: [0, 1, 2], radius: [0, 1, 2, 3], button: ['solid', 'outline', 'full'], palette: PALETTES, hue: 24, font: FONTS, anim: ANIMS } },
  footer: { label: 'Footer', axes: { layout: ['simple', 'columns', 'centered', 'split', 'minimal', 'big-brand'], surface: ['solid', 'flat', 'bordered', 'dark', 'gradient'], density: [0, 1, 2], links: ['plain', 'underline', 'caps'], palette: PALETTES, hue: 24, font: FONTS, anim: ANIMS } },
  pricing: { label: 'Pricing', axes: { layout: ['row', 'cards', 'highlight', 'compact', 'list'], surface: ['solid', 'bordered', 'shadow', 'glass', 'gradient'], density: [0, 1, 2], radius: [0, 1, 2, 3], check: ['tick', 'dot', 'arrow'], palette: PALETTES, hue: 24, font: FONTS, anim: ANIMS } },
  tabs: { label: 'Tabs', axes: { style: ['underline', 'pill', 'boxed', 'segmented', 'dot', 'caps'], density: [0, 1, 2], radius: [0, 1, 2, 3], align: ['left', 'center', 'full'], palette: PALETTES, hue: 24, font: FONTS, anim: ANIMS } },
  list: { label: 'List', axes: { style: ['plain', 'divided', 'cards', 'bullets', 'numbered', 'check', 'timeline'], density: [0, 1, 2], radius: [0, 1, 2, 3], palette: PALETTES, hue: 24, font: FONTS, anim: ANIMS } },
  alert: { label: 'Alert / notice', axes: { style: ['soft', 'solid', 'outline', 'left-bar', 'banner', 'glass'], density: [0, 1, 2], radius: [0, 1, 2, 3], icon: [0, 1], palette: PALETTES, hue: 24, font: FONTS, anim: ANIMS } },
  badge: { label: 'Badge / tag', axes: { style: ['soft', 'solid', 'outline', 'dot', 'pill', 'caps'], size: [0, 1, 2], palette: PALETTES, hue: 24, font: FONTS, anim: ANIMS } },
};
const axisLen = (v) => (typeof v === 'number' ? v : v.length);
export const variantCount = (kind) => Object.values(KINDS[kind]?.axes || {}).reduce((n, v) => n * axisLen(v), 1);
export const kindFor = (k) => ({ header: 'nav', nav: 'nav', hero: 'hero', button: 'button', card: 'card', table: 'table', form: 'form', footer: 'footer', pricing: 'pricing', tabs: 'tabs', list: 'list', alert: 'alert', badge: 'badge' }[k] || null);

/** Deterministic pseudo-random params from a seed, so a gallery page is repeatable and "shuffle" is just a new seed. */
export function paramsFromSeed(kind, seed) {
  const ax = KINDS[kind].axes; let s = (Number(seed) >>> 0) || 1; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const out = {}; for (const [k, v] of Object.entries(ax)) { const n = axisLen(v); const i = Math.floor(rnd() * n); out[k] = typeof v === 'number' ? i : v[i]; } return out;
}
export function normalizeParams(kind, p = {}) {
  const ax = KINDS[kind].axes; const out = {};
  for (const [k, v] of Object.entries(ax)) { if (typeof v === 'number') out[k] = Math.max(0, Math.min(v - 1, Math.floor(Number(p[k]) || 0))); else if (v.length && typeof v[0] === 'number') { const n = Number(p[k]); out[k] = v.includes(n) ? n : v[0]; } else out[k] = v.includes(p[k]) ? p[k] : v[0]; }
  return out;
}

const link = (ls, c, cls = '') => `<a class="${cls}" href="${esc(safeHref(c.h))}">${esc(c.t)}</a>`;

/* --------------------------------- renderers --------------------------------- */
const R = {};

R.nav = (p, c, k) => {
  const col = pal(p.palette, p.hue), pad = DENS.pad[p.density], r = RADII[p.radius], fs = DENS.fs[p.density]; const side = p.layout === 'sidebar', stack = p.layout === 'stack';
  const items = (c.items?.length ? c.items : DEFAULT_ITEMS).slice(0, 8);
  if (p.palette === 'accent' && p.surface !== 'shadow' && p.surface !== 'contrast') p = { ...p, surface: 'solid' };
  const surf = { solid: `background:${col.bg}`, glass: `background:color-mix(in srgb,${col.bg} 62%,transparent);backdrop-filter:blur(14px)`, bordered: `background:${col.bg};border:1px solid ${col.line}`, flat: 'background:transparent', gradient: `background:linear-gradient(120deg,${col.bg},${col.soft})`, shadow: `background:${col.bg};box-shadow:${SHADOW[2]}`, contrast: `background:${col.fg};color:${col.bg}` }[p.surface];
  const fg = p.surface === 'contrast' ? col.bg : col.fg;
  const lk = { plain: '', underline: `.${k} li a{border-bottom:2px solid transparent}.${k} li a:hover,.${k} li a[aria-current]{border-bottom-color:${col.acc}}`, pill: `.${k} li a{border-radius:999px}.${k} li a:hover,.${k} li a[aria-current]{background:${col.soft};color:${col.fg}}`, bar: `.${k} li a{box-shadow:inset 0 -3px 0 transparent}.${k} li a:hover,.${k} li a[aria-current]{box-shadow:inset 0 -3px 0 ${col.acc}}`, dot: `.${k} li a{position:relative}.${k} li a:hover::before,.${k} li a[aria-current]::before{content:"";position:absolute;left:50%;bottom:2px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:${col.acc}}`, caps: `.${k} li a{text-transform:uppercase;letter-spacing:.09em;font-size:.82em;font-weight:600}.${k} li a:hover{color:${col.acc}}` }[p.links];
  const ctaCss = p.cta === 'solid' ? `background:${col.acc};color:${col.on}` : `border:1.5px solid ${col.acc};color:${col.acc}`;
  const dir = side ? 'flex-direction:column;align-items:stretch;width:240px;min-height:320px;' : stack ? 'flex-direction:column;align-items:center;' : '';
  const justify = { left: 'justify-content:flex-start;gap:28px', center: 'justify-content:center;gap:28px', split: 'justify-content:space-between', stack: 'justify-content:center', pill: 'justify-content:space-between', sidebar: 'justify-content:flex-start', 'tabs-bar': 'justify-content:flex-start;gap:24px', 'brand-center': 'justify-content:space-between' }[p.layout];
  const pillWrap = p.layout === 'pill' ? `margin:12px auto;max-width:94%;border-radius:999px;box-shadow:${SHADOW[2]};` : '';
  const css = `.${k}{display:flex;align-items:center;${dir}${justify};padding:${pad};font-size:${fs};font-family:var(--dx-font,inherit);${surf};color:${fg};border-radius:${p.layout === 'pill' ? 999 : r}px;${pillWrap}${p.sticky ? 'position:sticky;top:0;z-index:50;' : ''}box-sizing:border-box}
.${k} .brand{font-weight:800;font-size:1.15em;color:${fg};text-decoration:none;letter-spacing:-.01em}
.${k} ul{display:flex;${side || stack ? 'flex-direction:column;' : ''}gap:${p.density === 0 ? 4 : p.density === 1 ? 8 : 14}px;list-style:none;margin:0;padding:0;${p.layout === 'brand-center' ? 'order:-1;' : ''}${p.layout === 'center' && !stack ? '' : ''}}
.${k} li a{display:block;padding:${p.density === 0 ? '4px 8px' : p.density === 1 ? '8px 12px' : '10px 16px'};color:${p.surface === 'contrast' ? col.bg : col.mut};text-decoration:none;transition:color .15s,background .15s}
.${k} li a:hover{color:${fg}}${lk}
.${k} .cta{padding:${p.density === 0 ? '5px 12px' : '9px 18px'};border-radius:${p.layout === 'pill' ? 999 : Math.max(r, 6)}px;text-decoration:none;font-weight:600;${ctaCss}}
${p.layout === 'tabs-bar' ? `.${k}{border-bottom:1px solid ${col.line};border-radius:0}` : ''}${p.layout === 'brand-center' ? `.${k} .brand{position:absolute;left:50%;transform:translateX(-50%)}.${k}{position:relative}` : ''}
@media(max-width:640px){.${k}{flex-wrap:wrap;gap:8px}.${k} ul{flex-wrap:wrap}${p.layout === 'brand-center' ? `.${k} .brand{position:static;transform:none}` : ''}}`;
  const html = `<nav class="${k}" aria-label="Main"><a class="brand" href="${esc(safeHref(c.brandHref || '/'))}">${esc(c.brand || 'Brand')}</a><ul>${items.map((x, i) => `<li>${link(x, x, '')}</li>`.replace('<a class="" href', i === 0 ? '<a aria-current="page" href' : '<a href')).join('')}</ul>${p.cta === 'none' ? '' : `<a class="cta" href="${esc(safeHref(c.cta?.h || '/contact'))}">${esc(c.cta?.t || 'Get started')}</a>`}</nav>`;
  return { html, css };
};

R.hero = (p, c, k) => {
  const col = pal(p.palette, p.hue), r = RADII[p.radius]; const pad = ['40px 20px', '72px 28px', '110px 36px'][p.density]; const fs = ['clamp(1.8rem,4vw,2.6rem)', 'clamp(2.2rem,5.5vw,3.6rem)', 'clamp(2.8rem,7.5vw,5rem)'][p.size];
  const bg = { solid: `background:${col.bg}`, gradient: `background:linear-gradient(135deg,${col.bg},${col.soft} 60%,${col.bg})`, radial: `background:radial-gradient(circle at 30% 20%,${col.soft},${col.bg} 65%)`, dots: `background:${col.bg} radial-gradient(${col.line} 1.2px,transparent 1.3px) 0 0/22px 22px`, grid: `background:${col.bg} linear-gradient(${col.line} 1px,transparent 1px) 0 0/36px 36px,linear-gradient(90deg,${col.line} 1px,transparent 1px) 0 0/36px 36px`, glow: `background:radial-gradient(60% 50% at 50% 0%,color-mix(in srgb,${col.acc} 35%,transparent),transparent),${col.bg}`, stripes: `background:repeating-linear-gradient(135deg,${col.bg},${col.bg} 14px,color-mix(in srgb,${col.bg} 94%,${col.fg}) 14px,color-mix(in srgb,${col.bg} 94%,${col.fg}) 28px)` }[p.bg];
  const left = ['left', 'split', 'stats', 'badge'].includes(p.layout); const wrap = p.layout === 'card' ? `max-width:760px;margin:0 auto;background:${col.bg};border:1px solid ${col.line};border-radius:${Math.max(r, 12)}px;padding:48px 32px;box-shadow:${SHADOW[2]}` : '';
  const css = `.${k}{${bg};color:${col.fg};padding:${pad};border-radius:${r}px;font-family:var(--dx-font,inherit);box-sizing:border-box;text-align:${left ? 'left' : 'center'}}
.${k} .in{max-width:${p.layout === 'minimal' ? 640 : 1000}px;margin:0 auto;${p.layout === 'split' ? 'display:grid;grid-template-columns:1.2fr 1fr;gap:40px;align-items:center;' : ''}${wrap}}
.${k} h1{font-size:${fs};line-height:1.06;margin:0 0 .4em;letter-spacing:-.02em;color:${col.fg}${p.bg === 'gradient' && p.layout === 'banner' ? '' : ''}}
.${k} p.sub{font-size:1.15rem;line-height:1.55;color:${col.mut};max-width:36em;margin:0 ${left ? '0' : 'auto'} 1.4em}
.${k} .acts{display:flex;gap:12px;flex-wrap:wrap;justify-content:${left ? 'flex-start' : 'center'}}
.${k} .b1{background:${col.acc};color:${col.on};padding:13px 24px;border-radius:${Math.max(r, 8)}px;text-decoration:none;font-weight:700}
.${k} .b2{border:1.5px solid ${col.line};color:${col.fg};padding:12px 22px;border-radius:${Math.max(r, 8)}px;text-decoration:none;font-weight:600}
.${k} .tag{display:inline-block;margin-bottom:14px;padding:5px 12px;border-radius:999px;background:${col.soft};color:${col.acc};font-size:.82rem;font-weight:700}
.${k} .art{aspect-ratio:4/3;border-radius:${Math.max(r, 12)}px;background:linear-gradient(135deg,${col.acc},color-mix(in srgb,${col.acc} 30%,${col.bg}))}
.${k} .stats{display:flex;gap:28px;margin-top:28px;flex-wrap:wrap}.${k} .stats b{display:block;font-size:1.6rem;color:${col.fg}}.${k} .stats span{color:${col.mut};font-size:.85rem}
@media(max-width:700px){.${k} .in{grid-template-columns:1fr!important}}`;
  const acts = `<div class="acts"><a class="b1" href="${esc(safeHref(c.cta?.h))}">${esc(c.cta?.t || 'Get started')}</a>${p.cta === 'two' ? `<a class="b2" href="${esc(safeHref(c.cta2?.h))}">${esc(c.cta2?.t || 'Learn more')}</a>` : p.cta === 'link' ? `<a class="b2" style="border:0;text-decoration:underline" href="${esc(safeHref(c.cta2?.h))}">${esc(c.cta2?.t || 'Learn more')}</a>` : ''}</div>`;
  const text = `${p.layout === 'badge' ? `<span class="tag">${esc(c.tag || 'New')}</span>` : ''}<h1>${esc(c.title || 'A headline that says what you do')}</h1><p class="sub">${esc(c.sub || 'One calm sentence that explains who it is for and why it matters.')}</p>${acts}${p.layout === 'stats' ? '<div class="stats"><div><b>10k+</b><span>customers</span></div><div><b>99.9%</b><span>uptime</span></div><div><b>24/7</b><span>support</span></div></div>' : ''}`;
  return { html: `<section class="${k}"><div class="in">${p.layout === 'split' ? `<div>${text}</div><div class="art" role="img" aria-label=""></div>` : text}</div></section>`, css };
};

R.button = (p, c, k) => {
  const col = pal(p.palette, p.hue), r = p.variant === 'pill' ? 999 : RADII[p.radius]; const pad = ['4px 10px', '8px 16px', '11px 22px', '14px 30px', '18px 40px'][p.size]; const fs = ['12px', '14px', '16px', '18px', '20px'][p.size]; const fw = [500, 600, 800][p.weight];
  const v = { solid: `background:${col.acc};color:${col.on};border:1.5px solid ${col.acc}`, outline: `background:transparent;color:${col.acc};border:1.5px solid ${col.acc}`, ghost: `background:transparent;color:${col.acc};border:1.5px solid transparent`, soft: `background:${col.soft};color:${col.acc};border:1.5px solid transparent`, gradient: `background:linear-gradient(135deg,${col.acc},color-mix(in srgb,${col.acc} 45%,#ff5ac8));color:${col.on};border:0`, pill: `background:${col.acc};color:${col.on};border:0`, raised: `background:${col.acc};color:${col.on};border:0;box-shadow:0 4px 0 color-mix(in srgb,${col.acc} 55%,#000)`, glow: `background:${col.acc};color:${col.on};border:0;box-shadow:0 0 22px color-mix(in srgb,${col.acc} 70%,transparent)`, underline: `background:transparent;color:${col.acc};border:0;border-bottom:2px solid ${col.acc};border-radius:0`, brutal: `background:${col.acc};color:${col.on};border:2px solid #000;box-shadow:4px 4px 0 #000` }[p.variant];
  const css = `.${k}{display:inline-flex;align-items:center;gap:8px;padding:${pad};font-size:${fs};font-weight:${fw};font-family:var(--dx-font,inherit);border-radius:${p.variant === 'underline' ? 0 : r}px;cursor:pointer;text-decoration:none;line-height:1.2;transition:transform .12s,filter .12s,box-shadow .12s;${v};${p.shadow && p.variant !== 'raised' && p.variant !== 'brutal' ? `box-shadow:${SHADOW[p.shadow]}` : ''}}
.${k}:hover{filter:brightness(1.08);transform:translateY(-1px)}.${k}:active{transform:translateY(1px)}.${k}:focus-visible{outline:3px solid ${col.acc};outline-offset:3px}`;
  const tag = c.tag === 'a' ? 'a' : 'button'; const attrs = tag === 'a' ? ` href="${esc(safeHref(c.href))}"` : ' type="button"';
  return { html: `<${tag} class="${k}"${attrs}>${esc(c.label || 'Button')}${p.arrow ? '<span aria-hidden="true">→</span>' : ''}</${tag}>`, css };
};

R.card = (p, c, k) => {
  const col = pal(p.palette, p.hue), r = RADII[p.radius], pad = DENS.pad[p.density].split(' ')[1].replace('px', '') * 1 + 8; const sh = SHADOW[p.shadow];
  const hov = { none: '', lift: `.${k}:hover{transform:translateY(-4px);box-shadow:${SHADOW[2]}}`, glow: `.${k}:hover{box-shadow:0 0 0 2px ${col.acc},0 10px 30px color-mix(in srgb,${col.acc} 30%,transparent)}`, border: `.${k}:hover{border-color:${col.acc}}` }[p.hover];
  const lay = { stack: '', row: 'display:flex;gap:16px;align-items:flex-start;', overlay: `background:linear-gradient(160deg,${col.acc},color-mix(in srgb,${col.acc} 35%,#000));color:${col.on};`, 'top-bar': `border-top:4px solid ${col.acc};`, icon: 'display:grid;grid-template-columns:44px 1fr;gap:14px;', minimal: 'border:0;background:transparent;box-shadow:none;padding-left:0;padding-right:0;', elevated: `box-shadow:${SHADOW[2]};border:0;`, outlined: `border:2px solid ${col.acc};background:transparent;` }[p.layout];
  const css = `.${k}{background:${col.bg};color:${col.fg};border:1px solid ${col.line};border-radius:${r}px;padding:${pad}px;box-shadow:${sh};font-family:var(--dx-font,inherit);box-sizing:border-box;transition:transform .15s,box-shadow .15s,border-color .15s;${lay}}
.${k} h3{margin:0 0 .35em;font-size:1.15rem;color:inherit}.${k} p{margin:0 0 1em;color:${p.layout === 'overlay' ? 'inherit' : col.mut};line-height:1.55}.${k} a.more{color:${p.layout === 'overlay' ? col.on : col.acc};font-weight:600;text-decoration:none}
.${k} .ic{width:44px;height:44px;border-radius:${Math.max(r / 2, 8)}px;background:${col.soft};color:${col.acc};display:grid;place-items:center;font-weight:800}${hov}`;
  const inner = `<div><h3>${esc(c.title || 'Card title')}</h3><p>${esc(c.text || 'A short line that explains this card in plain words.')}</p>${c.cta === false ? '' : `<a class="more" href="${esc(safeHref(c.href))}">${esc(c.cta || 'Read more')} →</a>`}</div>`;
  return { html: `<article class="${k}">${p.layout === 'icon' ? '<div class="ic" aria-hidden="true">★</div>' : ''}${inner}</article>`, css };
};

R.table = (p, c, k) => {
  const col = pal(p.palette, p.hue), r = RADII[p.radius], pad = ['6px 10px', '10px 14px', '15px 20px'][p.density]; const heads = c.headers?.length ? c.headers : ['Name', 'Role', 'Status']; const rows = (c.rows?.length ? c.rows : [['Ada', 'Admin', 'Active'], ['Linus', 'Editor', 'Active'], ['Grace', 'Viewer', 'Invited']]).slice(0, 50);
  const st = { plain: `.${k} td{border-bottom:1px solid ${col.line}}`, zebra: `.${k} tbody tr:nth-child(even){background:${col.soft}}`, bordered: `.${k} td,.${k} th{border:1px solid ${col.line}}`, minimal: `.${k} th{border-bottom:2px solid ${col.fg}}`, cards: `.${k}{border-collapse:separate;border-spacing:0 8px}.${k} td{background:${col.bg}}.${k} td:first-child{border-radius:${r}px 0 0 ${r}px}.${k} td:last-child{border-radius:0 ${r}px ${r}px 0}`, 'dark-header': `.${k} thead th{background:${col.fg};color:${col.bg}}.${k} td{border-bottom:1px solid ${col.line}}`, 'accent-header': `.${k} thead th{background:${col.acc};color:${col.on}}.${k} td{border-bottom:1px solid ${col.line}}`, glass: `.${k}{background:color-mix(in srgb,${col.bg} 60%,transparent);backdrop-filter:blur(10px)}.${k} td{border-bottom:1px solid ${col.line}}` }[p.style];
  const hov = { none: '', row: `.${k} tbody tr:hover{background:${col.soft}}`, accent: `.${k} tbody tr:hover td{box-shadow:inset 0 -2px 0 ${col.acc}}` }[p.hover];
  const css = `.${k}{width:100%;border-collapse:collapse;background:${col.bg};color:${col.fg};font-family:var(--dx-font,inherit);font-size:${DENS.fs[Math.max(0, p.density)]};border-radius:${r}px;overflow:hidden;text-align:${p.align}}
.${k} th,.${k} td{padding:${pad};text-align:${p.align}}.${k} th{font-weight:700;${p.head === 'upper' ? 'text-transform:uppercase;letter-spacing:.07em;font-size:.78em;' : ''}color:${col.mut}}${st}${hov}
@media(max-width:640px){.${k}{display:block;overflow-x:auto}}`;
  return { html: `<table class="${k}"><thead><tr>${heads.map((x) => `<th scope="col">${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((rw) => `<tr>${heads.map((_, i) => `<td>${esc(rw[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`, css };
};

R.form = (p, c, k) => {
  const col = pal(p.palette, p.hue), r = RADII[p.radius], pad = DENS.pad[p.density]; const fields = c.fields?.length ? c.fields : [{ label: 'Name', type: 'text' }, { label: 'Email', type: 'email' }, { label: 'Message', type: 'textarea' }];
  const inp = { stacked: `border:1px solid ${col.line};background:${col.bg}`, 'two-col': `border:1px solid ${col.line};background:${col.bg}`, inline: `border:1px solid ${col.line};background:${col.bg}`, boxed: `border:2px solid ${col.fg};background:${col.bg}`, underline: `border:0;border-bottom:2px solid ${col.line};background:transparent;border-radius:0`, filled: `border:0;background:${col.soft}`, pill: `border:1px solid ${col.line};background:${col.bg};border-radius:999px`, glass: `border:1px solid ${col.line};background:color-mix(in srgb,${col.bg} 55%,transparent);backdrop-filter:blur(8px)` }[p.layout];
  const btn = { solid: `background:${col.acc};color:${col.on};border:0`, outline: `background:transparent;color:${col.acc};border:2px solid ${col.acc}`, full: `background:${col.acc};color:${col.on};border:0;width:100%` }[p.button];
  const css = `.${k}{display:grid;gap:${p.density === 0 ? 8 : p.density === 1 ? 14 : 20}px;${p.layout === 'two-col' ? 'grid-template-columns:1fr 1fr;' : p.layout === 'inline' ? 'grid-template-columns:repeat(auto-fit,minmax(160px,1fr));align-items:end;' : ''}max-width:${p.layout === 'inline' ? 900 : 560}px;font-family:var(--dx-font,inherit);color:${col.fg};${p.layout === 'glass' ? `padding:24px;border-radius:${Math.max(r, 12)}px;background:color-mix(in srgb,${col.soft} 50%,transparent);border:1px solid ${col.line}` : ''}}
.${k} label{display:grid;gap:6px;font-size:.88rem;font-weight:600;color:${col.mut}}.${k} .full{grid-column:1/-1}
.${k} input,.${k} textarea,.${k} select{font:inherit;color:${col.fg};padding:${pad};border-radius:${p.layout === 'pill' ? 999 : r}px;${inp};box-sizing:border-box;width:100%;min-height:44px}
.${k} input:focus,.${k} textarea:focus,.${k} select:focus{outline:2px solid ${col.acc};outline-offset:1px}.${k} textarea{min-height:110px;resize:vertical}
.${k} button{font:inherit;font-weight:700;padding:${pad};min-height:44px;border-radius:${p.layout === 'pill' ? 999 : r}px;cursor:pointer;${btn}}@media(max-width:600px){.${k}{grid-template-columns:1fr!important}}`;
  const fld = (f, i) => { const id = `${k}-f${i}`; const full = f.type === 'textarea' ? ' class="full"' : ''; const ctl = f.type === 'textarea' ? `<textarea id="${id}" name="${esc(f.name || f.label)}" placeholder="${esc(f.placeholder || '')}"></textarea>` : `<input id="${id}" name="${esc(f.name || f.label)}" type="${esc(/^(email|tel|number|date|password|url)$/.test(f.type) ? f.type : 'text')}" placeholder="${esc(f.placeholder || '')}">`; return `<label${full} for="${id}">${esc(f.label)}${ctl}</label>`; };
  return { html: `<form class="${k}" onsubmit="return false">${fields.slice(0, 10).map(fld).join('')}<div class="full"><button type="submit">${esc(c.submit || 'Send')}</button></div></form>`, css };
};

R.footer = (p, c, k) => {
  const col = pal(p.palette, p.hue), pad = ['20px 16px', '36px 24px', '60px 32px'][p.density]; const items = (c.items?.length ? c.items : DEFAULT_ITEMS).slice(0, 12);
  const surf = { solid: `background:${col.bg}`, flat: 'background:transparent', bordered: `background:${col.bg};border-top:1px solid ${col.line}`, dark: `background:${col.fg};color:${col.bg}`, gradient: `background:linear-gradient(180deg,${col.bg},${col.soft})` }[p.surface];
  const fg = p.surface === 'dark' ? col.bg : col.fg; const lk = { plain: '', underline: `.${k} a:hover{text-decoration:underline}`, caps: `.${k} a{text-transform:uppercase;letter-spacing:.08em;font-size:.8em}` }[p.links];
  const lay = { simple: 'display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap', columns: 'display:grid;grid-template-columns:2fr repeat(2,1fr);gap:28px', centered: 'text-align:center;display:grid;gap:14px;justify-items:center', split: 'display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap', minimal: 'display:flex;justify-content:center;gap:20px;flex-wrap:wrap;font-size:.9em', 'big-brand': 'display:grid;gap:18px' }[p.layout];
  const css = `.${k}{${surf};color:${fg};padding:${pad};font-family:var(--dx-font,inherit);font-size:.95rem;${lay};box-sizing:border-box}.${k} a{color:${p.surface === 'dark' ? col.bg : col.mut};text-decoration:none}.${k} a:hover{color:${p.surface === 'dark' ? col.bg : col.fg}}${lk}
.${k} ul{display:flex;gap:18px;list-style:none;margin:0;padding:0;flex-wrap:wrap;${p.layout === 'columns' ? 'flex-direction:column;gap:8px;' : ''}}.${k} .b{font-weight:800;${p.layout === 'big-brand' ? 'font-size:clamp(2.4rem,9vw,6rem);line-height:1;letter-spacing:-.04em;' : 'font-size:1.1em;'}}.${k} small{opacity:.75}@media(max-width:640px){.${k}{grid-template-columns:1fr!important}}`;
  const half = Math.ceil(items.length / 2);
  const lists = p.layout === 'columns' ? `<ul>${items.slice(0, half).map((x) => `<li>${link(x, x)}</li>`).join('')}</ul><ul>${items.slice(half).map((x) => `<li>${link(x, x)}</li>`).join('')}</ul>` : `<ul>${items.map((x) => `<li>${link(x, x)}</li>`).join('')}</ul>`;
  return { html: `<footer class="${k}"><div><div class="b">${esc(c.brand || 'Brand')}</div>${p.layout === 'columns' || p.layout === 'big-brand' ? `<small>${esc(c.copy || '© All rights reserved')}</small>` : ''}</div>${lists}${p.layout === 'columns' || p.layout === 'big-brand' ? '' : `<small>${esc(c.copy || '© All rights reserved')}</small>`}</footer>`, css };
};

R.pricing = (p, c, k) => {
  const col = pal(p.palette, p.hue), r = RADII[p.radius], pad = ['16px', '24px', '34px'][p.density]; const plans = (c.plans?.length ? c.plans : [{ name: 'Starter', price: '$9', features: ['1 project', 'Email support'] }, { name: 'Pro', price: '$29', features: ['10 projects', 'Priority support', 'Analytics'] }, { name: 'Team', price: '$79', features: ['Unlimited projects', 'SSO', 'Dedicated help'] }]).slice(0, 4);
  const mark = { tick: '✓', dot: '•', arrow: '→' }[p.check];
  const surf = { solid: `background:${col.bg}`, bordered: `background:${col.bg};border:1px solid ${col.line}`, shadow: `background:${col.bg};box-shadow:${SHADOW[2]}`, glass: `background:color-mix(in srgb,${col.bg} 60%,transparent);border:1px solid ${col.line};backdrop-filter:blur(10px)`, gradient: `background:linear-gradient(160deg,${col.bg},${col.soft});border:1px solid ${col.line}` }[p.surface];
  const css = `.${k}{display:grid;gap:18px;grid-template-columns:${p.layout === 'list' ? '1fr' : 'repeat(auto-fit,minmax(220px,1fr))'};font-family:var(--dx-font,inherit);color:${col.fg}}
.${k} .pl{${surf};border-radius:${r}px;padding:${pad};box-sizing:border-box;${p.layout === 'list' ? 'display:flex;gap:20px;align-items:center;justify-content:space-between;flex-wrap:wrap;' : ''}}
.${k} .pl h3{margin:0;font-size:1.05rem;color:${col.mut}}.${k} .pr{font-size:${p.layout === 'compact' ? '1.8rem' : '2.6rem'};font-weight:800;margin:.2em 0;letter-spacing:-.02em}.${k} ul{list-style:none;padding:0;margin:.8em 0 1.2em;display:grid;gap:8px;${p.layout === 'list' ? 'display:flex;gap:16px;flex-wrap:wrap;margin:0;' : ''}}
.${k} li::before{content:"${mark}";color:${col.acc};font-weight:800;margin-right:8px}.${k} a{display:inline-block;text-align:center;padding:11px 20px;border-radius:${Math.max(r / 2, 6)}px;background:${col.acc};color:${col.on};text-decoration:none;font-weight:700}
${p.layout === 'highlight' || p.layout === 'cards' ? `.${k} .pl:nth-child(2){border:2px solid ${col.acc};transform:scale(1.03)}` : ''}${p.layout === 'row' ? '' : ''}`;
  return { html: `<div class="${k}">${plans.map((pl) => `<div class="pl"><div><h3>${esc(pl.name)}</h3><div class="pr">${esc(pl.price)}</div></div><ul>${(pl.features || []).slice(0, 8).map((f) => `<li>${esc(f)}</li>`).join('')}</ul><a href="${esc(safeHref(pl.href))}">${esc(pl.cta || 'Choose')}</a></div>`).join('')}</div>`, css };
};

R.tabs = (p, c, k) => {
  const col = pal(p.palette, p.hue), r = RADII[p.radius], pad = ['5px 10px', '9px 16px', '13px 22px'][p.density]; const items = (c.items?.length ? c.items : [{ t: 'Overview' }, { t: 'Activity' }, { t: 'Settings' }]).slice(0, 8);
  const st = { underline: `.${k} a[aria-selected=true]{border-bottom:3px solid ${col.acc};color:${col.fg}}.${k}{border-bottom:1px solid ${col.line}}`, pill: `.${k} a{border-radius:999px}.${k} a[aria-selected=true]{background:${col.acc};color:${col.on}}`, boxed: `.${k} a{border:1px solid transparent;border-radius:${r}px ${r}px 0 0}.${k} a[aria-selected=true]{border-color:${col.line};border-bottom-color:${col.bg};background:${col.bg};color:${col.fg}}.${k}{border-bottom:1px solid ${col.line}}`, segmented: `.${k}{background:${col.soft};padding:4px;border-radius:${Math.max(r, 8)}px;display:inline-flex}.${k} a{border-radius:${Math.max(r - 2, 6)}px}.${k} a[aria-selected=true]{background:${col.bg};color:${col.fg};box-shadow:${SHADOW[1]}}`, dot: `.${k} a[aria-selected=true]::after{content:"";display:block;width:6px;height:6px;border-radius:50%;background:${col.acc};margin:4px auto 0}`, caps: `.${k} a{text-transform:uppercase;letter-spacing:.09em;font-size:.8em;font-weight:700}.${k} a[aria-selected=true]{color:${col.acc}}` }[p.style];
  const css = `.${k}{display:flex;gap:4px;font-family:var(--dx-font,inherit);justify-content:${p.align === 'center' ? 'center' : 'flex-start'}}.${k} a{padding:${pad};color:${col.mut};text-decoration:none;font-weight:600;${p.align === 'full' ? 'flex:1;text-align:center;' : ''}transition:color .15s,background .15s}.${k} a:hover{color:${col.fg}}${st}`;
  return { html: `<div class="${k}" role="tablist">${items.map((x, i) => `<a role="tab" href="${esc(safeHref(x.h))}" aria-selected="${i === 0}">${esc(x.t)}</a>`).join('')}</div>`, css };
};

R.list = (p, c, k) => {
  const col = pal(p.palette, p.hue), r = RADII[p.radius], pad = ['4px 0', '10px 0', '16px 0'][p.density]; const items = (c.items?.length ? c.items : [{ t: 'First thing' }, { t: 'Second thing' }, { t: 'Third thing' }]).slice(0, 30);
  const st = { plain: '', divided: `.${k} li{border-bottom:1px solid ${col.line}}`, cards: `.${k}{display:grid;gap:10px}.${k} li{background:${col.bg};border:1px solid ${col.line};border-radius:${r}px;padding:12px 16px}`, bullets: `.${k} li::before{content:"•";color:${col.acc};font-weight:800;margin-right:10px}`, numbered: `.${k}{counter-reset:n}.${k} li{counter-increment:n}.${k} li::before{content:counter(n);display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:${col.acc};color:${col.on};font-size:.8em;font-weight:700;margin-right:12px}`, check: `.${k} li::before{content:"✓";color:${col.acc};font-weight:800;margin-right:10px}`, timeline: `.${k} li{border-left:2px solid ${col.line};padding-left:16px;position:relative}.${k} li::before{content:"";position:absolute;left:-6px;top:1.1em;width:10px;height:10px;border-radius:50%;background:${col.acc}}` }[p.style];
  return { html: `<ul class="${k}">${items.map((x) => `<li>${x.h ? `<a href="${esc(safeHref(x.h))}">${esc(x.t)}</a>` : esc(x.t)}</li>`).join('')}</ul>`, css: `.${k}{list-style:none;margin:0;padding:0;font-family:var(--dx-font,inherit);color:${col.fg}}.${k} li{padding:${pad}}.${k} a{color:${col.acc};text-decoration:none}${st}` };
};

R.alert = (p, c, k) => {
  const col = pal(p.palette, p.hue), r = RADII[p.radius], pad = ['8px 12px', '12px 18px', '18px 26px'][p.density];
  const st = { soft: `background:${col.soft};color:${col.fg}`, solid: `background:${col.acc};color:${col.on}`, outline: `border:1.5px solid ${col.acc};color:${col.fg};background:transparent`, 'left-bar': `background:${col.soft};border-left:5px solid ${col.acc};color:${col.fg};border-radius:${Math.min(r, 8)}px`, banner: `background:${col.fg};color:${col.bg};text-align:center;border-radius:0`, glass: `background:color-mix(in srgb,${col.bg} 55%,transparent);backdrop-filter:blur(10px);border:1px solid ${col.line};color:${col.fg}` }[p.style];
  return { html: `<div class="${k}" role="status">${p.icon ? '<span aria-hidden="true">ⓘ</span>' : ''}<div>${c.title ? `<b>${esc(c.title)}</b> ` : ''}${esc(c.text || 'Something worth knowing.')}</div></div>`, css: `.${k}{display:flex;gap:12px;align-items:flex-start;padding:${pad};border-radius:${r}px;font-family:var(--dx-font,inherit);${st}}` };
};

R.badge = (p, c, k) => {
  const col = pal(p.palette, p.hue); const pad = ['2px 8px', '4px 12px', '6px 16px'][p.size]; const fs = ['11px', '13px', '15px'][p.size];
  const st = { soft: `background:${col.soft};color:${col.acc}`, solid: `background:${col.acc};color:${col.on}`, outline: `border:1.5px solid ${col.acc};color:${col.acc}`, dot: `background:${col.soft};color:${col.fg}`, pill: `background:${col.acc};color:${col.on};border-radius:999px`, caps: `background:${col.soft};color:${col.acc};text-transform:uppercase;letter-spacing:.09em;font-weight:800` }[p.style];
  return { html: `<span class="${k}">${p.style === 'dot' ? '<i></i>' : ''}${esc(c.label || 'Badge')}</span>`, css: `.${k}{display:inline-flex;align-items:center;gap:6px;padding:${pad};font-size:${fs};font-weight:700;border-radius:${p.style === 'pill' ? 999 : 6}px;font-family:var(--dx-font,inherit);${st}}.${k} i{width:7px;height:7px;border-radius:50%;background:${col.acc}}` };
};

/** Render one design. Returns { html, css, id }. */
export function render(kind, params, content = {}) {
  if (!KINDS[kind]) throw new Error('Unknown component kind.');
  const p = normalizeParams(kind, params); const k = `dxc-${kind}-${hash(p)}`;
  const out = R[kind](p, content || {}, k);
  const css = `${out.css}\n${extrasCss(k, p)}`.replace(/\n{2,}/g, '\n').trim();
  return { id: k, kind, params: p, html: out.html, css };
}

/** A full standalone HTML document of one design for a thumbnail iframe. Theme tokens come in as CSS variables. */
export function previewDoc(design, themeVars = '', dark = false) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${themeVars}}*{box-sizing:border-box}body{margin:0;padding:14px;font-family:system-ui,sans-serif;background:${dark ? '#0f1218' : '#f4f6fa'}}${design.css}</style>${design.html}`;
}

/* ------------------- pull the page's own content out of an element (browser only) ------------------- */
export function extractContent(kind, html) {
  if (typeof DOMParser === 'undefined') return {};
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html'); const root = doc.body.firstElementChild || doc.body; const txt = (e) => (e?.textContent || '').replace(/\s+/g, ' ').trim();
  const links = () => [...root.querySelectorAll('a[href]')].map((a) => ({ t: txt(a), h: a.getAttribute('href') })).filter((x) => x.t && x.t.length < 40);
  if (kind === 'nav') { const all = links(); const brandEl = root.querySelector('.brand,.logo,[class*="brand"],[class*="logo"],h1,h2,strong'); const brand = txt(brandEl) || all[0]?.t || ''; const rest = all.filter((x) => x.t !== brand); const cta = root.querySelector('[class*="btn"],[class*="button"],[class*="cta"]'); const ct = cta ? txt(cta) : ''; return { brand, brandHref: root.querySelector('a[href]')?.getAttribute('href') || '/', items: rest.filter((x) => x.t !== ct).slice(0, 8), cta: ct ? { t: ct, h: cta.getAttribute?.('href') || '/' } : null }; }
  if (kind === 'footer') { const all = links(); return { brand: txt(root.querySelector('.brand,.logo,[class*="brand"],strong,h2,h3')) || '', items: all.slice(0, 12), copy: txt(root.querySelector('small,.copyright,p')) }; }
  if (kind === 'table') { const t = root.matches?.('table') ? root : root.querySelector('table'); if (!t) return {}; const headers = [...t.querySelectorAll('thead th, tr:first-child th')].map(txt); const rows = [...t.querySelectorAll('tbody tr, tr')].map((r) => [...r.querySelectorAll('td')].map(txt)).filter((r) => r.length); return { headers: headers.length ? headers : (rows[0] || []).map((_, i) => `Column ${i + 1}`), rows }; }
  if (kind === 'button') { return { label: txt(root) || 'Button', tag: root.tagName === 'A' ? 'a' : 'button', href: root.getAttribute?.('href') || '' }; }
  if (kind === 'hero') { const a = [...root.querySelectorAll('a,button')].map((x) => ({ t: txt(x), h: x.getAttribute('href') || '#' })).filter((x) => x.t); return { title: txt(root.querySelector('h1,h2')), sub: txt(root.querySelector('p')), cta: a[0] || null, cta2: a[1] || null }; }
  if (kind === 'card') { const a = root.querySelector('a[href]'); return { title: txt(root.querySelector('h1,h2,h3,h4,strong,b')) || 'Card title', text: txt(root.querySelector('p')) || '', href: a?.getAttribute('href') || '#', cta: a ? txt(a) : false }; }
  if (kind === 'form') { const fields = [...root.querySelectorAll('input:not([type=submit]):not([type=button]):not([type=hidden]),textarea,select')].map((f) => { const id = f.id; const lb = (id && root.querySelector(`label[for="${CSS.escape ? CSS.escape(id) : id}"]`)) || f.closest('label'); return { label: txt(lb) || f.getAttribute('placeholder') || f.getAttribute('name') || 'Field', type: f.tagName === 'TEXTAREA' ? 'textarea' : (f.getAttribute('type') || 'text'), name: f.getAttribute('name') || '', placeholder: f.getAttribute('placeholder') || '' }; }); const sb = root.querySelector('button,input[type=submit]'); return { fields, submit: txt(sb) || sb?.getAttribute?.('value') || 'Send' }; }
  if (kind === 'tabs' || kind === 'list') return { items: [...root.querySelectorAll(kind === 'tabs' ? 'a,button,[role=tab]' : 'li')].map((e) => ({ t: txt(e), h: e.getAttribute('href') || '' })).filter((x) => x.t).slice(0, 30) };
  if (kind === 'alert') return { text: txt(root) };
  if (kind === 'badge') return { label: txt(root) };
  if (kind === 'pricing') { const pool = contentPool(html); return mapContent('pricing', pool); }
  return {};
}

/* -------- universal content pool: read EVERY reusable piece of text/structure from an element -------- */
/* Lets any element become any component without ever losing its real words (fixes text-on-swap). Browser only. */
export function contentPool(html) {
  if (typeof DOMParser === 'undefined') return {};
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const root = doc.body.firstElementChild || doc.body; const txt = (e) => (e?.textContent || '').replace(/\s+/g, ' ').trim();
  const links = [...root.querySelectorAll('a[href]')].map((a) => ({ t: txt(a), h: a.getAttribute('href') || '#' })).filter((x) => x.t && x.t.length < 60);
  const buttons = [...root.querySelectorAll('button,[role="button"],a[class*="btn"],a[class*="cta"],a[class*="button"],input[type="submit"]')].map((b) => ({ t: txt(b) || b.getAttribute?.('value') || '', h: b.getAttribute?.('href') || '' })).filter((x) => x.t && x.t.length < 40);
  const headings = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(txt).filter(Boolean);
  const paras = [...root.querySelectorAll('p')].map(txt).filter((t) => t && t.length > 1);
  const items = [...root.querySelectorAll('li')].map((li) => { const a = li.querySelector('a[href]'); return { t: txt(li), h: a?.getAttribute('href') || '' }; }).filter((x) => x.t && x.t.length < 80);
  const brand = txt(root.querySelector('.brand,.logo,[class*="brand"],[class*="logo"]'));
  const t = root.matches?.('table') ? root : root.querySelector('table'); let table = null;
  if (t) { const headers = [...t.querySelectorAll('thead th, tr:first-child th')].map(txt); const rows = [...t.querySelectorAll('tbody tr, tr')].map((r) => [...r.querySelectorAll('td')].map(txt)).filter((r) => r.length); table = { headers, rows }; }
  const fields = [...root.querySelectorAll('input:not([type=submit]):not([type=button]):not([type=hidden]),textarea,select')].map((f) => ({ label: f.getAttribute('placeholder') || f.getAttribute('name') || 'Field', type: f.tagName === 'TEXTAREA' ? 'textarea' : (f.getAttribute('type') || 'text'), name: f.getAttribute('name') || '', placeholder: f.getAttribute('placeholder') || '' }));
  return { brand, title: headings[0] || '', sub: paras[0] || headings[1] || '', headings, paras, links, buttons, items, table, fields, copy: txt(root.querySelector('small,.copyright')) || '' };
}

/* Map the universal pool onto a specific kind's content shape. Only falls back to samples when the pool is empty. */
export function mapContent(kind, pool = {}) {
  const p = pool || {}; const L = p.links || []; const B = p.buttons || []; const I = (p.items && p.items.length ? p.items : L);
  const first = (...v) => v.find((x) => x != null && x !== '') ?? '';
  switch (kind) {
    case 'nav': return { brand: first(p.brand, p.title, p.headings?.[0]), brandHref: '/', items: (L.length ? L : I).filter((x) => x.t !== p.brand).slice(0, 8), cta: B[0] || null };
    case 'footer': return { brand: first(p.brand, p.title, p.headings?.[0]), items: (L.length ? L : I).slice(0, 12), copy: p.copy || '' };
    case 'hero': return { title: first(p.title, p.headings?.[0]), sub: first(p.sub, p.paras?.[0]), tag: p.headings?.length > 1 ? p.headings[1] : '', cta: B[0] || L[0] || null, cta2: B[1] || L[1] || null };
    case 'button': { const b = B[0] || L[0]; return { label: first(b?.t, p.title, 'Button'), tag: 'a', href: b?.h || '' }; }
    case 'card': { const a = L[0] || B[0]; return { title: first(p.headings?.[0], p.title, 'Card'), text: first(p.paras?.[0], p.sub), href: a?.h || '#', cta: a?.t || false }; }
    case 'table': return p.table && p.table.rows?.length ? { headers: p.table.headers?.length ? p.table.headers : (p.table.rows[0] || []).map((_, i) => `Column ${i + 1}`), rows: p.table.rows } : {};
    case 'form': return p.fields?.length ? { fields: p.fields, submit: first(B[0]?.t, 'Send') } : {};
    case 'tabs': case 'list': return { items: (I.length ? I : L).slice(0, 30) };
    case 'alert': return { text: first(p.paras?.[0], p.title, p.sub) };
    case 'badge': return { label: first(p.title, p.headings?.[0], L[0]?.t, 'Badge') };
    case 'pricing': { const feats = (p.items || []).map((x) => x.t); const plans = (p.headings || []).slice(0, 4).map((name, i) => ({ name, price: (p.paras || [])[i] || '', features: feats.slice(i * 3, i * 3 + 3), cta: B[i]?.t || B[0]?.t || 'Choose', href: B[i]?.h || '' })); return plans.length ? { plans } : {}; }
    default: return {};
  }
}

/* ------------------- style-only presets for ANY element (no markup change) ------------------- */
export const SURFACES = ['glass', 'neumorphic', 'brutalist', 'gradient-border', 'soft-shadow', 'outlined', 'tinted', 'dark-card', 'aurora', 'paper', 'frosted', 'mesh', 'inset', 'ring', 'elevated-xl', 'sunken'];
/** CSS for one selector. Used when the selected element is just a box, text or image. */
export function surfaceCss(selector, name, { palette = 'theme', hue = 0, radius = 2 } = {}) {
  const col = pal(palette, hue), r = RADII[radius] ?? 14;
  const m = {
    glass: `background:color-mix(in srgb,${col.bg} 55%,transparent)!important;backdrop-filter:blur(14px)!important;border:1px solid ${col.line}!important`,
    neumorphic: `background:${col.bg}!important;border:0!important;box-shadow:8px 8px 18px color-mix(in srgb,${col.fg} 18%,transparent),-8px -8px 18px color-mix(in srgb,${col.bg} 80%,#fff)!important`,
    brutalist: `background:${col.bg}!important;border:3px solid #000!important;box-shadow:6px 6px 0 #000!important;border-radius:0!important`,
    'gradient-border': `background:linear-gradient(${col.bg},${col.bg}) padding-box,linear-gradient(135deg,${col.acc},#ff5ac8) border-box!important;border:2px solid transparent!important`,
    'soft-shadow': `background:${col.bg}!important;border:0!important;box-shadow:${SHADOW[2]}!important`,
    outlined: `background:transparent!important;border:2px solid ${col.acc}!important`,
    tinted: `background:${col.soft}!important;border:1px solid ${col.line}!important`,
    'dark-card': `background:${col.fg}!important;color:${col.bg}!important;border:0!important`,
    aurora: `background:radial-gradient(120% 120% at 0% 0%,color-mix(in srgb,${col.acc} 40%,transparent),transparent 60%),radial-gradient(120% 120% at 100% 100%,color-mix(in srgb,#ff5ac8 35%,transparent),transparent 60%),${col.bg}!important;border:1px solid ${col.line}!important`,
    paper: `background:#fbf7ee!important;color:#2b2418!important;border:1px solid #e6dcc6!important;box-shadow:0 1px 0 #e6dcc6,0 8px 18px rgba(80,60,20,.12)!important`,
    frosted: `background:color-mix(in srgb,${col.bg} 35%,transparent)!important;backdrop-filter:blur(26px) saturate(1.4)!important;border:1px solid color-mix(in srgb,#fff 24%,transparent)!important`,
    mesh: `background:radial-gradient(90% 120% at 10% 0%,color-mix(in srgb,${col.acc} 30%,transparent),transparent 55%),radial-gradient(90% 120% at 100% 100%,color-mix(in srgb,#36d1ff 28%,transparent),transparent 55%),${col.bg}!important;border:0!important`,
    inset: `background:${col.bg}!important;border:0!important;box-shadow:inset 0 2px 6px color-mix(in srgb,${col.fg} 22%,transparent)!important`,
    ring: `background:${col.bg}!important;border:1px solid ${col.line}!important;box-shadow:0 0 0 4px color-mix(in srgb,${col.acc} 22%,transparent)!important`,
    'elevated-xl': `background:${col.bg}!important;border:0!important;box-shadow:${SHADOW[3]}!important`,
    sunken: `background:color-mix(in srgb,${col.fg} 6%,${col.bg})!important;border:1px solid ${col.line}!important;box-shadow:inset 0 1px 3px color-mix(in srgb,${col.fg} 14%,transparent)!important`,
  }[name] || '';
  return m ? `${selector}{${m};${name === 'brutalist' ? '' : `border-radius:${r}px!important;`}}` : '';
}

// Size-locked restyle: change ONLY how an element looks (colour, border, radius, shadow, type),
// keeping its exact footprint. Returns [{name, css (targets the real selector), chip (inline
// style for a tiny swatch preview)}]. Uses the active Look's --dx-* tokens so variants match it.
export function styleVariants(selector, size, opts = {}) {
  const small = size && size.w && size.h && size.h <= 96;
  const lock = small ? `width:${size.w}px!important;height:${size.h}px!important;min-height:0!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:.5em!important;padding:0 14px!important;` : '';
  const A = 'var(--dx-accent,#6366f1)', ON = 'var(--dx-on-accent,#fff)', S = 'var(--dx-surface,#fff)', T = 'var(--dx-text,#0f172a)', B = 'var(--dx-border,#e5e7eb)';
  const mk = (name, decls, chip) => ({ name, css: `${selector}{${decls}${lock}}`, chip });
  return [
    mk('Solid', `background:${A}!important;color:${ON}!important;border:1px solid transparent!important;border-radius:10px!important;box-shadow:0 1px 2px rgba(0,0,0,.14)!important;text-decoration:none!important;`, `background:${A};color:${ON};border-radius:9px`),
    mk('Soft', `background:color-mix(in srgb,${A} 16%,${S})!important;color:${A}!important;border:1px solid color-mix(in srgb,${A} 24%,transparent)!important;border-radius:10px!important;box-shadow:none!important;`, `background:color-mix(in srgb,${A} 16%,${S});color:${A};border-radius:9px`),
    mk('Outline', `background:transparent!important;color:${A}!important;border:1.5px solid ${A}!important;border-radius:10px!important;box-shadow:none!important;`, `background:transparent;color:${A};border:1.5px solid ${A};border-radius:9px`),
    mk('Ghost', `background:transparent!important;color:${T}!important;border:1px solid transparent!important;box-shadow:none!important;`, `background:transparent;color:${T};border:1px dashed color-mix(in srgb,${T} 24%,transparent);border-radius:9px`),
    mk('Gradient', `background:linear-gradient(135deg,${A},color-mix(in srgb,${A} 55%,#000))!important;color:${ON}!important;border:0!important;border-radius:12px!important;box-shadow:0 8px 24px color-mix(in srgb,${A} 40%,transparent)!important;`, `background:linear-gradient(135deg,${A},color-mix(in srgb,${A} 55%,#000));color:${ON};border-radius:10px`),
    mk('Glass', `background:color-mix(in srgb,${S} 55%,transparent)!important;color:${T}!important;border:1px solid color-mix(in srgb,${T} 14%,transparent)!important;backdrop-filter:blur(10px)!important;border-radius:12px!important;box-shadow:0 4px 18px rgba(0,0,0,.14)!important;`, `background:color-mix(in srgb,${S} 60%,transparent);color:${T};border:1px solid color-mix(in srgb,${T} 14%,transparent);border-radius:10px`),
    mk('Glow', `background:${A}!important;color:${ON}!important;border:0!important;border-radius:10px!important;box-shadow:0 0 0 1px ${A},0 0 22px color-mix(in srgb,${A} 70%,transparent)!important;`, `background:${A};color:${ON};border-radius:9px;box-shadow:0 0 10px ${A}`),
    mk('Pill', `background:${A}!important;color:${ON}!important;border:0!important;border-radius:999px!important;box-shadow:0 2px 10px rgba(0,0,0,.16)!important;`, `background:${A};color:${ON};border-radius:999px`),
    mk('Sharp', `background:${A}!important;color:${ON}!important;border:0!important;border-radius:0!important;box-shadow:none!important;`, `background:${A};color:${ON};border-radius:0`),
    mk('Elevated', `background:${S}!important;color:${T}!important;border:1px solid ${B}!important;border-radius:12px!important;box-shadow:0 10px 30px rgba(0,0,0,.16)!important;`, `background:${S};color:${T};border:1px solid ${B};border-radius:10px;box-shadow:0 6px 14px rgba(0,0,0,.18)`),
    mk('Flat', `background:${S}!important;color:${T}!important;border:1px solid ${B}!important;border-radius:8px!important;box-shadow:none!important;`, `background:${S};color:${T};border:1px solid ${B};border-radius:8px`),
    mk('Mono', `background:${T}!important;color:${S}!important;border:0!important;border-radius:8px!important;letter-spacing:.02em!important;box-shadow:none!important;`, `background:${T};color:${S};border-radius:8px`),
  ];
}
