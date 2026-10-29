import { schemePicker } from '../scheme-ui.js';
import { h, clear, icon, fmt, orb, STATUS_LABEL, actionBtn, confirmDialog, toast } from '../ui.js';
import { api } from '../api.js';
import { sparkline, radar } from '../charts.js';
import { fx } from '../fx.js';
import { mountScene } from '../scene.js';

const GROUP_ORDER = ['AI', 'Platforms', 'Sites'];

export function lifecycleButtons(app, refresh, { sm = true, labels = false } = {}) {
  const run = (action) => async () => {
    try { await api(`/apps/${app.id}/${action}`, { method: 'POST' }); toast(`${app.name}: ${action} sent`, 'ok'); }
    catch (e) { toast(`${app.name}: ${e.message}`, 'bad'); }
    await refresh();
  };
  const stopped = app.status === 'stopped' || app.status === 'down';
  const restart = actionBtn({ ic: 'restart', label: 'Restart', title: `Restart ${app.name}`, icon: !labels, sm, onClick: run('restart') });
  const toggle = stopped
    ? actionBtn({ ic: 'play', label: 'Start', title: `Start ${app.name}`, icon: !labels, sm, onClick: run('start') })
    : actionBtn({ ic: 'stop', label: 'Stop', title: `Stop ${app.name}`, icon: !labels, sm, cls: 'danger', onClick: async () => {
        if (await confirmDialog({ title: `Stop ${app.name}?`, body: `All ${app.containers.length} container(s) will stop and ${app.urls[0]?.url.replace('https://', '')} will go offline until you start it again.`, confirm: 'Stop app', danger: true })) await run('stop')();
      } });
  return [restart, toggle];
}

function vessel(app, ctx) {
  const refs = {};
  const el = h('article', { class: 'vessel', dataset: { id: app.id } });
  const who = h('div', { class: 'who' }, (refs.orb = h('span')), h('div', { style: { minWidth: 0 } },
    h('div', { class: 'name' }, (refs.link = h('a', { href: `#/app/${app.id}` }, app.name)), (refs.word = h('span', { class: 'status-word' }))),
    h('div', { class: 'tag' }, app.tagline)));
  refs.upd = h('span', { class: 'extra' });
  refs.urls = h('div', { class: 'urls' }, app.urls.map((u) => h('a', { class: 'chip link', href: u.url, target: '_blank', rel: 'noopener noreferrer', title: `Open ${u.url}` }, u.label, icon('external', 12))), refs.upd);
  refs.pods = h('div', { class: 'pods' });
  refs.cpuBar = h('i'); refs.memBar = h('i'); refs.cpuTxt = h('b'); refs.memTxt = h('b');
  const mid = h('div', { class: 'mid' }, refs.pods, h('div', { class: 'load' },
    h('div', {}, h('span', {}, 'CPU', refs.cpuTxt), h('div', { class: 'meter' }, refs.cpuBar)),
    h('div', {}, h('span', {}, 'Memory', refs.memTxt), h('div', { class: 'meter mem' }, refs.memBar))));
  refs.spark = h('div'); refs.ms = h('div', { class: 'ms' });
  const pulse = h('div', { class: 'pulse' }, refs.spark, refs.ms);
  refs.up = h('div', { class: 'up' });
  refs.acts = h('div', { class: 'acts' });
  el.append(who, refs.urls, mid, pulse, refs.up, refs.acts);

  let sig = '';
  function update(a, selected) {
    app = a;
    el.classList.toggle('on', selected);
    clear(refs.upd).append(...[a.behind > 0 && h('a', { class: 'chip warn link', href: `#/app/${a.id}/deploy`, title: 'New commits on GitHub' }, icon('bolt', 12), `${a.behind} update${a.behind > 1 ? 's' : ''}`), a.hasDb && h('a', { class: 'chip link', href: `#/app/${a.id}/database`, title: 'Browse and edit the database' }, icon('table', 12), 'Data')].filter(Boolean));
    clear(refs.orb).append(orb(a.status));
    refs.word.textContent = STATUS_LABEL[a.status] || a.status;
    refs.word.dataset.s = a.status;
    clear(refs.pods).append(...a.containers.map((c) => h('span', { class: 'pod', dataset: { s: c.state }, title: `${c.name}: ${c.state}${c.restarts ? `, ${c.restarts} restart(s)` : ''}` }, h('i'), c.name.replace(new RegExp(`^${a.id}-?`), '') || a.id)));
    refs.cpuTxt.textContent = fmt.pct(a.cpu, 1);
    refs.cpuBar.style.width = `${Math.min(100, a.cpu)}%`;
    refs.memTxt.textContent = fmt.bytes(a.mem);
    refs.memBar.style.width = `${Math.min(100, (a.mem / (ctx.fleet.host?.memTotal || 16 * 2 ** 30)) * 100 * 4)}%`;
    clear(refs.spark).append(sparkline(a.spark.ms));
    clear(refs.ms).append(a.ms != null ? `${a.ms} ms` : '-', h('small', {}, a.ms != null ? 'avg response' : 'no response'));
    clear(refs.up).append(h('b', {}, a.uptime24h != null ? `${a.uptime24h}%` : '-'), `24h uptime`);
    const s = a.status + a.stopped;
    if (s !== sig) { sig = s; clear(refs.acts).append(...lifecycleButtons(a, ctx.refresh)); }
  }
  return { el, update };
}

export function fleetPage(ctx) {
  const rad = radar((id) => ctx.go(`/app/${id}`));
  const sceneBox = h('div', { class: 'scene-box' }, rad.el);
  const sceneWrap = h('div', { class: 'scene-wrap hud-frame' },
    h('span', { class: 'hud-tag corner tl', dataset: { t: 'live' } }, 'NODE GRAPH'), h('span', { class: 'hud-tag corner tr', dataset: { t: 'ok' } }, 'LINK SECURE'),
    sceneBox, h('div', { class: 'scene-cap' }, h('span', {}, 'Core: your server'), h('span', {}, 'Nodes: apps'), h('span', {}, 'Hover or tab to inspect')));
  let scene = null, dead = false;
  mountScene(sceneBox, { apps: ctx.fleet.apps, onOpen: (id) => ctx.go(`/app/${id}`) }).then((sc) => { if (dead) { sc?.destroy(); return; } if (sc) { scene = sc; rad.el.remove(); } });
  const headline = h('h1');
  const lede = h('p', { class: 'lede' });
  const strip = h('div', { class: 'stat-strip' });
  const banner = h('div');
  const groupsEl = h('div');
  const ticker = h('div', { class: 'ticker', 'aria-label': 'Recent activity', role: 'marquee' });
  const el = h('div', {}, banner,
    h('section', { class: 'hero' }, h('div', {}, h('div', { class: 'hud-eyebrow', 'data-decode': '' }, 'Overview · live'), headline, lede, strip), sceneWrap),
    ticker, groupsEl);
  api('/events?limit=14').then((r) => {
    if (!r.data.length) { ticker.remove(); return; }
    let prev = ''; const items = r.data.filter((e) => (e.msg === prev ? false : (prev = e.msg, true))).map((e) => h('span', { class: 'it', dataset: { l: e.level } }, h('i'), e.msg, h('time', {}, fmt.ago(e.t))));
    ticker.append(h('div', { class: 'ticker-track' }, items, items.map((n) => n.cloneNode(true))));
  }).catch(() => ticker.remove());
  const rows = new Map();
  let builtFor = '', built = false;

  function stat(k, v, unit, cls = '') {
    const num = h('span', {}, String(v));
    const n = Number(v);
    if (Number.isFinite(n) && v !== '-') fx.count(num, n, { key: `stat:${k}`, decimals: String(v).includes('.') ? 1 : 0 });
    return h('div', { class: `stat ${cls}` }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, num, unit && h('small', {}, unit)));
  }

  function update(f) {
    const s = f.summary;
    clear(banner);
    if (f.demo) { banner.append(h('div', { class: 'banner demo' }, icon('alert'), h('span', {}, 'Demo mode: this is simulated data. Run DevX Control on your server to see the real fleet.'))); const dk = schemePicker({ dock: true }); if (dk && !document.querySelector('.schemes.dock')) document.body.append(dk); }
    if (f.dockerError) banner.append(h('div', { class: 'banner' }, icon('alert'), h('span', {}, `Cannot reach Docker: ${f.dockerError}. Check that the socket is mounted.`)));

    const attention = s.down + s.degraded;
    clear(headline);
    if (attention === 0 && s.stopped === 0) headline.append(`All ${s.total} apps `, h('span', { class: 'calm' }, 'are running.'));
    else if (attention === 0) headline.append(`${s.healthy} running, `, h('span', { class: 'calm' }, `${s.stopped} stopped on purpose.`));
    else headline.append(`${attention} ${attention === 1 ? 'app needs' : 'apps need'} `, h('span', { class: 'calm' }, 'attention.'));
    const bad = f.apps.filter((a) => ['down', 'degraded', 'crashing'].includes(a.status));
    lede.textContent = bad.length ? `${bad.map((a) => a.name).join(', ')} ${bad.length === 1 ? 'is' : 'are'} not fully healthy. Open ${bad.length === 1 ? 'it' : 'one'} to see logs and restart.` : `Checked ${fmt.ago(f.lastTick).replace(' ago', '')} ago across ${s.containers.total} containers. Everything answers on its own domain.`;

    clear(strip).append(
      stat('Avg response', s.avgMs ?? '-', s.avgMs != null ? 'ms' : '', s.avgMs > 800 ? 'warn' : ''),
      stat('Containers', `${s.containers.running}`, `/ ${s.containers.total}`, s.containers.running < s.containers.total - s.stopped ? 'warn' : ''),
      stat('CPU', s.cpu.toFixed(1), '%'),
      stat('Memory', fmt.bytes(s.mem).split(' ')[0], fmt.bytes(s.mem).split(' ')[1]),
      stat('TLS renewal', s.nextCertDays ?? '-', s.nextCertDays != null ? 'days' : '', s.nextCertDays != null && s.nextCertDays < 14 ? 'bad' : ''),
      stat('Updates', f.apps.filter((a) => a.behind > 0).length, '', f.apps.some((a) => a.behind > 0) ? 'warn' : ''),
      f.host && stat('Disk used', Math.round((f.host.diskUsed / f.host.diskTotal) * 100) || '-', '%', f.host.diskUsed / f.host.diskTotal > 0.85 ? 'bad' : ''),
    );
    rad.update(f.apps, ctx.hoverId); scene?.update(f.apps);

    const key = f.apps.map((a) => a.id).join();
    if (key !== builtFor) {
      builtFor = key; rows.clear(); clear(groupsEl);
      const groups = [...new Set(f.apps.map((a) => a.group))].sort((a, b) => (GROUP_ORDER.indexOf(a) + 99) % 99 - (GROUP_ORDER.indexOf(b) + 99) % 99);
      for (const g of groups) {
        const list = h('div', { class: 'vessels' });
        for (const a of f.apps.filter((x) => x.group === g)) { const v = vessel(a, ctx); rows.set(a.id, v); list.append(v.el); }
        groupsEl.append(h('section', { class: 'group' }, h('h2', {}, g, h('span', { class: 'count' }, `${f.apps.filter((x) => x.group === g).length}`)), list));
      }
    }
    for (const a of f.apps) rows.get(a.id)?.update(a, false);
    if (key !== builtFor || !built) { built = true; queueMicrotask(() => window.dispatchEvent(new Event('dc:content'))); }
  }
  update(ctx.fleet);
  // hovering a row highlights its blip
  groupsEl.addEventListener('pointerover', (e) => { const r = e.target.closest?.('.vessel'); if (r) rad.hover(r.dataset.id, true); });
  groupsEl.addEventListener('pointerleave', () => rad.hover('', false));
  return { el, update, title: 'Fleet', destroy() { dead = true; scene?.destroy(); } };
}
