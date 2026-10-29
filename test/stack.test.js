import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, discover, nameServices, dockerfileFor, composeFor, envPlan, isInfraImage } from '../lib/stack.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/stack');
const list = (d, base = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(path.join(d, e.name), `${base}${e.name}/`) : [{ path: `${base}${e.name}` }]));
const files = list(dir);
const read = async (p) => { try { return fs.readFileSync(path.join(dir, p), 'utf8'); } catch { return null; } };

test('isInfraImage recognises databases and caches, not apps', () => {
  for (const i of ['postgres:16-alpine', 'mongo:7.0', 'redis:7', 'library/mysql', 'bitnami/postgresql:16', 'mariadb']) assert.ok(isInfraImage(i), i);
  for (const i of ['node:22', 'nginx:1.27', 'myapp', 'ghcr.io/me/api:1', null, '']) assert.ok(!isInfraImage(i), String(i));
});

test('parseYaml reads maps, lists of maps, scalars and comments', () => {
  const y = parseYaml('a: 1\nb:\n  - name: x # note\n    list:\n      - key: K\n        sync: false\n      - key: J\n        value: "q"\n  - name: y\nc: [1, 2]\nd: {}\n');
  assert.equal(y.a, 1);
  assert.equal(y.b.length, 2);
  assert.deepEqual(y.b[0].list, [{ key: 'K', sync: false }, { key: 'J', value: 'q' }]);
  assert.equal(y.b[1].name, 'y'); assert.deepEqual(y.c, [1, 2]); assert.deepEqual(y.d, {});
});

test('discover reads render.yaml: one API and two static front ends, migrations kept for start-up', async () => {
  const st = await discover({ files, read });
  assert.equal(st.source, 'render.yaml');
  assert.equal(st.services.length, 3);
  const api = st.services.find((s) => s.kind === 'node');
  assert.equal(api.root, 'server');
  assert.deepEqual(api.build, ['npm run build']);
  assert.deepEqual(api.runtime.map((r) => r.cmd), ['npx prisma migrate deploy', 'npm run db:seed']);
  assert.deepEqual(api.runtime.map((r) => r.once), [false, true]);
  assert.equal(api.health, '/health');
  assert.equal(st.services.filter((s) => s.kind === 'static').length, 2);
  assert.ok(st.databases.length >= 1);
});

test('a single program in the repo root is not a stack', async () => {
  const f = [{ path: 'package.json' }, { path: 'index.js' }];
  assert.equal(await discover({ files: f, read: async (p) => (p === 'package.json' ? '{"name":"x","scripts":{"start":"node index.js"}}' : '') }), null);
});

test('naming gives short names, a container each, and the main site the chosen domain', async () => {
  const st = nameServices(await discover({ files, read }), { id: 'jewel', domain: 'jewel.example.com' });
  assert.deepEqual(st.services.map((s) => s.short).sort(), ['api', 'crm', 'web']);
  assert.equal(st.main, 'web');
  const byShort = Object.fromEntries(st.services.map((s) => [s.short, s]));
  assert.equal(byShort.web.host, 'jewel.example.com');
  assert.equal(byShort.crm.host, 'crm-jewel.example.com');
  assert.equal(byShort.api.host, 'api-jewel.example.com');
  assert.equal(byShort.crm.container, 'jewel-crm');
  assert.equal(byShort.crm.label, 'CRM'); assert.equal(byShort.api.label, 'API');
});

test('env plan: database provisioned, secrets generated, CORS lists the web addresses, front ends are built against the API address', async () => {
  const st = nameServices(await discover({ files, read }), { id: 'jewel', domain: 'jewel.example.com' });
  const env = envPlan(st);
  const get = (k) => env.find((e) => e.key === k);
  assert.equal(get('DATABASE_URL').provision, 'postgres');
  assert.equal(get('JWT_SECRET').generate, true);
  assert.equal(get('JWT_EXPIRES_IN').value, '7d');
  assert.match(get('CORS_ORIGINS').value, /https:\/\/jewel\.example\.com/);
  assert.match(get('CORS_ORIGINS').value, /https:\/\/crm-jewel\.example\.com/);
  assert.equal(get('PORT').value, String(st.services.find((s) => s.kind === 'node').port));
  const web = st.services.find((s) => s.short === 'web');
  assert.deepEqual(web.buildArgs, ['VITE_API_URL']);
  assert.equal(st.argValues.VITE_API_URL, 'https://api-jewel.example.com');
});

test('Dockerfiles: the API runs migrations at start and seeds once; front ends build then serve static files', async () => {
  const st = nameServices(await discover({ files, read }), { id: 'jewel', domain: 'jewel.example.com' }); envPlan(st);
  const api = dockerfileFor(st, st.services.find((s) => s.short === 'api'));
  assert.match(api, /openssl/); assert.match(api, /WORKDIR \/app\/server/);
  assert.match(api, /cd server && npm run build/);
  assert.match(api, /npx prisma migrate deploy/); assert.match(api, /seeded/);
  assert.match(api, /exec npm run start/);
  const crm = dockerfileFor(st, st.services.find((s) => s.short === 'crm'));
  assert.match(crm, /ARG VITE_API_URL/); assert.match(crm, /cd apps\/crm && npm run build/);
  assert.match(crm, /COPY --from=build \/app\/apps\/crm\/dist \/srv/); assert.match(crm, /try_files/);
});

test('compose: every program on the web network, state volume for the API, no published ports at all', async () => {
  const st = nameServices(await discover({ files, read }), { id: 'jewel', domain: 'jewel.example.com' }); envPlan(st);
  const c = composeFor(st);
  assert.doesNotMatch(c, /ports:/);
  assert.match(c, /container_name: "jewel-api"/); assert.match(c, /dockerfile: \.devx\/Dockerfile\.crm/);
  assert.match(c, /VITE_API_URL: "https:\/\/api-jewel\.example\.com"/);
  assert.match(c, /external: true/); assert.match(c, /"jewel-api-state:\/devx-state"/);
});
