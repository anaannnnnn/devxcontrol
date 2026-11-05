import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeInfraAgent } from '../lib/infra-agent.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dc-ia-'));

test('infra agent: enroll → activate → heartbeat stores real metrics only', () => {
  const agents = makeInfraAgent({ dataDir: tmp() });
  const { enrollmentToken } = agents.enroll({ label: 'box' });
  const act = agents.activate({
    enrollmentToken,
    deviceId: 'ubuntu-server',
    hostname: 'ubuntu-server',
    capabilities: ['metrics', 'docker'],
    version: '0.1.0',
  });
  assert.ok(act.agentId);
  assert.ok(act.credentials.secret);

  const hb = agents.heartbeat(act.agentId, act.credentials.secret, {
    metrics: { cpuPct: 12, memUsed: 100, memTotal: 1000 },
    containers: [{ id: 'c1', name: 'web', image: 'nginx', status: 'Up' }],
    applications: [],
  });
  assert.equal(hb.ok, true);

  const snap = agents.snapshot('ubuntu-server');
  assert.equal(snap.enrolled, true);
  assert.equal(snap.metrics.cpuPct, 12);
  assert.equal(snap.containers.length, 1);
});

test('infra agent: bad secret rejected', () => {
  const agents = makeInfraAgent({ dataDir: tmp() });
  const { enrollmentToken } = agents.enroll();
  const act = agents.activate({ enrollmentToken, deviceId: 'x', hostname: 'x' });
  assert.throws(() => agents.heartbeat(act.agentId, 'wrong', {}), /auth/i);
});

test('infra agent: container logs via command results', () => {
  const agents = makeInfraAgent({ dataDir: tmp() });
  const { enrollmentToken } = agents.enroll();
  const act = agents.activate({ enrollmentToken, deviceId: 'box', hostname: 'box' });
  const cmd = agents.enqueue(act.agentId, 'container.logs', { containerId: 'abc123' });
  assert.ok(cmd.id);
  agents.heartbeat(act.agentId, act.credentials.secret, {
    commandResults: [{ type: 'container.logs', containerId: 'abc123', text: 'hello log' }],
  });
  const logs = agents.containerLogs('box', 'abc123');
  assert.equal(logs.available, true);
  assert.equal(logs.text, 'hello log');
});
