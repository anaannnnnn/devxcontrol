// Design code generator. Two jobs:
//  1. component(): ready-to-paste UI components (HTML+CSS, Tailwind, or React) built on a theme's design tokens.
//  2. editsToCode(): turns point-and-click edits from the visual editor into validated CSS and a precise text-change list.
// Everything is deterministic and validated, so the code that reaches a repo is exactly what was previewed.
import { tokens, toCss } from './themes.js';

export class DesignError extends Error { constructor(m) { super(m); this.status = 400; } }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Node: [tag, {c: class, tw: tailwind classes, ...attrs}, ...children]. Children are nodes or text.
const N = (tag, a, ...kids) => ({ tag, a: a || {}, kids });
const VOID = new Set(['input', 'img', 'br', 'hr']);
function render(n, fmt, depth = 0) {
  if (typeof n === 'string') return esc(n);
  const { c, tw, ...rest } = n.a; const attrs = Object.entries(rest).map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`));
  const cls = fmt === 'tailwind' ? tw : c; if (cls) attrs.unshift(`class="${esc(cls)}"`);
  const open = `<${n.tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}${VOID.has(n.tag) ? ' />' : '>'}`; if (VOID.has(n.tag)) return open;
  const pad = '  '.repeat(depth + 1); const inline = n.kids.every((k) => typeof k === 'string');
  if (inline) return `${open}${n.kids.map((k) => render(k, fmt)).join('')}</${n.tag}>`;
  return `${open}\n${n.kids.map((k) => pad + render(k, fmt, depth + 1)).join('\n')}\n${'  '.repeat(depth)}</${n.tag}>`;
}
const jsx = (html) => html.replace(/\bclass=/g, 'className=').replace(/\bfor=/g, 'htmlFor=').replace(/\b(tabindex|maxlength|autocomplete|readonly)=/g, (m, k) => ({ tabindex: 'tabIndex', maxlength: 'maxLength', autocomplete: 'autoComplete', readonly: 'readOnly' }[k] + '='));

const BTN_TW = 'inline-flex items-center justify-center gap-2 px-4 py-2 font-semibold rounded-[var(--dx-radius-sm)] bg-[var(--dx-accent)] text-[var(--dx-on-accent)] hover:bg-[var(--dx-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dx-accent)]';
const CARD_TW = 'p-6 rounded-[var(--dx-radius)] border border-[var(--dx-border)] bg-[var(--dx-surface)] text-[var(--dx-text)] shadow-[var(--dx-shadow)]';
const MUTED_TW = 'text-[var(--dx-muted)]';
const INPUT_TW = 'w-full px-3 py-2 rounded-[var(--dx-radius-sm)] border border-[var(--dx-border)] bg-[var(--dx-surface)] text-[var(--dx-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--dx-accent)]';

const BASE_CSS = `.dx-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.6rem 1.1rem;font:600 1rem var(--dx-font);color:var(--dx-on-accent);background:var(--dx-accent);border:0;border-radius:var(--dx-radius-sm);cursor:pointer;text-decoration:none}
.dx-btn:hover{background:var(--dx-accent-hover)}.dx-btn:focus-visible,.dx-input:focus-visible{outline:2px solid var(--dx-accent);outline-offset:2px}
.dx-btn.ghost{background:transparent;color:var(--dx-accent);box-shadow:inset 0 0 0 1.5px var(--dx-accent)}
.dx-card{padding:1.5rem;background:var(--dx-surface);color:var(--dx-text);border:1px solid var(--dx-border);border-radius:var(--dx-radius);box-shadow:var(--dx-shadow)}
.dx-muted{color:var(--dx-muted)}.dx-input{width:100%;padding:.6rem .8rem;font:inherit;color:var(--dx-text);background:var(--dx-surface);border:1px solid var(--dx-border);border-radius:var(--dx-radius-sm)}
.dx-label{display:grid;gap:.35rem;font-weight:600}.dx-stack{display:grid;gap:1rem}.dx-row{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center}`;

export const COMPONENTS = {
  button: { label: 'Buttons', css: '', make: (o) => N('div', { c: 'dx-row', tw: 'flex flex-wrap gap-3 items-center' }, N('button', { c: 'dx-btn', tw: BTN_TW, type: 'button' }, o.text || 'Get started'), N('button', { c: 'dx-btn ghost', tw: `${BTN_TW} !bg-transparent !text-[var(--dx-accent)] shadow-[inset_0_0_0_1.5px_var(--dx-accent)]`, type: 'button' }, 'Learn more')) },
  card: { label: 'Card', css: '', make: (o) => N('article', { c: 'dx-card dx-stack', tw: `${CARD_TW} grid gap-3 max-w-sm` }, N('h3', { tw: 'text-xl font-bold' }, o.text || 'Plan your week'), N('p', { c: 'dx-muted', tw: MUTED_TW }, 'A short description that explains this card in a sentence or two.'), N('a', { c: 'dx-btn', tw: BTN_TW, href: '#' }, 'Open')) },
  navbar: { label: 'Navigation bar', css: '.dx-nav{display:flex;align-items:center;gap:1.25rem;padding:.9rem 1.25rem;background:var(--dx-surface);border-bottom:1px solid var(--dx-border)}.dx-nav b{margin-right:auto;font-size:1.15rem}.dx-nav a{color:var(--dx-text);text-decoration:none}.dx-nav a:hover{color:var(--dx-accent)}', make: (o) => N('nav', { c: 'dx-nav', tw: 'flex items-center gap-5 px-5 py-3.5 bg-[var(--dx-surface)] border-b border-[var(--dx-border)]', 'aria-label': 'Main' }, N('b', { tw: 'mr-auto text-lg font-bold' }, o.text || 'Brand'), N('a', { href: '#', tw: 'text-[var(--dx-text)] hover:text-[var(--dx-accent)]' }, 'Home'), N('a', { href: '#', tw: 'text-[var(--dx-text)] hover:text-[var(--dx-accent)]' }, 'Pricing'), N('a', { href: '#', tw: 'text-[var(--dx-text)] hover:text-[var(--dx-accent)]' }, 'Contact'), N('a', { c: 'dx-btn', tw: BTN_TW, href: '#' }, 'Sign in')) },
  hero: { label: 'Hero section', css: '.dx-hero{padding:4rem 1.5rem;text-align:center;display:grid;gap:1rem;justify-items:center}.dx-hero h1{font-size:clamp(2rem,6vw,3.5rem);line-height:1.1;margin:0;max-width:18ch}.dx-hero p{max-width:52ch;margin:0}', make: (o) => N('section', { c: 'dx-hero', tw: 'px-6 py-16 text-center grid gap-4 justify-items-center' }, N('h1', { tw: 'text-4xl sm:text-6xl font-bold leading-tight max-w-[18ch]' }, o.text || 'Build something people love'), N('p', { c: 'dx-muted', tw: `${MUTED_TW} max-w-[52ch]` }, 'One clear sentence that says what this is and who it is for.'), N('div', { c: 'dx-row', tw: 'flex gap-3 flex-wrap justify-center' }, N('a', { c: 'dx-btn', tw: BTN_TW, href: '#' }, 'Get started'), N('a', { c: 'dx-btn ghost', tw: `${BTN_TW} !bg-transparent !text-[var(--dx-accent)] shadow-[inset_0_0_0_1.5px_var(--dx-accent)]`, href: '#' }, 'See how it works'))) },
  form: { label: 'Contact form', css: '', make: (o) => N('form', { c: 'dx-card dx-stack', tw: `${CARD_TW} grid gap-4 max-w-md`, action: '#', method: 'post' }, N('h3', { tw: 'text-xl font-bold' }, o.text || 'Contact us'), N('label', { c: 'dx-label', tw: 'grid gap-1 font-semibold', for: 'name' }, 'Name', N('input', { id: 'name', name: 'name', c: 'dx-input', tw: INPUT_TW, autocomplete: 'name', required: true })), N('label', { c: 'dx-label', tw: 'grid gap-1 font-semibold', for: 'email' }, 'Email', N('input', { id: 'email', name: 'email', type: 'email', c: 'dx-input', tw: INPUT_TW, autocomplete: 'email', required: true })), N('label', { c: 'dx-label', tw: 'grid gap-1 font-semibold', for: 'msg' }, 'Message', N('textarea', { id: 'msg', name: 'message', rows: '4', c: 'dx-input', tw: INPUT_TW })), N('button', { c: 'dx-btn', tw: BTN_TW, type: 'submit' }, 'Send message')) },
  pricing: { label: 'Pricing cards', css: '.dx-grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}.dx-price{font-size:2rem;font-weight:800}', make: () => N('div', { c: 'dx-grid', tw: 'grid gap-4 grid-cols-[repeat(auto-fit,minmax(210px,1fr))]' }, ...[['Starter', '$0'], ['Pro', '$19'], ['Team', '$49']].map(([n, p]) => N('article', { c: 'dx-card dx-stack', tw: `${CARD_TW} grid gap-3` }, N('h3', { tw: 'text-lg font-bold' }, n), N('p', { c: 'dx-price', tw: 'text-3xl font-extrabold' }, p, N('small', { c: 'dx-muted', tw: `text-sm font-normal ${MUTED_TW}` }, ' / month')), N('a', { c: 'dx-btn', tw: BTN_TW, href: '#' }, 'Choose')))) },
  alert: { label: 'Alert banner', css: '.dx-alert{padding:.9rem 1.1rem;border-radius:var(--dx-radius-sm);border:1px solid var(--dx-accent);background:var(--dx-surface);color:var(--dx-text)}', make: (o) => N('div', { c: 'dx-alert', tw: 'px-4 py-3.5 rounded-[var(--dx-radius-sm)] border border-[var(--dx-accent)] bg-[var(--dx-surface)] text-[var(--dx-text)]', role: 'status' }, N('b', {}, 'Heads up. '), o.text || 'Your changes were saved.') },
  table: { label: 'Data table', css: '.dx-table{width:100%;border-collapse:collapse}.dx-table th,.dx-table td{padding:.7rem .9rem;text-align:left;border-bottom:1px solid var(--dx-border)}.dx-table th{color:var(--dx-muted);font-size:.8rem;letter-spacing:.06em;text-transform:uppercase}', make: () => N('table', { c: 'dx-table', tw: 'w-full border-collapse' }, N('thead', {}, N('tr', {}, ...['Name', 'Status', 'Updated'].map((h) => N('th', { tw: `p-3 text-left text-xs uppercase tracking-wider ${MUTED_TW} border-b border-[var(--dx-border)]` }, h)))), N('tbody', {}, ...[['Website', 'Live', 'Today'], ['Booking', 'Draft', 'Yesterday']].map((r) => N('tr', {}, ...r.map((c) => N('td', { tw: 'p-3 border-b border-[var(--dx-border)]' }, c)))))) },
};
export const FORMATS = ['html', 'tailwind', 'react'];

export function component(kind, format, theme, opts = {}) {
  const def = COMPONENTS[kind]; if (!def) throw new DesignError('Unknown component.'); if (!FORMATS.includes(format)) throw new DesignError('Unknown format.');
  const o = { text: String(opts.text || '').slice(0, 60) };
  const tree = def.make(o); const html = render(tree, format === 'tailwind' ? 'tailwind' : 'html');
  const tk = Object.entries(tokens(theme)).map(([k, v]) => `  ${k}: ${v};`).join('\n'); const root = `:root {\n${tk}\n}`;
  const css = `${root}\n\n${BASE_CSS}${def.css ? `\n${def.css}` : ''}`;
  let code;
  if (format === 'tailwind') code = `<!-- Add this once (for example in your main CSS) so the theme variables exist -->\n<style>\n${root}\n</style>\n\n${html}`;
  else if (format === 'react') code = `// ${def.label}.jsx\nimport './${def.label.replace(/\W+/g, '')}.css';\n\nexport default function ${def.label.replace(/\W+/g, '')}() {\n  return (\n    ${jsx(html).split('\n').join('\n    ')}\n  );\n}\n\n/* ${def.label.replace(/\W+/g, '')}.css */\n${css}`;
  else code = `<style>\n${css}\n</style>\n\n${html}`;
  const preview = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${toCss(theme, { elements: false })}\nbody{margin:0;padding:24px;background:var(--dx-bg);color:var(--dx-text);font-family:var(--dx-font)}\n${css}</style></head><body>${render(tree, 'html')}</body></html>`;
  return { kind, format, label: def.label, code, preview };
}

/* ---------------- visual edits to code ---------------- */
const SELECTOR = /^[A-Za-z0-9_#.:>\s[\]="'()*+~,-]{1,200}$/;
const LEN = /^-?\d{1,4}(\.\d{1,2})?(px|rem|em|%|vh|vw)?$/;
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[01]?(\.\d+)?\s*)?\)|hsla?\([^;{}()]{3,40}\)|transparent|currentcolor)$/i;
const PROPS = {
  color: COLOR, 'background-color': COLOR, 'border-color': COLOR, 'font-size': LEN, 'line-height': /^(\d{1,2}(\.\d{1,2})?|\d{1,4}(\.\d{1,2})?(px|rem|em|%))$/, 'letter-spacing': LEN,
  'font-weight': /^(100|200|300|400|500|600|700|800|900|normal|bold)$/, 'text-align': /^(left|center|right|justify)$/, 'border-radius': LEN, padding: /^(-?\d{1,4}(\.\d{1,2})?(px|rem|em|%)?\s?){1,4}$/, margin: /^(-?\d{1,4}(\.\d{1,2})?(px|rem|em|%)?|auto)(\s(-?\d{1,4}(\.\d{1,2})?(px|rem|em|%)?|auto)){0,3}$/,
  gap: LEN, width: LEN, 'max-width': LEN, opacity: /^(0|1|0?\.\d{1,2})$/, 'font-style': /^(normal|italic)$/, 'text-decoration': /^(none|underline|line-through)$/, 'text-transform': /^(none|uppercase|lowercase|capitalize)$/,
  'box-shadow': /^(none|[-\d.\spxrgba(),#]{3,80})$/i, 'border-width': LEN, 'border-style': /^(none|solid|dashed|dotted)$/, display: /^(block|inline|inline-block|flex|grid|none)$/,
};
export const EDITABLE = Object.keys(PROPS);

export function checkEdits(edits) {
  if (!Array.isArray(edits) || !edits.length) throw new DesignError('Make at least one change first.');
  if (edits.length > 80) throw new DesignError('Too many changes at once (max 80).');
  const out = [];
  for (const e of edits) {
    const selector = String(e?.selector || '').trim();
    if (!SELECTOR.test(selector) || /[{};<>\\]/.test(selector)) throw new DesignError(`That element cannot be targeted safely: ${selector.slice(0, 50)}`);
    const props = {}; for (const [k, v] of Object.entries(e.props || {})) { const val = String(v).trim().toLowerCase() === 'transparent' ? 'transparent' : String(v).trim(); if (!PROPS[k]) throw new DesignError(`${k} cannot be edited here.`); if (!PROPS[k].test(val)) throw new DesignError(`${val.slice(0, 30)} is not a valid value for ${k}.`); props[k] = val; }
    const text = e.text === undefined || e.text === null ? undefined : String(e.text).slice(0, 500); if (text !== undefined && /[<>]/.test(text)) throw new DesignError('Text changes cannot contain HTML tags.');
    if (!Object.keys(props).length && text === undefined) continue;
    out.push({ selector, props, ...(text !== undefined ? { text, before: String(e.before || '').slice(0, 500) } : {}) });
  }
  if (!out.length) throw new DesignError('Make at least one change first.');
  return out;
}

/** Validated edits to code. css = a stylesheet; tailwind = per-element class hints; textChanges = exact before/after list. */
export function editsToCode(edits) {
  const list = checkEdits(edits);
  const merged = new Map(); for (const e of list) { if (Object.keys(e.props).length) merged.set(e.selector, { ...(merged.get(e.selector) || {}), ...e.props }); }
  const css = ['/* Visual edits - generated by DevX Control */', ...[...merged].map(([sel, p]) => `${sel} {\n${Object.entries(p).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`)].join('\n\n') + '\n';
  const tailwind = [...merged].map(([sel, p]) => ({ selector: sel, classes: Object.entries(p).map(([k, v]) => { const x = v.replace(/\s+/g, '_'); return TWKEY[k] ? `${TWKEY[k]}-[${TWTYPE[k] ? `${TWTYPE[k]}:` : ''}${x}]` : `[${k}:${x}]`; }).join(' ') }));
  const textChanges = list.filter((e) => e.text !== undefined).map((e) => ({ selector: e.selector, before: e.before, after: e.text }));
  return { css, tailwind, textChanges, count: list.length };
}
const TWTYPE = { color: 'color', 'background-color': 'color', 'border-color': 'color', 'font-size': 'length' };
const TWKEY = { color: 'text', 'background-color': 'bg', 'font-size': 'text', 'border-radius': 'rounded', padding: 'p', margin: 'm', gap: 'gap', width: 'w', 'max-width': 'max-w', opacity: 'opacity', 'letter-spacing': 'tracking', 'line-height': 'leading', 'border-color': 'border' };
