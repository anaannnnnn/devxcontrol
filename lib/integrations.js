// Connection settings (GitHub App, AI endpoint). Secrets are encrypted at rest with the same scheme as the vault.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function makeIntegrations({ dataDir, key }) {
  const file = path.join(dataDir, 'integrations.json');
  const k = crypto.scryptSync(key, 'devx-control-vault-v1', 32);
  const enc = (t) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', k, iv); const ct = Buffer.concat([c.update(t, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64'); };
  const dec = (b) => { try { const x = Buffer.from(b, 'base64'); const d = crypto.createDecipheriv('aes-256-gcm', k, x.subarray(0, 12)); d.setAuthTag(x.subarray(12, 28)); return Buffer.concat([d.update(x.subarray(28)), d.final()]).toString('utf8'); } catch { return null; } };
  let s = {};
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { s = {}; }
  const save = () => { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 }); fs.renameSync(tmp, file); };
  const str = (v, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

  return {
    github() { const g = s.github; if (!g?.appId || !g.privateKey) return null; const pk = dec(g.privateKey); return pk ? { appId: g.appId, privateKey: pk, installationId: g.installationId || null } : null; },
    llm() { const l = s.llm; if (!l?.baseUrl || !l.model) return null; return { baseUrl: l.baseUrl, model: l.model, apiKey: l.apiKey ? dec(l.apiKey) : '' }; },
    dns() { const d = s.dns || {}; return { cloudflare: d.cloudflare?.token ? { token: dec(d.cloudflare.token) } : null, godaddy: d.godaddy?.key ? { key: d.godaddy.key, secret: dec(d.godaddy.secret) } : null }; },
    setDns(provider, b) {
      s.dns = s.dns || {};
      if (provider === 'cloudflare') { const t = str(b.token, 200); if (t.length < 20) throw new Error('Paste the API token from Cloudflare (My Profile, API Tokens).'); s.dns.cloudflare = { token: enc(t) }; }
      else if (provider === 'godaddy') { const key = str(b.key, 100), secret = str(b.secret, 100); if (!key || !secret) throw new Error('GoDaddy needs both the key and the secret.'); s.dns.godaddy = { key, secret: enc(secret) }; }
      else throw new Error('Unknown provider.');
      save();
    },
    clearDns(provider) { if (s.dns) { delete s.dns[provider]; save(); } },
    setGithub(b) {
      const appId = str(b.appId, 20); if (!/^\d+$/.test(appId)) throw new Error('App ID is the number shown on your GitHub App page.');
      const pk = typeof b.privateKey === 'string' ? b.privateKey.trim() : '';
      if (pk) { try { crypto.createPrivateKey(pk); } catch { throw new Error('That private key is not valid. Paste the whole .pem file, including the BEGIN and END lines.'); } }
      else if (!s.github?.privateKey) throw new Error('Paste the private key (.pem) you downloaded from GitHub.');
      s.github = { appId, privateKey: pk ? enc(pk) : s.github.privateKey, installationId: s.github?.appId === appId ? s.github.installationId : null };
      save();
    },
    setInstallation(id) { if (s.github) { s.github.installationId = String(id); save(); } },
    clearGithub() { delete s.github; save(); },
    setLlm(b) {
      const baseUrl = str(b.baseUrl).replace(/\/+$/, ''); if (!/^https?:\/\//i.test(baseUrl)) throw new Error('Endpoint must start with http:// or https://');
      const model = str(b.model, 120); if (!model) throw new Error('Choose a model name.');
      const apiKey = typeof b.apiKey === 'string' ? b.apiKey.trim().slice(0, 500) : '';
      s.llm = { baseUrl, model, apiKey: apiKey ? enc(apiKey) : (s.llm?.baseUrl === baseUrl ? s.llm.apiKey : '') };
      save();
    },
    clearLlm() { delete s.llm; save(); },
    pub() {
      return {
        github: s.github ? { appId: s.github.appId, hasKey: !!s.github.privateKey, installationId: s.github.installationId || null } : null,
        dns: { cloudflare: !!s.dns?.cloudflare, godaddy: !!s.dns?.godaddy },
        llm: s.llm ? { baseUrl: s.llm.baseUrl, model: s.llm.model, hasKey: !!s.llm.apiKey } : null,
      };
    },
  };
}
