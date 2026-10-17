// GitHub updates: latest change per app, pull and redeploy, optional auto-pull (off by default).
import { h, clear, icon, fmt, toast, confirmDialog, actionBtn, modal } from '../ui.js';
import { api, stream } from '../api.js';
import { terminal } from '../term.js';
import { emptyState } from './shared.js';

/** Run a redeploy job and stream it into a terminal modal. Resolves with the exit code. */
export async function deployWithLog(app) {
  const term = terminal({ max: 1500 }); term.el.style.height = '320px';
  const status = h('span', { class: 'chip' }, 'Running');
  const closeBtn = h('button', { class: 'btn', disabled: true, onclick: () => m.close() }, 'Close');
  const box = h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Deploying ${app.name}` },
    h('div', { class: 'row' }, h('h2', {}, `Updating ${app.name}`), h('span', { class: 'grow' }), status), term.el, h('div', { class: 'acts' }, closeBtn));
  const m = modal(box);
  try {
    const { job } = await api(`/apps/${app.id}/redeploy`, { method: 'POST' });
    return await new Promise((resolve) => {
      const s = stream(`/jobs/${job}/stream`, { line: (l) => term.add(l), done: ({ code }) => { s.close(); status.textContent = code === 0 ? 'Finished' : `Failed (exit ${code})`; status.className = `chip ${code === 0 ? 'ok' : 'bad'}`; closeBtn.disabled = false; resolve(code); } });
    });
  } catch (e) { term.add(`error: ${e.message}`); status.textContent = 'Failed'; closeBtn.disabled = false; return 1; }
}

export function updatesPage(ctx) {
  ctx.crumbs([{ label: 'Overview', href: '#/' }, { label: 'Updates' }]);
  const list = h('div', { class: 'upd-list' }); let rows = [], every = 5;
  const head = h('div', { class: 'upd-sum' });

  const pending = () => rows.filter((r) => r.update?.checkout && r.update.behind > 0);
  function paintHead() {
    const p = pending(); const last = Math.max(0, ...rows.map((r) => r.update?.checkedAt || 0));
    clear(head).append(
      h('div', {}, h('div', { class: 'big' }, p.length ? `${p.length} app${p.length > 1 ? 's' : ''} ${p.length > 1 ? 'have' : 'has'} new code` : 'Everything is up to date'),
        h('div', { class: 'muted small' }, last ? `Checked ${fmt.ago(last)}. GitHub is checked every ${every} minutes.` : 'Not checked yet.')),
      h('span', { class: 'grow' }),
      actionBtn({ ic: 'refresh', label: 'Check GitHub now', onClick: async () => { await api('/updates/check', { method: 'POST' }); await load(); } }),
      p.length > 0 && actionBtn({ ic: 'bolt', label: `Pull all (${p.length})`, cls: 'primary', onClick: async () => {
        if (!(await confirmDialog({ title: `Update ${p.length} app${p.length > 1 ? 's' : ''}?`, body: `Updates run one at a time, newest change first: ${p.map((r) => r.name).join(', ')}. Each app restarts.`, confirm: 'Pull and deploy' }))) return;
        for (const r of p) { const code = await deployWithLog({ id: r.id, name: r.name }); if (code !== 0) { toast(`${r.name} failed, stopping here`, 'bad'); break; } }
        await load(); ctx.refresh();
      } }));
  }
  function card(r) {
    const u = r.update, a = ctx.fleet.apps.find((x) => x.id === r.id);
    const state = !u ? ['idle', 'Not checked yet'] : !u.checkout ? ['idle', 'Not a git checkout'] : u.error && !u.remote ? ['bad', u.error] : u.behind ? ['warn', `${u.behind} new commit${u.behind > 1 ? 's' : ''}`] : u.ahead ? ['warn', `${u.ahead} local commit${u.ahead > 1 ? 's' : ''} not on GitHub`] : ['ok', 'Up to date'];
    const sw = h('input', { type: 'checkbox', checked: r.autoPull, id: `ap-${r.id}`, disabled: !u?.checkout, onchange: async (e) => {
      try { await api(`/apps/${r.id}/settings`, { method: 'PUT', body: { autoPull: e.target.checked } }); r.autoPull = e.target.checked; toast(`Auto-pull ${r.autoPull ? 'on' : 'off'} for ${r.name}`, r.autoPull ? 'ok' : 'info'); }
      catch (er) { e.target.checked = !e.target.checked; toast(er.message, 'bad'); }
    } });
    const pend = u?.pending?.length ? h('details', { class: 'pend' }, h('summary', {}, 'See what changed'), u.pending.map((c) => h('div', { class: 'commit' }, h('span', { class: 'mono' }, c.hash), h('span', {}, c.subject), h('span', { class: 'muted small' }, `${c.author} · ${fmt.ago(Date.parse(c.when))}`)))) : null;
    return h('article', { class: 'upd panel', dataset: { s: state[0] }, 'data-reveal': '' },
      h('div', { class: 'upd-top' },
        h('div', {}, h('h3', {}, h('a', { href: `#/app/${r.id}/deploy` }, r.name)), r.repo && h('a', { class: 'muted small', href: `https://github.com/${r.repo}`, target: '_blank', rel: 'noopener noreferrer' }, r.repo)),
        h('span', { class: `chip ${state[0] === 'ok' ? 'ok' : state[0] === 'warn' ? 'warn' : state[0] === 'bad' ? 'bad' : ''}` }, state[1])),
      u?.checkout && h('dl', { class: 'kv tight' },
        h('dt', {}, 'Latest on GitHub'), h('dd', {}, u.remote ? h('span', {}, h('span', { class: 'mono' }, u.remote.hash), ' ', u.remote.subject, h('span', { class: 'muted small' }, ` · ${fmt.ago(Date.parse(u.remote.when))}`)) : '-'),
        h('dt', {}, 'Running here'), h('dd', {}, u.local ? h('span', {}, h('span', { class: 'mono' }, u.local.hash), ' ', u.local.subject, h('span', { class: 'muted small' }, ` · ${fmt.ago(Date.parse(u.local.when))}`)) : '-'),
        h('dt', {}, 'Branch'), h('dd', {}, h('span', { class: 'chip' }, icon('branch', 13), u.branch), u.dirty && h('span', { class: 'chip warn', style: { marginLeft: '8px' } }, 'uncommitted changes on server'))),
      pend,
      h('div', { class: 'upd-foot' },
        h('label', { class: 'switch', for: `ap-${r.id}`, title: 'Redeploy automatically when new commits land. Off by default.' }, sw, h('span', { class: 'sw' }), h('span', {}, 'Auto-pull')),
        h('span', { class: 'grow' }),
        u?.dirty && u.behind > 0 && h('span', { class: 'muted small' }, 'Blocked: server has uncommitted changes'),
        h('button', { class: 'btn sm', disabled: !u?.checkout, onclick: async () => { try { await api(`/apps/${r.id}/git/check`, { method: 'POST' }); await load(); } catch (e) { toast(e.message, 'bad'); } } }, icon('refresh', 15), 'Check'),
        h('button', { class: `btn sm ${u?.behind ? 'primary' : ''}`, disabled: !u?.checkout || !a, onclick: async () => {
          if (!(await confirmDialog({ title: `${u.behind ? 'Pull and deploy' : 'Redeploy'} ${r.name}?`, body: 'Pulls from GitHub (fast-forward only) and rebuilds. The app restarts and may be unavailable for a minute.', confirm: u.behind ? 'Pull and deploy' : 'Redeploy' }))) return;
          await deployWithLog({ id: r.id, name: r.name }); await load(); ctx.refresh();
        } }, icon('rocket', 15), u?.behind ? 'Pull and deploy' : 'Redeploy')));
  }
  function paint() { paintHead(); clear(list); if (!rows.length) list.append(emptyState('No apps', '')); rows.forEach((r) => list.append(card(r))); window.dispatchEvent(new Event('dc:content')); }
  async function load() { try { const r = await api('/updates'); rows = r.data; every = r.autoPullInterval; paint(); } catch (e) { toast(e.message, 'bad'); } }
  load();
  const el = h('div', { class: 'stack' }, h('h1', { class: 'h2', style: { fontSize: '26px' } }, 'Updates'),
    h('section', { class: 'panel upd-head' }, head),
    h('p', { class: 'muted small' }, 'Most recently changed on GitHub first. Auto-pull is off for every app until you turn it on. It only fast-forwards, and skips an app if the server copy has uncommitted changes.'), list);
  return { el, title: 'Updates' };
}
