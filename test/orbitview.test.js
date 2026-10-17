import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeSky } from '../lib/orbitview.js';

test('planets use monitor facts and leave traffic empty when it was not sampled', () => {
  const sky = shapeSky([
    { id: 'nexus', name: 'Nexus', status: 'healthy', ms: 40, cpu: 1, mem: 2, spark: { ms: [40, 42, null] }, containers: [{ name: 'nexus', state: 'running' }] },
    { id: 'voicebite', name: 'VoiceBite', status: 'unknown', ms: null, spark: { ms: [] }, containers: [] },
  ], {
    events: [{ t: Date.now(), app: 'nexus', level: 'bad', type: 'status', msg: 'down' }, { t: Date.now(), app: 'nexus', type: 'deploy', level: 'info', msg: 'deployed' }],
    backups: [{ app: 'nexus' }],
    behind: { nexus: 2 },
  });
  const n = sky.planets[0];
  assert.equal(n.size, 2);
  assert.match(n.sizeMeaning, /Not visitor traffic/);
  assert.equal(n.glow, 'healthy');
  assert.equal(n.rings, 1);
  assert.equal(n.moons.length, 1);
  assert.equal(n.flares.length, 1);
  assert.equal(n.comets.length, 1);
  assert.equal(n.satellites, 2);
  const v = sky.planets[1];
  assert.equal(v.size, null);
  assert.match(v.sizeReason, /not measured/);
  assert.equal(v.orbitSpeed, null);
});
