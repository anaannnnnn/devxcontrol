// Database explorer: tables, a live data grid with inline editing, row forms and a SQL console.
import { h, clear, icon, fmt, toast, confirmDialog, modal, actionBtn } from '../ui.js';
import { api } from '../api.js';
import { emptyState } from './shared.js';

const show = (v) => {
  if (v === null || v === undefined) return { t: 'NULL', c: 'nul' };
  if (typeof v === 'object') return { t: JSON.stringify(v), c: 'json' };
  if (typeof v === 'boolean') return { t: String(v), c: 'bool' };
  if (typeof v === 'number') return { t: String(v), c: 'numv' };
  return { t: String(v), c: '' };
};
const PG = ['text', 'integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision', 'boolean', 'date', 'time', 'timestamp', 'timestamptz', 'uuid', 'json', 'jsonb', 'bytea'], SQLITE = ['TEXT', 'INTEGER', 'REAL', 'NUMERIC', 'BLOB'];
const asText = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function dbExplorer(ctx, app) {
  const id = app.id;
  const st = { tables: [], table: null, file: null, files: null, engine: null, q: '', sort: null, dir: 'asc', offset: 0, limit: 50, data: null, mode: 'data' };
  const qs = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const base = () => `/apps/${id}/db`;
  const fileQ = () => (st.file && st.files?.length > 1 ? { file: st.file } : {});

  const side = h('aside', { class: 'dbx-side' });
  const mainEl = h('div', { class: 'dbx-main' });
  const el = h('div', { class: 'dbx' }, side, mainEl);

  /* ---------- tables list ---------- */
  async function loadTables(keep) {
    try {
      const r = await api(`${base()}/tables?${qs(fileQ())}`);
      Object.assign(st, { tables: r.tables, engine: r.engine, files: r.files, file: st.file || r.file });
      if (!keep || !st.tables.some((t) => t.name === st.table)) st.table = st.tables[0]?.name || null;
      paintSide();
      if (st.table) await loadRows(); else paintMain();
    } catch (e) { clear(side); clear(mainEl).append(emptyState('Could not open the database', e.message)); }
  }
  function paintSide() {
    clear(side);
    side.append(h('div', { class: 'dbx-eng' }, icon('db', 16), h('b', {}, st.engine === 'postgres' ? 'PostgreSQL' : 'SQLite'), h('span', { class: 'chip' }, `${st.tables.length} tables`)));
    if (st.files?.length > 1) {
      side.append(h('select', { class: 'field', 'aria-label': 'Database file', onchange: (e) => { st.file = e.target.value; st.table = null; loadTables(false); } }, st.files.map((f) => h('option', { value: f, selected: f === st.file }, f))));
    }
    const list = h('div', { class: 'dbx-tables', role: 'listbox', 'aria-label': 'Tables' }, st.tables.map((t) => h('button', {
      role: 'option', 'aria-selected': String(t.name === st.table), class: 'dbx-t', onclick: () => { st.table = t.name; Object.assign(st, { q: '', sort: null, dir: 'asc', offset: 0 }); st.mode = 'data'; paintSide(); loadRows(); },
    }, icon('table', 15), h('span', { class: 'mono' }, t.name), h('span', { class: 'n' }, Number(t.rows).toLocaleString()))));
    side.append(list, h('button', { class: 'btn sm', style: { margin: '10px 0 0' }, onclick: () => newTable() }, icon('plus', 15), 'New table'));
    if (!st.tables.length) list.append(emptyState('No tables', 'This database is empty.'));
  }

  /* ---------- data grid ---------- */
  async function loadRows() {
    paintMain(true);
    try {
      st.data = await api(`${base()}/tables/${encodeURIComponent(st.table)}?${qs({ limit: st.limit, offset: st.offset, q: st.q, sort: st.sort, dir: st.dir, ...fileQ() })}`);
      paintMain();
    } catch (e) { clear(mainEl).append(emptyState('Could not read this table', e.message)); }
  }
  const keyOf = (row) => (st.data.engine === 'sqlite' ? { _rowid_: row._rowid_ } : Object.fromEntries(st.data.columns.filter((c) => c.pk).map((c) => [c.name, row[c.name]])));
  const visibleCols = () => st.data.columns;

  function paintMain(loading) {
    clear(mainEl);
    if (!st.table) { mainEl.append(emptyState('Pick a table', 'Choose a table on the left to see its rows.')); return; }
    const d = st.data;
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
      h('button', { 'aria-pressed': String(st.mode === 'data'), onclick: () => { st.mode = 'data'; paintMain(); } }, icon('table', 15), 'Rows'),
      h('button', { 'aria-pressed': String(st.mode === 'structure'), onclick: () => { st.mode = 'structure'; paintMain(); } }, icon('cube', 15), 'Structure'),
      h('button', { 'aria-pressed': String(st.mode === 'sql'), onclick: () => { st.mode = 'sql'; paintMain(); } }, icon('terminal', 15), 'SQL'));
    if (st.mode === 'structure') { const pane = h('div', { class: 'stack' }); mainEl.append(h('div', { class: 'dbx-bar' }, h('h3', { class: 'mono' }, st.table), h('span', { class: 'grow' }), seg), pane); structureInto(pane); return; }
    if (st.mode === 'sql') { mainEl.append(h('div', { class: 'dbx-bar' }, h('h3', { class: 'mono' }, st.table), h('span', { class: 'grow' }), seg), sqlConsole()); return; }

    const search = h('input', { class: 'field', type: 'search', placeholder: 'Search every column', 'aria-label': 'Search rows', value: st.q, onkeydown: (e) => { if (e.key === 'Enter') { st.q = e.target.value.trim(); st.offset = 0; loadRows(); } } });
    const bar = h('div', { class: 'dbx-bar' }, h('h3', { class: 'mono' }, st.table), d && h('span', { class: 'chip' }, `${d.total.toLocaleString()} row${d.total === 1 ? '' : 's'}`), h('span', { class: 'grow' }), search,
      h('button', { class: 'btn sm icon', title: 'Refresh', 'aria-label': 'Refresh rows', onclick: () => loadRows() }, icon('refresh', 16)),
      h('a', { class: 'btn sm', href: `/api/v1${base()}/tables/${encodeURIComponent(st.table)}/export.csv?${qs(fileQ())}`, download: '' }, icon('download', 15), 'CSV'),
      d?.editable && h('button', { class: 'btn sm primary', onclick: () => rowForm() }, icon('plus', 15), 'Add row'), seg);
    mainEl.append(bar);
    if (loading || !d) { mainEl.append(h('div', { class: 'skeleton', style: { height: '260px', margin: '10px 0' } })); return; }
    if (!d.editable) mainEl.append(h('div', { class: 'banner demo' }, icon('alert'), h('span', {}, 'This table has no primary key, so it is read-only here. Use the SQL tab for changes.')));

    const cols = visibleCols();
    const head = h('tr', {}, cols.map((c) => h('th', { 'aria-sort': st.sort === c.name ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
      h('button', { class: 'th-b', onclick: () => { st.dir = st.sort === c.name && st.dir === 'asc' ? 'desc' : 'asc'; st.sort = c.name; st.offset = 0; loadRows(); } },
        c.pk && h('span', { class: 'pk', title: 'Primary key' }, icon('key', 12)), c.name, h('small', {}, c.type), st.sort === c.name && h('span', { class: 'arr' }, st.dir === 'asc' ? '↑' : '↓')))), d.editable && h('th', { class: 'act' }));
    const body = d.rows.map((row) => h('tr', {}, cols.map((c) => cell(row, c)), d.editable && h('td', { class: 'act' }, h('div', { class: 'row' },
      h('button', { class: 'btn sm icon ghost', title: 'Edit row', 'aria-label': 'Edit row', onclick: () => rowForm(row) }, icon('edit', 15)),
      h('button', { class: 'btn sm icon ghost danger', title: 'Delete row', 'aria-label': 'Delete row', onclick: () => delRow(row) }, icon('trash', 15))))));
    mainEl.append(h('div', { class: 'grid-wrap' }, h('table', { class: 'grid' }, h('thead', {}, head), h('tbody', {}, body.length ? body : h('tr', {}, h('td', { colspan: cols.length + 1 }, emptyState(st.q ? 'No matches' : 'This table is empty', st.q ? 'Try a different search.' : 'Add a row to get started.')))))));
    const from = d.total ? d.offset + 1 : 0, to = Math.min(d.offset + d.limit, d.total);
    mainEl.append(h('div', { class: 'dbx-foot' },
      h('span', { class: 'muted small' }, `${from.toLocaleString()}–${to.toLocaleString()} of ${d.total.toLocaleString()}`, d.editable ? ' · double-click a cell to edit' : ''), h('span', { class: 'grow' }),
      h('select', { class: 'field sm', 'aria-label': 'Rows per page', onchange: (e) => { st.limit = +e.target.value; st.offset = 0; loadRows(); } }, [25, 50, 100, 250].map((n) => h('option', { value: n, selected: n === st.limit }, `${n} / page`))),
      h('button', { class: 'btn sm', disabled: d.offset === 0, onclick: () => { st.offset = Math.max(0, st.offset - st.limit); loadRows(); } }, 'Previous'),
      h('button', { class: 'btn sm', disabled: to >= d.total, onclick: () => { st.offset += st.limit; loadRows(); } }, 'Next')));
  }

  function cell(row, col) {
    const v = show(row[col.name]);
    const td = h('td', { class: `c ${v.c}`, title: v.t.length > 40 ? v.t : null }, v.t);
    if (st.data.editable && !col.generated) td.addEventListener('dblclick', () => inlineEdit(td, row, col));
    return td;
  }
  function inlineEdit(td, row, col) {
    if (td.querySelector('input')) return;
    const original = row[col.name];
    const input = h('input', { class: 'cell-in mono', value: asText(original), 'aria-label': `Edit ${col.name}` });
    const done = () => paintMain();
    const save = async (val) => {
      if (val === asText(original) && !(val === '' && original === null)) return done();
      try { await api(`${base()}/tables/${encodeURIComponent(st.table)}/rows`, { method: 'PUT', body: { key: keyOf(row), set: { [col.name]: val }, ...fileQ() } }); toast('Saved', 'ok'); await loadRows(); }
      catch (e) { toast(e.message, 'bad'); done(); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(input.value); if (e.key === 'Escape') done(); });
    const nul = h('button', { class: 'cell-null', title: 'Set to NULL', onmousedown: (e) => { e.preventDefault(); save(null); } }, 'NULL');
    clear(td).append(input, nul); td.classList.add('editing'); input.focus(); input.select();
    input.addEventListener('blur', () => setTimeout(() => { if (td.isConnected && td.classList.contains('editing') && !td.contains(document.activeElement)) done(); }, 120));
  }

  function rowForm(row) {
    const editing = !!row; const cols = st.data.columns.filter((c) => !c.generated);
    const fields = cols.map((c) => {
      const input = h('input', { class: 'field mono', value: editing ? asText(row[c.name]) : '', placeholder: editing ? '' : c.default ? `default: ${c.default}` : c.nullable ? 'empty = NULL / default' : 'required', 'aria-label': c.name, disabled: editing && c.pk && st.data.engine === 'postgres' });
      const nul = h('input', { type: 'checkbox', checked: editing && row[c.name] === null, 'aria-label': `${c.name} is NULL` });
      nul.addEventListener('change', () => { input.disabled = nul.checked; });
      if (nul.checked) input.disabled = true;
      return { c, input, nul, el: h('label', { class: 'frow' }, h('span', { class: 'fl' }, h('b', { class: 'mono' }, c.name), h('small', {}, c.type, c.pk ? ' · key' : '')), input, c.nullable && h('span', { class: 'nulbox' }, nul, 'NULL')) };
    });
    const err = h('p', { class: 'err', role: 'alert' });
    const save = actionBtn({ ic: 'check', label: editing ? 'Save changes' : 'Add row', cls: 'primary', onClick: async () => {
      err.textContent = '';
      const values = {};
      for (const f of fields) {
        const was = editing ? row[f.c.name] : undefined; const val = f.nul.checked ? null : f.input.value;
        if (editing) { if (val !== (was === null ? null : asText(was)) && !f.input.disabled || (f.nul.checked && was !== null)) values[f.c.name] = val; }
        else if (f.nul.checked) values[f.c.name] = null; else if (val !== '') values[f.c.name] = val;
      }
      try {
        if (editing) { if (!Object.keys(values).length) { m.close(); return; } await api(`${base()}/tables/${encodeURIComponent(st.table)}/rows`, { method: 'PUT', body: { key: keyOf(row), set: values, ...fileQ() } }); }
        else await api(`${base()}/tables/${encodeURIComponent(st.table)}/rows`, { method: 'POST', body: { values, ...fileQ() } });
        m.close(); toast(editing ? 'Row updated' : 'Row added', 'ok'); loadRows(); loadTables(true);
      } catch (e) { err.textContent = e.message; }
    } });
    const box = h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': editing ? 'Edit row' : 'Add row' },
      h('h2', {}, editing ? `Edit row in ${st.table}` : `Add row to ${st.table}`), h('div', { class: 'fgrid' }, fields.map((f) => f.el)), err,
      h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save));
    const m = modal(box); fields[0]?.input.focus();
  }

  async function delRow(row) {
    if (!(await confirmDialog({ title: 'Delete this row?', body: `This permanently removes the row from ${st.table} in ${app.name}. Back up first if you are unsure.`, confirm: 'Delete row', danger: true }))) return;
    try { await api(`${base()}/tables/${encodeURIComponent(st.table)}/rows/delete`, { method: 'POST', body: { key: keyOf(row), ...fileQ() } }); toast('Row deleted', 'ok'); loadRows(); loadTables(true); }
    catch (e) { toast(e.message, 'bad'); }
  }


  /* ---------- structure (schema editor) ---------- */
  const typeSelect = (types, value) => h('select', { class: 'field', 'aria-label': 'Type' }, [...new Set([...(value && !types.includes(value) ? [value] : []), ...types])].map((t) => h('option', { value: t, selected: t === value }, t)));
  const lbl = (text, input, hint) => h('label', { class: 'frow' }, h('span', { class: 'fl' }, h('b', {}, text), hint && h('small', {}, hint)), input);
  const post = (body) => api(`${base()}/schema`, { method: 'POST', body: { ...body, ...fileQ() } });

  // Every change is first checked on a rollback-only test run, shown to you, then applied after an automatic backup.
  async function review(body, title) {
    let plan;
    try { plan = await post({ ...body, dry: true }); } catch (e) { toast(e.message, 'bad'); return false; }
    return new Promise((resolve) => {
      const err = h('p', { class: 'err', role: 'alert' });
      const apply = actionBtn({ ic: 'check', label: 'Back up and apply', cls: plan.destructive ? 'danger' : 'primary', onClick: async () => {
        try { await post(body); m.close(); toast('Structure updated. A backup was taken first.', 'ok'); resolve(true); } catch (e) { err.textContent = e.message; }
      } });
      const box = h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', {}, title), h('p', { class: 'muted small' }, 'Test run passed: this works on your data. Nothing has changed yet.'),
        h('pre', { class: 'mono sqlprev' }, `${plan.statements.join(';\n')};`),
        ...plan.warnings.map((w) => h('div', { class: 'banner demo' }, icon('alert'), h('span', {}, w))),
        h('p', { class: 'muted small' }, plan.reversible ? 'You can undo this afterwards from History.' : 'This cannot be undone automatically. The backup taken first is your way back.'),
        err, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => { m.close(); resolve(false); } }, 'Cancel'), apply));
      const m = modal(box);
    });
  }
  const afterChange = async (ok, newName) => { if (!ok) return; if (newName) st.table = newName; await loadTables(true); st.mode = 'structure'; paintMain(); };

  async function structureInto(pane) {
    clear(pane).append(h('div', { class: 'skeleton', style: { height: '220px' } }));
    let s;
    try { s = await api(`${base()}/tables/${encodeURIComponent(st.table)}/structure?${qs(fileQ())}`); }
    catch (e) { clear(pane).append(emptyState('Could not read the structure', e.message)); return; }
    const out = [];
    if (!s.canAlter) out.push(h('div', { class: 'banner demo' }, icon('alert'), h('span', {}, 'SQLite can add, rename and drop columns here. Changing a type, NOT NULL or default needs a table rebuild: use the SQL tab.')));
    const rows = s.columns.map((c) => h('tr', {},
      h('td', { class: 'c mono' }, c.pk && h('span', { class: 'pk', title: 'Primary key' }, icon('key', 12)), ' ', c.name),
      h('td', { class: 'c mono' }, c.type), h('td', { class: 'c' }, c.nullable ? 'yes' : 'no'), h('td', { class: 'c mono' }, c.default ?? ''),
      h('td', { class: 'act' }, h('div', { class: 'row' },
        h('button', { class: 'btn sm icon ghost', title: 'Edit column', 'aria-label': `Edit column ${c.name}`, onclick: () => editColumn(s, c) }, icon('edit', 15)),
        !c.pk && h('button', { class: 'btn sm icon ghost danger', title: 'Drop column', 'aria-label': `Drop column ${c.name}`, onclick: async () => afterChange(await review({ table: st.table, ops: [{ op: 'drop_column', name: c.name }] }, `Drop column ${c.name}`)) }, icon('trash', 15))))));
    out.push(h('div', { class: 'row wrap' }, h('b', {}, 'Columns'), h('span', { class: 'grow' }),
      h('button', { class: 'btn sm primary', onclick: () => addColumn(s) }, icon('plus', 15), 'Add column'),
      h('button', { class: 'btn sm', onclick: () => renameTable() }, icon('edit', 15), 'Rename table'),
      h('button', { class: 'btn sm danger', onclick: () => dropTable() }, icon('trash', 15), 'Drop table')));
    out.push(h('div', { class: 'grid-wrap' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, ['Name', 'Type', 'Null', 'Default', ''].map((t) => h('th', {}, h('span', { class: 'th-b' }, t))))), h('tbody', {}, rows))));
    out.push(h('div', { class: 'row wrap' }, h('b', {}, 'Indexes'), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => addIndex(s) }, icon('plus', 15), 'Add index')));
    out.push(s.indexes.length
      ? h('div', { class: 'stack' }, s.indexes.map((i) => h('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } }, h('span', { class: 'mono' }, i.name), h('span', { class: 'chip' }, i.unique ? 'unique' : 'index'), h('span', { class: 'muted small mono' }, i.columns.join(', ')), h('span', { class: 'grow' }),
        h('button', { class: 'btn sm icon ghost danger', title: 'Drop index', 'aria-label': `Drop index ${i.name}`, onclick: async () => afterChange(await review({ table: st.table, ops: [{ op: 'drop_index', name: i.name }] }, `Drop index ${i.name}`)) }, icon('trash', 15)))))
      : h('p', { class: 'muted small' }, 'No extra indexes. Add one on columns you search or sort by a lot.'));
    out.push(h('div', { class: 'row wrap' }, h('b', {}, 'History')));
    const newest = s.history.find((x) => !x.rolledBack);
    out.push(s.history.length ? h('div', { class: 'stack' }, s.history.map((x) => h('div', { class: 'row wrap', style: { gap: '10px', alignItems: 'center' } },
      h('span', { class: 'muted small' }, new Date(x.at).toLocaleString()), h('span', { class: 'mono small' }, describeOps(x.ops)), x.rolledBack && h('span', { class: 'chip' }, 'undone'), h('span', { class: 'grow' }),
      newest && x.id === newest.id && x.reversible && h('button', { class: 'btn sm', onclick: () => undo(x) }, icon('restart', 15), 'Undo'),
      !x.reversible && !x.rolledBack && x.backup && h('span', { class: 'muted small' }, `restore ${x.backup} to go back`))))
      : h('p', { class: 'muted small' }, 'No structure changes yet. Every change is tested, backed up and listed here.'));
    clear(pane).append(...out);
  }
  const describeOps = (ops) => (ops || []).map((o) => ({ add_column: `+ ${o.name}`, drop_column: `- ${o.name}`, rename_column: `${o.from} → ${o.to}`, set_type: `${o.name}: ${o.type}`, set_nullable: `${o.name}: ${o.nullable === false ? 'required' : 'optional'}`, set_default: `${o.name}: default`, add_index: `index ${(o.columns || []).join(',')}`, drop_index: `drop index ${o.name}`, rename_table: `table → ${o.to}`, create_table: `new table ${o.name}`, drop_table: `drop table ${o.name}` }[o.op] || o.op)).join(' · ');

  async function undo(x) {
    if (!(await confirmDialog({ title: 'Undo this change?', body: `${describeOps(x.ops)}. The structure goes back to how it was before.`, confirm: 'Undo change' }))) return;
    try { await api(`${base()}/schema/undo`, { method: 'POST', body: { id: x.id, ...fileQ() } }); toast('Change undone', 'ok'); await afterChange(true); } catch (e) { toast(e.message, 'bad'); }
  }
  function form(title, fields, onSubmit, cta = 'Review change') {
    const err = h('p', { class: 'err', role: 'alert' });
    const go = actionBtn({ ic: 'check', label: cta, cls: 'primary', onClick: async () => { err.textContent = ''; try { const ok = await onSubmit(); if (ok !== false) m.close(); } catch (e) { err.textContent = e.message; } } });
    const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', {}, title), h('div', { class: 'fgrid' }, ...fields), err, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go));
    const m = modal(box); box.querySelector('input,select')?.focus();
  }
  function addColumn(s) {
    const name = h('input', { class: 'field mono', placeholder: 'e.g. phone', 'aria-label': 'Column name' }), type = typeSelect(s.types, s.engine === 'sqlite' ? 'TEXT' : 'text');
    const req = h('input', { type: 'checkbox', 'aria-label': 'Required' }), def = h('input', { class: 'field mono', placeholder: 'optional: 0, true, now(), or text', 'aria-label': 'Default' });
    form(`Add column to ${st.table}`, [lbl('Name', name), lbl('Type', type), lbl('Required', h('span', { class: 'nulbox' }, req, 'Cannot be empty'), 'NOT NULL'), lbl('Default', def)],
      async () => { const ok = await review({ table: st.table, ops: [{ op: 'add_column', name: name.value.trim(), type: type.value, nullable: !req.checked, default: def.value.trim() || null }] }, `Add column ${name.value.trim()}`); await afterChange(ok); return ok; });
  }
  function editColumn(s, c) {
    const name = h('input', { class: 'field mono', value: c.name, 'aria-label': 'Column name' }), type = typeSelect(s.types, c.type); type.disabled = !s.canAlter;
    const req = h('input', { type: 'checkbox', checked: !c.nullable, 'aria-label': 'Required' }); req.disabled = !s.canAlter || c.pk;
    const def = h('input', { class: 'field mono', value: c.default ?? '', 'aria-label': 'Default' }); def.disabled = !s.canAlter;
    form(`Edit ${c.name}`, [lbl('Name', name), lbl('Type', type), lbl('Required', h('span', { class: 'nulbox' }, req, 'Cannot be empty'), 'NOT NULL'), lbl('Default', def)],
      async () => {
        const ops = [];
        if (s.canAlter && type.value !== c.type) ops.push({ op: 'set_type', name: c.name, type: type.value });
        if (s.canAlter && !c.pk && req.checked !== !c.nullable) ops.push({ op: 'set_nullable', name: c.name, nullable: !req.checked });
        if (s.canAlter && def.value.trim() !== (c.default ?? '')) ops.push({ op: 'set_default', name: c.name, default: def.value.trim() || null });
        if (name.value.trim() !== c.name) ops.push({ op: 'rename_column', from: c.name, to: name.value.trim() });
        if (!ops.length) throw new Error('Nothing changed.');
        const ok = await review({ table: st.table, ops }, `Edit column ${c.name}`); await afterChange(ok); return ok;
      });
  }
  function addIndex(s) {
    const boxes = s.columns.map((c) => ({ c, el: h('input', { type: 'checkbox', 'aria-label': c.name }) })), uniq = h('input', { type: 'checkbox', 'aria-label': 'Unique' });
    form(`Add index on ${st.table}`, [lbl('Columns', h('div', { class: 'stack' }, boxes.map((b) => h('span', { class: 'nulbox' }, b.el, h('span', { class: 'mono' }, b.c.name))))), lbl('Unique', h('span', { class: 'nulbox' }, uniq, 'No two rows may share the value'))],
      async () => { const columns = boxes.filter((b) => b.el.checked).map((b) => b.c.name); const ok = await review({ table: st.table, ops: [{ op: 'add_index', columns, unique: uniq.checked }] }, 'Add index'); await afterChange(ok); return ok; });
  }
  function renameTable() {
    const to = h('input', { class: 'field mono', value: st.table, 'aria-label': 'New table name' });
    form(`Rename ${st.table}`, [lbl('New name', to)], async () => { const ok = await review({ table: st.table, ops: [{ op: 'rename_table', to: to.value.trim() }] }, `Rename table to ${to.value.trim()}`); await afterChange(ok, to.value.trim()); return ok; });
  }
  function dropTable() {
    const conf = h('input', { class: 'field mono', placeholder: st.table, 'aria-label': 'Type the table name' });
    form(`Drop ${st.table}`, [h('p', { class: 'muted small' }, 'This deletes the table and every row in it. A backup is taken first, but this cannot be undone from History.'), lbl('Type the name to confirm', conf)],
      async () => { const ok = await review({ drop: { name: st.table, confirm: conf.value.trim() } }, `Drop table ${st.table}`); if (ok) { st.table = null; st.mode = 'data'; await loadTables(false); } return ok; }, 'Review drop');
  }
  function newTable() {
    const name = h('input', { class: 'field mono', placeholder: 'e.g. invoices', 'aria-label': 'Table name' }); const rows = [];
    const list = h('div', { class: 'stack' });
    const add = () => { const n = h('input', { class: 'field mono', placeholder: 'column name', 'aria-label': 'Column name' }), t = typeSelect(st.engine === 'sqlite' ? SQLITE : PG, st.engine === 'sqlite' ? 'TEXT' : 'text'), r = h('input', { type: 'checkbox', 'aria-label': 'Required' }); rows.push({ n, t, r }); list.append(h('div', { class: 'row wrap', style: { gap: '8px' } }, n, t, h('span', { class: 'nulbox' }, r, 'Required'))); };
    add();
    form('New table', [lbl('Table name', name, 'An id column is added for you'), h('div', {}, h('b', {}, 'Columns'), list, h('button', { class: 'btn sm', style: { marginTop: '8px' }, onclick: add }, icon('plus', 15), 'Another column'))],
      async () => {
        const columns = rows.filter((x) => x.n.value.trim()).map((x) => ({ name: x.n.value.trim(), type: x.t.value, nullable: !x.r.checked }));
        const ok = await review({ create: { name: name.value.trim(), columns, autoId: true } }, `Create table ${name.value.trim()}`);
        if (ok) { st.table = name.value.trim(); st.mode = 'structure'; await loadTables(true); paintMain(); } return ok;
      });
  }

  /* ---------- SQL console ---------- */
  function sqlConsole() {
    const ta = h('textarea', { class: 'sql mono', rows: 6, spellcheck: 'false', 'aria-label': 'SQL', placeholder: `select * from ${st.table} limit 20` });
    ta.value = st.lastSql || `select * from ${st.table} limit 20`;
    const out = h('div', { class: 'sql-out' });
    const allow = h('input', { type: 'checkbox', id: 'allow-w' });
    const warn = h('span', { class: 'chip warn', hidden: true }, 'Changes are committed immediately');
    allow.addEventListener('change', () => { warn.hidden = !allow.checked; });
    const run = actionBtn({ ic: 'play', label: 'Run', cls: 'primary', onClick: async () => {
      st.lastSql = ta.value; clear(out);
      try {
        const r = await api(`${base()}/query`, { method: 'POST', body: { sql: ta.value, write: allow.checked, ...fileQ() } });
        if (r.kind === 'ok') { out.append(h('div', { class: 'banner ok' }, icon('check'), h('span', {}, r.message))); loadTables(true); return; }
        if (!r.rows.length) { out.append(emptyState('No rows', 'The query ran and returned nothing.')); return; }
        out.append(h('div', { class: 'muted small', style: { padding: '6px 2px' } }, `${r.rows.length} row${r.rows.length === 1 ? '' : 's'}${r.truncated ? ' (first 500 shown)' : ''}`),
          h('div', { class: 'grid-wrap' }, h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, r.columns.map((c) => h('th', {}, h('span', { class: 'th-b' }, c))))),
            h('tbody', {}, r.rows.map((row) => h('tr', {}, r.columns.map((c) => { const v = show(row[c]); return h('td', { class: `c ${v.c}`, title: v.t.length > 40 ? v.t : null }, v.t); })))))));
      } catch (e) { out.append(h('div', { class: 'banner bad' }, icon('alert'), h('span', {}, e.message))); }
    } });
    ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run.click(); } });
    return h('div', { class: 'stack' }, ta,
      h('div', { class: 'row wrap' }, run, h('label', { class: 'switch', for: 'allow-w' }, allow, h('span', { class: 'sw' }), h('span', {}, 'Allow changes')), warn, h('span', { class: 'grow' }), h('span', { class: 'muted small' }, 'Ctrl+Enter to run. Read-only by default.')), out);
  }

  loadTables(false);
  return { el };
}
