import test from 'node:test';
import assert from 'node:assert/strict';
import { scanDna } from '../lib/dna.js';

test('classifies a restaurant only from evidence and marks missing playbook features', () => {
  const r = scanDna({
    readme: 'Family restaurant with a menu and table reservations.',
    files: ['src/menu.js', 'src/home.js'],
    pageText: '',
    tables: ['reservations'],
  });
  assert.equal(r.measured, true);
  assert.equal(r.classification.id, 'restaurant');
  assert.ok(r.classification.confidence > 0);
  assert.ok(r.classification.evidence.length);
  const loyalty = r.gaps.features.find((f) => f.id === 'loyalty');
  assert.equal(loyalty.state, 'missing');
  const menu = r.gaps.features.find((f) => f.id === 'qrmenu');
  assert.notEqual(menu.state, 'missing');
});

test('owner correction replaces the guess and is marked as such', () => {
  const r = scanDna({ readme: 'A restaurant menu', files: [], tables: [] }, 'logistics');
  assert.equal(r.classification.id, 'logistics');
  assert.equal(r.classification.confidence, 100);
  assert.equal(r.classification.evidence[0].kind, 'owner');
});

test('no evidence is not a guess', () => {
  const r = scanDna({});
  assert.equal(r.measured, false);
  assert.match(r.reason, /not measured/);
});
