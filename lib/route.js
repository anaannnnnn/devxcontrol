// Per-app domain routing: check why a domain gives 502, then fix it (DNS record + Caddy block + network + port).
import fs from 'node:fs';
import dnsMod from 'node:dns/promises';
import { findBlock, upstreamOf, markerFor, upsert } from './caddyfile.js';
import { run } from './docker.js';

const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const COMMON = [3000, 8080, 80, 5000, 8000, 4000, 8888];

export function makeRoute({ registry, dns, ops, caddyfile, audit = () => {}, exec = run, fetchImpl = fetch, resolver = dnsMod }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const currentHost = (app) => app.urls?.[0]?.host || null;

  async function inspect(name) {
    const r = await exec('docker', ['inspect', '-f', '{{.State.Running}}|{{json .NetworkSettings.Networks}}|{{json .Config.ExposedPorts}}|{{json .Config.Env}}', name], { timeout: 20000 });
    if (!r.ok) return { name, exists: false, running: false, onWeb: false, ports: [] };
    const [running, nets, exposed, envs] = r.out.trim().split('|');
    let n = {}, e = {}, ev = []; try { n = JSON.parse(nets) || {}; } catch { /* */ } try { e = JSON.parse(exposed) || {}; } catch { /* */ } try { ev = JSON.parse(envs) || []; } catch { /* */ }
    const envPort = +(ev.find((x) => /^PORT=/.test(x)) || '').slice(5) || 0;
    return { name, exists: true, running: running === 'true', onWeb: 'web' in n, ports: [...new Set([envPort, ...Object.keys(e).map((k) => +k.split('/')[0])].filter(Boolean))] };
  }
  async function listens(name, port) {
    try { await fetchImpl(`http://${name}:${port}/`, { signal: AbortSignal.timeout(3000), redirect: 'manual' }); return true; } catch { return false; }
  }
  /** TCP ports the container is really listening on, read from the kernel table (no extra tools needed in the image). */
  async function listening(name) {
    const r = await exec('docker', ['exec', name, 'cat', '/proc/net/tcp', '/proc/net/tcp6'], { timeout: 15000 });
    const out = new Set(); for (const l of (r.out || '').split('\n')) { const m = /^\s*\d+:\s+[0-9A-F]+:([0-9A-F]{4})\s+[0-9A-F]+:[0-9A-F]{4}\s+0A\b/i.exec(l); if (m) out.add(parseInt(m[1], 16)); }
    return [...out];
  }
  async function findPort(infos, want) {
    const order = [...new Set([want, registry.portOf?.(infos[0]?.name), ...infos.flatMap((i) => i.ports), ...COMMON].filter(Boolean).map(Number))];
    for (const i of infos.filter((x) => x.running)) {
      for (const p of order) if (await listens(i.name, p)) return { container: i.name, port: p };
      for (const p of await listening(i.name)) if (!order.includes(p) && await listens(i.name, p)) return { container: i.name, port: p };
    }
    return null;
  }

  async function diagnose(app) {
    const infos = []; for (const c of app.containers) infos.push(await inspect(c));
    const domain = currentHost(app);
    let dnsIps = []; if (domain) { try { dnsIps = await resolver.resolve4(domain); } catch { /* none */ } }
    let caddy = { reachable: false };
    if (caddyfile && fs.existsSync(caddyfile) && domain) { const t = fs.readFileSync(caddyfile, 'utf8'); const b = findBlock(t, domain); caddy = { reachable: true, hasBlock: !!b, upstream: b ? upstreamOf(b.body) : null }; }
    const found = await findPort(infos, app.port);
    let https = null;
    if (domain) { try { const r = await fetchImpl(`https://${domain}/`, { signal: AbortSignal.timeout(8000), redirect: 'manual' }); https = { status: r.status }; } catch (e) { https = { error: `${e.cause?.code || e.cause?.message || e.message}` }; } }
    const problems = [];
    if (!infos.some((i) => i.running)) problems.push('The container is not running.');
    if (infos.some((i) => i.running && !i.onWeb)) problems.push('The container is not on the "web" network, so Caddy cannot reach it.');
    if (domain && registry.serverIp && !dnsIps.includes(registry.serverIp)) problems.push(`DNS for ${domain} ${dnsIps.length ? `points at ${dnsIps.join(', ')}` : 'has no A record'}, not at this server (${registry.serverIp}).`);
    if (caddy.reachable && domain && !caddy.hasBlock) problems.push(`Caddy has no route for ${domain}.`);
    if (caddy.hasBlock && found && caddy.upstream !== `${found.container}:${found.port}`) problems.push(`Caddy sends ${domain} to ${caddy.upstream}, but the app answers at ${found.container}:${found.port}.`);
    if (https?.error) problems.push(`HTTPS test failed (${https.error}). Usually the DNS record is wrong or not spread yet, a Cloudflare orange cloud is on, or ports 80 and 443 are closed in the firewall, so Caddy cannot get a certificate. Press Fix and apply, then wait a few minutes.`);
    else if (https?.status === 502 || https?.status === 503) problems.push(`https://${domain} answers ${https.status}: Caddy cannot reach the app.`);
    if (!found && infos.some((i) => i.running)) problems.push('Nothing answered on the usual ports inside the container. Check its logs.');
    return { removable: !!app.onboarded, domain, serverIp: registry.serverIp, dnsIps, containers: infos, caddy, https, answers: found, problems };
  }

  /** Cheap check used by the background repair: is there a route, and does it point at the port the app really answers on? */
  async function quick(app) {
    const domain = currentHost(app); if (!domain || !caddyfile || !fs.existsSync(caddyfile)) return null;
    const b = findBlock(fs.readFileSync(caddyfile, 'utf8'), domain);
    const infos = []; for (const c of app.containers) infos.push(await inspect(c));
    const answers = await findPort(infos, app.port);
    return { domain, hasBlock: !!b, upstream: b ? upstreamOf(b.body) : null, answers, stale: !!(b && answers && upstreamOf(b.body) !== `${answers.container}:${answers.port}`) };
  }

  /** Set (or repair) the public domain of an app. `replace` allows overwriting a Caddy block we did not create. */
  async function apply(app, { domain, port, replace = false }) {
    const steps = []; const say = (ok, m) => steps.push({ ok, m });
    domain = String(domain || currentHost(app) || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!HOST.test(domain)) throw Object.assign(new Error('Enter a domain like app.example.com.'), { status: 400 });
    if (!caddyfile || !fs.existsSync(caddyfile)) throw Object.assign(new Error('The Caddyfile is not reachable from here.'), { status: 409 });
    const infos = []; for (const c of app.containers) infos.push(await inspect(c));
    const present = infos.filter((i) => i.exists); const live = infos.filter((i) => i.running);
    if (!present.length) throw Object.assign(new Error('The container does not exist on this server. Redeploy the app first.'), { status: 409 });
    for (const i of present.filter((x) => !x.onWeb)) { const r = await exec('docker', ['network', 'connect', 'web', i.name], { timeout: 20000 }); say(r.ok, r.ok ? `Connected ${i.name} to the web network.` : `Could not join the web network: ${(r.err || r.out).trim().split('\n').pop()}`); if (r.ok) await sleep(500); }
    let found = live.length ? await findPort(live, port ? +port : app.port) : null;
    if (found) say(true, `The app answers at ${found.container}:${found.port}.`);
    else {
      const guess = +port || app.port || present.flatMap((i) => i.ports)[0];
      if (!guess) throw Object.assign(new Error('The app is not answering and its port is unknown. Enter the port it listens on (for example 3000) and press Fix and apply again.'), { status: 409 });
      found = { container: (live[0] || present[0]).name, port: guess };
      say(false, `The app is not answering right now (${live.length ? 'nothing on the usual ports' : 'it is not running'}), so the route is set to port ${guess} anyway. You will see a 502 until the app is healthy. Check the Logs tab.`);
    }

    const d = dns ? await dns.ensureA(domain, registry.serverIp) : { ok: false, message: 'No DNS provider connected.' };
    say(d.ok, d.ok ? d.message : `DNS record not created automatically: ${d.message} Create an A record for ${domain} pointing at ${registry.serverIp}.`);

    const before = fs.readFileSync(caddyfile, 'utf8');
    const existing = findBlock(before, domain);
    if (existing && !replace) {
      const up = upstreamOf(existing.body)?.split(':')[0]; const mine = markerFor(before, existing) === app.id || app.containers.includes(up);
      if (!mine) throw Object.assign(new Error(`${domain} already routes to ${upstreamOf(existing.body) || 'something else'}. Choose another domain, or confirm to replace it.`), { status: 409, code: 'domain-in-use' });
    }
    const old = currentHost(app); const owns = old && old !== domain ? [old] : [];
    fs.writeFileSync(caddyfile, upsert(before, { id: app.id, host: domain, upstream: `${found.container}:${found.port}`, owns }));
    const v = await ops.caddy.validate();
    if (!v.ok) { fs.writeFileSync(caddyfile, before); throw Object.assign(new Error(`Caddy rejected the change, the old Caddyfile was restored: ${(v.out + v.err).trim().split('\n').pop()}`), { status: 422 }); }
    const r = await ops.caddy.reload();
    if (!r.ok) { fs.writeFileSync(caddyfile, before); await ops.caddy.reload(); throw Object.assign(new Error(`Caddy reload failed, the old Caddyfile was restored: ${(r.out + r.err).trim().split('\n').pop()}`), { status: 422 }); }
    say(true, `Caddy now sends ${domain} to ${found.container}:${found.port}${owns.length ? ` (the old route for ${owns[0]} was removed)` : ''}.`);

    registry.update(app.id, { port: found.port, urls: [{ label: app.urls?.[0]?.label || 'Web', url: `https://${domain}`, ...(app.urls?.[0]?.path ? { path: app.urls[0].path } : {}) }, ...(app.urls || []).slice(1).filter((u) => u.host !== old)] });
    audit(app.id, `Domain set to ${domain} (${found.container}:${found.port})`, 'ok');
    return { domain, upstream: `${found.container}:${found.port}`, steps };
  }
  return { diagnose, apply, quick };
}
