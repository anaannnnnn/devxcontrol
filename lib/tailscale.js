// Tailscale control-plane proxy: device inventory only. Does not provide shell, Docker, or discovery.
const DEFAULT_BASE = 'https://api.tailscale.com/api/v2';

const normOs = (os) => {
  const s = String(os || '').toLowerCase();
  if (s.includes('linux')) return 'linux';
  if (s.includes('windows')) return 'windows';
  if (s.includes('mac') || s.includes('darwin') || s.includes('ios')) return s.includes('ios') ? 'ios' : 'macos';
  if (s.includes('android')) return 'android';
  return 'other';
};

export function mapDevice(d) {
  const addresses = [];
  for (const a of d.addresses || []) if (typeof a === 'string') addresses.push(a);
  if (Array.isArray(d.allowedIps)) {
    for (const a of d.allowedIps) if (typeof a === 'string' && !addresses.includes(a)) addresses.push(a);
  }
  const online = d.online === true || d.connectedToControl === true;
  return {
    id: String(d.nodeId || d.id || d.name || ''),
    name: String(d.hostname || d.name || d.nodeId || 'unknown'),
    os: normOs(d.os || d.clientOs),
    osVersion: d.clientVersion || d.osVersion || undefined,
    addresses,
    magicDns: d.name && String(d.name).includes('.') ? String(d.name) : (d.dnsName || undefined),
    status: online ? 'online' : 'offline',
    lastSeenAt: d.lastSeen || d.lastSeenAt || null,
    appsCount: undefined,
    publishedCount: undefined,
    agent: { enrolled: false, capabilities: [] },
  };
}

export function makeTailscale({ integrations, fetchImpl = fetch, base = DEFAULT_BASE }) {
  async function credentials() {
    return integrations.tailscale();
  }

  async function api(path) {
    const c = await credentials();
    if (!c?.apiKey) {
      const err = new Error('Tailscale is not connected. Add an API key under Connections.');
      err.code = 'tailscale-not-configured';
      err.status = 409;
      throw err;
    }
    const tailnet = encodeURIComponent(c.tailnet || '-');
    const url = `${base}/tailnet/${tailnet}${path}`;
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${c.apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!res.ok) {
      const err = new Error(body?.message || body?.error || `Tailscale HTTP ${res.status}`);
      err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
      err.code = 'tailscale-api';
      throw err;
    }
    return body;
  }

  async function status() {
    const c = await credentials();
    if (!c?.apiKey) return { connected: false, reason: 'No Tailscale API key configured on the control backend.' };
    try {
      const data = await api('/devices');
      const devices = Array.isArray(data.devices) ? data.devices : [];
      return {
        connected: true,
        tailnet: c.tailnet || '-',
        deviceCount: devices.length,
        onlineCount: devices.filter((d) => d.online === true || d.connectedToControl === true).length,
      };
    } catch (e) {
      return { connected: false, reason: e.message };
    }
  }

  async function devices({ q, statusFilter } = {}) {
    const c = await credentials();
    if (!c?.apiKey) {
      return {
        connected: false,
        devices: [],
        reason: 'No Tailscale API key configured on the control backend.',
      };
    }
    const data = await api('/devices');
    let list = (Array.isArray(data.devices) ? data.devices : []).map(mapDevice).filter((d) => d.id);
    if (statusFilter === 'online' || statusFilter === 'offline') {
      list = list.filter((d) => d.status === statusFilter);
    }
    const query = String(q || '').trim().toLowerCase();
    if (query) {
      list = list.filter((d) =>
        d.name.toLowerCase().includes(query)
        || (d.magicDns || '').toLowerCase().includes(query)
        || d.addresses.some((a) => a.toLowerCase().includes(query))
        || d.id.toLowerCase().includes(query));
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return { connected: true, devices: list };
  }

  async function device(id) {
    const all = await devices();
    if (!all.connected) return all;
    const found = all.devices.find((d) => d.id === id);
    if (!found) {
      const err = new Error('Device not found in this tailnet.');
      err.status = 404;
      err.code = 'not-found';
      throw err;
    }
    return { connected: true, device: found };
  }

  return { status, devices, device, mapDevice };
}
