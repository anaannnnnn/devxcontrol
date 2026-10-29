import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMongoLink } from '../lib/mongolink.js';

const mk = (binding, mongo) => {
  const store = new Map(binding ? [['a', binding]] : []);
  return makeMongoLink({
    settings: { mongo: (id) => store.get(id), setMongo: (id, b) => store.set(id, b), clearMongo: (id) => store.delete(id) },
    integrations: { mongoUri: () => 'mongodb+srv://u:p@c.example.mongodb.net/', mongoName: () => 'C', mongoList: () => [] },
    gitx: { check: async () => ({ mongo }), status: () => ({ mongo }), reader: async () => async () => null },
    ops: { dataInfo: async () => ({}), redeploy: async () => 0 }, audit: () => {},
  });
};
const app = { id: 'a', name: 'Shop', path: '/nonexistent', containers: [] };

test('switching needs a linked database', async () => {
  await assert.rejects(() => mk(null, { uses: true }).switchToMongo(app, () => {}), /Link a MongoDB database first/);
  await assert.rejects(() => mk({ mode: 'local' }, { uses: true }).switchToMongo(app, () => {}), /Link a MongoDB database first/);
});

test('switching is refused until the repository itself uses MongoDB, and nothing is changed', async () => {
  const link = mk({ mode: 'import-only', stage: 'imported', clusterId: 'x', database: 'shop', var: 'MONGO_URI' }, { uses: false });
  const lines = [];
  await assert.rejects(() => link.switchToMongo(app, (l) => lines.push(l)), /does not use MongoDB yet/);
  assert.ok(!lines.some((l) => /Copying/.test(l)), 'no data was copied');
});
