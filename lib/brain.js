// Fleet Brain: local fix patterns and a taste profile. Secrets are stripped before anything is stored.
const SECRET = /(password|passwd|secret|token|api[_-]?key|authorization|bearer)\s*[:=]\s*\S+/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function stripSecrets(text) {
  return String(text || '')
    .replace(SECRET, '$1=<redacted>')
    .replace(EMAIL, '<email>')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '<number>')
    .slice(0, 500);
}

export function signatureOf({ title = '', rule = '', file = '' } = {}) {
  const raw = stripSecrets(`${rule} ${title} ${file}`);
  return raw.toLowerCase()
    .replace(/[0-9a-f]{7,}/g, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/[^a-z<>\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export function tokens(sig) {
  return new Set(String(sig || '').split(' ').filter((w) => w && w !== '<n>' && w !== '<hex>'));
}

export function jaccard(a, b) {
  const A = a instanceof Set ? a : tokens(a);
  const B = b instanceof Set ? b : tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function similarFixes(patterns, sig, min = 0.45) {
  const s = signatureOf(typeof sig === 'string' ? { title: sig } : sig);
  return (patterns || [])
    .map((p) => ({ ...p, score: Math.round(jaccard(s, p.signature) * 100) / 100 }))
    .filter((p) => p.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function tasteRank(items, profile = {}) {
  const up = profile.up || {}; const down = profile.down || {};
  return [...(items || [])].map((it) => {
    const area = it.area || it.id || 'general';
    const bias = (up[area] || 0) - (down[area] || 0);
    return { ...it, taste: bias };
  }).sort((a, b) => b.taste - a.taste || String(a.id).localeCompare(String(b.id)));
}

export function bumpTaste(profile, area, approved) {
  const p = { up: { ...(profile?.up || {}) }, down: { ...(profile?.down || {}) } };
  const k = String(area || 'general').slice(0, 40);
  if (approved) p.up[k] = (p.up[k] || 0) + 1; else p.down[k] = (p.down[k] || 0) + 1;
  return p;
}
