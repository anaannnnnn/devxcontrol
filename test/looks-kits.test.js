import test from 'node:test';
import assert from 'node:assert/strict';
import { KITS, KIT_FAMILIES, kitRolesJs, buildKitCss, kitById, checkKit, withAccent, kitToJson, kitToTailwind, kitPreviewDoc, contrast } from '../public/js/lib/kits.js';
import { sample } from '../lib/looksample.js';
import { makeThemes } from '../lib/themes.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

test('there are more than 100 kits, with unique ids and several families', () => {
  assert.ok(KITS.length >= 150, `${KITS.length} kits`);
  assert.equal(new Set(KITS.map((k) => k.id)).size, KITS.length);
  assert.ok(KIT_FAMILIES.length >= 15);
});
test('every kit with a flat background passes the contrast checks', () => {
  for (const k of KITS) {
    const base = k.bgBase || k.bg, sf = k.surfaceBase || k.surface; if (!/^#/.test(base) || !/^#/.test(sf)) continue;
    assert.ok(contrast(k.text, base) >= 7 - 0.01, `${k.id} text`); assert.ok(contrast(k.muted, sf) >= 4.5 - 0.01, `${k.id} muted`); assert.ok(contrast(k.accent, base) >= 4.5 - 0.01, `${k.id} accent`);
    if (!k.btnBg) assert.ok(contrast(k.on, k.accent) >= 4.5 - 0.01, `${k.id} on-accent`);
  }
});
test('kit css loads its fonts, styles forms and keeps motion optional', () => {
  const css = buildKitCss(kitById('swiss-cobalt'));
  assert.match(css, /^@import url\('https:\/\/fonts\.googleapis\.com/); assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /table\{/);
  assert.doesNotMatch(css, /<\/style|<script/i);
});
test('buttons keep their own label colour inside nested elements', () => { assert.match(buildKitCss(kitById('linear')), /button \*[^{]*\{color:inherit!important\}/); });
test('exports and the preview page are well formed', () => {
  const k = kitById('glass-plum'); assert.equal(JSON.parse(kitToJson(k)).name, 'Glass Plum'); assert.match(kitToTailwind(k), /module\.exports/); assert.match(kitPreviewDoc(k), /<table>/);
});
test('checkKit rejects bad colours and css injection, and accepts a good kit', () => {
  const good = { id: 'x', name: 'Mine', mode: 'dark', bg: '#101010', surface: '#1a1a1a', text: '#eeeeee', muted: '#999999', accent: '#44aaff', border: '#333333', radius: 99 };
  assert.equal(checkKit(good).radius, 32);
  assert.throws(() => checkKit({ ...good, bg: 'red' }), /bg must be/);
  assert.throws(() => checkKit({ ...good, font: 'x;}body{display:none' }), /font/);
});
test('withAccent keeps the accent readable', () => { const k = withAccent(kitById('corporate-ember'), '#ffee00'); assert.ok(contrast(k.accent, k.bgBase || k.bg) >= 4.5 - 0.01); });
test('sample reads colours, font and radius from a site\'s css', () => {
  const css = ':root{--primary:#e11d48}body{background:#0b1020;color:#e5e7eb;font-family:"Manrope",sans-serif}.card{border-radius:14px}.btn{border-radius:14px}';
  const { kit, found } = sample({ css, html: '<h1>x</h1>', name: 'Looks like Shop' });
  assert.equal(found.bg, '#0b1020'); assert.equal(found.accent, '#e11d48'); assert.equal(found.font, 'Manrope'); assert.equal(found.radius, 14); assert.equal(kit.mode, 'dark'); assert.ok(contrast(kit.text, kit.bg) >= 7 - 0.01);
});
test('sample copes with a site that has almost no css', () => { const { kit } = sample({ html: '<p>hi</p>' }); assert.match(kit.accent, /^#[0-9a-f]{6}$/); });
test('look assignments are stored per app', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-')); const t = makeThemes({ dataDir: dir });
  assert.equal(t.lookOf('a'), null); t.assignLook('a', { kit: 'swiss-cobalt', name: 'Swiss Cobalt' }); t.assignLook('b', { kit: 'site', name: 'Sampled', def: { id: 'site' } });
  assert.equal(t.lookOf('a').kit, 'swiss-cobalt'); assert.deepEqual(Object.keys(t.looks()).sort(), ['a', 'b']); t.assignLook('a', null); assert.equal(t.lookOf('a'), null);
});

test('kits reach beyond class names: roles, Tailwind utilities and design-system variables', () => {
  const k = kitById('neobrutal-ember'); const css = buildKitCss(k);
  assert.match(css, /\[data-dx=card\]\{/); assert.match(css, /\[data-dx=btn\]\{/); assert.match(css, /\[class\*="bg-white"\]/); assert.match(css, /\[class\*="text-gray"\]/); assert.match(css, /body\[class\],html\[class\]/);
  const js = kitRolesJs(k); assert.doesNotThrow(() => new Function(js)); assert.match(js, /data-dx/); assert.match(js, /typeof window==='undefined'/); assert.match(js, /--'\+n/);
});
