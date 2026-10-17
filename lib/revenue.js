// Revenue Pulse: SELECT-shaped reads only, and an honest same-hour comparison. Never a bare number.
import { checkName } from './schema.js';

export function assertMapping(map) {
  if (!map || typeof map !== 'object') throw Object.assign(new Error('Say which table and columns mean an order.'), { status: 400 });
  return { table: checkName(map.table, 'Table'), amount: checkName(map.amount, 'Amount column'), created: checkName(map.created, 'Time column') };
}

export function selectAll(table) {
  const t = checkName(table, 'Table');
  return `SELECT * FROM "${t.replace(/"/g, '""')}"`;
}

function hourKey(t) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 13);
}
function dayKey(t) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function aggregate(rows, map) {
  const m = assertMapping(map);
  const hourly = new Map(); const daily = new Map();
  let used = 0; let skipped = 0;
  for (const r of rows || []) {
    const when = Date.parse(r[m.created]);
    const amount = Number(r[m.amount]);
    if (!Number.isFinite(when) || !Number.isFinite(amount)) { skipped++; continue; }
    used++;
    const hk = hourKey(when); const dk = dayKey(when);
    const h = hourly.get(hk) || { t: hk, orders: 0, revenue: 0 };
    h.orders++; h.revenue += amount; hourly.set(hk, h);
    const d = daily.get(dk) || { t: dk, orders: 0, revenue: 0 };
    d.orders++; d.revenue += amount; daily.set(dk, d);
  }
  const hours = [...hourly.values()].sort((a, b) => a.t.localeCompare(b.t));
  const days = [...daily.values()].sort((a, b) => a.t.localeCompare(b.t));
  return {
    measured: used > 0, reason: used ? null : 'not measured: no rows had both a numeric amount and a parseable time in the columns you mapped.',
    used, skipped, hours, days, mapping: m,
  };
}

/** Compare the incident hour to the same hour in earlier weeks. Needs at least two prior weeks. */
export function revenueAtRisk(hours, incidentAt) {
  const key = hourKey(incidentAt);
  if (!key) return { measured: false, reason: 'not measured: the incident has no time.' };
  const hour = key.slice(11, 13);
  const day = key.slice(0, 10);
  const same = (hours || []).filter((h) => String(h.t).slice(11, 13) === hour);
  const prior = same.filter((h) => String(h.t).slice(0, 10) < day).slice(-8);
  const current = same.find((h) => h.t === key);
  if (prior.length < 2) return { measured: false, reason: `not measured: need the same hour in at least 2 earlier weeks. Have ${prior.length}.`, method: 'same-hour prior weeks' };
  const vals = prior.map((h) => h.revenue);
  const mean = vals.reduce((s, n) => s + n, 0) / vals.length;
  const variance = vals.reduce((s, n) => s + (n - mean) ** 2, 0) / (vals.length - 1);
  const sd = Math.sqrt(variance);
  const observed = current ? current.revenue : null;
  if (observed == null) return { measured: false, reason: 'not measured: that hour has no revenue row, so a gap cannot be compared.', method: 'same-hour prior weeks', baseline: { mean, sd, weeks: prior.length } };
  const gap = Math.max(0, mean - observed);
  const uncertainty = mean ? Math.round((sd / mean) * 100) : null;
  return {
    measured: true, reason: null,
    method: 'Compared this clock-hour with the same hour in earlier weeks. The figure is mean minus observed, floored at zero. It is not a forecast.',
    atRisk: Math.round(gap * 100) / 100,
    observed, baselineMean: Math.round(mean * 100) / 100,
    uncertaintyPct: uncertainty,
    weeks: prior.length,
    note: uncertainty != null && uncertainty > 50 ? 'The earlier weeks disagree with each other, so this estimate is weak.' : 'Earlier weeks are close enough to use as a baseline.',
  };
}

export function dynamoNote() {
  return { measured: false, reason: 'not measurable here: this app uses DynamoDB, and Revenue Pulse only reads Postgres or SQLite.' };
}
