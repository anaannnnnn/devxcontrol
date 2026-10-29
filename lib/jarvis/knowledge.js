// Pure-JS BM25 search (no dependencies) over the fleet's own documents, so Jarvis answers
// from real data and cites a source. Docs: {id, source, title, text}. Rebuilt on change.
const STOP = new Set(('a an the and or of to in on for is are was be as at by it this that with from '
  + 'your you we our i do does how what when which who whom where why').split(' '));

const tokenize = (s) => String(s || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 1 && !STOP.has(w)) || [];

export function buildIndex(docs = []) {
  const D = docs.map((d, i) => ({ i, id: d.id, source: d.source || d.id, title: d.title || '', text: d.text || '' }));
  const tf = [];        // per-doc term -> count
  const df = new Map();  // term -> doc count
  let totalLen = 0;
  for (const d of D) {
    const toks = tokenize(`${d.title} ${d.title} ${d.text}`); // title weighted ×2
    const m = new Map();
    for (const t of toks) m.set(t, (m.get(t) || 0) + 1);
    tf[d.i] = m; d.len = toks.length; totalLen += toks.length;
    for (const t of m.keys()) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = D.length || 1;
  const avgdl = totalLen / N || 1;
  const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));

  function search(query, k = 5) {
    const q = [...new Set(tokenize(query))];
    const k1 = 1.5, b = 0.75;
    const scored = D.map((d) => {
      let s = 0;
      for (const t of q) {
        const f = tf[d.i].get(t) || 0; if (!f) continue;
        s += idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len / avgdl)));
      }
      return { score: s, doc: d };
    }).filter((x) => x.score > 0).sort((a, b2) => b2.score - a.score).slice(0, k);
    return scored.map(({ score, doc }) => ({
      id: doc.id, source: doc.source, title: doc.title, score: +score.toFixed(3),
      snippet: snippet(doc.text, q),
    }));
  }
  return { search, size: N };
}

// A short window of text around the first query-term hit.
function snippet(text, q, width = 220) {
  const low = text.toLowerCase();
  let at = -1;
  for (const t of q) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return text.slice(0, width).trim();
  const start = Math.max(0, at - 60);
  return (start > 0 ? '…' : '') + text.slice(start, start + width).trim() + (start + width < text.length ? '…' : '');
}

// Assemble documents from live fleet data. Caller passes what it has; all optional.
export function fleetDocs({ registry, readme = '', openapi = '', releaseNotes = [], findings = [], reviews = [] } = {}) {
  const docs = [];
  if (readme) docs.push({ id: 'readme', source: 'README', title: 'DevX Control', text: readme });
  if (openapi) docs.push({ id: 'openapi', source: 'openapi.yaml', title: 'API', text: openapi });
  for (const a of registry?.apps || []) {
    docs.push({ id: `app:${a.id}`, source: `app ${a.id}`, title: `${a.name} ${a.id}`,
      text: `${a.name}. ${a.tagline || ''}. Stack: ${a.stack || ''}. Group: ${a.group || ''}. URLs: ${(a.urls || []).map((u) => u.url).join(', ')}. Containers: ${(a.containers || []).join(', ')}.` });
  }
  for (const r of releaseNotes) docs.push({ id: `rel:${r.id || r.app}`, source: `release ${r.app || ''}`, title: r.title || 'Release', text: r.body || r.summary || '' });
  for (const f of findings) docs.push({ id: `find:${f.id}`, source: `finding ${f.app}`, title: f.title || 'Finding', text: `${f.title} in ${f.file || ''}. ${f.rule || ''} severity ${f.sev || ''}.` });
  for (const rv of reviews) docs.push({ id: `rev:${rv.id}`, source: `review ${rv.app}`, title: rv.title || 'Review', text: rv.summary || rv.explain || '' });
  return docs;
}
