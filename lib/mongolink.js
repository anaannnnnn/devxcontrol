// Moving an app from its own database to a MongoDB cluster, safely:
//   link -> (redeploy points the app at MongoDB) -> import the local data -> verify -> you confirm -> remove the local database.
// This file covers everything up to and including the checks. Nothing here deletes data.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './docker.js';
import * as mx from './mongox.js';

const DEMO = !!process.env.DEMO;

export function makeMongoLink({ settings, integrations, gitx, ops, audit }) {
  const baseUri = (id) => integrations.mongoUri(id);
  const uriFor = (b) => { const base = baseUri(b.clusterId); return base ? mx.buildUri(base, b.database) : null; };
  const envFileOf = (app) => app.envPath || path.join(app.path, '.env');
  const save = (app, b) => settings.setMongo(app.id, b);

  const publicBinding = (b) => (b ? {
    mode: b.mode, stage: b.stage, clusterId: b.clusterId, clusterName: b.clusterName, database: b.database, var: b.var,
    copy: !!b.copy, replace: !!b.replace, at: b.at, imported: b.imported ? { at: b.imported.at, ok: b.imported.ok, summary: b.imported.summary } : null,
    verified: b.verified || null, retired: b.retired || null, pr: b.pr || null,
  } : null);

  async function localInfo(app) {
    try { const info = await ops.dataInfo?.(app).catch(() => ({})); return await mx.describeLocal(app, { sqliteFiles: info?.files }); } catch { return null; }
  }

  /** Everything the UI needs for one app. */
  async function overview(app) {
    const b = settings.mongo(app.id);
    const detected = gitx.status(app)?.mongo || null;
    return { binding: publicBinding(b), detected, local: await localInfo(app), clusters: integrations.mongoList(), canSwitch: !!detected?.uses };
  }

  /** Link an app to a database. Writes the connection into the app's env and the compose override; a redeploy applies it. */
  async function link(app, { cluster, database, copy = true, replace = false, local = false }) {
    if (local) { settings.setMongo(app.id, { mode: 'local', stage: 'local', at: Date.now() }); await mx.clearOverride(app); audit(app.id, `${app.name} keeps its own database`, 'info'); return publicBinding(settings.mongo(app.id)); }
    const base = baseUri(cluster); if (!base) throw Object.assign(new Error('Pick one of your MongoDB clusters.'), { status: 400 });
    const uri = mx.buildUri(base, database);
    const ping = await mx.ping(uri); if (!ping.ok) throw Object.assign(new Error(ping.error || 'Could not connect with that cluster.'), { status: 400 });
    const det = gitx.status(app)?.mongo || await mx.detect(await gitx.reader(app));
    const switching = !!det?.uses;
    const b = { mode: switching ? 'external' : 'import-only', stage: 'linked', clusterId: cluster, clusterName: integrations.mongoName(cluster), database, var: det?.envVar || 'MONGO_URI', copy: !!copy, replace: !!replace, mongoServices: [], at: Date.now() };
    save(app, b);
    if (switching) await ensureConfig(app, () => {});
    audit(app.id, `${app.name} linked to MongoDB ${b.clusterName} / ${database}${switching ? '' : ' (data copy only: this app does not read MongoDB)'}`, 'warn');
    return publicBinding(settings.mongo(app.id));
  }

  /** Keep the app's env and compose override in step with its choice. Runs before every deploy, after the pull. */
  async function ensureConfig(app, log) {
    const b = settings.mongo(app.id);
    if (!b || b.mode === 'import-only') return;
    if (b.mode === 'local') { await mx.clearOverride(app); return; }
    if (b.mode !== 'external') return;
    const uri = uriFor(b);
    if (!uri) { log('The MongoDB cluster saved for this app was removed from Connections. Leaving the app as it is.'); return; }
    const how = mx.setEnvLine(envFileOf(app), b.var, uri);
    const ov = await mx.writeOverride(app, b.var);
    if (JSON.stringify(ov.mongoServices) !== JSON.stringify(b.mongoServices || [])) { b.mongoServices = ov.mongoServices; save(app, b); }
    log(`${b.var} ${how} to use MongoDB ${b.clusterName} / ${b.database}${ov.mongoServices.length ? `; the bundled ${ov.mongoServices.join(', ')} is switched off` : ''}.`);
  }

  /** After a deploy: bring the data over, then check everything. */
  async function afterDeploy(app, log) {
    const b = settings.mongo(app.id);
    if (!b || b.mode === 'local') return;
    if (b.stage === 'linked') {
      const uri = uriFor(b);
      if (!uri) return;
      if (b.copy) {
        log('Copying the local data into MongoDB ...');
        const info = await ops.dataInfo?.(app).catch(() => ({}));
        const r = await mx.importLocal(app, { uri, database: b.database, replace: b.replace, sqliteFiles: info?.files, mongoServices: b.mongoServices || [] }, log);
        b.imported = { at: Date.now(), ok: r.ok, summary: r.summary };
        b.stage = r.ok ? 'imported' : 'import-failed';
      } else b.stage = 'imported';
      save(app, b);
    }
    if (b.mode === 'external' && settings.mongo(app.id).stage === 'imported') await checkAndRecord(app, log);
  }

  async function checkAndRecord(app, log) {
    log('Checking that the app works from MongoDB ...');
    const v = await verify(app);
    v.checks.forEach((c) => log(`  ${c.ok ? 'OK  ' : 'FAIL'}  ${c.label}${c.detail ? `: ${c.detail}` : ''}`));
    const cur = settings.mongo(app.id);
    cur.verified = { at: Date.now(), ok: v.ok, checks: v.checks };
    cur.stage = v.ok ? 'verified' : 'verify-failed';
    save(app, cur);
    log(v.ok ? 'All checks passed. The local database can now be removed from the app page.' : 'Some checks failed, so the local database was left alone.');
    return v;
  }

  /* ---------------- checks ---------------- */
  async function containerEnv(name) {
    const r = await run('docker', ['inspect', '-f', '{{range .Config.Env}}{{println .}}{{end}}', name], { timeout: 15000 });
    return r.ok ? r.out.split('\n').filter(Boolean) : null;
  }
  const localNames = async (app, b) => {
    const set = new Set([app.db?.container].filter(Boolean));
    for (const s of b.mongoServices || []) {
      const r = await run('docker', ['ps', '-a', '--filter', `label=com.docker.compose.project.working_dir=${app.path}`, '--filter', `label=com.docker.compose.service=${s}`, '--format', '{{.Names}}'], { timeout: 15000 });
      r.out.split('\n').map((x) => x.trim()).filter(Boolean).forEach((n) => set.add(n));
    }
    return set;
  };

  async function verify(app) {
    const b = settings.mongo(app.id); const checks = [];
    const add = (id, label, ok, detail = '') => checks.push({ id, label, ok: !!ok, detail });
    if (DEMO) { add('data', 'Every table was copied in full', true, '2 collections match the source'); add('running', 'The app containers are running and healthy', true); return { ok: true, checks }; }
    const uri = b && uriFor(b);
    if (!uri) { add('cluster', 'The MongoDB cluster is saved in Connections', false); return { ok: false, checks }; }

    const ping = await mx.ping(uri); add('ping', 'MongoDB accepts the login and answers', ping.ok, ping.ok ? `${b.clusterName} / ${b.database}` : ping.error);

    const summary = b.imported?.summary || [];
    const names = summary.filter((s) => s.ok && s.name).map((s) => s.name);
    if (b.copy && b.imported && !b.imported.ok) add('data', 'Every table was copied in full', false, 'The import reported errors');
    else if (b.copy && names.length) {
      try {
        const src = await localInfo(app);
        const want = new Map((src?.tables || []).map((t) => [t.name, t.rows]));
        const bundledMongo = !src && (b.mongoServices || []).length > 0;
        if (bundledMongo) {
          const bad = []; let docs = 0;
          for (const s of summary) {
            if (!s.collections || !s.target) { bad.push(`${s.name} was not counted`); continue; }
            const cols = Object.keys(s.collections);
            const got = cols.length ? await mx.dataOp(uri, mx.cleanArgs('counts', { db: s.target, colls: cols })) : {};
            for (const n of cols) { docs += got[n] ?? 0; if ((got[n] ?? 0) < s.collections[n]) bad.push(`${s.target}.${n} has ${got[n] ?? 0} of ${s.collections[n]}`); }
          }
          add('data', 'Every table was copied in full', !bad.length, bad.length ? bad.join('; ') : `${docs} documents counted in MongoDB`);
        } else {
          const got = await mx.dataOp(uri, mx.cleanArgs('counts', { db: b.database, colls: names }));
          const bad = [];
          for (const s of summary) {
            if (!s.name || !s.ok) continue;
            const have = got[s.name]; const need = want.get(s.name) ?? s.imported;
            if (have == null) bad.push(`${s.name} missing`); else if (need != null && have < need) bad.push(`${s.name} has ${have} of ${need}`);
          }
          add('data', 'Every table was copied in full', !bad.length, bad.length ? bad.join('; ') : `${names.length} collection${names.length === 1 ? '' : 's'} match the source`);
        }
      } catch (e) { add('data', 'Every table was copied in full', false, e.message); }
    } else add('data', 'Data copy', true, b.copy ? 'nothing to copy' : 'skipped by choice');

    const keep = await localNames(app, b);
    const appContainers = app.containers.filter((c) => !keep.has(c));
    if (b.mode === 'external') {
      let pointed = null;
      for (const c of appContainers) { const env = await containerEnv(c); const line = env?.find((l) => l.startsWith(`${b.var}=`)); if (line) { pointed = { c, line }; break; } }
      const host = new URL(baseUri(b.clusterId)).host;
      add('wired', 'The app is configured with the chosen database', !!pointed && pointed.line.includes(host) && pointed.line.includes(`/${b.database}`), pointed ? pointed.c : `no running container has ${b.var}`);
    }
    const states = await Promise.all(appContainers.map(async (c) => { const r = await run('docker', ['inspect', '-f', '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}', c], { timeout: 15000 }); return { c, s: r.ok ? r.out.trim() : 'missing' }; }));
    const down = states.filter((x) => !/^running( healthy)?$/.test(x.s));
    add('running', 'The app containers are running and healthy', !down.length && states.length > 0, down.length ? down.map((x) => `${x.c}: ${x.s}`).join('; ') : `${states.length} container${states.length === 1 ? '' : 's'}`);
    const url = app.urls?.find((u) => u.path) || app.urls?.[0];
    if (url) {
      try { const r = await fetch(url.url.replace(/\/$/, '') + (url.path || ''), { signal: AbortSignal.timeout(10000), redirect: 'manual' }); add('http', 'The app answers on its web address', r.status < 500, `${url.host} replied ${r.status}`); }
      catch (e) { add('http', 'The app answers on its web address', false, String(e.message || e).slice(0, 80)); }
    }
    return { ok: checks.every((c) => c.ok), checks };
  }

  /** Run the import again on demand (for example after fixing an error), then check. */
  async function importAgain(app, log) {
    const b = settings.mongo(app.id); if (!b || b.mode === 'local') throw Object.assign(new Error('Link a MongoDB database first.'), { status: 409 });
    const uri = uriFor(b); if (!uri) throw Object.assign(new Error('The saved cluster is gone from Connections.'), { status: 409 });
    const info = await ops.dataInfo?.(app).catch(() => ({}));
    log(`Copying the local data into ${b.clusterName} / ${b.database} ...`);
    const r = await mx.importLocal(app, { uri, database: b.database, replace: b.replace, sqliteFiles: info?.files, mongoServices: b.mongoServices || [] }, log);
    const cur = settings.mongo(app.id); cur.imported = { at: Date.now(), ok: r.ok, summary: r.summary }; cur.stage = r.ok ? 'imported' : 'import-failed'; save(app, cur);
    if (r.ok && cur.mode === 'external') await checkAndRecord(app, log);
    return r.ok ? 0 : 1;
  }

  /**
   * After the pull request is merged: copy the latest data, point the app at MongoDB, deploy the new code, check it.
   * The old database stays untouched. If the deploy fails the app's old setting is put back.
   */
  async function switchToMongo(app, log) {
    const b = settings.mongo(app.id);
    if (!b || b.mode === 'local') throw Object.assign(new Error('Link a MongoDB database first.'), { status: 409 });
    log('Checking the newest code on GitHub ...');
    const st = await gitx.check(app).catch(() => null);
    const det = st?.mongo || await mx.detect(await gitx.reader(app));
    if (!det?.uses) throw Object.assign(new Error('The repository does not use MongoDB yet. Merge the pull request first, then try again.'), { status: 409 });
    const uri = uriFor(b); if (!uri) throw Object.assign(new Error('The saved cluster is gone from Connections.'), { status: 409 });
    const variable = det.envVar || b.var || 'MONGO_URI';
    const info = await ops.dataInfo?.(app).catch(() => ({}));
    log('Copying the latest data into MongoDB (replacing the earlier copy) while the current version keeps serving ...');
    const r = await mx.importLocal(app, { uri, database: b.database, replace: true, sqliteFiles: info?.files, mongoServices: b.mongoServices || [] }, log);
    if (!r.ok) { const cur = settings.mongo(app.id); cur.imported = { at: Date.now(), ok: false, summary: r.summary }; cur.stage = 'import-failed'; save(app, cur); throw new Error('The data copy had errors, so nothing was switched.'); }
    // remember what the app used before, so a failed deploy can put it back
    const envFile = envFileOf(app); let before = null;
    try { before = new RegExp(`^\\s*(?:export\\s+)?${variable}\\s*=(.*)$`, 'm').exec(fs.readFileSync(envFile, 'utf8'))?.[1] ?? null; } catch { /* no env file */ }
    const cur = settings.mongo(app.id);
    Object.assign(cur, { mode: 'external', var: variable, stage: 'imported', copy: true, imported: { at: Date.now(), ok: true, summary: r.summary }, switchedAt: Date.now() });
    save(app, cur);
    audit(app.id, `Switching ${app.name} to MongoDB ${b.clusterName} / ${b.database}`, 'warn');
    log('Pointing the app at MongoDB and deploying the new code ...');
    let code = 1;
    try { code = await ops.redeploy(app, log); } catch (e) { log(`Deploy error: ${e.message}`); }
    if (code !== 0) {
      const back = settings.mongo(app.id); back.mode = 'import-only'; back.stage = 'imported'; save(app, back);
      if (before != null) { try { mx.setEnvLine(envFile, variable, before.trim()); } catch { /* leave it */ } }
      await mx.clearOverride(app);
      log('The deploy failed, so the app keeps its earlier database setting. Nothing was removed.');
      return code;
    }
    return 0;
  }

  return { overview, link, ensureConfig, afterDeploy, verify, checkAndRecord, importAgain, switchToMongo, unlink: async (app) => { settings.clearMongo(app.id); await mx.clearOverride(app); } };
}
