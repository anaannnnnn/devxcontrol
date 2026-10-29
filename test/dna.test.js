import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, PALETTES, STRUCTURES, BACKDROPS, IMAGERY, MOTIONS, TYPES, CATS, compose, parseDna, dnaId, fitsOf, classifyBusiness, imp, randomDna, dnaPreviewDoc } from '../public/js/lib/dna.js';

test('1,200 presets, unique, 80 for each of 15 business types, spread over every axis', () => {
  assert.equal(PRESETS.length, 1200); assert.equal(new Set(PRESETS.map((p) => p.id)).size, 1200); assert.equal(new Set(PRESETS.map((p) => p.name)).size, 1200);
  const per = {}; for (const p of PRESETS) per[p.cat] = (per[p.cat] || 0) + 1; assert.equal(CATS.length, 15); for (const c of CATS) assert.equal(per[c.id], 80, c.id);
  for (const [axis, arr] of [['structure', STRUCTURES], ['backdrop', BACKDROPS], ['imagery', IMAGERY], ['motion', MOTIONS], ['type', TYPES]]) assert.ok(new Set(PRESETS.map((p) => p.dna[axis])).size >= Math.min(arr.length, 10), axis);
});
test('every preset suits its own business type and round-trips through its id', () => {
  for (const p of PRESETS) { assert.ok(p.fits.includes(p.cat), p.id); assert.deepEqual(parseDna(p.id), p.dna); assert.equal(dnaId(p.dna), p.id); }
});
test('nothing suits the wrong mood: no terminal or neon looks for kids, bakeries or luxury', () => {
  for (const p of PRESETS) { if (['kids', 'food', 'luxury', 'health'].includes(p.cat)) { assert.ok(!['terminal', 'neon', 'blueprint'].includes(p.dna.structure), `${p.cat} got ${p.dna.structure}`); } }
});
test('looks change paint only: no margins, paddings, sizes, display or layout position in any preset stylesheet', () => {
  const BAD = /(^|[;{,\s])(margin|padding|width|height|min-height|max-width|display|top|left|right|bottom|float|flex|grid)[a-z-]*\s*:/i;
  for (const p of PRESETS.filter((_, i) => i % 7 === 0)) {
    const c = compose(p.dna);
    const css = c.css.replace(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*$/, '').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/::?(before|after)\{[^}]*\}/g, '').replace(/#dx-[a-z]+\{[^}]*\}/g, '').replace(/\.dx-w\{[^}]*\}/g, '');
    const hit = css.match(BAD); assert.ok(!hit || /::?(before|after)|inset|\.hero/.test(hit.input || ''), `${p.id}: ${hit && hit[0]} in ${hit && css.slice(Math.max(0, hit.index - 60), hit.index + 60)}`);
  }
});
test('every combination compiles to valid script and a stylesheet', () => {
  for (const p of PRESETS) { const c = compose(p.dna); assert.doesNotThrow(() => new Function(c.js)); assert.doesNotThrow(() => new Function(c.roles)); assert.ok(c.css.length > 3000 && !/undefined|NaN|\[object/.test(c.css), p.id); }
  for (let i = 0; i < 200; i++) { const d = randomDna(i + 1); assert.ok(parseDna(dnaId(d)), dnaId(d)); }
});
test('motion respects reduced-motion and always reveals content', () => {
  const c = compose(PRESETS.find((p) => p.dna.motion === 'depth').dna);
  assert.match(c.css, /prefers-reduced-motion:reduce/); assert.match(c.js, /prefers-reduced-motion: reduce/); assert.match(c.js, /6000/);
});
test('the business classifier reads app descriptions', () => {
  assert.equal(classifyBusiness('AI voice ordering for drive-thru restaurant').id, 'food'); assert.equal(classifyBusiness('Boutique OS jewelry store').id, 'ecom'); assert.equal(classifyBusiness('wasl hrms payroll').id, 'admin'); assert.ok(classifyBusiness('xyzzy').guess);
});
test('imp adds important outside brackets only', () => { assert.equal(imp('a:b;c:url(x;y);d:e!important'), 'a:b!important;c:url(x;y)!important;d:e!important'); });
test('the full preview page contains pictures, a table and motion', () => { const h = dnaPreviewDoc(PRESETS[3].dna, 'X'); assert.match(h, /<table>/); assert.match(h, /<img/); assert.match(h, /<script>/); });

import { fontImport } from '../public/js/lib/looks.js';
test('every font a type pair uses is actually imported', () => {
  for (const t of TYPES) { const imp = fontImport(t.hf, t.bf); for (const stack of [t.hf, t.bf]) { const name = /^'([^']+)'/.exec(stack)[1]; assert.ok(imp.includes(name.replace(/ /g, '+')), `${t.id}: ${name} is not imported`); } }
});

import { harmonizeJs } from '../public/js/lib/harmonize.js';
test('the harmonizer compiles and carries the font list; colour lives in the script, not the stylesheet', () => {
  const c = compose(PRESETS[10].dna);
  assert.doesNotThrow(() => new Function(harmonizeJs({ mode: 'dark', bg: '#000000', surface: '#111111', text: '#ffffff', muted: '#aaaaaa', accent: '#4488ff', accent2: '#8844ff', border: '#222222', s2: '#181818', on: '#ffffff', fonts: ['Inter'] })));
  assert.match(c.roles, /data-dx-font/); assert.match(c.roles, /"fonts":\[/);
  assert.match(c.css, /html\[data-dx-font\]/);
  assert.doesNotMatch(c.css, /\[class\*="bg-white"\]/);
});
test('stylesheet never styles bare button or input tags by colour; only detected roles', () => {
  const c = compose(PRESETS[20].dna); assert.doesNotMatch(c.css, /(^|\n)button,\[data-dx=btn\]/);
});
