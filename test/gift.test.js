import test from 'node:test';
import assert from 'node:assert/strict';
import { pickGift, weekKey, blockedReason } from '../lib/gift.js';

test('one gift per week, and auth or schema is skipped unless allowed', () => {
  const week = weekKey(Date.UTC(2026, 0, 15));
  assert.match(week, /^2026-W/);
  const items = [
    { id: 'auth-fix', title: 'Change the login password flow', impact: 'High' },
    { id: 'gap:booking', title: 'Table booking', impact: 'Med', area: 'booking' },
  ];
  assert.equal(blockedReason(items[0], {}), 'auth');
  const first = pickGift(items, { week, previousWeek: null, flags: {} });
  assert.equal(first.ok, true);
  assert.equal(first.item.id, 'gap:booking');
  const again = pickGift(items, { week, previousWeek: week, flags: {} });
  assert.equal(again.ok, false);
  assert.match(again.reason, /already/);
  const onlyAuth = pickGift([items[0]], { week, flags: {} });
  assert.equal(onlyAuth.ok, false);
  const allowed = pickGift([items[0]], { week, flags: { giftAllowAuth: true } });
  assert.equal(allowed.ok, true);
});
