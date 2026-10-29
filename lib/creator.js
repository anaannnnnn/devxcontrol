// AI app creator: a plain-language description becomes a small working app. The AI writes the source files only; the Dockerfile
// is ours, so the model cannot touch the build or the runtime. Every attempt is validated, built, and smoke-tested in a locked-down
// container (no network, capped memory), and failures are fed back to the model so it can repair its own work.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { run } from './docker.js';
import { STARTERS, starterFiles, pickStarter } from './starters.js';

const DEMO = !!process.env.DEMO;
export const TEMPLATES = {
  static: { label: 'Website (static)', port: 80, health: '/', entry: 'index.html', note: 'HTML, CSS and browser JavaScript only. No server code.' },
  node: { label: 'Web app with a server', port: 3000, health: '/healthz', entry: 'server.js', note: 'Node 22 with only built-in modules (http, fs, crypto, url). No npm packages. Saves data as JSON files in ./data.' },
};
export const dockerfileFor = (tpl) => (tpl === 'static'
  ? 'FROM nginx:1.27-alpine\nCOPY . /usr/share/nginx/html\nRUN rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/.dockerignore\nEXPOSE 80\nHEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1\n'
  : 'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nRUN mkdir -p /app/data && chown -R node:node /app\nENV NODE_ENV=production PORT=3000\nEXPOSE 3000\nUSER node\nHEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1\nCMD ["node", "server.js"]\n');
const DOCKERIGNORE = 'node_modules\n.git\n.env\ndata\n';

const PATH_OK = /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,80}$/;
const RESERVED = /^(dockerfile|\.dockerignore|\.env.*|docker-compose.*)$/i;
const BANNED = [[/child_process/, 'uses child_process'], [/\beval\s*\(/, 'uses eval'], [/new\s+Function\s*\(/, 'uses new Function'], [/process\.binding|process\.dlopen/, 'uses native bindings']];

/** Pure validation of the model's file list. Returns { files, errors }. */
export function validateFiles(raw, tpl) {
  const errors = []; const files = []; const seen = new Set();
  if (!Array.isArray(raw) || !raw.length) return { files, errors: ['The reply had no files.'] };
  if (raw.length > 30) errors.push('Too many files (max 30). Combine them.');
  let total = 0;
  for (const f of raw.slice(0, 30)) {
    const p = String(f?.path || '').replace(/^\.\//, ''); const c = typeof f?.content === 'string' ? f.content : '';
    if (!PATH_OK.test(p) || p.includes('..') || p.includes('//') || p.endsWith('/')) { errors.push(`Bad file path "${p.slice(0, 60)}". Use simple relative paths.`); continue; }
    if (RESERVED.test(path.basename(p))) { errors.push(`Do not write ${p}. The platform provides it.`); continue; }
    if (seen.has(p)) { errors.push(`${p} is listed twice.`); continue; } seen.add(p);
    if (c.length > 150000) { errors.push(`${p} is too large.`); continue; } total += c.length; if (c.includes('\0')) { errors.push(`${p} contains binary data.`); continue; }
    if (/\.(js|mjs|cjs)$/.test(p)) for (const [re, why] of BANNED) if (re.test(c)) errors.push(`${p} ${why}, which is not allowed.`);
    if (p.endsWith('.json')) { try { JSON.parse(c); } catch (e) { errors.push(`${p} is not valid JSON: ${e.message}`); continue; } }
    files.push({ path: p, content: c });
  }
  if (total > 600000) errors.push('The app is too large (max 600 KB).');
  const t = TEMPLATES[tpl]; if (t && !seen.has(t.entry)) errors.push(`${t.entry} is required.`);
  if (tpl === 'node') { const pk = files.find((f) => f.path === 'package.json'); if (pk) { const j = JSON.parse(pk.content); if (Object.keys(j.dependencies || {}).length) errors.push('No npm packages are available. Remove dependencies and use built-in modules.'); } }
  return { files, errors };
}

export const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

const SYS = (tpl) => `You are a senior developer who builds small, polished, working web apps from a description. Reply with JSON only: {"name": string (2-4 words), "tagline": string (one sentence), "files": [{"path": string, "content": string}]}.
Rules: ${TEMPLATES[tpl].note} The entry file is ${TEMPLATES[tpl].entry}.${tpl === 'node' ? ' The server listens on process.env.PORT || 3000 and answers GET /healthz with 200 and the text ok. Use CommonJS (require). Escape all user input before putting it in HTML. Validate request bodies and limit their size.' : ''} Mobile-friendly, accessible (labels, contrast, keyboard focus), semantic HTML, a modern clean design with CSS variables and a dark/light switch via prefers-color-scheme. No external CDNs, fonts or images; everything is inline or in your files. Do not write a Dockerfile. Keep it to what was asked; make it actually work, not a mockup.`;

const PLAN_SYS = (tpl) => `You plan small web apps. Reply with JSON only: {"name": string (2-4 words), "tagline": string (one sentence), "files": [{"path": string, "purpose": string}]}. ${TEMPLATES[tpl].note} The entry file ${TEMPLATES[tpl].entry} must be first. At most ${tpl === 'node' ? 5 : 4} files, each under 250 lines. ${tpl === 'node' ? 'Use server.js plus public/index.html (and optionally public/app.js, public/style.css). The server serves files from ./public.' : 'Use index.html plus optionally style.css and app.js.'} No Dockerfile, no package.json dependencies.`;
const FILE_SYS = (tpl) => `You are a senior developer writing ONE file of a small web app. ${TEMPLATES[tpl].note}${tpl === 'node' ? ' Server: CommonJS (require), listens on process.env.PORT || 3000, GET /healthz returns 200 "ok", serves ./public, JSON API under /api, saves data to ./data/*.json (create the folder), escapes user input, limits request body size.' : ''} Mobile-friendly, accessible (labels, contrast, focus), modern clean design with CSS variables and prefers-color-scheme dark mode. No external CDNs, fonts or images. Make it really work, not a mockup. Output ONLY the complete file content inside one fenced code block, no explanation.`;
const fence = (t) => { const m = /```[\w.+-]*\n([\s\S]*?)```/.exec(t) || /```[\w.+-]*\n([\s\S]*)$/.exec(t); return (m ? m[1] : t).replace(/\s+$/, '') + '\n'; };

export function makeCreator({ llm, dataDir, exec = run, audit = () => {} }) {
  const root = path.join(dataDir, 'creator');
  const dirOf = (id) => path.join(root, id);

  // Small requests instead of one huge one: a plan, then each file on its own. Works within strict per-minute token limits.
  async function plan(spec, tpl) {
    const p = await llm.json([{ role: 'system', content: PLAN_SYS(tpl) }, { role: 'user', content: `App: ${spec}` }], { maxTokens: 1200, temperature: 0.3, timeout: 180000 });
    let files = (Array.isArray(p.files) ? p.files : []).map((f) => ({ path: String(f?.path || '').replace(/^\.\//, ''), purpose: String(f?.purpose || '').slice(0, 200) })).filter((f) => PATH_OK.test(f.path) && !RESERVED.test(path.basename(f.path)));
    const entry = TEMPLATES[tpl].entry; files = files.filter((f, i) => files.findIndex((x) => x.path === f.path) === i);
    if (!files.some((f) => f.path === entry)) files.unshift({ path: entry, purpose: 'main file' });
    files.sort((a, b) => (a.path === entry ? -1 : b.path === entry ? 1 : 0));
    return { name: String(p.name || '').slice(0, 60), tagline: String(p.tagline || '').slice(0, 140), files: files.slice(0, 6) };
  }
  async function writeOne(spec, tpl, pl, f, done, problem) {
    const ctx = done.map((d) => `--- ${d.path} (already written, do not repeat) ---\n${d.content.slice(0, 2200)}`).join('\n');
    const msgs = [{ role: 'system', content: FILE_SYS(tpl) }, { role: 'user', content: `App: ${spec}\nFiles in this app: ${pl.files.map((x) => `${x.path} (${x.purpose})`).join('; ')}\n${ctx ? `${ctx}\n` : ''}Now write ${f.path}. Make sure it fits with the other files (same element ids, same API routes).` }];
    if (problem) msgs.push({ role: 'assistant', content: `\`\`\`\n${problem.content.slice(0, 6000)}\n\`\`\`` }, { role: 'user', content: `That version has a problem:\n${problem.error.slice(0, 1500)}\nReturn the complete corrected ${f.path} in one code block.` });
    return fence(await llm.chat(msgs, { maxTokens: 3500, temperature: 0.25, timeout: 300000 }));
  }
  const fileProblem = (p, c) => {
    if (/\.html?$/.test(p) && !/<\/html>\s*$/i.test(c)) return 'The file looks cut off: it does not end with </html>. Make it shorter and complete.';
    if (/\.(js|mjs|cjs)$/.test(p)) for (const [re, why] of BANNED) if (re.test(c)) return `Uses something not allowed: ${why}.`;
    if (p.endsWith('.json')) { try { JSON.parse(c); } catch (e) { return `Not valid JSON: ${e.message}`; } }
    return '';
  };
  async function aiBuild(spec, tpl, log, prior) {
    log('Planning the app ...'); const pl = await plan(spec, tpl); log(`Plan: ${pl.files.map((f) => f.path).join(', ')}`);
    const done = prior?.done || [];
    for (const f of pl.files) {
      if (done.some((d) => d.path === f.path)) continue;
      log(`Writing ${f.path} ...`); let content = await writeOne(spec, tpl, pl, f, done); let pr = fileProblem(f.path, content);
      for (let i = 0; pr && i < 2; i++) { log(`Fixing ${f.path}: ${pr.slice(0, 100)}`); content = await writeOne(spec, tpl, pl, f, done, { content, error: pr }); pr = fileProblem(f.path, content); }
      done.push({ path: f.path, content });
    }
    return { pl, done };
  }
  async function repairFiles(spec, tpl, built, errors, log) {
    const text = errors.join('\n'); const entry = TEMPLATES[tpl].entry;
    const hit = built.done.filter((d) => text.includes(d.path)); const targets = hit.length ? hit : built.done.filter((d) => d.path === entry);
    for (const d of targets.slice(0, 2)) { log(`Fixing ${d.path} ...`); const others = built.done.filter((x) => x.path !== d.path); d.content = await writeOne(spec, tpl, built.pl, { path: d.path }, others, { content: d.content, error: text }); }
  }

  async function write(id, files, tpl) {
    const dir = dirOf(id); await fsp.mkdir(path.dirname(dir), { recursive: true });
    await fsp.mkdir(dir, { recursive: false });
    for (const f of files) { const p = path.join(dir, f.path); await fsp.mkdir(path.dirname(p), { recursive: true }); await fsp.writeFile(p, f.content, { flag: 'wx' }); }
    await fsp.writeFile(path.join(dir, 'Dockerfile'), dockerfileFor(tpl), { flag: 'wx' }); await fsp.writeFile(path.join(dir, '.dockerignore'), DOCKERIGNORE, { flag: 'wx' });
    return dir;
  }

  async function syntax(dir, files) {
    const errs = [];
    for (const f of files.filter((x) => /\.(js|mjs|cjs)$/.test(x.path) && !/^(public|static|www|assets)\//.test(x.path) || x.path === 'server.js')) {
      const r = await exec('node', ['--check', path.join(dir, f.path)], { timeout: 15000 });
      if (!r.ok) errs.push(`${f.path}: ${(r.err || r.out || 'syntax error').trim().split('\n').slice(0, 4).join(' ')}`);
    }
    return errs;
  }

  // Build the image and run it with no network, 256 MB, and ask it for its health URL. Returns [] when healthy, else the problems.
  async function smoke(id, dir, tpl, log) {
    const t = TEMPLATES[tpl], tag = `devx-create-${id}`, name = `${tag}-smoke`;
    const b = await exec('docker', ['build', '-q', '-t', tag, dir], { timeout: 300000 }); if (!b.ok) return [`Docker build failed: ${(b.err || b.out).trim().split('\n').slice(-6).join(' | ')}`];
    await exec('docker', ['rm', '-f', name], { timeout: 20000 });
    const r = await exec('docker', ['run', '-d', '--name', name, '--network', 'none', '--memory', '256m', '--cpus', '0.5', '--pids-limit', '128', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', tag], { timeout: 60000 });
    if (!r.ok) return [`Could not start the container: ${(r.err || '').trim().split('\n').pop()}`];
    try {
      let last = '';
      for (let i = 0; i < 12; i++) {
        await new Promise((ok) => setTimeout(ok, 1500));
        const st = await exec('docker', ['inspect', '-f', '{{.State.Running}}', name], { timeout: 15000 });
        if (st.out.trim() !== 'true') break;
        const g = await exec('docker', ['exec', name, 'wget', '-qO-', '-T', '3', `http://127.0.0.1:${t.port}${t.health}`], { timeout: 15000 });
        if (g.ok) { log('Smoke test passed: the app answered.'); return []; } last = (g.err || g.out || '').trim();
      }
      const lg = await exec('docker', ['logs', '--tail', '40', name], { timeout: 15000 });
      return [`The app did not answer ${t.health} on port ${t.port}. ${last}\nContainer log:\n${(lg.out + lg.err).trim().slice(-1500)}`];
    } finally { await exec('docker', ['rm', '-f', name], { timeout: 20000 }); await exec('docker', ['rmi', '-f', tag], { timeout: 30000 }); }
  }

  const demoApp = (spec, tpl) => ({ name: spec.split(/\s+/).slice(0, 3).join(' ') || 'Demo app', tagline: 'Generated in demo mode', files: [{ path: tpl === 'node' ? 'server.js' : 'index.html', content: tpl === 'node' ? "require('http').createServer((q,s)=>{s.end(q.url==='/healthz'?'ok':'<h1>Demo</h1>')}).listen(process.env.PORT||3000)" : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demo</title></head><body><h1>${String(spec).slice(0, 60).replace(/[<&]/g, '')}</h1></body></html>` }] });

  return {
    TEMPLATES, STARTERS, dirOf,
    /** Starter: no AI. Otherwise plan + per-file AI writing with test-and-repair. If the AI cannot deliver, the closest starter is used so you always get a working app. */
    async generate({ spec, template = 'static', id, starter, name }, log) {
      const text = String(spec || '').trim(); const finish = async (out, tpl, extra = {}) => {
        const v = validateFiles(out.files, tpl); if (v.errors.length) throw new Error(v.errors.join(' '));
        const baseId = id || slug(out.name) || 'app'; let aid = baseId, suffix = 2;
        while (fs.existsSync(dirOf(aid))) aid = `${baseId}-${suffix++}`;
        const dir = await write(aid, v.files, tpl); log(`Wrote ${v.files.length} file${v.files.length === 1 ? '' : 's'}. Checking syntax ...`);
        let errors = DEMO ? [] : await syntax(dir, v.files);
        if (!errors.length && !DEMO) { log('Building and testing in an isolated container ...'); errors = await smoke(aid, dir, tpl, log); }
        return { errors, aid, v };
      };
      const record = async (aid, out, v, tpl, extra) => {
        const result = { id: aid, name: String(out.name || aid).slice(0, 60), tagline: String(out.tagline || '').slice(0, 140), template: tpl, files: v.files.map((f) => f.path), spec: text, at: Date.now(), ...extra };
        await fsp.writeFile(path.join(dirOf(aid), '.devx-draft.json'), JSON.stringify(result)); audit(aid, `Created a draft app "${result.name}"`); log(`Done. "${result.name}" is ready to review and deploy.`); return result;
      };
      const useStarter = async (sid, why) => {
        const s = starterFiles(sid, name); if (!s) throw Object.assign(new Error('Unknown starter.'), { status: 400 });
        log(why || `Using the "${STARTERS.find((x) => x.id === sid).label}" starter (no AI needed).`);
        const r = await finish(s, s.template); if (r.errors.length) throw new Error(`The starter failed its test: ${r.errors[0].slice(0, 300)}`);
        return record(r.aid, s, r.v, s.template, { starter: sid, ...(why ? { fallback: true } : {}) });
      };
      if (starter) return useStarter(starter);
      const tpl = TEMPLATES[template] ? template : 'static';
      if (text.length < 12) throw Object.assign(new Error('Describe the app in a sentence or two.'), { status: 400 });
      if (text.length > 3000) throw Object.assign(new Error('Keep the description under 3000 characters.'), { status: 400 });
      const fallback = (why) => useStarter(pickStarter(text), `The AI could not finish (${String(why).slice(0, 160)}). So you still get something that works, using the closest ready-made starter. You can edit it afterwards with Autopilot.`);
      if (!DEMO && !llm.configured()) return fallback('no AI model is connected');
      let built = null, errors = [], lastErr = '';
      try {
        for (let attempt = 1; attempt <= 3; attempt++) {
          if (DEMO) { const d = demoApp(text, tpl); const r = await finish(d, tpl); return record(r.aid, d, r.v, tpl, {}); }
          if (!built) built = await aiBuild(text, tpl, log); else { log(`Attempt ${attempt}: fixing ${errors.length} problem${errors.length === 1 ? '' : 's'} ...`); await repairFiles(text, tpl, built, errors, log); }
          const out = { name: built.pl.name || slug(text.slice(0, 30)), tagline: built.pl.tagline, files: built.done };
          const vv = validateFiles(out.files, tpl);
          if (vv.errors.length) { errors = vv.errors; lastErr = errors[0]; for (const e of errors.slice(0, 6)) log(`Problem: ${e.slice(0, 200)}`); continue; }
          const r = await finish(out, tpl); errors = r.errors; lastErr = errors[0] || '';
          if (!errors.length) return record(r.aid, out, r.v, tpl, {});
          for (const e of errors.slice(0, 6)) log(`Problem: ${e.split('\n')[0].slice(0, 200)}`);
        }
      } catch (e) { lastErr = e.message; log(`AI error: ${e.message.slice(0, 240)}`); }
      return fallback(lastErr || 'it did not pass its own test');
    },
    async draft(id) {
      try { const m = JSON.parse(await fsp.readFile(path.join(dirOf(id), '.devx-draft.json'), 'utf8')); const files = []; for (const f of m.files) files.push({ path: f, content: await fsp.readFile(path.join(dirOf(id), f), 'utf8') }); return { ...m, source: files }; } catch { return null; }
    },
    async drafts() { try { const out = []; for (const d of await fsp.readdir(root)) { try { out.push(JSON.parse(await fsp.readFile(path.join(root, d, '.devx-draft.json'), 'utf8'))); } catch { /* skip */ } } return out.sort((a, b) => b.at - a.at); } catch { return []; } },
    scanFor(m) { const t = TEMPLATES[m.template]; return { deployable: true, port: t.port, health: t.health, env: [], services: [], composeFile: null, hasDockerfile: true, tagline: m.tagline, stack: `${t.label} · AI created` }; },
    async discard(id) { await fsp.rm(dirOf(id), { recursive: true, force: true }); },
  };
}
