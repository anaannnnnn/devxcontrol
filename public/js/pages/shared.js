import { h, icon, fmt } from '../ui.js';

const EV_ICON = { status: 'alert', action: 'restart', auth: 'lock', secret: 'key', backup: 'archive', redeploy: 'rocket', host: 'server' };
export function eventRow(e, appName) {
  const ic = e.level === 'ok' ? 'check' : EV_ICON[e.type] || 'activity';
  return h('div', { class: 'ev', dataset: { l: e.level } },
    h('span', { class: 'ic' }, icon(ic, 18)),
    h('div', {}, h('div', {}, e.msg), appName && h('div', { class: 'muted small' }, appName)),
    h('time', { class: 't', datetime: new Date(e.t).toISOString(), title: new Date(e.t).toLocaleString() }, fmt.ago(e.t)));
}
export const emptyState = (title, body) => h('div', { class: 'empty' }, h('b', {}, title), body);
