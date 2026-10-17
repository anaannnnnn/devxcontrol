// Credentials you create: per-app panel (used on the Secrets tab) and the all-apps Vault page.
import { h, clear, icon, fmt, toast, copy, confirmDialog, modal, actionBtn } from '../ui.js';
import { api } from '../api.js';
import { emptyState } from './shared.js';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_';
export function generatePassword(n = 20) {
  const out = []; const lim = 256 - (256 % ALPHA.length);
  while (out.length < n) for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) { if (b < lim && out.length < n) out.push(ALPHA[b % ALPHA.length]); }
  return out.join('');
}

function secretCell(appId, cid) {
  const txt = h('span', { class: 'mono' }, '••••••••'); let t = null;
  const get = () => api(`/apps/${appId}/secrets/reveal`, { method: 'POST', body: { type: 'vault', id: cid } }).then((r) => r.value);
  return h('div', { class: 'secret' }, txt,
    h('button', { class: 'btn sm icon ghost', 'aria-label': 'Show for 12 seconds', title: 'Show for 12 seconds', onclick: async () => {
      if (t) { clearTimeout(t); t = null; txt.textContent = '••••••••'; return; }
      try { const v = await get(); txt.textContent = v || '(empty)'; t = setTimeout(() => { txt.textContent = '••••••••'; t = null; }, 12000); } catch (e) { toast(e.message, 'bad'); }
    } }, icon('eye', 16)),
    h('button', { class: 'btn sm icon ghost', 'aria-label': 'Copy password', title: 'Copy', onclick: async () => { try { await copy(await get(), 'Copied (not shown on screen)'); } catch (e) { toast(e.message, 'bad'); } } }, icon('copy', 16)));
}

/** Add / edit dialog. apps: [{id,name}] to choose from, or fixed appId. */
export function credentialForm({ apps, appId, item, onSaved }) {
  const editing = !!item;
  const sel = h('select', { class: 'field', id: 'cf-app', disabled: editing || !!appId }, apps.map((a) => h('option', { value: a.id, selected: a.id === (item?.app || appId) }, a.name)));
  const f = {
    label: h('input', { class: 'field', id: 'cf-label', value: item?.label || '', placeholder: 'e.g. Stripe dashboard, Admin login', maxlength: 80, required: true }),
    user: h('input', { class: 'field mono', id: 'cf-user', value: item?.user || '', autocomplete: 'off', placeholder: 'username or email' }),
    secret: h('input', { class: 'field mono', id: 'cf-secret', type: 'text', autocomplete: 'off', placeholder: editing ? 'leave empty to keep the current one' : 'password or token' }),
    url: h('input', { class: 'field', id: 'cf-url', value: item?.url || '', placeholder: 'https://', inputmode: 'url' }),
    notes: h('textarea', { class: 'field', id: 'cf-notes', rows: 2, maxlength: 1000, placeholder: 'Anything useful, like which environment' }),
  };
  f.notes.value = item?.notes || '';
  const err = h('p', { class: 'err', role: 'alert' });
  const gen = h('button', { class: 'btn sm', type: 'button', onclick: () => { f.secret.value = generatePassword(); f.secret.focus(); } }, icon('sparkle', 15), 'Generate');
  const save = actionBtn({ ic: 'check', label: editing ? 'Save changes' : 'Save credential', cls: 'primary', onClick: async () => {
    err.textContent = '';
    const body = { label: f.label.value, user: f.user.value, url: f.url.value, notes: f.notes.value, ...(f.secret.value ? { secret: f.secret.value } : {}) };
    try {
      const target = editing ? item.app : sel.value;
      await api(editing ? `/apps/${target}/credentials/${item.id}` : `/apps/${target}/credentials`, { method: editing ? 'PUT' : 'POST', body });
      m.close(); toast(editing ? 'Credential updated' : 'Credential saved', 'ok'); onSaved?.();
    } catch (e) { err.textContent = e.message; }
  } });
  const row = (lab, id, ctl, extra) => h('div', { class: 'frow' }, h('label', { class: 'fl', for: id }, h('b', {}, lab)), h('div', { class: 'inline' }, ctl, extra));
  const box = h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': editing ? 'Edit credential' : 'New credential' },
    h('h2', {}, editing ? 'Edit credential' : 'New credential'),
    h('div', { class: 'fgrid one' }, row('App', 'cf-app', sel), row('Label', 'cf-label', f.label), row('Username', 'cf-user', f.user), row('Password', 'cf-secret', f.secret, gen), row('Link', 'cf-url', f.url), row('Notes', 'cf-notes', f.notes)),
    h('p', { class: 'muted small' }, 'Stored encrypted on the server. Passwords are never shown in lists, only when you press the eye or copy button, and each reveal is logged.'),
    err, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save));
  const m = modal(box); f.label.focus();
}

function table(list, apps, reload, showApp) {
  const names = Object.fromEntries(apps.map((a) => [a.id, a.name]));
  if (!list.length) return emptyState('Nothing saved yet', 'Add logins, API keys and tokens for your apps. They are encrypted on the server.');
  return h('div', { class: 'tbl' }, h('table', {},
    h('thead', {}, h('tr', {}, showApp && h('th', {}, 'App'), h('th', {}, 'Label'), h('th', {}, 'Username'), h('th', {}, 'Password'), h('th', {}, ''))),
    h('tbody', {}, list.map((c) => h('tr', {},
      showApp && h('td', {}, h('a', { href: `#/app/${c.app}/secrets` }, names[c.app] || c.app)),
      h('td', {}, h('b', {}, c.label), c.url && h('div', {}, h('a', { class: 'small', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, c.url.replace(/^https?:\/\//, ''))), c.notes && h('div', { class: 'muted small' }, c.notes)),
      h('td', { class: 'mono' }, c.user || '-'),
      h('td', {}, c.hasSecret ? secretCell(c.app, c.id) : '-'),
      h('td', {}, h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('button', { class: 'btn sm icon ghost', title: 'Edit', 'aria-label': `Edit ${c.label}`, onclick: () => credentialForm({ apps, item: c, onSaved: reload }) }, icon('edit', 15)),
        h('button', { class: 'btn sm icon ghost danger', title: 'Delete', 'aria-label': `Delete ${c.label}`, onclick: async () => {
          if (!(await confirmDialog({ title: `Delete "${c.label}"?`, body: 'This removes the saved credential from the vault. It does not change the app itself.', confirm: 'Delete', danger: true }))) return;
          try { await api(`/apps/${c.app}/credentials/${c.id}`, { method: 'DELETE' }); toast('Credential deleted', 'ok'); reload(); } catch (e) { toast(e.message, 'bad'); }
        } }, icon('trash', 15)))))))));
}

/** Panel for one app (Secrets tab). */
export function credentialsPanel(app, apps, initial) {
  const host = h('div');
  const paint = (list) => { clear(host).append(table(list, apps, reload, false)); };
  async function reload() { try { paint((await api(`/apps/${app.id}/credentials`)).data); } catch (e) { clear(host).append(emptyState('Could not load credentials', e.message)); } }
  paint(initial || []);
  return h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Your credentials'), h('span', { class: 'grow' }),
    h('button', { class: 'btn sm primary', onclick: () => credentialForm({ apps, appId: app.id, onSaved: reload }) }, icon('plus', 15), 'New credential')), host);
}

/** All apps. */
export function vaultPage(ctx) {
  ctx.crumbs([{ label: 'Overview', href: '#/' }, { label: 'Vault' }]);
  const apps = ctx.fleet.apps.map((a) => ({ id: a.id, name: a.name }));
  const host = h('div'); let all = [], q = '', appFilter = '';
  const paint = () => {
    const list = all.filter((c) => (!appFilter || c.app === appFilter) && (!q || `${c.label} ${c.user} ${c.url} ${c.notes}`.toLowerCase().includes(q)));
    clear(host).append(table(list, apps, load, true));
  };
  async function load() { try { all = (await api('/credentials')).data; paint(); } catch (e) { clear(host).append(emptyState('Could not load the vault', e.message)); } }
  load();
  const search = h('input', { class: 'field', type: 'search', placeholder: 'Search credentials', 'aria-label': 'Search credentials', oninput: (e) => { q = e.target.value.toLowerCase(); paint(); } });
  const filt = h('select', { class: 'field', 'aria-label': 'Filter by app', onchange: (e) => { appFilter = e.target.value; paint(); } }, h('option', { value: '' }, 'All apps'), apps.map((a) => h('option', { value: a.id }, a.name)));
  const el = h('div', { class: 'stack' },
    h('div', { class: 'row wrap' }, h('h1', { class: 'h2', style: { fontSize: '26px' } }, 'Vault'), h('span', { class: 'grow' }), search, filt,
      h('button', { class: 'btn primary', onclick: () => credentialForm({ apps, onSaved: load }) }, icon('plus', 16), 'New credential')),
    h('div', { class: 'banner demo' }, icon('shield'), h('span', {}, 'Encrypted at rest. Every reveal is written to the Activity log.')),
    h('section', { class: 'panel' }, host));
  return { el, title: 'Vault' };
}
