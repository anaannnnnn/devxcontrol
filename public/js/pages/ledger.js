// Ledger: run a report on the local report engine and see whether Nexus is up. Read-only.
import { h, clear, toast } from '../ui.js';
import { api } from '../api.js';

const KINDS = [
  { id: 'sales', label: 'Sales', groups: ['branch', 'location', 'department', 'category', 'subcategory', 'brand', 'supplier', 'item', 'customer', 'salesman', 'voucher', 'day', 'month'] },
  { id: 'purchase', label: 'Purchases', groups: ['branch', 'location', 'department', 'category', 'subcategory', 'brand', 'supplier', 'item', 'customer', 'voucher', 'day', 'month'] },
  { id: 'perf', label: 'Item performance', groups: ['department', 'category', 'brand', 'supplier', 'branch', 'item'] },
  { id: 'stock', label: 'Stock on hand', groups: ['department', 'category', 'brand', 'supplier', 'location', 'item'], noDates: true },
  { id: 'move', label: 'Stock movement', groups: ['department', 'location', 'item'] },
  { id: 'age', label: 'Stock age', groups: [], noDates: true },
  { id: 'ageItems', label: 'Stock age by item', groups: [], noDates: true },
  { id: 'lines', label: 'Lines', groups: [] },
];
const iso = (d) => d.toISOString().slice(0, 10);
const cell = (col, v) => {
  if (v == null || v === '') return '';
  if (!col.num) return String(v);
  const n = Number(v); if (!Number.isFinite(n)) return String(v);
  return col.num === 'pct' ? `${n.toFixed(1)}%` : n.toLocaleString('en-AE', { maximumFractionDigits: 2 });
};

export function ledgerPage(ctx) {
  ctx.crumbs([{ label: 'Ledger' }]);
  const root = h('div', { class: 'stack' });
  root.append(h('h1', {}, 'Ledger'), h('p', { class: 'muted' }, 'Reports from the local report engine, read straight from the ledger. Nothing here changes any data.'));

  const status = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Checking…'));
  const pill = (name, s, extra) => h('div', { class: 'flag-row' }, h('span', {}, h('b', {}, name), extra ? h('small', { class: 'muted' }, ` ${extra}`) : null),
    h('span', { class: s.up ? 'ok' : 'bad', role: 'status' }, s.up ? 'Up' : 'Down'));
  async function paintStatus() {
    try {
      const s = await api('/ledger/status');
      clear(status).append(
        pill('Nexus', s.nexus, s.nexus.up ? `${s.nexus.ms} ms` : (s.nexus.status ? `HTTP ${s.nexus.status}` : s.nexus.detail || '')),
        pill('Report engine', s.engine, s.engine.up ? `data ${s.engine.from} to ${s.engine.to}, ${s.engine.branches} branches` : s.engine.detail || ''));
    } catch (e) { clear(status).append(h('p', { class: 'bad' }, e.message)); }
  }

  const today = new Date();
  const kind = h('select', { class: 'field', 'aria-label': 'Report' }, KINDS.map((k) => h('option', { value: k.id }, k.label)));
  const group = h('select', { class: 'field', 'aria-label': 'Breakdown' });
  const from = h('input', { class: 'field', type: 'date', value: iso(new Date(today.getTime() - 6 * 86400000)), max: iso(today), 'aria-label': 'From' });
  const to = h('input', { class: 'field', type: 'date', value: iso(today), max: iso(today), 'aria-label': 'To' });
  const q = h('input', { class: 'field', maxlength: 80, placeholder: 'Optional search', 'aria-label': 'Search' });
  const fromL = h('label', {}, 'From', from); const toL = h('label', {}, 'To', to); const groupL = h('label', {}, 'Breakdown', group);
  const sync = () => {
    const k = KINDS.find((x) => x.id === kind.value);
    clear(group).append(...k.groups.map((g) => h('option', { value: g }, g[0].toUpperCase() + g.slice(1))));
    groupL.hidden = !k.groups.length; fromL.hidden = toL.hidden = !!k.noDates;
  };
  kind.addEventListener('change', sync); sync();

  const out = h('div', { class: 'stack' });
  const go = h('button', { class: 'btn', type: 'submit' }, 'Run report');
  const form = h('form', { class: 'panel hud', style: { padding: '14px', display: 'grid', gap: '8px' }, onsubmit: async (e) => {
    e.preventDefault(); if (go.disabled) return;
    go.disabled = true; go.textContent = 'Running…';
    const body = { kind: kind.value, group: group.value || '', from: from.value, to: to.value, ...(q.value.trim() ? { q: q.value.trim() } : {}) };
    const t0 = performance.now();
    try { paint(await api('/ledger/run', { method: 'POST', body }), performance.now() - t0); }
    catch (err) { toast(err.message, 'bad'); clear(out).append(h('div', { class: 'empty' }, h('b', {}, 'Report failed'), h('p', {}, err.message))); }
    finally { go.disabled = false; go.textContent = 'Run report'; }
  } }, h('label', {}, 'Report', kind), groupL, fromL, toL, h('label', {}, 'Search', q), go);

  function paint(r, ms) {
    const cols = Array.isArray(r.columns) ? r.columns : []; const rows = Array.isArray(r.rows) ? r.rows : [];
    const table = h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, cols.map((c) => h('th', { scope: 'col', class: c.num ? 'num' : '' }, c.label)))),
      h('tbody', {}, rows.length ? rows.map((row) => h('tr', {}, cols.map((c) => h('td', { class: c.num ? 'num' : '' }, cell(c, row[c.key])))))
        : h('tr', {}, h('td', { colspan: Math.max(1, cols.length) }, 'Nothing matched these filters.'))),
      r.totals && h('tfoot', {}, h('tr', {}, cols.map((c, i) => h('td', { class: c.num ? 'num' : '' }, i === 0 ? 'Total' : cell(c, r.totals[c.key]))))));
    clear(out).append(h('section', { class: 'panel hud', style: { padding: '14px', display: 'grid', gap: '8px' } },
      h('h2', {}, r.title || 'Report'),
      h('p', { class: 'muted' }, `${(r.total ?? rows.length).toLocaleString('en-AE')} rows · ${(ms / 1000).toFixed(1)} s`, r.note ? ` · ${r.note}` : ''),
      h('div', { style: { overflowX: 'auto' } }, table)));
  }

  root.append(h('section', { class: 'panel hud', style: { padding: '14px', display: 'grid', gap: '8px' } }, h('h2', {}, 'Status'), status), form, out);
  paintStatus();
  const timer = setInterval(() => { if (document.visibilityState === 'visible') paintStatus(); }, 30000);
  return { el: root, title: 'Ledger', destroy: () => clearInterval(timer) };
}
