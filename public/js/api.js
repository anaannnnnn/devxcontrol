// Thin API client: CSRF header on writes, RFC 7807 errors surfaced as Error.message, SSE helper.
let csrf = null;
let onUnauth = () => {};
export const setCsrf = (v) => { csrf = v; };
export const setUnauthHandler = (fn) => { onUnauth = fn; };

export async function api(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch('/api/v1' + path, {
    method, signal, credentials: 'same-origin',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/session')) onUnauth();
  if (!res.ok) {
    let p = null; try { p = await res.json(); } catch { /* not json */ }
    throw Object.assign(new Error(p?.detail || res.statusText || 'Request failed'), { status: res.status, problem: p });
  }
  if (res.status === 204) return null;
  return (res.headers.get('content-type') || '').includes('json') ? res.json() : res.text();
}

/** Server-sent events with automatic cleanup. handlers: {log, line, done, error} */
export function stream(path, handlers) {
  const es = new EventSource('/api/v1' + path, { withCredentials: true });
  for (const [ev, fn] of Object.entries(handlers)) {
    if (ev === 'error') continue;
    es.addEventListener(ev, (e) => { try { fn(JSON.parse(e.data)); } catch { /* ignore malformed */ } });
  }
  es.onerror = () => { handlers.error?.(); if (es.readyState === EventSource.CLOSED) return; };
  return { close: () => es.close() };
}
