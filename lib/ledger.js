// Ledger: a thin, read-only bridge to the local report engine (GET /api/meta, POST /api/run) plus a Nexus health probe.
// Everything the browser sends is checked here first; the engine re-checks it. Nothing is written anywhere.

export const KINDS = ['sales', 'purchase', 'perf', 'stock', 'move', 'age', 'ageItems', 'lines'];
// Breakdowns each kind accepts (mirrors the engine). Empty list: the kind takes no breakdown.
const ALL = ['day', 'month', 'branch', 'location', 'department', 'category', 'subcategory', 'brand', 'supplier', 'item', 'customer', 'voucher', 'salesman'];
export const KIND_GROUPS = {
  sales: ALL,
  purchase: ALL.filter((g) => g !== 'salesman'),
  perf: ['department', 'category', 'brand', 'supplier', 'branch', 'item'],
  stock: ['department', 'category', 'brand', 'supplier', 'location', 'item'],
  move: ['department', 'location', 'item'],
  age: [], ageItems: [], lines: [],
};
export const NO_DATES = new Set(['stock', 'age', 'ageItems']);
export const MAX_DAYS = 366;
const MIN_DATE = '2000-01-01';
// Optional filters and their length caps. Codes are plain; the free-text search allows a bit more.
const FILTERS = { br: 10, loc: 10, item: 40, dept: 20, cat: 20, sub: 20, brand: 20, supplier: 20, bucket: 20 };
const CODE = /^[A-Za-z0-9._-]*$/;
const Q = /^[\p{L}\p{N} .,&'()/_-]*$/u;

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const DAY = 86400000;

export function isoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(v + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? v : null;
}

/** Validate a run request. Returns a clean body for the engine or throws a 400 Error. */
export function validateRun(body, { today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Send a report request.');
  const kind = body.kind;
  if (typeof kind !== 'string' || !KINDS.includes(kind)) throw bad(`Unknown report. Choose one of: ${KINDS.join(', ')}.`);
  const out = { kind };
  const groups = KIND_GROUPS[kind];
  if (groups.length) {
    if (typeof body.group !== 'string' || !groups.includes(body.group)) throw bad(`Choose a breakdown for ${kind}: ${groups.join(', ')}.`);
    out.group = body.group;
  } else if (body.group != null && body.group !== '') throw bad(`${kind} takes no breakdown.`);
  else out.group = '';
  if (!NO_DATES.has(kind)) {
    const from = isoDate(body.from); const to = isoDate(body.to);
    if (!from || !to) throw bad('Choose a from date and a to date (YYYY-MM-DD).');
    if (from < MIN_DATE) throw bad(`Dates start at ${MIN_DATE}.`);
    if (to > today) throw bad('The to date is in the future.');
    if (to < from) throw bad('The to date is before the from date.');
    const days = (Date.parse(to) - Date.parse(from)) / DAY + 1;
    if (days > MAX_DAYS) throw bad(`A report can cover up to ${MAX_DAYS} days.`);
    out.from = from; out.to = to;
  }
  if (body.q != null && body.q !== '') {
    if (typeof body.q !== 'string' || body.q.length > 80 || !Q.test(body.q)) throw bad('Search is up to 80 letters, numbers and simple punctuation.');
    out.q = body.q.trim();
  }
  for (const [k, max] of Object.entries(FILTERS)) {
    const v = body[k];
    if (v == null || v === '') continue;
    if (typeof v !== 'string' || v.length > max || !CODE.test(v)) throw bad(`Filter "${k}" must be a code of up to ${max} characters.`);
    out[k] = v;
  }
  if (kind === 'lines' && body.flow != null) {
    if (body.flow !== 'sales' && body.flow !== 'purchase') throw bad('Lines flow is sales or purchase.');
    out.flow = body.flow;
  }
  out.page = Math.min(Math.max(0, Math.trunc(Number(body.page) || 0)), 1000);
  out.limit = Math.min(Math.max(1, Math.trunc(Number(body.limit) || 300)), 1000);
  return out;
}

export function makeLedger({ engineUrl = 'http://127.0.0.1:4180', healthUrl = 'https://nexus.devxpert.online/api/health', fetchImpl = globalThis.fetch, timeoutMs = 60000 } = {}) {
  const base = engineUrl.replace(/\/+$/, '');
  const fail = (msg, status = 502) => Object.assign(new Error(msg), { status });
  async function call(path, init = {}, ms = timeoutMs) {
    let r;
    try { r = await fetchImpl(base + path, { ...init, signal: AbortSignal.timeout(ms) }); }
    catch (e) { throw fail(`Report engine unreachable (${e.cause?.code || e.name || 'error'}).`, 503); }
    let data = null; try { data = await r.json(); } catch { /* not json */ }
    if (!r.ok) throw fail(String(data?.error || `Report engine said ${r.status}.`).slice(0, 200), r.status >= 400 && r.status < 500 ? 400 : 502);
    if (!data || typeof data !== 'object') throw fail('Report engine sent something that is not JSON.');
    return data;
  }
  return {
    meta: () => call('/api/meta', {}, 10000),
    run: async (body, opts) => { const clean = validateRun(body, opts); return call('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(clean) }); },
    /** {up, status, ms, detail}. Never throws. */
    async nexus() {
      const t0 = Date.now();
      try {
        const r = await fetchImpl(healthUrl, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
        let detail = null; try { const d = await r.json(); detail = typeof d === 'object' && d ? (d.status ?? d.ok ?? null) : null; } catch { /* not json */ }
        return { up: r.ok, status: r.status, ms: Date.now() - t0, detail };
      } catch (e) { return { up: false, status: null, ms: Date.now() - t0, detail: e.cause?.code || e.name || 'error' }; }
    },
    async engine() {
      try { const m = await call('/api/meta', {}, 5000); return { up: true, from: m.from ?? null, to: m.to ?? null, branches: Array.isArray(m.branches) ? m.branches.length : null }; }
      catch (e) { return { up: false, detail: e.message }; }
    },
  };
}
