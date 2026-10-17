import { h, clear, icon, fmt, toast, confirmDialog, copy, actionBtn } from '../ui.js';
import { api, stream } from '../api.js';
import { emptyState } from './shared.js';
import { terminal } from '../term.js';

export function backupsPage(ctx) {
  ctx.crumbs([{ label: 'Overview', href: '#/' }, { label: 'Backups' }]);
  const names = Object.fromEntries(ctx.fleet.apps.map((a) => [a.id, a.name]));
  const appOf = Object.fromEntries(ctx.fleet.apps.map((a) => [a.id, a]));
  const list = h('div'), totals = h('div', { class: 'row wrap' });
  const term = terminal({ max: 400 }); term.el.style.height = '160px';
  const log = h('div', { class: 'job', hidden: true }, term.el);
  let dir = '';

  async function load() {
    clear(list).append(h('div', { class: 'skeleton', style: { height: '120px', margin: '8px' } }));
    let r;
    try { r = await api('/backups?limit=100'); } catch (e) { clear(list).append(emptyState('Could not list backups', e.message)); return; }
    dir = r.dir || '';
    clear(totals).append(h('span', { class: 'chip' }, `${r.data.length} backup${r.data.length === 1 ? '' : 's'}`), h('span', { class: 'chip' }, fmt.bytes(r.totalBytes)), h('span', { class: 'chip' }, 'Nightly at 03:00'), h('span', { class: 'chip' }, 'Keeps last 14 per app'));
    clear(list);
    if (!r.data.length) { list.append(emptyState('No backups yet', 'Back up all databases now, or wait for the nightly run.')); return; }
    list.append(h('div', { class: 'tbl' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'App'), h('th', {}, 'File'), h('th', {}, 'Taken'), h('th', { class: 'r' }, 'Size'), h('th', {}, ''))),
      h('tbody', {}, r.data.map((b) => h('tr', {},
        h('td', {}, h('a', { href: `#/app/${b.app}/data` }, h('b', {}, names[b.app] || b.app))),
        h('td', { class: 'mono small' }, b.name), h('td', {}, fmt.ago(b.t)), h('td', { class: 'r mono' }, fmt.bytes(b.size)),
        h('td', {}, h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
          h('a', { class: 'btn sm icon ghost', href: `/api/v1/backups/${b.name}`, download: b.name, 'aria-label': `Download ${b.name}`, title: 'Download' }, icon('download', 16)),
          h('button', { class: 'btn sm icon ghost', 'aria-label': 'Copy restore command', title: 'Copy restore command', onclick: () => {
            const d = appOf[b.app]?.db || {};
            copy(b.kind === 'sql.gz' ? `gunzip -c ${dir}/${b.name} | docker exec -i ${d.container} sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'` : `docker stop ${(appOf[b.app]?.containers || []).map((c) => c.name).join(' ')} && docker run --rm -v ${d.volume}:/data -v ${dir}:/b alpine sh -c 'rm -rf /data/* && tar xzf /b/${b.name} -C /data' && docker start ${(appOf[b.app]?.containers || []).map((c) => c.name).join(' ')}`, 'Restore command copied');
          } }, icon('refresh', 16)),
          h('button', { class: 'btn sm icon ghost danger', 'aria-label': `Delete ${b.name}`, title: 'Delete', onclick: async () => { if (await confirmDialog({ title: 'Delete this backup?', body: b.name, confirm: 'Delete', danger: true })) { try { await api(`/backups/${b.name}`, { method: 'DELETE' }); toast('Backup deleted', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } } } }, icon('trash', 16))))))))));
  }

  async function backupAll() {
    log.hidden = false; term.reset();
    const targets = ctx.fleet.apps.filter((a) => ['postgres', 'sqlite'].includes(a.db?.type));
    for (const a of targets) {
      term.add(`> ${a.name}`);
      try {
        const { job } = await api(`/apps/${a.id}/backup`, { method: 'POST' });
        await new Promise((res) => { const s = stream(`/jobs/${job}/stream`, { line: (l) => term.add(l), done: () => { s.close(); res(); } }); });
      } catch (e) { term.add(`error: ${e.message}`); }
    }
    toast('All database backups finished', 'ok'); load();
  }

  load();
  const el = h('div', { class: 'stack' },
    h('div', { class: 'row wrap' }, h('h1', { class: 'h2', style: { fontSize: '26px' } }, 'Backups'), h('span', { class: 'grow' }), actionBtn({ ic: 'archive', label: 'Back up all databases', cls: 'primary', onClick: backupAll })),
    h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'All backups'), h('span', { class: 'grow' }), totals), list), log,
    h('p', { class: 'muted small' }, 'Backups live on the server in ', h('code', {}, 'backups/'), '. Download important ones to another place too, since a backup on the same disk does not protect you from losing the disk.'));
  return { el, title: 'Backups' };
}
