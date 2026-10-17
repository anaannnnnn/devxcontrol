import { h, icon } from '../ui.js';
import { api, setCsrf } from '../api.js';
import { mountScene } from '../scene.js';

export function loginView({ demo, onDone }) {
  const err = h('p', { class: 'err', role: 'alert', id: 'err' });
  const user = h('input', { class: 'field', id: 'user', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, value: (() => { try { return localStorage.getItem('dc-user') || ''; } catch { return ''; } })() });
  const pw = h('input', { class: 'field', id: 'pw', type: 'password', autocomplete: 'current-password', required: true, 'aria-describedby': 'err' });
  const code = h('input', { class: 'field mono', id: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, pattern: '\\d{6}', placeholder: '123456' });
  const codeRow = h('label', { class: 'lbl', for: 'code', hidden: true }, 'Authenticator code', code);
  const btn = h('button', { class: 'btn primary glow', type: 'submit', style: { height: '48px' } }, 'Sign in');
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true; btn.textContent = 'Checking...';
      try {
        const r = await api('/session', { method: 'POST', body: { username: user.value, password: pw.value, code: code.value || undefined } });
        try { localStorage.setItem('dc-user', r.user); } catch { /* ignore */ }
        setCsrf(r.csrf); onDone();
      } catch (ex) {
        err.textContent = ex.message; btn.disabled = false; btn.textContent = 'Sign in';
        if (/6-digit/.test(ex.message)) { codeRow.hidden = false; code.focus(); } else pw.select();
      }
    },
  },
    h('label', { class: 'lbl', for: 'user' }, 'Username', user),
    h('label', { class: 'lbl', for: 'pw' }, 'Password', pw),
    codeRow, err, btn);
  const bg = h('div', { class: 'scene-bg', 'aria-hidden': 'true' });
  const el = h('div', { class: 'login' }, bg,
    h('div', { class: 'card' },
      h('div', { class: 'logo-mark' }, icon('radar', 34)),
      h('h1', {}, 'DevX Control'),
      h('p', { class: 'lede' }, demo ? 'Demo mode. Sign in as anan or subunu.' : 'Every platform you run, one sign-in away.'),
      form));
  mountScene(bg, { apps: [], hostLabel: '' });
  queueMicrotask(() => (user.value ? pw : user).focus());
  return el;
}
