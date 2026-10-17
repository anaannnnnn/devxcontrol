import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { PACKS, generate, parseGenId, parseBase16, parseDaisy, parseBootswatch, toCssFull, recolorJs, makeThemeLab, STYLESHEETS, GEN_STYLES } from '../lib/themelab.js';
import { makeThemes, report, BUILTIN } from '../lib/themes.js';

const B16 = `system: "base16"\nname: "Dracula Test"\nauthor: "x"\nvariant: "dark"\npalette:\n  base00: "282a36"\n  base01: "343746"\n  base02: "44475a"\n  base03: "6272a4"\n  base04: "62d6e8"\n  base05: "f8f8f2"\n  base06: "f8f8f2"\n  base07: "ffffff"\n  base08: "ff5555"\n  base09: "ffb86c"\n  base0A: "f1fa8c"\n  base0B: "50fa7b"\n  base0C: "8be9fd"\n  base0D: "bd93f9"\n  base0E: "ff79c6"\n  base0F: "ffb86c"\n`;
const DAISY = `module.exports = {\n  "[data-theme=light]": { "color-scheme": "light", primary: "#570df8", secondary: "#f000b8", accent: "#1ad1a5", neutral: "#2a323c", "base-100": "#ffffff", "base-200": "#f2f2f2", "base-300": "#e5e6e6", "base-content": "#1f2937" },\n  "[data-theme=night]": { "color-scheme": "dark", primary: "#38bdf8", secondary: "#818cf8", accent: "#f471b5", "base-100": "#0f172a", "base-200": "#0d1424", "base-content": "#c8d3f5" },\n  "[data-theme=oklchone]": { primary: "oklch(1 0 0)" }\n}`;
const BS = `:root,[data-bs-theme=light]{--bs-primary:#2780e3;--bs-body-color:#373a3c;--bs-body-bg:#fff;--bs-secondary-color:rgba(55,58,60,.75);--bs-tertiary-bg:#f8f9fa;--bs-border-radius:.375rem}`;

test('curated packs and the generator all pass contrast checks', () => {
  assert.ok(PACKS.length >= 50);
  for (const p of PACKS) assert.ok(report(p).every((r) => r.ok), `${p.id} ${JSON.stringify(report(p).filter((r) => !r.ok))}`);
  let n = 0; for (const s of GEN_STYLES) for (const mode of ['dark', 'light']) for (let h = 0; h < 360; h += 10) { n++; assert.ok(report(generate({ hue: h, style: s, mode })).every((r) => r.ok), `${s}-${h}-${mode}`); }
  assert.ok(n >= 400); assert.equal(parseGenId('gen:200-neon-dark').accent, generate({ hue: 200, style: 'neon', mode: 'dark' }).accent); assert.equal(parseGenId('gen:999-x-y'), null);
});
test('online library parsers read Base16, DaisyUI and Bootswatch', () => {
  const b = parseBase16(B16, 'dracula-test.yaml'); assert.equal(b.bg, '#282a36'); assert.equal(b.mode, 'dark'); assert.equal(b.accent, '#bd93f9'); assert.equal(b.accents.length, 8); assert.equal(parseBase16('name: x'), null);
  const d = parseDaisy(DAISY); assert.deepEqual(d.map((x) => x.id), ['daisy-light', 'daisy-night']); assert.equal(d[1].mode, 'dark'); assert.equal(d[0].accent, '#570df8');
  const s = parseBootswatch(BS, 'cerulean'); assert.equal(s.accent, '#2780e3'); assert.equal(s.mode, 'light'); assert.equal(s.radius, 6); assert.equal(s.stylesheet, 'cerulean'); assert.equal(parseBootswatch('body{}', 'x'), null);
  assert.ok(STYLESHEETS.length >= 30 && STYLESHEETS.every((x) => /^https:\/\/cdn\.jsdelivr\.net\/npm\//.test(x.href)));
});
test('Full CSS beats the site: important, role based, Tailwind remap; Soft stays low specificity', () => {
  const t = PACKS.find((p) => p.id === 'dracula');
  const full = toCssFull(t, { strength: 'full' }), soft = toCssFull(t, { strength: 'soft' });
  assert.match(full, /!important/); assert.match(full, /\[class~="bg-white"\]/); assert.match(full, /text-gray-500/); assert.match(full, /--dx-accent: #bd93f9/);
  assert.ok(!/!important/.test(soft) && /:where\(/.test(soft)); assert.ok(!toCssFull(t, { strength: 'full', tailwind: false }).includes('bg-white'));
  assert.doesNotThrow(() => new Function(recolorJs(t)));
});
test('lab: lookup, remote refresh with caching, partial failure, browse and paging', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-')); const themes = makeThemes({ dataDir: dir }); let calls = 0;
  const fetchImpl = async (url) => { calls++; const ok = (body) => ({ ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) });
    if (url.includes('api.github.com')) return ok(JSON.stringify([{ name: 'dracula-test.yaml' }, { name: 'broken.yaml' }, { name: 'readme.md' }]));
    if (url.endsWith('dracula-test.yaml')) return ok(B16); if (url.endsWith('broken.yaml')) return ok('nope'); if (url.includes('themes.js')) return ok(DAISY);
    if (url.includes('bootswatch') && url.includes('cerulean')) return ok(BS); return { ok: false, status: 404, text: async () => '' }; };
  const lab = makeThemeLab({ dataDir: dir, themes, fetchImpl });
  assert.equal(lab.find('dracula').id, 'dracula'); assert.ok(lab.find('gen:10-vivid-light')); assert.equal(lab.find('b16-dracula-test'), null);
  const r = await lab.refresh('base16'); assert.equal(r.items.length, 1); const n = calls; await lab.refresh('base16'); assert.equal(calls, n, 'cache hit makes no requests');
  assert.equal(lab.find('b16-dracula-test').name, 'Dracula Test'); await lab.refresh('daisyui'); assert.ok(lab.find('daisy-night'));
  assert.equal((await lab.refresh('bootswatch')).items.length, 1);
  const st = lab.status(); assert.equal(st.find((s) => s.id === 'daisyui').count, 2);
  const all = lab.browse({ limit: 10 }); assert.equal(all.items.length, 10); assert.ok(all.total > BUILTIN.length + PACKS.length);
  assert.ok(lab.browse({ q: 'dracula' }).items.some((x) => x.id === 'b16-dracula-test')); assert.ok(lab.browse({ mode: 'light', pack: 'Catppuccin' }).items.every((x) => x.mode === 'light'));
  await assert.rejects(makeThemeLab({ dataDir: dir, themes, fetchImpl: async () => ({ ok: false, status: 403 }) }).refresh('daisyui', { force: true }), /DaisyUI/);
});
