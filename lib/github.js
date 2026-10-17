// GitHub App client on plain fetch. App JWT -> installation token -> REST. No dependencies.
import crypto from 'node:crypto';

const b64u = (b) => Buffer.from(b).toString('base64url');

export function makeGithub({ integrations, apiBase = process.env.GITHUB_API || 'https://api.github.com' }) {
  let tok = null; // { token, exp, installationId }

  const appJwt = (cfg) => {
    const now = Math.floor(Date.now() / 1000);
    const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = b64u(JSON.stringify({ iat: now - 60, exp: now + 540, iss: cfg.appId }));
    const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), cfg.privateKey);
    return `${head}.${body}.${b64u(sig)}`;
  };

  async function call(method, url, { token, body, raw } = {}) {
    const res = await fetch(url.startsWith('http') ? url : apiBase + url, {
      method, signal: AbortSignal.timeout(20000),
      headers: { accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'devx-control', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let m = ''; try { m = (await res.json()).message || ''; } catch { /* no body */ }
      throw Object.assign(new Error(`GitHub ${res.status}${m ? `: ${m}` : ''}`), { status: res.status });
    }
    if (res.status === 204) return null;
    return raw ? res.text() : res.json();
  }

  const cfg = () => { const c = integrations.github(); if (!c) throw Object.assign(new Error('GitHub is not connected yet. Add your GitHub App in Connections.'), { status: 409, code: 'no-github' }); return c; };

  const tokens = new Map(); // installationId -> { token, exp }
  const owners = new Map(); // repo -> { id, perms, at }
  const HINT = ' The app has no write permission on this account. On GitHub open Settings > Applications > Installed GitHub Apps > Configure, accept the new permissions (Contents and Pull requests: Read and write), then try again.';

  async function tokenFor(id, jwt) {
    const k = String(id); const hit = tokens.get(k);
    if (hit && hit.exp - Date.now() > 120e3) return hit.token;
    const r = await call('POST', `/app/installations/${k}/access_tokens`, { token: jwt || appJwt(cfg()) });
    tokens.set(k, { token: r.token, exp: Date.parse(r.expires_at) }); return r.token;
  }
  /** The installation that covers this repo (each GitHub account/org has its own). Falls back to the saved one. */
  async function installFor(repo) {
    const c = cfg(); const jwt = appJwt(c);
    if (repo) {
      const hit = owners.get(repo); if (hit && Date.now() - hit.at < 300e3) return hit;
      try { const i = await call('GET', `/repos/${repo}/installation`, { token: jwt }); const o = { id: String(i.id), perms: i.permissions || {}, account: i.account?.login, url: i.html_url, at: Date.now() }; owners.set(repo, o); return o; }
      catch (e) { if (e.status === 404) throw Object.assign(new Error(`The GitHub App is not installed on ${repo.split('/')[0]}. Open Connections > GitHub > Add another account and install it there, choosing this repo.`), { status: 409, code: 'no-installation' }); throw e; }
    }
    let id = c.installationId;
    if (!id) {
      const list = await call('GET', '/app/installations?per_page=10', { token: jwt });
      if (!list.length) throw Object.assign(new Error('The app is not installed on any account yet. Install it on GitHub, then press Refresh.'), { status: 409, code: 'no-installation' });
      id = String(list[0].id); integrations.setInstallation(id);
    }
    return { id: String(id), perms: null };
  }
  async function installationToken(repo) { const i = await installFor(repo); return tokenFor(i.id); }
  const t = async (fn, repo) => { const i = await installFor(repo); try { return await fn(await tokenFor(i.id)); } catch (e) { if (e.status === 401) tokens.delete(i.id); if (e.status === 403 && /not accessible by integration/i.test(e.message)) e.message += HINT; throw e; } };

  /** Plain-language answer to "why can't I push to this repo?" */
  async function access(repo) {
    const i = await installFor(repo); const p = i.perms || {};
    const need = [['contents', 'Contents'], ['pull_requests', 'Pull requests']];
    const missing = need.filter(([k]) => p[k] !== 'write').map(([, l]) => l);
    return { account: i.account, perms: p, missing, url: i.url || null };
  }

  return {
    configured: () => !!integrations.github(),
    async status() {
      const c = integrations.github(); if (!c) return { connected: false };
      try {
        const jwt = appJwt(c);
        const app = await call('GET', '/app', { token: jwt });
        const inst = await call('GET', '/app/installations?per_page=30', { token: jwt });
        return { connected: true, app: { name: app.name, slug: app.slug, url: app.html_url, perms: app.permissions || {} }, installations: inst.map((i) => ({ id: i.id, account: i.account?.login, type: i.account?.type, selection: i.repository_selection, perms: i.permissions || {}, url: i.html_url })), installationId: c.installationId, installUrl: `${app.html_url}/installations/new` };
      } catch (e) { return { connected: false, error: e.message }; }
    },
    async repos() {
      const jwt = appJwt(cfg()); const insts = await call('GET', '/app/installations?per_page=50', { token: jwt });
      if (!insts.length) throw Object.assign(new Error('The app is not installed on any account yet. Install it on GitHub, then press Refresh.'), { status: 409, code: 'no-installation' });
      const out = []; const errs = [];
      for (const inst of insts) {
        try {
          const token = await tokenFor(inst.id, jwt);
          for (let p = 1; p <= 5; p++) {
            const r = await call('GET', `/installation/repositories?per_page=100&page=${p}`, { token });
            out.push(...r.repositories.map((x) => ({ full: x.full_name, desc: x.description || '', lang: x.language || '', stars: x.stargazers_count, pushed: x.pushed_at, priv: x.private, branch: x.default_branch, archived: x.archived, account: inst.account?.login })));
            if (r.repositories.length < 100) break;
          }
        } catch (e) { errs.push(`${inst.account?.login}: ${e.message}`); }
      }
      if (!out.length && errs.length) throw new Error(errs[0]);
      return out;
    },
    branches: (full) => t((token) => call('GET', `/repos/${full}/branches?per_page=100`, { token }).then((l) => l.map((b) => b.name)), full),
    async tree(full, ref) { return t(async (token) => { const r = await call('GET', `/repos/${full}/git/trees/${encodeURIComponent(ref)}?recursive=1`, { token }); return { truncated: r.truncated, files: r.tree.filter((n) => n.type === 'blob').map((n) => ({ path: n.path, size: n.size })) }; }, full); },
    file: (full, p, ref) => t((token) => call('GET', `/repos/${full}/contents/${p.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, { token, raw: true }), full),
    cloneToken: installationToken,
    access,
    openPr: (full, { head, base, title, body }) => t((token) => call('POST', `/repos/${full}/pulls`, { token, body: { head, base, title, body } }), full),
    mergePr: (full, n) => t((token) => call('PUT', `/repos/${full}/pulls/${n}/merge`, { token, body: { merge_method: 'squash' } }), full),
  };
}
