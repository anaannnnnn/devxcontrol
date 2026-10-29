// Command palette: fuzzy jump to any app, page or action.
import { h, clear, icon, modal, toast, STATUS_LABEL } from './ui.js';
import { api } from './api.js';

const score = (q, text) => {
  if (!q) return 1;
  q = q.toLowerCase(); text = text.toLowerCase();
  if (text.includes(q)) return 100 - text.indexOf(q);
  let i = 0, run = 0, best = 0;
  for (const ch of text) { if (ch === q[i]) { i++; run++; best += run; } else run = 0; if (i === q.length) return best; }
  return 0;
};

export function openPalette({ admin = true, fleet, go, refresh, toggleTheme, signOut }) {
  const items = [
    { label: 'Fleet overview', hint: 'g f', ic: 'radar', run: () => go('/') },
    { label: 'Autopilot', hint: 'g p', ic: 'flow', run: () => go('/pipeline') },
    { label: 'Change reports', hint: 'g r', ic: 'diff', run: () => go('/reviews') },
    { label: 'Onboard a GitHub repo', admin: true, hint: 'g o', ic: 'github', run: () => go('/onboard') },
    { label: 'Studio: storage and platform', hint: '', ic: 'cube', run: () => go('/studio') },
    { label: 'GitHub updates', hint: 'g u', ic: 'bolt', run: () => go('/updates') },
    { label: 'Credentials vault', admin: true, hint: 'g v', ic: 'lock', run: () => go('/vault') },
    { label: 'Connections: GitHub and AI model', admin: true, hint: '', ic: 'key', run: () => go('/connections') },
    { label: 'Account and 2-step sign-in', hint: '', ic: 'user', run: () => go('/account') },
    { label: 'Users and access', hint: '', ic: 'user', admin: true, run: () => go('/users') },
    { label: 'Setup checklist', admin: true, hint: '', ic: 'check', run: () => window.dispatchEvent(new CustomEvent('dc:setup')) },
    { label: 'Backups', hint: 'g b', ic: 'archive', run: () => go('/backups') },
    { label: 'Activity log', hint: 'g a', ic: 'activity', run: () => go('/activity') },
    { label: 'Server and Caddy', admin: true, hint: 'g s', ic: 'server', run: () => go('/host') },
  ];
  if (!admin) { for (let i = items.length - 1; i >= 0; i--) if (items[i].admin) items.splice(i, 1); }
  for (const a of fleet.apps) {
    items.push({ label: `Open ${a.name}`, hint: STATUS_LABEL[a.status], ic: 'fleet', run: () => go(`/app/${a.id}`), kw: a.id });
    items.push({ label: `Logs: ${a.name}`, hint: 'tab', ic: 'terminal', run: () => go(`/app/${a.id}/logs`), kw: a.id });
    a.urls.slice(0, 1).forEach((u) => items.push({ label: `Visit ${a.name} site`, hint: u.url.replace('https://', ''), ic: 'external', run: () => window.open(u.url, '_blank', 'noopener,noreferrer'), kw: a.id }));
    items.push({ label: `Restart ${a.name}`, hint: 'action', ic: 'restart', kw: a.id, run: async () => { try { await api(`/apps/${a.id}/restart`, { method: 'POST' }); toast(`${a.name}: restart sent`, 'ok'); } catch (e) { toast(e.message, 'bad'); } refresh(); } });
    if (admin && a.hasDb) items.push({ label: `Database: ${a.name}`, hint: 'tables', ic: 'table', kw: `${a.id} db sql`, run: () => go(`/app/${a.id}/database`) });
    if (admin && ['postgres', 'sqlite'].includes(a.db?.type)) items.push({ label: `Back up ${a.name} now`, hint: 'action', ic: 'archive', kw: a.id, run: () => go(`/app/${a.id}/data`) });
  }
  items.push({ label: 'Toggle light or dark theme', hint: '', ic: 'sun', run: toggleTheme }, { label: 'Sign out', hint: '', ic: 'logout', run: signOut });

  let sel = 0, shown = items;
  const list = h('ul', { role: 'listbox', id: 'pal-list' });
  const input = h('input', { type: 'text', placeholder: 'Type an app or action', 'aria-label': 'Search commands', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list', autocomplete: 'off', spellcheck: 'false' });
  const paint = () => {
    clear(list);
    if (!shown.length) list.append(h('li', { 'aria-disabled': 'true' }, 'Nothing matches. Try an app name.'));
    shown.slice(0, 40).forEach((it, i) => list.append(h('li', { role: 'option', id: `pal-${i}`, 'aria-selected': String(i === sel), onclick: () => choose(i), onpointermove: () => { if (sel !== i) { sel = i; paint(); } } }, icon(it.ic, 18), h('span', {}, it.label), h('span', { class: 'hint' }, it.hint || ''))));
    input.setAttribute('aria-activedescendant', `pal-${sel}`);
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (i) => { const it = shown[i]; if (!it) return; m.close(); it.run(); };
  input.addEventListener('input', () => {
    const q = input.value.trim();
    shown = items.map((it) => [it, score(q, `${it.label} ${it.kw || ''}`)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([it]) => it);
    sel = 0; paint();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, Math.min(shown.length, 40) - 1); paint(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
    if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
  });
  const box = h('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' }, input, list,
    h('div', { class: 'foot' }, h('span', {}, h('kbd', {}, '↑↓'), 'move'), h('span', {}, h('kbd', {}, 'Enter'), 'run'), h('span', {}, h('kbd', {}, 'Esc'), 'close')));
  const m = modal(box);
  paint(); input.focus();
}
