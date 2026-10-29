import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformPrisma, transformEnv, transformCompose, transform, describe as describePr } from '../lib/mongopr.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/pr');
const fx = (n) => fs.readFileSync(path.join(dir, n), 'utf8');

test('prisma: a Postgres schema becomes a MongoDB one', () => {
  const src = fx('schema.prisma');
  const r = transformPrisma(src);
  assert.ok(r.changed);
  assert.match(r.text, /provider\s*=\s*"mongodb"/);
  assert.doesNotMatch(r.text, /"postgresql"/);
  const models = (src.match(/^model /gm) || []).length;
  assert.equal((r.text.match(/^model /gm) || []).length, models);
  const ids = (r.text.match(/@id\b/g) || []).length;
  assert.equal((r.text.match(/@id @map\("_id"\)/g) || []).length, ids, 'every id is stored as _id');
  assert.doesNotMatch(r.text, /@db\.(VarChar|Text|Uuid|Decimal|Timestamp)/);
  assert.equal(transformPrisma(r.text).changed, false, 'running it again changes nothing');
});

test('prisma: Int autoincrement ids and their foreign keys become ObjectIds, native Postgres types go', () => {
  const src = `datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")\n}\nmodel User {\n  id Int @id @default(autoincrement())\n  name String @db.VarChar(80)\n  posts Post[]\n}\nmodel Post {\n  id Int @id @default(autoincrement())\n  authorId Int\n  author User @relation(fields: [authorId], references: [id])\n  note String? @db.Text\n}\nmodel Pair {\n  a String\n  b String\n  @@id([a, b])\n}\n`;
  const r = transformPrisma(src);
  assert.match(r.text, /id String @id @default\(auto\(\)\) @map\("_id"\) @db\.ObjectId/);
  assert.match(r.text, /authorId String @db\.ObjectId/);
  assert.doesNotMatch(r.text, /directUrl/); assert.doesNotMatch(r.text, /@db\.(VarChar|Text)/);
  assert.ok(r.warnings.some((w) => /Pair/.test(w) && /composite/.test(w)));
});

test('env example: the placeholder replaces a local address and is added when missing', () => {
  const a = transformEnv(fx('wasl-env.example'), 'MONGO_URI');
  assert.match(a.text, /MONGO_URI=mongodb\+srv:\/\/USER:PASSWORD@/);
  assert.match(a.text, /never in the repository/);
  const b = transformEnv('PORT=1\n', 'MONGO_URI');
  assert.match(b.text, /^PORT=1\n[\s\S]*MONGO_URI=mongodb\+srv/);
});

test('compose: a Mongo app stops pinning the bundled database', () => {
  const r = transformCompose(fx('wasl-old-compose.yml'), { envVar: 'MONGO_URI', engine: 'mongo' });
  assert.ok(r.changed);
  assert.doesNotMatch(r.text, /MONGO_URI: mongodb:\/\/mongo/);
  assert.doesNotMatch(r.text, /service_healthy/);
  assert.match(r.text, /PORT: 4000/);
  assert.match(r.text, /image: mongo:7\.0\n    profiles: \["local-db"\]/);
  assert.match(r.text, /env_file: \.env/);
  assert.match(r.text, /redis:/); assert.match(r.text, /nginx:/);
});

test('compose: a Postgres dev database is kept out of the way once the app uses MongoDB', () => {
  const r = transformCompose(fx('postgres-compose.yml'), { envVar: 'DATABASE_URL', engine: 'postgres' });
  assert.match(r.text, /image: postgres:16-alpine\n    profiles: \["legacy-postgres"\]/);
});

test('whole repo: Prisma + migrations + scripts + env + compose', () => {
  const files = {
    'server/prisma/schema.prisma': fx('schema.prisma'),
    'server/prisma/migrations/20260921_init/migration.sql': '',
    'server/prisma/migrations/migration_lock.toml': '',
    'server/package.json': '{"scripts":{"prisma:deploy":"prisma migrate deploy","prisma:migrate":"prisma migrate dev --name init"}}',
    'Dockerfile.api': 'CMD ["sh","-c","npx prisma migrate deploy && node dist/index.js"]\n',
    'server/scripts/migrate-deploy.mjs': 'spawnSync("npx", ["prisma", "migrate", "deploy"], {})\n',
    'server/src/report.ts': 'await prisma.$queryRaw`select 1`;\n',
    '.env.example': 'DATABASE_URL="postgresql://u:p@localhost:5433/db"\nJWT_SECRET=x\n',
    'docker-compose.yml': fx('postgres-compose.yml'),
  };
  const r = transform(files);
  assert.equal(r.kind, 'prisma'); assert.equal(r.envVar, 'DATABASE_URL');
  assert.equal(r.deletes.length, 2);
  assert.match(r.edits['server/package.json'], /prisma db push --skip-generate/);
  assert.match(r.edits['server/package.json'], /prisma db push"/);
  assert.match(r.edits['Dockerfile.api'], /prisma db push --skip-generate && node dist\/index\.js/);
  assert.match(r.edits['server/scripts/migrate-deploy.mjs'], /"db", "push", "--skip-generate"/);
  assert.match(r.edits['.env.example'], /DATABASE_URL=mongodb\+srv:\/\/USER:PASSWORD@/);
  assert.match(r.edits['docker-compose.yml'], /legacy-postgres/);
  assert.ok(r.warnings.some((w) => /Raw SQL/.test(w) && /report\.ts/.test(w)));
  const md = describePr({ app: { name: 'Shop' }, binding: { clusterName: 'Cluster 0', database: 'shop' }, result: r, validation: { ok: true, label: 'prisma validate' } });
  assert.match(md, /Needs a person/); assert.match(md, /Raw SQL/); assert.match(md, /prisma validate: passed/);
});

test('whole repo: an app that already speaks MongoDB only gets config changes', () => {
  const r = transform({ '.env.example': fx('wasl-env.example'), 'docker-compose.yml': fx('wasl-old-compose.yml') }, { envVar: 'MONGO_URI' });
  assert.equal(r.kind, 'config');
  assert.ok(r.edits['.env.example'] && r.edits['docker-compose.yml']);
  assert.equal(r.deletes.length, 0);
});
