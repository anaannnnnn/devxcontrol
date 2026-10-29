// Release notes: turns the git history of an app into plain-language notes (AI when connected, a rule-based writer otherwise).
// Notes are drafts until published. Published notes also appear on a public "What's new" page for that app.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './docker.js';

const DEMO = !!process.env.DEMO;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SECTIONS = [['new', 'New'], ['improved', 'Improved'], ['fixed', 'Fixed']];

// Rule-based fallback: group commit subjects by what they say, strip conventional-commit prefixes, make them sentences.
export function plainNotes(commits) {
  const out = { new: [], improved: [], fixed: [] };
  const seen = new Set();
  for (const c of commits) {
    let s = String(c.subject || '').trim(); if (!s || /^merge\b/i.test(s) || /^(wip|chore|bump|update dependenc)/i.test(s)) continue;
    let kind = 'improved';
    const m = /^(feat|fix|perf|refactor|docs|style|test|chore|build|ci)(\([^)]*\))?!?:\s*/i.exec(s);
    if (m) { const t = m[1].toLowerCase(); kind = t === 'feat' ? 'new' : t === 'fix' ? 'fixed' : 'improved'; s = s.slice(m[0].length); }
    else if (/^(add|new|introduce|create|support|implement)\b/i.test(s)) kind = 'new';
    else if (/^(fix|resolve|repair|correct|patch)\b/i.test(s)) kind = 'fixed';
    s = s.charAt(0).toUpperCase() + s.slice(1); if (!/[.!?]$/.test(s)) s += '.';
    const key = s.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
    out[kind].push(s);
  }
  return out;
}

export function renderMarkdown(title, summary, sections) {
  const parts = [`# ${title}`]; if (summary) parts.push('', summary);
  for (const [k, label] of SECTIONS) if (sections[k]?.length) parts.push('', `## ${label}`, ...sections[k].map((x) => `- ${x}`));
  return parts.join('\n');
}

// Minimal Markdown to HTML for the notes format above (headings and bullets only, everything escaped).
export function mdToHtml(md) {
  const out = []; let list = false;
  for (const line of String(md).split('\n')) {
    const li = /^- (.*)$/.exec(line);
    if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${esc(li[1])}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (h) out.push(`<h${h[1].length}>${esc(h[2])}</h${h[1].length}>`); else if (line.trim()) out.push(`<p>${esc(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('\n');
}

export function makeReleaseNotes({ registry, llm, dataDir, audit = () => {} }) {
  const file = path.join(dataDir, 'release-notes.json');
  const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const save = (d) => { const t = `${file}.tmp`; fs.writeFileSync(t, JSON.stringify(d)); fs.renameSync(t, file); };
  const git = (app, args, timeout = 30000) => run('git', ['-C', app.path, ...args], { timeout, env: { GIT_TERMINAL_PROMPT: '0' } });

  async function commits(app, fromHash) {
    if (DEMO) {
      const subjects = ['feat: dashboard export to CSV', 'fix: login redirect after password reset', 'Add dark mode to the customer portal', 'perf: faster order list loading', 'Fix rounding on invoice totals', 'Update dependencies', 'Improve the checkout form on mobile'];
      return subjects.map((subject, i) => ({ hash: `${(0xd00d00 + i * 4099 + app.id.length).toString(16)}`.slice(0, 7), subject, author: 'Anan', when: new Date(Date.now() - (i + 1) * 86400e3 * 2).toISOString() }));
    }
    if (!fs.existsSync(path.join(app.path, '.git'))) throw Object.assign(new Error('This app has no git checkout on the server, so there is no history to read.'), { status: 409 });
    const range = fromHash && (await git(app, ['cat-file', '-e', `${fromHash}^{commit}`])).ok ? [`${fromHash}..HEAD`] : ['-n', '30'];
    const r = await git(app, ['log', ...range, '--no-merges', '--format=%h|%s|%an|%cI', '-n', '60']);
    if (!r.ok) throw Object.assign(new Error((r.err || 'Could not read git history').trim().split('\n')[0]), { status: 502 });
    return r.out.split('\n').filter(Boolean).map((l) => { const [hash, subject, author, when] = l.split('|'); return { hash, subject, author, when }; });
  }
  const headOf = async (app) => (DEMO ? 'demo0000' : (await git(app, ['rev-parse', '--short', 'HEAD'])).out.trim());

  async function aiNotes(app, list, stat) {
    const sys = 'You write release notes for the customers and staff of a business app. Plain, friendly language. No jargon, no commit hashes, no file names. Each bullet is one short sentence about what a person using the app will notice. Skip purely internal changes (refactors, dependency bumps, tests). Reply with JSON only: {"title": string, "summary": string (one or two sentences), "new": string[], "improved": string[], "fixed": string[]}.';
    const user = `App: ${app.name} (${app.tagline || 'no description'})\n\nCommits (newest first):\n${list.map((c) => `- ${c.subject}`).join('\n')}\n\n${stat ? `Files changed (summary):\n${stat.slice(0, 1500)}` : ''}`;
    const j = await llm.json([{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: 1200, temperature: 0.3, timeout: 120000 });
    const arr = (x) => (Array.isArray(x) ? x.map((y) => String(y).trim()).filter(Boolean).slice(0, 12) : []);
    const sections = { new: arr(j.new), improved: arr(j.improved), fixed: arr(j.fixed) };
    if (!sections.new.length && !sections.improved.length && !sections.fixed.length) throw new Error('The model returned empty notes.');
    return { title: String(j.title || '').trim().slice(0, 80), summary: String(j.summary || '').trim().slice(0, 300), sections };
  }

  return {
    list: (appId) => (load()[appId] || []).slice().reverse(),
    published: (appId) => (load()[appId] || []).filter((n) => n.published).slice().reverse(),
    async generate(app, { useAi = true } = {}) {
      const all = load(); const mine = all[app.id] || []; const last = mine[mine.length - 1];
      const list = await commits(app, last?.to);
      if (!list.length) throw Object.assign(new Error('Nothing new since the last release notes.'), { status: 409 });
      const to = await headOf(app);
      let stat = ''; if (!DEMO && last?.to) stat = (await git(app, ['diff', '--stat', '--stat-width=80', `${last.to}..HEAD`])).out;
      let draft = null, source = 'rules';
      if (useAi && llm?.configured()) { try { draft = await aiNotes(app, list, stat); source = 'ai'; } catch (e) { draft = null; audit(app.id, `AI release notes failed, used the rule-based writer: ${e.message}`, 'warn'); } }
      if (!draft) { const sections = plainNotes(list); draft = { title: '', summary: '', sections }; }
      const date = new Date().toISOString().slice(0, 10);
      const title = draft.title || `${app.name} update, ${date}`;
      if (!SECTIONS.some(([k]) => draft.sections[k]?.length)) throw Object.assign(new Error('The changes since the last notes are all internal (merges, dependency bumps), so there is nothing to tell users.'), { status: 409 });
      const note = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: Date.now(), date, title, from: last?.to || null, to, source, published: false, commits: list.slice(0, 40), body: renderMarkdown(title, draft.summary, draft.sections) };
      mine.push(note); all[app.id] = mine.slice(-60); save(all);
      audit(app.id, `Release notes drafted for ${app.name} (${list.length} change${list.length === 1 ? '' : 's'}, ${source === 'ai' ? 'AI' : 'rule-based'})`);
      return note;
    },
    update(appId, id, patch) {
      const all = load(); const n = (all[appId] || []).find((x) => x.id === id); if (!n) return null;
      if (typeof patch.body === 'string') n.body = patch.body.slice(0, 20000);
      if (typeof patch.title === 'string' && patch.title.trim()) n.title = patch.title.trim().slice(0, 120);
      if (typeof patch.published === 'boolean') n.published = patch.published;
      save(all); return n;
    },
    remove(appId, id) { const all = load(); const before = (all[appId] || []).length; all[appId] = (all[appId] || []).filter((x) => x.id !== id); save(all); return all[appId].length < before; },
    // Public page for published notes of one app. Escapes everything.
    page(app, notes) {
      const body = notes.length ? notes.map((n) => `<article><time>${esc(n.date)}</time>${mdToHtml(n.body)}</article>`).join('\n') : '<p class="none">No updates published yet.</p>';
      return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>What's new in ${esc(app.name)}</title><meta name="robots" content="noindex">
<style>:root{color-scheme:light dark}body{margin:0;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;background:#0b0718;color:#f1eeff}main{max-width:680px;margin:0 auto;padding:48px 20px}h1{font-size:28px;margin:0 0 4px}.sub{color:#b6acd9;margin:0 0 32px}article{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:20px 24px;margin:0 0 18px}article h1{font-size:20px}article h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#b69cff;margin:18px 0 6px}ul{margin:0;padding-left:20px}time{font:12px ui-monospace,monospace;color:#9a8fc4}.none{color:#b6acd9}@media(prefers-color-scheme:light){body{background:#f3efff;color:#1a1038}article{background:#fff;border-color:#d9d0f5}.sub,time,.none{color:#5b4f86}}</style></head>
<body><main><h1>What's new in ${esc(app.name)}</h1><p class="sub">${esc(app.tagline || '')}</p>${body}</main></body></html>`;
    },
  };
}
