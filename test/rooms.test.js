import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeRooms } from '../lib/rooms.js';

test('client accounts are scoped, passwords are not returned, and the report escapes HTML', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooms-'));
  const rooms = makeRooms({ dataDir: dir });
  assert.throws(() => rooms.create({ appId: 'nexus', user: 'ada', password: 'short' }));
  const c = rooms.create({ appId: 'nexus', name: 'Ada', user: 'ada', password: 'long-enough-password', lang: 'ar' });
  assert.equal(c.hash, undefined);
  assert.equal(c.appId, 'nexus');
  assert.equal(rooms.verify('ada', 'wrong'), null);
  assert.equal(rooms.verify('ada', 'long-enough-password').user, 'ada');
  const raw = fs.readFileSync(path.join(dir, 'clients.json'), 'utf8');
  assert.equal(raw.includes('long-enough-password'), false);
  const req = rooms.requestChange(c, 'Please add a booking page');
  assert.equal(req.appId, 'nexus');
  assert.equal(rooms.requests('other').length, 0);
  const html = rooms.monthlyHtml({ app: { name: '<script>' }, notes: [{ title: '<b>x</b>' }], gifts: [], lang: 'en' });
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /\u0026lt;script\u0026gt;/);
});
