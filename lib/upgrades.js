// Upgrade scanner: reads an app's checkout and suggests design, accessibility, SEO, performance and feature upgrades.
// Checks are deterministic file reads (no network). When an AI model is connected it also proposes feature ideas.
// "Apply" hands a suggestion to the Autopilot task pipeline, so every change still goes through review.
import fs from 'node:fs';
import path from 'node:path';

const DEMO = !!process.env.DEMO;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', 'coverage', '.venv', '__pycache__', 'data']);
const WEB = /\.(html?|css|scss|jsx?|tsx?|vue|svelte|php|ejs|hbs|njk)$/i;
const HTML = /\.(html?|ejs|hbs|njk|php|vue|svelte|jsx|tsx)$/i;
const CSS = /\.(css|scss)$/i;
const RANK = { High: 3, Med: 2, Low: 1 };

function walk(root, max = 600) {
  const out = []; const stack = [root];
  while (stack.length && out.length < max) {
    const d = stack.pop(); let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      if (e.isDirectory()) { if (!SKIP.has(e.name)) stack.push(path.join(d, e.name)); }
      else if (e.isFile()) out.push(path.relative(root, path.join(d, e.name)));
    }
  }
  return out;
}
const read = (root, f, n = 200000) => { try { return fs.readFileSync(path.join(root, f), 'utf8').slice(0, n); } catch { return ''; } };

// Old major versions worth moving off, with the reason in plain words.
const OLD_DEPS = {
  jquery: [(v) => v < 3, 'jQuery 1 and 2 have known security problems.'], moment: [() => true, 'Moment is in maintenance mode; date-fns or Temporal are lighter.'],
  request: [() => true, 'The request package is deprecated.'], bootstrap: [(v) => v < 5, 'Bootstrap 3 and 4 look dated and need jQuery.'],
  'node-sass': [() => true, 'node-sass is deprecated; use sass.'], 'react-scripts': [() => true, 'Create React App is no longer maintained; Vite is the usual move.'],
  angular: [() => true, 'AngularJS reached end of life.'], express: [(v) => v < 4, 'Express 3 is unsupported.'], 'body-parser': [() => true, 'Express has body parsing built in.'],
};
const major = (spec) => { const m = /(\d+)/.exec(String(spec)); return m ? Number(m[1]) : 99; };

export function scanTree(root, files = walk(root)) {
  const sug = []; const add = (id, area, title, why, impact, effort, evidence = []) => sug.push({ id, area, title, why, impact, effort, evidence: evidence.slice(0, 5) });
  const has = (re) => files.some((f) => re.test(f));
  const web = files.filter((f) => WEB.test(f)); const html = files.filter((f) => HTML.test(f)); const css = files.filter((f) => CSS.test(f));
  const htmlText = html.slice(0, 80).map((f) => [f, read(root, f)]); const cssText = css.slice(0, 60).map((f) => [f, read(root, f)]);
  const anyHtml = (re) => htmlText.some(([, t]) => re.test(t)); const anyCss = (re) => cssText.some(([, t]) => re.test(t));
  const pkg = (() => { try { return JSON.parse(read(root, 'package.json')); } catch { return null; } })();

  if (web.length) {
    const pages = htmlText.filter(([f, t]) => /<html[\s>]/i.test(t) || /<head[\s>]/i.test(t));
    if (pages.length) {
      const miss = (re) => pages.filter(([, t]) => !re.test(t)).map(([f]) => f);
      let m;
      if ((m = miss(/<meta[^>]+name=["']viewport["']/i)).length) add('viewport', 'Frontend', 'Make pages scale properly on phones', 'Without a viewport tag, phones show a shrunken desktop page that visitors have to pinch and zoom.', 'High', 'Low', m);
      if ((m = miss(/<html[^>]+\blang=/i)).length) add('lang', 'Accessibility', 'Declare the page language', 'Screen readers and translation tools guess the language when it is missing, and often guess wrong.', 'Med', 'Low', m);
      if ((m = miss(/<title>[^<]{2,}/i)).length) add('title', 'SEO', 'Give every page a title', 'The title is the headline in search results and browser tabs.', 'Med', 'Low', m);
      if ((m = miss(/<meta[^>]+name=["']description["']/i)).length) add('description', 'SEO', 'Add meta descriptions', 'Search engines show this text under your link. Without it they pick random page text.', 'Med', 'Low', m);
      if ((m = miss(/property=["']og:/i)).length) add('og', 'SEO', 'Add social share previews', 'Links shared in chats and social apps show a bare URL instead of a title and image.', 'Low', 'Low', m);
      if (!anyHtml(/rel=["'](shortcut )?icon["']/i) && !has(/favicon\./i)) add('favicon', 'Frontend', 'Add a favicon', 'Browsers show a blank tab icon and request /favicon.ico on every visit.', 'Low', 'Low');
    }
    const imgNoAlt = htmlText.filter(([, t]) => /<img\b(?![^>]*\balt=)[^>]*>/i.test(t)).map(([f]) => f);
    if (imgNoAlt.length) add('alt', 'Accessibility', 'Add alt text to images', 'Screen reader users hear nothing for these images, and search engines cannot index them.', 'High', 'Low', imgNoAlt);
    const lazy = htmlText.filter(([, t]) => /<img\b(?![^>]*loading=)[^>]*>/i.test(t) && (t.match(/<img\b/gi) || []).length > 3).map(([f]) => f);
    if (lazy.length) add('lazy', 'Performance', 'Lazy-load images below the fold', 'Pages with many images download all of them up front, which slows the first view.', 'Med', 'Low', lazy);
    if (css.length) {
      if (!anyCss(/@media[^{]*max-width|@media[^{]*min-width|clamp\(|container-type/i) && !has(/tailwind/i) && !(pkg && /tailwind|bootstrap/.test(JSON.stringify(pkg.dependencies || {}) + JSON.stringify(pkg.devDependencies || {})))) add('responsive', 'Frontend', 'Add responsive layout rules', 'No breakpoints were found, so the layout is likely fixed-width and breaks on phones.', 'High', 'Med', css.slice(0, 3));
      if (!anyCss(/prefers-color-scheme|\.dark\b|\[data-theme/i)) add('dark', 'Design', 'Add a dark mode', 'Most phones now default to dark. A light-only app is harsh at night, and a theme switch is now expected.', 'Med', 'Med', css.slice(0, 3));
      if (anyCss(/animation|transition|@keyframes/i) && !anyCss(/prefers-reduced-motion/i)) add('motion', 'Accessibility', 'Respect "reduce motion"', 'People with vestibular disorders turn this setting on. Animations that ignore it can make them ill.', 'Med', 'Low', css.slice(0, 3));
      const focusKill = cssText.filter(([, t]) => /outline\s*:\s*(none|0)\b/i.test(t) && !/:focus-visible/i.test(t)).map(([f]) => f);
      if (focusKill.length) add('focus', 'Accessibility', 'Restore visible keyboard focus', 'Outlines are removed without a replacement, so keyboard users cannot see where they are.', 'High', 'Low', focusKill);
      const px = cssText.reduce((n, [, t]) => n + (t.match(/font-size\s*:\s*\d+px/gi) || []).length, 0), rem = cssText.reduce((n, [, t]) => n + (t.match(/font-size\s*:\s*[\d.]+(rem|em)/gi) || []).length, 0);
      if (px > 8 && rem < px / 4) add('rem', 'Accessibility', 'Use relative font sizes', 'Fixed pixel sizes ignore the text size people set in their browser or phone.', 'Low', 'Med', css.slice(0, 3));
      if (!anyCss(/--[a-z-]+\s*:/i) && cssText.reduce((n, [, t]) => n + (t.match(/#[0-9a-f]{3,8}\b/gi) || []).length, 0) > 25) add('tokens', 'Design', 'Move colors into design tokens', 'Colors are repeated as raw values, so re-theming or adding dark mode means editing everything. CSS variables fix that.', 'Med', 'Med', css.slice(0, 3));
      if (cssText.some(([, t]) => /\bfloat\s*:\s*(left|right)/i.test(t)) && !anyCss(/display\s*:\s*(grid|flex)/i)) add('layout', 'Design', 'Replace floats with flexbox or grid', 'Float layouts are brittle and a sign of a dated design; flex and grid are simpler and responsive.', 'Low', 'Med', css.slice(0, 3));
    }
    if (html.length && !has(/manifest\.(webmanifest|json)$/i) && !has(/service-?worker|sw\.js$/i)) add('pwa', 'Feature', 'Make it installable (PWA)', 'A web manifest lets people add the app to their home screen and open it full-screen like a native app.', 'Med', 'Med');
    if (html.length && !has(/(^|\/)robots\.txt$/i)) add('robots', 'SEO', 'Add robots.txt and a sitemap', 'Search engines look for these first. Without them, indexing is slower and less complete.', 'Low', 'Low');
  }

  if (pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }; const old = [];
    for (const [n, spec] of Object.entries(deps)) { const o = OLD_DEPS[n]; if (o && o[0](major(spec))) old.push(`${n}@${spec}: ${o[1]}`); }
    if (old.length) add('olddeps', 'Dependencies', 'Replace outdated libraries', old.length === 1 ? old[0] : `${old.length} libraries are old or deprecated.`, 'High', 'Med', old);
    if (!pkg.scripts?.test || /no test specified/.test(pkg.scripts.test)) add('tests', 'Quality', 'Add automated tests', 'There is no test command, so every change is checked by hand and regressions reach users.', 'High', 'High');
    if (!pkg.engines) add('engines', 'Infrastructure', 'Pin the Node version', 'Without "engines" and a lockfile, a rebuild can silently pick a different Node and break.', 'Low', 'Low');
    if (!has(/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/)) add('lockfile', 'Dependencies', 'Commit a lockfile', 'Without a lockfile every build can install different versions, so the same code behaves differently over time.', 'Med', 'Low');
  }
  if (!has(/^\.github\/workflows\//)) add('ci', 'Infrastructure', 'Add CI to check every change', 'Nothing runs automatically on pushes, so broken code can be deployed.', 'Med', 'Low');
  if (!has(/(^|\/)README(\.md)?$/i)) add('readme', 'Docs', 'Write a README', 'New teammates and future you have nothing explaining how to run or deploy this.', 'Low', 'Low');
  if (has(/(^|\/)Dockerfile$/) && !files.some((f) => /Dockerfile$/.test(f) && /HEALTHCHECK/.test(read(root, f)))) add('healthcheck', 'Infrastructure', 'Add a container health check', 'Without HEALTHCHECK, Docker cannot tell a hung app from a healthy one and will not restart it.', 'Med', 'Low', files.filter((f) => /Dockerfile$/.test(f)));
  if (has(/(^|\/)\.env$/) && !has(/\.env\.(example|sample)$/)) add('envexample', 'Docs', 'Document environment variables', 'A .env exists but no .env.example, so nobody knows which settings are required.', 'Low', 'Low');
  return sug.sort((a, b) => RANK[b.impact] - RANK[a.impact] || RANK[a.effort] - RANK[b.effort]);
}

const DEMO_SUG = [
  { id: 'viewport', area: 'Frontend', title: 'Make pages scale properly on phones', why: 'Without a viewport tag, phones show a shrunken desktop page that visitors have to pinch and zoom.', impact: 'High', effort: 'Low', evidence: ['public/index.html'] },
  { id: 'alt', area: 'Accessibility', title: 'Add alt text to images', why: 'Screen reader users hear nothing for these images, and search engines cannot index them.', impact: 'High', effort: 'Low', evidence: ['public/index.html'] },
  { id: 'dark', area: 'Design', title: 'Add a dark mode', why: 'Most phones now default to dark. A light-only app is harsh at night, and a theme switch is now expected.', impact: 'Med', effort: 'Med', evidence: ['public/css/site.css'] },
  { id: 'olddeps', area: 'Dependencies', title: 'Replace outdated libraries', why: 'moment@2: Moment is in maintenance mode; date-fns or Temporal are lighter.', impact: 'High', effort: 'Med', evidence: ['moment@2: Moment is in maintenance mode; date-fns or Temporal are lighter.'] },
  { id: 'pwa', area: 'Feature', title: 'Make it installable (PWA)', why: 'A web manifest lets people add the app to their home screen and open it full-screen like a native app.', impact: 'Med', effort: 'Med', evidence: [] },
  { id: 'tests', area: 'Quality', title: 'Add automated tests', why: 'There is no test command, so every change is checked by hand and regressions reach users.', impact: 'High', effort: 'High', evidence: [] },
];

export function makeUpgrades({ registry, llm, dataDir, autopilot, audit = () => {} }) {
  const file = path.join(dataDir, 'upgrades.json');
  const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const save = (d) => { const t = `${file}.tmp`; fs.writeFileSync(t, JSON.stringify(d)); fs.renameSync(t, file); };

  async function aiIdeas(app, root, files) {
    const readme = read(root, files.find((f) => /^readme(\.md)?$/i.test(f)) || 'README.md', 3000);
    const j = await llm.json([{ role: 'system', content: 'You are a product-minded staff engineer. Suggest up to 4 FEATURE or DESIGN upgrades that real users of this app would value, based only on the README and file list. Never invent files. Reply with JSON only: {"ideas":[{"title": string, "why": string (1-2 sentences), "impact":"High"|"Med"|"Low", "effort":"High"|"Med"|"Low", "area":"Feature"|"Design"|"Frontend"|"Backend"}]}.' }, { role: 'user', content: `App ${app.name} (${app.stack || ''}) ${app.tagline || ''}\n\nREADME:\n${readme}\n\nFiles:\n${files.slice(0, 200).join('\n')}` }], { maxTokens: 1200, temperature: 0.4, timeout: 120000 });
    return (j.ideas || []).slice(0, 4).map((s, i) => ({ id: `ai${i}`, area: ['Feature', 'Design', 'Frontend', 'Backend'].includes(s.area) ? s.area : 'Feature', title: String(s.title || '').slice(0, 120), why: String(s.why || '').slice(0, 300), impact: RANK[s.impact] ? s.impact : 'Med', effort: RANK[s.effort] ? s.effort : 'Med', evidence: [], ai: true })).filter((s) => s.title);
  }

  return {
    get: (appId) => load()[appId] || { at: 0, items: [], dismissed: [] },
    async scan(app, { useAi = true } = {}) {
      let items;
      if (DEMO) items = DEMO_SUG.map((s) => ({ ...s }));
      else {
        if (!app.path || !fs.existsSync(app.path)) throw Object.assign(new Error('This app has no files on the server to scan.'), { status: 409 });
        const files = walk(app.path); items = scanTree(app.path, files);
        if (useAi && llm?.configured()) { try { items.push(...await aiIdeas(app, app.path, files)); } catch (e) { audit(app.id, `AI feature ideas skipped: ${e.message}`, 'warn'); } }
      }
      const all = load(); const prev = all[app.id] || { dismissed: [] };
      const dismissed = (prev.dismissed || []).filter((d) => items.some((i) => i.id === d));
      const out = { at: Date.now(), items: items.map((s) => ({ ...s, state: dismissed.includes(s.id) ? 'dismissed' : (prev.items || []).find((p) => p.id === s.id && p.state === 'queued') ? 'queued' : 'open' })), dismissed };
      all[app.id] = out; save(all);
      audit(app.id, `Upgrade scan for ${app.name}: ${out.items.filter((i) => i.state === 'open').length} suggestions`);
      return out;
    },
    dismiss(appId, sid, on = true) {
      const all = load(); const r = all[appId]; const it = r?.items.find((i) => i.id === sid); if (!it) return null;
      it.state = on ? 'dismissed' : 'open'; r.dismissed = r.items.filter((i) => i.state === 'dismissed').map((i) => i.id); save(all); return it;
    },
    // Hand the suggestion to Autopilot: it writes the change on a branch and files a review. Nothing is deployed from here.
    async apply(app, sid) {
      const all = load(); const r = all[app.id]; const it = r?.items.find((i) => i.id === sid); if (!it) return null;
      if (!autopilot) throw Object.assign(new Error('Autopilot is not available.'), { status: 409 });
      const detail = `${it.why}${it.evidence?.length ? ` Where: ${it.evidence.slice(0, 4).join(', ')}.` : ''} Keep the change small and do not alter unrelated behaviour.`;
      const run = DEMO ? { id: 'demo-run' } : await autopilot.task(app.id, it.title, detail);
      it.state = 'queued'; it.run = run?.id || null; save(all);
      audit(app.id, `Upgrade "${it.title}" sent to Autopilot for ${app.name}`);
      return it;
    },
  };
}
