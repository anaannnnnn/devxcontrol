import { h, clear, icon, fmt, toast, actionBtn, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { gauge } from '../charts.js';

export function hostPage(ctx) {
  ctx.crumbs([{ label: 'Overview', href: '#/' }, { label: 'Server' }]);
  const gaugesEl = h('div', { class: 'gauges' }), facts = h('div'), out = h('pre', { class: 'term', hidden: true, style: { height: 'auto', maxHeight: '220px', margin: '8px' } });
  const unmanaged = h('div');
  const show = (t) => { out.hidden = false; out.textContent = t || '(no output)'; };

  async function load() {
    const x = await api('/host').catch((e) => { toast(e.message, 'bad'); return null; });
    if (!x) return;
    const memPct = (x.memUsed / x.memTotal) * 100, diskPct = (x.diskUsed / x.diskTotal) * 100, loadPct = Math.min(100, (x.load[0] / x.cpus) * 100);
    clear(gaugesEl).append(
      gauge({ value: loadPct, label: 'CPU load', sub: `${x.load.map((n) => n.toFixed(2)).join('  ')} on ${x.cpus} cores`, color: loadPct > 85 ? 'var(--bad)' : 'var(--s1)' }),
      gauge({ value: memPct, label: 'Memory', sub: `${fmt.bytes(x.memUsed)} of ${fmt.bytes(x.memTotal)}`, color: memPct > 90 ? 'var(--bad)' : 'var(--s3)' }),
      gauge({ value: diskPct, label: 'Disk', sub: `${fmt.bytes(x.diskUsed)} of ${fmt.bytes(x.diskTotal)}`, color: diskPct > 85 ? 'var(--bad)' : 'var(--s2)' }));
    clear(facts).append(h('dl', { class: 'kv' },
      h('dt', {}, 'Host'), h('dd', { class: 'mono' }, x.hostname), h('dt', {}, 'Uptime'), h('dd', {}, fmt.dur(x.uptimeSec * 1000)),
      h('dt', {}, 'Kernel'), h('dd', { class: 'mono' }, x.kernel), h('dt', {}, 'Docker'), h('dd', { class: 'mono' }, x.docker),
      h('dt', {}, 'Images'), h('dd', {}, `${x.images}${x.reclaimable ? `, ${x.reclaimable} reclaimable` : ''}`), h('dt', {}, 'Volumes'), h('dd', {}, x.volumes)));
    clear(unmanaged).append(x.unmanaged.length ? h('div', { class: 'tbl' }, h('table', {}, h('tbody', {}, x.unmanaged.map((c) => h('tr', {}, h('td', { class: 'mono' }, c.name), h('td', {}, h('span', { class: 'pod', dataset: { s: c.state } }, h('i'), c.state)), h('td', { class: 'muted small' }, 'Not managed here (read only)')))))) : h('div', { class: 'empty' }, 'Every container on this server is managed by DevX Control.'));
  }
  load();
  const el = h('div', { class: 'stack' }, h('h1', { class: 'h2', style: { fontSize: '26px' } }, 'Server'),
    h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Capacity')), gaugesEl),
    h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Machine')), facts),
        h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Other containers')), unmanaged)),
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Caddy and housekeeping')),
        h('p', { class: 'muted small', style: { padding: '0 14px' } }, 'Caddy serves every domain and renews HTTPS certificates. Validate before you reload so a typo cannot take every site offline.'),
        h('div', { class: 'row wrap', style: { padding: '12px 14px' } },
          actionBtn({ ic: 'check', label: 'Validate Caddyfile', onClick: async () => { try { const r = await api('/host/caddy/validate', { method: 'POST' }); show(r.output); toast('Caddyfile is valid', 'ok'); } catch (e) { show(e.problem?.output || e.message); toast('Caddyfile has errors', 'bad'); } } }),
          actionBtn({ ic: 'refresh', label: 'Reload Caddy', cls: 'primary', onClick: async () => { if (!(await confirmDialog({ title: 'Reload Caddy?', body: 'Applies the current Caddyfile with no downtime. Invalid configs are rejected and the old one keeps running.', confirm: 'Reload' }))) return; try { const r = await api('/host/caddy/reload', { method: 'POST' }); show(r.output); toast('Caddy reloaded', 'ok'); } catch (e) { toast(e.message, 'bad'); } } }),
          actionBtn({ ic: 'trash', label: 'Prune unused images', onClick: async () => { try { const r = await api('/host/prune-images', { method: 'POST' }); show(r.output); toast('Unused images removed', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } } }),
          actionBtn({ ic: 'bell', label: 'Send test alert', onClick: async () => { try { const r = await api('/host/test-alert', { method: 'POST' }); toast(r.sent ? 'Test alert sent' : 'No alert channel configured yet. Set ALERT_WEBHOOK or Telegram variables.', r.sent ? 'ok' : 'bad'); } catch (e) { toast(e.message, 'bad'); } } })),
        out)));
  const iv = setInterval(load, 20000);
  return { el, title: 'Server', destroy: () => clearInterval(iv) };
}
