import { test } from 'node:test'; import assert from 'node:assert/strict'; import http from 'node:http';
import { makeLlm } from '../lib/llm.js';
const serve = (h) => new Promise((r) => { const s = http.createServer(h); s.listen(0, () => r(s)); });
const mk = (s) => makeLlm({ integrations: { llm: () => ({ baseUrl: `http://127.0.0.1:${s.address().port}/v1`, model: 'm', apiKey: 'k' }) } });
const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => r(JSON.parse(b))); });
const ok = (res, t) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: t } }] })); };
test('shrinks max_tokens when the provider reports a per-minute limit', async () => {
  const seen = []; const s = await serve(async (req, res) => { const b = await body(req); seen.push(b.max_tokens); if (b.max_tokens > 3000) { res.statusCode = 413; res.end(JSON.stringify({ error: { message: 'Request too large for model. Limit 6000, Requested 9000, please reduce' } })); } else ok(res, 'fine'); });
  const out = await mk(s).chat([{ role: 'user', content: 'hi' }], { maxTokens: 8000 }); s.closeAllConnections(); s.close();
  assert.equal(out, 'fine'); assert.ok(seen.length >= 2 && seen.at(-1) < 6000);
});
test('drops response_format when unsupported and still parses json', async () => {
  let n = 0; const s = await serve(async (req, res) => { const b = await body(req); n++; if (b.response_format) { res.statusCode = 400; res.end(JSON.stringify({ error: { message: 'response_format json_object is not supported' } })); } else ok(res, '```json\n{"a":1}\n```'); });
  const out = await mk(s).json([{ role: 'user', content: 'x' }]); s.closeAllConnections(); s.close(); assert.deepEqual(out, { a: 1 }); assert.equal(n, 2);
});
test('401 gives a plain key message, not a paid-plan message', async () => {
  const s = await serve((req, res) => { res.statusCode = 401; res.end('{"error":{"message":"bad key"}}'); });
  await assert.rejects(mk(s).chat([{ role: 'user', content: 'x' }]), /key was refused/); s.closeAllConnections(); s.close();
});
