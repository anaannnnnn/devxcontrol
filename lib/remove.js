// Delete an onboarded app from this server: containers, route, DNS record, database, files.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { removeFor } from './caddyfile.js';
import { run } from './docker.js';

export function makeRemove({ registry, dns, ops, caddyfile, provision, appsDir, monitor, audit = () => {}, exec = run }) {
  return async function remove(app, opts = {}, log = () => {}) {
    if (!app.onboarded) throw Object.assign(new Error('Only apps added through Onboard can be deleted here.'), { status: 409 });
    const dir = app.path; const id = app.id; const hosts = (app.urls || []).map((u) => u.host).filter(Boolean);
    const step = async (label, fn) => { try { const r = await fn(); log(`${label}${r ? `: ${r}` : ''}`); return true; } catch (e) { log(`${label} failed: ${e.message}`); return false; } };

    const composeFile = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].find((f) => fs.existsSync(path.join(dir, f)));
    if (composeFile) {
      const a = ['compose', '-f', composeFile, ...(fs.existsSync(path.join(dir, 'docker-compose.devx.yml')) ? ['-f', 'docker-compose.devx.yml'] : []), '-p', id, 'down', '--remove-orphans', ...(opts.data ? ['-v'] : [])];
      await step('Stopped and removed the compose project', async () => { const r = await exec('docker', a, { cwd: dir, timeout: 180000 }); if (!r.ok) throw new Error((r.err || r.out).trim().split('\n').pop()); });
    }
    for (const c of app.containers) await step(`Removed container ${c}`, async () => { await exec('docker', ['rm', '-f', c], { timeout: 60000 }); });
    await step('Removed the image', async () => { await exec('docker', ['rmi', id], { timeout: 60000 }); });
    if (opts.data) {
      for (const v of app.volumes || []) await step(`Removed volume ${v.split(':')[0]}`, async () => { await exec('docker', ['volume', 'rm', v.split(':')[0]], { timeout: 30000 }); });
      if (provision) await step('Database', async () => { await provision.drop(id, log); });
    }

    if (caddyfile && fs.existsSync(caddyfile)) {
      await step('Caddy route', async () => {
        const before = fs.readFileSync(caddyfile, 'utf8'); const { text, removed } = removeFor(before, { id, hosts });
        if (!removed) return 'no route to remove';
        fs.writeFileSync(caddyfile, text);
        const v = await ops.caddy.validate(); if (!v.ok) { fs.writeFileSync(caddyfile, before); throw new Error('Caddy rejected the change, the old Caddyfile was restored.'); }
        const r = await ops.caddy.reload(); if (!r.ok) { fs.writeFileSync(caddyfile, before); throw new Error('Caddy reload failed, the old Caddyfile was restored.'); }
        return `removed ${removed} block${removed > 1 ? 's' : ''} and reloaded`;
      });
    }
    if (opts.dns && dns) for (const h of hosts) await step(`DNS ${h}`, async () => { const r = await dns.deleteA(h, registry.serverIp); return r.message; });

    if (opts.folder) await step('Deleted the app folder', async () => {
      const root = path.resolve(appsDir) + path.sep; const real = path.resolve(dir);
      if (!real.startsWith(root)) throw new Error('Folder is outside the apps directory, left alone.');
      await fsp.rm(real, { recursive: true, force: true }); return real;
    });
    registry.remove(id); monitor?.stopped?.delete(id);
    audit(id, `Deleted ${app.name || id} from this server`, 'warn'); log(`${app.name || id} is gone from DevX Control.`);
    return 0;
  };
}
