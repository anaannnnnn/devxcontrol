// Per-session rate limits + a global kill switch / read-only mode for Jarvis.
// Token buckets per (key, kind). Kinds: "request", "tool", "action". A kill switch disables
// all T1/T2 actions instantly; read-only mode disables actions but allows questions.
export function makeRateLimit({ now = () => Date.now(), limits = {} } = {}) {
  const L = { request: 30, tool: 40, action: 10, ...limits }; // per rolling minute
  const buckets = new Map(); // `${key}:${kind}` -> { tokens, ts }
  let killed = false;       // global kill switch
  let readOnly = false;     // actions off, questions on

  function take(key, kind) {
    const cap = L[kind] ?? 30;
    const id = `${key}:${kind}`;
    const t = now();
    let b = buckets.get(id);
    if (!b) { b = { tokens: cap, ts: t }; buckets.set(id, b); }
    // refill linearly over 60s
    const refill = ((t - b.ts) / 60000) * cap;
    b.tokens = Math.min(cap, b.tokens + refill);
    b.ts = t;
    if (b.tokens < 1) return { ok: false, retryMs: Math.ceil((1 - b.tokens) / cap * 60000) };
    b.tokens -= 1;
    return { ok: true };
  }

  return {
    request: (key) => take(key, 'request'),
    tool: (key) => take(key, 'tool'),
    // Actions also respect the kill switch and read-only mode.
    action: (key) => {
      if (killed) return { ok: false, reason: 'kill-switch' };
      if (readOnly) return { ok: false, reason: 'read-only' };
      return take(key, 'action');
    },
    setKill: (v) => { killed = !!v; },
    setReadOnly: (v) => { readOnly = !!v; },
    state: () => ({ killed, readOnly, limits: L }),
  };
}
