// Management-side registry for DevX Host Agents (egress heartbeats + command pull).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function makeInfraAgent({ dataDir }) {
  const file = path.join(dataDir, 'infra-agents.json');
  let S = { enrollments: [], agents: {}, commands: {} };
  try { S = { ...S, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  const save = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(S), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };

  function enroll({ label, ttlMs = 15 * 60e3 } = {}) {
    const token = 'enr_' + crypto.randomBytes(18).toString('base64url');
    const rec = { token, label: String(label || 'host').slice(0, 80), exp: Date.now() + ttlMs, used: false };
    S.enrollments = (S.enrollments || []).filter((e) => !e.used && e.exp > Date.now());
    S.enrollments.push(rec);
    save();
    return { enrollmentToken: token, expiresAt: new Date(rec.exp).toISOString() };
  }

  function activate({ enrollmentToken, deviceId, hostname, capabilities = [], version }) {
    const enr = (S.enrollments || []).find((e) => e.token === enrollmentToken && !e.used && e.exp > Date.now());
    if (!enr) {
      const err = new Error('Enrollment token invalid or expired.');
      err.status = 401; err.code = 'enrollment-invalid'; throw err;
    }
    enr.used = true;
    const agentId = 'agt_' + crypto.randomBytes(10).toString('hex');
    const secret = crypto.randomBytes(24).toString('base64url');
    S.agents[agentId] = {
      agentId,
      deviceId: String(deviceId || hostname || agentId).slice(0, 120),
      hostname: String(hostname || '').slice(0, 120),
      secretHash: crypto.createHash('sha256').update(secret).digest('hex'),
      capabilities: (capabilities || []).map(String).slice(0, 32),
      version: String(version || '').slice(0, 40),
      lastHeartbeatAt: null,
      metrics: null,
      containers: [],
      applications: [],
      processes: [],
      logs: {},
    };
    save();
    return { agentId, deviceId: S.agents[agentId].deviceId, credentials: { secret } };
  }

  function auth(agentId, secret) {
    const a = S.agents[agentId];
    if (!a) return null;
    const h = crypto.createHash('sha256').update(String(secret || '')).digest('hex');
    if (h !== a.secretHash) return null;
    return a;
  }

  function heartbeat(agentId, secret, body = {}) {
    const a = auth(agentId, secret);
    if (!a) { const err = new Error('Agent auth failed.'); err.status = 401; err.code = 'agent-auth'; throw err; }
    a.lastHeartbeatAt = new Date().toISOString();
    a.version = String(body.version || a.version || '').slice(0, 40);
    if (Array.isArray(body.capabilities)) a.capabilities = body.capabilities.map(String).slice(0, 32);
    if (body.metrics && typeof body.metrics === 'object') a.metrics = body.metrics;
    if (Array.isArray(body.containers)) a.containers = body.containers.slice(0, 200);
    if (Array.isArray(body.applications)) a.applications = body.applications.slice(0, 200);
    if (Array.isArray(body.processes)) a.processes = body.processes.slice(0, 300);
    if (body.logs && typeof body.logs === 'object') {
      a.logs = a.logs || {};
      for (const [cid, text] of Object.entries(body.logs)) {
        if (typeof text === 'string') a.logs[String(cid).slice(0, 80)] = text.slice(-120_000);
      }
    }
    // Command results from agent (e.g. docker logs pull)
    if (Array.isArray(body.commandResults)) {
      a.logs = a.logs || {};
      for (const r of body.commandResults.slice(0, 20)) {
        if (r?.type === 'container.logs' && r.containerId && typeof r.text === 'string') {
          a.logs[String(r.containerId).slice(0, 80)] = r.text.slice(-120_000);
        }
      }
    }
    save();
    const pending = S.commands[agentId] || [];
    S.commands[agentId] = [];
    save();
    return { ok: true, commands: pending };
  }

  function list() {
    const now = Date.now();
    return Object.values(S.agents).map((a) => {
      const last = a.lastHeartbeatAt ? Date.parse(a.lastHeartbeatAt) : 0;
      const healthy = last && (now - last) < 90_000;
      return {
        agentId: a.agentId,
        deviceId: a.deviceId,
        hostname: a.hostname,
        capabilities: a.capabilities,
        version: a.version,
        lastHeartbeatAt: a.lastHeartbeatAt,
        healthy,
      };
    });
  }

  function byDevice(deviceId) {
    return Object.values(S.agents).find((a) => a.deviceId === deviceId) || null;
  }

  function enqueue(agentId, type, params = {}) {
    const a = S.agents[agentId];
    if (!a) { const err = new Error('Unknown agent.'); err.status = 404; throw err; }
    const id = 'cmd_' + crypto.randomBytes(8).toString('hex');
    const cmd = { id, type, params, createdAt: new Date().toISOString() };
    S.commands[agentId] = S.commands[agentId] || [];
    S.commands[agentId].push(cmd);
    save();
    return cmd;
  }

  function snapshot(deviceId) {
    const a = byDevice(deviceId);
    if (!a) return null;
    const last = a.lastHeartbeatAt ? Date.parse(a.lastHeartbeatAt) : 0;
    return {
      enrolled: true,
      healthy: last && (Date.now() - last) < 90_000,
      agentId: a.agentId,
      capabilities: a.capabilities,
      metrics: a.metrics,
      containers: a.containers,
      applications: a.applications,
      processes: a.processes,
      logs: a.logs || {},
      lastHeartbeatAt: a.lastHeartbeatAt,
    };
  }

  function containerLogs(deviceId, containerId) {
    const snap = snapshot(deviceId);
    if (!snap?.enrolled) return null;
    const text = snap.logs?.[containerId];
    return { enrolled: true, healthy: snap.healthy, containerId, text: text || null, available: text != null };
  }

  return { enroll, activate, heartbeat, list, byDevice, enqueue, snapshot, auth, containerLogs };
}
