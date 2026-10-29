import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDockerfile } from '../lib/dockerize.js';
const mk = (m) => ({ files: Object.keys(m).map((path) => ({ path })), read: async (p) => m[p] ?? null });

test('express app gets npm start, its port, non-root user', async () => {
  const r = await generateDockerfile(mk({ 'package.json': JSON.stringify({ scripts: { start: 'node server.js' }, dependencies: { express: '4' } }), 'package-lock.json': '{}', 'server.js': 'app.listen(process.env.PORT || 4000)' }));
  assert.equal(r.port, 4000); assert.match(r.dockerfile, /npm ci --omit=dev/); assert.match(r.dockerfile, /USER node/); assert.match(r.dockerfile, /CMD \["npm", "start"\]/);
});
test('vite site is built then served by nginx', async () => {
  const r = await generateDockerfile(mk({ 'package.json': JSON.stringify({ scripts: { build: 'vite build' }, devDependencies: { vite: '5' } }) }));
  assert.equal(r.port, 80); assert.match(r.dockerfile, /nginx/); assert.match(r.dockerfile, /\/app\/dist/);
});
test('python fastapi, go, plain html are recognised; unknown is null', async () => {
  assert.match((await generateDockerfile(mk({ 'requirements.txt': 'fastapi\nuvicorn', 'main.py': '' }))).dockerfile, /uvicorn/);
  assert.equal((await generateDockerfile(mk({ 'go.mod': 'module x\ngo 1.22', 'main.go': '' }))).port, 8080);
  assert.equal((await generateDockerfile(mk({ 'index.html': '' }))).port, 80);
  assert.equal(await generateDockerfile(mk({ 'README.md': '' })), null);
});
test('build step does not run with devDependencies stripped', async () => {
  const r = await generateDockerfile(mk({ 'package.json': JSON.stringify({ scripts: { start: 'node a.js', build: 'tsc' }, dependencies: { express: '4' } }), 'package-lock.json': '{}' }));
  assert.ok(r.dockerfile.indexOf('npm run build') < r.dockerfile.indexOf('NODE_ENV=production'));
  assert.doesNotMatch(r.dockerfile, /--omit=dev/);
});
