// Reads a running site's own HTML and CSS and works out its look: page and text colours, the accent, the font and the corner
// radius. The result feeds kitFromColors, so "make this app look like that one" works for apps that never picked a kit.
import { kitFromColors, mixHex, contrast } from '../public/js/lib/kits.js';

const HEX = /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi;
const norm = (c) => {
  c = String(c || '').trim().toLowerCase(); let m;
  if ((m = /^#([0-9a-f]{3})$/.exec(c))) return '#' + [...m[1]].map((x) => x + x).join('');
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if ((m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(c))) { if (m[4] !== undefined && parseFloat(m[4]) < 0.5 && !m[4].endsWith('%')) return null; return '#' + [m[1], m[2], m[3]].map((n) => Math.min(255, +n).toString(16).padStart(2, '0')).join(''); }
  return null;
};
const sat = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(mx + mn - 1)); };
const light = (hex) => [1, 3, 5].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0) / 765;

/** Colour value of a declaration inside the first rule whose selector matches. */
function ruleColor(css, sel, prop) {
  const re = new RegExp(`(?:^|[}\\s,])${sel}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'gi'); let m;
  while ((m = re.exec(css))) { const d = new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;}]+)`, 'i').exec(m[1]); if (d) { const v = /var\(\s*(--[\w-]+)/.exec(d[1]); const c = norm(v ? vars(css)[v[1]] : d[1].trim().split(/\s+(?![^(]*\))/).find((t) => norm(t))); if (c) return c; } }
  return null;
}
const vars = (css) => { const o = {}; for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) o[m[1]] = m[2].trim(); return o; };

export function sample({ html = '', css = '', name = 'Sampled look', id = 'site' } = {}) {
  const all = `${[...String(html).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((x) => x[1]).join('\n')}\n${css}`.slice(0, 900000);
  const v = vars(all); const pickVar = (re) => { for (const [k, val] of Object.entries(v)) if (re.test(k)) { const c = norm(val); if (c) return c; } return null; };
  let bg = ruleColor(all, 'body', 'background(?:-color)?') || ruleColor(all, 'html', 'background(?:-color)?') || pickVar(/(^--(?:bg|background|body-bg|color-bg)|background)$/i);
  let text = ruleColor(all, 'body', 'color') || ruleColor(all, 'html', 'color') || pickVar(/(^--(?:text|foreground|ink|fg|body-color)|foreground)$/i);
  let accent = pickVar(/(primary|accent|brand)/i) || ruleColor(all, '(?:button|\\.btn|\\.btn-primary|\\.button)', 'background(?:-color)?') || ruleColor(all, 'a', 'color');
  const freq = new Map(); for (const raw of all.match(HEX) || []) { const c = norm(raw); if (c) freq.set(c, (freq.get(c) || 0) + 1); }
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  if (!bg) bg = ranked.find((c) => sat(c) < 0.25 && (light(c) > 0.85 || light(c) < 0.15)) || '#ffffff';
  if (!text) text = ranked.find((c) => sat(c) < 0.35 && Math.abs(light(c) - light(bg)) > 0.55) || (light(bg) > 0.5 ? '#111111' : '#f2f2f2');
  if (contrast(text, bg) < 3) text = light(bg) > 0.5 ? '#111111' : '#f2f2f2';
  if (!accent || contrast(accent, bg) < 1.6) accent = ranked.find((c) => sat(c) > 0.45 && contrast(c, bg) > 1.8) || (light(bg) > 0.5 ? '#2563eb' : '#7aa2ff');
  let font; const ff = /(?:body|html)[^{]*\{[^}]*?font-family\s*:\s*([^;}]+)/i.exec(all) || /--(?:font|font-sans|font-body|font-family)[\w-]*\s*:\s*([^;}]+)/i.exec(all);
  if (ff) { const first = ff[1].split(',')[0].trim().replace(/^['"]|['"]$/g, ''); if (/^[\w ]{2,40}$/.test(first) && !/^(system-ui|-apple-system|inherit|var)$/i.test(first)) font = `'${first}',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif`; }
  const rad = new Map(); for (const m of all.matchAll(/border-radius\s*:\s*(\d{1,2})px/gi)) rad.set(+m[1], (rad.get(+m[1]) || 0) + 1);
  const radius = [...rad.entries()].filter(([n]) => n > 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;
  const kit = kitFromColors({ id, name, bg, text, accent, font, radius });
  return { kit, found: { bg, text, accent, font: font ? font.split(',')[0].replace(/'/g, '') : null, radius, colors: ranked.slice(0, 8) } };
}
export { norm as normColor, mixHex };
