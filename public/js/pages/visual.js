// Visual editor: your real, running app in a frame. Browse every page like a visitor, switch to Select, click anything, then
//  - Style: change colors, text and spacing,
//  - Components: pick from millions of navigation / hero / table / button / card / form / footer designs built from the page's own content,
//  - Theme: restyle the whole project from hundreds of themes (curated, generated, online libraries) with a live preview.
// Everything is previewed live. Nothing reaches the site until you send it to Autopilot and approve the review.
import { h, clear, icon, toast, modal, actionBtn, copy } from '../ui.js';
import { api } from '../api.js';
import { KINDS, kindFor, variantCount, paramsFromSeed, render, extractContent, contentPool, mapContent, previewDoc, SURFACES, surfaceCss, PALETTES } from '../lib/components.js';
import { LOOKS, FAMILIES, buildLookCss, lookThumb, lookTokens } from '../lib/looks.js';
import { BLOCKS, BLOCK_GROUPS, blockPreviewDoc, SAMPLE } from '../lib/blocks.js';

const hex = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c || ''); if (!m || (m[4] !== undefined && +m[4] === 0)) return '#ffffff'; return `#${[1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, '0')).join('')}`; };
const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0; };
const themeVars = (t) => `--dx-surface:${t.surface};--dx-text:${t.text};--dx-muted:${t.muted};--dx-border:color-mix(in srgb,${t.text} 16%,${t.bg});--dx-accent:${t.accent};--dx-on-accent:#fff;--dx-bg:${t.bg};`;

export function visualEditor({ id, isAdmin, canApply }) {
  const root = h('div', { class: 've' });
  const edits = new Map(); const comps = new Map(); // style edits by selector; component swaps by selector
  let sel = null; let frame = null; let ready = false; let selectMode = false; let device = 'desktop'; let tab = 'looks'; let editSub = 'replace'; let lookFamily = 'All'; let blockGroup = 'All';
  // Tokens of the currently-applied Look (or a neutral default), so Block previews match the live app.
  const lookVars = () => { const id = comps.get('look')?.look; const l = id && LOOKS.find((x) => x.id === id); return l ? lookTokens(l) : '--dx-accent:#6366f1;--dx-on-accent:#fff;--dx-surface:#ffffff;--dx-text:#0f172a;--dx-muted:#64748b;--dx-bg:#f6f8fb;--dx-border:#e5e7eb;--dx-radius:14px'; };
  let base = ''; let curPath = '/'; let pages = ['/']; const seen = new Set(['/']);
  let live = null; // { theme, strength, accent, stylesheet, css, js }
  const post = (m) => { try { frame?.contentWindow?.postMessage(m, '*'); } catch { /* frame gone */ } };
  const clean = (s) => String(s || '').split(base).join('').replace(/\sdata-dx-[a-z]+(="[^"]*")?/g, '');
  const countEdits = () => [...edits.values()].reduce((n, e) => n + Object.keys(e.props).length + (e.text !== undefined ? 1 : 0), 0) + comps.size;

  const panel = h('aside', { class: 'panel ve-panel' }); const stage = h('div', { class: 've-stage' }); const summary = h('div', { class: 've-sum' });
  const pathIn = h('input', { class: 'field', value: '/', 'aria-label': 'Page path', onkeydown: (e) => { if (e.key === 'Enter') open(pathIn.value); } });
  const pageSel = h('select', { class: 'field', 'aria-label': 'Pages of this app', onchange: (e) => open(e.target.value) });
  const modeBtns = h('div', { class: 'seg', role: 'group', 'aria-label': 'Mode' }, ...[['browse', 'Browse'], ['select', 'Select']].map(([k, l]) => h('button', { 'aria-pressed': String(k === 'select' ? selectMode : !selectMode), 'data-m': k, onclick: () => setMode(k === 'select') }, l)));
  function setMode(on) { selectMode = on; modeBtns.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.m === 'select') === on))); post({ dx: 'mode', on }); paintPanel(); }
  function paintPages() { clear(pageSel); const all = [...new Set([...pages, ...seen])].sort((a, b) => a.length - b.length || a.localeCompare(b)); for (const p of all) pageSel.append(h('option', { value: p, selected: p === curPath }, p)); if (!all.includes(curPath)) pageSel.prepend(h('option', { value: curPath, selected: true }, curPath)); }

  async function open(p = '/') {
    ready = false; sel = null; paintPanel(); const want = p.startsWith('/') ? p : `/${p}`;
    try { const r = await api(`/apps/${id}/view-token`, { method: 'POST', body: { path: want } }); base = r.base; curPath = want; pathIn.value = want; frame.src = r.url; paintPages(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  const reload = () => { if (base && frame) { ready = false; frame.src = `${base}${curPath === '/' ? '' : curPath}`; } };
  function frameEl() { frame = h('iframe', { class: 've-frame', title: 'App preview', sandbox: 'allow-scripts allow-forms allow-modals', referrerpolicy: 'no-referrer' }); clear(stage).append(frame); stage.dataset.device = device; }

  function reapply() {
    post({ dx: 'mode', on: selectMode });
    for (const [selector, e] of edits) post({ dx: 'apply', selector, props: e.props, text: e.text });
    if (live?.stylesheet) post({ dx: 'links', id: 'theme', href: live.stylesheet });
    if (live?.css) post({ dx: 'css', id: 'theme', css: live.css });
    if (live?.js) post({ dx: 'js', code: live.js });
    for (const [selector, c] of comps) { post({ dx: 'css', id: `c-${c.id}`, css: c.css }); post({ dx: 'html', selector, html: c.html, selectNew: false }); }
  }
  window.addEventListener('message', onMsg);
  function onMsg(ev) {
    if (!frame || ev.source !== frame.contentWindow) return; const m = ev.data || {};
    if (m.dx === 'ready') { ready = true; if (m.path) curPath = m.path.split('?')[0]; reapply(); paintPanel(); }
    if (m.dx === 'nav') { curPath = m.path.split('?')[0]; seen.add(curPath); for (const l of m.links || []) seen.add(l); pathIn.value = curPath; paintPages(); }
    if (m.dx === 'select' && typeof m.selector === 'string') { sel = { selector: m.selector, tag: m.tag, kind: m.kind, comp: m.comp, text: m.text, styles: m.styles || {}, html: m.html, classes: m.classes, size: m.size }; tab = 'edit'; editSub = m.comp && kindFor(m.comp.kind) ? 'replace' : 'style'; paintPanel(); }
  }
  const observer = new MutationObserver(() => { if (!root.isConnected) { window.removeEventListener('message', onMsg); observer.disconnect(); } }); observer.observe(document.body, { childList: true, subtree: true });

  /* ---------------------------------- Style tab ---------------------------------- */
  // "Apply to all like this": changes target every element that shares the selected one's tag or first class.
  let applyAll = false; let motionDur = '.6s'; const groups = new Map(); // group selector -> accumulated props
  const idOf = (s) => s.replace(/[^a-z0-9]/gi, '').slice(0, 40) || 'x';
  function groupSelector() { const cls = (sel.classes || '').split(/\s+/).find((c) => c && !/^dx-|^\d|[:/[\]]/.test(c)); return cls ? `.${cls}` : sel.tag; }
  function setGroupProp(k, v) { const gs = groupSelector(); const g = groups.get(gs) || { props: {} }; g.props[k] = v; groups.set(gs, g); const css = `${gs}{${Object.entries(g.props).map(([a, b]) => `${a}:${b} !important`).join(';')}}`; const id = `grp-${idOf(gs)}`; post({ dx: 'css', id, css }); comps.set(`grp::${gs}`, { id, css, html: '', from: '', group: gs }); paintSummary(); }
  const ed = () => { if (!edits.has(sel.selector)) edits.set(sel.selector, { props: {}, orig: {}, ...(sel.text !== null ? { before: sel.text } : {}) }); return edits.get(sel.selector); };
  function setProp(k, v) { if (applyAll) { setGroupProp(k, v); return; } const e = ed(); if (!(k in e.orig)) e.orig[k] = sel.styles[k]; e.props[k] = v; post({ dx: 'apply', selector: sel.selector, props: { [k]: v } }); paintSummary(); }
  function setText(t) { const e = ed(); e.text = t; post({ dx: 'apply', selector: sel.selector, text: t }); paintSummary(); }
  const color = (k, label) => h('label', { class: 've-row' }, h('span', {}, label), h('input', { type: 'color', value: edits.get(sel.selector)?.props[k] || hex(sel.styles[k]), 'aria-label': label, oninput: (e) => setProp(k, e.target.value) }));
  const num = (k, label, { min = 0, max = 200, unit = 'px', step = 1 } = {}) => { const cur = edits.get(sel.selector)?.props[k]; const val = cur ? px(cur) : px(sel.styles[k]); const out = h('output', {}, `${val}${unit}`); return h('label', { class: 've-row' }, h('span', {}, label), h('input', { type: 'range', min, max, step, value: val, 'aria-label': label, oninput: (e) => { out.textContent = `${e.target.value}${unit}`; setProp(k, `${e.target.value}${unit}`); } }), out); };
  const choice = (k, label, opts) => h('label', { class: 've-row' }, h('span', {}, label), h('select', { class: 'field', 'aria-label': label, onchange: (e) => setProp(k, e.target.value) }, ...opts.map((o) => h('option', { value: Array.isArray(o) ? o[1] : o, selected: (edits.get(sel.selector)?.props[k] || sel.styles[k]) === (Array.isArray(o) ? o[1] : o) }, Array.isArray(o) ? o[0] : o))));
  const FONT_FAMILIES = [['Default', ''], ['Inter', "'Inter',system-ui,sans-serif"], ['Sora', "'Sora',system-ui,sans-serif"], ['Poppins', "'Poppins',system-ui,sans-serif"], ['DM Sans', "'DM Sans',system-ui,sans-serif"], ['Georgia (serif)', 'Georgia,serif'], ['Playfair', "'Playfair Display',serif"], ['JetBrains Mono', "'JetBrains Mono',ui-monospace,monospace"], ['System', 'system-ui,-apple-system,sans-serif']];
  const SHADOW_PRESETS = [['None', 'none'], ['Subtle', '0 1px 2px rgba(0,0,0,.08)'], ['Soft', '0 8px 24px rgba(0,0,0,.14)'], ['Medium', '0 12px 32px rgba(0,0,0,.18)'], ['Large', '0 18px 50px rgba(0,0,0,.28)'], ['Glow', '0 0 0 3px rgba(124,58,237,.3)'], ['Inset', 'inset 0 2px 6px rgba(0,0,0,.2)']];
  const TRANSITIONS = [['None', 'none'], ['Fast', 'all .15s ease'], ['Smooth', 'all .3s ease'], ['Spring', 'all .4s cubic-bezier(.22,1,.36,1)']];
  const blur = () => { const out = h('output', {}, '0px'); return h('label', { class: 've-row' }, h('span', {}, 'Backdrop blur'), h('input', { type: 'range', min: 0, max: 40, value: 0, 'aria-label': 'Backdrop blur', oninput: (e) => { out.textContent = `${e.target.value}px`; setProp('backdrop-filter', e.target.value === '0' ? 'none' : `blur(${e.target.value}px)`); } }), out); };
  const gradient = () => { const st = { a: '#7c3aed', b: '#36d1ff', ang: 135 }; const apply = () => setProp('background-image', `linear-gradient(${st.ang}deg,${st.a},${st.b})`); return h('div', { class: 've-row' }, h('span', {}, 'Gradient'), h('div', { class: 'row', style: { gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, h('input', { type: 'color', value: st.a, 'aria-label': 'Gradient start', oninput: (e) => { st.a = e.target.value; apply(); } }), h('input', { type: 'color', value: st.b, 'aria-label': 'Gradient end', oninput: (e) => { st.b = e.target.value; apply(); } }), h('input', { type: 'range', min: 0, max: 360, value: st.ang, 'aria-label': 'Gradient angle', style: { width: '70px' }, oninput: (e) => { st.ang = +e.target.value; apply(); } }), h('button', { class: 'btn sm ghost', onclick: () => setProp('background-image', 'none') }, 'Clear'))); };
  const group = (title, open, kids) => { const a = { class: 've-group' }; if (open) a.open = true; return h('details', a, h('summary', {}, title), h('div', { class: 've-group-body stack', style: { gap: '6px' } }, ...kids)); };
  function styleTab(box) {
    if (!sel) { box.append(h('p', { class: 'muted small' }, ready ? (selectMode ? 'Click any text, button, image or box on the page.' : 'You are browsing. Click Select above, then click an element to change it.') : 'Loading the page ...')); return; }
    box.append(h('p', { class: 'mono small muted ve-sel' }, `<${sel.tag}> ${sel.kind}  ${sel.selector}`));
    box.append(h('label', { class: 've-all' }, h('input', { type: 'checkbox', checked: applyAll || null, 'aria-label': 'Apply to all like this', onchange: (e) => { applyAll = e.target.checked; paintPanel(); } }), h('span', {}, 'Apply to all ', h('b', {}, `like this (${groupSelector()})`), ' — every matching element on the page')));
    if (sel.text !== null && !applyAll) { const t = h('textarea', { class: 'sql', rows: 2, 'aria-label': 'Text', oninput: (e) => setText(e.target.value) }); t.value = edits.get(sel.selector)?.text ?? sel.text; box.append(h('label', { class: 'lbl small' }, 'Text', t)); }
    box.append(
      group('Typography', true, [
        h('label', { class: 've-row' }, h('span', {}, 'Font'), h('select', { class: 'field', 'aria-label': 'Font family', onchange: (e) => setProp('font-family', e.target.value) }, ...FONT_FAMILIES.map(([n, v]) => h('option', { value: v }, n)))),
        num('font-size', 'Size', { min: 8, max: 120 }), choice('font-weight', 'Weight', ['300', '400', '500', '600', '700', '800', '900']),
        choice('text-align', 'Align', ['left', 'center', 'right', 'justify']), choice('text-transform', 'Case', ['none', 'uppercase', 'lowercase', 'capitalize']),
        num('letter-spacing', 'Letter spacing', { min: -3, max: 12, step: 0.2 }), num('line-height', 'Line height', { min: 0.8, max: 3, step: 0.05, unit: '' }), color('color', 'Text color'),
      ]),
      group('Background & color', false, [color('background-color', 'Background'), gradient(), num('opacity', 'Opacity', { min: 0, max: 1, step: 0.05, unit: '' })]),
      group('Border', false, [num('border-radius', 'Roundness', { max: 80 }), num('border-width', 'Border width', { max: 16 }), choice('border-style', 'Border style', ['none', 'solid', 'dashed', 'dotted', 'double']), color('border-color', 'Border color')]),
      group('Spacing & layout', false, [num('padding', 'Padding', { max: 120 }), num('margin', 'Margin', { max: 120 }), choice('display', 'Display', ['block', 'flex', 'inline-flex', 'grid', 'inline-block', 'inline', 'none']), choice('justify-content', 'Justify', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around']), choice('align-items', 'Align items', ['stretch', 'flex-start', 'center', 'flex-end']), num('gap', 'Gap', { max: 80 })]),
      group('Effects', false, [h('label', { class: 've-row' }, h('span', {}, 'Shadow'), h('select', { class: 'field', 'aria-label': 'Shadow', onchange: (e) => setProp('box-shadow', e.target.value) }, ...SHADOW_PRESETS.map(([n, v]) => h('option', { value: v }, n)))), blur(), h('label', { class: 've-row' }, h('span', {}, 'Transition'), h('select', { class: 'field', 'aria-label': 'Transition', onchange: (e) => setProp('transition', e.target.value) }, ...TRANSITIONS.map(([n, v]) => h('option', { value: v }, n)))), choice('cursor', 'Cursor', ['auto', 'pointer', 'default', 'not-allowed'])]),
    );
    box.append(h('b', { class: 'small' }, 'Quick looks for this box'), h('div', { class: 'row wrap', style: { gap: '6px' } }, ...SURFACES.map((s) => h('button', { class: 'btn sm', onclick: () => { const c = surfaceCss(sel.selector, s, { palette: live?.theme ? 'theme' : 'theme' }); post({ dx: 'css', id: `s-${s}-${comps.size}`, css: c }); const key = `${sel.selector}::surface`; comps.set(key, { id: `s${comps.size}-${s}`, css: c, html: '', from: '', surface: true }); paintSummary(); } }, s))));
    const mine = edits.get(sel.selector);
    if (mine) box.append(h('button', { class: 'btn sm ghost danger', onclick: () => { post({ dx: 'undo', selector: sel.selector, props: Object.keys(mine.props), text: mine.before }); edits.delete(sel.selector); paintSummary(); paintPanel(); } }, 'Undo changes to this element'));
  }

  /* ------------------------------- Components tab ------------------------------- */
  const G = { kind: null, seed: 1, params: null, picked: null, page: 0 };
  function targetOf() {
    const c = sel?.comp;
    if (c) return { selector: c.selector, kind: kindFor(c.kind) || null, html: c.html };
    if (sel) return { selector: sel.selector, kind: kindFor(sel.kind) || null, html: sel.html || '' };
    return null;
  }
  function componentsTab(box) {
    const tg = targetOf();
    const pool = tg && tg.html ? contentPool(clean(tg.html)) : SAMPLE;
    // ---- Curated library (21st-style finished blocks, filled from the section's own text, styled by the active Look) ----
    box.append(h('p', { class: 've-help' }, tg ? `Replace this ${tg.kind || 'section'} — blocks reuse its text and match your current Look.` : 'Browse finished sections. Select something on the page to swap it.'));
    box.append(h('div', { class: 've-fams', role: 'group', 'aria-label': 'Block type' }, ...['All', ...BLOCK_GROUPS].map((g) => h('button', { class: `ve-fam${blockGroup === g ? ' on' : ''}`, onclick: () => { blockGroup = g; paintPanel(); } }, g))));
    const vars = lookVars();
    const list = blockGroup === 'All' ? BLOCKS : BLOCKS.filter((b) => b.group === blockGroup);
    const active = comps.get(tg?.selector)?.block;
    const gal = h('div', { class: 've-blocks', role: 'list' });
    for (const b of list) { const d = b.build(pool, `dxb-${b.id}`); gal.append(h('button', { class: `ve-block${active === b.id ? ' on' : ''}`, role: 'listitem', 'aria-pressed': String(active === b.id), onclick: () => pickBlock(b, d, tg) }, h('div', { class: 've-block-box' }, h('iframe', { title: '', sandbox: '', srcdoc: blockPreviewDoc(d, vars), loading: 'lazy' })), h('div', { class: 've-block-cap' }, h('b', {}, b.name), h('span', { class: 'muted small' }, b.group)))); }
    box.append(gal);
    // ---- Generated variations (the parametric engine: millions per kind, same text) ----
    box.append(h('details', { class: 've-group' }, h('summary', {}, 'Generate variations (millions, same text)'), (() => { const gb = h('div', { class: 've-group-body stack', style: { gap: '8px' } }); generatedGallery(gb, tg, pool); return gb; })()));
    if ([...comps.keys()].some((kk) => comps.get(kk)?.block || comps.get(kk)?.kind)) box.append(h('button', { class: 'btn sm ghost danger', onclick: () => { for (const kk of [...comps.keys()]) { const c = comps.get(kk); if (c?.block || c?.kind) { post({ dx: 'uncss', id: `c-${c.id}` }); comps.delete(kk); } } reload(); paintSummary(); paintPanel(); } }, 'Undo all swaps'));
  }
  function generatedGallery(box, tg, pool) {
    const kind = G.kind || tg?.kind || 'hero'; if (G.kind !== kind) { G.kind = kind; G.seed = 1; G.params = null; G.picked = null; }
    const content = pool ? mapContent(kind, pool) : {};
    const vars = live?.theme ? themeVars(live.theme) : lookVars();
    box.append(h('select', { class: 'field', 'aria-label': 'Kind', onchange: (e) => { G.kind = e.target.value; G.seed = 1; G.params = null; G.picked = null; paintPanel(); } }, ...Object.entries(KINDS).map(([k, v]) => h('option', { value: k, selected: k === kind }, `${v.label}  (${variantCount(k).toLocaleString()} designs)`))));
    const gal = h('div', { class: 'gal', role: 'list' });
    const designs = Array.from({ length: 8 }, (_, i) => { const p = G.params ? { ...G.params, ...(i ? paramsFromSeed(kind, G.seed * 977 + i * 131) : {}) } : paramsFromSeed(kind, G.seed * 977 + i * 131); return render(kind, i === 0 && G.params ? G.params : p, content); });
    for (const d of designs) gal.append(h('button', { class: 'gal-item', role: 'listitem', 'aria-label': `Use this ${KINDS[kind].label} design`, 'aria-pressed': String(G.picked?.id === d.id), onclick: () => pick(d, tg, content) }, h('div', { class: 'gal-box' }, h('iframe', { title: '', sandbox: '', srcdoc: previewDoc(d, vars), loading: 'lazy' }))));
    box.append(gal, h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'btn sm', onclick: () => { G.seed = Math.floor(Math.random() * 1e6) + 1; G.params = null; paintPanel(); } }, icon('refresh', 14), 'Shuffle'), h('button', { class: 'btn sm', onclick: () => { G.seed++; G.params = null; paintPanel(); } }, 'More'), h('span', { class: 'grow' }), h('span', { class: 'muted small' }, `${variantCount(kind).toLocaleString()} possible`)));
    const cur = G.picked || designs[0]; const ax = KINDS[kind].axes;
    box.append(h('b', { class: 'small' }, 'Fine tune'), h('div', { class: 've-axes' }, ...Object.entries(ax).map(([k, v]) => { const n = typeof v === 'number' ? v : v.length; return h('label', {}, k, h('select', { class: 'field', 'aria-label': k, onchange: (e) => { const val = typeof v === 'number' ? +e.target.value : (typeof v[0] === 'number' ? +e.target.value : e.target.value); G.params = { ...cur.params, [k]: val }; const d = render(kind, G.params, content); pick(d, tg, content, true); paintPanel(); } }, ...Array.from({ length: n }, (_, i) => { const val = typeof v === 'number' ? i : v[i]; return h('option', { value: val, selected: String(cur.params[k]) === String(val) }, typeof v === 'number' && k === 'hue' ? `${i * 15}°` : String(val)); }))); })));
  }
  function swapInto(tg, id, css, html, extra) {
    if (!tg) { toast('Select a section on the page first, then pick a design.', 'info'); return false; }
    const prev = comps.get(tg.selector); const before = prev ? prev.from : clean(tg.html);
    post({ dx: 'css', id: `c-${id}`, css }); post({ dx: 'html', selector: prev ? `.${prev.id}` : tg.selector, html, selectNew: false });
    comps.set(tg.selector, { id, css, html, from: before, kind: tg.kind, selector: tg.selector, ...extra }); return true;
  }
  function pick(d, tg, content, quiet) { G.picked = d; G.params = d.params; if (swapInto(tg, d.id, d.css, d.html, { kind: d.kind }) && !quiet) { paintSummary(); paintPanel(); } else paintSummary(); }
  function pickBlock(b, d, tg) { if (swapInto(tg, `dxb-${b.id}`, d.css, d.html, { block: b.id, kind: tg?.kind })) { toast(`${b.name} applied`, 'ok'); paintSummary(); paintPanel(); } }

  /* ---------------------------------- Theme tab ---------------------------------- */
  const T = { q: '', mode: '', pack: '', items: [], total: 0, packs: [], sources: [], offset: 0, strength: 'full', accent: '', loading: false, gen: { hue: 250, style: 'soft', mode: 'dark' }, sheets: null, report: null, genStyles: ['soft'] };
  async function loadThemes(reset = true) {
    if (reset) { T.offset = 0; T.items = []; } T.loading = true;
    try { const qs = new URLSearchParams({ q: T.q, mode: T.mode, pack: T.pack, offset: String(T.offset), limit: '48' }); const r = await api(`/themes/lab?${qs}`); T.items = reset ? r.items : [...T.items, ...r.items]; T.total = r.total; T.packs = r.packs; T.sources = r.sources; T.genStyles = r.genStyles; T.offset = T.items.length; } catch (e) { toast(e.message, 'bad'); }
    T.loading = false; if (tab === 'theme') paintPanel();
  }
  async function livePreview(opts) {
    try {
      const qs = new URLSearchParams(opts.stylesheet ? { stylesheet: opts.stylesheet } : { theme: opts.theme, strength: T.strength, ...(T.accent ? { accent: T.accent } : {}) }); const r = await api(`/apps/${id}/theme/preview?${qs}`);
      const hadJs = !!live?.js; live = { ...opts, css: r.css, js: r.js, stylesheet: r.stylesheet || '', theme: r.theme || live?.theme }; T.report = r.report || null;
      if (hadJs || r.js || opts.stylesheet) reload(); else { post({ dx: 'links', id: 'theme', href: '' }); post({ dx: 'css', id: 'theme', css: r.css }); }
      paintSummary(); paintPanel();
    } catch (e) { toast(e.message, 'bad'); }
  }
  const swatch = (t) => h('button', { class: 'thm', 'aria-pressed': String(live?.theme?.id === t.id && !live.stylesheet), style: { background: t.bg, color: t.text }, title: `${t.name} (${t.pack})`, onclick: () => { T.accent = ''; livePreview({ theme: t.id }); } },
    h('b', {}, t.name), h('span', { class: 'sw' }, ...[t.bg, t.surface, t.text, t.muted, t.accent].map((c) => h('i', { style: { background: c } }))), h('small', {}, `${t.pack} · ${t.mode}`));
  function themeTab(box) {
    if (!T.items.length && !T.loading) loadThemes(); if (!T.sheets) { T.sheets = []; api('/themes/lab/stylesheets').then((r) => { T.sheets = r.stylesheets; if (tab === 'theme') paintPanel(); }).catch(() => {}); }
    box.append(h('p', { class: 've-help' }, 'Pick a theme and the whole page changes right here, on every page you browse. When it looks right, apply it to the whole project.'));
    const q = h('input', { class: 'field', type: 'search', placeholder: `Search ${T.total || ''} themes`, value: T.q, 'aria-label': 'Search themes', onkeydown: (e) => { if (e.key === 'Enter') { T.q = e.target.value; loadThemes(); } } });
    const md = h('select', { class: 'field', 'aria-label': 'Light or dark', onchange: (e) => { T.mode = e.target.value; loadThemes(); } }, ...[['', 'Light and dark'], ['dark', 'Dark'], ['light', 'Light']].map(([v, l]) => h('option', { value: v, selected: T.mode === v }, l)));
    const pk = h('select', { class: 'field', 'aria-label': 'Collection', onchange: (e) => { T.pack = e.target.value; loadThemes(); } }, h('option', { value: '' }, 'All collections'), ...T.packs.map((p) => h('option', { value: p, selected: T.pack === p }, p)));
    box.append(h('div', { class: 'ek' }, q), h('div', { class: 'row', style: { gap: '6px' } }, md, pk));
    box.append(h('div', { class: 'thm-grid' }, ...T.items.map(swatch)), T.items.length < T.total ? h('button', { class: 'btn sm', onclick: () => loadThemes(false) }, `Show more (${T.total - T.items.length} left)`) : null);
    // generator
    const g = T.gen; const gl = h('output', {}, `${g.hue}°`);
    const gen = async () => { try { const t = await api(`/themes/lab/generate?hue=${g.hue}&style=${g.style}&mode=${g.mode}`); T.accent = ''; livePreview({ theme: t.id }); } catch (e) { toast(e.message, 'bad'); } };
    box.append(h('hr'), h('b', { class: 'small' }, 'Make your own (any color, thousands of results)'),
      h('label', { class: 've-row' }, h('span', {}, 'Hue'), h('input', { type: 'range', min: 0, max: 359, value: g.hue, 'aria-label': 'Hue', oninput: (e) => { g.hue = +e.target.value; gl.textContent = `${g.hue}°`; }, onchange: gen }), gl),
      h('div', { class: 'row', style: { gap: '6px' } }, h('select', { class: 'field', 'aria-label': 'Style', onchange: (e) => { g.style = e.target.value; gen(); } }, ...T.genStyles.map((s) => h('option', { value: s, selected: g.style === s }, s))), h('select', { class: 'field', 'aria-label': 'Mode', onchange: (e) => { g.mode = e.target.value; gen(); } }, ...['dark', 'light'].map((s) => h('option', { value: s, selected: g.mode === s }, s))), h('button', { class: 'btn sm', onclick: () => { g.hue = Math.floor(Math.random() * 360); g.style = T.genStyles[Math.floor(Math.random() * T.genStyles.length)]; g.mode = Math.random() > 0.5 ? 'dark' : 'light'; gen(); paintPanel(); } }, icon('refresh', 14), 'Surprise me')));
    // strength + accent
    const strengths = [['soft', 'Soft', 'Light touch. The site keeps its own colors where it sets them.'], ['full', 'Full', 'Every element follows the theme, including Tailwind classes.'], ['total', 'Total', 'Also recolors by script: for sites with custom CSS.']];
    box.append(h('hr'), h('b', { class: 'small' }, 'How strongly'), h('div', { class: 'seg', role: 'group', 'aria-label': 'Strength' }, ...strengths.map(([k, l, d]) => h('button', { title: d, 'aria-pressed': String(T.strength === k), onclick: () => { T.strength = k; if (live?.theme && !live.stylesheet) livePreview({ theme: live.theme.id }); else paintPanel(); } }, l))), h('p', { class: 've-help' }, strengths.find((s) => s[0] === T.strength)[2]),
      h('label', { class: 've-row' }, h('span', {}, 'Accent color'), h('input', { type: 'color', value: T.accent || live?.theme?.accent || '#7c3aed', 'aria-label': 'Accent color', onchange: (e) => { T.accent = e.target.value; if (live?.theme && !live.stylesheet) livePreview({ theme: live.theme.id }); } })));
    if (T.report) box.append(h('div', { class: 'row wrap', style: { gap: '4px' } }, ...T.report.map((r) => h('span', { class: `chip ${r.ok ? 'ok' : 'warn'}`, title: `${r.ratio}:1 (needs ${r.min}:1)` }, `${r.label}: ${r.ok ? 'readable' : 'low contrast'}`))));
    // libraries
    box.append(h('hr'), h('b', { class: 'small' }, 'Online libraries'), h('p', { class: 've-help' }, 'Load hundreds more themes from public libraries. This server downloads them once and keeps a copy.'),
      h('div', { class: 'stack', style: { gap: '6px' } }, ...T.sources.map((s) => h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('span', { class: 'grow small' }, `${s.label}${s.count ? ` · ${s.count} loaded` : ''}`), actionBtn({ ic: 'download', label: s.count ? 'Refresh' : 'Load', cls: 'sm', onClick: async () => { try { const r = await api(`/themes/lab/sources/${s.id}/refresh`, { method: 'POST' }); toast(`${s.label}: ${r.count} themes loaded`, 'ok'); await loadThemes(); } catch (e) { toast(`Could not reach ${s.label}. ${e.message}`, 'bad'); } } })))));
    box.append(h('hr'), h('b', { class: 'small' }, 'Whole stylesheets (Pico, Water, Bootstrap, Bootswatch, ...)'), h('p', { class: 've-help' }, 'These restyle plain HTML, or sites that use that framework\'s class names. Added last so they win.'),
      h('select', { class: 'field', 'aria-label': 'Stylesheet library', onchange: (e) => { if (e.target.value) livePreview({ stylesheet: e.target.value }); } }, h('option', { value: '' }, 'Choose a stylesheet ...'), ...(T.sheets || []).map((s) => h('option', { value: s.id, selected: live?.stylesheet && live.theme === undefined && false }, `${s.name} · ${s.kind}`))));
    const stylesheetId = live?.stylesheet ? (T.sheets || []).find((s) => s.href === live.stylesheet)?.id : null;
    box.append(h('hr'), h('div', { class: 'row wrap', style: { gap: '8px' } },
      isAdmin && canApply && actionBtn({ ic: 'bolt', label: 'Apply to whole project', cls: 'primary', disabled: !live, onClick: async () => { try { await api(`/apps/${id}/theme/apply`, { method: 'POST', body: stylesheetId ? { stylesheet: stylesheetId } : { theme: live.theme.id, strength: T.strength, ...(T.accent ? { accent: T.accent } : {}) } }); toast('Sent to Autopilot. Review it under Reviews, then approve.', 'ok'); } catch (e) { toast(e.message, 'bad'); } } }),
      h('button', { class: 'btn', disabled: !live?.css, onclick: () => copy(live.css, 'CSS copied') }, icon('copy', 14), 'Copy CSS'),
      h('button', { class: 'btn ghost', disabled: !live, onclick: () => { live = null; T.report = null; reload(); paintSummary(); paintPanel(); } }, 'Remove preview')));
  }

  /* ---------------------------------- Motion tab ---------------------------------- */
  // Animation library. Entrance plays once; attention loops; hover reacts to the pointer. All are pure CSS blocks.
  const MOTION = [
    ['Entrance', 'Fade in', (s, d, n) => `@keyframes ${n}{from{opacity:0}to{opacity:1}} ${s}{animation:${n} ${d} both}`],
    ['Entrance', 'Rise up', (s, d, n) => `@keyframes ${n}{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}} ${s}{animation:${n} ${d} cubic-bezier(.22,1,.36,1) both}`],
    ['Entrance', 'Zoom in', (s, d, n) => `@keyframes ${n}{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}} ${s}{animation:${n} ${d} ease both}`],
    ['Entrance', 'Pop', (s, d, n) => `@keyframes ${n}{0%{opacity:0;transform:scale(.9)}60%{transform:scale(1.03)}100%{opacity:1;transform:none}} ${s}{animation:${n} ${d} ease both}`],
    ['Entrance', 'Slide left', (s, d, n) => `@keyframes ${n}{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}} ${s}{animation:${n} ${d} cubic-bezier(.22,1,.36,1) both}`],
    ['Entrance', 'Slide right', (s, d, n) => `@keyframes ${n}{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}} ${s}{animation:${n} ${d} cubic-bezier(.22,1,.36,1) both}`],
    ['Entrance', 'Flip', (s, d, n) => `@keyframes ${n}{from{opacity:0;transform:perspective(600px) rotateX(-18deg)}to{opacity:1;transform:none}} ${s}{animation:${n} ${d} ease both}`],
    ['Entrance', 'Blur in', (s, d, n) => `@keyframes ${n}{from{opacity:0;filter:blur(10px)}to{opacity:1;filter:none}} ${s}{animation:${n} ${d} ease both}`],
    ['Attention', 'Pulse', (s, d, n) => `@keyframes ${n}{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}} ${s}{animation:${n} ${d} ease-in-out infinite}`],
    ['Attention', 'Bounce', (s, d, n) => `@keyframes ${n}{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}} ${s}{animation:${n} ${d} ease-in-out infinite}`],
    ['Attention', 'Float', (s, d, n) => `@keyframes ${n}{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}} ${s}{animation:${n} ${d} ease-in-out infinite}`],
    ['Attention', 'Shake', (s, d, n) => `@keyframes ${n}{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}} ${s}{animation:${n} ${d} ease-in-out infinite}`],
    ['Attention', 'Glow', (s, d, n) => `@keyframes ${n}{0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,0)}50%{box-shadow:0 0 22px 2px rgba(124,58,237,.55)}} ${s}{animation:${n} ${d} ease-in-out infinite}`],
    ['Hover', 'Lift', (s) => `${s}{transition:transform .25s ease,box-shadow .25s ease} ${s}:hover{transform:translateY(-4px);box-shadow:0 14px 34px rgba(0,0,0,.18)}`],
    ['Hover', 'Grow', (s) => `${s}{transition:transform .2s ease} ${s}:hover{transform:scale(1.04)}`],
    ['Hover', 'Glow', (s) => `${s}{transition:box-shadow .25s ease} ${s}:hover{box-shadow:0 0 0 3px rgba(124,58,237,.35),0 8px 26px rgba(124,58,237,.3)}`],
    ['Hover', 'Tilt', (s) => `${s}{transition:transform .25s ease} ${s}:hover{transform:rotate(-2deg) scale(1.02)}`],
    ['Hover', 'Brighten', (s) => `${s}{transition:filter .25s ease} ${s}:hover{filter:brightness(1.12) saturate(1.1)}`],
    ['Hover', 'Underline', (s) => `${s}{position:relative} ${s}::after{content:"";position:absolute;left:0;bottom:-2px;height:2px;width:0;background:currentColor;transition:width .25s ease} ${s}:hover::after{width:100%}`],
  ];
  function applyMotion(label, build) { const target = applyAll ? groupSelector() : sel.selector; const n = `dxk${idOf(target)}${idOf(label)}`; const css = build(target, motionDur, n); const id = `anim-${idOf(target)}`; post({ dx: 'css', id, css }); comps.set(`anim::${target}`, { id, css, html: '', from: '' }); toast(`${label} applied`, 'ok'); paintSummary(); }
  function motionTab(box) {
    if (!sel) { box.append(h('p', { class: 'muted small' }, 'Select an element first (Select mode), then add motion.')); return; }
    box.append(h('p', { class: 've-help' }, `Motion for ${applyAll ? `${groupSelector()} (all matching)` : sel.selector}. Everything is a live preview; it reaches your site only after Autopilot review.`));
    box.append(h('label', { class: 've-row' }, h('span', {}, 'Speed'), h('select', { class: 'field', 'aria-label': 'Speed', onchange: (e) => { motionDur = e.target.value; } }, ...[['Fast', '.4s'], ['Normal', '.6s'], ['Slow', '1s'], ['Very slow', '1.8s']].map(([n, v]) => h('option', { value: v, selected: v === motionDur }, n)))));
    for (const g of ['Entrance', 'Attention', 'Hover']) { box.append(h('b', { class: 'small' }, g), h('div', { class: 'row wrap', style: { gap: '6px' } }, ...MOTION.filter((m) => m[0] === g).map(([, label, build]) => h('button', { class: 'btn sm', onclick: () => applyMotion(label, build) }, label)))); }
    if ([...comps.keys()].some((k) => k.startsWith('anim::'))) box.append(h('button', { class: 'btn sm ghost danger', onclick: () => { for (const k of [...comps.keys()]) if (k.startsWith('anim::')) { post({ dx: 'uncss', id: comps.get(k).id }); comps.delete(k); } paintSummary(); paintPanel(); } }, 'Remove all motion'));
  }

  /* ----------------------------------- Kits tab ----------------------------------- */
  // UI-kit templates: one click restyles every button, input, card and heading across the whole app.
  const KITS = [
    ['minimal', 'Minimal', 'Clean, flat, tight type', `button,[class*=btn],input[type=submit]{border-radius:8px!important;border:1px solid rgba(0,0,0,.12)!important;box-shadow:none!important;font-weight:600!important}\ninput,textarea,select{border-radius:8px!important;border:1px solid rgba(0,0,0,.15)!important}\n[class*=card]{border-radius:10px!important;box-shadow:none!important;border:1px solid rgba(0,0,0,.1)!important}\nh1,h2,h3{letter-spacing:-.02em!important;font-weight:700!important}`],
    ['soft', 'Soft & rounded', 'Pill buttons, big radius, soft shadows', `button,[class*=btn],input[type=submit]{border-radius:999px!important;font-weight:600!important;padding:.6em 1.3em!important;transition:transform .2s,box-shadow .2s!important}\nbutton:hover,[class*=btn]:hover{transform:translateY(-1px)!important;box-shadow:0 10px 24px rgba(0,0,0,.14)!important}\ninput,textarea,select{border-radius:14px!important}\n[class*=card]{border-radius:20px!important;box-shadow:0 12px 34px rgba(0,0,0,.1)!important}\nimg{border-radius:16px!important}`],
    ['glass', 'Glass', 'Frosted translucent surfaces', `[class*=card],[class*=panel],header,nav,footer{background:color-mix(in srgb,#fff 14%,transparent)!important;backdrop-filter:blur(16px) saturate(1.3)!important;border:1px solid rgba(255,255,255,.22)!important;border-radius:16px!important}\nbutton,[class*=btn]{backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,.3)!important;border-radius:12px!important}`],
    ['brutalist', 'Brutalist', 'Hard edges, thick borders, offset shadow', `button,[class*=btn],input,textarea,select,[class*=card]{border:3px solid #000!important;border-radius:0!important;box-shadow:6px 6px 0 #000!important}\nbutton:hover,[class*=btn]:hover{transform:translate(2px,2px)!important;box-shadow:3px 3px 0 #000!important}\nh1,h2,h3{text-transform:uppercase!important;letter-spacing:.02em!important;font-weight:800!important}`],
    ['editorial', 'Editorial', 'Serif headings, airy spacing', `h1,h2,h3,h4{font-family:Georgia,'Playfair Display',serif!important;letter-spacing:-.01em!important}\nbody,p,li{line-height:1.7!important}\nbutton,[class*=btn]{border-radius:2px!important;letter-spacing:.04em!important;text-transform:uppercase!important;font-size:.85em!important}\n[class*=card]{border-radius:4px!important;border:1px solid rgba(0,0,0,.12)!important;box-shadow:none!important}`],
    ['neon', 'Neon', 'Dark glow, vivid accents', `button,[class*=btn]{border-radius:10px!important;background:linear-gradient(120deg,#7c3aed,#36d1ff)!important;color:#fff!important;border:0!important;box-shadow:0 0 18px rgba(124,58,237,.5)!important}\n[class*=card],[class*=panel]{border:1px solid rgba(124,58,237,.5)!important;border-radius:14px!important;box-shadow:0 0 24px rgba(124,58,237,.25)!important}\na{color:#36d1ff!important}\nh1,h2,h3{text-shadow:0 0 18px rgba(124,58,237,.5)!important}`],
  ];
  function applyKit(kid, css) { post({ dx: 'css', id: 'uikit', css }); comps.set('uikit', { id: 'uikit', css, html: '', from: '', kit: kid }); toast('Kit applied — preview updated', 'ok'); paintSummary(); paintPanel(); }
  function kitsTab(box) {
    box.append(h('p', { class: 've-help' }, 'A kit restyles every button, input, card and heading across the whole app at once. Preview here; it goes live only after Autopilot review.'));
    const active = comps.get('uikit')?.kit;
    box.append(h('div', { class: 'stack', style: { gap: '6px' } }, ...KITS.map(([kid, label, desc, css]) => h('button', { class: `ve-kit${active === kid ? ' on' : ''}`, onclick: () => applyKit(kid, css) }, h('b', {}, label), h('span', { class: 'muted small' }, desc)))));
    if (comps.has('uikit')) box.append(h('button', { class: 'btn sm ghost danger', onclick: () => { post({ dx: 'uncss', id: comps.get('uikit').id }); comps.delete('uikit'); paintSummary(); paintPanel(); } }, 'Remove kit'));
  }

  /* ----------------------------------- Looks tab ---------------------------------- */
  // One click restyles the whole app. Looks are applied as a single replaceable stylesheet and tracked for Autopilot.
  function applyLook(l) { const css = buildLookCss(l); post({ dx: 'css', id: 'look', css }); comps.set('look', { id: 'look', css, html: '', from: '', look: l.id }); toast(`Look “${l.name}” applied to the whole app`, 'ok'); paintSummary(); paintPanel(); }
  function looksTab(box) {
    const active = comps.get('look')?.look;
    box.append(h('p', { class: 've-help' }, 'One click restyles every screen — colours, type, buttons, cards, the lot. Previewed live; it reaches your site only after Autopilot review.'));
    box.append(h('div', { class: 've-fams', role: 'group', 'aria-label': 'Style family' }, ...['All', ...FAMILIES].map((f) => h('button', { class: `ve-fam${lookFamily === f ? ' on' : ''}`, onclick: () => { lookFamily = f; paintPanel(); } }, f))));
    const list = lookFamily === 'All' ? LOOKS : LOOKS.filter((l) => l.family === lookFamily);
    const gal = h('div', { class: 've-looks', role: 'list' });
    for (const l of list) gal.append(h('button', { class: `ve-look${active === l.id ? ' on' : ''}`, role: 'listitem', 'aria-pressed': String(active === l.id), onclick: () => applyLook(l) }, h('div', { class: 've-look-box' }, h('iframe', { title: '', sandbox: '', srcdoc: lookThumb(l), loading: 'lazy' })), h('div', { class: 've-look-cap' }, h('b', {}, l.name), h('span', { class: 'muted small' }, `${l.mode} · ${l.family}`))));
    box.append(gal);
    if (comps.has('look')) box.append(h('button', { class: 'btn sm ghost danger', onclick: () => { post({ dx: 'uncss', id: 'look' }); comps.delete('look'); paintSummary(); paintPanel(); } }, 'Remove look'));
    box.append(h('details', { class: 've-group' }, h('summary', {}, 'Advanced: tokens & online theme libraries'), h('div', { class: 've-group-body stack', style: { gap: '6px' } }, (() => { const b = h('div', { class: 'stack', style: { gap: '8px' } }); themeTab(b); return b; })())));
  }

  /* ----------------------------------- Edit (contextual) ---------------------------------- */
  function breadcrumb() {
    const hasSection = sel.comp && kindFor(sel.comp.kind);
    const crumbs = h('div', { class: 've-crumbs' });
    if (hasSection) crumbs.append(h('button', { class: `ve-crumb${editSub === 'replace' ? ' on' : ''}`, onclick: () => { editSub = 'replace'; paintPanel(); } }, `◴ ${sel.comp.kind} section`), h('span', { class: 've-crumb-sep' }, '›'));
    crumbs.append(h('button', { class: `ve-crumb${editSub !== 'replace' || !hasSection ? ' on' : ''}`, onclick: () => { if (editSub === 'replace') editSub = 'style'; paintPanel(); } }, `<${sel.tag}>`));
    return crumbs;
  }
  function editTab(box) {
    if (!sel) { box.append(h('div', { class: 've-empty' }, h('b', {}, selectMode ? 'Click anything on the page' : 'Turn on Select, then click'), h('p', { class: 'muted small' }, ready ? 'Pick a section to swap it, or any text, button or box to restyle and animate it.' : 'Loading the page …'))); return; }
    box.append(breadcrumb());
    const hasSection = sel.comp && kindFor(sel.comp.kind);
    box.append(h('div', { class: 've-subtabs', role: 'tablist' }, ...[hasSection && ['replace', 'Replace'], ['style', 'Style'], ['motion', 'Motion']].filter(Boolean).map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(editSub === k), onclick: () => { editSub = k; paintPanel(); } }, l))));
    const sub = h('div', { class: 'stack', style: { gap: '8px' } }); box.append(sub);
    if (editSub === 'replace' && hasSection) componentsTab(sub); else if (editSub === 'motion') motionTab(sub); else styleTab(sub);
  }

  /* ----------------------------------- shell ----------------------------------- */
  function paintPanel() {
    clear(panel);
    panel.append(h('div', { class: 've-tabs', role: 'tablist' }, ...[['looks', 'Looks'], ['edit', sel ? 'Edit' : 'Edit element']].map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => { tab = k; paintPanel(); } }, l))));
    const box = h('div', { class: 'stack', style: { gap: '8px' } }); panel.append(box);
    if (tab === 'looks') looksTab(box); else editTab(box);
  }
  function paintSummary() {
    clear(summary); const n = countEdits() + (live ? 1 : 0);
    summary.append(h('span', { class: 'chip' }, `${n} change${n === 1 ? '' : 's'}`),
      h('button', { class: 'btn sm', disabled: !countEdits(), onclick: showCode }, icon('code', 15), 'Show code'),
      isAdmin && canApply && actionBtn({ ic: 'bolt', label: 'Send edits to Autopilot', cls: 'primary sm', disabled: !countEdits(), onClick: send }),
      h('button', { class: 'btn sm ghost', disabled: !countEdits(), onclick: () => { edits.clear(); comps.clear(); sel = null; paintSummary(); reload(); paintPanel(); } }, 'Reset edits'));
  }
  const compPayload = () => [...comps.values()].filter((c) => c.css).map((c) => ({ css: c.css, html: c.html, from: c.from }));
  const payload = () => [...edits].map(([selector, e]) => ({ selector, props: e.props, ...(e.text !== undefined ? { text: e.text, before: e.before || '' } : {}) }));
  async function showCode() {
    try {
      const c = edits.size ? await api(`/apps/${id}/design/code`, { method: 'POST', body: { edits: payload() } }) : { css: '', tailwind: [], textChanges: [] };
      const block = (title, text) => text && h('div', { class: 'stack' }, h('div', { class: 'row' }, h('b', {}, title), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => copy(text, 'Copied') }, icon('copy', 14), 'Copy')), h('pre', { class: 'code' }, text));
      const tw = c.tailwind.map((t) => `${t.selector}\n  ${t.classes}`).join('\n\n'); const tx = c.textChanges.map((t) => `${t.selector}\n  "${t.before}"  ->  "${t.after}"`).join('\n\n');
      const cs = compPayload(); const m = modal(h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Generated code' }, h('h2', {}, 'Generated code'), block('CSS', [c.css, ...cs.map((x) => x.css)].filter(Boolean).join('\n\n')), block('Tailwind classes', tw), block('Text changes', tx), ...cs.filter((x) => x.html).map((x, i) => block(`Replacement HTML ${i + 1}`, x.html)), h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Close'))));
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function send() { try { await api(`/apps/${id}/design/apply`, { method: 'POST', body: { edits: payload(), components: compPayload() } }); toast('Sent to Autopilot. Review it under Reviews before it goes live.', 'ok'); } catch (e) { toast(e.message, 'bad'); } }

  const dev = h('div', { class: 'seg', role: 'group', 'aria-label': 'Screen size' }, ...[['desktop', 'Desktop'], ['mobile', 'Phone']].map(([k, l]) => h('button', { 'aria-pressed': String(k === device), onclick: (e) => { device = k; stage.dataset.device = k; dev.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, l)));
  frameEl(); paintPanel(); paintSummary();
  root.append(
    h('div', { class: 've-bar' }, modeBtns, pageSel, pathIn, h('button', { class: 'btn', onclick: () => open(pathIn.value) }, 'Go'), h('button', { class: 'btn', title: 'Reload this page', onclick: reload }, icon('refresh', 15)), dev),
    h('p', { class: 'muted small' }, 'Browse like a visitor: every link works. Click Select to pick something and edit it. Nothing is saved to your site until you send it to Autopilot and approve the review.'),
    summary, h('div', { class: 've-grid' }, stage, panel));
  api(`/apps/${id}/pages`).then((r) => { pages = r.pages || ['/']; paintPages(); }).catch(() => {});
  open('/');
  return { el: root };
}
