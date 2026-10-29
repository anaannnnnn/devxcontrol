// Owner-approved, backup-first source editor for apps without a GitHub repository.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './docker.js';

const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.cache', 'vendor', 'uploads', 'storage']);
const SECRET_PATH = /(^|\/)(\.env(?:\..*)?|secrets?|credentials?|private|certs?)(\/|$)|\.(pem|key|p12|pfx|sqlite3?|db|dump|sql\.gz)$/i;
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.html', '.css', '.scss', '.json', '.md', '.txt', '.yml', '.yaml', '.toml', '.xml', '.svg', '.py', '.go', '.rs', '.php', '.sh', '.sql', '.prisma', '.graphql', '.env.example']);

export function makeLocalAgent({ llm, ops, monitor }) {
  const safePath = (root, rel) => {
    if (typeof rel !== 'string' || !rel.trim() || rel.length > 240 || rel.includes('\0') || path.isAbsolute(rel)) throw new Error('Invalid source file path.');
    const normalized = rel.replace(/\\/g, '/').replace(/^\.\//, '');
    if (normalized.split('/').some((x) => !x || x === '..' || x === '.')) throw new Error('Source file path must stay inside the app.');
    if (SECRET_PATH.test(normalized)) throw new Error('Secret, environment and database files cannot be read or edited by the assistant.');
    const ext = path.extname(normalized).toLowerCase();
    if (!TEXT_EXT.has(ext) && !['Dockerfile', 'Makefile', 'Caddyfile'].includes(path.basename(normalized))) throw new Error('That file type is not available to the assistant.');
    const full = path.resolve(root, normalized);
    if (!full.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Source file path must stay inside the app.');
    let parent = path.resolve(root);
    for (const part of normalized.split('/').slice(0, -1)) {
      parent = path.join(parent, part);
      try { const st = fs.lstatSync(parent); if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Source paths cannot traverse symlinked folders.'); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    return { normalized, full };
  };
  function listFiles(root) {
    const out = [];
    const walk = (dir, prefix = '') => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.') && e.name !== '.well-known') continue;
        if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (SECRET_PATH.test(rel) || e.isSymbolicLink()) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, rel);
        else if (e.isFile() && !e.name.includes('.') || e.isFile() && TEXT_EXT.has(path.extname(e.name).toLowerCase())) out.push(rel);
        if (out.length >= 400) return;
      }
    };
    walk(root);
    return out;
  }
  const treeFor = (root) => listFiles(root).slice(0, 320).join('\n');
  function readText(root, rel) {
    const { normalized, full } = safePath(root, rel);
    const st = fs.lstatSync(full);
    if (!st.isFile() || st.isSymbolicLink() || st.size > 64000) throw new Error(`Cannot read ${normalized}: it is missing, not a regular file, or over 64 KB.`);
    const data = fs.readFileSync(full);
    if (data.includes(0)) throw new Error(`Cannot read ${normalized}: it is not a text file.`);
    return data.toString('utf8');
  }
  function writeText(root, rel, content) {
    const { normalized, full } = safePath(root, rel);
    if (typeof content !== 'string' || content.length > 1000000) throw new Error(`Invalid or oversized contents for ${normalized}.`);
    let mode = 0o644;
    try { const st = fs.lstatSync(full); if (!st.isFile() || st.isSymbolicLink()) throw new Error(`${normalized} is not a regular file.`); mode = st.mode & 0o777; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const tmp = `${full}.devx-ai-tmp-${Date.now()}`;
    fs.writeFileSync(tmp, content, { flag: 'wx', mode });
    fs.renameSync(tmp, full);
    return normalized;
  }
  async function buildCopy(app, root, log) {
    const envPath = app.envPath ? path.join(root, path.basename(app.envPath)) : null;
    const result = await ops.redeploy({ ...app, path: root, envPath }, log, { pull: false, track: true });
    if (result !== 0) return result;
    await monitor.tick();
    if (monitor.status[app.id] !== 'healthy') { log(`Candidate health check is ${monitor.status[app.id] || 'unknown'}.`); return 1; }
    return 0;
  }
  async function implement({ app, request, plan, sourceSnapshot: saved, log }) {
    if (!app.path || !fs.existsSync(app.path)) throw new Error('This app source folder is unavailable. Nothing was edited.');
    const before = saved || await ops.sourceSnapshot(app, log);
    const work = path.join(path.dirname(app.path), `.devx-ai-work-${app.id}-${Date.now()}`);
    fs.mkdirSync(work, { recursive: true });
    const extract = await run('tar', ['-xzf', path.join(ops.backupDir, path.basename(before)), '-C', work], { timeout: 180000 });
    if (!extract.ok) throw new Error('Could not prepare a private work copy from the saved source backup.');
    if (app.envPath && fs.existsSync(app.envPath)) {
      const dest = path.join(work, path.basename(app.envPath));
      if (!fs.existsSync(dest)) { fs.copyFileSync(app.envPath, dest, fs.constants.COPYFILE_EXCL); fs.chmodSync(dest, 0o600); }
    }
    const tree = treeFor(work);
    const system = `You are a senior engineer editing this one local DevX Control app. The owner already approved the exact request and plan below. Inspect the provided file tree and read files before editing. Do not touch DevX Control, secrets, environment files, databases, user data, backups, generated dependencies, or files outside the app. Do not delete files. Use existing stack/design conventions. Make a complete, responsive, accessible change; respect the app's design tokens and reduced-motion settings. Return JSON only: {"readPaths":[relative path strings],"edits":[{"path":"relative path","content":"entire new file text"}],"summary":"short summary"}. If you need source context, set readPaths and return no edits. After receiving file contents, return the final edits with readPaths empty. Only edit text files listed in the project tree, or add a new text file. No commands or deployment claims.`;
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: `App: ${app.name} (${app.stack || 'stack not identified'}).\nOwner request: ${request}\nApproved plan: ${plan}\n\nProject files:\n${tree}` },
    ];
    let edits = null, summary = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const answer = await llm.json(messages, { maxTokens: 5000, temperature: 0.15, timeout: 180000 });
      summary = String(answer.summary || summary).slice(0, 600);
      const reads = Array.isArray(answer.readPaths) ? answer.readPaths.slice(0, 8) : [];
      const proposed = Array.isArray(answer.edits) ? answer.edits : [];
      if (reads.length) {
        const context = [];
        for (const rel of reads) { try { context.push(`--- ${rel} ---\n${readText(work, rel)}`); } catch (e) { context.push(`--- ${rel} ---\nREAD ERROR: ${e.message}`); } }
        messages.push({ role: 'assistant', content: JSON.stringify(answer) }, { role: 'user', content: `Requested source context:\n\n${context.join('\n\n').slice(0, 48000)}\n\nNow provide the complete approved edits.` });
        continue;
      }
      if (!proposed.length || proposed.length > 20) throw new Error('The model did not produce a bounded set of file edits. Nothing was deployed.');
      const changed = new Set(); let total = 0;
      edits = proposed.map((x) => {
        const { normalized } = safePath(work, x.path);
        if (changed.has(normalized)) throw new Error(`The model returned ${normalized} more than once.`);
        changed.add(normalized); total += String(x.content || '').length;
        return { path: normalized, content: x.content };
      });
      if (total > 2000000) throw new Error('The proposed source change is too large; nothing was deployed.');
      break;
    }
    if (!edits) throw new Error('The model did not finish inspecting the app source. Nothing was deployed.');
    for (const e of edits) writeText(work, e.path, e.content);
    log(`Prepared ${edits.length} approved source edit${edits.length === 1 ? '' : 's'} in an isolated build copy${summary ? `: ${summary}` : ''}.`);
    let code = await buildCopy(app, work, log);
    if (code !== 0) {
      log('Candidate failed build or health checks. Rebuilding the unchanged live source.');
      const restore = await ops.redeploy(app, log, { pull: false, track: false });
      await monitor.tick();
      if (restore === 0 && monitor.status[app.id] === 'healthy') log('Original source remains in place and the prior app is healthy.');
      throw new Error('The candidate did not pass build and health checks; the original app source was kept.');
    }
    // Persist only approved files after the isolated candidate is live and healthy.
    for (const e of edits) writeText(app.path, e.path, e.content);
    log(`Done. ${app.name} is healthy at ${app.urls[0]?.url || 'its configured URL'}.`);
    return 0;
  }
  return { implement, treeFor };
}
