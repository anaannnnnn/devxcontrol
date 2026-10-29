// Create with AI: describe an app, watch it get written and tested, read the code, then deploy it to this server.
import { h, clear, icon, toast, actionBtn, confirmDialog } from '../ui.js';
import { api, stream } from '../api.js';

const head = (t, ...r) => h('div', { class: 'panel-head' }, h('h2', {}, t), h('span', { class: 'grow' }), ...r);
const IDEAS = ['A booking page for my barbershop with a simple appointment form', 'A team standup tracker where everyone posts yesterday, today and blockers', 'A landing page for my bakery with menu, opening hours and a map link', 'An expense splitter for a group trip'];

export function createPage(ctx) {
  ctx.crumbs([{ label: 'Create with AI' }]);
  const root = h('div', { class: 'stack' });
  let meta = { templates: [], drafts: [], ai: false };
  const S = { spec: '', template: 'static', id: '' };

  function logBox(path, { done, fail }) {
    const box = h('pre', { class: 'joblog mono', 'aria-live': 'polite' }); let es = null; let draft = null;
    es = stream(path, { line: (line) => { box.append(`${line}\n`); box.scrollTop = box.scrollHeight; const m = /^DRAFT:(.+)$/.exec(line); if (m) draft = m[1]; }, done: ({ code }) => { es?.close(); if (code === 0) done(draft); else fail(); }, error: () => {} });
    return box;
  }

  async function load() { try { meta = await api('/creator'); } catch (e) { clear(root).append(h('div', { class: 'empty' }, h('b', {}, 'Could not load'), h('p', { class: 'muted' }, e.message))); return; } start(); }

  function start() {
    clear(root);
    const spec = h('textarea', { class: 'sql', rows: 5, maxlength: 3000, placeholder: 'Describe the app: what it is for, who uses it, what it should do.', 'aria-label': 'Describe the app' }); spec.value = S.spec; spec.oninput = () => { S.spec = spec.value; };
    const tpls = h('div', { class: 'tpl-row', role: 'radiogroup', 'aria-label': 'Kind of app' }, ...meta.templates.map((t) => h('button', { class: 'panel tpl', role: 'radio', 'aria-checked': String(S.template === t.id), onclick: (e) => { S.template = t.id; tpls.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget))); } }, h('b', {}, t.label), h('span', { class: 'muted small' }, t.note))));
    const id = h('input', { class: 'field', placeholder: 'optional id, e.g. my-booking', 'aria-label': 'App id', value: S.id, oninput: (e) => { S.id = e.target.value.trim().toLowerCase(); } });
    const go = actionBtn({ ic: 'sparkle', label: 'Write my app', cls: 'primary', onClick: async () => { try { const r = await api('/creator/generate', { method: 'POST', body: { spec: S.spec, template: S.template, id: S.id || undefined } }); working(r.job); } catch (e) { toast(e.message, 'bad'); } } });
    const sname = h('input', { class: 'field', placeholder: 'Name for your app, e.g. Joe\'s Barbers', 'aria-label': 'App name for starter', maxlength: 60 });
    const startWith = async (s) => { try { const r = await api('/creator/generate', { method: 'POST', body: { starter: s.id, name: sname.value.trim() || undefined, id: S.id || undefined } }); working(r.job); } catch (e) { toast(e.message, 'bad'); } };
    const starters = h('section', { class: 'panel hud' }, head('Start from a ready-made app', h('span', { class: 'chip ok' }, 'no AI needed')), h('div', { class: 'stack', style: { padding: '0 16px 16px' } },
      h('p', { class: 'muted small' }, 'Each one is a complete working app that is tested before you see it. Pick one, name it, deploy it. Change it later with Autopilot or the visual editor.'),
      sname, h('div', { class: 'tpl-row' }, ...(meta.starters || []).map((s) => h('button', { class: 'panel tpl', onclick: () => startWith(s) }, h('b', {}, s.label), h('span', { class: 'muted small' }, s.note))))));
    root.append(
      starters,
      !meta.ai && h('div', { class: 'banner warn' }, icon('alert'), h('span', {}, 'No AI model is connected, so describing your own app will use the closest ready-made one. '), h('a', { href: '#/connections' }, 'Connect an AI model')),
      h('section', { class: 'panel hud' }, head('Or describe your own app', meta.ai ? h('span', { class: 'chip ok' }, 'AI connected') : h('span', { class: 'chip' }, 'AI not connected')), h('div', { class: 'stack', style: { padding: '0 16px 16px' } },
        h('p', { class: 'muted small' }, 'The AI plans the app, writes it file by file in small steps, tests it in an isolated container and fixes its own mistakes. If it cannot finish, you still get the closest ready-made app. You read everything before it goes live.'),
        spec, h('div', { class: 'row wrap', style: { gap: '6px' } }, ...IDEAS.map((t) => h('button', { class: 'chip btn-chip', onclick: () => { S.spec = t; spec.value = t; } }, t))),
        tpls, h('label', { class: 'lbl small' }, 'Id (becomes the container name)', id), h('div', { class: 'row' }, go))),
      meta.drafts.length ? h('section', { class: 'panel hud' }, head('Unfinished drafts'), h('ul', { class: 'list' }, ...meta.drafts.map((d) => h('li', { class: 'row', style: { padding: '10px 16px', gap: '10px' } }, h('b', {}, d.name), h('span', { class: 'muted small grow' }, d.spec.slice(0, 80)), h('button', { class: 'btn sm', onclick: () => review(d.id) }, 'Open'))))) : null);
  }

  function working(job) {
    clear(root).append(h('section', { class: 'panel hud' }, head('Writing your app'), h('div', { style: { padding: '0 16px 16px' } },
      logBox(`/jobs/${job}/stream`, { done: (draft) => (draft ? review(draft) : load()), fail: () => { toast('The app could not be written. Read the log, then try again.', 'bad'); root.append(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: load }, 'Back'))); } }))));
  }

  async function review(id) {
    let d; try { d = await api(`/creator/drafts/${id}`); } catch (e) { toast(e.message, 'bad'); return load(); }
    clear(root); let picked = d.source[0];
    const code = h('pre', { class: 'code' }); const title = h('b', { class: 'mono' });
    const show = (f) => { picked = f; title.textContent = f.path; code.textContent = f.content; list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.p === f.path))); };
    const list = h('ul', { class: 'ftree' }, ...d.source.map((f) => h('li', {}, h('button', { class: 'ft-row file', 'data-p': f.path, onclick: () => show(f) }, f.path))));
    const name = h('input', { class: 'field', value: d.name, 'aria-label': 'App name' }), domain = h('input', { class: 'field', placeholder: 'optional, e.g. booking.example.com', 'aria-label': 'Domain' });
    const deploy = actionBtn({ ic: 'rocket', label: 'Deploy to this server', cls: 'primary', onClick: async () => { try { const r = await api(`/creator/drafts/${d.id}/deploy`, { method: 'POST', body: { name: name.value, domain: domain.value } }); deploying(d, r.job); } catch (e) { toast(e.message, 'bad'); } } });
    root.append(
      h('section', { class: 'panel hud' }, head(`${d.name}`, h('span', { class: 'chip ok' }, 'tested'), d.fallback ? h('span', { class: 'chip warn', title: 'The AI could not finish, so this is the closest ready-made app' }, 'ready-made') : null, h('span', { class: 'chip' }, d.template)), h('p', { class: 'muted', style: { padding: '0 16px' } }, d.tagline || ''),
        h('div', { class: 'split', style: { padding: '12px 16px 16px' } }, h('div', {}, list), h('div', { class: 'stack' }, title, code))),
      h('section', { class: 'panel hud' }, head('Deploy'), h('div', { class: 'stack', style: { padding: '0 16px 16px' } },
        h('p', { class: 'muted small' }, 'Read the files above first. Deploying builds the container, joins the shared network and adds it to your Overview. It starts private to this server until you give it a domain.'),
        h('label', { class: 'lbl small' }, 'Name', name), h('label', { class: 'lbl small' }, 'Domain', domain),
        h('div', { class: 'row wrap', style: { gap: '8px' } }, deploy,
          h('button', { class: 'btn', onclick: () => { S.spec = d.spec; S.template = d.template; S.id = ''; start(); } }, 'Change the description'),
          h('button', { class: 'btn ghost danger', onclick: async () => { if (await confirmDialog({ title: 'Discard this draft?', confirm: 'Discard', danger: true })) { await api(`/creator/drafts/${d.id}`, { method: 'DELETE' }); load(); } } }, 'Discard')))));
    show(picked); window.dispatchEvent(new Event('dc:content'));
  }

  function deploying(d, job) {
    clear(root).append(h('section', { class: 'panel hud' }, head(`Deploying ${d.name}`), h('div', { style: { padding: '0 16px 16px' } },
      logBox(`/jobs/${job}/stream`, { done: () => { toast('Your app is live on this server.', 'ok'); location.hash = `#/app/${d.id}`; }, fail: () => { toast('The deploy stopped. Read the last lines.', 'bad'); root.append(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => review(d.id) }, 'Back to the draft'))); } }))));
  }

  load();
  return { el: root };
}
