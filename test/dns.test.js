import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDns } from '../lib/dns.js';

const mk = (cfg, handler) => {
  const calls = [];
  const fetchImpl = async (url, o = {}) => { calls.push({ url, method: o.method || 'GET', body: o.body && JSON.parse(o.body) }); const r = await handler(url, o); return { ok: r.status < 400, status: r.status, text: async () => JSON.stringify(r.body) }; };
  return { dns: makeDns({ integrations: { dns: () => cfg }, fetchImpl }), calls };
};
const CF = { cloudflare: { token: 't'.repeat(30) }, godaddy: null };

test('cloudflare: picks the longest matching zone and creates a missing A record', async () => {
  const { dns, calls } = mk(CF, (url, o) => {
    if (url.includes('/zones?')) return { status: 200, body: { success: true, result: [{ id: 'z1', name: 'example.com' }, { id: 'z2', name: 'apps.example.com' }] } };
    if (url.includes('/dns_records?')) return { status: 200, body: { success: true, result: [] } };
    return { status: 200, body: { success: true, result: {} } };
  });
  const r = await dns.ensureA('shop.apps.example.com', '1.2.3.4');
  assert.equal(r.action, 'created');
  const post = calls.find((c) => c.method === 'POST'); assert.match(post.url, /zones\/z2\/dns_records$/); assert.deepEqual(post.body, { type: 'A', name: 'shop.apps.example.com', content: '1.2.3.4', ttl: 1, proxied: false });
});
test('cloudflare: unchanged when already right, updated when different, refused on CNAME', async () => {
  const rec = (recs) => (url) => url.includes('/zones?') ? { status: 200, body: { success: true, result: [{ id: 'z', name: 'example.com' }] } } : url.includes('/dns_records?') ? { status: 200, body: { success: true, result: recs } } : { status: 200, body: { success: true } };
  assert.equal((await mk(CF, rec([{ id: 'r', type: 'A', content: '1.2.3.4' }])).dns.ensureA('a.example.com', '1.2.3.4')).action, 'unchanged');
  const u = mk(CF, rec([{ id: 'r', type: 'A', content: '9.9.9.9' }])); assert.equal((await u.dns.ensureA('a.example.com', '1.2.3.4')).action, 'updated'); assert.ok(u.calls.some((c) => c.method === 'PUT' && /dns_records\/r$/.test(c.url)));
  assert.equal((await mk(CF, rec([{ id: 'r', type: 'CNAME', content: 'x' }])).dns.ensureA('a.example.com', '1.2.3.4')).reason, 'conflict');
});
test('godaddy: PUTs the A record for the sub-name; unknown domain is a soft failure', async () => {
  const GD = { cloudflare: null, godaddy: { key: 'k', secret: 's' } };
  const { dns, calls } = mk(GD, (url, o) => url.includes('/v1/domains?') ? { status: 200, body: [{ domain: 'example.com' }] } : o.method === 'PUT' ? { status: 200, body: {} } : { status: 200, body: [] });
  const r = await dns.ensureA('shop.example.com', '1.2.3.4'); assert.equal(r.action, 'created');
  const put = calls.find((c) => c.method === 'PUT'); assert.match(put.url, /domains\/example\.com\/records\/A\/shop$/); assert.deepEqual(put.body, [{ data: '1.2.3.4', ttl: 600 }]);
  const none = await dns.ensureA('shop.other.org', '1.2.3.4'); assert.equal(none.ok, false); assert.equal(none.reason, 'none');
});
