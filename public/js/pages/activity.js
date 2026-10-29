import { h, clear, toast } from '../ui.js';
import { api } from '../api.js';
import { eventRow, emptyState } from './shared.js';

export function activityPage(ctx) {
  ctx.crumbs([{ label: 'Overview', href: '#/' }, { label: 'Activity' }]);
  const names = Object.fromEntries(ctx.fleet.apps.map((a) => [a.id, a.name]));
  const list = h('div', { class: 'events' });
  let before = null, filter = 'all', all = [];
  const more = h('button', { class: 'btn sm', hidden: true, onclick: () => load() }, 'Load older');
  const kinds = [['all', 'Everything'], ['bad', 'Problems'], ['action', 'Actions'], ['secret', 'Secrets'], ['auth', 'Sign-ins']];
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter activity' }, kinds.map(([k, l]) => h('button', { 'aria-pressed': String(k === filter), onclick: (e) => { filter = k; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); paint(); } }, l)));
  const match = (e) => filter === 'all' || (filter === 'bad' ? e.level === 'bad' : e.type === filter);
  function paint() {
    clear(list);
    const v = all.filter(match);
    if (!v.length) list.append(emptyState('Nothing here', filter === 'all' ? 'Starts, stops, deploys, backups and incidents are recorded here.' : 'No events match this filter.'));
    v.forEach((e) => list.append(eventRow(e, e.app ? names[e.app] : null)));
  }
  async function load() {
    try { const r = await api(`/events?limit=50${before ? `&before=${before}` : ''}`); all.push(...r.data); before = r.pagination.next_cursor; more.hidden = !r.pagination.has_more; paint(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  load();
  const el = h('div', { class: 'stack' }, h('div', { class: 'row wrap' }, h('h1', { class: 'h2', style: { fontSize: '26px' } }, 'Activity'), h('span', { class: 'grow' }), seg),
    h('section', { class: 'panel' }, list, h('div', { style: { padding: '8px 14px 14px' } }, more)));
  return { el, title: 'Activity' };
}
