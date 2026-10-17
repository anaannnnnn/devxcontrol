import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMES, KITS, CONSOLE_THEMES, AXES, normalizeSkin, buildConsoleCss, recolorCss, schemeSpec, activeTheme, hexHue } from '../public/js/lib/consolelook.js';

test('console ships many colors, themes and component kits', () => {
  assert.ok(Object.keys(SCHEMES).length >= 20);
  assert.ok(CONSOLE_THEMES.length >= 8);
  assert.ok(Object.keys(KITS).length >= 8);
  for (const t of CONSOLE_THEMES) {
    assert.ok(SCHEMES[t.scheme], t.id);
    assert.ok(KITS[t.kit], t.id);
  }
  assert.equal(SCHEMES.violet.hue, null);
  for (const s of Object.values(SCHEMES)) {
    if (s.hue != null) assert.ok(s.hue >= 0 && s.hue < 360);
    assert.match(s.dot, /^#[0-9a-f]{6}$/i);
  }
});

test('skin input is validated and cannot inject CSS', () => {
  const bad = normalizeSkin({ scheme: 'nope', kit: '</style><script>', radius: '999px;color:red', custom: '#fff; }', font: 'orbital' });
  assert.equal(bad.scheme, 'violet');
  assert.equal(bad.kit, 'orbital');
  assert.equal(bad.radius, undefined);
  assert.equal(bad.custom, undefined);
  const css = buildConsoleCss({ kit: 'x}body{display:none', scheme: 'red' });
  assert.doesNotMatch(css, /display\s*:\s*none|<\/style>/);
  assert.match(buildConsoleCss({ scheme: 'blue', kit: 'brutal' }), /border:2px solid/);
  assert.equal(buildConsoleCss({ scheme: 'violet', kit: 'orbital' }), '');
});

test('axes override the kit preset and themes detect a clean match', () => {
  const skin = normalizeSkin({ scheme: 'orange', kit: 'brutal', radius: 'pill' });
  const css = buildConsoleCss(skin);
  assert.match(css, /36px/);
  assert.match(css, /border:2px solid/);
  assert.equal(activeTheme({ scheme: 'cyan', kit: 'glass' }), 'aurora');
  assert.equal(activeTheme({ scheme: 'cyan', kit: 'glass', radius: 'pill' }), '');
  assert.equal(activeTheme({ scheme: 'custom', custom: '#22d3ee', kit: 'glass' }), '');
});

test('custom hue is a real hue and recolor leaves status green alone', () => {
  const spec = schemeSpec({ scheme: 'custom', custom: '#22d3ee' });
  assert.equal(spec.dot, '#22d3ee');
  assert.ok(spec.hue > 170 && spec.hue < 210, spec.hue);
  assert.equal(hexHue('not-a-color'), 265);
  const out = recolorCss('a{color:#0ca30c}b{color:#b69cff}c{color:rgba(182, 156, 255, .3)}', 140);
  assert.match(out, /#0ca30c/);
  assert.doesNotMatch(out, /#b69cff/);
  assert.match(out, /rgba\(\d+, \d+, \d+, \.3\)/);
});

test('every axis value is accepted and unknown ones drop', () => {
  for (const [axis, values] of Object.entries(AXES)) {
    for (const id of Object.keys(values)) {
      const skin = normalizeSkin({ [axis]: id, kit: 'soft' });
      assert.equal(skin[axis], id);
      assert.equal(typeof buildConsoleCss(skin), 'string');
    }
  }
  assert.equal(normalizeSkin({ glass: 'liquid' }).glass, undefined);
});
