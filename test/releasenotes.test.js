import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DEMO = '1';
const { plainNotes, renderMarkdown, mdToHtml, makeReleaseNotes } = await import('../lib/releasenotes.js');

test('rule-based notes group, clean and de-duplicate commits', () => {
  const s = plainNotes([{ subject: 'feat(ui): dark mode' }, { subject: 'fix: login loop' }, { subject: 'Merge branch x' }, { subject: 'chore: bump' }, { subject: 'Improve checkout' }, { subject: 'feat: dark mode' }, { subject: 'Add export' }]);
  assert.deepEqual(s.new, ['Dark mode.', 'Add export.']);
  assert.deepEqual(s.fixed, ['Login loop.']);
  assert.deepEqual(s.improved, ['Improve checkout.']);
});
test('markdown renders and escapes HTML', () => {
  const md = renderMarkdown('T', 'Sum', { new: ['<script>x</script>'], improved: [], fixed: [] });
  const html = mdToHtml(md);
  assert.ok(html.includes('<h2>New</h2>') && !html.includes('<script>'));
});
test('generate, edit, publish, delete lifecycle (demo)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-'));
  const events = [];
  const rn = makeReleaseNotes({ registry: {}, llm: { configured: () => false }, dataDir: dir, audit: (...a) => events.push(a) });
  const app = { id: 'shop', name: 'Shop', path: dir };
  const n = await rn.generate(app);
  assert.equal(n.published, false); assert.equal(n.source, 'rules');
  assert.equal(rn.published('shop').length, 0);
  assert.ok(rn.update('shop', n.id, { published: true, title: 'May update' }));
  assert.equal(rn.published('shop')[0].title, 'May update');
  const page = rn.page(app, rn.published('shop'));
  assert.ok(page.includes("What's new in Shop") && page.includes('noindex'));
  assert.equal(rn.update('shop', 'nope', {}), null);
  assert.equal(rn.remove('shop', n.id), true);
  assert.equal(rn.list('shop').length, 0);
});
