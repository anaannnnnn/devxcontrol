// Jarvis confirmation store. T1/T2 tool calls never execute directly: the server mints a
// single-use pending action here, the page shows/reads it, and execution happens only via an
// authenticated confirm from the page. The model is never in the confirm path and the executed
// arguments are the ones stored here, never re-read from the model.
import crypto from 'node:crypto';

export function makeConfirm({ now = () => Date.now(), ttlMs = 120000, audit = () => {} } = {}) {
  const pending = new Map(); // id -> record

  function create({ tool, args, summary, tier, user, session }) {
    const id = 'ca_' + crypto.randomBytes(9).toString('hex');
    pending.set(id, { id, tool, args, summary, tier, user, session, exp: now() + ttlMs, used: false, created: now() });
    return { id, summary, tool, tier, expiresInMs: ttlMs };
  }

  // Non-consuming peek for the confirmation card (hides nothing sensitive: summary + tool only).
  function get(id) {
    const r = pending.get(id);
    if (!r || r.used || now() > r.exp) return null;
    return { id: r.id, tool: r.tool, tier: r.tier, summary: r.summary };
  }

  // Single-use, expiring, bound to the same user + session that created it.
  function consume(id, { user, session } = {}) {
    const r = pending.get(id);
    if (!r) return { ok: false, reason: 'not-found' };
    if (r.used) return { ok: false, reason: 'already-used' };
    if (now() > r.exp) { pending.delete(id); return { ok: false, reason: 'expired' }; }
    if (r.user !== user) return { ok: false, reason: 'wrong-user' };
    if (r.session !== session) return { ok: false, reason: 'wrong-session' };
    r.used = true;
    audit('jarvis', null, `Confirmed ${r.tool} (${user})`, 'warn');
    return { ok: true, action: { tool: r.tool, args: r.args, tier: r.tier, user: r.user, session: r.session } };
  }

  function sweep() { const t = now(); for (const [id, r] of pending) if (r.used || t > r.exp) pending.delete(id); }

  // Count only still-actionable items (used/expired linger for clear error messages until sweep()).
  const size = () => { const t = now(); let n = 0; for (const r of pending.values()) if (!r.used && t <= r.exp) n++; return n; };

  return { create, get, consume, sweep, size };
}
