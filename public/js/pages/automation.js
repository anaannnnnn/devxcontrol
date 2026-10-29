// One place for every Orbit switch. All of them start off.
import { h, toast } from '../ui.js';
import { api } from '../api.js';

const LABELS = { debt: 'Design debt', dna: 'Business DNA', proving: 'Proving Ground', ghosts: 'Visitor ghosts', universes: 'Universes', revenue: 'Revenue pulse', mirror: 'Competitor mirror', brain: 'Fleet brain', gift: 'Weekly gift', talk: 'Talk to Control', rooms: 'Client rooms', orbit: 'Orbit view' };

export function automationPage(ctx) {
  ctx.crumbs([{ label: 'Automation' }]);
  const root = h('div', { class: 'stack' });
  root.append(h('h1', {}, 'Automation'), h('p', { class: 'muted' }, 'Per app. Off means the feature will not scan, fetch, draft or notify. Auto-apply is only the design-debt stylesheet, and only if you tick it. Undo is on the Design debt page.'));
  const box = h('div', { class: 'stack' });
  root.append(box);
  (async () => {
    try {
      const data = await api('/orbit/flags');
      for (const app of data.apps) {
        const flags = { ...app.flags };
        const rows = data.features.map((k) => {
          const input = h('input', { type: 'checkbox', checked: flags[k], 'aria-label': LABELS[k] || k, onchange: (e) => { flags[k] = e.target.checked; } });
          return h('label', { class: 'flag-row' }, h('span', {}, LABELS[k] || k), input);
        });
        const err = h('input', { class: 'field', type: 'number', value: flags.rollbackErrorPct, 'aria-label': 'Rollback if error rate rises by percent', onchange: (e) => { flags.rollbackErrorPct = +e.target.value; } });
        const p95 = h('input', { class: 'field', type: 'number', value: flags.rollbackP95Ms, 'aria-label': 'Rollback if p95 rises by milliseconds', onchange: (e) => { flags.rollbackP95Ms = +e.target.value; } });
        const watch = h('input', { class: 'field', type: 'number', value: flags.watchMin, 'aria-label': 'Minutes to watch after a promotion', onchange: (e) => { flags.watchMin = +e.target.value; } });
        const samples = h('input', { class: 'field', type: 'number', value: flags.minSamples, 'aria-label': 'Minimum samples before a rollback decision', onchange: (e) => { flags.minSamples = +e.target.value; } });
        const schema = h('input', { type: 'checkbox', checked: flags.giftAllowSchema, onchange: (e) => { flags.giftAllowSchema = e.target.checked; } });
        const authz = h('input', { type: 'checkbox', checked: flags.giftAllowAuth, onchange: (e) => { flags.giftAllowAuth = e.target.checked; } });
        const auto = h('input', { type: 'checkbox', checked: (flags.autoApply || []).includes('debt'), onchange: (e) => { flags.autoApply = e.target.checked ? ['debt'] : []; } });
        const sens = h('input', { class: 'field', value: (flags.sensitiveColumns || []).join(', '), 'aria-label': 'Sensitive columns to mask in a shadow copy', onchange: (e) => { flags.sensitiveColumns = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); } });
        box.append(h('section', { class: 'panel hud', style: { padding: '14px', display: 'grid', gap: '8px' } }, h('h2', {}, app.name), ...rows,
          h('label', {}, 'Rollback if error rate rises by %', err),
          h('label', {}, 'Rollback if p95 rises by ms', p95),
          h('label', {}, 'Watch minutes', watch),
          h('label', {}, 'Minimum samples', samples),
          h('label', { class: 'flag-row' }, h('span', {}, 'Weekly gift may touch schema'), schema),
          h('label', { class: 'flag-row' }, h('span', {}, 'Weekly gift may touch auth'), authz),
          h('label', { class: 'flag-row' }, h('span', {}, 'Auto-apply design-debt CSS (undoable)'), auto),
          h('label', {}, 'Sensitive columns', sens),
          h('button', { class: 'btn', onclick: async () => { try { await api(`/orbit/apps/${app.id}/flags`, { method: 'PUT', body: flags }); toast(`${app.name} saved`); } catch (e) { toast(e.message, 'bad'); } } }, 'Save')));
      }
    } catch (e) { box.append(h('div', { class: 'empty' }, h('b', {}, 'Could not load switches'), h('p', {}, e.message))); }
  })();
  return { el: root, title: 'Automation' };
}
