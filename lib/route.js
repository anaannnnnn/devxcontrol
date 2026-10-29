// Per-app domain routing: check why a domain gives 502, then fix it (DNS record + Caddy block + network + port).
import fs from 'node:fs';
import dnsMod from 'node:dns/promises';
import { findBlock, upstreamOf, markerFor, upsert, upsertMany } from './caddyfile.js';
import { run } from './docker.js';
import { isInfraImage } from './stack.js';

const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const COMMON = [3000, 8080, 80, 5000, 8000, 4000, 8888];

export function makeRoute({ registry, dns, ops, caddyfile, audit = () => {}, exec = run, fetchImpl = fetch, resolver = dnsMod }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const currentHost = (app) => app.urls?.[0]?.host || null;

  async function inspect(name) {
    const r = await exec('docker', ['inspect', '-f', '{{.Config.Image}}|{{.State.Running}}|{{json .NetworkSettings.Networks}}|{{json .Config.ExposedPorts}}|{{json .Config.Env}}', name], { timeout: 20000 });
    if (!r.ok) return { name, exists: false, running: false, onWeb: false, ports: [] };
    const parts = r.out.trim().split('|'); const image = parts[0] === 'true' || parts[0] === 'false' ? '' : parts.shift();
    const [running, nets, exposed, envs] = parts;
    let n = {}, e = {}, ev = []; try { n = JSON.parse(nets) || {}; } catch { /* */ } try { e = JSON.parse(exposed) || {}; } catch { /* */ } try { ev = JSON.parse(envs) || []; } catch { /* */ }
    const envPort = +(ev.find((x) => /^PORT=/.test(x)) || '').slice(5) || 0;
    return { name, image, infra: isInfraImage(image), exists: true, running: running === 'true', onWeb: 'web' in n, ports: [...new Set([envPort, ...Object.keys(e).map((k) => +k.split('/')[0])].filter(Boolean))] };
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
    // a database or cache is never the app: do not offer its port as the website
    for (const i of infos.filter((x) => x.running && !x.infra)) {
      for (const p of order) if (await listens(i.name, p)) return { container: i.name, port: p };
      for (const p of await listening(i.name)) if (!order.includes(p) && await listens(i.name, p)) return { container: i.name, port: p };
    }
    return null;
  }


  /**
   * The addresses of an app that has more than one (a website, an API, a CRM ...). Saved at onboarding; for apps onboarded
   * earlier they are rebuilt from the address list and the container names (<app>-<name>). Null for an ordinary single-address app.
   */
  function routesOf(app) {
    if (Array.isArray(app.routes) && app.routes.length > 1) return app.routes;
    const urls = (app.urls || []).filter((u) => u.host); if (urls.length < 2) return null;
    const first = urls[0].host.split('.')[0];
    const byShort = new Map((app.containers || []).filter((c) => c.startsWith(`${app.id}-`)).map((c) => [c.slice(app.id.length + 1), c]));
    if (byShort.size < 2) return null;
    const out = [];
    for (const [i, u] of urls.entries()) {
      const label = u.host.split('.')[0];
      const short = i === 0 ? (byShort.has('web') ? 'web' : [...byShort.keys()].find((k) => !urls.some((x, j) => j && x.host.split('.')[0] === `${k}-${first}`))) : (label.endsWith(`-${first}`) ? label.slice(0, -(first.length + 1)) : null);
      const container = short && byShort.get(short); if (!container) return null;
      out.push({ host: u.host, container, short, label: u.label, main: i === 0, ...(u.path ? { health: u.path } : {}) });
    }
    return out;
  }
  const renameHosts = (rs, domain) => { const [first, ...rest] = domain.split('.'); const base = rest.join('.'); return rs.map((r) => ({ ...r, host: r.main ? domain : `${r.short}-${first}.${base}` })); };

  /** One address of a multi-address app: DNS, the Caddy block, whether the container answers, and what a visitor gets. */
  async function diagnoseRoute(app, r, caddyText) {
    const info = await inspect(r.container);
    let dnsIps = []; try { dnsIps = await resolver.resolve4(r.host); } catch { /* none */ }
    const b = caddyText != null ? findBlock(caddyText, r.host) : null;
    const found = info.running ? await findPort([info], r.port) : null;
    let https = null; try { const x = await fetchImpl(`https://${r.host}/`, { signal: AbortSignal.timeout(8000), redirect: 'manual' }); https = { status: x.status }; } catch (e) { https = { error: `${e.cause?.code || e.message}`.slice(0, 80) }; }
    const problems = [];
    if (!info.exists) problems.push(`${r.container} does not exist. Redeploy the app.`);
    else if (!info.running) problems.push(`${r.container} is not running.`);
    else if (!info.onWeb) problems.push(`${r.container} is not on the web network.`);
    if (registry.serverIp && !dnsIps.includes(registry.serverIp)) problems.push(`DNS for ${r.host} ${dnsIps.length ? `points at ${dnsIps.join(', ')}` : 'has no A record'}, not at this server.`);
    if (caddyText != null && !b) problems.push(`Caddy has no route for ${r.host}.`);
    else if (b && found && upstreamOf(b.body) !== `${found.container}:${found.port}`) problems.push(`Caddy sends ${r.host} to ${upstreamOf(b.body)}, but ${r.container} answers at port ${found.port}.`);
    if (https?.error) problems.push(`HTTPS for ${r.host} failed (${https.error}).`);
    else if (https?.status >= 502 && https.status <= 504) problems.push(`https://${r.host} answers ${https.status}.`);
    return { host: r.host, label: r.label, container: r.container, main: !!r.main, running: info.running, dnsIps, dnsOk: dnsIps.includes(registry.serverIp), caddy: { hasBlock: !!b, upstream: b ? upstreamOf(b.body) : null }, answers: found, https, problems };
  }

  async function diagnose(app) {
    const multi = routesOf(app);
    if (multi) {
      const text = caddyfile && fs.existsSync(caddyfile) ? fs.readFileSync(caddyfile, 'utf8') : null;
      const rs = []; for (const r of multi) rs.push(await diagnoseRoute(app, r, text));
      const mainR = rs.find((x) => x.main) || rs[0]; const infos = []; for (const c of app.containers) infos.push(await inspect(c));
      return { removable: !!app.onboarded, domain: mainR.host, serverIp: registry.serverIp, dnsIps: mainR.dnsIps, containers: infos, caddy: { reachable: text != null, hasBlock: mainR.caddy.hasBlock, upstream: mainR.caddy.upstream }, https: mainR.https, answers: mainR.answers, routes: rs, problems: rs.flatMap((x) => x.problems) };
    }
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
    const multi = routesOf(app);
    if (multi) {
      if (!caddyfile || !fs.existsSync(caddyfile)) return null;
      const text = fs.readFileSync(caddyfile, 'utf8'); let hasBlock = true; let stale = false;
      for (const r of multi) { const b = findBlock(text, r.host); if (!b) { hasBlock = false; continue; } const info = await inspect(r.container); const f = info.running ? await findPort([info], r.port) : null; if (f && upstreamOf(b.body) !== `${f.container}:${f.port}`) stale = true; }
      return { domain: (multi.find((r) => r.main) || multi[0]).host, hasBlock, stale, upstream: null, answers: null, multi: true };
    }
    const domain = currentHost(app); if (!domain || !caddyfile || !fs.existsSync(caddyfile)) return null;
    const b = findBlock(fs.readFileSync(caddyfile, 'utf8'), domain);
    const infos = []; for (const c of app.containers) infos.push(await inspect(c));
    const answers = await findPort(infos, app.port);
    return { domain, hasBlock: !!b, upstream: b ? upstreamOf(b.body) : null, answers, stale: !!(b && answers && upstreamOf(b.body) !== `${answers.container}:${answers.port}`) };
  }


  /** Set up (or repair) every address of a multi-address app together, so fixing one never breaks the others. */
  async function applyMany(app, rs, { domain, replace }) {
    const steps = []; const say = (ok, m) => steps.push({ ok, m });
    const main = rs.find((r) => r.main) || rs[0];
    domain = String(domain || main.host).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!HOST.test(domain)) throw Object.assign(new Error('Enter a domain like app.example.com.'), { status: 400 });
    if (!caddyfile || !fs.existsSync(caddyfile)) throw Object.assign(new Error('The Caddyfile is not reachable from here.'), { status: 409 });
    const routes = domain === main.host ? rs : renameHosts(rs, domain);
    const before = fs.readFileSync(caddyfile, 'utf8');
    for (const r of routes) {
      const ex = findBlock(before, r.host);
      if (ex && !replace) { const up = upstreamOf(ex.body)?.split(':')[0]; const mine = markerFor(before, ex) === app.id || app.containers.includes(up); if (!mine) throw Object.assign(new Error(`${r.host} already routes to ${upstreamOf(ex.body) || 'something else'}. Choose another domain, or confirm to replace it.`), { status: 409, code: 'domain-in-use' }); }
    }
    const done = [];
    for (const r of routes) {
      const info = await inspect(r.container);
      if (!info.exists) { say(false, `${r.container} does not exist here, so ${r.host} was skipped. Redeploy the app first.`); continue; }
      if (!info.onWeb) { const c = await exec('docker', ['network', 'connect', 'web', r.container], { timeout: 20000 }); say(c.ok, c.ok ? `Connected ${r.container} to the web network.` : `Could not join ${r.container} to the web network.`); }
      const f = info.running ? await findPort([info], r.port) : null;
      const port = f?.port || r.port || info.ports[0] || 80;
      say(!!f, f ? `${r.label || r.container} answers at ${r.container}:${port}.` : `${r.label || r.container} is not answering right now; its route uses port ${port} anyway.`);
      const d = dns ? await dns.ensureA(r.host, registry.serverIp) : { ok: false, message: 'No DNS provider connected.' };
      say(d.ok, d.ok ? d.message : `DNS record for ${r.host} not created automatically: ${d.message} Create an A record pointing at ${registry.serverIp}.`);
      done.push({ ...r, port, upstream: `${r.container}:${port}` });
    }
    if (!done.length) throw Object.assign(new Error('None of the app\'s containers exist on this server. Redeploy the app first.'), { status: 409 });
    const owns = rs.map((r) => r.host).filter((h) => !done.some((x) => x.host === h));
    fs.writeFileSync(caddyfile, upsertMany(before, { id: app.id, routes: done, owns }));
    const v = await ops.caddy.validate();
    if (!v.ok) { fs.writeFileSync(caddyfile, before); throw Object.assign(new Error(`Caddy rejected the change, the old Caddyfile was restored: ${(v.out + v.err).trim().split('\n').pop()}`), { status: 422 }); }
    const rl = await ops.caddy.reload();
    if (!rl.ok) { fs.writeFileSync(caddyfile, before); await ops.caddy.reload(); throw Object.assign(new Error(`Caddy reload failed, the old Caddyfile was restored: ${(rl.out + rl.err).trim().split('\n').pop()}`), { status: 502 }); }
    say(true, `Caddy now routes ${done.length} address${done.length === 1 ? '' : 'es'}: ${done.map((r) => `${r.host} to ${r.upstream}`).join(', ')}.`);
    const swap = new Map(rs.map((r, i) => [r.host, routes[i].host]));
    const mainDone = done.find((r) => r.main) || done[0];
    registry.update(app.id, { port: mainDone.port, routes: done.map(({ upstream, ...r }) => r), urls: (app.urls || []).map((u) => ({ ...u, url: u.host && swap.has(u.host) ? `https://${swap.get(u.host)}${new URL(u.url).pathname.replace(/\/$/, '')}` : u.url })) });
    audit(app.id, `Routes set: ${done.map((r) => r.host).join(', ')}`, 'ok');
    return { domain: mainDone.host, upstream: mainDone.upstream, steps, routes: done.map((r) => ({ host: r.host, upstream: r.upstream })) };
  }

  /** Set (or repair) the public domain of an app. `replace` allows overwriting a Caddy block we did not create. */
  async function apply(app, { domain, port, replace = false }) {
    const multi = routesOf(app);
    if (multi) return applyMany(app, multi, { domain, replace });
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
  return { diagnose, apply, quick, routesOf };
}
