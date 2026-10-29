// Per-session conversation memory + a small, viewable owner-preferences store.
// Never stores secrets or raw sensitive data — just turns and simple preferences.
export function makeSession({ max = 12 } = {}) {
  const S = new Map(); // id -> { history:[], prefs:{} }
  const g = (id) => { let s = S.get(id); if (!s) { s = { history: [], prefs: {} }; S.set(id, s); } return s; };
  return {
    history: (id) => g(id).history.slice(-max),
    push: (id, ...msgs) => { const s = g(id); s.history.push(...msgs); if (s.history.length > max * 2) s.history = s.history.slice(-max * 2); },
    prefs: (id) => ({ ...g(id).prefs }),
    setPref: (id, k, v) => { g(id).prefs[k] = v; },
    clear: (id) => S.delete(id),
    size: () => S.size,
  };
}
