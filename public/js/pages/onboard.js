// Onboard a GitHub repo: pick, scan, configure, deploy, join the fleet. Every step calls the server; nothing is simulated.
import { h, clear, icon, toast, actionBtn } from '../ui.js';
import { domainPicker } from './domainpick.js';
import { api, stream } from '../api.js';

const STEPS = ['Connect', 'Scan', 'Configure', 'Deploy', 'Live'];
const tag = (t, text) => h('span', { class: 'hud-tag', dataset: { t } }, text);
const head = (t, ...r) => h('div', { class: 'panel-head' }, h('h2', {}, t), h('span', { class: 'grow' }), ...r);

export function onboardPage(ctx) {
  ctx.crumbs([{ label: 'Onboard repo' }]);
  const S = { step: 0, repo: null, branch: '', branches: [], scan: null, name: '', id: '', group: 'Platforms', domain: '', port: '', service: '', env: [], baseline: true, repos: null, error: null, job: null, result: null };
  const body = h('div', { class: 'ob-body' }), stepper = h('ol', { class: 'ob-steps', 'aria-label': 'Progress' });
  let es = null;
  const goto = (n) => { S.step = n; draw(); };
  const slug = (s) => String(s).split('/').pop().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

  function paintSteps() {
    clear(stepper).append(...STEPS.map((s, i) => h('li', { dataset: { st: i < S.step ? 'done' : i === S.step ? 'now' : 'next' }, 'aria-current': i === S.step ? 'step' : null }, h('i', {}, i < S.step ? icon('check', 12) : String(i + 1)), h('span', {}, s))));
  }

  /* 1 connect */
  function connect() {
    const list = h('div', { class: 'repo-list', role: 'listbox', 'aria-label': 'Repositories' }, h('div', { class: 'empty' }, h('span', { class: 'spin' })));
    const q = h('input', { class: 'field', type: 'search', placeholder: 'Filter your repositories', 'aria-label': 'Filter repositories' });
    const url = h('input', { class: 'field mono', placeholder: 'https://github.com/owner/repo', 'aria-label': 'Repository URL' });
    const br = h('select', { class: 'field', 'aria-label': 'Branch to deploy', onchange: (e) => { S.branch = e.target.value; } }, h('option', { value: '' }, 'Default branch'));
    const next = h('button', { class: 'btn primary', disabled: !S.repo, onclick: () => goto(1) }, 'Scan this repo', icon('chevron', 16));
    const pickRepo = async (full, def) => {
      S.repo = full; S.branch = ''; S.id = slug(full); S.name = S.id; next.disabled = false; paint();
      try { S.branches = (await api(`/github/branches?repo=${encodeURIComponent(full)}`)).data; clear(br).append(h('option', { value: '' }, `Default (${def || 'main'})`), ...S.branches.map((b) => h('option', { value: b }, b))); } catch { /* optional */ }
    };
    const paint = () => {
      if (!S.repos) return; const f = q.value.toLowerCase(); const rows = S.repos.filter((r) => !r.archived && (r.full.toLowerCase().includes(f) || r.desc.toLowerCase().includes(f)));
      clear(list).append(...(rows.length ? rows.map((r) => h('button', { class: 'repo', role: 'option', 'aria-selected': String(S.repo === r.full), onclick: () => pickRepo(r.full, r.branch) }, icon('github', 20), h('div', {}, h('b', { class: 'mono' }, r.full), h('div', { class: 'muted small' }, r.desc || 'No description')), h('span', { class: 'grow' }), tag(r.priv ? 'warn' : 'live', r.priv ? 'private' : 'public'), h('span', { class: 'muted small' }, r.lang))) : [h('div', { class: 'empty' }, h('b', {}, S.repos.length ? 'No match' : 'No repositories'), h('p', { class: 'muted' }, S.repos.length ? 'Try another filter.' : 'The GitHub App can see no repositories. Install it on an account or repo, then reload.'))]));
    };
    q.addEventListener('input', paint);
    url.addEventListener('input', () => { const m = /github\.com\/([^/\s]+\/[^/\s#?]+)/.exec(url.value); if (m) pickRepo(m[1].replace(/\.git$/, '')); });
    if (S.repos) paint(); else api('/github/repos').then((r) => { S.repos = r.data; paint(); }).catch((e) => { S.error = e; clear(list).append(h('div', { class: 'empty' }, h('b', {}, 'GitHub is not ready'), h('p', { class: 'muted' }, e.message), h('a', { class: 'btn primary', href: '#/connections' }, 'Open Connections'))); });
    return h('div', { class: 'cols eq' },
      h('section', { class: 'panel hud' }, head('Choose a repository', S.repos ? tag('ok', 'GitHub connected') : ''), h('div', { class: 'ob-pad' }, q, list)),
      h('section', { class: 'panel hud' }, head('Or paste a link'), h('div', { class: 'ob-pad stack' }, h('label', { class: 'lbl' }, 'Repository URL', url), h('label', { class: 'lbl' }, 'Branch to deploy', br),
        h('div', { class: 'note' }, icon('key', 16), h('div', {}, h('b', {}, 'Access'), h('p', { class: 'muted small' }, 'Uses your GitHub App. It only sees repositories you installed it on, and the token expires after an hour.'))),
        h('div', { class: 'row' }, h('span', { class: 'grow' }), next))));
  }

  /* 2 scan */
  function scan() {
    const box = h('div', { class: 'scan-list' }, h('div', { class: 'scan-row', dataset: { d: '0' } }, h('span', { class: 'sc-ic' }, h('span', { class: 'spin' })), h('div', {}, h('b', {}, 'Cloning and reading the repo'), h('div', { class: 'muted small' }, 'This takes a few seconds.'))));
    const next = h('button', { class: 'btn primary', disabled: true, onclick: () => goto(2) }, 'Configure', icon('chevron', 16));
    const run = async () => {
      try {
        const r = await api('/onboard/scan', { method: 'POST', body: { repo: S.repo } }); S.scan = r;
        S.id = S.id || r.id; S.port = String(r.port || ''); S.service = r.service || ''; S.domain = S.domain || r.domainHint || ''; S.env = r.env.map((e) => ({ ...e, v: e.v || '', src: e.src === 'generate' && e.provision ? 'provision' : e.src === 'generate' && !/(SECRET|SALT|JWT|TOKEN|KEY|PASSWORD|PASS|PRIVATE)/i.test(e.k) ? 'value' : e.src }));
        clear(box).append(...r.scan.map(({ k, v }) => h('div', { class: 'scan-row', dataset: { d: '1' } }, h('span', { class: 'sc-ic' }, icon('check', 14)), h('div', {}, h('b', {}, k), h('div', { class: 'muted small' }, v)))), r.generated && h('details', { class: 'panel', style: { padding: '10px 14px' } }, h('summary', { style: { cursor: 'pointer' } }, `Generated Dockerfile (${r.generated.stack})`), h('pre', { class: 'code', style: { overflow: 'auto', fontSize: '12px', margin: '10px 0 0' } }, r.generated.dockerfile)));
        next.disabled = !r.deployable; if (!r.deployable) toast('No Dockerfile, and the project type was not recognised, so it cannot be deployed here.', 'bad');
      } catch (e) { clear(box).append(h('div', { class: 'banner bad' }, e.message)); }
    };
    run();
    return h('div', { class: 'cols eq' },
      h('section', { class: 'panel hud' }, head(`Reading ${S.repo}`, tag('live', S.branch || 'default branch')), h('div', { class: 'ob-pad' }, box)),
      h('section', { class: 'panel hud' }, head('What happens next'), h('div', { class: 'ob-pad stack' }, h('p', { class: 'muted' }, 'DevX Control reads the README, compose file, env example and tests, then proposes a setup. Nothing is started yet.'),
        h('ul', { class: 'check' }, ['Clone to the server (shallow)', 'Write the .env you approve', 'Build and start with docker compose', 'Add a Caddy route and certificate for your domain', 'Register the project so it is monitored and backed up', 'Queue a first Autopilot scan']), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => goto(0) }, 'Back'), h('span', { class: 'grow' }), next))));
  }

  /* 3 configure */
  function configure() {
    const r = S.scan; const groups = [...new Set([...ctx.fleet.apps.map((a) => a.group), 'Platforms', 'AI', 'Sites'])];
    const inp = (v, on, extra = {}) => h('input', { class: 'field', value: v, oninput: (e) => on(e.target.value), ...extra });
    const grp = h('select', { class: 'field', 'aria-label': 'Group', onchange: (e) => { S.group = e.target.value; } }, groups.map((g) => h('option', { selected: g === S.group }, g)));
    const svc = r.services.length > 1 ? h('select', { class: 'field', 'aria-label': 'Web service', onchange: (e) => { S.service = e.target.value; const s = r.services.find((x) => x.name === e.target.value); S.port = String((s?.ports[0] || s?.expose[0]) || S.port); } }, r.services.map((s) => h('option', { value: s.name, selected: s.name === S.service }, `${s.name}${s.image ? ` (${s.image})` : ''}`))) : null;
    const env = S.env.length ? S.env.map((e) => h('div', { class: 'env-row' }, h('code', {}, e.k), e.src === 'provision' ? tag('ok', 'automatic') : e.src === 'generate' ? tag('ok', 'generated') : e.src === 'placeholder' ? tag('warn', 'placeholder') : e.v ? tag('live', 'has default') : tag('live', 'optional'),
      h('select', { class: 'field', 'aria-label': `${e.k} source`, onchange: (ev) => { e.src = ev.target.value; draw(); } }, [['value', 'Value'], ...(/(SECRET|SALT|JWT|TOKEN|KEY|PASSWORD|PASS|PRIVATE)/i.test(e.k) ? [['generate', 'Generate']] : []), ...(e.provision ? [['provision', `Create ${e.provision} here`]] : []), ...(e.src === 'placeholder' ? [['placeholder', 'Placeholder']] : [])].map(([v, l]) => h('option', { value: v, selected: v === e.src }, l))),
      e.src === 'provision' ? h('span', { class: 'muted small' }, `A private ${e.provision} is set up on this server for this app. No account needed.`) : e.src === 'placeholder' ? h('span', { class: 'muted small' }, `Placeholder ${e.v}. The app starts; the feature that needs the real account stays off until you add it under Secrets.`) : e.src === 'generate' ? h('span', { class: 'muted small' }, `Will generate ${e.genNote || 'a random secret'}`) : h('input', { class: 'field mono', type: e.secret ? 'password' : 'text', autocomplete: 'off', placeholder: 'optional, leave empty if unsure', value: e.v, oninput: (ev) => { e.v = ev.target.value; } }))) : [h('p', { class: 'muted' }, 'This repo has no .env.example, so no variables will be written.')];
    return h('div', { class: 'stack' },
      h('div', { class: 'cols eq' },
        h('section', { class: 'panel hud' }, head('Project'), h('div', { class: 'ob-pad stack' },
          h('label', { class: 'lbl' }, 'Name', inp(S.name, (v) => { S.name = v; })),
          h('label', { class: 'lbl' }, 'Address (optional)', domainPicker({ value: S.domain, hint: S.id || 'app', onChange: (v) => { S.domain = v; } }), h('span', { class: 'muted small' }, 'Pick a domain, type the name in front of it. The port, the DNS record, the Caddy route and the certificate are all done for you.')),
          h('details', {}, h('summary', { style: { cursor: 'pointer' } }, 'Advanced (usually not needed)'), h('div', { class: 'stack', style: { marginTop: '10px' } },
            h('label', { class: 'lbl' }, 'Id (letters, numbers, dashes)', inp(S.id, (v) => { S.id = v.toLowerCase(); }, { class: 'field mono' })), h('label', { class: 'lbl' }, 'Group', grp),
            svc && h('label', { class: 'lbl' }, 'Service that serves the web app', svc),
            h('label', { class: 'lbl' }, 'Container port (empty = detect it)', inp(S.port, (v) => { S.port = v; }, { class: 'field mono', inputmode: 'numeric', placeholder: 'detected automatically' })))))),
        h('section', { class: 'panel hud' }, head('Options'), h('div', { class: 'ob-pad stack' },
          h('label', { class: 'rule' }, h('input', { type: 'checkbox', checked: S.baseline, onchange: (e) => { S.baseline = e.target.checked; } }), h('span', { class: 'sw' }), h('div', {}, h('b', {}, 'Run a baseline Autopilot scan'), h('div', { class: 'muted small' }, 'Tests, dependencies, code, Dockerfile and secrets. Sets the first scores.'))),
          h('p', { class: 'muted small' }, 'Autonomy level, floors and the other limits are in Autopilot, Guardrails.'),
          r.health ? h('div', { class: 'banner ok', style: { margin: 0 } }, icon('check'), h('span', {}, `Health endpoint ${r.health} will be used for monitoring.`)) : h('div', { class: 'banner warn', style: { margin: 0 } }, icon('alert'), h('span', {}, 'No health endpoint found. The monitor will only check that the port answers.'))))),
      h('details', { class: 'panel hud', open: false }, h('summary', { style: { cursor: 'pointer', padding: '12px 16px' } }, `Environment variables: all ${S.env.length} are handled automatically`, S.env.some((e) => e.src === 'placeholder') ? ` (${S.env.filter((e) => e.src === 'placeholder').length} placeholders for outside accounts, add real keys later)` : ''), h('div', { class: 'ob-pad' }, h('div', { class: 'env' }, env))),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => goto(1) }, 'Back'), h('span', { class: 'grow' }), h('button', { class: 'btn primary glow', onclick: () => { if (!/^[a-z0-9][a-z0-9-]{1,29}$/.test(S.id)) { toast('The id must be 2-30 lowercase letters, numbers or dashes', 'bad'); return; } goto(3); } }, icon('rocket', 16), 'Deploy to server')));
  }

  /* 4 deploy */
  function deploy() {
    const term = h('div', { class: 'term', role: 'log', 'aria-live': 'polite' }); const bar = h('div', { class: 'meter big' }, h('i')); let n = 0; const retry = h('div');
    const add = (l) => { n++; term.append(h('span', { class: `ln ${/^error/.test(l) ? 'err' : ''}` }, h('span', { class: 'ts' }, String(n).padStart(2, '0')), l)); term.scrollTop = term.scrollHeight; bar.firstChild.style.width = `${Math.min(95, n * 4)}%`; };
    (async () => {
      try {
        const r = await api('/onboard/deploy', { method: 'POST', body: { id: S.id, repo: S.repo, branch: S.branch || undefined, name: S.name || S.id, group: S.group, domain: S.domain, port: +S.port || undefined, service: S.service, env: S.env.map((e) => ({ k: e.k, v: e.v, src: e.src })), baseline: S.baseline, scan: S.scan } });
        es = stream(`/jobs/${r.job}/stream`, { line: add, done: ({ code }) => { es?.close(); bar.firstChild.style.width = '100%'; if (code === 0) setTimeout(() => goto(4), 700); else clear(retry).append(h('div', { class: 'banner bad' }, icon('alert'), h('span', {}, 'The deploy stopped. Read the last lines above, fix the cause, then try again.')), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => goto(2) }, 'Back to configure'))); }, error: () => {} });
      } catch (e) { add(`error: ${e.message}`); clear(retry).append(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => goto(2) }, 'Back to configure'))); }
    })();
    return h('section', { class: 'panel hud' }, head(`Deploying ${S.name || S.id}`, tag('live', 'live output')), h('div', { class: 'ob-pad' }, bar), term, h('div', { class: 'ob-pad' }, retry));
  }

  /* 5 live */
  function live() {
    return h('div', { class: 'ob-done' }, h('div', { class: 'done-mark' }, icon('check', 40)), h('h2', {}, `${S.name || S.id} is live`), h('p', { class: 'muted' }, `Added to ${S.group}. The monitor is watching it${S.baseline ? ' and the first Autopilot scan is running' : ''}.`),
      h('section', { class: 'panel hud', style: { textAlign: 'left', maxWidth: '640px', width: '100%' } }, h('dl', { class: 'kv' }, h('dt', {}, 'Repository'), h('dd', { class: 'mono' }, `${S.repo}${S.branch ? ` @ ${S.branch}` : ''}`), S.domain && [h('dt', {}, 'Address'), h('dd', { class: 'mono' }, `https://${S.domain}`)], h('dt', {}, 'Group'), h('dd', {}, S.group))),
      h('div', { class: 'row wrap', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => ctx.go(`/app/${S.id}`) }, icon('radar', 16), 'Open the project'), h('button', { class: 'btn', onclick: () => ctx.go('/pipeline') }, icon('flow', 16), 'Open Autopilot')));
  }

  function draw() { es?.close(); paintSteps(); clear(body).append([connect, scan, configure, deploy, live][S.step]()); window.dispatchEvent(new Event('dc:content')); }
  draw();
  return { el: h('div', { class: 'stack' }, h('header', { class: 'page-head' }, h('div', {}, h('div', { class: 'hud-eyebrow' }, 'GitHub to production'), h('h1', {}, 'Onboard a repository'), h('p', { class: 'lede' }, 'Pick a repo. DevX Control clones it, runs it with docker compose, adds a route, and starts monitoring it.'))), stepper, body), title: 'Onboard', destroy() { es?.close(); } };
}
