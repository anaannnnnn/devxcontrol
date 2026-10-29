// Docker access through the CLI (no shell, args only). Real mode talks to /var/run/docker.sock,
// demo mode simulates a fleet so the UI can be explored anywhere.
import { execFile, spawn } from 'node:child_process';

export const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    execFile(
      cmd, args,
      { maxBuffer: 64 * 1024 * 1024, timeout: opts.timeout || 30000, cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) } },
      (err, stdout, stderr) => resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, out: String(stdout || ''), err: String(stderr || '') })
    );
  });

export function live(cmd, args, { cwd, env, onData, onClose } = {}) {
  const p = spawn(cmd, args, { cwd, env: { ...process.env, ...(env || {}) } });
  p.stdout.on('data', (d) => onData?.(d.toString()));
  p.stderr.on('data', (d) => onData?.(d.toString()));
  p.on('close', (code) => onClose?.(code));
  p.on('error', (e) => { onData?.(`spawn error: ${e.message}\n`); onClose?.(127); });
  return p;
}

const toBytes = (s) => {
  const m = /([\d.]+)\s*([KMGT]?i?B)/i.exec(s || '');
  if (!m) return 0;
  const u = { b: 1, kb: 1e3, kib: 1024, mb: 1e6, mib: 1048576, gb: 1e9, gib: 1073741824, tb: 1e12, tib: 1099511627776 }[m[2].toLowerCase()] || 1;
  return parseFloat(m[1]) * u;
};

/* ------------------------------ real ------------------------------ */
const real = {
  async list() {
    const ids = await run('docker', ['ps', '-aq']);
    if (!ids.ok) throw new Error(ids.err.trim() || 'docker unavailable');
    const list = ids.out.split('\n').filter(Boolean);
    if (!list.length) return {};
    const fmt = '{{.Name}}|{{.State.Status}}|{{.State.StartedAt}}|{{.RestartCount}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.Config.Image}}|{{.State.ExitCode}}|{{.Created}}';
    const r = await run('docker', ['inspect', '-f', fmt, ...list]);
    const out = {};
    for (const line of r.out.split('\n').filter(Boolean)) {
      const [name, state, started, restarts, health, image, exit, created] = line.split('|');
      out[name.replace(/^\//, '')] = { state, started, restarts: +restarts || 0, health, image, exit: +exit || 0, created };
    }
    return out;
  },
  async stats() {
    const r = await run('docker', ['stats', '--no-stream', '--format', '{{json .}}'], { timeout: 25000 });
    const out = {};
    for (const line of r.out.split('\n').filter(Boolean)) {
      try {
        const j = JSON.parse(line);
        const [used, limit] = (j.MemUsage || '').split('/');
        out[j.Name] = {
          cpu: parseFloat(j.CPUPerc) || 0, mem: toBytes(used), memLimit: toBytes(limit),
          memPct: parseFloat(j.MemPerc) || 0, net: j.NetIO, blk: j.BlockIO, pids: +j.PIDs || 0,
        };
      } catch { /* skip bad line */ }
    }
    return out;
  },
  inspectMounts: (name) => run('docker', ['inspect', '-f', '{{json .Mounts}}', name]).then((r) => { try { return JSON.parse(r.out); } catch { return []; } }),
  action: (name, act) => run('docker', [act, name], { timeout: 60000 }),
  logs: (name, tail) => run('docker', ['logs', '--timestamps', '--tail', String(tail), name]).then((r) => r.out + r.err),
  logStream: (name, onData, onClose) => live('docker', ['logs', '-f', '--timestamps', '--tail', '120', name], { onData, onClose }),
  exec: (name, shCmd, timeout = 60000) => run('docker', ['exec', name, 'sh', '-c', shCmd], { timeout }),
};

/* ------------------------------ demo ------------------------------ */
const demo = (() => {
  const names = ['voicebite-agent', 'voicebite-web', 'nexus-db', 'nexus', 'aquaos', 'jewelry-db', 'jewelry-api', 'jewelry-boutique', 'jewelry-crm',
    'greenloop', 'exotic-db', 'exotic-cars', 'school-intel', 'terrakit', 'caddy', 'cloudflared'];
  const base = Date.now();
  const st = {};
  names.forEach((n, i) => {
    st[n] = { state: 'running', started: new Date(base - (3 + i * 7) * 3600e3).toISOString(), restarts: n === 'jewelry-api' ? 1 : 0, health: '', image: `${n}:latest`, exit: 0, created: new Date(base - 86400e3 * 3).toISOString(), cpu: 0.3 + (i % 5) * 0.4, mem: (30 + i * 14) * 1048576 };
  });
  st['greenloop'].restarts = 2;
  const lines = (n) => {
    const t = new Date().toISOString();
    const pool = {
      caddy: [`{"level":"info","logger":"http.log.access","msg":"handled request","status":200,"uri":"/"}`, `{"level":"info","msg":"certificate obtained successfully"}`],
      'nexus-db': ['checkpoint complete: wrote 42 buffers (0.3%)', 'connection received: host=172.20.0.4', 'LOG:  automatic vacuum of table "nexus.public.kv"'],
      'jewelry-db': ['checkpoint starting: time', 'connection authorized: user=jewel database=jewelry'],
    }[n] || ['GET /api/health 200 3ms', 'GET / 200 12ms', 'POST /api/auth/login 200 41ms', 'job gold-ingest finished in 212ms', 'socket connected id=' + Math.random().toString(36).slice(2, 8)];
    return `${t} ${pool[Math.floor(Math.random() * pool.length)]}\n`;
  };
  return {
    async list() { return JSON.parse(JSON.stringify(st)); },
    async stats() {
      const out = {};
      for (const [n, s] of Object.entries(st)) {
        if (s.state !== 'running') continue;
        s.cpu = Math.max(0.05, Math.min(60, s.cpu + (Math.random() - 0.5) * 0.8));
        s.mem = Math.max(2e7, s.mem + (Math.random() - 0.5) * 3e6);
        out[n] = { cpu: s.cpu, mem: s.mem, memLimit: 16 * 1073741824, memPct: (s.mem / (16 * 1073741824)) * 100, net: `${(Math.random() * 90).toFixed(1)}MB / ${(Math.random() * 40).toFixed(1)}MB`, blk: '12MB / 4MB', pids: 8 + Math.floor(Math.random() * 20) };
      }
      return out;
    },
    async action(name, act) {
      if (!st[name]) return { ok: false, err: 'no such container', out: '' };
      if (act === 'stop') st[name].state = 'exited';
      else { st[name].state = 'running'; st[name].started = new Date().toISOString(); if (act === 'restart') st[name].restarts++; }
      return { ok: true, out: name, err: '' };
    },
    async logs(name, tail) { return Array.from({ length: Math.min(tail, 60) }, () => lines(name)).join(''); },
    logStream(name, onData, onClose) {
      onData(Array.from({ length: 25 }, () => lines(name)).join(''));
      const iv = setInterval(() => onData(lines(name)), 900);
      return { kill() { clearInterval(iv); onClose?.(0); } };
    },
    async exec(name, cmd) {
      if (/pg_stat_user_tables|pg_database_size/.test(cmd)) return { ok: true, out: 'size|18 MB\nkv|312\nusers|48\nsessions|1204\naudit_log|9981\n', err: '' };
      if (/pg_dump/.test(cmd)) return { ok: true, out: '-- demo dump\n', err: '' };
      return { ok: true, out: '', err: '' };
    },
  };
})();

export const docker = process.env.DEMO ? demo : real;
