// Encrypted credential vault for logins you create in the dashboard (AES-256-GCM, key derived with scrypt).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function makeVault({ dataDir, key }) {
  const file = path.join(dataDir, 'vault.json');
  const k = crypto.scryptSync(key, 'devx-control-vault-v1', 32);
  let items = [];
  const enc = (text) => {
    const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', k, iv);
    const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
  };
  const dec = (b64) => {
    try {
      const b = Buffer.from(b64, 'base64'); const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    } catch { return null; }
  };
  try { items = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { items = []; }
  const save = () => { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(items), { mode: 0o600 }); fs.renameSync(tmp, file); };
  const pub = (i) => ({ id: i.id, app: i.app, label: i.label, user: i.user, url: i.url, notes: i.notes, hasSecret: !!i.secret, created: i.created, updated: i.updated });
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const fields = (b, partial) => {
    const out = {};
    if (!partial || b.label !== undefined) { out.label = str(b.label, 80); if (!out.label) throw new Error('Give the credential a label.'); }
    if (b.user !== undefined) out.user = str(b.user, 200);
    if (b.url !== undefined) { out.url = str(b.url, 300); if (out.url && !/^https?:\/\//i.test(out.url)) throw new Error('URL must start with http:// or https://'); }
    if (b.notes !== undefined) out.notes = str(b.notes, 1000);
    if (typeof b.secret === 'string' && b.secret.length) out.secret = enc(b.secret.slice(0, 2000));
    return out;
  };
  return {
    list: (appId) => items.filter((i) => !appId || i.app === appId).map(pub),
    create(appId, body) {
      const f = fields(body, false); const now = Date.now();
      const item = { id: crypto.randomBytes(5).toString('hex'), app: appId, user: '', url: '', notes: '', created: now, updated: now, ...f };
      items.push(item); save(); return pub(item);
    },
    update(appId, id, body) {
      const i = items.find((x) => x.id === id && x.app === appId); if (!i) return null;
      Object.assign(i, fields(body, true), { updated: Date.now() }); save(); return pub(i);
    },
    remove(appId, id) { const n = items.length; items = items.filter((x) => !(x.id === id && x.app === appId)); if (items.length !== n) { save(); return true; } return false; },
    reveal(appId, id) { const i = items.find((x) => x.id === id && x.app === appId); if (!i) return undefined; return i.secret ? dec(i.secret) : ''; },
    label: (appId, id) => items.find((x) => x.id === id && x.app === appId)?.label,
  };
}
