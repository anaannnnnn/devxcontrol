import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedAudit, PERSONAS, STEP_CAP } from '../lib/ghosts.js';

test('scripted ghosts find missing labels, alt text and rtl, and do not pretend a browser ran', () => {
  const html = '<html><body><img src="a.png"><input type="text"><button></button><p>Hello</p></body></html>';
  const reader = scriptedAudit(html, 'reader');
  assert.equal(reader.measured, true);
  assert.equal(reader.browser.measured, false);
  const ids = reader.findings.map((f) => f.id);
  assert.ok(ids.includes('alt'));
  assert.ok(ids.includes('label'));
  assert.ok(ids.includes('button-name'));
  const ar = scriptedAudit(html, 'arabic');
  assert.ok(ar.findings.some((f) => f.id === 'rtl'));
  assert.equal(scriptedAudit('', 'shopper').measured, false);
  assert.equal(PERSONAS.length, 5);
  assert.ok(STEP_CAP <= 12);
});
