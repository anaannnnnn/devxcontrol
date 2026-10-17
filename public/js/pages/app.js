import { h, clear, icon, fmt, orb, STATUS_LABEL, actionBtn, confirmDialog, toast, copy, modal } from '../ui.js';
import { visualEditor } from './visual.js';
import { api, stream } from '../api.js';
import { lineChart, chartTable } from '../charts.js';
import { terminal } from '../term.js';
import { lifecycleButtons } from './fleet.js';
import { eventRow, emptyState } from './shared.js';
import { dbExplorer } from './db.js';
import { credentialsPanel } from './vault.js';
import { deployWithLog } from './updates.js';
import { studioBody } from './studio.js';
import { domainPicker } from './domainpick.js';

const ALL_TABS = [['overview', 'Overview', 'globe'], ['logs', 'Logs', 'terminal'], ['database', 'Database', 'table'], ['data', 'Storage', 'archive'], ['source', 'Source', 'github'], ['secrets', 'Secrets', 'key'], ['domain', 'Domain', 'globe'], ['deploy', 'Updates', 'rocket'], ['visual', 'Visual edit', 'wand'], ['look', 'Look', 'palette'], ['upgrades', 'Upgrades', 'bolt'], ['releases', 'Releases', 'diff'], ['activity', 'Activity', 'activity']];
const panel = (title, body, right) => h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, title), h('span', { class: 'grow' }), right), body);

/** Start a long job and pipe its output into a terminal. */
async function runJob(path, term, label, after) {
  term.reset();
  try {
    const { job } = await api(path, { method: 'POST' });
    return new Promise((resolve) => {
      const s = stream(`/jobs/${job}/stream`, {
        line: (l) => term.add(l),
        done: ({ code }) => { s.close(); toast(code === 0 ? `${label} finished` : `${label} failed (exit ${code})`, code === 0 ? 'ok' : 'bad'); after?.(code); resolve(code); },
        error: () => { /* EventSource retries; the done event will arrive */ },
      });
    });
  } catch (e) { toast(e.message, 'bad'); term.add(`error: ${e.message}`); }
}

export function appPage(ctx) {
  const { id, go, refresh } = ctx;
  let app = ctx.fleet.apps.find((a) => a.id === id);
  let detail = null;
  const cleanup = [];
  const TABS = ALL_TABS.filter(([k]) => (k !== 'database' || app.hasDb) && (ctx.me?.admin !== false || !['database', 'secrets', 'domain'].includes(k)));
  ctx.crumbs([{ label: 'Overview', href: '#/' }, { label: app.name }]);

  /* ---------- header ---------- */
  const orbSlot = h('span'), word = h('span', { class: 'status-word' }), metaRow = h('div', { class: 'meta' }), ctas = h('div', { class: 'ctas' });
  const head = h('header', { class: 'app-head' },
    h('div', { class: 'ttl' }, h('h1', {}, orbSlot, app.name, word), h('p', { class: 'sub' }, app.tagline), metaRow), ctas);
  const redeployBtn = () => actionBtn({ ic: 'rocket', label: 'Redeploy', cls: '', title: `Redeploy ${app.name}`, onClick: async () => {
    if (!(await confirmDialog({ title: `Redeploy ${app.name}?`, body: 'Pulls the latest code from GitHub and rebuilds the containers. The app restarts and may be unavailable for a minute.', confirm: 'Redeploy' }))) return;
    sessionStorage.setItem('dc-run-redeploy', id); go(`/app/${id}/deploy`);
  } });
  let headSig = '';
  function paintHead() {
    clear(orbSlot).append(orb(app.status));
    word.textContent = STATUS_LABEL[app.status]; word.dataset.s = app.status;
    clear(metaRow).append(...[
      h('span', { class: 'chip' }, app.group), h('span', { class: 'chip' }, app.stack || ''),
      app.repo && h('a', { class: 'chip link', href: `https://github.com/${app.repo}`, target: '_blank', rel: 'noopener noreferrer' }, icon('branch', 13), app.repo),
      app.since && app.status !== 'stopped' && h('span', { class: 'chip' }, `Up ${fmt.dur(Date.now() - app.since)}`),
      app.restarts > 0 && h('span', { class: 'chip warn' }, `${app.restarts} restart${app.restarts > 1 ? 's' : ''}`),
      app.uptime30d != null && h('span', { class: 'chip' }, `${app.uptime30d}% over 30 days`)].filter(Boolean));
    const sig = app.status + app.stopped;
    if (sig !== headSig) {
      headSig = sig;
      clear(ctas).append(
        h('a', { class: 'btn primary', href: app.urls[0].url, target: '_blank', rel: 'noopener noreferrer' }, icon('external', 16), h('span', { class: 'lab' }, `Open ${app.urls.length > 1 ? app.urls[0].label : 'site'}`)),
        ...lifecycleButtons(app, async () => { await refresh(); await loadDetail(); }, { sm: false, labels: true }),
        redeployBtn());
    }
  }

  /* ---------- tabs ---------- */
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'App sections' }, TABS.map(([key, label, ic]) =>
    h('button', { class: 'tab', role: 'tab', id: `tab-${key}`, 'aria-selected': String(ctx.tab === key), 'aria-controls': 'tabpanel', tabindex: ctx.tab === key ? 0 : -1, onclick: () => go(`/app/${id}/${key}`),
      onkeydown: (e) => { const i = TABS.findIndex((t) => t[0] === key); const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null; if (n != null) { e.preventDefault(); go(`/app/${id}/${TABS[(n + TABS.length) % TABS.length][0]}`); } } }, icon(ic, 16), label)));
  const body = h('div', { id: 'tabpanel', role: 'tabpanel', 'aria-labelledby': `tab-${ctx.tab}`, style: { marginTop: '18px' } });
  const el = h('div', {}, head, tabs, body);

  async function loadDetail() { try { detail = await api(`/apps/${id}`); detail.__t = Date.now(); } catch (e) { toast(e.message, 'bad'); } }

  /* ---------- Overview ---------- */
  function overview() {
    const endpoints = h('div'), containers = h('div');
    let win = '1h', showTable = false, histData = null;
    const latency = lineChart({ series: [{ key: 'ms', name: 'Response', color: 'var(--s1)' }], unit: (n) => `${Math.round(n)} ms`, label: 'Response time over time' });
    const cpu = lineChart({ series: [{ key: 'cpu', name: 'CPU', color: 'var(--s2)' }], unit: (n) => `${(+n).toFixed(1)}%`, label: 'CPU use over time', height: 170 });
    const mem = lineChart({ series: [{ key: 'mem', name: 'Memory', color: 'var(--s3)' }], unit: (n) => fmt.bytes(n), label: 'Memory use over time', height: 170 });
    const chartsBox = h('div', { class: 'stack' });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Time range' }, ['1h', '6h', '12h'].map((w) => h('button', { 'aria-pressed': String(w === win), onclick: (e) => { win = w; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); loadHist(); } }, w)));
    const tableBtn = h('button', { class: 'btn sm ghost', 'aria-pressed': 'false', onclick: () => { showTable = !showTable; tableBtn.setAttribute('aria-pressed', String(showTable)); tableBtn.lastChild.textContent = showTable ? 'Chart view' : 'Table view'; paintCharts(); } }, icon('list', 14), h('span', {}, 'Table view'));
    function paintCharts() {
      clear(chartsBox);
      const sets = [['Response time', latency, 'ms', (n) => `${Math.round(n)} ms`, 'var(--s1)', 'Response'], ['CPU', cpu, 'cpu', (n) => `${(+n).toFixed(1)}%`, 'var(--s2)', 'CPU'], ['Memory', mem, 'mem', fmt.bytes, 'var(--s3)', 'Memory']];
      for (const [t, chart, key, f, , nm] of sets) chartsBox.append(h('div', {}, h('div', { class: 'row', style: { padding: '2px 14px 0' } }, h('b', { class: 'small' }, t)), showTable ? chartTable(histData, [{ key, name: nm }], f) : chart.el));
      if (!showTable) { latency.set(histData); cpu.set(histData); mem.set(histData); }
    }
    async function loadHist() { try { histData = await api(`/apps/${id}/history?window=${win}`); paintCharts(); } catch { /* keep old */ } }

    function paintLists() {
      clear(endpoints).append(h('div', { class: 'tbl' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Endpoint'), h('th', {}, 'HTTP'), h('th', { class: 'r' }, 'Speed'), h('th', {}, 'TLS'), h('th', {}, 'DNS'))),
        h('tbody', {}, app.checks.map((c) => {
          const days = c.cert?.validTo ? Math.floor((c.cert.validTo - Date.now()) / 86400e3) : null;
          return h('tr', {},
            h('td', {}, h('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer', class: 'row', style: { gap: '6px' } }, h('b', {}, c.label), icon('external', 12)), h('div', { class: 'muted small mono' }, c.url.replace('https://', ''))),
            h('td', {}, !c.probed ? h('span', { class: 'chip' }, 'not probed') : c.ok ? h('span', { class: 'chip ok' }, c.status) : h('span', { class: 'chip bad' }, c.status || c.err || 'no reply')),
            h('td', { class: 'r mono' }, c.ms ? `${c.ms} ms` : '-'),
            h('td', {}, days == null ? h('span', { class: 'muted' }, c.cert?.error ? 'error' : '-') : h('span', { class: `chip ${days < 14 ? 'bad' : days < 30 ? 'warn' : ''}` }, `${days}d`)),
            h('td', {}, c.dns ? h('span', { class: `chip ${c.dns.match ? 'ok' : 'bad'}`, title: (c.dns.ips || []).join(', ') }, c.dns.match ? 'points here' : 'wrong IP') : '-'));
        })))));
      clear(containers).append(h('div', { class: 'tbl' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Container'), h('th', {}, 'State'), h('th', { class: 'r' }, 'CPU'), h('th', { class: 'r' }, 'Memory'), h('th', { class: 'r' }, 'Net I/O'), h('th', { class: 'r' }, 'Restarts'), h('th', {}, ''))),
        h('tbody', {}, app.containers.map((c) => h('tr', {},
          h('td', {}, h('b', { class: 'mono' }, c.name), h('div', { class: 'muted small' }, `${c.role} · up ${c.state === 'running' && c.started ? fmt.dur(Date.now() - Date.parse(c.started)) : '-'}`)),
          h('td', {}, h('span', { class: 'pod', dataset: { s: c.state } }, h('i'), c.state)),
          h('td', { class: 'r mono' }, c.stats ? fmt.pct(c.stats.cpu) : '-'),
          h('td', { class: 'r mono' }, c.stats ? fmt.bytes(c.stats.mem) : '-'),
          h('td', { class: 'r mono small' }, c.stats?.net || '-'),
          h('td', { class: 'r mono' }, c.restarts || 0),
          h('td', {}, h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
            h('a', { class: 'btn sm icon ghost', href: `#/app/${id}/logs`, title: `Logs for ${c.name}`, 'aria-label': `Logs for ${c.name}`, onclick: () => sessionStorage.setItem('dc-log-c', c.name) }, icon('terminal', 16)),
            actionBtn({ ic: 'restart', label: 'Restart', title: `Restart ${c.name}`, icon: true, sm: true, cls: 'ghost', onClick: async () => { try { await api(`/containers/${c.name}/restart`, { method: 'POST' }); toast(`${c.name} restarted`, 'ok'); } catch (e) { toast(e.message, 'bad'); } refresh(); } })))))))));
    }
    paintLists(); loadHist();
    const iv = setInterval(loadHist, 15000); cleanup.push(() => clearInterval(iv));
    return {
      el: h('div', { class: 'cols' },
        h('div', { class: 'stack' }, panel('Endpoints', endpoints), panel('Containers', containers)),
        panel('Performance', chartsBox, h('div', { class: 'row' }, seg, tableBtn))),
      update: paintLists,
    };
  }

  /* ---------- Logs ---------- */
  function logs() {
    const names = app.containers.map((c) => c.name);
    const want = sessionStorage.getItem('dc-log-c'); sessionStorage.removeItem('dc-log-c');
    let cur = names.includes(want) ? want : names.at(-1);
    const term = terminal();
    let live = null, paused = false;
    const sel = h('select', { class: 'field', 'aria-label': 'Container', onchange: () => { cur = sel.value; connect(); } }, names.map((n) => h('option', { value: n, selected: n === cur }, n)));
    const q = h('input', { class: 'field', type: 'search', placeholder: 'Filter lines', 'aria-label': 'Filter log lines', style: { minWidth: '180px', flex: 1 }, oninput: () => term.setFilter(q.value) });
    const status = h('span', { class: 'chip ok' }, 'Live');
    const pauseBtn = h('button', { class: 'btn sm', onclick: () => { paused = !paused; term.setPaused(paused); pauseBtn.lastChild.textContent = paused ? 'Resume' : 'Pause'; status.textContent = paused ? 'Paused' : 'Live'; status.className = `chip ${paused ? 'warn' : 'ok'}`; } }, icon('pause', 14), h('span', {}, 'Pause'));
    const wrapBtn = h('button', { class: 'btn sm', 'aria-pressed': 'true', onclick: () => { const on = wrapBtn.getAttribute('aria-pressed') !== 'true'; wrapBtn.setAttribute('aria-pressed', String(on)); term.setWrap(on); } }, icon('wrap', 14), h('span', {}, 'Wrap'));
    function connect() {
      live?.close(); term.reset(); status.textContent = 'Connecting'; status.className = 'chip';
      live = stream(`/containers/${cur}/stream`, { log: (c) => { status.textContent = paused ? 'Paused' : 'Live'; status.className = `chip ${paused ? 'warn' : 'ok'}`; term.add(c); }, error: () => { if (!paused) { status.textContent = 'Reconnecting'; status.className = 'chip warn'; } } });
    }
    connect(); cleanup.push(() => live?.close());
    const bar = h('div', { class: 'toolbar' }, names.length > 1 && sel, q, status, pauseBtn, wrapBtn,
      h('button', { class: 'btn sm', onclick: () => copy(term.text(), `${term.count()} lines copied`) }, icon('copy', 14), h('span', {}, 'Copy')),
      h('button', { class: 'btn sm', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([term.text()], { type: 'text/plain' })), download: `${cur}.log` }); document.body.append(a); a.click(); a.remove(); } }, icon('download', 14), h('span', {}, 'Download')));
    return { el: panel(`Logs: ${app.name}`, h('div', {}, bar, h('div', { style: { padding: '0 8px 8px' } }, term.el))) };
  }

  /* ---------- Data ---------- */
  function data() {
    const host = h('div'), term = terminal({ max: 400 });
    term.el.style.height = '180px';
    const jobBox = h('div', { class: 'job', hidden: true }, term.el);
    async function load() {
      clear(host).append(h('div', { class: 'skeleton', style: { height: '140px', margin: '8px' } }));
      let r; try { r = await api(`/apps/${id}/data`); } catch (e) { clear(host).append(emptyState('Could not read the database', e.message)); return; }
      const i = r.info; clear(host);
      const canBackup = i.type === 'postgres' || i.type === 'sqlite';
      const dbName = { postgres: 'PostgreSQL', sqlite: 'SQLite file', dynamo: 'AWS DynamoDB', none: 'No database' }[i.type];
      host.append(h('dl', { class: 'kv' },
        h('dt', {}, 'Engine'), h('dd', {}, h('b', {}, dbName)),
        i.container && [h('dt', {}, 'Container'), h('dd', { class: 'mono' }, i.container)],
        i.volume && [h('dt', {}, 'Docker volume'), h('dd', { class: 'mono' }, i.volume)],
        i.size && [h('dt', {}, 'Size on disk'), h('dd', {}, i.size)],
        i.note && [h('dt', {}, 'Note'), h('dd', {}, i.note)],
        i.error && [h('dt', {}, 'Error'), h('dd', { style: { color: 'var(--bad-text)' } }, i.error)]));
      if (i.tables?.length) {
        const mx = Math.max(...i.tables.map((t) => t.rows), 1);
        host.append(h('div', { style: { padding: '4px 0 10px' } }, h('div', { class: 'muted small', style: { padding: '0 14px 6px' } }, 'Largest tables by row count'), i.tables.map((t) => h('div', { class: 'bar-row' }, h('span', { class: 'mono' }, t.name), h('div', { class: 'meter' }, h('i', { style: { width: `${(t.rows / mx) * 100}%` } })), h('span', { class: 'mono r', style: { textAlign: 'right' } }, t.rows.toLocaleString())))));
      }
      const shell = i.type === 'postgres' ? `docker exec -it ${i.container} sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'` : i.type === 'sqlite' ? `docker run --rm -it -v ${i.volume}:/data alpine sh` : null;
      if (shell) host.append(h('div', { class: 'cmd' }, h('code', {}, shell), h('button', { class: 'btn sm icon ghost', 'aria-label': 'Copy command', onclick: () => copy(shell, 'Command copied') }, icon('copy', 15))));
      host.append(h('div', { class: 'row', style: { padding: '12px 14px' } },
        canBackup ? actionBtn({ ic: 'archive', label: 'Back up now', cls: 'primary', onClick: async () => { jobBox.hidden = false; await runJob(`/apps/${id}/backup`, term, 'Backup', () => load()); } }) : h('span', { class: 'muted small' }, 'Nothing to back up on this server.')));
      bk.set(r.backups, canBackup);
    }
    const bk = backupList();
    function backupList() {
      const box = h('div');
      return { box, async set(list, can) {
        clear(box);
        if (!list.length) { box.append(emptyState(can ? 'No backups yet' : 'No backups', can ? 'Nightly backups run at 03:00 server time. Use Back up now for an extra one.' : 'This app has no server-side data to back up.')); return; }
        let dir = ''; try { dir = (await api('/backups?limit=1')).dir || ''; } catch { /* optional */ }
        box.append(h('div', { class: 'tbl' }, h('table', {}, h('tbody', {}, list.map((b) => h('tr', {},
          h('td', {}, h('b', { class: 'mono small' }, b.name), h('div', { class: 'muted small' }, `${fmt.ago(b.t)} · ${fmt.bytes(b.size)}`)),
          h('td', {}, h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
            h('a', { class: 'btn sm icon ghost', href: `/api/v1/backups/${b.name}`, download: b.name, title: 'Download', 'aria-label': `Download ${b.name}` }, icon('download', 16)),
            h('button', { class: 'btn sm icon ghost', title: 'Copy restore command', 'aria-label': 'Copy restore command', onclick: () => copy(restoreCmd(b, dir), 'Restore command copied') }, icon('refresh', 16)),
            h('button', { class: 'btn sm icon ghost danger', title: 'Delete', 'aria-label': `Delete ${b.name}`, onclick: async () => { if (await confirmDialog({ title: 'Delete this backup?', body: b.name, confirm: 'Delete', danger: true })) { try { await api(`/backups/${b.name}`, { method: 'DELETE' }); toast('Backup deleted', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } } } }, icon('trash', 16))))))))));
      } };
    }
    function restoreCmd(b, dir) {
      const d = detail?.db || app.db;
      return b.kind === 'sql.gz'
        ? `gunzip -c ${dir}/${b.name} | docker exec -i ${d.container} sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'`
        : `docker stop ${app.containers.join(' ')} && docker run --rm -v ${d.volume}:/data -v ${dir}:/b alpine sh -c 'rm -rf /data/* && tar xzf /b/${b.name} -C /data' && docker start ${app.containers.join(' ')}`;
    }
    load();
    return { el: h('div', { class: 'cols' }, h('div', { class: 'stack' }, panel('Database', host), jobBox), panel('Backups', bk.box, h('span', { class: 'chip' }, 'Kept: last 14'))) };
  }

  /* ---------- Secrets ---------- */
  function secrets() {
    const reveal = (body) => api(`/apps/${id}/secrets/reveal`, { method: 'POST', body }).then((r) => r.value);
    function secretCell(body, masked) {
      const txt = h('span', { class: 'mono' }, masked);
      let t = null;
      const eye = h('button', { class: 'btn sm icon ghost', 'aria-label': 'Show value for 12 seconds', title: 'Show for 12 seconds', onclick: async () => {
        if (t) { clearTimeout(t); t = null; txt.textContent = masked; return; }
        try { txt.textContent = await reveal(body); t = setTimeout(() => { txt.textContent = masked; t = null; }, 12000); } catch (e) { toast(e.message, 'bad'); }
      } }, icon('eye', 16));
      const cp = h('button', { class: 'btn sm icon ghost', 'aria-label': 'Copy value', title: 'Copy', onclick: async () => { try { await copy(await reveal(body), 'Copied (not shown on screen)'); } catch (e) { toast(e.message, 'bad'); } } }, icon('copy', 16));
      return h('div', { class: 'secret' }, txt, eye, cp);
    }
    const logins = detail.logins.length
      ? h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Account'), h('th', {}, 'Username'), h('th', {}, 'Password'))), h('tbody', {}, detail.logins.map((l) => h('tr', {},
        h('td', {}, h('b', {}, l.label), l.weak && h('div', {}, h('span', { class: 'chip warn', style: { marginTop: '4px' } }, 'Default password: change it'))),
        h('td', { class: 'mono' }, l.user), h('td', {}, l.hasSecret ? secretCell({ type: 'login', index: l.index }, '••••••••') : '-'))))))
      : emptyState('No saved logins', 'This app has no seeded accounts. Add them to apps.json if you want them listed here.');
    const envs = !detail.env.file ? emptyState('No env file', 'This app has no env file registered.')
      : !detail.env.readable ? emptyState('Env file not readable', `Could not read ${detail.env.file}. Check that APPS_DIR is mounted.`)
      : h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Variable'), h('th', {}, 'Value'))), h('tbody', {}, detail.env.vars.map((v) => h('tr', {}, h('td', { class: 'mono' }, v.key), h('td', {}, v.sensitive ? secretCell({ type: 'env', key: v.key }, v.value || '(empty)') : h('span', { class: 'mono' }, v.value || '(empty)')))))));
    return { el: h('div', { class: 'stack' },
      h('div', { class: 'banner demo' }, icon('shield'), h('span', {}, 'Every reveal is written to the Activity log. Values hide again after 12 seconds.')),
      credentialsPanel(app, ctx.fleet.apps.map((a) => ({ id: a.id, name: a.name })), detail.vault),
      panel('Seeded logins', logins), panel(`Environment${detail.env.file ? `: ${detail.env.file}` : ''}`, envs)) };
  }

  /* ---------- Deploy ---------- */
  function deploy() {
    const g = detail.git, term = terminal({ max: 1500 });
    const job = h('div', { class: 'job' }, term.el);
    const run = () => runJob(`/apps/${id}/redeploy`, term, 'Redeploy', () => { refresh(); });
    const main = app.containers.at(-1);
    const cmds = [
      [`Follow logs`, `cd ${detail.composeDir} && docker compose logs -f --tail 100`],
      [`Shell inside ${main}`, `docker exec -it ${main} sh`],
      [`Live resource use`, `docker stats ${app.containers.join(' ')}`],
      [`Rebuild by hand`, `cd ${detail.composeDir} && git pull && docker compose up -d --build`],
    ];
    const u = detail.update;
    const sw = h('input', { type: 'checkbox', id: 'ap-app', checked: detail.autoPull, disabled: !u?.checkout && !g, onchange: async (e) => {
      try { await api(`/apps/${id}/settings`, { method: 'PUT', body: { autoPull: e.target.checked } }); detail.autoPull = e.target.checked; toast(`Auto-pull ${e.target.checked ? 'on' : 'off'}`, e.target.checked ? 'ok' : 'info'); }
      catch (er) { e.target.checked = !e.target.checked; toast(er.message, 'bad'); }
    } });
    const github = panel('GitHub', h('div', {},
      u?.checkout ? h('dl', { class: 'kv' },
        h('dt', {}, 'Status'), h('dd', {}, u.behind ? h('span', { class: 'chip warn' }, `${u.behind} new commit${u.behind > 1 ? 's' : ''} to pull`) : h('span', { class: 'chip ok' }, 'Up to date')),
        u.remote && [h('dt', {}, 'Latest on GitHub'), h('dd', {}, h('span', { class: 'mono' }, u.remote.hash), ' ', u.remote.subject, h('span', { class: 'muted small' }, ` · ${fmt.ago(Date.parse(u.remote.when))}`))],
        h('dt', {}, 'Checked'), h('dd', {}, fmt.ago(u.checkedAt))) : emptyState('Not checked yet', 'GitHub is checked every few minutes. Press Check now.'),
      u?.pending?.length > 0 && h('div', { class: 'pend-list' }, u.pending.map((c) => h('div', { class: 'commit' }, h('span', { class: 'mono' }, c.hash), h('span', {}, c.subject), h('span', { class: 'muted small' }, `${c.author} · ${fmt.ago(Date.parse(c.when))}`)))),
      h('div', { class: 'upd-foot', style: { padding: '12px 14px 14px' } },
        h('label', { class: 'switch', for: 'ap-app' }, sw, h('span', { class: 'sw' }), h('span', {}, 'Auto-pull'), h('small', { class: 'muted' }, ' off by default')), h('span', { class: 'grow' }),
        actionBtn({ ic: 'refresh', label: 'Check now', onClick: async () => { await api(`/apps/${id}/git/check`, { method: 'POST' }); await loadDetail(); clear(body).append(deploy().el); } }),
        actionBtn({ ic: 'bolt', label: u?.behind ? 'Pull and deploy' : 'Pull latest', cls: u?.behind ? 'primary' : '', onClick: async () => { if (!(await confirmDialog({ title: `Pull and deploy ${app.name}?`, body: 'Pulls from GitHub (fast-forward only) and rebuilds. The app restarts.', confirm: 'Pull and deploy' }))) return; await deployWithLog({ id, name: app.name }); refresh(); await loadDetail(); clear(body).append(deploy().el); } }))));
    if (sessionStorage.getItem('dc-run-redeploy') === id) { sessionStorage.removeItem('dc-run-redeploy'); queueMicrotask(run); }
    return { el: h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        github,
        panel('Source', g ? h('dl', { class: 'kv' },
          h('dt', {}, 'Branch'), h('dd', {}, h('span', { class: 'chip' }, icon('branch', 13), g.branch), g.dirty && h('span', { class: 'chip warn', style: { marginLeft: '8px' } }, 'uncommitted changes on server')),
          h('dt', {}, 'Latest commit'), h('dd', {}, h('span', { class: 'mono' }, g.commit), ' ', g.subject),
          h('dt', {}, 'Committed'), h('dd', {}, fmt.ago(Date.parse(g.when))),
          h('dt', {}, 'Folder'), h('dd', { class: 'mono' }, detail.composeDir)) : emptyState('Not a git checkout', 'Redeploy will rebuild from the files already on the server.')),
        panel('Redeploy', h('div', {}, h('p', { class: 'muted small', style: { padding: '0 14px 12px' } }, 'Runs git pull (fast-forward only) and docker compose up -d --build. If the pull fails, nothing is rebuilt.'), job,
          h('div', { style: { padding: '8px 14px 14px' } }, actionBtn({ ic: 'rocket', label: 'Redeploy now', cls: 'primary', onClick: async () => { if (await confirmDialog({ title: `Redeploy ${app.name}?`, body: 'The app restarts and may be unavailable for a minute.', confirm: 'Redeploy' })) await run(); } }))))),
      panel('Handy commands', h('div', { style: { paddingBottom: '10px' } }, cmds.map(([t, c]) => h('div', {}, h('div', { class: 'muted small', style: { padding: '8px 14px 0' } }, t), h('div', { class: 'cmd' }, h('code', {}, c), h('button', { class: 'btn sm icon ghost', 'aria-label': `Copy: ${t}`, onclick: () => copy(c, 'Command copied') }, icon('copy', 15))))))) ) };
  }

  /* ---------- Activity ---------- */
  function activity() {
    const list = h('div', { class: 'events' }); let before = null;
    const more = h('button', { class: 'btn sm', hidden: true, onclick: () => load() }, 'Load older');
    async function load() {
      const r = await api(`/events?app=${id}&limit=25${before ? `&before=${before}` : ''}`);
      if (!r.data.length && !before) list.append(emptyState('Nothing yet', 'Starts, stops, deploys and incidents for this app will show up here.'));
      r.data.forEach((e) => list.append(eventRow(e))); before = r.pagination.next_cursor; more.hidden = !r.pagination.has_more;
    }
    load().catch((e) => toast(e.message, 'bad'));
    return { el: panel(`Activity: ${app.name}`, h('div', {}, list, h('div', { style: { padding: '8px 14px 14px' } }, more))) };
  }

  /* ---------- wiring ---------- */

  function domain() {
    const wrap = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Checking the route ...'));
    const input = h('input', { class: 'field mono', placeholder: 'app.yourdomain.com', 'aria-label': 'Domain', autocomplete: 'off' });
    const portIn = h('input', { class: 'field mono', inputmode: 'numeric', placeholder: 'auto', 'aria-label': 'Port', style: { maxWidth: '110px' } });
    const out = h('div', { class: 'stack' });
    const picker = domainPicker({ value: app.urls?.[0]?.host || '', hint: id, onChange: (v) => { input.value = v; } });
    const apply = async (replace = false) => {
      try {
        const r = await api(`/apps/${id}/route`, { method: 'POST', body: { domain: input.value, port: portIn.value || undefined, replace } });
        clear(out).append(...r.steps.map((x) => h('div', { class: `banner ${x.ok ? 'ok' : 'warn'}`, style: { margin: 0 } }, h('span', {}, x.m))));
        toast(`${r.domain} is routed. DNS can take a few minutes`, 'ok'); check();
      } catch (e) {
        if (e.problem?.code === 'domain-in-use' || /already routes/.test(e.message)) { if (await confirmDialog({ title: 'Replace the existing route?', body: e.message })) return apply(true); return; }
        clear(out).append(h('div', { class: 'banner bad', style: { margin: 0 } }, h('span', {}, e.message)));
      }
    };
    async function check() {
      let d; try { d = await api(`/apps/${id}/route`); } catch (e) { clear(wrap).append(h('div', { class: 'banner bad' }, e.message)); return; }
      if (d.domain && !input.value) input.value = d.domain;
      clear(wrap).append(
        h('dl', { class: 'kv' },
          h('dt', {}, 'Domain'), h('dd', { class: 'mono' }, d.domain || 'none'),
          h('dt', {}, 'DNS'), h('dd', {}, d.dnsIps.length ? d.dnsIps.join(', ') : 'no record', ' ', h('span', { class: `chip ${d.dnsIps.includes(d.serverIp) ? 'ok' : 'warn'}` }, d.dnsIps.includes(d.serverIp) ? 'points here' : `should be ${d.serverIp}`)),
          h('dt', {}, 'Caddy sends it to'), h('dd', { class: 'mono' }, d.caddy.upstream || (d.caddy.reachable ? 'no route' : 'unknown')),
          h('dt', {}, 'App answers at'), h('dd', { class: 'mono' }, d.answers ? `${d.answers.container}:${d.answers.port}` : 'nothing found')),
        d.problems.length ? h('div', { class: 'banner warn', style: { display: 'block' } }, h('b', {}, 'Why you may see a 502'), h('ul', { style: { margin: '6px 0 0 18px' } }, d.problems.map((p) => h('li', {}, p)))) : h('div', { class: 'banner ok' }, h('span', {}, 'The route looks healthy.')));
    }
    check();
    const delBox = h('div');
    api(`/apps/${id}/route`).then((d) => { if (!d.removable) return; const t = terminal({ max: 400 });
      const opts = { data: h('input', { type: 'checkbox', id: 'del-data' }), dns: h('input', { type: 'checkbox', id: 'del-dns', checked: true }), folder: h('input', { type: 'checkbox', id: 'del-folder', checked: true }) };
      const conf = h('input', { class: 'field mono', placeholder: `type ${id} to confirm`, 'aria-label': 'Confirm app id', autocomplete: 'off' });
      const row = (k, t1, note) => h('label', { class: 'row', style: { gap: '8px', alignItems: 'flex-start' }, for: `del-${k}` }, opts[k], h('span', {}, t1, h('span', { class: 'muted small' }, ` ${note}`)));
      delBox.append(panel('Delete this app', h('div', { class: 'pad-form stack' },
        h('p', { class: 'muted small' }, 'Stops and removes the containers and image, removes the Caddy route, and takes it out of DevX Control. Your GitHub repo is never touched.'),
        row('dns', 'Remove its DNS record', '(only if it still points at this server)'), row('folder', 'Delete the app folder on the server', ''), row('data', 'Also delete its data', '(database, volumes and uploads: cannot be undone)'),
        conf, h('div', { class: 'row' }, actionBtn({ ic: 'trash', label: 'Delete app', cls: 'danger', onClick: async () => {
          if (conf.value.trim() !== id) { toast(`Type ${id} to confirm`, 'bad'); return; }
          try {
            const { job } = await api(`/apps/${id}`, { method: 'DELETE', body: { confirm: id, data: opts.data.checked, dns: opts.dns.checked, folder: opts.folder.checked } });
            t.reset(); const s = stream(`/jobs/${job}/stream`, { line: (l) => t.add(l), done: ({ code }) => { s.close(); toast(code === 0 ? 'App deleted' : 'Delete finished with errors', code === 0 ? 'ok' : 'bad'); if (code === 0) { refresh?.(); go('/'); } }, error: () => {} });
          } catch (e) { toast(e.message, 'bad'); }
        } })), t.el)));
    }).catch(() => {});
    return { el: h('div', { class: 'stack' }, h('div', { class: 'cols' }, panel('Route check', wrap, actionBtn({ ic: 'refresh', label: 'Check again', onClick: check })),
      panel('Set or fix the domain', h('div', { class: 'pad-form stack' },
        h('p', { class: 'muted small' }, 'Creates or corrects the DNS record at Cloudflare/GoDaddy, joins the container to the web network, finds the right port and rewrites the Caddy route. Use it to change this company\'s domain too.'),
        h('label', { class: 'lbl' }, 'Address', picker), h('label', { class: 'lbl' }, 'Port (leave empty to detect)', portIn),
        h('div', { class: 'row' }, actionBtn({ ic: 'bolt', label: 'Fix and apply', cls: 'primary', onClick: () => apply(false) })), out))), delBox) };
  }

  /* ---------- Look: theme store ---------- */
  function look() {
    const isAdmin = ctx.me?.admin !== false;
    const grid = h('div', { class: 'theme-grid' }); let data = { themes: [], assignments: {}, fonts: [] }; let mine = null; let mode = 'all';
    const origin = location.origin;
    async function load() { try { [data, mine] = await Promise.all([api('/themes'), api(`/apps/${id}/theme`)]); } catch (e) { clear(grid).append(emptyState('Could not load themes', e.message)); return; } paint(); }
    const FONTS = { system: 'system-ui, sans-serif', serif: 'Georgia, serif', mono: 'ui-monospace, monospace', rounded: 'ui-rounded, system-ui, sans-serif', humanist: '"Segoe UI", Optima, sans-serif' };
    const preview = (t) => h('div', { class: 'tp', style: { background: t.bg, color: t.text, fontFamily: FONTS[t.font], borderRadius: `${Math.min(t.radius, 18)}px` } },
      h('div', { class: 'tp-card', style: { background: t.surface, borderColor: `${t.text}26`, borderRadius: `${Math.min(t.radius, 18)}px` } }, h('b', { style: { color: t.text } }, 'Heading'), h('span', { style: { color: t.muted } }, 'Muted text'), h('i', { style: { background: t.accent, color: t.report?.[3]?.ratio >= 4.5 && t.report?.[3]?.ok ? '#fff' : '#0b0b0f', borderRadius: `${Math.round(t.radius * 0.6)}px` } }, 'Button')));
    function custom() {
      const f = { name: '', mode: 'dark', bg: '#0f1115', surface: '#1b1f27', text: '#f2f4f8', muted: '#a3abba', accent: '#6aa6ff', radius: 12, font: 'system' };
      const err = h('p', { class: 'err', role: 'alert' });
      const col = (k, l) => h('label', { class: 'lbl small' }, l, h('input', { type: 'color', value: f[k], 'aria-label': l, oninput: (e) => { f[k] = e.target.value; live(); } }));
      const name = h('input', { class: 'field', placeholder: 'Theme name', 'aria-label': 'Theme name', oninput: (e) => { f.name = e.target.value; } });
      const radius = h('input', { type: 'range', min: 0, max: 28, value: f.radius, 'aria-label': 'Corner radius', oninput: (e) => { f.radius = +e.target.value; live(); } });
      const font = h('select', { class: 'field', 'aria-label': 'Font', onchange: (e) => { f.font = e.target.value; live(); } }, ...(data.fonts || []).map((k) => h('option', { value: k }, k)));
      const pv = h('div'); const live = () => { clear(pv).append(preview({ ...f, report: [0, 0, 0, { ok: true, ratio: 5 }] })); };
      const save = actionBtn({ ic: 'check', label: 'Save theme', cls: 'primary', onClick: async () => { try { await api('/themes', { method: 'POST', body: f }); m.close(); toast('Theme saved', 'ok'); load(); } catch (e) { err.textContent = e.message; } } });
      const box = h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Create a theme' }, h('h2', {}, 'Create a theme'), name, h('div', { class: 'row wrap', style: { gap: '12px' } }, col('bg', 'Background'), col('surface', 'Cards'), col('text', 'Text'), col('muted', 'Muted'), col('accent', 'Accent')), h('label', { class: 'lbl small' }, 'Corner radius', radius), h('label', { class: 'lbl small' }, 'Font', font), pv, err, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save));
      const m = modal(box); live();
    }
    function card(t) {
      const bad = (t.report || []).filter((r) => !r.ok); const on = mine?.theme === t.id;
      return h('article', { class: `panel theme-card${on ? ' on' : ''}` }, preview(t),
        h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('b', {}, t.name), on && h('span', { class: 'chip ok' }, 'chosen'), h('span', { class: 'chip' }, t.mode), h('span', { class: 'grow' }), !t.builtin && h('button', { class: 'btn sm icon ghost danger', 'aria-label': `Delete ${t.name}`, onclick: async () => { if (await confirmDialog({ title: `Delete ${t.name}?`, confirm: 'Delete', danger: true })) { await api(`/themes/${t.id}`, { method: 'DELETE' }); load(); } } }, icon('trash', 15))),
        h('p', { class: 'muted small' }, t.vibe || ' '),
        bad.length ? h('p', { class: 'small warn-t' }, `Low contrast: ${bad.map((r) => r.label.toLowerCase()).join(', ')}.`) : h('p', { class: 'small ok-t' }, 'Contrast passes.'),
        h('div', { class: 'row wrap', style: { gap: '6px' } },
          isAdmin && mine?.canApply && actionBtn({ ic: 'bolt', label: on ? 'Re-apply' : 'Apply to this app', cls: 'primary sm', onClick: async () => { try { await api(`/apps/${id}/theme/apply`, { method: 'POST', body: { theme: t.id } }); toast('Sent to Autopilot. Review it under Reviews.', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } } }),
          h('button', { class: 'btn sm', onclick: () => copy(`<link rel="stylesheet" href="${origin}/themes/${t.id}.css">`, 'Link tag copied') }, icon('copy', 14), 'CSS link'),
          h('button', { class: 'btn sm', onclick: () => copy(`${origin}/themes/${t.id}.tailwind.js`, 'Tailwind config URL copied') }, 'Tailwind'),
          h('a', { class: 'btn sm', href: `/themes/${t.id}.json`, target: '_blank', rel: 'noopener noreferrer' }, 'Tokens')));
    }
    function paint() { clear(grid); const list = data.themes.filter((t) => mode === 'all' || t.mode === mode); for (const t of list) grid.append(card(t)); }
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter themes' }, ...['all', 'dark', 'light'].map((k) => h('button', { 'aria-pressed': String(k === mode), onclick: (e) => { mode = k; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); paint(); } }, k[0].toUpperCase() + k.slice(1))));
    load();
    return { el: h('div', { class: 'stack' }, h('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } }, h('p', { class: 'muted small grow' }, 'Pick a look for this app. "Apply" has Autopilot add one stylesheet on a branch and asks you to review it, so nothing changes live until you approve. You can also link any theme from a site you control.'), seg, isAdmin && h('button', { class: 'btn', onclick: custom }, icon('plus', 15), 'New theme')), grid) };
  }

  /* ---------- Upgrade suggestions ---------- */
  function upgrades() {
    const list = h('div', { class: 'stack' }); const isAdmin = ctx.me?.admin !== false;
    let data = { items: [], at: 0, ai: false, canApply: false }; let showDone = false;
    const tone = { High: 'bad', Med: 'warn', Low: '' };
    async function load() { try { data = await api(`/apps/${id}/upgrades`); } catch (e) { clear(list).append(emptyState('Could not load suggestions', e.message)); return; } paint(); }
    async function act(path, body, ok) { try { await api(`/apps/${id}/upgrades/${path}`, { method: 'POST', body: body || {} }); if (ok) toast(ok, 'ok'); await load(); } catch (e) { toast(e.message, 'bad'); } }
    function paint() {
      clear(list);
      const open = data.items.filter((i) => i.state === 'open'), rest = data.items.filter((i) => i.state !== 'open');
      if (!data.at) { list.append(emptyState('No scan yet', isAdmin ? 'Scan this app to find design, accessibility, speed and feature upgrades.' : 'Nobody has scanned this app yet.')); return; }
      list.append(h('p', { class: 'muted small' }, `${open.length} suggestion${open.length === 1 ? '' : 's'}, most valuable first. Last scan ${new Date(data.at).toLocaleString()}.`));
      if (!open.length) list.append(emptyState('Nothing to suggest', 'This app passes every check. Nice.'));
      const card = (s) => h('article', { class: 'panel up-card' },
        h('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center' } }, h('b', {}, s.title), h('span', { class: 'chip' }, s.area), h('span', { class: `chip ${tone[s.impact]}` }, `${s.impact} impact`), h('span', { class: 'chip' }, `${s.effort} effort`), s.ai && h('span', { class: 'chip' }, 'AI idea'), s.state === 'queued' && h('span', { class: 'chip ok' }, 'sent to Autopilot')),
        h('p', { class: 'muted' }, s.why),
        s.evidence?.length ? h('p', { class: 'muted small mono' }, s.evidence.slice(0, 4).join('  ')) : null,
        isAdmin && s.state !== 'queued' ? h('div', { class: 'row wrap', style: { gap: '8px' } },
          data.canApply && s.state === 'open' && actionBtn({ ic: 'bolt', label: 'Have Autopilot do it', cls: 'primary', onClick: () => act(`${s.id}/apply`, {}, 'Sent to Autopilot. You will see it under Reviews.') }),
          s.state === 'open' ? h('button', { class: 'btn', onclick: () => act(`${s.id}/dismiss`, {}) }, 'Not now') : h('button', { class: 'btn', onclick: () => act(`${s.id}/dismiss`, { undo: true }) }, 'Bring back')) : null);
      for (const s of open) list.append(card(s));
      if (rest.length) { list.append(h('button', { class: 'btn ghost', onclick: () => { showDone = !showDone; paint(); } }, showDone ? 'Hide dismissed and queued' : `Show dismissed and queued (${rest.length})`)); if (showDone) for (const s of rest) list.append(card(s)); }
    }
    const scan = actionBtn({ ic: 'search', label: 'Scan for upgrades', cls: 'primary', onClick: async () => { try { data = await api(`/apps/${id}/upgrades/scan`, { method: 'POST', body: {} }); toast('Scan finished', 'ok'); paint(); } catch (e) { toast(e.message, 'bad'); } } });
    load();
    return { el: h('div', { class: 'stack' }, h('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } }, h('p', { class: 'muted small grow' }, 'Checks the app for dated design, missing accessibility and SEO basics, old libraries and missing features. "Have Autopilot do it" writes the change on a branch and asks you to review it first. Nothing goes live on its own.'), isAdmin && scan), list) };
  }

  /* ---------- Release notes ---------- */
  function releases() {
    const list = h('div', { class: 'stack' });
    const isAdmin = ctx.me?.admin !== false;
    let data = { notes: [], ai: false, publicPath: `/whatsnew/${id}` };
    const render = (md) => { const out = []; let ul = null; for (const line of md.split('\n')) { const li = /^- (.*)$/.exec(line); if (li) { if (!ul) { ul = h('ul', { class: 'rn-list' }); out.push(ul); } ul.append(h('li', {}, li[1])); continue; } ul = null; const hd = /^(#{1,3}) (.*)$/.exec(line); if (hd) out.push(h(hd[1].length === 1 ? 'h3' : 'h4', { class: 'rn-h' }, hd[2])); else if (line.trim()) out.push(h('p', { class: 'rn-p' }, line)); } return out; };
    async function load() { try { data = await api(`/apps/${id}/releases`); } catch (e) { clear(list).append(emptyState('Could not load release notes', e.message)); return; } paint(); }
    function edit(n) {
      const title = h('input', { class: 'field', value: n.title, 'aria-label': 'Title' }), body = h('textarea', { class: 'sql mono', rows: 14, spellcheck: 'true', 'aria-label': 'Release notes text' }); body.value = n.body;
      const err = h('p', { class: 'err', role: 'alert' });
      const save = actionBtn({ ic: 'check', label: 'Save', cls: 'primary', onClick: async () => { try { await api(`/apps/${id}/releases/${n.id}`, { method: 'PUT', body: { title: title.value, body: body.value } }); m.close(); toast('Saved', 'ok'); load(); } catch (e) { err.textContent = e.message; } } });
      const box = h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Edit release notes' }, h('h2', {}, 'Edit release notes'), h('label', { class: 'lbl' }, 'Title', title), h('label', { class: 'lbl' }, 'Notes (lines starting with "- " are bullets)', body), err, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save));
      const m = modal(box);
    }
    function paint() {
      clear(list);
      if (!data.notes.length) { list.append(emptyState('No release notes yet', isAdmin ? 'Write the first one from the commits on GitHub. It takes a few seconds.' : 'Nothing has been written for this app yet.')); return; }
      const url = `${location.origin}${data.publicPath}`;
      for (const n of data.notes) {
        list.append(h('article', { class: 'panel rn-card' },
          h('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center' } }, h('b', {}, n.title), h('span', { class: 'chip' }, n.date), h('span', { class: 'chip' }, n.source === 'ai' ? 'written by AI' : 'rule-based'), n.published && h('span', { class: 'chip ok' }, 'published'), h('span', { class: 'grow' }),
            h('button', { class: 'btn sm', onclick: () => copy(n.body, 'Notes copied') }, icon('copy', 15), 'Copy'),
            isAdmin && h('button', { class: 'btn sm', onclick: () => edit(n) }, icon('edit', 15), 'Edit'),
            isAdmin && h('button', { class: 'btn sm', onclick: async () => { try { await api(`/apps/${id}/releases/${n.id}`, { method: 'PUT', body: { published: !n.published } }); toast(n.published ? 'Unpublished' : 'Published', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } } }, icon(n.published ? 'lock' : 'external', 15), n.published ? 'Unpublish' : 'Publish'),
            isAdmin && h('button', { class: 'btn sm icon ghost danger', 'aria-label': 'Delete notes', title: 'Delete', onclick: async () => { if (await confirmDialog({ title: 'Delete these notes?', body: n.title, confirm: 'Delete', danger: true })) { await api(`/apps/${id}/releases/${n.id}`, { method: 'DELETE' }); load(); } } }, icon('trash', 15))),
          h('div', { class: 'rn-body' }, ...render(n.body)),
          n.published && h('p', { class: 'muted small' }, 'Public page: ', h('a', { class: 'mono', href: data.publicPath, target: '_blank', rel: 'noopener noreferrer' }, url))));
      }
    }
    const gen = actionBtn({ ic: 'bolt', label: 'Write release notes', cls: 'primary', onClick: async () => { try { await api(`/apps/${id}/releases/generate`, { method: 'POST', body: {} }); toast('Draft written. Review it, then publish.', 'ok'); await load(); } catch (e) { toast(e.message, 'bad'); } } });
    const intro = h('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } }, h('p', { class: 'muted small grow' }, 'Turns the changes on GitHub since the last notes into plain language for your users. Drafts stay private until you publish them; published notes get a public "What\'s new" page you can send to clients.'), isAdmin && gen);
    load();
    return { el: h('div', { class: 'stack' }, intro, list) };
  }
  let current = null;
  async function mount() {
    paintHead();
    if (['secrets', 'deploy', 'data'].includes(ctx.tab) || !detail) await loadDetail();
    if (!detail) { body.append(emptyState('Could not load this app', 'Check the server logs and try again.')); return; }
    const dbTab = () => dbExplorer(ctx, app);
    current = { overview, logs, database: dbTab, data, source: () => ({ el: studioBody({ app, go }) }), secrets, domain, deploy, visual: () => visualEditor({ id, isAdmin: ctx.me?.admin !== false, canApply: true }), look, upgrades, releases, activity }[ctx.tab]?.() || overview();
    clear(body).append(current.el);
  }
  mount();
  return {
    el, title: app.name,
    update(f) {
      app = f.apps.find((a) => a.id === id) || app;
      paintHead(); current?.update?.();
    },
    destroy() { cleanup.forEach((fn) => fn()); },
  };
}
