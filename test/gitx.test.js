import test from 'node:test';
import assert from 'node:assert/strict';
import { worktreeChanges } from '../lib/gitx.js';

test('deploy files do not count as application edits', () => {
  const wt = worktreeChanges([
    ' M docker-compose.yml',
    '?? Dockerfile.api',
    '?? Dockerfile.web',
    '?? jewelry.env',
    '?? .dockerignore',
  ].join('\n'));
  assert.equal(wt.dirty, false);
  assert.deepEqual(wt.deploy.sort(), ['.dockerignore', 'Dockerfile.api', 'Dockerfile.web', 'docker-compose.yml', 'jewelry.env'].sort());
});

test('application edits still block a pull', () => {
  const wt = worktreeChanges(' M lib/erpimg.js\n?? Dockerfile\n');
  assert.equal(wt.dirty, true);
  assert.deepEqual(wt.source, ['lib/erpimg.js']);
});
