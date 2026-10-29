// Proving Ground: compare shadow vs live responses, and decide a rollback from real samples only.
const SENSITIVE = /pass|secret|token|pin|email|phone|mobile|card|iban|ssn|address/i;

export function maskRow(row, extra = []) {
  const ban = new Set(extra.map((c) => c.toLowerCase()));
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[k] = ban.has(k.toLowerCase()) || SENSITIVE.test(k) ? null : v;
  }
  return out;
}

export function maskRows(rows, extra = []) {
  return (rows || []).map((r) => maskRow(r, extra));
}

export function shapeOf(body) {
  if (body == null || body === '') return { kind: 'empty' };
  const text = String(body);
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) return { kind: 'array', length: j.length, keys: j[0] && typeof j[0] === 'object' ? Object.keys(j[0]).sort() : [] };
    if (j && typeof j === 'object') return { kind: 'object', keys: Object.keys(j).sort() };
    return { kind: typeof j };
  } catch {
    return { kind: 'text', bytes: text.length };
  }
}

export function comparePair(live, shadow) {
  const liveStatus = live?.status ?? null;
  const shadowStatus = shadow?.status ?? null;
  if (liveStatus == null || shadowStatus == null) {
    return { path: live?.path || shadow?.path || '/', measured: false, reason: 'One side did not return a status code.' };
  }
  const ls = shapeOf(live.body);
  const ss = shapeOf(shadow.body);
  const shapeSame = JSON.stringify(ls) === JSON.stringify(ss);
  return {
    path: live.path, measured: true, reason: null,
    statusSame: liveStatus === shadowStatus, liveStatus, shadowStatus,
    latencyDeltaMs: (shadow.ms ?? null) != null && (live.ms ?? null) != null ? shadow.ms - live.ms : null,
    shapeSame, liveShape: ls, shadowShape: ss,
  };
}

export function verdict(pairs) {
  const rows = (pairs || []).map((p) => comparePair(p?.live || p, p?.shadow));
  const measured = rows.filter((r) => r.measured);
  if (!measured.length) return { measured: false, reason: 'not measured: no paired responses. A shadow was not compared.', rows, statusMismatches: null, shapeMismatches: null, p95DeltaMs: null };
  const statusMismatches = measured.filter((r) => !r.statusSame).length;
  const shapeMismatches = measured.filter((r) => !r.shapeSame).length;
  const deltas = measured.map((r) => r.latencyDeltaMs).filter((n) => n != null).sort((a, b) => a - b);
  const p95DeltaMs = deltas.length ? deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.95))] : null;
  const ok = statusMismatches === 0 && shapeMismatches === 0;
  return { measured: true, reason: null, ok, rows, statusMismatches, shapeMismatches, p95DeltaMs, samples: measured.length };
}

function p95(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
}

/** before/after are monitor-like samples: { ok?: boolean, s?: string, ms: number|null } */
export function rollbackDecision({ before = [], after = [], minSamples = 8, errorRatePct = 5, p95ExtraMs = 150 }) {
  const norm = (list) => list.map((x) => ({ ok: x.ok != null ? !!x.ok : x.s === 'h' || x.s === 'healthy' || x.s === 'd', ms: x.ms })).filter((x) => x.ms != null || x.ok != null);
  const b = norm(before); const a = norm(after);
  if (b.length < minSamples || a.length < minSamples) {
    return { measured: false, action: 'hold', reason: `not measured: need at least ${minSamples} samples before and after. Have ${b.length} before and ${a.length} after.` };
  }
  const rate = (list) => (list.filter((x) => x.ok === false).length / list.length) * 100;
  const beforeErr = rate(b); const afterErr = rate(a);
  const beforeP = p95(b.map((x) => x.ms).filter((n) => n != null));
  const afterP = p95(a.map((x) => x.ms).filter((n) => n != null));
  const errWorse = afterErr - beforeErr > errorRatePct;
  const latWorse = beforeP != null && afterP != null && afterP - beforeP > p95ExtraMs;
  const action = errWorse || latWorse ? 'rollback' : 'keep';
  return {
    measured: true, action, reason: null,
    before: { samples: b.length, errorPct: Math.round(beforeErr * 10) / 10, p95Ms: beforeP },
    after: { samples: a.length, errorPct: Math.round(afterErr * 10) / 10, p95Ms: afterP },
    thresholds: { errorRatePct, p95ExtraMs, minSamples },
    why: errWorse ? 'Error rate rose past the threshold you set.' : latWorse ? 'p95 latency rose past the threshold you set.' : 'Error rate and p95 stayed inside the thresholds.',
  };
}

export const STEPS = ['prepare', 'shadow', 'replay', 'verdict', 'awaiting-approval', 'watching', 'promoted', 'rolled-back', 'stopped'];
