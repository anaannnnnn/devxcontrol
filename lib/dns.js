// DNS automation for Cloudflare and GoDaddy: list the domains you own, suggest a hostname, and create the A record.
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\.$/, '');

export function makeDns({ integrations, fetchImpl = fetch, cfBase = 'https://api.cloudflare.com/client/v4', gdBase = 'https://api.godaddy.com' }) {
  const j = async (res) => { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t }; } };

  async function cf(path, { method = 'GET', body } = {}) {
    const c = integrations.dns().cloudflare; if (!c) throw new Error('Cloudflare is not connected.');
    const res = await fetchImpl(`${cfBase}${path}`, { method, headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    const d = await j(res);
    if (!res.ok || d.success === false) throw new Error(`Cloudflare: ${d.errors?.[0]?.message || `HTTP ${res.status}`}`);
    return d;
  }
  async function gd(path, { method = 'GET', body } = {}) {
    const c = integrations.dns().godaddy; if (!c) throw new Error('GoDaddy is not connected.');
    const res = await fetchImpl(`${gdBase}${path}`, { method, headers: { Authorization: `sso-key ${c.key}:${c.secret}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    const d = await j(res);
    if (!res.ok) throw new Error(`GoDaddy: ${d.message || d.code || `HTTP ${res.status}`}${res.status === 403 ? ' (GoDaddy only allows API access for accounts with enough domains)' : ''}`);
    return d;
  }

  async function cfZones() {
    const out = []; for (let page = 1; page <= 10; page++) { const d = await cf(`/zones?per_page=50&page=${page}&status=active`); out.push(...(d.result || []).map((z) => ({ name: norm(z.name), provider: 'cloudflare', id: z.id }))); if ((d.result || []).length < 50) break; }
    return out;
  }
  async function gdDomains() { const d = await gd('/v1/domains?statuses=ACTIVE&limit=200'); return (Array.isArray(d) ? d : []).map((x) => ({ name: norm(x.domain), provider: 'godaddy' })); }

  async function domains() {
    const have = integrations.dns(); const out = []; const errors = {};
    if (have.cloudflare) { try { out.push(...await cfZones()); } catch (e) { errors.cloudflare = e.message; } }
    if (have.godaddy) { try { out.push(...(await gdDomains()).filter((d) => !out.some((o) => o.name === d.name))); } catch (e) { errors.godaddy = e.message; } }
    return { domains: out.sort((a, b) => a.name.localeCompare(b.name)), errors };
  }

  const baseOf = (fqdn, list) => list.filter((d) => fqdn === d.name || fqdn.endsWith(`.${d.name}`)).sort((a, b) => b.name.length - a.name.length)[0] || null;

  /** Create or update the A record for fqdn -> ip. Never throws: returns { ok, action|reason }. */
  async function ensureA(fqdnIn, ip, { proxied = false } = {}) {
    const fqdn = norm(fqdnIn);
    try {
      const { domains: list } = await domains(); const base = baseOf(fqdn, list);
      if (!base) return { ok: false, reason: 'none', message: `${fqdn} is not in a connected Cloudflare or GoDaddy account, so its DNS record was not created.` };
      if (base.provider === 'cloudflare') {
        const found = (await cf(`/zones/${base.id}/dns_records?name=${encodeURIComponent(fqdn)}`)).result || [];
        const cname = found.find((r) => r.type === 'CNAME'); if (cname) return { ok: false, reason: 'conflict', provider: 'cloudflare', message: `${fqdn} already has a CNAME record in Cloudflare. Delete it there first.` };
        const a = found.find((r) => r.type === 'A');
        if (a && a.content === ip && !!a.proxied === !!proxied) return { ok: true, action: 'unchanged', provider: 'cloudflare', message: `Cloudflare already points ${fqdn} at ${ip}.` };
        const body = { type: 'A', name: fqdn, content: ip, ttl: 1, proxied };
        if (a) { await cf(`/zones/${base.id}/dns_records/${a.id}`, { method: 'PUT', body }); return { ok: true, action: 'updated', provider: 'cloudflare', message: `Cloudflare: ${fqdn} now points at ${ip} (was ${a.content}${a.proxied && !proxied ? ', orange cloud turned off so Caddy can get its own certificate' : ''}).` }; }
        await cf(`/zones/${base.id}/dns_records`, { method: 'POST', body }); return { ok: true, action: 'created', provider: 'cloudflare', message: `Cloudflare: created ${fqdn} -> ${ip}.` };
      }
      const name = fqdn === base.name ? '@' : fqdn.slice(0, -(base.name.length + 1));
      const cur = await gd(`/v1/domains/${base.name}/records/A/${encodeURIComponent(name)}`).catch(() => []);
      if (Array.isArray(cur) && cur.length === 1 && cur[0].data === ip) return { ok: true, action: 'unchanged', provider: 'godaddy', message: `GoDaddy already points ${fqdn} at ${ip}.` };
      await gd(`/v1/domains/${base.name}/records/A/${encodeURIComponent(name)}`, { method: 'PUT', body: [{ data: ip, ttl: 600 }] });
      return { ok: true, action: Array.isArray(cur) && cur.length ? 'updated' : 'created', provider: 'godaddy', message: `GoDaddy: ${fqdn} -> ${ip}.` };
    } catch (e) { return { ok: false, reason: 'error', message: e.message }; }
  }

  /** Remove the A record for fqdn, but only if it still points at `ip` (never touches records that moved elsewhere). */
  async function deleteA(fqdnIn, ip) {
    const fqdn = norm(fqdnIn);
    try {
      const { domains: list } = await domains(); const base = baseOf(fqdn, list);
      if (!base) return { ok: false, message: `${fqdn} is not in a connected account, so its DNS record was left alone.` };
      if (base.provider === 'cloudflare') {
        const found = ((await cf(`/zones/${base.id}/dns_records?name=${encodeURIComponent(fqdn)}&type=A`)).result || []).filter((r) => r.content === ip);
        if (!found.length) return { ok: true, message: `Cloudflare has no A record for ${fqdn} pointing at ${ip}.` };
        for (const r of found) await cf(`/zones/${base.id}/dns_records/${r.id}`, { method: 'DELETE' });
        return { ok: true, message: `Cloudflare: removed ${fqdn}.` };
      }
      const name = fqdn === base.name ? '@' : fqdn.slice(0, -(base.name.length + 1));
      const cur = await gd(`/v1/domains/${base.name}/records/A/${encodeURIComponent(name)}`).catch(() => []);
      if (!(Array.isArray(cur) && cur.length && cur.every((r) => r.data === ip))) return { ok: true, message: `GoDaddy has no A record for ${fqdn} pointing at ${ip}.` };
      await gd(`/v1/domains/${base.name}/records/A/${encodeURIComponent(name)}`, { method: 'DELETE' });
      return { ok: true, message: `GoDaddy: removed ${fqdn}.` };
    } catch (e) { return { ok: false, message: e.message }; }
  }

  return { domains, ensureA, deleteA, baseOf, suggest: async (id) => (await domains()).domains.map((d) => ({ host: `${id}.${d.name}`, base: d.name, provider: d.provider })) };
}
