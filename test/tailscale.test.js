import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeIntegrations } from '../lib/integrations.js';
import { makeTailscale, mapDevice } from '../lib/tailscale.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dc-ts-'));

test('mapDevice: maps Tailscale API fields without inventing apps', () => {
  const d = mapDevice({
    nodeId: 'n1',
    hostname: 'ubuntu-server',
    name: 'ubuntu-server.tailnet.ts.net',
    os: 'linux',
    addresses: ['100.64.0.2'],
    online: true,
    lastSeen: '2026-11-05T00:00:00Z',
    clientVersion: '1.76.0',
  });
  assert.equal(d.id, 'n1');
  assert.equal(d.name, 'ubuntu-server');
  assert.equal(d.os, 'linux');
  assert.equal(d.status, 'online');
  assert.deepEqual(d.addresses, ['100.64.0.2']);
  assert.equal(d.appsCount, undefined);
  assert.equal(d.agent.enrolled, false);
});

test('tailscale.devices: empty honest response when not configured', async () => {
  const integrations = makeIntegrations({ dataDir: tmp(), key: 'test-vault-key-please-32b' });
  const ts = makeTailscale({ integrations, fetchImpl: async () => { throw new Error('should not fetch'); } });
  const r = await ts.devices();
  assert.equal(r.connected, false);
  assert.deepEqual(r.devices, []);
  assert.match(r.reason, /API key/i);
});

test('tailscale.devices: returns mapped devices from API', async () => {
  const dir = tmp();
  const integrations = makeIntegrations({ dataDir: dir, key: 'test-vault-key-please-32b' });
  integrations.setTailscale({ apiKey: 'tskey-api-' + 'x'.repeat(40), tailnet: 'example.com' });
  const ts = makeTailscale({
    integrations,
    fetchImpl: async (url, opts) => {
      assert.match(url, /\/tailnet\/example\.com\/devices$/);
      assert.match(opts.headers.Authorization, /^Bearer /);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          devices: [
            { nodeId: 'a', hostname: 'online-box', os: 'linux', addresses: ['100.64.1.1'], online: true },
            { nodeId: 'b', hostname: 'offline-box', os: 'windows', addresses: ['100.64.1.2'], online: false },
          ],
        }),
      };
    },
  });
  const r = await ts.devices({ statusFilter: 'online' });
  assert.equal(r.connected, true);
  assert.equal(r.devices.length, 1);
  assert.equal(r.devices[0].name, 'online-box');
  assert.equal(r.devices[0].status, 'online');
});

test('tailscale.status: clears nothing but reports API failure', async () => {
  const integrations = makeIntegrations({ dataDir: tmp(), key: 'test-vault-key-please-32b' });
  integrations.setTailscale({ apiKey: 'tskey-api-' + 'y'.repeat(40), tailnet: '-' });
  const ts = makeTailscale({
    integrations,
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ message: 'unauthorized' }) }),
  });
  const st = await ts.status();
  assert.equal(st.connected, false);
  assert.match(st.reason, /unauthorized|Tailscale/i);
});
