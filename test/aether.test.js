import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, TEXTURES, FONTS, MOTION, normalize, resolve, deriveTokens, buildCss, contrast, exportCss, DEFAULTS } from '../public/js/lib/aether-core.js';

test('kit sizes and unique ids', () => {
  assert.equal(THEMES.length, 142); assert.equal(new Set(THEMES.map((t) => t.id)).size, 142);
  assert.equal(TEXTURES.length, 52); assert.equal(MOTION.length, 5); assert.ok(FONTS.length >= 120);
  for (const t of THEMES) { assert.ok(TEXTURES.some((x) => x.id === t.texture), `${t.id} texture`); assert.ok(FONTS.some((f) => f.family === t.font), `${t.id} font ${t.font}`); assert.ok(FONTS.some((f) => f.family === t.head), `${t.id} head ${t.head}`); }
});

test('every theme yields readable tokens in dark and light', () => {
  for (const t of THEMES) for (const mode of ['dark', 'light']) {
    const k = deriveTokens(resolve({ theme: t.id }), mode);
    assert.ok(contrast(k.text, k.panel) >= 7, `${t.id} ${mode} text`);
    assert.ok(contrast(k.text2, k.panel) >= 6.5, `${t.id} ${mode} text-2 ${contrast(k.text2, k.panel).toFixed(2)}`);
    assert.ok(contrast(k.text3, k.panel) >= 4.5, `${t.id} ${mode} text-3`);
    assert.ok(contrast(k.accent, k.panel) >= 4.5, `${t.id} ${mode} accent`);
    assert.ok(contrast(k.ink, k.accent) >= 4.5, `${t.id} ${mode} ink on accent`);
    assert.ok(contrast(k.text, k.bg) >= 7, `${t.id} ${mode} text on bg`);
  }
});

test('normalize rejects junk and never lets raw strings through', () => {
  const n = normalize({ on: 1, theme: 'nope', accent: 'red;}body{display:none', accent2: '#ABCDEF', bodyFont: 'Evil"}', texture: 'x', radius: 999, cursor: 'laser', favorites: ['nope', 'cyber-hud'] });
  assert.equal(n.theme, DEFAULTS.theme); assert.equal(n.accent, ''); assert.equal(n.accent2, '#abcdef'); assert.equal(n.bodyFont, ''); assert.equal(n.texture, '');
  assert.equal(n.radius, 44); assert.equal(n.cursor, 'off'); assert.deepEqual(n.favorites, ['cyber-hud']);
  const css = buildCss({ ...n, on: true }, 'dark');
  assert.ok(!css.includes('display:none')); assert.ok(!css.includes('Evil'));
});

test('css covers console tokens, shadcn aliases, surfaces and motion', () => {
  const css = buildCss({ on: true, theme: 'cyber-hud' }, 'dark');
  for (const v of ['--bg:', '--panel:', '--panel-2:', '--text:', '--accent:', '--accent-ink:', '--background:', '--card:', '--primary:', '--border:', '--ring:', '--radius:', '--f-display:', '--ax-ease:']) assert.ok(css.includes(v), v);
  assert.ok(css.includes('.panel') && css.includes('backdrop-filter') && css.includes('prefers-reduced-motion'));
  assert.ok(!/--accent-2?:[^;]*undefined/.test(css) && !css.includes('NaN') && !css.includes('undefined'));
});

test('light mode differs from dark and keeps panels white', () => {
  const d = deriveTokens(resolve({ theme: 'midnight-luxe' }), 'dark'), l = deriveTokens(resolve({ theme: 'midnight-luxe' }), 'light');
  assert.notEqual(d.bg, l.bg); assert.equal(l.panel, '#ffffff'); assert.ok(exportCss({ theme: 'midnight-luxe' }, 'light').includes('--panel'));
});
