#!/usr/bin/env node
/**
 * DevX Host Agent — runs on a Tailscale-connected machine.
 * Egress-only: enroll/activate once, then heartbeat metrics/containers/apps to Control.
 *
 * Usage:
 *   CONTROL_URL=https://panel.example.com \
 *   ENROLLMENT_TOKEN=enr_... \
 *   DEVICE_ID=ubuntu-server \
 *   node agents/host/agent.mjs
 *
 * After first activate, credentials are stored in AGENT_STATE (default ./agent-state.json).
 */
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CONTROL = (process.env.CONTROL_URL || '').replace(/\/+$/, '');
const STATE = process.env.AGENT_STATE || './agent-state.json';
const INTERVAL = Math.max(15, Number(process.env.HEARTBEAT_SEC || 30)) * 1000;

if (!CONTROL) {
  console.error('Set CONTROL_URL to your DevX Control base URL.');
  process.exit(1);
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return null; }
}
function saveState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${CONTROL}/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(json.detail || json.title || json.message || `HTTP ${res.status}`);
  return json;
}

async function metrics() {
  const cpus = os.cpus() || [];
  const load = os.loadavg()?.[0] || 0;
  const total = os.totalmem();
  const free = os.freemem();
  return {
    cpuPct: cpus.length ? Math.min(100, (load / cpus.length) * 100) : 0,
    memUsed: total - free,
    memTotal: total,
    load1: load,
    uptimeSec: os.uptime(),
  };
}

async function containers() {
  try {
    const { stdout } = await exec('docker', ['ps', '-a', '--format', '{{json .}}'], { timeout: 15000 });
    return stdout.split('\n').filter(Boolean).map((line) => {
      const j = JSON.parse(line);
      return {
        id: j.ID || j.Id,
        name: (j.Names || j.Name || '').replace(/^\//, ''),
        image: j.Image,
        status: j.Status || j.State,
        state: (j.State || '').toLowerCase() || undefined,
      };
    });
  } catch {
    return [];
  }
}

async function processes() {
  try {
    const { stdout } = await exec('ps', ['-eo', 'pid,user,pcpu,pmem,comm', '--sort=-pcpu'], { timeout: 8000 });
    return stdout.split('\n').slice(1, 81).filter(Boolean).map((line) => {
      const parts = line.trim().split(/\s+/);
      const [pid, user, pcpu, pmem, ...rest] = parts;
      return {
        pid: Number(pid) || 0,
        user: user || '',
        cpuPct: Number(pcpu) || 0,
        memPct: Number(pmem) || 0,
        command: rest.join(' ').slice(0, 120),
      };
    }).filter((p) => p.pid > 0);
  } catch {
    return [];
  }
}

async function discoverApps() {
  const ports = [80, 443, 3000, 3001, 4000, 5000, 8000, 8080, 8443, 9000];
  const found = [];
  for (const port of ports) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 1200);
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: ac.signal, redirect: 'manual' });
      clearTimeout(t);
      found.push({
        id: `local-${port}`,
        name: `localhost:${port}`,
        deviceId: process.env.DEVICE_ID || os.hostname(),
        hostServer: os.hostname(),
        status: res.status < 500 ? 'running' : 'unknown',
        listenAddresses: [`127.0.0.1:${port}`],
        discoveredAt: new Date().toISOString(),
        probe: { ok: res.status < 500, status: res.status, ms: 0 },
      });
    } catch { /* nothing listening */ }
  }
  return found;
}

async function dockerLogs(containerId, lines = 200) {
  try {
    const { stdout, stderr } = await exec(
      'docker',
      ['logs', '--tail', String(lines), String(containerId)],
      { timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
    );
    return (stdout || '') + (stderr || '');
  } catch (e) {
    return `docker logs failed: ${e.message}`;
  }
}

async function runCommands(commands = []) {
  const results = [];
  for (const cmd of commands) {
    if (cmd.type === 'discovery.scan') {
      // Discovery always runs each heartbeat; acknowledge the command.
      results.push({ type: cmd.type, id: cmd.id, ok: true });
      continue;
    }
    if (cmd.type === 'container.logs') {
      const containerId = cmd.params?.containerId;
      if (!containerId) {
        results.push({ type: cmd.type, id: cmd.id, ok: false, error: 'containerId required' });
        continue;
      }
      const text = await dockerLogs(containerId, cmd.params?.tail || 200);
      results.push({ type: cmd.type, id: cmd.id, ok: true, containerId, text });
    }
  }
  return results;
}

async function activate() {
  const token = process.env.ENROLLMENT_TOKEN;
  if (!token) throw new Error('ENROLLMENT_TOKEN required for first activation.');
  const body = {
    enrollmentToken: token,
    deviceId: process.env.DEVICE_ID || os.hostname(),
    hostname: os.hostname(),
    version: '0.1.1',
    capabilities: ['metrics', 'docker', 'discovery', 'processes', 'logs'],
  };
  const r = await post('/infra/agents/activate', body);
  const state = { agentId: r.agentId, deviceId: r.deviceId, secret: r.credentials.secret };
  saveState(state);
  console.log('Activated agent', state.agentId, 'for device', state.deviceId);
  return state;
}

async function beat(state) {
  const [m, c, apps, procs] = await Promise.all([metrics(), containers(), discoverApps(), processes()]);
  const r = await post('/infra/agents/heartbeat', {
    agentId: state.agentId,
    version: '0.1.1',
    capabilities: ['metrics', 'docker', 'discovery', 'processes', 'logs'],
    metrics: m,
    containers: c,
    applications: apps,
    processes: procs,
    ts: new Date().toISOString(),
  }, { 'x-agent-secret': state.secret, 'x-agent-id': state.agentId });

  if (r.commands?.length) {
    console.log('Pending commands:', r.commands.map((x) => x.type).join(', '));
    const commandResults = await runCommands(r.commands);
    if (commandResults.length) {
      await post('/infra/agents/heartbeat', {
        agentId: state.agentId,
        commandResults,
        ts: new Date().toISOString(),
      }, { 'x-agent-secret': state.secret, 'x-agent-id': state.agentId });
    }
  }
}

async function main() {
  let state = loadState();
  if (!state?.agentId || !state?.secret) state = await activate();
  console.log('Heartbeating to', CONTROL, 'every', INTERVAL / 1000, 's');
  for (;;) {
    try { await beat(state); }
    catch (e) { console.error('Heartbeat failed:', e.message); }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
