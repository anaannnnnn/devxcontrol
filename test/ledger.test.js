import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRun, makeLedger, KINDS, MAX_DAYS } from '../lib/ledger.js';

const today = '2026-10-19';
const ok = (b) => validateRun(b, { today });
const rejects = (b, re) => assert.throws(() => ok(b), (e) => e.status === 400 && (!re || re.test(e.message)));

test('only the eight known kinds are accepted', () => {
  assert.deepEqual(KINDS, ['sales', 'purchase', 'perf', 'stock', 'move', 'age', 'ageItems', 'lines']);
  for (const kind of ['drop', 'SALES', '', 'constructor', '__proto__', 'toString']) rejects({ kind, group: 'branch', from: '2026-10-01', to: '2026-10-02' }, /Unknown report/);
  rejects({ kind: ['sales'], group: 'branch', from: '2026-10-01', to: '2026-10-02' });
  rejects(null); rejects([]); rejects('sales');
});

test('groups are checked per kind', () => {
  assert.equal(ok({ kind: 'sales', group: 'salesman', from: '2026-10-01', to: '2026-10-02' }).group, 'salesman');
  rejects({ kind: 'purchase', group: 'salesman', from: '2026-10-01', to: '2026-10-02' }, /breakdown/);
  rejects({ kind: 'stock', group: 'day' }, /breakdown/);
  rejects({ kind: 'sales', group: 'branch; DROP TABLE x', from: '2026-10-01', to: '2026-10-02' });
  rejects({ kind: 'age', group: 'branch' }, /no breakdown/);
  assert.equal(ok({ kind: 'age' }).group, '');
});

test('dates are real, ordered, not in the future and capped', () => {
  const base = { kind: 'sales', group: 'branch' };
  assert.deepEqual(ok({ ...base, from: '2026-10-01', to: '2026-10-19' }), { kind: 'sales', group: 'branch', from: '2026-10-01', to: '2026-10-19', page: 0, limit: 300 });
  rejects({ ...base, from: '2026-02-30', to: '2026-03-01' }, /from date/);
  rejects({ ...base, from: '2026/10/01', to: '2026-10-02' });
  rejects({ ...base, from: '2026-10-05', to: '2026-10-01' }, /before/);
  rejects({ ...base, from: '2026-10-01', to: '2026-10-20' }, /future/);
  rejects({ ...base, from: '1999-12-31', to: '2000-01-02' }, /start at/);
  rejects({ ...base, from: '2025-01-01', to: '2026-10-19' }, new RegExp(`${MAX_DAYS} days`));
  assert.ok(ok({ ...base, from: '2025-10-19', to: '2026-10-19' }));
  // date-free kinds drop dates entirely
  assert.equal(ok({ kind: 'stock', group: 'item', from: 'junk', to: 'junk' }).from, undefined);
});

test('string filters are capped and charset-limited; page/limit clamped', () => {
  const base = { kind: 'lines', from: '2026-10-01', to: '2026-10-02' };
  assert.equal(ok({ ...base, q: 'Al Ain milk 1.5L' }).q, 'Al Ain milk 1.5L');
  rejects({ ...base, q: 'x'.repeat(81) }, /80/);
  rejects({ ...base, q: "a'; --\u0000" });
  rejects({ ...base, br: '12345678901' }, /br/);
  rejects({ ...base, item: 'A B' }, /item/);
  rejects({ ...base, item: { $ne: 1 } }, /item/);
  assert.equal(ok({ ...base, br: '38', item: 'ITM-001' }).br, '38');
  rejects({ ...base, flow: 'both' }, /flow/);
  const c = ok({ ...base, page: 99999, limit: 1e9, extra: 'ignored' });
  assert.equal(c.page, 1000); assert.equal(c.limit, 1000); assert.equal(c.extra, undefined);
});

function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => { calls.push({ url, init }); return handler(url, init); };
  return { fn, calls };
}
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('run validates before calling the engine, then posts the clean body', async () => {
  const m = mockFetch(() => json(200, { title: 'Sales by branch', columns: [{ key: 'code', label: 'Code' }], rows: [{ code: '38' }] }));
  const L = makeLedger({ engineUrl: 'http://engine.test:4180/', fetchImpl: m.fn });
  await assert.rejects(L.run({ kind: 'nope' }), /Unknown report/);
  assert.equal(m.calls.length, 0, 'invalid input never reaches the engine');
  const r = await L.run({ kind: 'sales', group: 'branch', from: '2026-10-01', to: '2026-10-02', evil: 'x' }, { today });
  assert.equal(r.title, 'Sales by branch');
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0].url, 'http://engine.test:4180/api/run');
  assert.equal(m.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(m.calls[0].init.body), { kind: 'sales', group: 'branch', from: '2026-10-01', to: '2026-10-02', page: 0, limit: 300 });
});

test('engine errors and outages surface as clean statuses', async () => {
  const L400 = makeLedger({ fetchImpl: mockFetch(() => json(400, { error: 'That breakdown is not available.' })).fn });
  await assert.rejects(L400.run({ kind: 'age' }), (e) => e.status === 400 && /not available/.test(e.message));
  const L500 = makeLedger({ fetchImpl: mockFetch(() => json(500, { error: 'boom' })).fn });
  await assert.rejects(L500.meta(), (e) => e.status === 502);
  const down = makeLedger({ fetchImpl: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); } });
  await assert.rejects(down.meta(), (e) => e.status === 503 && /ECONNREFUSED/.test(e.message));
  assert.deepEqual(await down.engine(), { up: false, detail: 'Report engine unreachable (ECONNREFUSED).' });
});

test('status: engine meta summary and Nexus health never throw', async () => {
  const m = mockFetch((url) => (url.includes('/api/meta') ? json(200, { from: '2026-01-01', to: today, branches: [{}, {}] }) : json(200, { status: 'ok' })));
  const L = makeLedger({ engineUrl: 'http://e', healthUrl: 'https://nexus.test/api/health', fetchImpl: m.fn });
  assert.deepEqual(await L.engine(), { up: true, from: '2026-01-01', to: today, branches: 2 });
  const n = await L.nexus();
  assert.equal(n.up, true); assert.equal(n.status, 200); assert.equal(n.detail, 'ok');
  assert.equal(m.calls.at(-1).url, 'https://nexus.test/api/health');
  const sick = makeLedger({ fetchImpl: mockFetch(() => json(503, {})).fn });
  assert.equal((await sick.nexus()).up, false);
  const gone = makeLedger({ fetchImpl: async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); } });
  assert.deepEqual({ ...(await gone.nexus()), ms: 0 }, { up: false, status: null, ms: 0, detail: 'TimeoutError' });
});
