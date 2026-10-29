// MongoDB in the UI: the "choose a database" prompt when an update brings MongoDB, the per-app panel,
// the cluster list for Connections, and the Databases page for browsing and editing data.
import { h, clear, icon, toast, confirmDialog, actionBtn, modal } from '../ui.js';
import { api, stream } from '../api.js';
import { terminal } from '../term.js';

const hex = (id) => (id && typeof id === 'object' && id.$oid ? id.$oid : typeof id === 'object' ? JSON.stringify(id) : String(id));
const guess = (name) => String(name || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'app';
const NEW = '__new__';

/** Run a job and show its log in a window. Resolves with the exit code. */
export async function jobWindow(title, path, { method = 'POST' } = {}) {
  const term = terminal({ max: 2000 }); term.el.style.height = '340px';
  const status = h('span', { class: 'chip' }, 'Running');
  const closeBtn = h('button', { class: 'btn', disabled: true, onclick: () => m.close() }, 'Close');
  const box = h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('div', { class: 'row' }, h('h2', {}, title), h('span', { class: 'grow' }), status), term.el, h('div', { class: 'acts' }, closeBtn));
  const m = modal(box);
  try {
    const { job } = await api(path, { method });
    return await new Promise((resolve) => {
      const s = stream(`/jobs/${job}/stream`, { line: (l) => term.add(l), done: ({ code }) => { s.close(); status.textContent = code === 0 ? 'Finished' : `Failed (exit ${code})`; status.className = `chip ${code === 0 ? 'ok' : 'bad'}`; closeBtn.disabled = false; resolve(code); }, error: () => {} });
    });
  } catch (e) { term.add(`error: ${e.message}`); status.textContent = 'Failed'; closeBtn.disabled = false; return 1; }
}

/** The prompt shown when an update brings MongoDB. Resolves true once a choice is saved. */
export async function chooseMongo(app, info = {}) {
  let ov;
  try { ov = await api(`/apps/${app.id}/mongo`); } catch (e) { toast(e.message, 'bad'); return false; }
  return new Promise((resolve) => {
    const cluster = h('select', { class: 'field', 'aria-label': 'Cluster' });
    const dbSel = h('select', { class: 'field', 'aria-label': 'Database' });
    const dbNew = h('input', { class: 'field mono', placeholder: 'new_database_name', value: guess(app.id), 'aria-label': 'New database name', hidden: true });
    const note = h('p', { class: 'muted small' });
    const copy = h('input', { type: 'checkbox', id: 'mg-copy', checked: true });
    const repl = h('input', { type: 'checkbox', id: 'mg-repl' });
    const local = ov.local; const bundled = ov.detected?.bundled;
    const hasData = (local?.tables?.length || 0) > 0 || bundled;
    const body = h('div', { class: 'stack' });

    const loadDbs = async () => {
      clear(dbSel).append(h('option', { value: '' }, 'Loading databases...')); note.textContent = '';
      try {
        const dbs = await api(`/mongo/${cluster.value}/databases`);
        clear(dbSel);
        dbs.forEach((d) => dbSel.append(h('option', { value: d.name }, d.name)));
        dbSel.append(h('option', { value: NEW }, 'Create a new database...'));
        dbSel.value = dbs.some((d) => d.name === guess(app.id)) ? guess(app.id) : (dbs.length ? dbs[0].name : NEW);
      } catch (e) { clear(dbSel).append(h('option', { value: NEW }, 'Create a new database...')); dbSel.value = NEW; note.textContent = `${e.message} You can still type a new database name.`; }
      dbNew.hidden = dbSel.value !== NEW;
    };
    dbSel.addEventListener('change', () => { dbNew.hidden = dbSel.value !== NEW; });
    ov.clusters.forEach((c) => cluster.append(h('option', { value: c.id }, `${c.name} (${c.host})`)));
    cluster.addEventListener('change', loadDbs);

    const dlg = h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Choose a MongoDB for ${app.name}` });
    const done = (v) => { resolve(v); m.close(); }; // answer first: closing the window also reports "no"
    const useBtn = actionBtn({ ic: 'check', label: 'Use this database', cls: 'primary', onClick: async () => {
      const database = dbSel.value === NEW ? dbNew.value.trim() : dbSel.value;
      if (!database) { toast('Pick or name a database.', 'bad'); return; }
      try {
        const r = await api(`/apps/${app.id}/mongo/link`, { method: 'POST', body: { cluster: cluster.value, database, copy: copy.checked, replace: repl.checked } });
        toast(r.binding.mode === 'external' ? `${app.name} will use ${database}` : `${database} will receive a copy of the data`, 'ok'); done(true);
      } catch (e) { toast(e.message, 'bad'); }
    } });
    const keepBtn = actionBtn({ label: 'Keep the app\'s own database', onClick: async () => {
      if (!(await confirmDialog({ title: 'Keep the built-in database?', body: `${app.name} keeps using the database that comes with it. You will not be asked again until you change this on the app page.`, confirm: 'Keep it' }))) return;
      try { await api(`/apps/${app.id}/mongo/link`, { method: 'POST', body: { local: true } }); done(true); } catch (e) { toast(e.message, 'bad'); }
    } });

    if (!ov.clusters.length) {
      body.append(h('div', { class: 'banner warn' }, icon('alert'), h('span', {}, 'No MongoDB cluster is connected yet. Add one in Connections, then come back here.')),
        h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/connections', onclick: () => done(false) }, 'Open Connections')));
    } else {
      body.append(
        h('p', {}, `${app.name} now uses MongoDB${info.envVar ? ` (it reads ${info.envVar})` : ''}. Choose where its data should live.`),
        h('label', { class: 'lbl' }, 'Cluster', cluster), h('label', { class: 'lbl' }, 'Database', dbSel, dbNew), note,
        hasData && h('div', { class: 'stack', style: { gap: '6px' } },
          h('label', { class: 'switch', for: 'mg-copy' }, copy, h('span', { class: 'sw' }), h('span', {}, local?.tables?.length ? `Copy the current data (${local.tables.length} table${local.tables.length === 1 ? '' : 's'}) into it` : 'Copy the current data into it')),
          h('label', { class: 'switch', for: 'mg-repl' }, repl, h('span', { class: 'sw' }), h('span', {}, 'Replace collections that already exist there'))),
        h('p', { class: 'muted small' }, 'The old database is not removed. After the update, DevX Control checks the app and the copied data, and only then lets you remove it.'));
      loadDbs();
    }
    dlg.append(h('h2', {}, `Choose a MongoDB for ${app.name}`), body, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'), ov.clusters.length ? keepBtn : null, ov.clusters.length ? useBtn : null));
    const m = modal(dlg, { onClose: () => resolve(false) });
  });
}


/** Confirm, then run the "switch to MongoDB" job in a log window. Resolves the exit code, or null when cancelled. */
export async function switchFlow(app) {
  if (!(await confirmDialog({ title: `Switch ${app.name} to MongoDB?`, body: 'It copies the latest data into MongoDB, points the app at it, updates to the merged code and checks everything. The old database is not touched. If the update fails, the app keeps its old setting.', confirm: 'Switch now' }))) return null;
  return jobWindow(`Switch ${app.name} to MongoDB`, `/apps/${app.id}/mongo/switch`);
}

const STEPS = [['linked', 'Linked'], ['imported', 'Data copied'], ['verified', 'Checks passed']];
const ORDER = ['linked', 'import-failed', 'imported', 'verify-failed', 'verified', 'retired'];

/** Panel for one app: the current choice, progress, and the actions. */
export function mongoPanel(app, { reload } = {}) {
  const box = h('div', { class: 'stack' });
  async function paint() {
    let ov; try { ov = await api(`/apps/${app.id}/mongo`); } catch (e) { clear(box).append(h('div', { class: 'banner bad' }, e.message)); return; }
    const b = ov.binding; const rank = b ? ORDER.indexOf(b.stage) : -1;
    const stepOk = (k) => (k === 'linked' ? rank >= 0 : k === 'imported' ? rank >= ORDER.indexOf('imported') : rank >= ORDER.indexOf('verified'));
    clear(box);
    if (!b || b.mode === 'local') {
      box.append(h('p', { class: 'muted' }, b?.mode === 'local' ? `${app.name} keeps its own database (your choice).` : ov.detected?.uses ? `${app.name} uses MongoDB but no database is chosen yet.` : `${app.name} uses its own database.`),
        ov.local?.tables?.length > 0 && h('p', { class: 'muted small' }, `Local data: ${ov.local.kind}, ${ov.local.tables.length} table${ov.local.tables.length === 1 ? '' : 's'}${ov.local.tables.some((t) => t.rows != null) ? `, ${ov.local.tables.reduce((s, t) => s + (t.rows || 0), 0)} rows` : ''}.`));
    } else {
      box.append(h('dl', { class: 'kv' },
        h('dt', {}, 'Database'), h('dd', {}, h('span', { class: 'chip ok' }, icon('db', 13), `${b.clusterName} / ${b.database}`)),
        h('dt', {}, 'Mode'), h('dd', {}, b.mode === 'external' ? 'The app reads MongoDB' : 'Data copy only (this app\'s code does not read MongoDB)')),
        h('div', { class: 'row wrap', style: { gap: '8px' } }, STEPS.map(([k, label]) => h('span', { class: `chip ${stepOk(k) ? 'ok' : ''}` }, stepOk(k) ? icon('check', 13) : null, label))),
        b.stage === 'import-failed' && h('div', { class: 'banner bad' }, icon('alert'), h('span', {}, 'The data copy had errors. Nothing was removed. Fix the cause and copy again.')),
        b.stage === 'verify-failed' && h('div', { class: 'banner warn' }, icon('alert'), h('span', {}, 'Some checks failed, so the local database is being kept. Press Run checks after fixing.')),
        b.imported?.summary?.length > 0 && h('details', { class: 'pend' }, h('summary', {}, `${b.imported.summary.filter((s) => s.ok).length} of ${b.imported.summary.length} tables copied`), b.imported.summary.map((s) => h('div', { class: 'commit' }, h('span', { class: 'mono' }, s.name), h('span', {}, s.ok ? `${s.imported ?? s.rows ?? ''} rows` : 'failed')))),
        b.verified?.checks?.length > 0 && h('div', { class: 'stack', style: { gap: '4px' } }, b.verified.checks.map((c) => h('div', { class: 'row', style: { gap: '8px' } }, h('span', { class: `chip ${c.ok ? 'ok' : 'bad'}` }, c.ok ? 'OK' : 'Fail'), h('span', {}, c.label), c.detail && h('span', { class: 'muted small' }, c.detail)))),
        b.stage === 'verified' && b.mode === 'external' && h('div', { class: 'banner' }, icon('shield'), h('span', {}, 'All checks passed: the app runs from MongoDB and the data is all there. The local database is no longer used.')),
        ['imported', 'verified', 'retired'].includes(b.stage) && (b.pr ? h('div', { class: 'row wrap', style: { gap: '8px' } }, h('span', { class: `chip ${b.pr.merged ? 'ok' : ''}` }, icon('github', 13), b.pr.merged ? 'Pull request merged' : b.pr.draft ? 'Draft pull request' : 'Pull request open'), h('a', { href: b.pr.url, target: '_blank', rel: 'noopener' }, `#${b.pr.number} on GitHub`), b.pr.note && h('span', { class: 'muted small' }, b.pr.note), b.mode === 'import-only' && (ov.detected?.uses ? h('span', { class: 'muted small' }, 'The repository now uses MongoDB. Press Switch to MongoDB.') : h('span', { class: 'muted small' }, 'Waiting for the pull request to be merged.'))) : h('div', { class: 'banner' }, icon('github'), h('span', {}, 'The data is in MongoDB. Next, change the repository itself so it uses MongoDB too.'), actionBtn({ ic: 'github', label: 'Create pull request', cls: 'primary', sm: true, onClick: async () => { if (await pullRequestFlow(app)) await paint(); } }))));
    }
    box.append(h('div', { class: 'row wrap', style: { gap: '8px' } },
      actionBtn({ ic: 'db', label: b && b.mode !== 'local' ? 'Change database' : 'Choose a database', cls: 'primary', onClick: async () => { if (await chooseMongo({ id: app.id, name: app.name }, ov.detected || {})) { toast('Saved. Update the app to apply it.', 'ok'); await paint(); reload?.(); } } }),
      b && b.mode === 'import-only' && ['imported', 'verified'].includes(b.stage) && actionBtn({ ic: 'bolt', label: 'Switch to MongoDB', cls: ov.detected?.uses ? 'primary' : '', title: ov.detected?.uses ? 'Point the app at MongoDB now' : 'Available once the pull request is merged', disabled: !ov.detected?.uses, onClick: async () => { const code = await switchFlow(app); if (code !== null) { await paint(); reload?.(); } } }),
      b && b.mode !== 'local' && actionBtn({ ic: 'refresh', label: 'Copy data again', onClick: async () => { await jobWindow(`Copy ${app.name} data to MongoDB`, `/apps/${app.id}/mongo/import`); await paint(); } }),
      b && b.mode !== 'local' && actionBtn({ ic: 'check', label: 'Run checks', onClick: async () => { try { const r = await api(`/apps/${app.id}/mongo/verify`, { method: 'POST' }); toast(r.ok ? 'All checks passed' : 'Some checks failed', r.ok ? 'ok' : 'warn'); } catch (e) { toast(e.message, 'bad'); } await paint(); } }),
      b && actionBtn({ ic: 'x', label: 'Clear choice', onClick: async () => { if (!(await confirmDialog({ title: 'Clear the MongoDB choice?', body: 'The app goes back to its own configuration on the next update. Nothing is deleted in MongoDB.', confirm: 'Clear' }))) return; await api(`/apps/${app.id}/mongo`, { method: 'DELETE' }); await paint(); } })));
  }
  paint();
  return box;
}

/** MongoDB clusters for the Connections page. */
export function mongoClustersPanel(c, { reload }) {
  const name = h('input', { class: 'field', placeholder: 'Cluster 0', 'aria-label': 'Cluster name' });
  const uri = h('input', { class: 'field mono', type: 'password', autocomplete: 'off', placeholder: 'mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/', 'aria-label': 'Connection string' });
  const list = (c.mongo || []).map((k) => h('div', { class: 'row', style: { gap: '10px', padding: '6px 0' } },
    h('span', { class: 'chip ok' }, icon('db', 13), k.name), h('span', { class: 'muted small mono' }, `${k.user}@${k.host}`), h('span', { class: 'grow' }),
    actionBtn({ ic: 'x', label: 'Remove', cls: 'danger', sm: true, onClick: async () => { if (!(await confirmDialog({ title: `Remove ${k.name}?`, body: 'Apps linked to it must be unlinked first. Nothing in MongoDB is deleted.', confirm: 'Remove', danger: true }))) return; try { await api(`/connections/mongo/${k.id}`, { method: 'DELETE' }); toast('Removed', 'info'); reload(); } catch (e) { toast(e.message, 'bad'); } } })));
  return h('section', { class: 'panel hud' }, h('div', { class: 'panel-head' }, h('h2', {}, 'MongoDB clusters'), h('span', { class: 'grow' }), h('span', { class: 'hud-tag', dataset: { t: (c.mongo || []).length ? 'ok' : 'idle' } }, (c.mongo || []).length ? `${c.mongo.length} connected` : 'optional')),
    h('div', { class: 'pad-form stack' },
      h('p', { class: 'muted' }, 'Save each Atlas cluster once. Apps can then be pointed at any database on it, and the Databases page can browse and edit it. The password is stored encrypted and is never shown again.'),
      list.length ? h('div', { class: 'stack', style: { gap: 0 } }, list) : null,
      h('ol', { class: 'steps' },
        h('li', {}, 'In Atlas open Database, then Connect on the cluster, then Drivers, and copy the mongodb+srv:// line.'),
        h('li', {}, 'Replace the <password> part with the database user\'s password, then paste it below.'),
        h('li', {}, 'In Atlas Network Access, allow this server\'s IP address.')),
      h('label', { class: 'lbl' }, 'Name', name), h('label', { class: 'lbl' }, 'Connection string', uri),
      h('div', { class: 'row' }, actionBtn({ ic: 'check', label: 'Test and save', cls: 'primary', onClick: async () => {
        try { const r = await api('/connections/mongo', { method: 'POST', body: { name: name.value, uri: uri.value } }); toast(`Connected. ${r.databases.length} database${r.databases.length === 1 ? '' : 's'} found.`, 'ok'); reload(); }
        catch (e) { toast(e.message, 'bad'); }
      } }))));
}


/** Shows what the pull request would change (nothing is pushed), then opens it as a draft. Resolves true when opened. */
export async function pullRequestFlow(app) {
  let plan;
  try { plan = await new Promise((resolve, reject) => { const w = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Checking the repository' }, h('h2', {}, 'Checking the repository'), h('p', { class: 'muted' }, 'Reading the code and checking the converted files. This takes a moment.'), h('div', { class: 'row' }, h('span', { class: 'spin' })));
    const m = modal(w); api(`/apps/${app.id}/mongo/pr`).then((r) => { m.close(); resolve(r); }).catch((e) => { m.close(); reject(e); }); }); }
  catch (e) { toast(e.message, 'bad'); return false; }
  return new Promise((resolve) => {
    const edited = plan.summary?.edited || [];
    const v = plan.validation;
    const body = h('div', { class: 'stack' },
      h('p', {}, plan.kind === 'prisma' ? `${app.name} talks to its database through Prisma, so the schema can be converted from Postgres to MongoDB.` : `${app.name} already speaks MongoDB. The pull request only changes configuration, so the real address comes from .env.`),
      h('div', { class: 'stack', style: { gap: '4px' } }, h('b', {}, `${plan.summary?.files || 0} file${plan.summary?.files === 1 ? '' : 's'} change on ${plan.base}`),
        edited.slice(0, 8).map((f) => h('div', { class: 'mono small' }, f)), plan.summary?.deleted ? h('div', { class: 'muted small' }, `${plan.summary.deleted} old Postgres migration file${plan.summary.deleted === 1 ? '' : 's'} removed`) : null, edited.length > 8 ? h('div', { class: 'muted small' }, `and ${edited.length - 8} more`) : null),
      plan.notes?.length > 0 && h('details', { class: 'pend' }, h('summary', {}, `What changes (${plan.notes.length})`), plan.notes.map((n) => h('div', { class: 'commit' }, h('span', {}, n)))),
      v && h('div', { class: `banner ${v.ok ? '' : 'bad'}` }, icon(v.ok ? 'shield' : 'alert'), h('span', {}, v.ok ? `The converted schema passed ${v.label}.` : `The converted schema failed ${v.label}: ${String(v.output || '').split('\n').slice(-2).join(' ').slice(0, 200)}`)),
      plan.warnings?.length > 0 && h('div', { class: 'banner warn' }, icon('alert'), h('div', {}, h('b', {}, 'A person still has to look at:'), h('ul', { style: { margin: '6px 0 0 18px' } }, plan.warnings.map((w) => h('li', {}, w))))),
      h('p', { class: 'muted small' }, 'It opens as a draft pull request with a checklist. Nothing changes in the repository until you merge it, and the real MongoDB address never goes into the repository.'));
    const clean = !(plan.warnings?.length) && (!v || v.ok);
    const auto = h('input', { type: 'checkbox', id: 'pr-auto', checked: clean });
    body.append(h('label', { class: 'switch', for: 'pr-auto' }, auto, h('span', { class: 'sw' }), h('span', {}, 'Merge it automatically if every check passes')),
      h('p', { class: 'muted small' }, clean ? 'Everything checked out, so it can be merged for you. The old database is not touched either way.' : 'Something needs a person, so it will open as a draft and wait for you even if this is on.'));
    const go = actionBtn({ ic: 'github', label: 'Open pull request', cls: 'primary', disabled: v && !v.ok, onClick: async () => {
      try {
        const pr = await api(`/apps/${app.id}/mongo/pr`, { method: 'POST', body: { autoMerge: auto.checked } });
        toast(pr.merged ? `Pull request #${pr.number} opened and merged` : pr.draft ? `Draft pull request #${pr.number} opened` : `Pull request #${pr.number} opened`, pr.merged ? 'ok' : 'info');
        if (pr.note) toast(pr.note, 'warn');
        m.close(); resolve(true);
      } catch (e) { toast(e.message, 'bad'); }
    } });
    const d = h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pull request for MongoDB' }, h('h2', {}, `Pull request: move ${app.name} to MongoDB`), body, h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => { m.close(); resolve(false); } }, 'Cancel'), go));
    const m = modal(d, { onClose: () => resolve(false) });
  });
}

/** "Link this database to an app" for the Databases page. */
function linkBox({ st, apps, onChanged }) {
  const box = h('div', { class: 'stack', style: { gap: '8px' } });
  const pick = h('select', { class: 'field', 'aria-label': 'App to link' }, h('option', { value: '' }, 'Choose an app...'), apps.map((a) => h('option', { value: a.id, selected: a.id === st.linkApp }, a.name)));
  const out = h('div', { class: 'stack', style: { gap: '8px' } });
  const repl = h('input', { type: 'checkbox', id: 'lk-repl' });
  async function paint() {
    clear(out);
    const id = pick.value; st.linkApp = id; if (!id) return;
    const app = apps.find((a) => a.id === id);
    out.append(h('span', { class: 'spin' }));
    let ov; try { ov = await api(`/apps/${id}/mongo`); } catch (e) { clear(out).append(h('div', { class: 'banner bad' }, e.message)); return; }
    clear(out);
    const b = ov.binding; const linked = b && b.mode !== 'local';
    if (linked) {
      const here = b.clusterId === st.cid && b.database === st.db;
      out.append(h('div', { class: 'banner' }, icon('check'), h('span', {}, here ? `A MongoDB already exists for ${app.name}: this database (${b.clusterName} / ${b.database}).` : `A MongoDB already exists for ${app.name}: ${b.clusterName} / ${b.database}.`)));
      const done = ['imported', 'verified', 'retired'].includes(b.stage);
      if (b.pr) out.append(h('a', { class: 'btn', href: b.pr.url, target: '_blank', rel: 'noopener' }, icon('github', 15), `Pull request #${b.pr.number}`));
      else if (done) out.append(actionBtn({ ic: 'github', label: 'Create pull request', cls: 'primary', onClick: async () => { if (await pullRequestFlow({ id, name: app.name })) await paint(); } }));
      else out.append(h('p', { class: 'muted small' }, `Data copy status: ${b.stage}. Open the app's Updates tab to finish.`));
      out.append(h('a', { class: 'btn sm', href: `#/app/${id}/deploy` }, 'Open the app'));
      return;
    }
    const tables = ov.local?.tables?.length;
    out.append(h('p', { class: 'muted small' }, ov.local ? `${app.name} has its own ${ov.local.kind} database${tables ? ` with ${tables} table${tables === 1 ? '' : 's'}` : ''}. Import copies it into ${st.db}.` : `${app.name} has no local database DevX Control can read.`),
      h('label', { class: 'switch', for: 'lk-repl' }, repl, h('span', { class: 'sw' }), h('span', {}, 'Replace collections that already exist')),
      actionBtn({ ic: 'upload', label: 'Import', cls: 'primary', onClick: async () => {
        try { await api(`/apps/${id}/mongo/link`, { method: 'POST', body: { cluster: st.cid, database: st.db, copy: true, replace: repl.checked } }); } catch (e) { toast(e.message, 'bad'); return; }
        const code = await jobWindow(`Copy ${app.name} into ${st.db}`, `/apps/${id}/mongo/import`);
        toast(code === 0 ? 'Data copied' : 'The copy had errors', code === 0 ? 'ok' : 'warn');
        await paint(); onChanged?.();
      } }));
  }
  pick.addEventListener('change', paint);
  box.append(h('div', { class: 'row' }, h('b', {}, 'Link to an app')), pick, out);
  if (st.linkApp) paint();
  return box;
}

/* ------------------------------------------------------------------ */
/* The Databases page                                                  */
/* ------------------------------------------------------------------ */

const pretty = (v) => JSON.stringify(v, null, 2);
const preview = (d) => { const { _id, ...rest } = d; const s = JSON.stringify(rest); return s.length > 140 ? `${s.slice(0, 140)}...` : s; };
const parseJson = (t, what) => { try { const v = JSON.parse(t || '{}'); return v; } catch { throw new Error(`${what} is not valid JSON.`); } };

export function databasesPage(ctx) {
  ctx.crumbs([{ label: 'Overview', href: '#/' }, { label: 'Databases' }]);
  const st = { cid: sessionStorage.getItem('dc-mg-c') || '', db: '', coll: '', skip: 0, limit: 25, total: 0, docs: [], filter: '{}', sort: '{"_id":1}' };
  const side = h('aside', { class: 'panel mg-side' });
  const main = h('section', { class: 'panel mg-main' });
  const root = h('div', { class: 'stack' }, h('h1', { class: 'h2', style: { fontSize: '26px' } }, 'Databases'), h('div', { class: 'mg-grid' }, side, main));

  const err = (e) => toast(e.message, 'bad');
  let clusters = [];

  async function boot() {
    try { clusters = (await api('/connections')).mongo || []; } catch (e) { err(e); }
    if (!clusters.length) { clear(side); clear(main).append(h('div', { class: 'pad-form stack' }, h('h2', {}, 'No MongoDB cluster yet'), h('p', { class: 'muted' }, 'Save a cluster once, then browse and edit its databases here.'), h('a', { class: 'btn primary', href: '#/connections' }, 'Open Connections'))); return; }
    if (!clusters.some((c) => c.id === st.cid)) st.cid = clusters[0].id;
    await loadDbs();
  }

  let dbs = []; let colls = [];
  async function loadDbs() {
    sessionStorage.setItem('dc-mg-c', st.cid);
    clear(side).append(h('div', { class: 'pad-form' }, h('span', { class: 'spin' })));
    try { dbs = await api(`/mongo/${st.cid}/databases`); } catch (e) { dbs = []; err(e); }
    if (!dbs.some((d) => d.name === st.db)) { st.db = dbs[0]?.name || ''; st.coll = ''; }
    await loadColls();
  }
  async function loadColls() {
    colls = []; if (st.db) { try { colls = await api(`/mongo/${st.cid}/${st.db}/collections`); } catch (e) { err(e); } }
    if (!colls.some((c) => c.name === st.coll)) st.coll = colls[0]?.name || '';
    paintSide();
    if (st.coll) await loadDocs(); else paintMain();
  }
  async function loadDocs() {
    paintSide();
    clear(main).append(h('div', { class: 'pad-form' }, h('span', { class: 'spin' })));
    try {
      const f = parseJson(st.filter, 'The filter'); const s = parseJson(st.sort, 'The sort');
      const r = await api(`/mongo/${st.cid}/${st.db}/${st.coll}/find`, { method: 'POST', body: { filter: f, sort: s, skip: st.skip, limit: st.limit } });
      st.docs = r.docs; st.total = r.total;
    } catch (e) { st.docs = []; st.total = 0; err(e); }
    paintMain();
  }

  function paintSide() {
    const cl = h('select', { class: 'field', 'aria-label': 'Cluster', onchange: (e) => { st.cid = e.target.value; st.db = ''; st.coll = ''; st.skip = 0; loadDbs(); } }, clusters.map((c) => h('option', { value: c.id, selected: c.id === st.cid }, c.name)));
    clear(side).append(h('div', { class: 'pad-form stack' },
      h('label', { class: 'lbl' }, 'Cluster', cl),
      h('div', { class: 'row' }, h('b', {}, 'Databases'), h('span', { class: 'grow' }), actionBtn({ ic: 'plus', label: 'New', sm: true, onClick: async () => { const name = await ask('New database', 'Name', guess('new database'), 'MongoDB creates a database when its first collection is added, so you also name that collection.', 'First collection', 'items'); if (!name) return; try { await api(`/mongo/${st.cid}/${name.a}/collections`, { method: 'POST', body: { name: name.b } }); st.db = name.a; st.coll = name.b; await loadDbs(); toast('Created', 'ok'); } catch (e) { err(e); } } })),
      dbs.length ? h('div', { class: 'mg-list' }, dbs.map((d) => h('button', { class: `mg-item ${d.name === st.db ? 'on' : ''}`, onclick: () => { st.db = d.name; st.coll = ''; st.skip = 0; loadColls(); } }, icon('db', 15), h('span', {}, d.name)))) : h('p', { class: 'muted small' }, 'No databases yet.'),
      st.db && h('div', { class: 'row' }, h('b', {}, 'Collections'), h('span', { class: 'grow' }), actionBtn({ ic: 'plus', label: 'New', sm: true, onClick: async () => { const r = await ask('New collection', 'Name', '', `In ${st.db}.`); if (!r) return; try { await api(`/mongo/${st.cid}/${st.db}/collections`, { method: 'POST', body: { name: r.a } }); st.coll = r.a; await loadColls(); toast('Created', 'ok'); } catch (e) { err(e); } } })),
      st.db && h('hr', { style: { border: 0, borderTop: '1px solid var(--line-soft)', margin: '4px 0' } }),
      st.db && linkBox({ st, apps: ctx.fleet?.apps || [], onChanged: () => loadColls() }),
      st.db && (colls.length ? h('div', { class: 'mg-list' }, colls.map((c) => h('button', { class: `mg-item ${c.name === st.coll ? 'on' : ''}`, onclick: () => { st.coll = c.name; st.skip = 0; loadDocs(); } }, icon('table', 15), h('span', {}, c.name), h('span', { class: 'muted small' }, c.count == null ? '' : String(c.count))))) : h('p', { class: 'muted small' }, 'No collections yet.'))));
  }

  function ask(title, labelA, valA, text, labelB, valB) {
    return new Promise((resolve) => {
      const a = h('input', { class: 'field mono', value: valA || '', 'aria-label': labelA }); const b = labelB ? h('input', { class: 'field mono', value: valB || '', 'aria-label': labelB }) : null;
      const d = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', {}, title), text && h('p', { class: 'muted' }, text), h('label', { class: 'lbl' }, labelA, a), b && h('label', { class: 'lbl' }, labelB, b),
        h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { const v = { a: a.value.trim(), b: b?.value.trim() }; if (!v.a || (b && !v.b)) { toast('Fill in the name.', 'bad'); return; } resolved = true; m.close(); resolve(v); } }, 'Create')));
      let resolved = false; const m = modal(d, { onClose: () => { if (!resolved) resolve(null); } }); a.focus();
    });
  }

  function editor(doc, isNew) {
    const ta = h('textarea', { class: 'field mono', rows: 18, 'aria-label': 'Document JSON', spellcheck: 'false', style: { height: 'auto', padding: '10px', width: '100%' } }); ta.value = pretty(doc);
    const d = h('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': isNew ? 'New document' : 'Edit document' },
      h('h2', {}, isNew ? `Add a document to ${st.coll}` : 'Edit document'), h('p', { class: 'muted small' }, 'Extended JSON: ids look like {"$oid":"..."} and dates like {"$date":"2026-01-01T00:00:00Z"}.'), ta,
      h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), actionBtn({ ic: 'check', label: 'Save', cls: 'primary', onClick: async () => {
        let v; try { v = JSON.parse(ta.value); } catch { toast('That is not valid JSON.', 'bad'); return; }
        try {
          if (isNew) await api(`/mongo/${st.cid}/${st.db}/${st.coll}/docs`, { method: 'POST', body: { doc: v } });
          else await api(`/mongo/${st.cid}/${st.db}/${st.coll}/docs`, { method: 'PUT', body: { id: doc._id, doc: v } });
          m.close(); toast('Saved', 'ok'); await loadDocs();
        } catch (e) { err(e); }
      } })));
    const m = modal(d); ta.focus();
  }

  function paintMain() {
    clear(main);
    if (!st.coll) { main.append(h('div', { class: 'pad-form stack' }, h('h2', {}, st.db ? 'Pick or create a collection' : 'Pick a database'), h('p', { class: 'muted' }, 'Collections are like tables. Choose one on the left to see its documents.'))); return; }
    const flt = h('input', { class: 'field mono', value: st.filter, 'aria-label': 'Filter', placeholder: '{"status":"open"}', onkeydown: (e) => { if (e.key === 'Enter') go(); } });
    const srt = h('input', { class: 'field mono', value: st.sort, 'aria-label': 'Sort', placeholder: '{"_id":1}', onkeydown: (e) => { if (e.key === 'Enter') go(); } });
    const go = () => { st.filter = flt.value; st.sort = srt.value; st.skip = 0; loadDocs(); };
    const pages = Math.max(1, Math.ceil(st.total / st.limit)); const page = Math.floor(st.skip / st.limit) + 1;
    main.append(h('div', { class: 'pad-form stack' },
      h('div', { class: 'row wrap', style: { gap: '8px' } }, h('h2', { style: { margin: 0 } }, `${st.db} / ${st.coll}`), h('span', { class: 'chip' }, `${st.total} document${st.total === 1 ? '' : 's'}`), h('span', { class: 'grow' }),
        actionBtn({ ic: 'plus', label: 'Add document', cls: 'primary', sm: true, onClick: async () => editor({}, true) }),
        actionBtn({ ic: 'trash', label: 'Drop collection', cls: 'danger', sm: true, onClick: async () => { const r = await ask('Drop collection', `Type "${st.coll}" to confirm`, '', 'This deletes the collection and every document in it. It cannot be undone.'); if (!r) return; try { await api(`/mongo/${st.cid}/${st.db}/${st.coll}/drop`, { method: 'POST', body: { confirm: r.a } }); st.coll = ''; await loadColls(); toast('Dropped', 'warn'); } catch (e) { err(e); } } })),
      h('div', { class: 'mg-q' }, h('label', { class: 'lbl' }, 'Filter', flt), h('label', { class: 'lbl' }, 'Sort', srt), actionBtn({ ic: 'refresh', label: 'Run', onClick: async () => go() })),
      st.docs.length ? h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '_id'), h('th', {}, 'Document'), h('th', {}, ''))), h('tbody', {}, st.docs.map((d) => h('tr', {},
        h('td', { class: 'mono' }, hex(d._id)), h('td', { class: 'mono mg-prev', title: pretty(d) }, preview(d)),
        h('td', { class: 'row', style: { gap: '4px', justifyContent: 'flex-end' } },
          h('button', { class: 'btn sm icon ghost', 'aria-label': 'Edit document', title: 'Edit', onclick: () => editor(d, false) }, icon('edit', 16)),
          h('button', { class: 'btn sm icon ghost', 'aria-label': 'Delete document', title: 'Delete', onclick: async () => { if (!(await confirmDialog({ title: 'Delete this document?', body: `_id ${hex(d._id)} will be removed from ${st.coll}.`, confirm: 'Delete', danger: true }))) return; try { await api(`/mongo/${st.cid}/${st.db}/${st.coll}/docs/delete`, { method: 'POST', body: { id: d._id } }); toast('Deleted', 'warn'); await loadDocs(); } catch (e) { err(e); } } }, icon('trash', 16)))))))) : h('p', { class: 'muted' }, 'No documents match.'),
      h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'btn sm', disabled: st.skip === 0, onclick: () => { st.skip = Math.max(0, st.skip - st.limit); loadDocs(); } }, 'Previous'), h('span', { class: 'muted small' }, `Page ${page} of ${pages}`),
        h('button', { class: 'btn sm', disabled: page >= pages, onclick: () => { st.skip += st.limit; loadDocs(); } }, 'Next'))));
  }

  boot();
  return { el: root, title: 'Databases' };
}
