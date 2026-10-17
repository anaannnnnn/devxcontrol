// Studio: what the GitHub repo contains, the storage and database it implies, schema drift, and changes you can request.
// Files come from GitHub through your App; storage and schema come from the live server. Nothing is made up.
import { h, clear, icon, toast, modal, fmt, actionBtn } from '../ui.js';
import { api } from '../api.js';

const TAG = { entry: 'entry', changed: 'in a pending review', store: 'storage', schema: 'schema', read: 'read by advisor' };
const sizeOf = (n) => (n == null ? '' : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const tagEl = (t, text) => h('span', { class: 'hud-tag', dataset: { t } }, text);
const spin = () => h('div', { class: 'empty' }, h('span', { class: 'spin' }));
const emptyState = (title, body, ...acts) => h('div', { class: 'empty' }, h('b', {}, title), h('p', { class: 'muted' }, body), acts.length ? h('div', { class: 'row wrap', style: { justifyContent: 'center' } }, ...acts) : '');
const fail = (e) => (e.status === 409 ? emptyState('Not available yet', e.message, h('a', { class: 'btn primary', href: '#/connections' }, 'Open Connections')) : emptyState('Could not load this', e.message));

function treeView(root, onPick) {
  const host = h('ul', { class: 'ftree', role: 'tree' }); let picked = null;
  const walk = (node, path, depth) => {
    const full = path ? `${path}/${node.name}` : node.name;
    if (node.kind === 'dir') {
      let open = !!node.open; const kids = h('ul', { role: 'group' });
      const btn = h('button', { class: 'ft-row', role: 'treeitem', 'aria-expanded': String(open), style: { '--d': depth }, onclick: () => { open = !open; btn.setAttribute('aria-expanded', String(open)); kids.hidden = !open; } }, h('span', { class: 'chev' }, icon('chevron', 12)), icon('layers', 14), h('span', { class: 'nm' }, node.name));
      kids.hidden = !open; node.kids.forEach((k) => kids.append(walk(k, depth === 0 ? '' : full, depth + 1)));
      return h('li', {}, btn, kids);
    }
    const btn = h('button', { class: 'ft-row file', role: 'treeitem', style: { '--d': depth }, onclick: () => { picked?.classList.remove('on'); picked = btn; btn.classList.add('on'); onPick(node.path, node); } }, h('span', { class: 'chev' }), icon('book', 14), h('span', { class: 'nm' }, node.name), node.tag && tagEl(node.tag, TAG[node.tag]), h('small', {}, sizeOf(node.size)));
    return h('li', {}, btn);
  };
  host.append(walk(root, '', 0)); return host;
}

function filesView(app) {
  const code = h('pre', { class: 'code' }), title = h('div', { class: 'row' }), box = h('div', {}, spin());
  const show = async (key, node) => {
    clear(title).append(icon('book', 16), h('b', { class: 'mono' }, key), node.tag && tagEl(node.tag, TAG[node.tag])); clear(code).append(h('span', { class: 'muted' }, 'Loading...'));
    try { const f = await api(`/studio/${app.id}/file?path=${encodeURIComponent(key)}`); clear(code); if (f.binary) { code.append(h('span', { class: 'muted' }, `${key} is a binary file (${sizeOf(node.size)}).`)); return; } f.text.split('\n').forEach((l, i) => code.append(h('span', { class: 'cl' }, h('i', {}, String(i + 1)), l || ' '))); }
    catch (e) { clear(code).append(h('span', { class: 'muted' }, e.message)); }
  };
  api(`/studio/${app.id}/tree`).then((t) => {
    clear(box).append(h('div', { class: 'split' },
      h('section', { class: 'panel hud' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Repository files'), h('span', { class: 'grow' }), tagEl('live', `${t.repo} · ${t.count} files${t.truncated ? '+' : ''}`)), treeView(t.tree, show)),
      h('section', { class: 'panel hud' }, h('div', { class: 'panel-head' }, title), code)));
    clear(title).append(h('span', { class: 'muted' }, 'Pick a file on the left')); window.dispatchEvent(new Event('dc:content'));
  }).catch((e) => clear(box).append(fail(e)));
  return box;
}

function storageView(app) {
  const kindIc = { Database: 'db', Volume: 'disk', 'Object storage': 'cube', Cache: 'bolt', Mail: 'bell' };
  const box = h('div', {}, spin());
  api(`/studio/${app.id}/stores`).then(({ data }) => {
    const cards = data.map((s) => h('article', { class: 'panel hud store', dataset: { s: s.state } },
      h('div', { class: 'st-top' }, h('span', { class: 'st-ic' }, icon(kindIc[s.kind] || 'db', 22)), h('div', {}, h('div', { class: 'hud-eyebrow' }, s.kind), h('h3', {}, s.name)), h('span', { class: 'grow' }), tagEl(s.state, s.state === 'ok' ? 'in sync' : s.state === 'warn' ? 'needs attention' : 'missing')),
      h('dl', { class: 'kv' }, h('dt', {}, 'Runs at'), h('dd', { class: 'mono' }, s.where), h('dt', {}, 'Found in'), h('dd', { class: 'mono' }, s.found), s.size || s.rows ? [h('dt', {}, 'Size'), h('dd', {}, [s.size, s.rows].filter(Boolean).join(' · '))] : '', h('dt', {}, 'Backup'), h('dd', {}, s.backup)),
      s.note && h('p', { class: 'muted small st-note' }, s.note),
      s.id === 'db' && app.hasDb && h('div', { class: 'row wrap st-acts' }, h('a', { class: 'btn sm', href: `#/app/${app.id}/database` }, icon('table', 14), 'Open explorer'))));
    clear(box).append(data.length ? h('div', { class: 'grid-cards' }, cards) : emptyState('No storage found', `${app.name} has no database, volume or external store that the server or the repo points to.`));
    window.dispatchEvent(new Event('dc:content'));
  }).catch((e) => clear(box).append(fail(e)));
  return box;
}

function schemaView(app) {
  const box = h('div', {}, spin());
  Promise.all([api(`/studio/${app.id}/schema`), api(`/studio/${app.id}/drift`).catch((e) => ({ notes: [{ sev: 'info', msg: e.message }], migrations: 0 }))]).then(([sc, dr]) => {
    if (sc.error) { clear(box).append(emptyState('No live schema', sc.error)); return; }
    const cards = sc.tables.map((t) => h('article', { class: 'panel hud tbl-card' }, h('div', { class: 'panel-head' }, icon('table', 18), h('h2', { class: 'mono' }, t.t), h('span', { class: 'grow' }), h('span', { class: 'muted small' }, `${(t.rows ?? 0).toLocaleString()} rows`)),
      h('div', { class: 'cols-list' }, t.cols.map(([n, ty, k]) => h('div', { class: 'col-row' }, h('b', { class: 'mono' }, n), h('span', { class: 'mono muted' }, ty), k && h('span', { class: 'chip' }, k))))));
    clear(box).append(h('div', { class: 'stack' },
      h('section', { class: 'panel hud' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Live schema vs the repo'), h('span', { class: 'grow' }), tagEl('ok', `${sc.tables.length} tables · ${dr.migrations} migration files`)),
        h('div', { class: 'drift' }, dr.notes.length ? dr.notes.map((d) => h('div', { class: `banner ${d.sev === 'warn' ? 'warn' : ''}`, style: { margin: 0 } }, icon('alert'), h('span', {}, d.msg))) : h('div', { class: 'banner ok', style: { margin: 0 } }, icon('check'), h('span', {}, 'The live database matches what the migrations declare.')))),
      cards.length ? h('div', { class: 'grid-cards' }, cards) : emptyState('No tables yet', 'The database exists but has no tables.')));
    window.dispatchEvent(new Event('dc:content'));
  }).catch((e) => clear(box).append(fail(e)));
  return box;
}

function startTask(app, title, detail, done) {
  return api('/autopilot/tasks', { method: 'POST', body: { app: app.id, title, detail } }).then(() => { toast('Working on it. Follow it in Autopilot.', 'ok'); done?.(); }).catch((e) => toast(e.message, 'bad'));
}

function planDialog(app, t) {
  const steps = [['Branch', `autopilot/f-…-${t.id}`], ['Edit', `${t.files} file${t.files === 1 ? '' : 's'} · AI fixer`], ['Check', 'Run the repo tests and the scanners'], ['Report', 'Frontend and backend impact, rollback plan'], ['Wait for you', 'Nothing deploys until you approve']];
  const d = h('div', { class: 'dialog wide hud', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tp-t' },
    h('div', { class: 'hud-eyebrow' }, `${t.group} change`), h('h2', { id: 'tp-t' }, `${t.from} to ${t.to}`), h('p', { class: 'muted' }, t.title),
    h('ol', { class: 'plan' }, steps.map(([a, b]) => h('li', {}, h('b', {}, a), h('span', { class: 'muted small' }, b)))),
    h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Close'), actionBtn({ ic: 'wand', label: 'Start', cls: 'primary', onClick: async () => { await startTask(app, t.title, t.detail, () => { m.close(); location.hash = '#/pipeline'; }); } })));
  const m = modal(d);
}

function transformView(app) {
  const box = h('div', {}, spin());
  api(`/studio/${app.id}/transforms`).then(({ data }) => {
    const ta = h('textarea', { class: 'field', rows: 3, placeholder: 'For example: add a /healthz endpoint that checks the database', style: { height: 'auto', padding: '10px 12px', width: '100%' }, 'aria-label': 'Describe a change' });
    const custom = h('section', { class: 'panel hud' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Describe a change'), h('span', { class: 'grow' }), tagEl('live', 'plan first, nothing ships without you')),
      h('div', { class: 'pad-form stack' }, h('p', { class: 'muted' }, 'Write what you want in a sentence. The fixer edits a branch, the checks run, and you get a report to approve.'), ta, h('div', { class: 'row' }, actionBtn({ ic: 'wand', label: 'Start', cls: 'primary', onClick: async () => { if (ta.value.trim().length < 6) { toast('Describe the change first', 'bad'); return; } await startTask(app, ta.value.trim(), '', () => { location.hash = '#/pipeline'; }); } }))));
    const groups = [...new Set(data.map((t) => t.group))];
    clear(box).append(h('div', { class: 'stack' }, custom,
      data.length ? h('div', { class: 'group-title' }, 'Suggested from this repo') : h('p', { class: 'muted' }, 'The repo looks current: no outdated runtime, no missing hardening, nothing the checks would suggest changing.'),
      groups.map((g) => h('div', {}, h('div', { class: 'group-title' }, g), h('div', { class: 'grid-cards' }, data.filter((t) => t.group === g).map((t) => h('article', { class: 'panel hud xf', dataset: { risk: t.risk } },
        h('div', { class: 'xf-swap' }, h('span', { class: 'xf-from' }, t.from), h('span', { class: 'xf-arrow' }, icon('chevron', 18)), h('span', { class: 'xf-to' }, t.to)),
        h('div', { class: 'row wrap' }, h('span', { class: 'chip' }, `${t.files} file${t.files === 1 ? '' : 's'}`), h('span', { class: 'chip' }, icon('clock', 12), t.time), h('span', { class: `chip ${t.risk === 'high' ? 'bad' : t.risk === 'med' ? 'warn' : 'ok'}` }, `${t.risk} risk`)),
        h('div', { class: 'xf-cols' }, h('div', {}, h('div', { class: 'hud-eyebrow' }, 'Frontend'), h('p', {}, t.fe)), h('div', {}, h('div', { class: 'hud-eyebrow' }, 'Backend'), h('p', {}, t.be))),
        t.note && h('p', { class: 'muted small' }, t.note), h('div', { class: 'row wrap xf-agents' }, t.agents.map((a) => h('span', { class: 'hud-tag' }, a))),
        h('button', { class: 'btn primary sm', onclick: () => planDialog(app, t) }, icon('wand', 14), 'Plan this change'))))))));
    window.dispatchEvent(new Event('dc:content'));
  }).catch((e) => clear(box).append(fail(e)));
  return box;
}

/** Embeddable body. `app` is a fleet app. */
export function studioBody({ app }) {
  const views = { files: ['Files', 'github', filesView], storage: ['Storage map', 'archive', storageView], schema: ['Schema', 'table', schemaView], transform: ['Changes', 'wand', transformView] };
  const host = h('div', { class: 'studio-view' }); let cur = 'files';
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Studio view' });
  const paint = () => { clear(seg).append(...Object.entries(views).map(([k, [l, ic]]) => h('button', { 'aria-pressed': String(k === cur), onclick: () => { cur = k; paint(); } }, icon(ic, 14), l))); clear(host).append(views[cur][2](app)); window.dispatchEvent(new Event('dc:content')); };
  const head = h('section', { class: 'panel hud src-head' }, h('div', { class: 'row wrap' }, icon('github', 22), h('div', {}, h('div', { class: 'hud-eyebrow' }, 'Source of truth'), h('b', { class: 'mono' }, app.repo ? `${app.repo} @ default branch` : 'No GitHub repo set for this app')), h('span', { class: 'grow' }), app.repo && h('a', { class: 'btn sm', href: `https://github.com/${app.repo}`, target: '_blank', rel: 'noopener' }, icon('external', 14), 'Open on GitHub')), seg);
  paint();
  return h('div', { class: 'stack' }, head, host);
}

export function studioPage(ctx) {
  ctx.crumbs([{ label: 'Studio' }]);
  const apps = ctx.fleet.apps; let app = apps[0]; const mount = h('div');
  const sel = h('select', { class: 'field', 'aria-label': 'Project', onchange: () => { app = apps.find((a) => a.id === sel.value); draw(); } }, apps.map((a) => h('option', { value: a.id }, a.name)));
  const draw = () => clear(mount).append(studioBody({ app }));
  draw();
  const el = h('div', {}, h('header', { class: 'page-head' }, h('div', {}, h('div', { class: 'hud-eyebrow' }, 'Source and platform'), h('h1', {}, 'Studio'), h('p', { class: 'lede' }, 'Everything the repo implies: files, storage, schema, and the changes you can make to the platform.')), h('label', { class: 'lbl' }, 'Project', sel)), mount);
  return { el, title: 'Studio' };
}
