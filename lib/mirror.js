// Competitor Mirror: public pages only. Store derived facts, never a copy of the page.
export const UA = 'DevX-Control-Mirror/1.0 (+https://devxpert.shop; public-page-compare)';
export const FEATURE_WORDS = ['booking', 'reservation', 'reviews', 'rating', 'cart', 'checkout', 'pricing', 'login', 'contact', 'menu', 'loyalty', 'whatsapp'];

export function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw Object.assign(new Error('That is not a URL.'), { status: 400 }); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw Object.assign(new Error('Only http and https pages can be mirrored.'), { status: 400 });
  if (u.username || u.password) throw Object.assign(new Error('Do not put a username or password in the URL.'), { status: 400 });
  u.hash = '';
  return u;
}

export function parseRobots(text) {
  const groups = [];
  let cur = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const s = line.replace(/#.*$/, '').trim();
    if (!s) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(s);
    if (!m) continue;
    const k = m[1].toLowerCase(); const v = m[2].trim();
    if (k === 'user-agent') { cur = { agents: [v.toLowerCase()], allow: [], disallow: [] }; groups.push(cur); }
    else if (!cur) continue;
    else if (k === 'allow') cur.allow.push(v);
    else if (k === 'disallow') cur.disallow.push(v);
  }
  return groups;
}

const specificity = (rule, path) => (path.startsWith(rule) ? rule.length : -1);

/** True when robots.txt allows UA to fetch path. Empty robots allows. */
export function robotsAllows(text, path, ua = UA) {
  const groups = parseRobots(text);
  if (!groups.length) return true;
  const name = ua.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a === '*' || name.includes(a)));
  const rules = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  if (!rules.length) return true;
  let best = { len: -1, allow: true };
  for (const g of rules) {
    for (const r of g.allow) { const n = specificity(r, path); if (n > best.len) best = { len: n, allow: true }; }
    for (const r of g.disallow) { if (r === '') continue; const n = specificity(r, path); if (n > best.len) best = { len: n, allow: false }; }
  }
  return best.allow;
}

export function derivePublic(html, bytes) {
  const raw = String(html || '');
  const noScript = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = noScript.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const title = (raw.match(/<title[^>]*>([^<]*)/i)?.[1] || '').trim().slice(0, 120);
  const h1 = (noScript.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim().slice(0, 80);
  const lower = text.toLowerCase();
  const features = FEATURE_WORDS.filter((w) => lower.includes(w));
  const links = (raw.match(/<a\b/gi) || []).length;
  const forms = (raw.match(/<form\b/gi) || []).length;
  const imgs = (raw.match(/<img\b/gi) || []).length;
  const hex = [...new Set((raw.match(/#[0-9a-f]{6}\b/gi) || []).map((c) => c.toLowerCase()))].slice(0, 8);
  return {
    titleLength: title.length, hasTitle: !!title, h1: h1 ? 'present' : 'absent',
    features, links, forms, images: imgs, bytes: bytes ?? raw.length,
    paletteSample: hex, layoutDensity: links + forms > 40 ? 'dense' : links + forms > 12 ? 'medium' : 'sparse',
  };
}

export function gapAgainst(mine, theirs) {
  const a = new Set(mine || []); const b = new Set(theirs || []);
  const missing = [...b].filter((x) => !a.has(x));
  const shared = [...b].filter((x) => a.has(x));
  return { missing, shared, note: 'Feature words found on the public page. This is not a copy of their copy or their code.' };
}
