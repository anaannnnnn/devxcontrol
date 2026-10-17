// Weekly Gift: one small upgrade per app per week. Never auth, payments or schema unless explicitly allowed.
const BLOCK = [
  { re: /auth|password|session|2fa|sign-?in|login/i, id: 'auth', flag: 'giftAllowAuth' },
  { re: /payment|stripe|billing|checkout|card/i, id: 'payments', flag: null },
  { re: /schema|migrat|alter table|drop table/i, id: 'schema', flag: 'giftAllowSchema' },
];

export function weekKey(t = Date.now()) {
  const d = new Date(t);
  const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function blockedReason(item, flags = {}) {
  const text = `${item.title || ''} ${item.detail || ''} ${item.id || ''}`;
  for (const b of BLOCK) {
    if (b.re.test(text) && !(b.flag && flags[b.flag] === true)) return b.id;
  }
  return null;
}

export function pickGift(candidates, { week, previousWeek, flags = {}, taste = [] } = {}) {
  if (previousWeek && previousWeek === week) return { ok: false, reason: 'A gift was already prepared for this app this week.' };
  const safe = [];
  const skipped = [];
  for (const c of candidates || []) {
    const why = blockedReason(c, flags);
    if (why) skipped.push({ id: c.id, why });
    else safe.push(c);
  }
  if (!safe.length) return { ok: false, reason: skipped.length ? 'Every candidate touches auth, payments or schema, and that is not allowed for this app.' : 'Nothing to give: no upgrade, gap, ghost finding or design-debt item is open.', skipped };
  const rank = new Map(taste.map((t, i) => [t.id, taste.length - i]));
  safe.sort((a, b) => (rank.get(b.id) || 0) - (rank.get(a.id) || 0) || ({ High: 3, Med: 2, Low: 1 }[b.impact] || 0) - ({ High: 3, Med: 2, Low: 1 }[a.impact] || 0));
  return { ok: true, item: safe[0], skipped, week };
}
