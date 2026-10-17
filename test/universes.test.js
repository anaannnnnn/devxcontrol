import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDirections, brandFromColors } from '../lib/universes.js';

test('three directions are contrast-checked and keep brand colours when asked', () => {
  const brand = brandFromColors(['#102030', '#203040', '#f0f0f0', '#a0a0a0', '#8855cc']);
  const dirs = buildDirections({ keepBrand: true, brand });
  assert.equal(dirs.length, 3);
  for (const d of dirs) {
    assert.ok(d.css.includes(`universe:${d.id}`));
    assert.ok(d.contrast.every((c) => c.ok), d.name);
    assert.match(d.copyReason, /AI|model|not included/i);
  }
  const free = buildDirections({ keepBrand: false, brand });
  assert.notEqual(free.find((d) => d.id === 'brutalist').colors.bg, dirs.find((d) => d.id === 'editorial').colors.bg);
});
