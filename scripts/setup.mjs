#!/usr/bin/env node
// First-run setup for any OS (Windows, macOS, Linux). Creates .env with fresh secrets and a first-time admin password.
// Usage: node scripts/setup.mjs [--user admin] [--port 3000]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) { console.log('.env already exists - nothing changed. Delete it to set up again.'); process.exit(0); }

const rand = (n) => crypto.randomBytes(n * 2).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, n);
const user = arg('user', 'admin');
const password = `${rand(14)}A1`;
const home = path.join(os.homedir(), 'devx-apps');
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(envFile, [
  `PORT=${arg('port', '3000')}`,
  `SESSION_SECRET=${rand(48)}`,
  `VAULT_KEY=${rand(48)}`,
  `INIT_USERS=${user}`,
  `INIT_PASSWORD=${password}`,
  `APPS_DIR=${home}`,
  ''
].join('\n'), { mode: 0o600 });

console.log(`\nDevX Control is set up.\n  Open:      http://localhost:${arg('port', '3000')}\n  User:      ${user}\n  Password:  ${password}   (first-time only; change it on the Account page)\n\nStart it with:  npm start\nDocker must be installed and running for it to manage containers.\n`);
