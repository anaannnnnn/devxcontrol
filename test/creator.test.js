import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { validateFiles, makeCreator, dockerfileFor, slug } = await import('../lib/creator.js');

const okNode = [{ path: 'server.js', content: "require('http').createServer((q,s)=>s.end('ok')).listen(process.env.PORT||3000)" }];
test('validation accepts a good app and rejects dangerous or malformed ones', () => {
  assert.deepEqual(validateFiles(okNode, 'node').errors, []);
  const bad = validateFiles([{ path: '../etc/passwd', content: 'x' }, { path: 'Dockerfile', content: 'FROM x' }, { path: '.env', content: 'A=1' }, { path: 'a.json', content: '{bad' }, { path: 'server.js', content: "require('child_process').exec('ls'); eval('1')" }, { path: 'p/../q.js', content: '' }], 'node').errors.join('|');
  for (const w of ['Bad file path', 'platform provides', 'not valid JSON', 'child_process', 'eval']) assert.ok(bad.includes(w), w);
  assert.ok(validateFiles([{ path: 'a.html', content: 'x' }], 'static').errors.some((e) => /index\.html is required/.test(e)));
  assert.ok(validateFiles([...okNode, { path: 'package.json', content: '{"dependencies":{"express":"4"}}' }], 'node').errors.some((e) => /No npm packages/.test(e)));
  assert.ok(validateFiles([], 'static').errors.length);
});
test('our Dockerfiles run as non-root with a health check', () => {
  assert.match(dockerfileFor('node'), /USER node/); assert.match(dockerfileFor('node'), /HEALTHCHECK/); assert.match(dockerfileFor('static'), /nginx/);
  assert.equal(slug('My Booking App!'), 'my-booking-app');
});
const okExec = async (cmd, args) => (cmd === 'docker' && args[0] === 'exec' ? { ok: true, out: 'ok', err: '' } : cmd === 'docker' && args[0] === 'inspect' ? { ok: true, out: 'true', err: '' } : { ok: true, out: '', err: '' });
test('AI path: plan, then one small request per file, repairing a bad file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-')); const chats = []; let jsonCalls = 0;
  const llm = { configured: () => true,
    json: async () => { jsonCalls++; return { name: 'Good App', tagline: 'works', files: [{ path: 'server.js', purpose: 'server' }] }; },
    chat: async (msgs, o) => { chats.push({ msgs, o }); return chats.length === 1 ? '```js\neval("x")\n```' : "```js\nrequire('http').createServer((q,s)=>s.end('ok')).listen(process.env.PORT||3000)\n```"; } };
  const c = makeCreator({ llm, dataDir: dir, exec: okExec });
  const r = await c.generate({ spec: 'A tiny server that says ok to everyone', template: 'node' }, () => {});
  assert.equal(r.name, 'Good App'); assert.equal(jsonCalls, 1); assert.equal(chats.length, 2); assert.ok(chats.every((x) => x.o.maxTokens <= 3500));
  assert.match(chats[1].msgs.at(-1).content, /not allowed/); assert.ok(!r.fallback);
  assert.ok((await c.draft(r.id)).source.some((f) => f.path === 'server.js')); assert.ok(fs.existsSync(path.join(dir, 'creator', r.id, 'Dockerfile'))); assert.equal(c.scanFor(r).port, 3000);
  await c.discard(r.id); assert.equal(await c.draft(r.id), null);
});
test('when the AI is missing or keeps failing, the closest starter is delivered instead of an error', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-')); const logs = [];
  const none = makeCreator({ llm: { configured: () => false }, dataDir: dir, exec: okExec });
  const a = await none.generate({ spec: 'an expense splitter for a group trip' }, (l) => logs.push(l));
  assert.equal(a.starter, 'expenses'); assert.equal(a.fallback, true); assert.ok(a.files.includes('server.js'));
  const broken = makeCreator({ llm: { configured: () => true, json: async () => { throw new Error('AI endpoint 429: limit'); }, chat: async () => '' }, dataDir: dir, exec: okExec });
  const b = await broken.generate({ spec: 'a landing page for my plumbing company' }, (l) => logs.push(l));
  assert.equal(b.starter, 'landing'); assert.ok(logs.some((l) => /closest ready-made starter/.test(l)));
  await assert.rejects(none.generate({ spec: 'short' }, () => {}), /sentence/);
});
test('starters deploy without AI and ask for a name', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-')); const c = makeCreator({ llm: { configured: () => false }, dataDir: dir, exec: okExec });
  const r = await c.generate({ starter: 'todo', name: 'Chores' }, () => {}); assert.equal(r.name, 'Chores'); assert.equal(r.template, 'node');
  assert.match(fs.readFileSync(path.join(dir, 'creator', r.id, 'config.json'), 'utf8'), /"title": "Chores"/);
});
