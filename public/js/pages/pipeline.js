// Autopilot: scanners, fixers, findings, guardrails. Everything shown here comes from /api/v1/autopilot.
import { h, clear, icon, fmt, toast, actionBtn } from '../ui.js';
import { api } from '../api.js';
import { workflowCanvas } from '../canvas.js';
import { orb } from '../orbs.js';

const tag = (t, text) => h('span', { class: 'hud-tag', dataset: { t } }, text);
const head = (title, ...right) => h('div', { class: 'panel-head' }, h('h2', {}, title), h('span', { class: 'grow' }), ...right);
const empty = (title, body, ...actions) => h('div', { class: 'empty' }, h('b', {}, title), h('p', { class: 'muted' }, body), actions.length ? h('div', { class: 'row wrap', style: { justifyContent: 'center' } }, ...actions) : '');

function ring(v, floor) {
  const R = 30, C = 2 * Math.PI * R;
  return h('svg', { viewBox: '0 0 80 80', class: 'ring', role: 'img', 'aria-label': v == null ? 'not measured' : `${v} out of 100${floor != null ? `, floor ${floor}` : ''}` },
    h('circle', { cx: 40, cy: 40, r: R, class: 'trk', fill: 'none', 'stroke-width': 6 }),
    v != null && h('circle', { cx: 40, cy: 40, r: R, class: 'val', fill: 'none', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-dasharray': `${(C * v) / 100} ${C}`, transform: 'rotate(-90 40 40)' }),
    h('text', { x: 40, y: 46, 'text-anchor': 'middle' }, v == null ? '-' : String(v)));
}

export function pipelinePage(ctx) {
  ctx.crumbs([{ label: 'Autopilot' }]);
  let D = null, app = '', cur = 'workflow', sig = {}, timer = null, wf = null, role = 'All';
  const sel = h('select', { class: 'field', 'aria-label': 'Project', onchange: (e) => { app = e.target.value; sig = {}; load(); } });
  const banner = h('div', { class: 'stack' });
  const scoreBox = h('div'), tabs = h('div', { class: 'subtabs', role: 'tablist' });
  const labels = { workflow: 'Workflow', agents: 'Agents', findings: 'Findings', guardrails: 'Guardrails' };
  const panes = Object.fromEntries(Object.keys(labels).map((k) => [k, h('div', { class: k === 'workflow' ? 'stack' : '' })]));
  const body = h('div', { class: 'pane' }, ...Object.values(panes));
  const el = h('div', { class: 'stack' },
    h('header', { class: 'page-head' }, h('div', {}, h('div', { class: 'hud-eyebrow' }, 'Monitor · improve · automate'), h('h1', {}, 'Autopilot'), h('p', { class: 'lede' }, 'Real scanners and an AI fixer working on your repos. You decide what ships.')), h('label', { class: 'lbl' }, 'Project', sel)),
    banner, scoreBox, tabs, body);

  const scanNow = (appId) => async () => { try { await api('/autopilot/scan', { method: 'POST', body: { app: appId || null } }); toast('Scan started', 'ok'); await load(); } catch (e) { toast(e.message, 'bad'); } };
  const connectBtn = (label) => h('a', { class: 'btn primary', href: '#/connections' }, icon('external', 16), label);

  /* ---------- pieces ---------- */
  function paintBanner() {
    const c = D.connected; clear(banner);
    if (!c.github) banner.append(h('div', { class: 'banner warn' }, icon('alert'), h('span', {}, 'GitHub is not connected, so nothing can be scanned yet.'), h('span', { class: 'grow' }), connectBtn('Connect GitHub')));
    else if (!c.llm) banner.append(h('div', { class: 'banner warn' }, icon('alert'), h('span', {}, 'Scanning works. Connect a free AI model to let Autopilot write fixes, reports and suggestions.'), h('span', { class: 'grow' }), connectBtn('Connect AI')));
    if (D.pending) banner.append(h('div', { class: 'banner info' }, icon('diff'), h('span', {}, `${D.pending} change report${D.pending > 1 ? 's are' : ' is'} waiting for your decision.`), h('span', { class: 'grow' }), h('a', { class: 'btn sm', href: '#/reviews' }, 'Review')));
  }

  function paintScores() {
    clear(scoreBox);
    if (!D.scanned) return;
    scoreBox.append(h('div', { class: 'score-row' }, D.scores.map((s) => h('div', { class: 'panel hud score' }, ring(s.v, s.floor), h('div', {}, h('div', { class: 'k' }, s.k),
      h('div', { class: 'muted small' }, s.v == null ? 'not measured' : s.floor != null ? `floor ${s.floor}` : 'no floor set'),
      s.v != null && h('div', { class: `delta ${s.d > 0 ? 'up' : s.d < 0 ? 'down' : ''}` }, s.d == null ? 'first scan' : s.d === 0 ? 'steady' : `${s.d > 0 ? '+' : ''}${s.d} since last scan`))))));
  }

  const runInfo = () => { const r = D.run; if (!r) return { at: -1, meta: { run: null, app: app ? D.eligible.find((a) => a.id === app)?.name : '', chip: 'idle' } };
    const live = r.state === 'running' || r.state === 'queued';
    return { at: live ? Math.max(0, r.stageIndex) : r.state === 'done' ? D.stages.length : Math.max(0, r.stageIndex), live, meta: { run: r.id, app: r.label || '', live, chip: live ? `${r.stage || 'starting'}${r.attempt ? ` · attempt ${r.attempt} of ${D.cfg.maxAttempts}` : ''}` : r.state } }; };

  function workflowPane() {
    const p = panes.workflow; const { at, meta } = runInfo();
    const info = h('aside', { class: 'cv-inspect' });
    const show = (i) => { const s = D.stages[i]; const logs = (D.run?.log || []).filter((l) => l[1] === s.id); const st = i < at ? 'done' : i === at && meta.live ? 'running' : 'queued';
      clear(info).append(h('div', { class: 'hud-eyebrow' }, `Node ${String(i + 1).padStart(2, '0')} · ${st}`), h('h3', {}, s.name), h('p', { class: 'muted' }, s.blurb), h('div', { class: 'kv' }, h('span', {}, 'Handled by'), h('b', {}, s.by)),
        h('div', { class: 'kv' }, h('span', {}, 'Latest output'), h('b', { class: 'mono' }, logs.length ? logs.at(-1)[2].slice(0, 90) : st === 'queued' ? 'waiting' : st === 'done' ? 'done, nothing to report' : 'working')), s.id === 'approve' ? h('div', { class: 'gate' }, icon('lock', 14), 'Human gate: nothing ships without you') : ''); };
    wf?.destroy(); wf = workflowCanvas({ stages: D.stages, at, onPick: show, meta });
    show(Math.min(Math.max(at, 0), D.stages.length - 1));
    clear(p).append(h('section', { class: 'panel hud flush' }, head('The workflow', tag('live', `${D.stages.length} nodes · one human gate`)), h('div', { class: 'cv-wrap' }, wf.el, info)),
      h('div', { class: 'cols' }, liveRun(), h('div', { class: 'stack' }, levels(), schedule())));
  }

  function liveRun() {
    const r = D.run; const live = r && (r.state === 'running' || r.state === 'queued');
    const term = h('div', { class: 'term', role: 'log', 'aria-live': 'polite' });
    for (const l of r?.log || []) term.append(h('span', { class: `ln ${l[0] === 'warn' ? 'wrn' : l[0] === 'bad' ? 'err' : ''}` }, h('span', { class: 'ts' }, `[${l[1] || 'run'}]`), l[2]));
    queueMicrotask(() => { term.scrollTop = term.scrollHeight; });
    const rv = r?.kind === 'fix' && r.state === 'done' ? D.findings.find((f) => f.id === r.finding)?.review : null;
    return h('section', { class: 'panel hud' }, head('Live run', r ? tag(live ? 'live' : r.state === 'failed' ? 'bad' : 'ok', live ? r.state : r.state) : '', r?.attempt ? tag('warn', `attempt ${r.attempt} of ${D.cfg.maxAttempts}`) : ''),
      r ? h('div', { class: 'run-sub' }, icon('target', 16), h('span', {}, `${r.kind}: ${r.label || r.id}`), h('span', { class: 'grow' }), h('span', { class: 'muted small' }, `${live ? 'started' : 'finished'} ${fmt.ago(live ? r.started : r.ended || r.started)}`)) : '',
      r ? term : empty('No runs yet', D.eligible.length ? 'Press Scan now to check your projects.' : 'None of your apps has a GitHub repo set.'),
      h('div', { class: 'row wrap', style: { padding: '12px 14px 14px' } }, actionBtn({ ic: 'radar', label: live ? 'Running...' : app ? 'Scan this project' : 'Scan all projects', cls: 'primary', disabled: live || !D.connected.github, onClick: scanNow(app) }), rv && h('a', { class: 'btn', href: `#/reviews/${rv}` }, icon('diff', 16), 'Open the change report')));
  }

  function levels() {
    const box = h('div', { class: 'levels', role: 'radiogroup', 'aria-label': 'Autonomy level' }, D.levels.map((l) => h('button', { class: 'level', role: 'radio', 'aria-checked': String(D.cfg.level === l.id), disabled: l.id === 2 && !D.connected.llm, title: l.id === 2 && !D.connected.llm ? 'Connect an AI model first' : '', onclick: async () => { try { await api('/autopilot/config', { method: 'PUT', body: { level: l.id } }); toast(`Autonomy set to ${l.name}`, 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } } }, h('i', {}, String(l.id)), h('div', {}, h('b', {}, l.name), h('span', { class: 'muted small' }, l.blurb)))));
    return h('section', { class: 'panel hud' }, head('Autonomy level'), box);
  }

  function schedule() {
    return h('section', { class: 'panel hud' }, head('Schedule'), h('div', { class: 'events' }, D.schedule.map((s) => h('div', { class: 'ev' }, h('span', { class: 'ic' }, icon('clock', 18)), h('div', {}, h('b', {}, s.every), h('div', { class: 'muted small' }, s.what, s.next ? ` · next ${new Date(s.next).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : '')), tag('live', s.by)))));
  }

  function agentsPane() {
    const roles = ['All', ...new Set(D.agents.map((a) => a.role))]; const grid = h('div', { class: 'grid-cards agents' });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter by role' }, roles.map((r) => h('button', { 'aria-pressed': String(r === role), onclick: () => { role = r; sig.agents = null; agentsPane(); } }, r)));
    grid.append(...D.agents.filter((a) => role === 'All' || a.role === role).map((a) => { const off = a.needs === 'llm' && !D.connected.llm; const st = off ? 'idle' : a.state;
      return h('article', { class: 'panel hud agent', dataset: { role: a.role.toLowerCase(), st } },
        h('div', { class: 'ag-top' }, h('div', {}, h('div', { class: 'hud-eyebrow' }, a.role), h('h3', {}, a.name)), h('span', { class: 'grow' }), orb(st === 'live' ? (a.role === 'Fixer' ? 'working' : a.role === 'Tester' ? 'searching' : a.role === 'Advisor' ? 'reasoning' : 'background') : 'base', { size: 28, label: st === 'live' ? 'has run' : 'idle' }), h('span', { class: 'muted small' }, off ? 'needs AI' : st === 'live' ? 'active' : 'not run yet')),
        h('p', { class: 'ag-good' }, h('b', {}, 'Good at'), a.good), h('p', { class: 'ag-weak' }, h('b', {}, 'Weak at'), a.weak),
        a.pass != null && h('div', { class: 'ag-bar' }, h('span', { class: 'muted small' }, a.role === 'Fixer' ? 'Attempts accepted' : 'Clean runs'), h('div', { class: 'meter' }, h('i', { style: { width: `${a.pass}%` } })), h('b', { class: 'mono' }, `${a.pass}%`)),
        h('div', { class: 'row wrap ag-foot' }, h('span', { class: 'hud-tag' }, a.scope), h('span', { class: 'hud-tag' }, a.lic), h('span', { class: 'grow' }), h('span', { class: 'muted small' }, a.runs ? `${a.runs.toLocaleString()} runs · ${fmt.ago(a.last)}` : 'no runs yet'))); }));
    clear(panes.agents).append(h('section', {}, h('div', { class: 'group-title' }, 'Division of labour', seg), grid));
    window.dispatchEvent(new Event('dc:content'));
  }

  function findingsPane() {
    const sev = { high: 'bad', med: 'warn', low: 'ok' }; const stateTag = { open: 'warn', fixing: 'live', review: 'live', wontfix: 'idle' };
    const doFix = (f) => async () => { try { await api(`/autopilot/findings/${f.id}/fix`, { method: 'POST' }); toast(`Fixing ${f.id}`, 'ok'); cur = 'workflow'; paintTabs(); load(); } catch (e) { toast(e.message, 'bad'); } };
    const act = (f) => f.state === 'review' && f.review ? h('a', { class: 'btn sm', href: `#/reviews/${f.review}` }, 'Open') : f.state === 'fixing' ? h('span', { class: 'muted small' }, 'working') : f.fixable && f.state === 'open' ? actionBtn({ ic: 'wand', label: 'Fix', cls: 'sm', disabled: !D.connected.llm || D.busy, title: !D.connected.llm ? 'Connect an AI model first' : D.busy ? 'Another run is in progress' : '', onClick: doFix(f) }) : f.state === 'open' ? h('span', { class: 'muted small', title: f.why || '' }, 'needs a person') : '';
    const rows = D.findings.map((x) => h('tr', {}, h('td', { class: 'mono' }, x.id), h('td', {}, h('span', { class: `chip ${sev[x.sev]}` }, x.sev)),
      h('td', {}, h('b', {}, x.title), h('div', { class: 'muted small' }, `${D.eligible.find((a) => a.id === x.app)?.name || x.app} · ${x.tool}${x.file ? ` · ${x.file}${x.line ? `:${x.line}` : ''}` : ''}`), x.why && h('div', { class: 'muted small' }, x.why)),
      h('td', {}, tag(stateTag[x.state] || 'live', x.state)), h('td', { class: 'r muted' }, fmt.ago(x.first)), h('td', { class: 'r' }, act(x))));
    const sug = D.suggestions.map((s) => h('div', { class: 'sug' }, h('div', { class: 'row wrap' }, h('b', {}, s.title), h('span', { class: 'grow' }), tag('live', s.area)), h('p', { class: 'muted small' }, s.why),
      h('div', { class: 'row wrap' }, h('span', { class: 'chip' }, `impact ${s.impact}`), h('span', { class: 'chip' }, `effort ${s.effort}`), h('span', { class: 'grow' }), actionBtn({ ic: 'wand', label: 'Turn into a fix', cls: 'sm', disabled: !D.connected.llm || D.busy, onClick: async () => { try { await api('/autopilot/tasks', { method: 'POST', body: { app: s.app, title: s.title, detail: s.why } }); toast('Working on it', 'ok'); cur = 'workflow'; paintTabs(); load(); } catch (e) { toast(e.message, 'bad'); } } }))));
    const pick = app || D.eligible[0]?.id;
    clear(panes.findings).append(h('div', { class: 'cols' },
      h('section', { class: 'panel hud' }, head('Findings queue', tag(D.openCount ? 'warn' : 'ok', `${D.openCount} open`)), rows.length ? h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, ['ID', 'Severity', 'Finding', 'State', 'Age', ''].map((c, i) => h('th', { class: i > 3 ? 'r' : '' }, c)))), h('tbody', {}, rows))) : empty(D.scanned ? 'Nothing to fix' : 'No scan yet', D.scanned ? 'The last scan found no open problems.' : 'Run a scan to see findings here.')),
      h('section', { class: 'panel hud' }, head('Advisor suggestions', tag('live', 'suggest only'), actionBtn({ ic: 'wand', label: 'Ask the advisor', cls: 'sm', disabled: !D.connected.llm || !pick || D.busy, title: !D.connected.llm ? 'Connect an AI model first' : '', onClick: async () => { try { await api('/autopilot/advise', { method: 'POST', body: { app: pick } }); toast('Advisor is reading the repo', 'ok'); cur = 'workflow'; paintTabs(); load(); } catch (e) { toast(e.message, 'bad'); } } })),
        sug.length ? h('div', { class: 'sugs' }, sug) : empty('No suggestions yet', D.connected.llm ? 'Ask the advisor to read a project and suggest improvements.' : 'The advisor needs an AI model.', !D.connected.llm && connectBtn('Connect AI')))));
  }

  function guardPane() {
    const c = D.cfg; const fixed = [['No automatic deploys', 'Every change waits for your approval.'], ['Never touch secrets', 'Env files, keys and CI config are off limits to the fixer (list below).'], ['Independent checks', 'The tests and scanners that judge a fix run outside the fixer.'], ['Nothing ships if checks fail', 'A fix is dropped when tests fail or the original finding is still there.']];
    const att = h('input', { class: 'field', type: 'number', min: 1, max: 5, value: c.maxAttempts, 'aria-label': 'Attempts per fix' });
    const every = h('select', { class: 'field', 'aria-label': 'Scan interval' }, [[30, 'Every 30 minutes'], [60, 'Every hour'], [180, 'Every 3 hours'], [360, 'Every 6 hours'], [720, 'Every 12 hours'], [1440, 'Daily']].map(([v, t]) => h('option', { value: v, selected: v === c.scanEveryMin }, t)));
    const pp = h('textarea', { class: 'field mono', rows: 5, 'aria-label': 'Protected paths' }, c.protectedPaths.join('\n'));
    const floors = D.scores.map((s) => ({ k: s.k, i: h('input', { class: 'field', type: 'number', min: 0, max: 100, placeholder: 'none', value: c.floors[s.k] ?? '', 'aria-label': `${s.k} floor` }) }));
    const save = actionBtn({ ic: 'check', label: 'Save', cls: 'primary', onClick: async () => { try { await api('/autopilot/config', { method: 'PUT', body: { maxAttempts: +att.value, scanEveryMin: +every.value, protectedPaths: pp.value.split('\n'), floors: Object.fromEntries(floors.map((f) => [f.k, f.i.value])) } }); toast('Guardrails saved', 'ok'); load(); } catch (e) { toast(e.message, 'bad'); } } });
    clear(panes.guardrails).append(h('div', { class: 'cols' },
      h('section', { class: 'panel hud' }, head('Always enforced', tag('ok', 'in code')), h('div', { class: 'rules' }, fixed.map(([t, d]) => h('div', { class: 'rule' }, h('span', { class: 'sw on' }), h('div', {}, h('b', {}, t, icon('lock', 12)), h('div', { class: 'muted small' }, d)))))),
      h('section', { class: 'panel hud' }, head('Your limits'), h('div', { class: 'pad-form stack' },
        h('label', { class: 'lbl' }, 'Attempts per fix (1 to 5)', att), h('label', { class: 'lbl' }, 'Full scan', every),
        h('label', { class: 'lbl' }, 'Paths the fixer may never edit (one per line)', pp),
        h('div', {}, h('div', { class: 'lbl' }, 'Score floors: a scan files a finding when a score drops below its floor'), h('div', { class: 'grid-floors' }, floors.map((f) => h('label', { class: 'lbl small' }, f.k, f.i)))),
        h('div', { class: 'row wrap' }, save, actionBtn({ ic: 'lock', label: 'Lock current scores as floors', onClick: async () => { await api('/autopilot/floors/lock', { method: 'POST' }); toast('Floors set just under today\'s scores', 'ok'); load(); } }))))));
  }

  const painters = { workflow: workflowPane, agents: agentsPane, findings: findingsPane, guardrails: guardPane };
  function paintTabs() {
    clear(tabs).append(...Object.keys(panes).map((k) => h('button', { role: 'tab', 'aria-selected': String(k === cur), onclick: () => { cur = k; paintTabs(); paintCur(true); } }, labels[k], k === 'findings' && D?.openCount ? h('i', { class: 'cnt' }, String(D.openCount)) : '')));
    Object.entries(panes).forEach(([k, v]) => { v.hidden = k !== cur; });
    window.dispatchEvent(new Event('resize'));
  }
  const keyOf = (k) => JSON.stringify(k === 'workflow' ? [D.run && [D.run.id, D.run.state, D.run.stage, D.run.attempt, D.run.log.length], D.cfg.level, D.schedule, D.connected] : k === 'agents' ? [D.agents.map((a) => a.runs), D.connected, role] : k === 'findings' ? [D.findings.map((f) => [f.id, f.state, f.why]), D.suggestions.length, D.connected, D.busy] : [D.cfg, D.scores.map((s) => s.v)]);
  function paintCur(force) { const k = cur; const s = keyOf(k); if (!force && sig[k] === s) return; sig[k] = s; painters[k](); }

  async function load() {
    try { D = await api(`/autopilot${app ? `?app=${encodeURIComponent(app)}` : ''}`); } catch (e) { clear(banner).append(h('div', { class: 'banner bad' }, e.message)); return; }
    if (!sel.options.length || sel.options.length !== D.eligible.length + 1) { clear(sel).append(h('option', { value: '' }, 'All projects'), ...D.eligible.map((a) => h('option', { value: a.id, selected: a.id === app }, a.name))); }
    paintBanner(); paintScores(); paintTabs(); paintCur();
  }
  load();
  timer = setInterval(() => { if (!document.hidden) load(); }, 4000);
  return { el, title: 'Autopilot', destroy() { clearInterval(timer); wf?.destroy(); } };
}
