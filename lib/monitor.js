// Fleet monitor: samples containers, stats and HTTP health on an interval; keeps history, incidents, cert/DNS facts.
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import dns from 'node:dns/promises';

const DEMO = !!process.env.DEMO;
const HIST_CAP = 2880; // 12h at 15s
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

export class Monitor {
  /** @param {{registry:any, docker:any, dataDir:string, notify:(msg:string)=>void, intervalMs?:number}} o */
  constructor({ registry, docker, dataDir, notify, intervalMs = 15000 }) {
    Object.assign(this, { registry, docker, dataDir, notify, intervalMs });
    this.file = path.join(dataDir, 'state.json');
    this.containers = {}; this.stats = {}; this.checks = {};
    this.hist = {}; this.days = {}; this.events = []; this.stopped = new Set();
    this.status = {}; this.streak = {}; this.announced = {}; this.cert = {}; this.dnsInfo = {}; this.lastTick = 0; this.error = null;
    this.#load();
  }

  #load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.hist = j.hist || {}; this.days = j.days || {}; this.events = j.events || []; this.stopped = new Set(j.stopped || []);
    } catch { /* first run */ }
  }
  save() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ hist: this.hist, days: this.days, events: this.events.slice(-500), stopped: [...this.stopped] }));
      fs.renameSync(tmp, this.file);
    } catch (e) { console.error('state save failed:', e.message); }
  }

  event(type, app, msg, level = 'info') {
    const e = { id: (this.events.at(-1)?.id || 0) + 1, t: Date.now(), type, app, msg, level };
    this.events.push(e);
    if (this.events.length > 600) this.events.splice(0, this.events.length - 500);
    return e;
  }

  async #probe(url, path_) {
    const t0 = performance.now();
    try {
      const r = await fetch(url + (path_ || ''), { redirect: 'manual', signal: AbortSignal.timeout(7000), headers: { 'user-agent': 'DevX-Control/1.0' } });
      return { ok: r.status < 500, status: r.status, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return { ok: false, status: 0, ms: Math.round(performance.now() - t0), err: e.cause?.code || e.name };
    }
  }

  async tick() {
    try {
      const [list, stats] = await Promise.all([this.docker.list(), this.docker.stats().catch(() => this.stats)]);
      this.containers = list; this.stats = stats; this.error = null;
    } catch (e) { this.error = e.message; return; }

    const now = Date.now();
    await Promise.all(this.registry.apps.map(async (app) => {
      const cs = app.containers.map((n) => this.containers[n]);
      const running = cs.filter((c) => c?.state === 'running').length;
      const crashing = cs.some((c) => c && (c.state === 'restarting' || c.state === 'dead'));

      // HTTP probes
      const results = {};
      await Promise.all(app.urls.filter((u) => u.probe).map(async (u) => {
        if (DEMO) {
          const up = running > 0;
          results[u.url] = { ok: up, status: up ? 200 : 0, ms: up ? Math.round(30 + Math.random() * 90 + (app.id === 'voicebite' ? 80 : 0)) : 0 };
        } else {
          results[u.url] = running ? await this.#probe(u.url, u.path) : { ok: false, status: 0, ms: 0, err: 'no running container' };
        }
      }));
      this.checks[app.id] = results;

      const vals = Object.values(results);
      const probesOk = vals.every((r) => r.ok);
      let status;
      if (running === 0) status = this.stopped.has(app.id) ? 'stopped' : 'down';
      else if (crashing) status = 'crashing';
      else if (running < app.containers.length || !probesOk) status = 'degraded';
      else status = 'healthy';

      // flap guard: announce only after two consecutive identical samples
      const prev = this.status[app.id];
      this.streak[app.id] = prev === status ? (this.streak[app.id] || 0) + 1 : 1;
      if (this.announced[app.id] === undefined) this.announced[app.id] = status;
      if (this.streak[app.id] >= 2 && this.announced[app.id] !== status) {
        const from = this.announced[app.id];
        this.announced[app.id] = status;
        const bad = ['down', 'crashing', 'degraded'].includes(status);
        const msg = `${app.name} is ${status} (was ${from})`;
        this.event('status', app.id, msg, status === 'healthy' ? 'ok' : bad ? 'bad' : 'info');
        if (bad || status === 'healthy') this.notify(`${status === 'healthy' ? 'RECOVERED' : 'ALERT'}: ${msg}`);
      }
      this.status[app.id] = status;

      // sample
      const st = app.containers.map((n) => this.stats[n]).filter(Boolean);
      const ms = vals.length ? Math.round(vals.reduce((s, r) => s + r.ms, 0) / vals.length) : null;
      const sample = {
        t: now, s: status[0], ms: ms || null,
        cpu: +st.reduce((s, x) => s + x.cpu, 0).toFixed(2),
        mem: Math.round(st.reduce((s, x) => s + x.mem, 0)),
      };
      const h = (this.hist[app.id] ||= []);
      h.push(sample);
      if (h.length > HIST_CAP) h.splice(0, h.length - HIST_CAP);

      if (status !== 'stopped') {
        const d = ((this.days[app.id] ||= {})[dayKey(now)] ||= [0, 0]);
        d[1]++; if (status === 'healthy' || status === 'degraded') d[0]++;
      }
    }));
    this.lastTick = now;
  }

  async #certs() {
    const hosts = [...new Set(this.registry.apps.flatMap((a) => a.urls.map((u) => u.host)))];
    await Promise.all(hosts.map(async (host) => {
      if (DEMO) { this.cert[host] = { validTo: Date.now() + (30 + (host.length % 50)) * 86400e3, issuer: "Let's Encrypt" }; this.dnsInfo[host] = { ips: [this.registry.serverIp], match: true }; return; }
      try {
        const info = await new Promise((resolve, reject) => {
          const s = tls.connect({ host, port: 443, servername: host, timeout: 6000 }, () => {
            const c = s.getPeerCertificate(); s.end();
            resolve({ validTo: new Date(c.valid_to).getTime(), issuer: c.issuer?.O || c.issuer?.CN || '' });
          });
          s.on('error', reject); s.on('timeout', () => { s.destroy(); reject(new Error('timeout')); });
        });
        this.cert[host] = info;
      } catch (e) { this.cert[host] = { error: e.message }; }
      try {
        const ips = await dns.resolve4(host);
        this.dnsInfo[host] = { ips, match: !this.registry.serverIp || ips.includes(this.registry.serverIp) };
      } catch (e) { this.dnsInfo[host] = { ips: [], match: false, error: e.code || e.message }; }
    }));
  }

  start() {
    const loop = async () => { try { await this.tick(); } catch (e) { console.error('tick failed', e); } };
    loop();
    this.#certs();
    this.timers = [
      setInterval(loop, this.intervalMs),
      setInterval(() => this.save(), 60000),
      setInterval(() => this.#certs(), 30 * 60000),
    ];
    for (const t of this.timers) t.unref?.();
  }
  stop() { this.timers?.forEach(clearInterval); this.save(); }

  uptime(appId, daysBack) {
    const d = this.days[appId] || {};
    let up = 0, tot = 0;
    for (let i = 0; i < daysBack; i++) {
      const v = d[dayKey(Date.now() - i * 86400e3)];
      if (v) { up += v[0]; tot += v[1]; }
    }
    return tot ? +((up / tot) * 100).toFixed(2) : null;
  }

  /** Aggregate view for one app (no secrets). */
  appView(app) {
    const containers = app.containers.map((name) => {
      const c = this.containers[name] || { state: 'missing' };
      return { name, ...c, stats: this.stats[name] || null, role: /-db$/.test(name) ? 'database' : /-agent|-api$/.test(name) ? 'service' : 'app' };
    });
    const h = this.hist[app.id] || [];
    const last = h.at(-1);
    const spark = h.slice(-60);
    const checks = app.urls.map((u) => ({
      label: u.label, url: u.url, probed: u.probe, ...(this.checks[app.id]?.[u.url] || {}),
      cert: this.cert[u.host] || null, dns: this.dnsInfo[u.host] || null,
    }));
    const startedMs = containers.filter((c) => c.state === 'running' && c.started).map((c) => Date.parse(c.started));
    return {
      id: app.id, name: app.name, tagline: app.tagline, group: app.group, stack: app.stack, repo: app.repo,
      status: this.status[app.id] || 'unknown', containers, checks,
      db: app.db, urls: app.urls.map(({ label, url }) => ({ label, url })),
      cpu: last?.cpu ?? 0, mem: last?.mem ?? 0, ms: last?.ms ?? null,
      restarts: containers.reduce((s, c) => s + (c.restarts || 0), 0),
      since: startedMs.length ? Math.min(...startedMs) : null,
      uptime24h: this.uptime(app.id, 1), uptime30d: this.uptime(app.id, 30),
      spark: { ms: spark.map((s) => s.ms), cpu: spark.map((s) => s.cpu), mem: spark.map((s) => s.mem) },
      stopped: this.stopped.has(app.id),
    };
  }

  history(appId, windowMs) {
    const h = (this.hist[appId] || []).filter((s) => s.t >= Date.now() - windowMs);
    const step = Math.max(1, Math.ceil(h.length / 160));
    const out = h.filter((_, i) => i % step === 0);
    return { t: out.map((s) => s.t), ms: out.map((s) => s.ms), cpu: out.map((s) => s.cpu), mem: out.map((s) => s.mem), s: out.map((s) => s.s) };
  }
}
