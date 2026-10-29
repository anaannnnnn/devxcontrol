// Deterministic site edits that need no AI: add stylesheet/script files in the right place for the project, link them from every page
// (or import them in framework entry files), and swap exact HTML snippets. Used by themes and the component library so they work
// even when no AI model is connected. Returns the list of changed paths; throws a plain-language error if it cannot place things.
import fs from 'node:fs';
import path from 'node:path';

const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|out|coverage|vendor|\.venv|venv)(\/|$)/;
function walk(dir, rel = '', out = [], depth = 0) {
  if (depth > 6 || out.length > 3000) return out;
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; if (SKIP.test(r)) continue; if (e.isDirectory()) walk(dir, r, out, depth + 1); else out.push(r); }
  return out;
}
const read = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
const write = (d, f, c) => { const p = path.join(d, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const okPath = (p) => /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,100}$/.test(p) && !p.includes('..');
const rel = (fromFile, toFile) => { const a = path.dirname(fromFile).split('/').filter((x) => x && x !== '.'); const b = toFile.split('/'); let i = 0; while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++; return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/'); };

/** Where do pages live in this project? */
export function detectLayout(dir) {
  const files = walk(dir); const pkg = (() => { try { return JSON.parse(read(dir, 'package.json')); } catch { return {}; } })();
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const html = files.filter((f) => /\.(html?|ejs|hbs|njk|jinja2?|twig|erb|php|liquid|pug)$/i.test(f) && !/^(test|tests|spec|__tests__)\//.test(f));
  const withHead = html.filter((f) => /<\/head>/i.test(read(dir, f)));
  const nextLayout = files.find((f) => /^(src\/)?app\/layout\.(tsx|jsx|js|ts)$/.test(f)); const nextApp = files.find((f) => /^(src\/)?pages\/_app\.(tsx|jsx|js|ts)$/.test(f));
  const spaEntry = files.find((f) => /^src\/(main|index)\.(tsx|jsx|js|ts)$/.test(f));
  if (deps.next && nextLayout) return { kind: 'next-app', entry: nextLayout, assetDir: path.dirname(nextLayout) };
  if (deps.next && nextApp) return { kind: 'next-pages', entry: nextApp, assetDir: path.dirname(nextApp) };
  const hasPublic = files.some((f) => f.startsWith('public/'));
  if ((deps.vite || deps['react-scripts'] || deps['@vitejs/plugin-react'] || deps.vue || deps.svelte) && withHead.length && hasPublic) return { kind: 'spa-public', pages: withHead.filter((f) => !f.startsWith('public/') || f === 'public/index.html'), assetDir: 'public', href: '/' };
  if (withHead.length && files.some((f) => /^static\//.test(f)) && withHead.some((f) => /templates?\//.test(f))) return { kind: 'templates', pages: withHead.filter((f) => /templates?\//.test(f)), assetDir: 'static', href: '/static/' };
  if (withHead.length) { const dirs = withHead.map((f) => path.dirname(f)); const top = dirs.sort((a, b) => (a === '.' ? 0 : a.split('/').length) - (b === '.' ? 0 : b.split('/').length))[0]; return { kind: 'static', pages: withHead, assetDir: top === '.' ? '' : top }; }
  if (spaEntry) return { kind: 'spa-entry', entry: spaEntry, assetDir: path.dirname(spaEntry) };
  return { kind: 'unknown' };
}
const MARK = 'devx-assets';
const tagFor = (name, href) => (name.endsWith('.js') ? `<script src="${href}" defer></script>` : `<link rel="stylesheet" href="${href}">`);

/** det = { assets:[{name,content}], replacements:[{from,to}], explain }. Link/script names must be plain file names. */
export function applyDet(dir, det, log = () => {}) {
  const changed = new Set(); const assets = det.assets || []; for (const a of assets) if (!/^[a-z0-9][a-z0-9.-]{0,40}\.(css|js)$/i.test(a.name)) throw new Error('Unsafe file name.');
  for (const a of assets) if (a.content.length > 900000) throw new Error(`${a.name} is too large to add.`);
  if (assets.length) {
    const L = detectLayout(dir); log('info', 'detect', `Project type: ${L.kind}`);
    if (L.kind === 'unknown') throw new Error('Could not find where this project\'s pages live (no HTML page with a </head>, and no framework entry file). Use "Copy code" and add the stylesheet by hand.');
    const place = (name) => path.posix.join(L.assetDir || '', name);
    for (const a of assets) { const f = place(a.name); if (!okPath(f)) throw new Error('Unsafe file path.'); write(dir, f, a.content); changed.add(f); }
    if (L.kind === 'next-app' || L.kind === 'next-pages' || L.kind === 'spa-entry') {
      let src = read(dir, L.entry);
      for (const a of assets.filter((x) => x.name.endsWith('.css'))) { const line = `import './${a.name}';`; const f2 = L.kind === 'next-pages' ? `import '${rel(L.entry, place(a.name))}';` : line; if (!src.includes(a.name)) src = `${f2}\n${src}`; }
      for (const a of assets.filter((x) => x.name.endsWith('.js'))) { const line = L.kind === 'next-pages' ? `import '${rel(L.entry, place(a.name))}';` : `import './${a.name}';`; if (!src.includes(a.name)) src = `${line}\n${src}`; }
      write(dir, L.entry, src); changed.add(L.entry);
    } else {
      for (const page of L.pages) {
        let html = read(dir, page); let touched = false;
        for (const a of assets) {
          if (html.includes(`${MARK}="${a.name}"`)) { continue; }
          const href = L.kind === 'spa-public' || L.kind === 'templates' ? `${L.href}${a.name}` : rel(page, place(a.name));
          const t = tagFor(a.name, href).replace(/^<(link|script)/, `<$1 ${MARK}="${a.name}"`);
          html = html.replace(/<\/head>/i, `${t}\n</head>`); touched = true;
        }
        if (touched) { write(dir, page, html); changed.add(page); }
      }
    }
  }
  for (const r of det.replacements || []) {
    const from = String(r.from || '').trim(); if (from.length < 8) continue;
    const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+').replace(/></g, '>\\s*<'));
    let done = false;
    for (const f of walk(dir).filter((x) => /\.(html?|ejs|hbs|njk|php|erb|jsx|tsx|vue|svelte)$/i.test(x))) { const src = read(dir, f); if (re.test(src)) { write(dir, f, src.replace(re, () => r.to)); changed.add(f); done = true; break; } }
    if (!done) throw new Error('Could not find that exact section in the source files (the page is probably built by code). Use "Send to Autopilot" with AI, or copy the code.');
  }
  return [...changed];
}
