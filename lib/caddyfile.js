// Minimal Caddyfile site-block editing: find, remove and upsert a reverse-proxy block for one host.
const OPEN = /^([^\s#({}][^{}]*?)\s*\{\s*$/;

/** All top-level site blocks: {hosts, start, end (line indexes, inclusive), body}. */
export function blocks(text) {
  const lines = text.split('\n'); const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = OPEN.exec(lines[i]); if (!m) continue;
    let depth = 0; let j = i;
    for (; j < lines.length; j++) {
      const l = lines[j].replace(/#.*$/, '');
      depth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
      if (depth <= 0) break;
    }
    out.push({ hosts: m[1].split(/[\s,]+/).filter(Boolean).map((h) => h.toLowerCase()), start: i, end: Math.min(j, lines.length - 1), body: lines.slice(i, j + 1).join('\n') });
    i = j;
  }
  return out;
}
export const upstreamOf = (body) => /reverse_proxy\s+(?:https?:\/\/)?([^\s{]+)/.exec(body)?.[1] || null;
export const findBlock = (text, host) => blocks(text).find((b) => b.hosts.includes(String(host).toLowerCase())) || null;

/** Remove blocks (and the "# devx-control: id" marker line above them) for the given line ranges. */
function cut(text, ranges) {
  const lines = text.split('\n'); const kill = new Set();
  for (const r of ranges) { for (let k = r.start; k <= r.end; k++) kill.add(k); if (r.start > 0 && /^#\s*devx-control:/.test(lines[r.start - 1])) kill.add(r.start - 1); }
  return lines.filter((_, i) => !kill.has(i)).join('\n').replace(/\n{3,}/g, '\n\n');
}
export const markerFor = (text, b) => { const l = text.split('\n')[b.start - 1] || ''; return /^#\s*devx-control:\s*(\S+)/.exec(l)?.[1] || null; };

/** Point `host` at `upstream` (for example "myapp:3000"). Also drops older blocks this app owns (old domains). */
export function upsert(text, { id, host, upstream, owns = [] }) {
  host = host.toLowerCase();
  const ranges = blocks(text).filter((b) => b.hosts.includes(host) || markerFor(text, b) === id || b.hosts.some((h) => owns.includes(h)));
  const base = cut(text, ranges).replace(/\s+$/, '');
  return `${base}${base ? '\n' : ''}\n# devx-control: ${id}\n${host} {\n\treverse_proxy ${upstream}\n}\n`;
}

/** Drop every block this app owns (by marker) or that serves one of `hosts`. */
export function removeFor(text, { id, hosts = [] }) {
  const set = hosts.map((h) => h.toLowerCase());
  const ranges = blocks(text).filter((b) => markerFor(text, b) === id || b.hosts.some((h) => set.includes(h)));
  return { text: cut(text, ranges), removed: ranges.length };
}
