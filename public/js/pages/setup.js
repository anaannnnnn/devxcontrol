// First-login checklist. Shown once; each step is one click.
import { h, clear, icon, toast, copy, actionBtn, modal } from '../ui.js';
import { forgetDomains } from './domainpick.js';
import { api, stream } from '../api.js';

export async function maybeSetup({ force = false, go } = {}) {
  let s; try { s = await api('/setup'); } catch { return; }
  if (!s.show && !force) return;
  const body = h('div', { class: 'stack' });
  const log = h('pre', { class: 'term-log', hidden: true, style: { maxHeight: '140px', overflow: 'auto', fontSize: '12px' } });
  const card = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Finish setting up', style: { maxWidth: '560px', width: 'calc(100vw - 32px)', maxHeight: '88vh', overflow: 'auto' } });
  const m = modal(card);
  let es;
  const watch = (jobId, after) => { log.hidden = false; clear(log); es?.close(); es = stream(`/jobs/${jobId}/stream`, { line: (l) => { log.append(h('span', { class: 'ln' }, l + '\n')); log.scrollTop = log.scrollHeight; }, done: ({ code }) => { es?.close(); toast(code === 0 ? 'Done' : 'Failed, read the log', code === 0 ? 'ok' : 'bad'); after?.(code); load(); } }); };
  const row = (done, title, note, action) => h('div', { class: 'row', style: { gap: '12px', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--line, rgba(255,255,255,.08))' } },
    h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start', minWidth: 0 } }, h('span', { class: `chip ${done ? 'ok' : ''}`, style: { flex: 'none' } }, icon(done ? 'check' : 'bolt', 13)), h('div', {}, h('b', {}, title), h('div', { class: 'muted', style: { fontSize: '13px' } }, note))),
    done ? h('span', { class: 'muted' }, 'Done') : action);
  async function load() {
    try { s = await api('/setup'); } catch { return; }
    const steps = [];
    steps.push(row(s.scanners.have === s.scanners.total, 'Download the scanners', `Security, tests and Docker checks. ${s.scanners.have}/${s.scanners.total} ready.`,
      actionBtn({ ic: 'download', label: s.job ? 'Downloading' : 'Download', cls: 'primary', disabled: !!s.job, onClick: async () => { try { const r = await api('/setup/scanners', { method: 'POST' }); watch(r.job); } catch (e) { toast(e.message, 'bad'); } } })));
    steps.push(row(s.ai, 'Install the free AI model', 'Ollama on this server. Several GB, takes a few minutes.',
      actionBtn({ ic: 'bolt', label: 'Install', cls: 'primary', onClick: async () => { try { const r = await api('/connections/ollama/install', { method: 'POST', body: { model: 'qwen2.5-coder:7b' } }); watch(r.job); } catch (e) { toast(e.message, 'bad'); } } })));
    steps.push(row(s.github, 'Connect GitHub', 'Needs the App ID and key file, so this one opens Connections.',
      h('button', { class: 'btn primary', onclick: () => { m.close(); go?.('/connections'); } }, 'Open')));
    const dnsBox = h('div');
    const have = s.dns || {};
    steps.push(row(have.cloudflare || have.godaddy, 'Connect Cloudflare or GoDaddy', 'Lets new apps get a URL and a DNS record automatically.',
      h('button', { class: 'btn primary', onclick: () => {
        const cf = h('input', { class: 'field mono', type: 'password', autocomplete: 'off', placeholder: 'Cloudflare API token', 'aria-label': 'Cloudflare API token' });
        const gk = h('input', { class: 'field mono', autocomplete: 'off', placeholder: 'GoDaddy key', 'aria-label': 'GoDaddy key' });
        const gs = h('input', { class: 'field mono', type: 'password', autocomplete: 'off', placeholder: 'GoDaddy secret', 'aria-label': 'GoDaddy secret' });
        const put = async (p, body) => { try { const r = await api(`/connections/dns/${p}`, { method: 'PUT', body }); forgetDomains(); toast(`Connected. ${r.domains.length} domain(s) found`, 'ok'); await load(); } catch (e) { toast(e.message, 'bad'); } };
        clear(dnsBox).append(h('div', { class: 'banner info', style: { display: 'block' } },
          h('p', { class: 'muted small' }, 'Cloudflare: My Profile, API Tokens, Create Token. Permissions: Zone Read and DNS Edit.'), cf,
          h('div', { style: { marginTop: '6px' } }, h('button', { class: 'btn primary', onclick: () => cf.value.trim() ? put('cloudflare', { token: cf.value }) : toast('Paste the token first', 'bad') }, 'Save Cloudflare')),
          h('p', { class: 'muted small', style: { marginTop: '12px' } }, 'GoDaddy (optional): developer.godaddy.com, Keys, Production.'), gk, gs,
          h('div', { style: { marginTop: '6px' } }, h('button', { class: 'btn', onclick: () => gk.value.trim() && gs.value.trim() ? put('godaddy', { key: gk.value, secret: gs.value }) : toast('Enter the key and the secret', 'bad') }, 'Save GoDaddy'))));
      } }, 'Connect')));
    steps.push(dnsBox);
    const pwOut = h('div');
    steps.push(row(!s.defaultPassword, 'Replace the default password', 'Makes a strong one for you. It is shown once, so copy it.',
      actionBtn({ ic: 'lock', label: 'Generate', cls: 'primary', onClick: async () => { try { const r = await api('/setup/password', { method: 'POST' }); clear(pwOut).append(h('div', { class: 'banner warn' }, h('div', {}, 'New password, shown once:'), h('code', { style: { wordBreak: 'break-all', userSelect: 'all' } }, r.password), h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn', onclick: () => copy(r.password) }, 'Copy')))); toast('Password replaced', 'ok'); } catch (e) { toast(e.message, 'bad'); } } })));
    steps.push(pwOut);
    const tf = h('div');
    steps.push(row(s.twoFactor, 'Turn on two-step sign-in', 'Use any authenticator app.',
      actionBtn({ ic: 'shield', label: 'Set up', cls: 'primary', onClick: async () => {
        try {
          const r = await api('/account/2fa/setup', { method: 'POST' });
          const code = h('input', { class: 'field', inputmode: 'numeric', maxlength: 6, placeholder: '6-digit code', 'aria-label': '6-digit code' });
          clear(tf).append(h('div', { class: 'banner info' }, h('div', {}, 'Add this key in your authenticator app:'), h('code', { style: { wordBreak: 'break-all', userSelect: 'all' } }, r.secret), h('div', { class: 'row wrap', style: { marginTop: '8px', gap: '8px' } }, h('button', { class: 'btn', onclick: () => copy(r.secret) }, 'Copy key'), h('a', { class: 'btn', href: r.uri }, 'Open in app'), code, actionBtn({ ic: 'check', label: 'Turn on', cls: 'primary', onClick: async () => { try { await api('/account/2fa/enable', { method: 'POST', body: { code: code.value.trim() } }); toast('Two-step sign-in is on', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } } }))));
        } catch (e) { toast(e.message, 'bad'); }
      } })));
    steps.push(tf);
    clear(body).append(...steps, log);
  }
  const finish = async () => { es?.close(); try { await api('/setup/dismiss', { method: 'POST' }); } catch { /* ignore */ } m.close(); };
  card.append(h('h2', { style: { margin: '0 0 4px' } }, 'Finish setting up'), h('p', { class: 'muted', style: { margin: '0 0 8px' } }, 'One click each. You will only see this once.'), body,
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, h('button', { class: 'btn primary', onclick: finish }, 'Done, do not show again')));
  await load();
}
