import test from 'node:test'; import assert from 'node:assert/strict';
import { KINDS, variantCount, paramsFromSeed, render, normalizeParams, surfaceCss, kindFor, SURFACES } from '../public/js/lib/components.js';
test('millions of designs across kinds, all render cleanly and escape content', () => {
  assert.ok(Object.keys(KINDS).reduce((n, k) => n + variantCount(k), 0) > 4_000_000); assert.ok(variantCount('nav') > 1_000_000);
  for (const k of Object.keys(KINDS)) for (let s = 1; s <= 60; s++) { const d = render(k, paramsFromSeed(k, s * 7919), {}); assert.ok(d.html && d.css && !/undefined|NaN|\[object/.test(d.html + d.css), `${k} ${s}`); }
  const d = render('nav', paramsFromSeed('nav', 5), { brand: '<script>x</script>', items: [{ t: 'A"B', h: 'javascript:alert(1)' }] });
  assert.ok(!d.html.includes('<script>') && !d.html.includes('javascript:')); assert.ok(d.html.includes('A&quot;B'));
  assert.deepEqual(paramsFromSeed('table', 42), paramsFromSeed('table', 42)); assert.notDeepEqual(paramsFromSeed('table', 42), paramsFromSeed('table', 43));
  assert.equal(render('button', { variant: 'bogus', size: 99 }).params.variant, 'solid');
});
test('keeps the page content and surfaces/kinds map', () => {
  const t = render('table', {}, { headers: ['A', 'B'], rows: [['1', '2']] }); assert.match(t.html, /<th scope="col">A<\/th>[\s\S]*<td>2<\/td>/);
  assert.equal(kindFor('header'), 'nav'); assert.equal(kindFor('section'), null);
  for (const s of SURFACES) assert.match(surfaceCss('.x', s), /^\.x\{/);
  assert.equal(normalizeParams('badge', {}).palette, 'theme');
});
