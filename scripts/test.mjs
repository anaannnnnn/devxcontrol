// Runs every test file on any OS and Node 20+ (Node 20 on Windows does not expand test/*.test.js itself).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(path.join(root, 'test')).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join('test', f));
const r = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
