import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const T = await import('../lib/themes.js');

test('built-in themes are well formed and mostly pass contrast', () => {
  assert.ok(T.BUILTIN.length >= 12);
  for (const t of T.BUILTIN) { assert.doesNotThrow(() => T.checkTheme(t), t.id); assert.ok(T.report(t)[0].ok, `${t.id} text contrast`); }
});
test('css has tokens and low-specificity element rules', () => {
  const css = T.toCss(T.BUILTIN[0]);
  assert.match(css, /--dx-accent: #9b7bff/); assert.match(css, /:where\(body\)/);
  assert.ok(!/:where\(.*\)\s*\{[^}]*!important/.test(css));
  assert.ok(!T.toCss(T.BUILTIN[0], { elements: false }).includes(':where'));
  assert.match(T.toTailwind(T.BUILTIN[5]), /accent: '#b4532a'/); assert.equal(JSON.parse(T.toJson(T.BUILTIN[1])).mode, 'dark');
});
test('custom themes are validated and stored', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'th-')); const th = T.makeThemes({ dataDir: d });
  assert.throws(() => th.create({ name: 'x', bg: '#000' }), T.ThemeError);
  assert.throws(() => th.create({ name: 'Bad', bg: 'red;}body{display:none', surface: '#111111', text: '#ffffff', muted: '#999999', accent: '#ff0000' }), T.ThemeError);
  const t = th.create({ name: 'My Look', mode: 'dark', bg: '#101010', surface: '#202020', text: '#ffffff', muted: '#aaaaaa', accent: '#33ccff', radius: 99, font: 'nope' });
  assert.equal(t.radius, 32); assert.equal(t.font, 'system'); assert.ok(th.get(t.id));
  th.assign('app1', t.id); assert.equal(th.assigned('app1'), t.id);
  assert.equal(th.remove(t.id), true); assert.equal(th.assigned('app1'), null); assert.equal(th.get(t.id), null);
});
test('contrast math', () => { assert.equal(Math.round(T.contrast('#000000', '#ffffff')), 21); assert.ok(T.contrast('#777777', '#808080') < 1.2); });
