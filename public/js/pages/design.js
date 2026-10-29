// Design code generator: pick a component and a theme, see it live, copy the code as HTML+CSS, Tailwind or React.
import { h, clear, icon, toast, copy } from '../ui.js';
import { api } from '../api.js';
import { kitBrowser } from './kits.js';

export function designPage(ctx) {
  const outer = h('div', { class: 'stack' }); const kitsBox = h('div', { hidden: true }); let kitsLoaded = false; let compsEl = null;
  const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': 'Design section' }, ...[['kits', 'UI kits'], ['components', 'Components']].map(([k, l]) => h('button', { 'aria-pressed': String(k === 'kits'), onclick: async (e) => { tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); kitsBox.hidden = k !== 'kits'; compsEl.hidden = k !== 'components'; if (k === 'kits' && !kitsLoaded) { kitsLoaded = true; kitsBox.append(await kitBrowser(ctx)); } } }, l)));
  const comp = componentsPage(ctx); compsEl = comp.el; compsEl.hidden = true; outer.append(tabs, kitsBox, compsEl);
  kitsBox.hidden = false; kitsLoaded = true; kitBrowser(ctx).then((el) => kitsBox.append(el));
  return { el: outer };
}

function componentsPage(ctx) {
  ctx.crumbs([{ label: 'Design' }]);
  const S = { component: 'hero', format: 'html', theme: 'deep-space', text: '' }; let meta = null;
  const root = h('div', { class: 'stack' }); const prev = h('iframe', { class: 'dg-prev', title: 'Preview', sandbox: '' }); const code = h('pre', { class: 'code dg-code' });
  let timer = null;
  async function gen() {
    try { const r = await api('/design/component', { method: 'POST', body: S }); prev.srcdoc = r.preview; code.textContent = r.code; code.dataset.code = r.code; }
    catch (e) { toast(e.message, 'bad'); }
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(gen, 250); };
  const seg = (label, key, items) => { const g = h('div', { class: 'seg', role: 'group', 'aria-label': label }, ...items.map(([v, l]) => h('button', { 'aria-pressed': String(S[key] === v), onclick: (e) => { S[key] = v; g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); gen(); } }, l))); return g; };
  (async () => {
    try { meta = await api('/design/components'); } catch (e) { root.append(h('div', { class: 'empty' }, h('b', {}, 'Could not load'), h('p', { class: 'muted' }, e.message))); return; }
    const comps = h('div', { class: 'dg-list', role: 'group', 'aria-label': 'Component' }, ...meta.components.map((c) => h('button', { class: 'btn sm', 'aria-pressed': String(S.component === c.id), onclick: (e) => { S.component = c.id; comps.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); gen(); } }, c.label)));
    const theme = h('select', { class: 'field', 'aria-label': 'Theme', onchange: (e) => { S.theme = e.target.value; gen(); } }, ...meta.themes.map((t) => h('option', { value: t.id, selected: t.id === S.theme }, `${t.name} (${t.mode})`)));
    const text = h('input', { class: 'field', placeholder: 'Your own heading or label (optional)', maxlength: 60, 'aria-label': 'Custom text', oninput: (e) => { S.text = e.target.value; later(); } });
    root.append(
      h('p', { class: 'muted small' }, 'Components are built from design tokens, so they match whichever theme you pick. Copy the code into any project, or apply the same theme to a running app from its Look tab.'),
      h('section', { class: 'panel hud', style: { padding: '14px', display: 'grid', gap: '12px' } }, comps, h('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } }, theme, seg('Code format', 'format', [['html', 'HTML + CSS'], ['tailwind', 'Tailwind'], ['react', 'React']]), text)),
      h('div', { class: 'dg-grid' }, h('section', { class: 'panel hud', style: { padding: '0', overflow: 'hidden' } }, prev), h('section', { class: 'panel hud', style: { padding: '12px', display: 'grid', gap: '8px' } }, h('div', { class: 'row' }, h('b', {}, 'Code'), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => copy(code.dataset.code || '', 'Code copied') }, icon('copy', 14), 'Copy')), code)));
    gen(); window.dispatchEvent(new Event('dc:content'));
  })();
  return { el: root };
}
