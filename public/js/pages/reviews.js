// Reviews: change reports the fixer produced. Read, then approve, ask for changes, or reject. Data from /api/v1/reviews.
import { h, clear, icon, fmt, toast, modal, actionBtn } from '../ui.js';
import { api } from '../api.js';

const tag = (t, text) => h('span', { class: 'hud-tag', dataset: { t } }, text);
const STATE = { pending: ['warn', 'awaiting you'], deploying: ['live', 'deploying'], deployed: ['ok', 'deployed'], 'pr-open': ['live', 'PR open'], rejected: ['bad', 'rejected'], superseded: ['idle', 'replaced'] };
const riskCls = { low: 'ok', med: 'warn', high: 'bad' };
const mark = (r) => h('span', { class: `res ${r}` }, r === 'n/a' ? '' : icon(r === 'pass' ? 'check' : 'x', 13), r === 'n/a' ? 'not run' : r);
const head2 = (t, ...x) => h('div', { class: 'panel-head' }, h('h2', {}, t), h('span', { class: 'grow' }), ...x);

function list(ctx) {
  let f = 'pending', rows = null;
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter' });
  const box = h('div', { class: 'review-list' });
  const paint = () => {
    const counts = (k) => (k === 'all' ? rows.length : rows.filter((r) => r.state === k).length);
    clear(seg).append(...['pending', 'deployed', 'rejected', 'all'].map((k) => h('button', { 'aria-pressed': String(k === f), onclick: () => { f = k; paint(); } }, `${k[0].toUpperCase()}${k.slice(1)} ${counts(k)}`)));
    const shown = rows.filter((r) => f === 'all' || r.state === f);
    clear(box).append(...(shown.length ? shown.map((r) => {
      const pass = r.tests.filter((t) => t.after === 'pass').length;
      return h('a', { class: 'panel hud review-card', href: `#/reviews/${r.id}`, dataset: { s: r.state } },
        h('div', { class: 'rc-top' }, h('span', { class: 'mono muted' }, r.id), tag(...(STATE[r.state] || ['live', r.state])), h('span', { class: `chip ${riskCls[r.risk]}` }, `${r.risk} risk`), h('span', { class: 'grow' }), h('span', { class: 'muted small' }, fmt.ago(r.created))),
        h('h3', {}, r.title),
        h('div', { class: 'row wrap muted small' }, h('span', {}, r.app), h('span', {}, `· ${r.fileCount} file${r.fileCount === 1 ? '' : 's'}`), r.tests.length > 0 && h('span', {}, `· ${pass}/${r.tests.length} checks pass`), h('span', {}, `· ${r.agent}`), h('span', {}, `· ${r.attempts} attempt${r.attempts > 1 ? 's' : ''}`)),
        h('div', { class: 'rc-fe-be' }, h('span', {}, h('b', {}, 'Frontend '), r.frontend[0]), h('span', {}, h('b', {}, 'Backend '), r.backend[0])),
        h('span', { class: 'rc-go' }, 'Read report', icon('chevron', 14)));
    }) : [h('div', { class: 'empty' }, h('b', {}, rows.length ? 'Nothing here' : 'No reports yet'), h('p', { class: 'muted' }, rows.length ? 'Try another filter.' : 'A report appears when Autopilot finishes a fix. Open Autopilot, then Findings, and press Fix on a finding.'), h('a', { class: 'btn', href: '#/pipeline' }, 'Open Autopilot'))]));
    window.dispatchEvent(new Event('dc:content'));
  };
  api('/reviews').then((r) => { rows = r.data; paint(); }).catch((e) => clear(box).append(h('div', { class: 'banner bad' }, e.message)));
  ctx.crumbs([{ label: 'Reviews' }]);
  return h('div', { class: 'stack' },
    h('header', { class: 'page-head' }, h('div', {}, h('div', { class: 'hud-eyebrow' }, 'Human gate'), h('h1', {}, 'Reviews'), h('p', { class: 'lede' }, 'What changed, what it does to the frontend and backend, and proof that it works. Nothing deploys until you say so.')), seg), box);
}

function diffFile(f) {
  const body = h('div', { class: 'diff' }, f.lines.map(([k, t]) => h('div', { class: `dl ${k}` }, h('i', {}, k === 'a' ? '+' : k === 'd' ? '-' : k === 'c' ? '' : ' '), h('code', {}, t))));
  const btn = h('button', { class: 'diff-head', 'aria-expanded': 'true', onclick: () => { const o = body.hidden; body.hidden = !o; btn.setAttribute('aria-expanded', String(o)); } },
    icon('chevron', 14), h('span', { class: 'mono' }, f.path), h('span', { class: 'grow' }), h('b', { class: 'add' }, `+${f.add}`), h('b', { class: 'del' }, `-${f.del}`));
  return h('div', { class: 'diff-file' }, btn, body);
}

function decide(r, kind, done) {
  const cfg = { approve: ['Approve and deploy', `Pushes branch ${r.branch}, opens a pull request on ${r.repo}, merges it, then redeploys ${r.app}. ${r.rollback}`, 'primary'], changes: ['Request changes', 'The fixer tries again with your note. Nothing is deployed.', ''], reject: ['Reject', 'Marks the finding as will not fix. Nothing is pushed.', 'danger'] }[kind];
  const note = h('textarea', { class: 'field', rows: 3, placeholder: kind === 'changes' ? 'What should be different?' : 'Optional note', style: { height: 'auto', padding: '10px 12px', width: '100%' } });
  const ack = h('input', { type: 'checkbox' });
  const go = actionBtn({ label: cfg[0], cls: cfg[2], onClick: async () => {
    try {
      const path = { approve: 'approve', changes: 'changes', reject: 'reject' }[kind];
      await api(`/reviews/${r.id}/${path}`, { method: 'POST', body: { note: note.value } });
      m.close(); toast(kind === 'approve' ? 'Deploying. Follow it in Autopilot.' : kind === 'changes' ? 'Sent back to the fixer' : 'Rejected', 'ok'); done();
    } catch (e) { toast(e.message, 'bad'); }
  } });
  go.disabled = kind === 'approve';
  ack.addEventListener('change', () => { go.disabled = !ack.checked; });
  const d = h('div', { class: 'dialog wide hud', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dec-t' },
    h('div', { class: 'hud-eyebrow' }, r.id), h('h2', { id: 'dec-t' }, cfg[0]), h('p', {}, cfg[1]),
    kind === 'approve' && h('label', { class: 'ack' }, ack, h('span', {}, 'I read the report, including what changes in the frontend and backend.')),
    kind !== 'approve' && h('label', { class: 'lbl', style: { marginTop: '12px' } }, 'Note', note),
    h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go));
  const m = modal(d);
}

function detail(ctx, id) {
  const host = h('div', { class: 'stack' }, h('div', { class: 'empty' }, h('span', { class: 'spin' })));
  ctx.crumbs([{ label: 'Reviews', href: '#/reviews' }, { label: id }]);
  let r = null;
  const load = () => api(`/reviews/${id}`).then((x) => { r = x; draw(); }).catch((e) => clear(host).append(h('div', { class: 'banner bad' }, e.message), h('a', { class: 'btn', href: '#/reviews' }, 'All reports')));
  function draw() {
    const bars = r.scores.map((s) => h('div', { class: 'bar-row' }, h('span', {}, s.k), h('div', { class: 'meter ba' }, h('i', { class: 'a', style: { width: `${s.a}%` } }), h('i', { class: 'b', style: { width: `${s.b}%` } })), h('b', { class: 'mono' }, `${s.a} to ${s.b}`)));
    const dock = r.state === 'pending' ? h('div', { class: 'decide-dock hud' }, h('div', { class: 'dd-txt' }, h('b', {}, 'Your call'), h('span', { class: 'muted small' }, 'Nothing is deployed yet')),
      h('button', { class: 'btn danger', onclick: () => decide(r, 'reject', load) }, icon('x', 16), 'Reject'), h('button', { class: 'btn', onclick: () => decide(r, 'changes', () => { location.hash = '#/pipeline'; }) }, icon('edit', 16), 'Request changes'), h('button', { class: 'btn primary', onclick: () => decide(r, 'approve', () => { location.hash = '#/pipeline'; }) }, icon('rocket', 16), 'Approve and deploy')) : null;
    clear(host).append(
      h('header', { class: 'page-head' }, h('div', {}, h('div', { class: 'row wrap' }, h('span', { class: 'hud-eyebrow' }, r.id), tag(...(STATE[r.state] || ['live', r.state])), h('span', { class: `chip ${riskCls[r.risk]}` }, `${r.risk} risk`), r.pr && h('a', { class: 'chip', href: r.pr.url, target: '_blank', rel: 'noopener' }, `PR #${r.pr.n}`)), h('h1', { class: 'rv-title' }, r.title), h('p', { class: 'lede' }, `${r.app} · ${r.agent} · ${r.attempts} attempt${r.attempts > 1 ? 's' : ''} · ${fmt.ago(r.created)}`)),
        h('a', { class: 'btn', href: '#/reviews' }, 'All reports')),
      h('section', { class: 'panel hud' }, head2('What happened'), h('div', { class: 'prose' }, h('p', {}, r.summary), h('p', { class: 'muted' }, h('b', {}, 'Root cause. '), r.cause), r.note && h('p', { class: 'muted' }, h('b', {}, 'Your note. '), r.note))),
      h('div', { class: 'cols eq' },
        h('section', { class: 'panel hud impact fe' }, head2('Frontend impact', tag('live', 'what users see')), h('ul', {}, r.frontend.map((x) => h('li', {}, x)))),
        h('section', { class: 'panel hud impact be' }, head2('Backend impact', tag('live', 'what the server does')), h('ul', {}, r.backend.map((x) => h('li', {}, x))))),
      (r.tests.length > 0 || r.scores.length > 0) && h('div', { class: 'cols eq' },
        r.tests.length > 0 && h('section', { class: 'panel hud' }, head2('Independent checks', tag('ok', `${r.tests.filter((t) => t.after === 'pass').length} of ${r.tests.length} pass`)), h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, ['Check', 'Before', 'After'].map((c) => h('th', {}, c)))), h('tbody', {}, r.tests.map((t) => h('tr', {}, h('td', {}, t.n, t.note && h('span', { class: 'muted small' }, ` ${t.note}`)), h('td', {}, mark(t.before)), h('td', {}, mark(t.after)))))))),
        r.scores.length > 0 && h('section', { class: 'panel hud' }, head2('Score change', h('span', { class: 'legend' }, h('i', { style: { background: 'var(--text-3)' } }), 'before', h('i', { style: { background: 'var(--accent)', marginLeft: '10px' } }), 'after')), bars)),
      r.files.length > 0 && h('section', { class: 'panel hud' }, head2('Code changes', tag('live', `${r.files.length} files · +${r.files.reduce((a, f) => a + f.add, 0)} -${r.files.reduce((a, f) => a + f.del, 0)}`), h('span', { class: 'mono muted small' }, r.branch)), h('div', { class: 'diffs' }, r.files.map(diffFile))),
      h('div', { class: 'cols eq' },
        h('section', { class: 'panel hud' }, head2('Timeline'), h('ol', { class: 'tl' }, r.timeline.map(([a, b, t]) => h('li', {}, h('i', {}), h('div', {}, h('b', {}, a), h('div', { class: 'muted small' }, `${b} · ${fmt.ago(t)}`)))))),
        h('section', { class: 'panel hud' }, head2('Rollback plan', tag('ok', 'ready')), h('div', { class: 'prose' }, h('p', {}, r.rollback)))),
      dock);
    window.dispatchEvent(new Event('dc:content'));
  }
  load();
  return host;
}

export function reviewsPage(ctx) {
  const el = ctx.id ? detail(ctx, ctx.id) : list(ctx);
  return { el, title: ctx.id ? `Review ${ctx.id}` : 'Reviews' };
}
