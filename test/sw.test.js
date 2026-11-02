import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { swSource } from '../lib/sw.js';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

test('service worker is built with a version and a shell list', () => {
  const src = swSource(pub);
  assert.match(src, /const VERSION = '[0-9a-f]{12}'/);
  const list = JSON.parse(/const PRECACHE = (\[.*\]);/.exec(src)[1]);
  assert.ok(list.includes('/') && list.includes('/js/main.js') && list.includes('/css/pwa.css'));
  assert.ok(!list.some((u) => /jarvis|splash|three|client\.html|sw\.js/.test(u)));
  assert.ok(!src.includes('__VERSION__') && !src.includes('__PRECACHE__'));
});

test('service worker never touches the API', () => {
  assert.match(swSource(pub), /NEVER = \/\^\\\/\(api\|/);
});

test('manifest is installable on iOS and Android', async () => {
  const m = JSON.parse((await import('node:fs')).readFileSync(path.join(pub, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable') && m.icons.some((i) => i.sizes === '512x512'));
});
