// App registry + env-file access. Paths are always resolved under APPS_DIR (no traversal).
import fs from 'node:fs';
import path from 'node:path';

const SENSITIVE = /(KEY|SECRET|TOKEN|PASS|PIN|DATABASE|DSN|PRIVATE|CREDENTIAL)/i;

export function loadRegistry(file, appsDir, projectsFile = null) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const hydrate = (a) => {
    const h = {
      ...a, urls: a.urls || [], containers: a.containers || [],
      path: path.resolve(appsDir, a.dir),
      envPath: a.envFile ? path.resolve(appsDir, a.dir, a.envFile) : null,
    };
    h.urls = h.urls.map((u) => ({ ...u, probe: u.probe !== false, host: new URL(u.url).host }));
    if (!h.path.startsWith(path.resolve(appsDir) + path.sep)) throw new Error(`app ${a.id}: dir escapes APPS_DIR`);
    return h;
  };
  const apps = raw.apps.map(hydrate);
  let added = [];
  if (projectsFile) { try { added = JSON.parse(fs.readFileSync(projectsFile, 'utf8')); } catch { added = []; } }
  for (const p of added) { try { if (!apps.some((x) => x.id === p.id)) apps.push(hydrate({ ...p, onboarded: true })); } catch { /* skip bad entry */ } }
  const byId = new Map(apps.map((a) => [a.id, a]));
  const containerOwner = new Map();
  apps.forEach((a) => a.containers.forEach((c) => containerOwner.set(c, a.id)));
  const reg = { apps, byId, containerOwner, infra: raw.infra, serverIp: raw.serverIp };
  const persist = () => { if (!projectsFile) return; const tmp = `${projectsFile}.tmp`; fs.writeFileSync(tmp, JSON.stringify(reg.apps.filter((x) => x.onboarded).map(({ path: _p, envPath: _e, ...x }) => ({ ...x, urls: x.urls.map(({ label, url, path: up, probe }) => ({ label, url, path: up, probe })) })))); fs.renameSync(tmp, projectsFile); };
  reg.add = (a) => {
    if (byId.has(a.id)) throw new Error(`An app called ${a.id} already exists.`);
    const h = hydrate({ ...a, onboarded: true }); apps.push(h); byId.set(h.id, h); h.containers.forEach((c) => containerOwner.set(c, h.id)); persist(); return h;
  };
  reg.update = (id, patch) => { const a = byId.get(id); if (!a) return null; Object.assign(a, patch); if (patch.urls) a.urls = patch.urls.map((u) => ({ ...u, probe: u.probe !== false, host: new URL(u.url).host })); persist(); return a; };
  reg.portOf = (c) => { const a = apps.find((x) => x.containers.includes(c)); return a?.port; };
  reg.remove = (id) => { const i = apps.findIndex((x) => x.id === id && x.onboarded); if (i < 0) return false; const [a] = apps.splice(i, 1); byId.delete(id); a.containers.forEach((c) => containerOwner.delete(c)); persist(); return true; };
  return reg;
}

export function readEnv(file) {
  if (!file) return [];
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const out = [];
  for (const line of txt.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out.push({ key: m[1], value: m[2].replace(/^(['"])(.*)\1$/, '$2'), sensitive: SENSITIVE.test(m[1]) });
  }
  return out;
}

/** Set an existing KEY in an env file, keeping every other line. Returns false when the key is not there. */
export function writeEnv(file, key, value) {
  const lines = fs.readFileSync(file, 'utf8').split('\n'); let hit = false;
  const re = new RegExp(`^\\s*(export\\s+)?${key}\\s*=`);
  const out = lines.map((l) => { if (hit || !re.test(l)) return l; hit = true; return `${/^\s*export\s/.test(l) ? 'export ' : ''}${key}=${value}`; });
  if (!hit) return false;
  const tmp = `${file}.tmp`; fs.writeFileSync(tmp, out.join('\n'), { mode: fs.statSync(file).mode & 0o777 }); fs.renameSync(tmp, file);
  return true;
}

export const maskValue = (v) => (v ? '•'.repeat(Math.min(12, Math.max(6, v.length))) : '');
