// Users and access: who can sign in, and which projects each person can see. Enforced on the server.
import { h, clear, icon, toast, copy, actionBtn, confirmDialog, modal } from '../ui.js';
import { api } from '../api.js';

const tag = (t, text) => h('span', { class: 'hud-tag', dataset: { t } }, text);

export function usersPage(ctx) {
  ctx.crumbs([{ label: 'Overview', href: '#/' }, { label: 'Users' }]);
  const host = h('div', { class: 'stack' });

  function shown(title, name, password) {
    const d = h('div', { class: 'dialog', role: 'dialog', 'aria-label': title, style: { maxWidth: '460px', width: 'calc(100vw - 32px)' } },
      h('h2', { style: { margin: '0 0 6px' } }, title), h('p', { class: 'muted' }, `Give ${name} this password. It is shown once. They can change it in Account.`),
      h('div', { class: 'banner warn', style: { margin: '10px 0' } }, h('code', { style: { wordBreak: 'break-all', userSelect: 'all' } }, password)),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '8px' } }, h('button', { class: 'btn', onclick: () => copy(password) }, 'Copy'), h('button', { class: 'btn primary', onclick: () => m.close() }, 'Done')));
    const m = modal(d);
  }

  function editor(apps, user) {
    const isNew = !user;
    const name = h('input', { class: 'field mono', placeholder: 'username', autocomplete: 'off', 'aria-label': 'Username', value: user?.name || '', disabled: !isNew });
    let role = user?.role || 'member', access = user?.access || 'view'; const picked = new Set(user?.apps || []);
    const roleSel = h('select', { class: 'field', 'aria-label': 'Role', onchange: (e) => { role = e.target.value; paint(); } }, [['member', 'Member (chosen projects only)'], ['admin', 'Admin (everything)']].map(([v, l]) => h('option', { value: v, selected: v === role }, l)));
    const accSel = h('select', { class: 'field', 'aria-label': 'What they can do', onchange: (e) => { access = e.target.value; } }, [['view', 'View only'], ['operate', 'View and restart, redeploy, back up']].map(([v, l]) => h('option', { value: v, selected: v === access }, l)));
    const list = h('div', { class: 'stack', style: { gap: '6px', maxHeight: '260px', overflow: 'auto' } });
    const paint = () => {
      clear(list);
      if (role === 'admin') { list.append(h('p', { class: 'muted small' }, 'Admins see every project and can change anything, including users, connections and the server.')); accSel.disabled = true; return; }
      accSel.disabled = false;
      if (!apps.length) list.append(h('p', { class: 'muted small' }, 'No projects yet.'));
      apps.forEach((a) => list.append(h('label', { class: 'rule', style: { cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: picked.has(a.id), onchange: (e) => { e.target.checked ? picked.add(a.id) : picked.delete(a.id); } }), h('span', { class: 'sw' }), h('div', {}, h('b', {}, a.name), h('div', { class: 'muted small mono' }, a.repo || a.id)))));
    };
    paint();
    const save = async () => {
      try {
        if (isNew) { const r = await api('/users', { method: 'POST', body: { name: name.value, role, access, apps: [...picked] } }); m.close(); shown('User created', r.name, r.password); }
        else { await api(`/users/${encodeURIComponent(user.name)}`, { method: 'PUT', body: { role, access, apps: [...picked] } }); m.close(); toast('Access updated', 'ok'); }
        load();
      } catch (e) { toast(e.message, 'bad'); }
    };
    const d = h('div', { class: 'dialog', role: 'dialog', 'aria-label': isNew ? 'New user' : `Edit ${user.name}`, style: { maxWidth: '520px', width: 'calc(100vw - 32px)', maxHeight: '88vh', overflow: 'auto' } },
      h('h2', { style: { margin: '0 0 10px' } }, isNew ? 'New user' : `Access for ${user.name}`),
      h('div', { class: 'stack' }, isNew && h('label', { class: 'lbl' }, 'Username', name), h('label', { class: 'lbl' }, 'Role', roleSel), h('label', { class: 'lbl' }, 'What they can do', accSel), h('div', { class: 'lbl' }, 'Projects they can see', list),
        isNew && h('p', { class: 'muted small' }, 'A strong password is generated and shown once after you create the user.'),
        h('p', { class: 'muted small' }, 'Members never see the server page, connections, the vault, database contents or user management, and cannot approve changes.')),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '8px', marginTop: '14px' } }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: save }, isNew ? 'Create user' : 'Save')));
    const m = modal(d);
  }

  async function load() {
    let r; try { r = await api('/users'); } catch (e) { clear(host).append(h('div', { class: 'banner bad' }, e.message)); return; }
    const appName = (id) => r.apps.find((a) => a.id === id)?.name || id;
    clear(host).append(
      h('header', { class: 'page-head' }, h('div', {}, h('div', { class: 'hud-eyebrow' }, 'Access'), h('h1', {}, 'Users'), h('p', { class: 'lede' }, 'Create accounts and choose which projects each person can see. Changes apply immediately.')),
        h('button', { class: 'btn primary', onclick: () => editor(r.apps, null) }, icon('plus', 16), 'New user')),
      h('section', { class: 'panel hud' }, h('div', { class: 'panel-head' }, h('h2', {}, `${r.data.length} user${r.data.length === 1 ? '' : 's'}`)),
        h('div', { class: 'stack', style: { padding: '4px 14px 14px', gap: '10px' } }, r.data.map((u) => h('div', { class: 'panel', style: { padding: '12px 14px' } },
          h('div', { class: 'row wrap', style: { justifyContent: 'space-between', gap: '8px', alignItems: 'center' } },
            h('div', { style: { minWidth: 0 } }, h('b', {}, u.name), ' ', tag(u.role === 'admin' ? 'warn' : 'live', u.role), ' ', u.twoFactor ? tag('ok', '2-step on') : h('span', { class: 'muted small' }, '2-step off'), u.name === ctx.state.session?.user && h('span', { class: 'muted small' }, ' (you)')),
            h('div', { class: 'row wrap', style: { gap: '6px' } },
              h('button', { class: 'btn', onclick: () => editor(r.apps, u) }, icon('edit', 15), 'Access'),
              actionBtn({ ic: 'key', label: 'Reset password', onClick: async () => { if (!(await confirmDialog({ title: `Reset ${u.name}'s password?`, body: 'Their current password stops working. You will see a new one once.', confirm: 'Reset' }))) return; const x = await api(`/users/${encodeURIComponent(u.name)}/reset`, { method: 'POST' }); shown('New password', x.name, x.password); } }),
              u.name !== ctx.state.session?.user && actionBtn({ ic: 'x', label: 'Remove', cls: 'danger', onClick: async () => { if (!(await confirmDialog({ title: `Remove ${u.name}?`, body: 'They are signed out and cannot sign in again.', confirm: 'Remove', danger: true }))) return; try { await api(`/users/${encodeURIComponent(u.name)}`, { method: 'DELETE' }); toast('User removed', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } } }))),
          h('div', { class: 'row wrap', style: { gap: '6px', marginTop: '8px' } }, u.role === 'admin' ? h('span', { class: 'muted small' }, 'Sees everything') : [h('span', { class: 'muted small' }, u.access === 'operate' ? 'Can restart, redeploy, back up:' : 'View only:'), ...u.apps.map((a) => h('span', { class: 'chip' }, appName(a)))]))))));
    window.dispatchEvent(new Event('dc:content'));
  }
  load();
  return { el: host, title: 'Users', destroy() {} };
}
