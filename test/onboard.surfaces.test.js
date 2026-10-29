import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectSurfaces } from '../lib/onboard.js';

function scratch(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'surf-'));
  for (const [p, c] of Object.entries(files)) { fs.mkdirSync(path.join(d, path.dirname(p)), { recursive: true }); fs.writeFileSync(path.join(d, p), c); }
  return d;
}

test('detects a CRM from vite multi-page input + admin dir', () => {
  const d = scratch({ 'vite.config.js': "export default { build:{ rollupOptions:{ input:{ main:'index.html', admin:'admin/index.html' } } } }", 'admin/index.html': '<title>CRM</title>', 'index.html': 'x' });
  const s = detectSurfaces(d);
  assert.ok(s.some((x) => x.path === '/admin/' && x.label === 'CRM'));
});

test('detects driver + customer dirs (greenloop-style)', () => {
  const d = scratch({ 'public/driver/index.html': 'x', 'public/customer/index.html': 'x', 'index.html': 'x' });
  const labels = detectSurfaces(d).map((x) => x.label).sort();
  assert.deepEqual(labels, ['Customer', 'Driver']);
});

test('a plain single-page app has no extra surfaces', () => {
  const d = scratch({ 'index.html': 'x', 'vite.config.js': "export default { build:{ rollupOptions:{ input:{ main:'index.html' } } } }" });
  assert.equal(detectSurfaces(d).length, 0);
});
