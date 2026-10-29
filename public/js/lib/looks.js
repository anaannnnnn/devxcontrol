// Looks: complete, one-click design systems. Each Look is a coherent bundle — color, typography, shape, shadow and
// component styling — compiled to a single stylesheet that restyles the WHOLE app (body, headings, links, buttons,
// inputs, cards, nav, footer) at once. Visual only (no layout/position changes), so it is safe to preview on any site
// and only reaches a project after Autopilot review. No dependencies: used by the browser editor and by tests.

const F = {
  inter: "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
  geist: "'Geist','Inter',system-ui,sans-serif",
  sora: "'Sora',system-ui,sans-serif",
  poppins: "'Poppins',system-ui,sans-serif",
  dm: "'DM Sans',system-ui,sans-serif",
  serif: "Georgia,'Iowan Old Style',Cambria,serif",
  playfair: "'Playfair Display',Georgia,serif",
  mono: "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace",
  space: "'Space Grotesk','Sora',system-ui,sans-serif",
};

/* The named families above only render if the page loads them, so every stylesheet starts with the matching Google Fonts import. */
const GF = { 'Inter': 'Inter:wght@400;500;600;700;800', 'Geist': 'Geist:wght@400;500;600;700', 'Sora': 'Sora:wght@400;600;700;800', 'Poppins': 'Poppins:wght@400;500;600;700', 'DM Sans': 'DM+Sans:wght@400;500;600;700',
  'Playfair Display': 'Playfair+Display:wght@500;600;700;800', 'JetBrains Mono': 'JetBrains+Mono:wght@400;500;700', 'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700',
  'Archivo': 'Archivo:wght@400;600;700;800;900', 'Fraunces': 'Fraunces:wght@400;600;700;800', 'Manrope': 'Manrope:wght@400;500;600;700;800', 'Outfit': 'Outfit:wght@400;500;600;700', 'Lora': 'Lora:wght@400;500;600;700',
  'Cormorant Garamond': 'Cormorant+Garamond:wght@500;600;700', 'IBM Plex Mono': 'IBM+Plex+Mono:wght@400;500;600', 'IBM Plex Sans': 'IBM+Plex+Sans:wght@400;500;600;700', 'Bricolage Grotesque': 'Bricolage+Grotesque:wght@400;600;700;800',
  'Syne': 'Syne:wght@500;600;700;800', 'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@400;500;600;700;800', 'Lexend': 'Lexend:wght@400;500;600;700', 'Rubik': 'Rubik:wght@400;500;600;700', 'Work Sans': 'Work+Sans:wght@400;500;600;700',
  'Nunito': 'Nunito:wght@400;600;700;800', 'Instrument Serif': 'Instrument+Serif', 'Unbounded': 'Unbounded:wght@500;600;700', 'Chakra Petch': 'Chakra+Petch:wght@400;500;600;700', 'Space Mono': 'Space+Mono:wght@400;700', 'Bebas Neue': 'Bebas+Neue', 'Anton': 'Anton', 'Oswald': 'Oswald:wght@400;500;600;700', 'Barlow Condensed': 'Barlow+Condensed:wght@500;600;700', 'Barlow': 'Barlow:wght@400;500;600;700', 'Karla': 'Karla:wght@400;500;600;700', 'Spectral': 'Spectral:wght@400;600;700;800', 'Libre Baskerville': 'Libre+Baskerville:wght@400;700', 'DM Serif Display': 'DM+Serif+Display', 'Abril Fatface': 'Abril+Fatface', 'Orbitron': 'Orbitron:wght@500;700;800', 'Righteous': 'Righteous', 'Quicksand': 'Quicksand:wght@400;500;600;700', 'Bungee': 'Bungee' };
export const fontImport = (...stacks) => {
  const used = [...new Set(stacks.flatMap((f) => String(f || '').split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, ''))).filter((n) => GF[n]))];
  return used.length ? `@import url('https://fonts.googleapis.com/css2?${used.map((n) => `family=${GF[n]}`).join('&')}&display=swap');` : '';
};

/** Just the design tokens for a Look (used to preview Blocks inside the active Look). */
export function lookTokens(c) {
  const on = c.on || '#ffffff';
  const cr = c.cardRadius ?? c.radius ?? 12;
  return `--dx-accent:${c.accent};--dx-on-accent:${on};--dx-surface:${c.surface};--dx-text:${c.text};--dx-muted:${c.muted};--dx-bg:${c.bg};--dx-border:${c.border};--dx-radius:${cr}px`;
}

/** Build the full-app stylesheet for one Look config. */
export function buildLookCss(c) {
  const on = c.on || '#ffffff';
  const body = c.font || F.inter;
  const head = c.head || body;
  const r = c.radius ?? 12;
  const cr = c.cardRadius ?? r;
  const btnR = c.pill ? '999px' : `${c.btnRadius ?? r}px`;
  const up = c.upper ? 'text-transform:uppercase;letter-spacing:.06em;' : '';
  return [
    fontImport(body, head),
    `:root{${lookTokens(c)}}`,
    `body{background:${c.bg}!important;${/gradient/.test(c.bg) ? 'background-attachment:fixed!important;background-repeat:no-repeat!important;' : ''}color:${c.text}!important;font-family:${body}!important;${c.ls ? `letter-spacing:${c.ls};` : ''}-webkit-font-smoothing:antialiased}`,
    `h1,h2,h3,h4,h5,h6{font-family:${head}!important;color:${c.headColor || c.text}!important;font-weight:${c.hw ?? 700}!important;letter-spacing:${c.hls ?? '-.02em'}!important;${c.upper ? 'text-transform:uppercase;' : ''}}`,
    `p,li,td,th,label,small,dd,dt,blockquote{color:${c.text}!important}`,
    `:where(span):not(:where(button *,a *,[class*=btn] *,[data-dx=btn] *,[class*=badge],[class*=chip],[class*=tag],[data-dx=badge],[data-dx=hero] *)){color:${c.text}!important}`,
    `.muted,[class*=muted],small{color:${c.muted}!important}`,
    `a{color:${c.accent}!important;text-underline-offset:3px!important}`,
    `button,[class*=btn],[class*=button],input[type=submit],.cta,[role=button]{background:${c.btnBg || c.accent}!important;color:${c.btnText || on}!important;border:${c.btnBorder || '0'}!important;border-radius:${btnR}!important;font-family:${body}!important;font-weight:600!important;${up}box-shadow:${c.btnShadow || 'none'}!important;transition:transform .2s ease,box-shadow .2s ease,filter .2s ease!important}`,
    `button *,[class*=btn] *,[role=button] *,input[type=submit] *{color:inherit!important}`,
    `button:hover,[class*=btn]:hover,.cta:hover,[role=button]:hover{filter:brightness(1.07)!important;${c.hoverLift ? 'transform:translateY(-2px)!important;' : ''}${c.hoverShadow ? `box-shadow:${c.hoverShadow}!important;` : ''}}`,
    `input,textarea,select{background:${c.inputBg || c.surface}!important;color:${c.text}!important;border:${c.inputBorder || `1px solid ${c.border}`}!important;border-radius:${c.inputRadius ?? r}px!important;font-family:${body}!important}`,
    `[class*=card],[class*=panel],[class*=tile],[class*=box],article{background:${c.cardBg || c.surface}!important;color:${c.text}!important;border:${c.cardBorder || `1px solid ${c.border}`}!important;border-radius:${cr}px!important;box-shadow:${c.cardShadow || 'none'}!important;${c.cardBackdrop ? `backdrop-filter:${c.cardBackdrop}!important;` : ''}}`,
    c.navBg || c.navBorder ? `header,nav,[class*=navbar],[class*=header]{${c.navBg ? `background:${c.navBg}!important;` : ''}${c.navBorder ? `border-bottom:1px solid ${c.border}!important;` : ''}${c.navBackdrop ? `backdrop-filter:${c.navBackdrop}!important;` : ''}}` : '',
    `footer,[class*=footer]{background:${c.footerBg || c.surface}!important;color:${c.muted}!important}`,
    `img,video{border-radius:${Math.min(cr, 18)}px!important}`,
    c.extra || '',
  ].filter(Boolean).join('\n');
}

/** A standalone mini-UI document to preview a Look in a thumbnail iframe. */
export function lookThumb(c) {
  const css = buildLookCss(c);
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0}body{padding:14px;display:grid;gap:10px}.card{padding:12px}.row{display:flex;gap:8px;align-items:center}.btn{padding:8px 14px;border:0;cursor:pointer;font-size:13px}input{padding:7px 10px;width:100%}${css}</style>
  <nav class="row" style="justify-content:space-between"><b style="font-size:14px">Brand</b><div class="row" style="gap:12px;font-size:12px"><a href="#">Home</a><a href="#">Pricing</a></div></nav>
  <h1 style="font-size:22px;line-height:1.1">Design that ships</h1>
  <p style="font-size:12px" class="muted">One click restyles the whole app.</p>
  <div class="row"><button class="btn">Get started</button><a href="#" style="font-size:12px">Learn more</a></div>
  <div class="card"><b style="font-size:13px">Card title</b><p style="font-size:11px" class="muted">Supporting copy sits here.</p></div>
  <input placeholder="you@example.com">`;
}

// A broad, curated set spanning many design languages for real variety.
export const LOOKS = [
  // ---- Modern SaaS ----
  { id: 'linear', name: 'Linear', family: 'Modern SaaS', mode: 'dark', bg: '#08090c', surface: '#111317', text: '#e7e9ee', muted: '#8a8f9a', accent: '#6e79ff', border: '#20242c', font: F.inter, head: F.inter, radius: 10, cardShadow: '0 1px 0 rgba(255,255,255,.04) inset', navBorder: 1, hoverLift: 1, btnShadow: '0 6px 18px rgba(110,121,255,.35)' },
  { id: 'vercel', name: 'Vercel', family: 'Modern SaaS', mode: 'light', bg: '#ffffff', surface: '#ffffff', text: '#0a0a0a', muted: '#666', accent: '#0a0a0a', on: '#fff', border: '#eaeaea', font: F.geist, radius: 8, cardShadow: '0 2px 8px rgba(0,0,0,.06)', navBorder: 1, hoverLift: 1 },
  { id: 'stripe', name: 'Stripe', family: 'Modern SaaS', mode: 'light', bg: '#f6f9fc', surface: '#ffffff', text: '#1a1f36', muted: '#6b7394', accent: '#635bff', on: '#fff', border: '#e6e9f0', font: F.inter, radius: 10, cardShadow: '0 8px 24px rgba(50,50,93,.1)', btnShadow: '0 4px 12px rgba(99,91,255,.4)', hoverLift: 1 },
  { id: 'supabase', name: 'Supabase', family: 'Modern SaaS', mode: 'dark', bg: '#0b0f0d', surface: '#141a17', text: '#ededed', muted: '#8b968f', accent: '#3ecf8e', on: '#07120d', border: '#232a26', font: F.inter, radius: 8, navBorder: 1, btnShadow: '0 6px 18px rgba(62,207,142,.3)', hoverLift: 1 },
  { id: 'indigo-pro', name: 'Indigo Pro', family: 'Modern SaaS', mode: 'light', bg: '#f7f8fb', surface: '#ffffff', text: '#0f172a', muted: '#64748b', accent: '#4f46e5', on: '#fff', border: '#e5e8f0', font: F.inter, radius: 12, cardShadow: '0 10px 30px rgba(15,23,42,.08)', hoverLift: 1 },
  // ---- Apple / Minimal ----
  { id: 'apple-light', name: 'Cupertino', family: 'Apple / Minimal', mode: 'light', bg: '#fbfbfd', surface: '#ffffff', text: '#1d1d1f', muted: '#6e6e73', accent: '#0071e3', on: '#fff', border: '#e8e8ed', font: F.inter, radius: 16, pill: 1, cardShadow: '0 4px 20px rgba(0,0,0,.06)', hls: '-.03em', hoverLift: 1 },
  { id: 'apple-dark', name: 'Midnight', family: 'Apple / Minimal', mode: 'dark', bg: '#000000', surface: '#1c1c1e', text: '#f5f5f7', muted: '#98989d', accent: '#0a84ff', on: '#fff', border: '#2c2c2e', font: F.inter, radius: 16, pill: 1, hls: '-.03em' },
  { id: 'paper', name: 'Paper', family: 'Apple / Minimal', mode: 'light', bg: '#faf9f6', surface: '#ffffff', text: '#2b2b2b', muted: '#777', accent: '#111', on: '#fff', border: '#ece9e2', font: F.dm, radius: 8, cardShadow: '0 1px 3px rgba(0,0,0,.05)' },
  { id: 'nordic', name: 'Nordic', family: 'Apple / Minimal', mode: 'light', bg: '#eceff4', surface: '#ffffff', text: '#2e3440', muted: '#4c566a', accent: '#5e81ac', on: '#fff', border: '#d8dee9', font: F.inter, radius: 10, cardShadow: '0 4px 14px rgba(46,52,64,.08)' },
  // ---- Playful / Bold ----
  { id: 'candy', name: 'Candy', family: 'Playful / Bold', mode: 'light', bg: '#fff5fb', surface: '#ffffff', text: '#3a1340', muted: '#9c6aa5', accent: '#ff3d9a', on: '#fff', border: '#ffd6ec', font: F.poppins, radius: 22, pill: 1, cardShadow: '0 14px 40px rgba(255,61,154,.18)', btnShadow: '0 10px 24px rgba(255,61,154,.4)', hoverLift: 1 },
  { id: 'sunset', name: 'Sunset', family: 'Playful / Bold', mode: 'light', bg: '#fff8f2', surface: '#ffffff', text: '#3d1f12', muted: '#9c6b4f', accent: '#ff6b35', on: '#fff', border: '#ffe2d1', font: F.poppins, radius: 18, cardShadow: '0 12px 32px rgba(255,107,53,.16)', btnBg: 'linear-gradient(120deg,#ff6b35,#ff3d9a)', hoverLift: 1 },
  { id: 'bubblegum', name: 'Bubblegum', family: 'Playful / Bold', mode: 'light', bg: '#f0fbff', surface: '#ffffff', text: '#12343b', muted: '#5a7d85', accent: '#00b4d8', on: '#fff', border: '#cdeef6', font: F.space, radius: 20, pill: 1, cardShadow: '0 12px 30px rgba(0,180,216,.16)', hoverLift: 1 },
  { id: 'grape', name: 'Grape Soda', family: 'Playful / Bold', mode: 'dark', bg: '#17091f', surface: '#241132', text: '#f3e9ff', muted: '#b196c9', accent: '#b14bff', on: '#fff', border: '#38204a', font: F.space, radius: 18, btnBg: 'linear-gradient(120deg,#b14bff,#5b8cff)', btnShadow: '0 10px 28px rgba(177,75,255,.45)', hoverLift: 1 },
  // ---- Editorial ----
  { id: 'editorial', name: 'Editorial', family: 'Editorial', mode: 'light', bg: '#fffdf8', surface: '#ffffff', text: '#1a1a1a', muted: '#6b6b6b', accent: '#9a3412', on: '#fff', border: '#eae6dd', font: F.serif, head: F.playfair, radius: 4, hls: '-.01em', hw: 600, ls: '.005em', cardBorder: '1px solid #eae6dd' },
  { id: 'vogue', name: 'Vogue', family: 'Editorial', mode: 'light', bg: '#ffffff', surface: '#fafafa', text: '#111', muted: '#777', accent: '#111', on: '#fff', border: '#e6e6e6', font: F.serif, head: F.playfair, radius: 0, hw: 500, upper: 0, hls: '-.01em' },
  { id: 'manuscript', name: 'Manuscript', family: 'Editorial', mode: 'light', bg: '#f4efe6', surface: '#fbf8f1', text: '#2a2318', muted: '#6b5f49', accent: '#7c5c2e', on: '#fff', border: '#e0d7c4', font: F.serif, head: F.serif, radius: 3, cardShadow: '0 1px 0 #e0d7c4' },
  { id: 'noir', name: 'Noir', family: 'Editorial', mode: 'dark', bg: '#0c0c0c', surface: '#161616', text: '#f0f0f0', muted: '#9a9a9a', accent: '#e8c15a', on: '#1a1a1a', border: '#262626', font: F.serif, head: F.playfair, radius: 2, hls: '-.01em' },
  // ---- Brutalist ----
  { id: 'brutalist', name: 'Brutalist', family: 'Brutalist', mode: 'light', bg: '#f4f4e9', surface: '#ffffff', text: '#000', muted: '#333', accent: '#ff5c00', on: '#fff', border: '#000', font: F.mono, head: F.space, radius: 0, hw: 800, upper: 1, btnBorder: '3px solid #000', btnBg: '#ffde00', btnText: '#000', btnShadow: '5px 5px 0 #000', cardBorder: '3px solid #000', cardShadow: '6px 6px 0 #000' },
  { id: 'terminal', name: 'Terminal', family: 'Brutalist', mode: 'dark', bg: '#0a0f0a', surface: '#0f160f', text: '#b9ffb0', muted: '#5f8f5a', accent: '#39ff14', on: '#06120a', border: '#1d2a1d', font: F.mono, head: F.mono, radius: 0, btnBorder: '1px solid #39ff14', btnBg: 'transparent', btnText: '#39ff14', cardBorder: '1px solid #1d2a1d' },
  { id: 'blueprint', name: 'Blueprint', family: 'Brutalist', mode: 'dark', bg: '#0a1a2f', surface: '#0e2240', text: '#dbe9ff', muted: '#8fb0d9', accent: '#4da3ff', on: '#03101f', border: '#1b3a5e', font: F.mono, head: F.space, radius: 0, upper: 1, cardBorder: '1px dashed #3a618c' },
  // ---- Glass / Aurora ----
  { id: 'glass', name: 'Glassmorphic', family: 'Glass / Aurora', mode: 'dark', bg: 'radial-gradient(120% 100% at 0% 0%,#1b2a5e,#0a0f1f 55%)', surface: 'rgba(255,255,255,.08)', text: '#eef2ff', muted: '#aab4d4', accent: '#7aa2ff', on: '#06122e', border: 'rgba(255,255,255,.18)', font: F.inter, radius: 18, cardBackdrop: 'blur(18px) saturate(1.3)', cardShadow: '0 16px 40px rgba(0,0,0,.35)', navBackdrop: 'blur(14px)', navBg: 'rgba(255,255,255,.06)' },
  { id: 'aurora', name: 'Aurora', family: 'Glass / Aurora', mode: 'dark', bg: 'linear-gradient(135deg,#0f0c29,#302b63 55%,#24243e)', surface: 'rgba(255,255,255,.07)', text: '#f0ecff', muted: '#b6aee0', accent: '#a18cff', on: '#140f33', border: 'rgba(255,255,255,.16)', font: F.sora, radius: 20, cardBackdrop: 'blur(16px)', cardShadow: '0 18px 44px rgba(0,0,0,.4)', btnBg: 'linear-gradient(120deg,#a18cff,#5ad1ff)' },
  { id: 'frost', name: 'Frost', family: 'Glass / Aurora', mode: 'light', bg: 'linear-gradient(135deg,#e6f0ff,#f6f9ff 60%,#eef7ff)', surface: 'rgba(255,255,255,.65)', text: '#15223a', muted: '#5b6b86', accent: '#2563eb', on: '#fff', border: 'rgba(255,255,255,.7)', font: F.inter, radius: 18, cardBackdrop: 'blur(14px)', cardShadow: '0 12px 34px rgba(37,99,235,.12)' },
  // ---- Dark Neon ----
  { id: 'cyberpunk', name: 'Cyberpunk', family: 'Dark Neon', mode: 'dark', bg: '#07060f', surface: '#0e0c1d', text: '#eafdff', muted: '#8aa0b4', accent: '#00f0ff', on: '#03070a', border: '#1a1836', font: F.space, head: F.space, radius: 6, upper: 1, btnBg: 'linear-gradient(120deg,#00f0ff,#ff2bd6)', btnShadow: '0 0 22px rgba(0,240,255,.55)', cardShadow: '0 0 26px rgba(0,240,255,.14)', cardBorder: '1px solid #243', navBorder: 1 },
  { id: 'synthwave', name: 'Synthwave', family: 'Dark Neon', mode: 'dark', bg: 'linear-gradient(180deg,#241b3a,#0d0b1e)', surface: '#1a1430', text: '#ffe9fb', muted: '#c39adf', accent: '#ff3caa', on: '#1a0a22', border: '#3a2a5e', font: F.sora, radius: 10, btnBg: 'linear-gradient(120deg,#ff3caa,#ffae4b)', btnShadow: '0 0 22px rgba(255,60,170,.5)', cardShadow: '0 10px 30px rgba(255,60,170,.18)' },
  { id: 'matrix', name: 'Matrix', family: 'Dark Neon', mode: 'dark', bg: '#020402', surface: '#06100a', text: '#8dffbf', muted: '#4f8f68', accent: '#00ff88', on: '#021208', border: '#10361f', font: F.mono, radius: 4, btnShadow: '0 0 18px rgba(0,255,136,.5)', cardShadow: '0 0 20px rgba(0,255,136,.12)' },
  // ---- Corporate / Trust ----
  { id: 'corporate', name: 'Corporate', family: 'Corporate', mode: 'light', bg: '#f5f7fa', surface: '#ffffff', text: '#1b2733', muted: '#5f6b79', accent: '#1e5eff', on: '#fff', border: '#e1e6ec', font: F.inter, radius: 8, cardShadow: '0 6px 18px rgba(27,39,51,.07)', navBorder: 1 },
  { id: 'finance', name: 'Finance', family: 'Corporate', mode: 'dark', bg: '#0b1220', surface: '#121b2e', text: '#e6edf7', muted: '#8a97ad', accent: '#2dd4bf', on: '#04140f', border: '#1e293b', font: F.inter, radius: 8, navBorder: 1, cardShadow: '0 8px 22px rgba(0,0,0,.3)' },
  { id: 'healthcare', name: 'Healthcare', family: 'Corporate', mode: 'light', bg: '#f3faf8', surface: '#ffffff', text: '#143c3a', muted: '#5a807d', accent: '#0ea5a5', on: '#fff', border: '#d7ece9', font: F.inter, radius: 14, cardShadow: '0 8px 24px rgba(14,165,165,.1)', hoverLift: 1 },
  // ---- Warm / Earthy / Retro ----
  { id: 'terracotta', name: 'Terracotta', family: 'Warm / Retro', mode: 'light', bg: '#fdf6f0', surface: '#fffaf5', text: '#3b2317', muted: '#8a6a56', accent: '#c2410c', on: '#fff', border: '#ecdcce', font: F.dm, radius: 14, cardShadow: '0 8px 24px rgba(194,65,12,.1)' },
  { id: 'forest', name: 'Forest', family: 'Warm / Retro', mode: 'light', bg: '#f4f7f0', surface: '#ffffff', text: '#1f2d1a', muted: '#5f7254', accent: '#3f6212', on: '#fff', border: '#dde6d2', font: F.dm, radius: 12, cardShadow: '0 6px 18px rgba(31,45,26,.08)' },
  { id: 'retro70', name: 'Retro 70s', family: 'Warm / Retro', mode: 'light', bg: '#fbf0d9', surface: '#fff8ea', text: '#3a2a12', muted: '#8a6f45', accent: '#d97706', on: '#fff', border: '#e8d6ad', font: F.space, head: F.space, radius: 24, pill: 1, btnBg: 'linear-gradient(120deg,#d97706,#b45309)', cardShadow: '0 10px 26px rgba(217,119,6,.16)' },
  { id: 'mono-zinc', name: 'Mono Zinc', family: 'Monochrome', mode: 'dark', bg: '#0b0b0c', surface: '#161618', text: '#ededed', muted: '#9a9a9e', accent: '#e4e4e7', on: '#111', border: '#272729', font: F.inter, radius: 10, cardShadow: '0 1px 0 rgba(255,255,255,.04) inset', navBorder: 1 },
  // ---- more variety ----
  { id: 'notion', name: 'Notion', family: 'Modern SaaS', mode: 'light', bg: '#ffffff', surface: '#f7f7f5', text: '#37352f', muted: '#9b9a97', accent: '#2383e2', on: '#fff', border: '#ececeb', font: F.inter, radius: 6, cardShadow: 'none' },
  { id: 'ocean', name: 'Ocean', family: 'Modern SaaS', mode: 'dark', bg: '#071a2b', surface: '#0d2740', text: '#dbeafe', muted: '#8bb0d0', accent: '#38bdf8', on: '#05121f', border: '#163a57', font: F.inter, radius: 12, cardShadow: '0 10px 28px rgba(0,0,0,.3)', hoverLift: 1 },
  { id: 'rose-light', name: 'Rosé', family: 'Playful / Bold', mode: 'light', bg: '#fff5f6', surface: '#ffffff', text: '#4a1f2b', muted: '#9c6b76', accent: '#e11d6b', on: '#fff', border: '#f6d9df', font: F.dm, radius: 18, cardShadow: '0 10px 30px rgba(225,29,107,.12)', hoverLift: 1 },
  { id: 'emerald', name: 'Emerald', family: 'Corporate', mode: 'light', bg: '#f1faf5', surface: '#ffffff', text: '#0f2e22', muted: '#5c7d6e', accent: '#059669', on: '#fff', border: '#d6ebe0', font: F.inter, radius: 12, cardShadow: '0 8px 22px rgba(5,150,105,.1)' },
  { id: 'amber-dark', name: 'Amber Noir', family: 'Dark Neon', mode: 'dark', bg: '#140f04', surface: '#211809', text: '#fde8c3', muted: '#c2a677', accent: '#f59e0b', on: '#1a1203', border: '#39290f', font: F.space, radius: 8, btnShadow: '0 0 18px rgba(245,158,11,.4)', cardShadow: '0 0 22px rgba(245,158,11,.1)' },
  { id: 'slate', name: 'Slate Pro', family: 'Corporate', mode: 'dark', bg: '#0f172a', surface: '#1e293b', text: '#e2e8f0', muted: '#94a3b8', accent: '#818cf8', on: '#0b1020', border: '#334155', font: F.inter, radius: 10, navBorder: 1, cardShadow: '0 8px 22px rgba(0,0,0,.28)', hoverLift: 1 },
  { id: 'coral', name: 'Coral', family: 'Warm / Retro', mode: 'light', bg: '#fff6f3', surface: '#ffffff', text: '#3a1e18', muted: '#946356', accent: '#f4512c', on: '#fff', border: '#ffddd2', font: F.poppins, radius: 16, cardShadow: '0 10px 26px rgba(244,81,44,.14)', hoverLift: 1 },
  { id: 'lavender', name: 'Lavender', family: 'Apple / Minimal', mode: 'light', bg: '#faf8ff', surface: '#ffffff', text: '#2a2340', muted: '#746b91', accent: '#7c6cf0', on: '#fff', border: '#e9e4f7', font: F.inter, radius: 16, pill: 1, cardShadow: '0 10px 30px rgba(124,108,240,.12)', hoverLift: 1 },
];

export const FAMILIES = [...new Set(LOOKS.map((l) => l.family))];
export const lookById = (id) => LOOKS.find((l) => l.id === id) || null;
