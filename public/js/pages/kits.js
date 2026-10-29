// UI kits: browse 150+ complete design systems, preview one on the REAL app (a throwaway clone of its pages, nothing saved),
// then hand it to Autopilot as a reviewed change. Also: copy the look of another app, or read a running app's current look.
import { h, clear, toast, copy, modal, actionBtn, confirmDialog, icon } from '../ui.js';
import { api } from '../api.js';
import { KITS, KIT_FAMILIES, kitThumb, kitPreviewDoc, buildKitCss, kitRolesJs, withAccent, kitById } from '../lib/kits.js';
import { PRESETS, PRESET_FAMILIES, CATS, dnaThumb, dnaPreviewDoc, compose, dnaId, parseDna, presetById, paletteById, randomDna, fitsOf, PALETTES, STRUCTURES, BACKDROPS, IMAGERY, MOTIONS, TYPES } from '../lib/dna.js';

const PAGE = 24;

/** A look from a bare design id: the saved name, or a custom one. */
export function dnaItem(id) {
  const p = presetById(id); if (p) return p; const d = parseDna(id); if (!d) return null;
  const pal = paletteById(d.palette); return { id, name: 'Custom look', family: 'Custom', mode: pal.mode, cat: '', fits: fitsOf(d), dna: d, blurb: 'Built in the design builder' };
}
const isDna = (k) => !!k?.dna;
const dnaDots = (k) => { const p = paletteById(k.dna.palette); return [p.bg, p.surface, p.text, p.accent, p.accent2]; };

/** Search, filters and a grid of live thumbnails over any list of looks. */
export function kitGallery({ onOpen, activeId = () => null, items = KITS, families = KIT_FAMILIES, filters = [], noun = 'kits' }) {
  const S = { q: '', family: 'All', mode: '', shown: PAGE, f: Object.fromEntries(filters.map((f) => [f.key, f.value])) };
  const grid = h('div', { class: 'kt-grid', role: 'list' }); const count = h('span', { class: 'muted small', 'aria-live': 'polite' });
  const more = h('button', { class: 'btn', onclick: () => { S.shown += PAGE; paint(); } }, 'Show more');
  const all = () => items.filter((k) => (S.family === 'All' || k.family === S.family) && (!S.mode || k.mode === S.mode) && filters.every((f) => f.test(k, S.f[f.key])) && (!S.q || `${k.name} ${k.family} ${k.hueName || ''} ${k.blurb || ''}`.toLowerCase().includes(S.q.toLowerCase())));
  function card(k) {
    const dots = (isDna(k) ? dnaDots(k) : [k.bgBase || k.bg, k.surfaceBase || k.surface, k.text, k.accent]).map((c) => h('i', { style: { background: /^#/.test(c) ? c : k.bgBase || '#888' } }));
    return h('button', { class: `kt-card${activeId() === k.id ? ' on' : ''}`, role: 'listitem', 'aria-label': `Preview ${k.name}`, onclick: () => onOpen(k) },
      h('div', { class: 'kt-box' }, h('iframe', Object.assign({ title: '', sandbox: isDna(k) ? 'allow-scripts' : '', loading: 'lazy', tabindex: '-1' }, isDna(k) ? { src: `/api/v1/dna/thumb?d=${encodeURIComponent(k.id)}` } : { srcdoc: kitThumb(k) }))),
      h('div', { class: 'kt-cap' }, h('b', {}, k.name), h('span', { class: 'kt-dots' }, ...dots), h('small', { class: 'muted' }, `${k.family} · ${k.mode}`)));
  }
  function paint() {
    const list = all(); clear(grid);
    if (!list.length) grid.append(h('p', { class: 'muted' }, 'Nothing matches. Try fewer words or another business type.'));
    for (const k of list.slice(0, S.shown)) grid.append(card(k));
    count.textContent = `${Math.min(S.shown, list.length)} of ${list.length} ${noun}`; more.hidden = S.shown >= list.length;
  }
  const reset = () => { S.shown = PAGE; paint(); };
  const q = h('input', { class: 'field', type: 'search', placeholder: `Search ${items.length} ${noun}`, 'aria-label': `Search ${noun}`, oninput: (e) => { S.q = e.target.value; reset(); } });
  const fam = h('select', { class: 'field', 'aria-label': 'Style family', onchange: (e) => { S.family = e.target.value; reset(); } }, h('option', { value: 'All' }, 'All styles'), ...families.map((f) => h('option', { value: f }, f)));
  const fsel = filters.map((f) => h('select', { class: 'field', 'aria-label': f.label, onchange: (e) => { S.f[f.key] = e.target.value; reset(); } }, ...f.options.map(([v, l]) => h('option', { value: v, selected: v === f.value }, l))));
  const mode = h('div', { class: 'seg', role: 'group', 'aria-label': 'Light or dark' }, ...[['', 'All'], ['dark', 'Dark'], ['light', 'Light']].map(([v, l]) => h('button', { 'aria-pressed': String(S.mode === v), onclick: (e) => { S.mode = v; mode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); reset(); } }, l)));
  paint();
  return { el: h('div', { class: 'stack' }, h('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } }, h('div', { style: { flex: '1 1 220px' } }, q), ...fsel, fam, mode, count), grid, h('div', { class: 'row', style: { justifyContent: 'center' } }, more)), repaint: paint, set(key, v) { S.f[key] = v; const i = filters.findIndex((f) => f.key === key); if (i >= 0) fsel[i].value = v; reset(); } };
}

/** Full designs (1,200, built per kind of business) and the classic kits, with a builder for any combination. */
export function kitCatalog({ onOpen, activeId = () => null, business = null }) {
  const bizOpts = [['all', 'Any business'], ...CATS.map((c) => [c.id, c.label])];
  const designs = kitGallery({ onOpen, activeId, items: PRESETS, families: PRESET_FAMILIES, noun: 'designs', filters: [{ key: 'biz', label: 'Business type', value: business || 'all', options: bizOpts, test: (k, v) => v === 'all' || k.fits.includes(v) }] });
  const classic = kitGallery({ onOpen, activeId, noun: 'kits' }); classic.el.hidden = true;
  let tab = 'designs';
  const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': 'Catalog' }, ...[['designs', `Full designs (${PRESETS.length})`], ['classic', `Classic kits (${KITS.length})`]].map(([k, l]) => h('button', { 'aria-pressed': String(tab === k), onclick: (e) => { tab = k; tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); designs.el.hidden = k !== 'designs'; classic.el.hidden = k !== 'classic'; } }, l)));
  const surprise = h('button', { class: 'btn', onclick: () => { const pool = business && business !== 'all' ? PRESETS.filter((p) => p.fits.includes(business)) : PRESETS; onOpen(pool[Math.floor(Math.random() * pool.length)]); } }, icon('refresh', 14), 'Surprise me');
  const build = h('button', { class: 'btn', onclick: () => openBuilder({ onOpen, business }) }, icon('palette', 14), 'Build your own');
  return { el: h('div', { class: 'stack' }, h('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center' } }, tabs, h('span', { class: 'grow' }), surprise, build), designs.el, classic.el), repaint() { designs.repaint(); classic.repaint(); }, setBusiness(b) { business = b; designs.set('biz', b || 'all'); } };
}

/** Any of the roughly four million combinations: six dropdowns, a live thumbnail, then the same preview window. */
export function openBuilder({ onOpen, business }) {
  const start = (business && PRESETS.find((p) => p.fits.includes(business))?.dna) || PRESETS[0].dna; const d = { ...start };
  const frame = h('iframe', { class: 'kt-frame', title: 'Live sample', sandbox: 'allow-scripts', style: { height: '420px', width: '100%', border: 0, background: '#fff', borderRadius: '12px' } });
  const fields = [['structure', 'Components', STRUCTURES], ['palette', 'Colours', PALETTES], ['backdrop', 'Backdrop', BACKDROPS], ['imagery', 'Pictures', IMAGERY], ['motion', 'Motion', MOTIONS], ['type', 'Typography', TYPES]];
  const sels = {}; const show = () => { frame.src = `/api/v1/dna/thumb?animate=1&d=${encodeURIComponent(dnaId(d))}`; };
  const row = fields.map(([k, l, arr]) => { const sel = h('select', { class: 'field', 'aria-label': l, onchange: (e) => { d[k] = e.target.value; show(); } }, ...arr.map((x) => h('option', { value: x.id, selected: x.id === d[k] }, x.name))); sels[k] = sel; return h('label', { class: 'lbl small' }, l, sel); });
  const shuffle = () => { Object.assign(d, randomDna(Date.now())); for (const k of Object.keys(sels)) sels[k].value = d[k]; show(); };
  const go = () => { const id = dnaId(d); m.close(); onOpen(dnaItem(id)); };
  const box = h('div', { class: 'dialog kt-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Build your own design' }, h('h2', { style: { margin: 0 } }, 'Build your own design'),
    h('p', { class: 'muted small' }, 'Mix any components, colours, backdrop, picture treatment, motion and type. Layout and features are never touched.'),
    h('div', { class: 'kt-build' }, ...row), frame,
    h('div', { class: 'row wrap kt-actions' }, h('button', { class: 'btn primary', onclick: go }, 'Preview on my app'), h('button', { class: 'btn', onclick: shuffle }, icon('refresh', 14), 'Shuffle'), h('span', { class: 'grow' }), h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Cancel')));
  const m = modal(box); show(); return m;
}

/**
 * The preview window. Left: the real app with the kit laid over it (a live clone of its pages: nothing is saved anywhere).
 * Right or second tab: the full kit sampler. Buttons: apply to this app, apply to others, copy CSS / Tailwind / tokens.
 */
export function openKit(kit0, { appId, apps = [], canApply = false, isAdmin = true, onApplied, note = '' }) {
  let kit = kit0; let target = appId || apps[0]?.id || ''; let tab = target ? 'app' : 'kit'; let device = 'desktop'; let frame = null; let ready = false; let path = '/';
  const post = (m) => { try { frame?.contentWindow?.postMessage(m, '*'); } catch { /* frame gone */ } };
  const stage = h('div', { class: 'kt-stage', 'data-device': device }); const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const bundle = () => (isDna(kit0) ? compose(kit0.dna) : null);
  const send = () => { if (frame && ready) { const c = bundle(); if (c) { post({ dx: 'css', id: 'kit', css: c.css }); post({ dx: 'js', code: c.roles }); post({ dx: 'js', code: c.js }); } else { post({ dx: 'css', id: 'kit', css: buildKitCss(kit) }); post({ dx: 'js', code: kitRolesJs(kit) }); } } };
  const onMsg = (ev) => { if (frame && ev.source === frame.contentWindow && ev.data?.dx === 'ready') { ready = true; send(); status.textContent = `Showing ${kit.name} on ${apps.find((a) => a.id === target)?.name || 'your app'}. This is a preview only.`; } };
  window.addEventListener('message', onMsg);
  async function loadApp() {
    clear(stage); ready = false;
    if (!target) { stage.append(h('p', { class: 'muted pad' }, 'Choose an app to preview this kit on.')); return; }
    status.textContent = 'Loading the app ...';
    try { const r = await api(`/apps/${target}/view-token`, { method: 'POST', body: { path } }); frame = h('iframe', { class: 'kt-frame', title: 'App preview with the kit applied', sandbox: 'allow-scripts allow-forms allow-modals', referrerpolicy: 'no-referrer', src: r.url }); stage.append(frame); }
    catch (e) { stage.append(h('p', { class: 'muted pad' }, e.message)); status.textContent = ''; }
  }
  function loadKit() { clear(stage); frame = null; ready = false; stage.append(h('iframe', Object.assign({ class: 'kt-frame', title: 'Full kit sampler', sandbox: isDna(kit0) ? 'allow-scripts' : '' }, isDna(kit0) ? { src: `/api/v1/dna/page?d=${encodeURIComponent(kit0.id)}&n=${encodeURIComponent(kit0.name)}` } : { srcdoc: kitPreviewDoc(kit) }))); status.textContent = 'A full page built in this kit: navigation, hero, cards, pricing, form, table, alert and footer.'; }
  const paintStage = () => { stage.dataset.device = device; if (tab === 'app') loadApp(); else loadKit(); };
  const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': 'What to preview' }, ...[['app', 'On your app'], ['kit', 'Full kit']].map(([k, l]) => h('button', { 'aria-pressed': String(tab === k), onclick: (e) => { tab = k; tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); paintStage(); } }, l)));
  const dev = h('div', { class: 'seg', role: 'group', 'aria-label': 'Screen size' }, ...[['desktop', 'Desktop'], ['phone', 'Phone']].map(([k, l]) => h('button', { 'aria-pressed': String(device === k), onclick: (e) => { device = k; dev.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); stage.dataset.device = device; } }, l)));
  const pick = h('select', { class: 'field', 'aria-label': 'Preview on app', onchange: (e) => { target = e.target.value; if (tab === 'app') loadApp(); } }, ...apps.map((a) => h('option', { value: a.id, selected: a.id === target }, a.name)));
  const pathIn = h('input', { class: 'field mono', value: '/', 'aria-label': 'Page path', style: { maxWidth: '150px' }, onkeydown: (e) => { if (e.key === 'Enter') { path = e.target.value || '/'; if (tab === 'app') loadApp(); } } });
  const acc = h('input', { type: 'color', value: kit.accent, 'aria-label': 'Accent colour', title: 'Change the accent colour', oninput: (e) => { kit = withAccent(kit0, e.target.value); send(); if (tab === 'kit') loadKit(); } });
  const others = h('div', { class: 'stack', style: { gap: '4px' } }); const picked = new Set();
  const otherApps = apps.filter((a) => a.id !== target);
  if (isAdmin && canApply && apps.length > 1) others.append(h('details', { class: 'kt-more' }, h('summary', {}, 'Also apply to other apps'), h('div', { class: 'stack', style: { gap: '4px', padding: '8px 0' } }, ...apps.map((a) => h('label', { class: 'row', style: { gap: '8px' } }, h('input', { type: 'checkbox', onchange: (e) => { e.target.checked ? picked.add(a.id) : picked.delete(a.id); } }), a.name)))));
  let depth = 'restyle';
  const depthSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'How deep' }, ...[['restyle', 'Restyle fast (CSS + script)'], ['rebuild', 'Rebuild components (AI rewrites the code)']].map(([k, l]) => h('button', { 'aria-pressed': String(depth === k), title: k === 'restyle' ? 'Adds a stylesheet and a small script that finds cards, buttons, badges and navigation by how they look, so it works on any markup.' : 'Autopilot rewrites the components, tokens and pages in the source so the app is built in this kit. Slower; always reviewed before it goes live.', onclick: (e) => { depth = k; depthSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, l)));
  const err = h('p', { class: 'err', role: 'alert' });
  const body = (extraApp) => ({ ...(isDna(kit0) ? { dna: kit0.id } : kit0.def ? { def: kit0.def } : kit0.sampled ? { def: kit0 } : { kit: kit0.id }), ...(kit.accent !== kit0.accent ? { accent: kit.accent } : {}), ...(extraApp || {}), depth });
  const apply = actionBtn({ ic: 'bolt', label: 'Apply to the whole app', cls: 'primary', disabled: !isAdmin || !canApply || !target, onClick: async () => {
    const ids = [...new Set([target, ...picked].filter(Boolean))];
    if (!(await confirmDialog({ title: `Apply ${kit.name}?`, body: `Autopilot adds one stylesheet on a branch for ${ids.length} app${ids.length === 1 ? '' : 's'} and asks you to review it. Nothing goes live until you approve.`, confirm: 'Apply' }))) return;
    err.textContent = ''; let ok = 0;
    for (const id of ids) { try { await api(`/apps/${id}/look/apply`, { method: 'POST', body: body() }); ok++; } catch (e) { err.textContent = `${apps.find((a) => a.id === id)?.name || id}: ${e.message}`; } }
    if (ok) { toast(`Sent to Autopilot for ${ok} app${ok === 1 ? '' : 's'}. Review it under Reviews.`, 'ok'); onApplied?.(); if (!err.textContent) m.close(); }
  } });
  const dl = (fmt) => async () => { if (isDna(kit0) && fmt === 'css') { copy(bundle().css, 'CSS copied'); return; } try { const r = await fetch(`/api/v1/kits/${kit0.id}/${fmt}`, { credentials: 'same-origin' }); if (!r.ok) throw new Error('Not available for this look.'); copy(await r.text(), `${fmt.toUpperCase()} copied`); } catch (e) { if (fmt === 'css') copy(buildKitCss(kit), 'CSS copied'); else toast(e.message, 'bad'); } };
  const box = h('div', { class: 'dialog kt-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${kit.name} preview` },
    h('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } }, h('h2', { style: { margin: 0 } }, kit.name), h('span', { class: 'chip' }, kit.family), h('span', { class: 'chip' }, kit.mode), h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', onclick: () => m.close(), 'aria-label': 'Close' }, 'Close')),
    h('p', { class: 'muted small' }, note || kit.blurb || ''),
    h('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center' } }, tabs, apps.length ? pick : null, apps.length ? pathIn : null, dev, isDna(kit0) ? h('button', { class: 'btn sm', onclick: () => { paintStage(); } }, icon('refresh', 14), 'Replay motion') : h('label', { class: 'row small', style: { gap: '6px' } }, 'Accent', acc)),
    stage, status, isAdmin && canApply ? depthSeg : null, others, err,
    h('div', { class: 'row wrap kt-actions' }, apply,
      h('button', { class: 'btn', onclick: dl('css') }, icon('copy', 14), 'Copy CSS'),
      kitById(kit0.id) ? h('button', { class: 'btn', onclick: dl('tailwind') }, 'Tailwind') : null,
      kitById(kit0.id) ? h('button', { class: 'btn', onclick: dl('json') }, 'Tokens') : null));
  const gone = () => m.close();
  const m = modal(box, { onClose: () => { window.removeEventListener('message', onMsg); window.removeEventListener('hashchange', gone); } }); window.addEventListener('hashchange', gone, { once: true });
  paintStage();
  return m;
}

/** The Look tab of an app. */
export function kitStudio({ id, app, ctx }) {
  const isAdmin = ctx.me?.admin !== false; let info = { current: null, others: [], apps: [], canApply: false };
  const head = h('div', { class: 'stack' }); let gal = null; let bizSet = false;
  const apps = () => [{ id, name: app.name }, ...info.apps];
  const open = (k, note) => openKit(k, { appId: id, apps: apps(), canApply: info.canApply, isAdmin, onApplied: load, note });
  async function readCurrent() {
    try { const r = await api(`/apps/${id}/look/sample`); open({ ...r.kit, sampled: true }, `Read from the running app: background ${r.found.bg}, text ${r.found.text}, accent ${r.found.accent}${r.found.font ? `, font ${r.found.font}` : ''}.`); } catch (e) { toast(e.message, 'bad'); }
  }
  async function copyLook(from) {
    const src = info.others.find((o) => o.id === from.id);
    try {
      let kit; if (src?.def) kit = { ...src.def, sampled: true, def: src.def }; else if (src && (kitById(src.kit) || dnaItem(src.kit))) kit = kitById(src.kit) || dnaItem(src.kit);
      else { const r = await api(`/apps/${from.id}/look/sample`); kit = { ...r.kit, sampled: true }; }
      open(kit, `This is the look of ${from.name}${src ? '' : ' as read from its running site'}. Preview it on ${app.name}, then apply.`);
    } catch (e) { toast(e.message, 'bad'); }
  }
  function paintHead() {
    clear(head);
    const cur = info.current; const curKit = cur && (cur.def || kitById(cur.kit) || dnaItem(cur.kit));
    const pickApp = h('select', { class: 'field', 'aria-label': 'Copy the look of another app' }, h('option', { value: '' }, 'Choose an app ...'), ...info.apps.map((a) => { const o = info.others.find((x) => x.id === a.id); return h('option', { value: a.id }, o ? `${a.name} (${o.kitName})` : `${a.name} (read from its site)`); }));
    if (info.business) head.append(h('p', { class: 'muted small' }, 'Looks suggested for: ', h('b', {}, info.business.label), ` (${info.business.reason}). Change it with the Business type filter below.`));
    head.append(h('div', { class: 'cols' },
      h('section', { class: 'panel hud kt-panel' }, h('b', {}, 'This app\'s look'),
        cur ? h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('span', { class: 'chip ok' }, cur.name), h('span', { class: 'muted small' }, `sent ${new Date(cur.at).toLocaleDateString()}`), curKit ? h('button', { class: 'btn sm', onclick: () => open(curKit.sampled || cur.def ? { ...curKit, sampled: true } : curKit) }, 'Preview') : null) : h('p', { class: 'muted small' }, 'No kit has been applied from here yet.'),
        h('div', { class: 'row wrap', style: { gap: '8px' } }, h('button', { class: 'btn', onclick: readCurrent }, icon('search', 14), 'Read its current look'))),
      h('section', { class: 'panel hud kt-panel' }, h('b', {}, 'Use another app\'s look'), h('p', { class: 'muted small' }, 'Pick an app. You see its look laid over this one first; nothing changes until you apply.'), h('div', { class: 'row wrap', style: { gap: '8px' } }, pickApp,
        h('button', { class: 'btn primary', onclick: () => { const a = info.apps.find((x) => x.id === pickApp.value); if (!a) { toast('Choose an app first', 'info'); return; } copyLook(a); } }, 'Preview its look')))));
  }
  async function load() { try { info = await api(`/apps/${id}/look`); } catch (e) { clear(head).append(h('div', { class: 'banner bad' }, e.message)); return; } paintHead(); if (!bizSet && info.business) { bizSet = true; gal?.setBusiness(info.business.id); } gal?.repaint(); }
  gal = kitCatalog({ onOpen: (k) => open(k), activeId: () => info.current?.kit });
  load();
  return { el: h('div', { class: 'stack' }, h('p', { class: 'muted small' }, `${PRESETS.length} full designs and ${KITS.length} classic kits. Every design changes colours, component shapes, backdrop, pictures, type and motion together, and never the layout or features. Designs are listed for this app's kind of business first. Preview on the real pages, then apply: Autopilot adds it on a branch and you review it before anything goes live.`), head, gal.el) };
}

/** The browser shown in the Design menu. */
export async function kitBrowser(ctx) {
  const isAdmin = ctx.me?.admin !== false; let apps = []; let canApply = false;
  try { const f = await api('/fleet'); apps = (f.apps || []).map((a) => ({ id: a.id, name: a.name })); canApply = apps.length > 0; } catch { /* preview-only */ }
  const gal = kitCatalog({ onOpen: (k) => openKit(k, { apps, canApply, isAdmin, note: k.blurb }) });
  return h('div', { class: 'stack' }, h('p', { class: 'muted small' }, `${PRESETS.length} full designs, built per kind of business, plus ${KITS.length} classic kits. Open one to see a whole page in it, preview it on any of your apps, copy the CSS, Tailwind config or tokens, or send it to an app for review.`), gal.el);
}
