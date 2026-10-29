import { h, clear, icon, toast, copy, actionBtn, confirmDialog } from '../ui.js';
import { api } from '../api.js';

export function accountPage(ctx) {
  ctx.crumbs([{ label: 'Overview', href: '#/' }, { label: 'Account' }]);
  const host = h('div', { class: 'stack' });
  const field = (id, label, type = 'password', ac = 'new-password') => { const i = h('input', { class: 'field', id, type, autocomplete: ac, required: true }); return { i, el: h('label', { class: 'lbl', for: id }, label, i) }; };

  async function load() {
    let a; try { a = await api('/account'); } catch (e) { clear(host).append(h('div', { class: 'banner bad' }, e.message)); return; }
    const cur = field('pw-cur', 'Current password', 'password', 'current-password'), nw = field('pw-new', `New password (at least ${a.minPassword} characters)`), again = field('pw-again', 'New password again');
    const err = h('p', { class: 'err', role: 'alert' });
    const change = actionBtn({ ic: 'check', label: 'Change password', cls: 'primary', onClick: async () => {
      err.textContent = '';
      if (nw.i.value !== again.i.value) { err.textContent = 'The two new passwords do not match.'; return; }
      try { await api('/account/password', { method: 'POST', body: { current: cur.i.value, next: nw.i.value } }); toast('Password changed', 'ok'); [cur, nw, again].forEach((f) => { f.i.value = ''; }); }
      catch (e) { err.textContent = e.message; }
    } });
    const twofa = h('div');
    const paint2fa = (on) => {
      clear(twofa);
      if (on) {
        const pw = h('input', { class: 'field', type: 'password', placeholder: 'Your password to turn it off', 'aria-label': 'Password', autocomplete: 'current-password' });
        twofa.append(h('p', {}, h('span', { class: 'chip ok' }, icon('shield', 13), 'Two-step sign-in is on')), h('div', { class: 'row wrap', style: { marginTop: '10px' } }, pw,
          actionBtn({ ic: 'x', label: 'Turn off', cls: 'danger', onClick: async () => {
            if (!(await confirmDialog({ title: 'Turn off two-step sign-in?', body: 'Anyone with your password could then sign in.', confirm: 'Turn off', danger: true }))) return;
            try { await api('/account/2fa', { method: 'DELETE', body: { password: pw.value } }); toast('Two-step sign-in is off', 'info'); paint2fa(false); } catch (e) { toast(e.message, 'bad'); } } })));
      } else {
        twofa.append(h('p', { class: 'muted' }, 'Adds a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password) to every sign-in. Strongly recommended, because this dashboard controls your whole server.'),
          actionBtn({ ic: 'shield', label: 'Set up two-step sign-in', cls: 'primary', onClick: async () => {
            const r = await api('/account/2fa/setup', { method: 'POST' });
            const code = h('input', { class: 'field mono', inputmode: 'numeric', maxlength: 6, placeholder: '123456', 'aria-label': '6-digit code', autocomplete: 'one-time-code' });
            const e2 = h('p', { class: 'err', role: 'alert' });
            clear(twofa).append(h('ol', { class: 'steps' },
              h('li', {}, 'In your authenticator app choose "Enter a setup key" (time based) and type this key:', h('div', { class: 'cmd' }, h('code', {}, r.secret.match(/.{1,4}/g).join(' ')), h('button', { class: 'btn sm icon ghost', 'aria-label': 'Copy key', onclick: () => copy(r.secret, 'Key copied') }, icon('copy', 15))),
                h('a', { class: 'small', href: r.uri }, 'Or open it directly on this phone')),
              h('li', {}, 'Type the 6-digit code it shows:', h('div', { class: 'row', style: { marginTop: '8px' } }, code, actionBtn({ ic: 'check', label: 'Turn on', cls: 'primary', onClick: async () => { e2.textContent = ''; try { await api('/account/2fa/enable', { method: 'POST', body: { code: code.value } }); toast('Two-step sign-in is on', 'ok'); paint2fa(true); } catch (e) { e2.textContent = e.message; } } })), e2)));
          } }));
      }
    };
    paint2fa(a.twoFactor);
    clear(host).append(
      h('div', { class: 'row wrap' }, h('h1', { class: 'h2', style: { fontSize: '26px' } }, 'Account'), h('span', { class: 'chip' }, icon('user', 13), `Signed in as ${a.name}`)),
      h('div', { class: 'cols' },
        h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Change password')), h('form', { class: 'pad-form', onsubmit: (e) => { e.preventDefault(); change.click(); } }, cur.el, nw.el, again.el, err, change)),
        h('div', { class: 'stack' },
          h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Two-step sign-in')), h('div', { class: 'pad-form' }, twofa)),
          h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'People with access')), h('div', { class: 'pad-form' }, a.users.map((u) => h('div', { class: 'row', style: { padding: '6px 0' } }, icon('user', 16), h('b', {}, u.name), h('span', { class: 'grow' }), h('span', { class: `chip ${u.twoFactor ? 'ok' : 'warn'}` }, u.twoFactor ? '2-step on' : '2-step off'))))))));
  }
  load();
  return { el: host, title: 'Account' };
}
