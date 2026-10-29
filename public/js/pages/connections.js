// Connections: the GitHub App and the AI model that Autopilot, Studio and Onboard use.
import { h, clear, icon, toast, actionBtn, confirmDialog } from '../ui.js';
import { forgetDomains } from './domainpick.js';
import { api, stream } from '../api.js';
import { mongoClustersPanel } from './mongo.js';

const tag = (t, text) => h('span', { class: 'hud-tag', dataset: { t } }, text);
const head = (t, ...r) => h('div', { class: 'panel-head' }, h('h2', {}, t), h('span', { class: 'grow' }), ...r);
const GB = (b) => (b ? `${(b / 1073741824).toFixed(1)} GB` : '');

export function connectionsPage(ctx) {
  ctx.crumbs([{ label: 'Overview', href: '#/' }, { label: 'Connections' }]);
  const host = h('div', { class: 'stack' });
  let es = null;

  async function load() {
    let c; try { c = await api('/connections'); } catch (e) { clear(host).append(h('div', { class: 'banner bad' }, e.message)); return; }
    clear(host).append(
      h('header', { class: 'page-head' }, h('div', {}, h('div', { class: 'hud-eyebrow' }, 'Set up once'), h('h1', {}, 'Connections'), h('p', { class: 'lede' }, 'GitHub gives Autopilot, Studio and Onboard your repos. An AI model writes fixes, reports and suggestions.'))),
      h('div', { class: 'cols' }, githubPanel(c), aiPanel(c)), mongoClustersPanel(c, { reload: load }), dnsPanel(c));
    window.dispatchEvent(new Event('dc:content'));
  }

  function githubPanel(c) {
    const s = c.githubStatus || { connected: false };
    if (c.github && s.connected) {
      const sel = h('select', { class: 'field', 'aria-label': 'Installation', onchange: async (e) => { try { await api('/connections/github/installation', { method: 'POST', body: { id: e.target.value } }); toast('Installation selected', 'ok'); load(); } catch (er) { toast(er.message, 'bad'); } } }, s.installations.map((i) => h('option', { value: i.id, selected: String(i.id) === String(s.installationId) }, `${i.account} (${i.selection === 'all' ? 'all repos' : 'selected repos'})`)));
      const perms = s.app.perms || {}; const needs = [['contents', 'write'], ['pull_requests', 'write']].filter(([k, v]) => perms[k] !== v);
      return h('section', { class: 'panel hud' }, head('GitHub App', tag('ok', 'connected')), h('div', { class: 'pad-form stack' },
        h('dl', { class: 'kv' }, h('dt', {}, 'App'), h('dd', {}, h('a', { href: s.app.url, target: '_blank', rel: 'noopener' }, s.app.name)), h('dt', {}, 'App ID'), h('dd', { class: 'mono' }, c.github.appId)),
        s.installations.length ? h('div', { class: 'stack', style: { gap: '6px' } }, h('b', {}, 'Accounts using this app'), s.installations.map((i) => { const ok = i.perms?.contents === 'write' && i.perms?.pull_requests === 'write'; return h('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center' } }, h('span', { class: 'mono' }, i.account), h('span', { class: 'muted small' }, i.selection === 'all' ? 'all repos' : 'selected repos'), h('span', { class: `chip ${ok ? 'ok' : 'warn'}` }, ok ? 'can push and open PRs' : 'read only: accept new permissions'), !ok && i.url && h('a', { class: 'btn sm', href: i.url, target: '_blank', rel: 'noopener' }, 'Accept on GitHub')); })) : h('div', { class: 'banner warn', style: { margin: 0 } }, icon('alert'), h('span', {}, 'The app is not installed on any account yet.'), h('a', { class: 'btn sm', href: s.installUrl, target: '_blank', rel: 'noopener' }, 'Install it')),
        needs.length ? h('div', { class: 'banner warn', style: { margin: 0 } }, icon('alert'), h('span', {}, `Autopilot needs ${needs.map(([k]) => `${k.replace('_', ' ')}: write`).join(' and ')} to push branches and open pull requests. Change it in the app settings on GitHub, then accept the new permissions.`)) : h('div', { class: 'banner ok', style: { margin: 0 } }, icon('check'), h('span', {}, 'Permissions allow pushing branches and opening pull requests.')),
        h('div', { class: 'row wrap' }, h('a', { class: 'btn', href: s.installUrl, target: '_blank', rel: 'noopener' }, icon('external', 14), 'Add another account or repos'), actionBtn({ ic: 'refresh', label: 'Refresh', onClick: load }),
          actionBtn({ ic: 'x', label: 'Disconnect', cls: 'danger', onClick: async () => { if (!(await confirmDialog({ title: 'Disconnect GitHub?', body: 'Scans, Studio file views and Onboard stop working until you connect again. Your repos are not touched.', confirm: 'Disconnect', danger: true }))) return; await api('/connections/github', { method: 'DELETE' }); load(); } }))));
    }
    const appId = h('input', { class: 'field mono', inputmode: 'numeric', placeholder: '1234567', 'aria-label': 'App ID', value: c.github?.appId || '' });
    const key = h('textarea', { class: 'field mono', rows: 5, placeholder: '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----', 'aria-label': 'Private key', style: { height: 'auto', padding: '10px 12px', width: '100%' } });
    return h('section', { class: 'panel hud' }, head('GitHub App', tag(c.github ? 'warn' : 'idle', c.github ? 'saved, not working' : 'not connected')), h('div', { class: 'pad-form stack' },
      c.github && s.error && h('div', { class: 'banner bad', style: { margin: 0 } }, icon('alert'), h('span', {}, s.error)),
      h('ol', { class: 'steps' },
        h('li', {}, 'On GitHub open ', h('a', { href: 'https://github.com/settings/apps/new', target: '_blank', rel: 'noopener' }, 'Settings, Developer settings, New GitHub App'), '. Name it anything. Homepage URL: this site. Untick Webhook.'),
        h('li', {}, 'Repository permissions: ', h('b', {}, 'Contents: Read and write'), ', ', h('b', {}, 'Pull requests: Read and write'), ', Metadata: Read. Create the app.'),
        h('li', {}, 'On the app page copy the ', h('b', {}, 'App ID'), ', then press ', h('b', {}, 'Generate a private key'), ' and open the downloaded .pem file.'),
        h('li', {}, 'Paste both here and save. Then install the app on your account (you choose which repos).')),
      h('label', { class: 'lbl' }, 'App ID', appId), h('label', { class: 'lbl' }, 'Private key (.pem)', key),
      h('div', { class: 'row' }, actionBtn({ ic: 'check', label: 'Save and check', cls: 'primary', onClick: async () => { try { const r = await api('/connections/github', { method: 'PUT', body: { appId: appId.value, privateKey: key.value } }); toast(r.connected ? 'GitHub connected' : (r.error || 'Saved, but GitHub did not accept it'), r.connected ? 'ok' : 'bad'); load(); } catch (e) { toast(e.message, 'bad'); } } }))));
  }

  function dnsPanel(c) {
    const have = c.dns || {};
    const list = h('div', { class: 'row wrap', style: { gap: '6px' } });
    const paintDomains = (r) => { clear(list); (r.domains || []).forEach((d) => list.append(h('span', { class: 'chip' }, `${d.name} · ${d.provider}`))); Object.values(r.errors || {}).forEach((e) => list.append(h('div', { class: 'banner warn', style: { margin: 0, width: '100%' } }, icon('alert'), h('span', {}, e)))); if (!(r.domains || []).length && !Object.keys(r.errors || {}).length) list.append(h('span', { class: 'muted small' }, 'No domains found in the connected accounts.')); };
    if (have.cloudflare || have.godaddy) api('/dns/domains').then(paintDomains).catch((e) => clear(list).append(h('div', { class: 'banner bad' }, e.message)));
    const cfTok = h('input', { class: 'field mono', type: 'password', autocomplete: 'off', placeholder: have.cloudflare ? 'Saved. Paste a new token to replace it' : 'Cloudflare API token', 'aria-label': 'Cloudflare API token' });
    const gdKey = h('input', { class: 'field mono', autocomplete: 'off', placeholder: 'GoDaddy key', 'aria-label': 'GoDaddy key' });
    const gdSec = h('input', { class: 'field mono', type: 'password', autocomplete: 'off', placeholder: have.godaddy ? 'Saved. Paste a new secret to replace it' : 'GoDaddy secret', 'aria-label': 'GoDaddy secret' });
    const save = (p, body, clearFns) => async () => { try { const r = await api(`/connections/dns/${p}`, { method: 'PUT', body }); forgetDomains(); toast(`${p === 'cloudflare' ? 'Cloudflare' : 'GoDaddy'} connected`, 'ok'); clearFns.forEach((f) => { f.value = ''; }); load(); return r; } catch (e) { toast(e.message, 'bad'); } };
    const off = (p) => actionBtn({ ic: 'x', label: 'Disconnect', cls: 'danger', onClick: async () => { if (!(await confirmDialog({ title: `Disconnect ${p}?`, body: 'Existing DNS records stay as they are. New apps will not get records automatically.', confirm: 'Disconnect', danger: true }))) return; await api(`/connections/dns/${p}`, { method: 'DELETE' }); load(); } });
    return h('section', { class: 'panel hud' }, head('Domains and DNS', tag(have.cloudflare || have.godaddy ? 'ok' : 'warn', have.cloudflare || have.godaddy ? 'connected' : 'optional')), h('div', { class: 'pad-form stack' },
      h('p', { class: 'muted' }, 'Connect Cloudflare and/or GoDaddy. When you onboard an app, DevX Control suggests a URL on one of your domains, creates the DNS record that points it at this server, and adds the Caddy route and HTTPS certificate.'),
      list,
      h('div', { class: 'cols eq' },
        h('div', { class: 'stack' }, h('b', {}, 'Cloudflare'), h('p', { class: 'muted small' }, 'My Profile, API Tokens, Create Token. Permissions: Zone Read and DNS Edit, on the zones you want to use.'), cfTok,
          h('div', { class: 'row wrap' }, actionBtn({ ic: 'check', label: 'Save and check', cls: 'primary', onClick: async () => { if (!cfTok.value.trim()) { toast('Paste the token first', 'bad'); return; } await save('cloudflare', { token: cfTok.value }, [cfTok])(); } }), have.cloudflare && off('cloudflare'))),
        h('div', { class: 'stack' }, h('b', {}, 'GoDaddy'), h('p', { class: 'muted small' }, 'developer.godaddy.com, Keys, Create New API Key (Production). GoDaddy only allows this for accounts with enough domains.'), gdKey, gdSec,
          h('div', { class: 'row wrap' }, actionBtn({ ic: 'check', label: 'Save and check', cls: 'primary', onClick: async () => { if (!gdKey.value.trim() || !gdSec.value.trim()) { toast('Enter the key and the secret', 'bad'); return; } await save('godaddy', { key: gdKey.value, secret: gdSec.value }, [gdKey, gdSec])(); } }), have.godaddy && off('godaddy')))),
      ));
  }

  function aiPanel(c) {
    const cur = c.llm || {};
    const base = h('input', { class: 'field mono', value: cur.baseUrl || '', placeholder: 'https://api.groq.com/openai/v1', 'aria-label': 'Endpoint' });
    const model = h('input', { class: 'field mono', value: cur.model || '', placeholder: 'model name', 'aria-label': 'Model', list: 'models' });
    const key = h('input', { class: 'field mono', type: 'password', autocomplete: 'off', placeholder: cur.hasKey ? 'saved (leave empty to keep)' : 'API key (not needed for Ollama)', 'aria-label': 'API key' });
    const dl = h('datalist', { id: 'models' });
    const result = h('div');
    const preset = (p) => { base.value = p.baseUrl; model.value = p.model; key.placeholder = p.key ? 'paste your free API key' : 'not needed'; toast(p.note, 'info'); };
    const test = actionBtn({ ic: 'bolt', label: 'Test', disabled: !c.llm, onClick: async () => { clear(result); try { const r = await api('/connections/llm/test', { method: 'POST' }); result.append(h('div', { class: 'banner ok', style: { margin: 0 } }, icon('check'), h('span', {}, `${r.model} answered in ${(r.ms / 1000).toFixed(1)} s: "${r.reply}"`))); } catch (e) { result.append(h('div', { class: 'banner bad', style: { margin: 0 } }, icon('alert'), h('span', {}, e.message))); } } });
    if (c.llm) api('/connections/llm/models').then((m) => m.models.forEach((x) => dl.append(h('option', { value: x })))).catch(() => {});
    const model7 = h('select', { class: 'field', 'aria-label': 'Ollama model' }, [['qwen2.5-coder:7b', 'qwen2.5-coder 7B (about 4.7 GB download, 6 GB RAM)'], ['qwen2.5-coder:3b', 'qwen2.5-coder 3B (about 1.9 GB, 3 GB RAM)'], ['llama3.2:3b', 'llama 3.2 3B (about 2 GB, 3 GB RAM)']].map(([v, l]) => h('option', { value: v }, l)));
    const log = h('div', { class: 'term', hidden: true, role: 'log' });
    const install = actionBtn({ ic: 'download', label: c.ollama.installed ? 'Download model' : 'Install on this server', onClick: async () => {
      if (!(await confirmDialog({ title: 'Install Ollama here?', body: `This runs an Ollama container and downloads the model. It uses disk and memory on this server${c.memTotal ? ` (${GB(c.memTotal)} RAM total)` : ''}. Other apps could slow down while it runs.`, confirm: 'Install' }))) return;
      try { const r = await api('/connections/ollama/install', { method: 'POST', body: { model: model7.value } }); log.hidden = false; clear(log); es = stream(`/jobs/${r.job}/stream`, { line: (l) => { log.append(h('span', { class: 'ln' }, l)); log.scrollTop = log.scrollHeight; }, done: ({ code }) => { es?.close(); toast(code === 0 ? 'Local Qwen fallback is ready' : 'Install failed, read the log', code === 0 ? 'ok' : 'bad'); if (code === 0) load(); } }); } catch (e) { toast(e.message, 'bad'); } } });
    return h('section', { class: 'panel hud' }, head('AI model', tag(c.llm ? 'ok' : 'idle', c.llm ? cur.model : 'not connected')), h('div', { class: 'pad-form stack' },
      h('p', { class: 'muted' }, `Databricks is the primary model for all AI features. ${c.llmFallback ? `Local ${c.llmFallback.model} is the automatic fallback if Databricks is unavailable.` : 'No local backup model is configured.'}`),
      h('div', { class: 'row wrap' }, c.presets.map((p) => h('button', { class: 'btn sm', onclick: () => preset(p), title: p.note }, p.name))),
      h('label', { class: 'lbl' }, 'Endpoint', base), h('label', { class: 'lbl' }, 'Model', model, dl), h('label', { class: 'lbl' }, 'API key', key),
      h('div', { class: 'row wrap' }, actionBtn({ ic: 'check', label: 'Save', cls: 'primary', onClick: async () => { try { await api('/connections/llm', { method: 'PUT', body: { baseUrl: base.value, model: model.value, apiKey: key.value } }); toast('AI model saved', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } } }), test,
        c.llm && actionBtn({ ic: 'x', label: 'Remove', cls: 'danger', onClick: async () => { await api('/connections/llm', { method: 'DELETE' }); load(); } })), result,
      h('hr'), h('b', {}, 'Run a free model on this server'), h('p', { class: 'muted small' }, `Private and free, but slower and weaker than a hosted 70B model. ${c.ollama.installed ? `Ollama is ${c.ollama.state}.` : ''}`), model7, h('div', { class: 'row' }, install), log));
  }

  load();
  return { el: host, title: 'Connections', destroy() { es?.close(); } };
}
