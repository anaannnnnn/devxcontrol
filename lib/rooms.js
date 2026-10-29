// Client Rooms: separate read-mostly accounts, one app each. Never owner sessions, logs, DB or vault.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const hash = (pw, salt = crypto.randomBytes(16)) => `s1$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64).toString('base64')}`;
const check = (pw, stored) => {
  const [v, s, h] = String(stored || '').split('$');
  if (v !== 's1' || !s || !h) return false;
  const a = crypto.scryptSync(pw, Buffer.from(s, 'base64'), 64); const b = Buffer.from(h, 'base64');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export function makeRooms({ dataDir }) {
  const file = path.join(dataDir, 'clients.json');
  let S = { clients: [], requests: [], sessions: [] };
  try { S = { ...S, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* none yet */ }
  const save = () => { const t = `${file}.tmp`; fs.writeFileSync(t, JSON.stringify({ clients: S.clients, requests: S.requests }), { mode: 0o600 }); fs.renameSync(t, file); };
  const publicClient = (c) => ({ id: c.id, appId: c.appId, name: c.name, user: c.user, logo: c.logo || null, colours: c.colours || null, subdomain: c.subdomain || null, lang: c.lang || 'en' });

  function create({ appId, name, user, password, logo, colours, subdomain, lang }) {
    const u = String(user || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(u)) throw Object.assign(new Error('Username: 2 to 31 letters, numbers, dots, dashes or underscores.'), { status: 400 });
    if (String(password || '').length < 10) throw Object.assign(new Error('Password must be at least 10 characters.'), { status: 400 });
    if (S.clients.some((c) => c.user === u)) throw Object.assign(new Error('That username is taken.'), { status: 409 });
    const sub = String(subdomain || '').trim().toLowerCase();
    if (sub && !/^[a-z0-9-]{1,40}$/.test(sub)) throw Object.assign(new Error('Subdomain: letters, numbers and dashes only.'), { status: 400 });
    const c = { id: crypto.randomBytes(4).toString('hex'), appId, name: String(name || 'Client').slice(0, 60), user: u, hash: hash(password), logo: logo ? String(logo).slice(0, 200) : null, colours: colours && typeof colours === 'object' ? { accent: String(colours.accent || '').slice(0, 20) } : null, subdomain: sub || null, lang: lang === 'ar' ? 'ar' : 'en', created: Date.now() };
    S.clients.push(c); save(); return publicClient(c);
  }
  function remove(id) { const i = S.clients.findIndex((c) => c.id === id); if (i < 0) return false; S.clients.splice(i, 1); S.requests = S.requests.filter((r) => r.clientId !== id); save(); return true; }
  function verify(user, password) {
    const c = S.clients.find((x) => x.user === String(user || '').trim().toLowerCase());
    if (!c || !check(password, c.hash)) return null;
    return publicClient(c);
  }
  function issue(clientId) {
    const token = crypto.randomBytes(18).toString('base64url');
    S.sessions = S.sessions.filter((s) => s.exp > Date.now());
    S.sessions.push({ token, clientId, exp: Date.now() + 12 * 3600e3 });
    return token;
  }
  function session(token) {
    const s = S.sessions.find((x) => x.token === token && x.exp > Date.now());
    if (!s) return null;
    const c = S.clients.find((x) => x.id === s.clientId);
    return c ? publicClient(c) : null;
  }
  function drop(token) { S.sessions = S.sessions.filter((s) => s.token !== token); }
  function requestChange(client, text) {
    const t = String(text || '').trim();
    if (t.length < 8 || t.length > 800) throw Object.assign(new Error('Describe the change in one or two sentences.'), { status: 400 });
    const r = { id: crypto.randomBytes(4).toString('hex'), clientId: client.id, appId: client.appId, text: t, state: 'draft', created: Date.now() };
    S.requests.unshift(r); if (S.requests.length > 200) S.requests.length = 200; save(); return r;
  }
  function setRequest(id, patch) {
    const r = S.requests.find((x) => x.id === id); if (!r) return null;
    Object.assign(r, patch); save(); return r;
  }
  function monthlyHtml({ app, notes = [], gifts = [], lang = 'en' }) {
    const ar = lang === 'ar';
    const dir = ar ? 'rtl' : 'ltr';
    const title = ar ? `تقرير ${app.name}` : `${app.name} monthly report`;
    const rows = notes.slice(0, 12).map((n) => `<li>${escapeHtml(n.title || n)}</li>`).join('') || `<li>${ar ? 'لا توجد ملاحظات منشورة.' : 'No published notes this period.'}</li>`;
    const gs = gifts.slice(0, 8).map((g) => `<li>${escapeHtml(g.title || g)}</li>`).join('') || `<li>${ar ? 'لا هدايا.' : 'No gifts.'}</li>`;
    return `<!doctype html><html lang="${ar ? 'ar' : 'en'}" dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:16px/1.5 system-ui;margin:2rem;color:#111} h1{font-size:1.4rem}</style></head><body><h1>${escapeHtml(title)}</h1><p>${ar ? 'وقت التشغيل والملاحظات المنشورة فقط. لا سجلات ولا قاعدة بيانات.' : 'Uptime and published notes only. No logs and no database.'}</p><h2>${ar ? 'ما الجديد' : "What's new"}</h2><ul>${rows}</ul><h2>${ar ? 'الهدايا' : 'Gifts'}</h2><ul>${gs}</ul><p>${ar ? 'للطباعة: استخدم طباعة المتصفح إلى PDF.' : 'To make a PDF: use the browser print dialog. No paid renderer is used.'}</p></body></html>`;
  }
  return { create, remove, list: (appId) => S.clients.filter((c) => !appId || c.appId === appId).map(publicClient), verify, issue, session, drop, requestChange, requests: (appId) => S.requests.filter((r) => !appId || r.appId === appId), setRequest, monthlyHtml };
}

function escapeHtml(s) {
  const map = { '&': '\u0026amp;', '<': '\u0026lt;', '>': '\u0026gt;', '"': '\u0026quot;', "'": '\u0026#39;' };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}
