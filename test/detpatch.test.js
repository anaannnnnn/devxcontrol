import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { applyDet, detectLayout } from '../lib/detpatch.js';
const mk = (files) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-')); for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); } return d; };
const A = { assets: [{ name: 'devx-theme.css', content: 'body{color:red}' }] }; const rd = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
test('static site: file next to the pages, relative link in every page, idempotent', () => {
  const d = mk({ 'index.html': '<html><head></head><body>a</body></html>', 'blog/post.html': '<html><head><title>x</title></head></html>', 'package.json': '{}' });
  const ch = applyDet(d, A); assert.ok(ch.includes('devx-theme.css') && ch.includes('index.html'));
  assert.match(rd(d, 'index.html'), /href="devx-theme\.css"/); assert.match(rd(d, 'blog/post.html'), /href="\.\.\/devx-theme\.css"/);
  assert.deepEqual(applyDet(d, A).filter((x) => x.endsWith('.html')), []);
});
test('Vite/CRA, Express public dir, templates, Next and unknown', () => {
  let d = mk({ 'index.html': '<html><head></head></html>', 'public/favicon.svg': '<svg/>', 'package.json': '{"devDependencies":{"vite":"5"}}' });
  applyDet(d, A); assert.ok(fs.existsSync(path.join(d, 'public/devx-theme.css'))); assert.match(rd(d, 'index.html'), /href="\/devx-theme\.css"/);
  d = mk({ 'templates/base.html': '<html><head></head></html>', 'static/app.css': 'x', 'app.py': '' }); applyDet(d, A); assert.match(rd(d, 'templates/base.html'), /\/static\/devx-theme\.css/);
  d = mk({ 'app/layout.tsx': 'export default function L(){}', 'package.json': '{"dependencies":{"next":"14"}}' }); applyDet(d, A); assert.match(rd(d, 'app/layout.tsx'), /^import '\.\/devx-theme\.css';/);
  assert.equal(detectLayout(mk({ 'README.md': 'x' })).kind, 'unknown'); assert.throws(() => applyDet(mk({ 'README.md': 'x' }), A), /Could not find where/);
});
test('exact snippet replacement tolerates whitespace and fails clearly', () => {
  const d = mk({ 'index.html': '<html><head></head><body>\n  <nav class="n">\n    <a href="/">Home</a>\n  </nav></body></html>' });
  applyDet(d, { replacements: [{ from: '<nav class="n"><a href="/">Home</a></nav>', to: '<nav class="NEW"></nav>' }] }); assert.match(rd(d, 'index.html'), /NEW/);
  assert.throws(() => applyDet(d, { replacements: [{ from: '<section id="missing">zzzz</section>', to: 'x' }] }), /exact section/);
  assert.throws(() => applyDet(d, { assets: [{ name: '../evil.css', content: 'x' }] }), /./) ;
});
