// Orbit navigation: one glass page per feature. Switches live on Automation and default off.
import { h, icon, toast } from '../ui.js';
import { api } from '../api.js';

const SECTIONS = [
  ['sky', 'Orbit'],
  ['debt', 'Design debt'],
  ['dna', 'DNA'],
  ['proving', 'Proving'],
  ['ghosts', 'Ghosts'],
  ['universes', 'Universes'],
  ['revenue', 'Revenue'],
  ['mirror', 'Mirror'],
  ['brain', 'Brain'],
  ['gift', 'Gift'],
  ['talk', 'Talk'],
  ['rooms', 'Rooms'],
];

const offBanner = (msg) => h('div', { class: 'banner' }, msg || 'This feature is off for the app. Turn it on under Automation. Nothing here runs until you do.');

export function orbitPage(ctx) {
  const section = (ctx.section || 'sky').split('/')[0] || 'sky';
  ctx.crumbs([{ label: 'Orbit', href: '#/orbit' }, ...(section === 'sky' ? [] : [{ label: SECTIONS.find((s) => s[0] === section)?.[1] || section }])]);
  const root = h('div', { class: 'stack' });
  const sub = h('nav', { class: 'orbit-sub', 'aria-label': 'Orbit' }, ...SECTIONS.map(([id, label]) => h('button', { class: 'btn sm', 'aria-pressed': String(id === section), onclick: () => ctx.go(`/orbit${id === 'sky' ? '' : '/' + id}`) }, label)), h('button', { class: 'btn sm', onclick: () => ctx.go('/automation') }, 'Automation'));
  const body = h('div', { class: 'orbit-grid' });
  root.append(h('header', {}, h('h1', {}, 'Orbit'), h('p', { class: 'muted' }, 'Every switch is off until you turn it on. Numbers only appear when they were actually measured.')), sub, body);
  const apps = ctx.fleet.apps || [];
  const picker = (onchange) => h('select', { class: 'field', 'aria-label': 'App', onchange: (e) => onchange(e.target.value) }, ...apps.map((a) => h('option', { value: a.id }, a.name)));
  const fail = (e) => { body.append(offBanner(e.message)); };

  if (section === 'sky') sky(body, ctx);
  else if (section === 'debt') debt(body, picker, fail);
  else if (section === 'dna') dna(body, picker, fail);
  else if (section === 'proving') proving(body, picker, fail);
  else if (section === 'ghosts') ghosts(body, picker, fail);
  else if (section === 'universes') universes(body, picker, fail, ctx);
  else if (section === 'revenue') revenue(body, picker, fail);
  else if (section === 'mirror') mirror(body, picker, fail);
  else if (section === 'brain') brain(body, fail);
  else if (section === 'gift') gift(body, picker, fail);
  else if (section === 'talk') talk(body);
  else if (section === 'rooms') rooms(body, picker, fail);
  else body.append(offBanner('That Orbit page does not exist.'));
  return { el: root, title: 'Orbit' };
}

function card(...kids) { return h('section', { class: 'panel hud', style: { padding: '14px', display: 'grid', gap: '10px' } }, ...kids); }

async function sky(body, ctx) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const list = h('div', { class: 'orbit-list' });
  const canvas = h('canvas', { id: 'orbit-sky', class: 'orbit-canvas panel hud', role: 'img', 'aria-label': 'Fleet as planets. A list of the same data is below.', tabindex: '0' });
  const note = h('p', { class: 'muted small' });
  body.append(card(h('div', { class: 'row' }, h('b', {}, 'Fleet'), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => load() }, 'Refresh')), note, reduced ? null : canvas, h('h2', { class: 'hud-eyebrow' }, 'Same data, as a list'), list));
  async function load() {
    list.replaceChildren();
    try {
      const sky = await api('/orbit/sky');
      if (!sky.planets.length) { note.textContent = 'No app has Orbit View switched on. Turn it on per app under Automation. Nothing is drawn until then.'; return; }
      note.textContent = 'Size is recent monitor samples, not visitors. A missing number stays blank.';
      for (const p of sky.planets) {
        list.append(h('button', { class: 'panel', style: { padding: '12px', textAlign: 'left' }, onclick: () => ctx.go(`/app/${p.id}`) },
          h('b', {}, p.name), h('div', { class: 'muted small' }, `${p.glow} · latency ${p.latencyMs ?? 'not measured'} · backups ${p.rings ?? 'not measured'} · moons ${p.moons.length}`),
          p.sizeReason && h('div', { class: 'muted small' }, p.sizeReason),
          p.flares[0] && h('div', { class: 'small' }, `Flare: ${p.flares[0].msg}`)));
      }
      if (!reduced) {
        try {
          const { mountOrbit } = await import('../orbit-scene.js');
          mountOrbit(canvas, sky, { reduced, onPick: (p) => ctx.go(`/app/${p.id}`) });
        } catch { note.textContent += ' The 3D view did not start. The list below is the same data.'; }
      }
    } catch (e) { note.textContent = e.message; }
  }
  load();
}

function debt(body, picker, fail) {
  const out = h('div'); let id = '';
  const run = async () => { out.replaceChildren(); try { const r = await api(`/orbit/apps/${id}/debt/scan`, { method: 'POST' }); paint(r.report); } catch (e) { fail(e); } };
  const paint = (report) => {
    out.replaceChildren();
    if (!report?.measured) { out.append(offBanner(report?.reason || 'Not measured.')); return; }
    out.append(h('b', {}, `Score ${report.score}`), h('div', { class: 'heat', 'aria-hidden': 'true' }, h('i', { style: { width: `${report.score}%`, background: 'linear-gradient(90deg,#fb7185,#fde68a,#86efc0)' } })), ...report.causes.map((c) => h('div', {}, h('b', {}, c.label), h('div', { class: 'muted small' }, `${c.count} · ${c.detail}`))));
  };
  body.append(card(h('b', {}, 'Design debt'), picker((v) => { id = v; }), h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', onclick: run }, 'Scan'), h('button', { class: 'btn sm', onclick: async () => { try { const r = await api(`/orbit/apps/${id}/debt/normalise`, { method: 'POST' }); toast(r.reason || r.explain || 'Sent', r.applied ? 'ok' : 'bad'); } catch (e) { toast(e.message, 'bad'); } } }, 'Normalise'), h('button', { class: 'btn sm', onclick: async () => { try { await api(`/orbit/apps/${id}/debt/undo`, { method: 'POST' }); toast('Undone'); } catch (e) { toast(e.message, 'bad'); } } }, 'Undo')), out));
  id = body.querySelector('select').value;
}

function dna(body, picker, fail) {
  const out = h('div'); let id = '';
  const paint = (pack) => {
    out.replaceChildren();
    const r = pack?.result; if (!r?.measured) { out.append(offBanner(r?.reason || pack?.result?.reason || 'Not measured.')); return; }
    const c = r.classification;
    out.append(h('b', {}, `${c.label} · ${c.confidence}%`), h('ul', {}, ...c.evidence.map((e) => h('li', {}, `${e.kind}: ${e.value}`))), r.pageNote && h('p', { class: 'muted small' }, r.pageNote), r.schemaNote && h('p', { class: 'muted small' }, r.schemaNote));
    const box = h('div', { class: 'constellation panel', style: { minHeight: '220px' } });
    (r.gaps.features || []).forEach((f, i) => {
      const ang = (i / Math.max(1, r.gaps.features.length)) * Math.PI * 2;
      box.append(h('div', { class: 'star', style: { left: `${50 + Math.cos(ang) * 38}%`, top: `${50 + Math.sin(ang) * 36}%` } }, h('b', {}, f.label), h('small', {}, f.state), f.state === 'missing' && h('button', { class: 'btn sm', onclick: async () => { try { const d = await api(`/orbit/apps/${id}/dna/draft`, { method: 'POST', body: { feature: f.id } }); toast(d.reason || 'Draft sent'); } catch (e) { toast(e.message, 'bad'); } } }, 'Draft')));
    });
    out.append(box);
  };
  body.append(card(h('b', {}, 'Business DNA'), picker((v) => { id = v; }), h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', onclick: async () => { try { paint(await api(`/orbit/apps/${id}/dna/scan`, { method: 'POST' })); } catch (e) { fail(e); } } }, 'Scan'), h('button', { class: 'btn sm', onclick: async () => { const type = prompt('Type id: restaurant, logistics, retail, construction, erp, saas, education'); if (!type) return; try { paint(await api(`/orbit/apps/${id}/dna`, { method: 'PUT', body: { type } })); } catch (e) { toast(e.message, 'bad'); } } }, 'Correct type')), out));
  id = body.querySelector('select').value;
}

function proving(body, picker, fail) {
  const out = h('pre', { class: 'code' }); let id = '';
  body.append(card(h('b', {}, 'Proving Ground'), h('p', { class: 'muted small' }, 'A shadow container is not started unless Docker answers. Promotion never happens from this screen.'), picker((v) => { id = v; }), h('button', { class: 'btn sm', onclick: async () => { try { out.textContent = JSON.stringify(await api(`/orbit/apps/${id}/proving`, { method: 'POST', body: { paths: ['/'] } }), null, 2); } catch (e) { fail(e); } } }, 'Start run'), out));
  id = body.querySelector('select').value;
}

function ghosts(body, picker, fail) {
  const out = h('div'); let id = '';
  body.append(card(h('b', {}, 'Visitor ghosts'), h('p', { class: 'muted small' }, 'Without a headless browser, only HTML rule checks run, and the report says so.'), picker((v) => { id = v; }), h('div', { class: 'row wrap' }, ['shopper', 'reader', 'arabic', 'elder', 'keys'].map((p) => h('button', { class: 'btn sm', onclick: () => go(p) }, p))), out));
  async function go(persona) {
    out.replaceChildren();
    try {
      const r = await api(`/orbit/apps/${id}/ghosts`, { method: 'POST', body: { persona } });
      if (!r.measured) { out.append(offBanner(r.reason)); return; }
      out.append(h('p', { class: 'muted small' }, r.browser?.reason || ''), h('p', { class: 'muted small' }, r.source || ''), ...r.findings.map((f) => h('div', {}, h('b', {}, `${f.severity} · ${f.title}`), h('div', { class: 'muted small' }, f.detail), h('button', { class: 'btn sm', onclick: async () => { try { const a = await api(`/orbit/apps/${id}/ghosts/apply`, { method: 'POST', body: { finding: f.id } }); toast(a.reason || 'Sent to review'); } catch (e) { toast(e.message, 'bad'); } } }, 'Apply'))));
    } catch (e) { fail(e); }
  }
  id = body.querySelector('select').value;
}

function universes(body, picker, fail) {
  const out = h('div', { class: 'frames' }); let id = ''; let keep = true;
  body.append(card(h('b', {}, 'Parallel universes'), picker((v) => { id = v; }), h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { keep = e.target.checked; } }), 'Keep brand'), h('button', { class: 'btn sm', onclick: build }, 'Build 3 directions'), out));
  async function build() {
    out.replaceChildren();
    try {
      const r = await api(`/orbit/apps/${id}/universes`, { method: 'POST', body: { keepBrand: keep } });
      const tok = await api(`/orbit/apps/${id}/view-token`, { method: 'POST', body: { path: '/' } }).catch(() => null);
      for (const d of r.directions || []) {
        const src = tok ? `${tok.url}?u=${d.id}` : '';
        out.append(h('section', {}, h('b', {}, d.name), h('p', { class: 'muted small' }, d.blurb), h('p', { class: 'muted small' }, d.copyReason), d.contrast.every((c) => c.ok) ? h('p', { class: 'small' }, 'Contrast checks passed.') : h('p', {}, 'A contrast check failed.'), src && h('div', { class: 'phone' }, h('iframe', { title: d.name, src, sandbox: 'allow-scripts allow-forms' })), h('button', { class: 'btn sm', onclick: async () => { try { const a = await api(`/orbit/apps/${id}/universes/${d.id}/adopt`, { method: 'POST' }); toast(a.reason || 'Sent to review'); } catch (e) { toast(e.message, 'bad'); } } }, 'Adopt')));
      }
    } catch (e) { fail(e); }
  }
  id = body.querySelector('select').value;
}

function revenue(body, picker, fail) {
  const out = h('div'); let id = '';
  const table = h('input', { class: 'field', placeholder: 'table', 'aria-label': 'Table' });
  const amount = h('input', { class: 'field', placeholder: 'amount column', 'aria-label': 'Amount column' });
  const created = h('input', { class: 'field', placeholder: 'time column', 'aria-label': 'Time column' });
  body.append(card(h('b', {}, 'Revenue pulse'), h('p', { class: 'muted small' }, 'Read-only. DynamoDB apps say they cannot be measured.'), picker((v) => { id = v; }), table, amount, created, h('button', { class: 'btn sm', onclick: async () => { try { await api(`/orbit/apps/${id}/revenue`, { method: 'PUT', body: { table: table.value, amount: amount.value, created: created.value } }); const r = await api(`/orbit/apps/${id}/revenue/compute`, { method: 'POST' }); paint(r); } catch (e) { fail(e); } } }, 'Compute'), out));
  function paint(r) {
    out.replaceChildren();
    if (!r.measured) { out.append(offBanner(r.reason)); return; }
    out.append(h('p', {}, `${r.used} rows used, ${r.skipped} skipped.`), ...r.overlays.slice(0, 8).map((o) => h('div', {}, h('b', {}, o.msg), h('div', { class: 'muted small' }, o.atRisk.measured ? `${o.atRisk.method} At risk ${o.atRisk.atRisk} (uncertainty ${o.atRisk.uncertaintyPct}%). ${o.atRisk.note}` : o.atRisk.reason))));
  }
  id = body.querySelector('select').value;
}

function mirror(body, picker, fail) {
  const urls = h('textarea', { class: 'field', rows: 4, placeholder: 'https://competitor.example', 'aria-label': 'Competitor URLs' });
  const out = h('div'); let id = '';
  body.append(card(h('b', {}, 'Competitor mirror'), h('p', { class: 'muted small' }, 'Public pages only, robots.txt is respected, and the page text is not stored.'), picker((v) => { id = v; }), urls, h('button', { class: 'btn sm', onclick: async () => { try { await api(`/orbit/apps/${id}/mirror`, { method: 'PUT', body: { urls: urls.value.split(/\s+/).filter(Boolean) } }); const r = await api(`/orbit/apps/${id}/mirror/fetch`, { method: 'POST' }); out.replaceChildren(h('pre', { class: 'code' }, JSON.stringify(r, null, 2))); } catch (e) { fail(e); } } }, 'Fetch'), out));
  id = body.querySelector('select').value;
}

function brain(body, fail) {
  const out = h('div');
  body.append(card(h('b', {}, 'Fleet brain'), h('p', { class: 'muted small' }, 'Stored on this server only. Secrets are stripped. You can export or delete everything.'), h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: load }, 'Load'), h('button', { class: 'btn sm', onclick: async () => { if (!confirm('Delete the local fix library?')) return; try { await api('/orbit/brain', { method: 'DELETE' }); toast('Deleted'); load(); } catch (e) { fail(e); } } }, 'Delete')), out));
  async function load() {
    try {
      const r = await api('/orbit/brain');
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
      out.replaceChildren(h('a', { href: URL.createObjectURL(blob), download: 'fleet-brain.json' }, 'Download export'), h('p', {}, `${r.patterns.length} pattern(s).`), ...r.patterns.slice(0, 12).map((p) => h('div', {}, h('b', {}, p.app), h('div', { class: 'muted small' }, p.summary))));
    } catch (e) { fail(e); }
  }
}

function gift(body, picker, fail) {
  const out = h('div'); let id = '';
  const paint = (g) => {
    out.replaceChildren();
    if (!g || g.ok === false) { out.append(offBanner(g?.reason || 'No gift yet.')); return; }
    const item = g.item || {};
    out.append(h('b', {}, item.title || 'Gift'), h('p', {}, item.detail || ''), h('p', { class: 'muted small' }, g.queueNote || `State: ${g.state}`), g.proving && h('p', { class: 'muted small' }, g.proving.reason || 'Proving verdict attached.'), g.state === 'pending' && h('div', { class: 'row' }, ['approved', 'rejected', 'snoozed'].map((d) => h('button', { class: 'btn sm', onclick: () => decide(d) }, d))));
  };
  async function decide(decision) { try { paint(await api(`/orbit/apps/${id}/gift/decide`, { method: 'POST', body: { decision } })); } catch (e) { toast(e.message, 'bad'); } }
  body.append(card(h('b', {}, 'Weekly gift'), h('p', { class: 'muted small' }, 'One per app per week. Auth, payments and schema are skipped unless you allow them.'), picker((v) => { id = v; }), h('button', { class: 'btn sm', onclick: async () => { try { paint(await api(`/orbit/apps/${id}/gift`, { method: 'POST' })); } catch (e) { fail(e); } } }, 'Prepare this week'), out));
  id = body.querySelector('select').value;
}

function talk(body) {
  const input = h('input', { class: 'field', placeholder: 'why was nexus slow', 'aria-label': 'Ask Control' });
  const out = h('div');
  const mic = h('button', { class: 'btn sm', onclick: () => { const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) { toast('This browser has no speech recognition. Type instead.', 'bad'); return; } const rec = new R(); rec.lang = 'en-AE'; rec.onresult = (e) => { input.value = e.results[0][0].transcript; ask(); }; rec.start(); } }, 'Voice');
  async function ask() {
    try {
      const r = await api('/orbit/talk', { method: 'POST', body: { text: input.value } });
      out.replaceChildren(h('p', { class: 'muted small' }, r.modeNote || r.say || ''), h('pre', { class: 'code' }, JSON.stringify(r.answer || r.confirmation || r.say, null, 2)));
      if (r.confirmation) out.append(h('button', { class: 'btn', onclick: async () => { try { const c = await api(`/orbit/talk/${r.confirmation.id}/confirm`, { method: 'POST' }); toast(c.queued === false ? c.reason : 'Confirmed'); } catch (e) { toast(e.message, 'bad'); } } }, r.confirmation.label));
    } catch (e) { out.replaceChildren(offBanner(e.message)); }
  }
  body.append(card(h('b', {}, 'Talk to Control'), h('p', { class: 'muted small' }, 'Arabic or English keywords. Actions wait for a confirmation card. No model: the keyword fallback is used and labelled.'), input, h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: ask }, 'Ask'), mic), out));
}

function rooms(body, picker, fail) {
  const out = h('div'); let id = '';
  const user = h('input', { class: 'field', placeholder: 'client username', 'aria-label': 'Username' });
  const pass = h('input', { class: 'field', placeholder: 'password (10+)', type: 'password', 'aria-label': 'Password' });
  const name = h('input', { class: 'field', placeholder: 'display name', 'aria-label': 'Name' });
  body.append(card(h('b', {}, 'Client rooms'), h('p', { class: 'muted small' }, 'Clients never see other apps, logs, the database or the vault. They sign in at /client.html.'), picker((v) => { id = v; }), name, user, pass, h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: async () => { try { await api(`/orbit/apps/${id}/clients`, { method: 'POST', body: { name: name.value, user: user.value, password: pass.value } }); toast('Client created'); load(); } catch (e) { fail(e); } } }, 'Add client'), h('a', { class: 'btn sm', href: '/client.html' }, 'Open portal')), out));
  async function load() {
    try {
      const r = await api(`/orbit/apps/${id}/clients`);
      out.replaceChildren(...r.clients.map((c) => h('div', { class: 'row' }, h('span', {}, `${c.name} · ${c.user}`), h('button', { class: 'btn sm', onclick: async () => { await api(`/orbit/apps/${id}/clients/${c.id}`, { method: 'DELETE' }); load(); } }, 'Remove'))), ...r.requests.map((q) => h('p', { class: 'muted small' }, `Request: ${q.text}`)));
    } catch (e) { fail(e); }
  }
  id = body.querySelector('select').value;
}
