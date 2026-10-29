// Orbit facade: per-app switches (default off), persisted facts, and approve-first handoff to Autopilot.
import fs from 'node:fs';
import path from 'node:path';
import { ORBIT_FEATURES } from './settings.js';
import { readAndAnalyse, normaliseCss } from './designdebt.js';
import { scanDna, TYPE_HINTS } from './dna.js';
import { maskRows, verdict, rollbackDecision, STEPS } from './proving.js';
import { scriptedAudit, PERSONAS, STEP_CAP, TIME_CAP_MS } from './ghosts.js';
import { buildDirections, brandFromColors, DIRECTIONS } from './universes.js';
import { aggregate, revenueAtRisk, dynamoNote, selectAll, assertMapping } from './revenue.js';
import { checkUrl, robotsAllows, derivePublic, gapAgainst, UA } from './mirror.js';
import { stripSecrets, signatureOf, similarFixes, tasteRank, bumpTaste } from './brain.js';
import { pickGift, weekKey } from './gift.js';
import { parseUtterance, READ_INTENTS, ACTION_INTENTS } from './talk.js';
import { shapeSky } from './orbitview.js';
import { DEMO_PAGE } from './preview.js';

const off = (key) => Object.assign(new Error(`Turn on ${key} for this app under Automation. It is off until you switch it on.`), { status: 409 });

function load(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function makeOrbit({ registry, settings, monitor, dbx, autopilot, llm, releases, ops, audit = () => {}, dataDir, fetchImpl = fetch, demo = false }) {
  const file = path.join(dataDir, 'orbit.json');
  let S = load(file, { dna: {}, debt: {}, proving: {}, ghosts: {}, universes: {}, revenue: {}, mirror: {}, brain: { patterns: [], taste: { up: {}, down: {} } }, gifts: {}, undo: {}, confirms: [] });
  S.brain ||= { patterns: [], taste: { up: {}, down: {} } };
  S.brain.patterns ||= []; S.brain.taste ||= { up: {}, down: {} };
  const save = () => { try { const t = `${file}.tmp`; fs.writeFileSync(t, JSON.stringify(S)); fs.renameSync(t, file); } catch (e) { console.error('orbit save failed:', e.message); } };
  const gate = (app, key) => { if (!ORBIT_FEATURES.includes(key) || !settings.orbit(app.id)[key]) throw off(key); };
  const appOf = (id) => { const a = registry.byId.get(id); if (!a) throw Object.assign(new Error('App does not exist.'), { status: 404 }); return a; };

  function readTree(app) {
    const files = []; let readme = '';
    if (!app.path || !fs.existsSync(app.path)) return { files, readme, missing: true };
    const walk = (rel, depth) => {
      if (depth > 5 || files.length > 400) return;
      let ents = [];
      try { ents = fs.readdirSync(path.join(app.path, rel), { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (/^(node_modules|\.git|dist|build|vendor)$/.test(e.name)) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(r, depth + 1); else files.push(r);
      }
    };
    walk('', 0);
    try { readme = fs.readFileSync(path.join(app.path, 'README.md'), 'utf8').slice(0, 20000); } catch { /* none */ }
    return { files, readme, missing: false };
  }

  async function tableNames(app) {
    if (!['postgres', 'sqlite'].includes(app.db?.type)) return { tables: [], note: app.db?.type === 'dynamo' ? 'DynamoDB schema names are not read from here.' : 'This app has no Postgres or SQLite database in the registry.' };
    try {
      const o = await dbx.overview(app);
      audit('orbit', app.id, `Read table names for ${app.name}`, 'info');
      return { tables: (o.tables || []).map((t) => t.name), note: null };
    } catch (e) {
      return { tables: [], note: `not measured: could not read schema names (${e.message}).` };
    }
  }

  async function debtScan(app) {
    gate(app, 'debt');
    const report = readAndAnalyse(app.path);
    S.debt[app.id] = { at: Date.now(), report }; save();
    return S.debt[app.id];
  }
  async function debtAdopt(app) {
    gate(app, 'debt');
    const report = S.debt[app.id]?.report || readAndAnalyse(app.path);
    const norm = normaliseCss(report);
    if (!norm.ok) throw Object.assign(new Error(norm.reason), { status: 409 });
    const det = { assets: [{ name: 'devx-debt.css', content: norm.css }], explain: norm.explain, report: { title: 'Normalise design debt', summary: norm.explain, cause: 'Colours, spacing or focus styles drifted.', frontend: ['Stray colours move toward the nearest token. Buttons get a 44px target and a focus ring.'], backend: ['No change.'], risk: 'low' } };
    const flags = settings.orbit(app.id);
    if (flags.autoApply.includes('debt') && app.path && fs.existsSync(app.path)) {
      const { applyDet } = await import('./detpatch.js');
      const undo = { at: Date.now(), files: [] };
      try {
        const changed = applyDet(app.path, det);
        undo.files = changed;
        S.undo[app.id] = undo; save();
        audit('orbit', app.id, `Auto-applied design-debt CSS on ${app.name} (whitelisted)`, 'warn');
        return { applied: 'whitelist', undo: true, explain: norm.explain };
      } catch (e) {
        return { applied: false, reason: e.message, report: det.report };
      }
    }
    if (demo || !app.repo) return { applied: false, reason: demo ? 'Demo mode does not open a change report.' : 'This app has no GitHub repo, so the CSS was not queued. Copy it from the scan.', css: norm.css, explain: norm.explain };
    const run = await autopilot.task(app.id, 'Normalise design debt', norm.explain, '', det);
    audit('orbit', app.id, `Design debt for ${app.name} sent to review`, 'info');
    return { applied: 'review', run: run?.id || null, explain: norm.explain };
  }
  function debtUndo(app) {
    gate(app, 'debt');
    const u = S.undo[app.id];
    if (!u?.files?.length) throw Object.assign(new Error('Nothing to undo. Auto-apply has not written files for this app.'), { status: 404 });
    for (const f of u.files) {
      if (!/^[A-Za-z0-9_./-]+$/.test(f) || f.includes('..')) continue;
      const p = path.join(app.path, f);
      if (f.endsWith('devx-debt.css') && fs.existsSync(p)) fs.unlinkSync(p);
    }
    delete S.undo[app.id]; save();
    audit('orbit', app.id, `Undid design-debt auto-apply on ${app.name}`, 'warn');
    return { ok: true };
  }

  async function dnaScan(app) {
    gate(app, 'dna');
    const tree = readTree(app);
    const tables = await tableNames(app);
    const pageText = demo ? 'Demo mode does not fetch the live site.' : '';
    const correction = S.dna[app.id]?.correction || null;
    const result = scanDna({ readme: tree.readme, files: tree.files, pageText, tables: tables.tables }, correction);
    if (tree.missing) result.directory = 'not measured: the app directory is not on this machine.';
    if (tables.note) result.schemaNote = tables.note;
    if (!pageText) result.pageNote = demo ? 'Live page text was not fetched in demo mode.' : 'Live page text was not fetched for this scan. Classification uses README, files and table names only.';
    S.dna[app.id] = { ...(S.dna[app.id] || {}), at: Date.now(), result }; save();
    return S.dna[app.id];
  }
  function dnaCorrect(app, type) {
    gate(app, 'dna');
    if (type !== 'unknown' && !TYPE_HINTS.some((t) => t.id === type)) throw Object.assign(new Error('Unknown business type.'), { status: 400 });
    S.dna[app.id] ||= {};
    S.dna[app.id].correction = type === 'unknown' ? null : type;
    save();
    return dnaScan(app);
  }
  async function dnaDraft(app, featureId) {
    gate(app, 'dna');
    const feat = S.dna[app.id]?.result?.gaps?.features?.find((f) => f.id === featureId);
    if (!feat || feat.state === 'present') throw Object.assign(new Error('That gap is not open.'), { status: 404 });
    if (demo || !app.repo) return { queued: false, reason: 'Not queued: demo mode or no GitHub repo. Nothing was written.' };
    const run = await autopilot.task(app.id, `Draft ${feat.label}`, feat.benefit, `Add the smallest version of "${feat.label}" for a ${S.dna[app.id]?.result?.classification?.label || 'business'} app. Do not touch auth or payments.`);
    audit('orbit', app.id, `Gap "${feat.label}" sent to Autopilot`, 'info');
    return { queued: true, run: run?.id || null };
  }

  async function provingStart(app, paths = ['/']) {
    gate(app, 'proving');
    const flags = settings.orbit(app.id);
    const run = { id: `pg-${Date.now().toString(36)}`, app: app.id, step: 'prepare', at: Date.now(), steps: [{ step: 'prepare', at: Date.now(), note: 'Recorded. No container has been started yet.' }], paths: paths.slice(0, 20), verdict: null };
    let dockerOk = false;
    if (!demo) {
      const d = await runDockerInfo();
      dockerOk = d.ok;
    }
    if (!dockerOk) {
      run.step = 'stopped';
      run.steps.push({ step: 'shadow', at: Date.now(), note: demo ? 'not measured: demo mode has no shadow container.' : 'not measured: no Docker daemon answered, so a shadow container was not started.' });
      run.verdict = { measured: false, reason: run.steps.at(-1).note };
    } else {
      run.step = 'awaiting-approval';
      run.steps.push({ step: 'shadow', at: Date.now(), note: 'Docker answered, but Orbit does not build a second production container until you approve a change report. Replay numbers stay empty until that exists.' });
      run.verdict = verdict([]);
    }
    S.proving[app.id] = run; save();
    audit('orbit', app.id, `Proving Ground run ${run.id} for ${app.name}: ${run.step}`, 'info');
    return { ...run, thresholds: { errorRatePct: flags.rollbackErrorPct, p95ExtraMs: flags.rollbackP95Ms, watchMin: flags.watchMin, minSamples: flags.minSamples }, stepsKnown: STEPS };
  }
  function provingGet(app) { return S.proving[app.id] || null; }
  function provingReplay(app, pairs) {
    gate(app, 'proving');
    const run = S.proving[app.id];
    if (!run) throw Object.assign(new Error('Start a proving run first.'), { status: 404 });
    run.verdict = verdict(pairs);
    run.step = 'verdict';
    run.steps.push({ step: 'verdict', at: Date.now(), note: run.verdict.measured ? `${run.verdict.samples} paired responses.` : run.verdict.reason });
    save();
    return run;
  }
  function provingWatch(app, before, after) {
    gate(app, 'proving');
    const flags = settings.orbit(app.id);
    const decision = rollbackDecision({ before, after, minSamples: flags.minSamples, errorRatePct: flags.rollbackErrorPct, p95ExtraMs: flags.rollbackP95Ms });
    const run = S.proving[app.id] || { id: 'adhoc', app: app.id, steps: [] };
    run.decision = decision;
    run.step = decision.action === 'rollback' ? 'rolled-back' : decision.measured ? 'promoted' : 'watching';
    run.steps.push({ step: run.step, at: Date.now(), note: decision.reason || decision.why });
    if (decision.action === 'rollback') {
      run.steps.push({ step: 'rolled-back', at: Date.now(), note: 'Automatic rollback was requested by the threshold. Orbit did not change the running image from this process; approve a revert in Reviews or redeploy the previous build yourself. Nothing was pushed.' });
    }
    S.proving[app.id] = run; save();
    audit('orbit', app.id, `Proving watch: ${decision.action}`, decision.action === 'rollback' ? 'warn' : 'info');
    return run;
  }

  async function ghostRun(app, personaId) {
    gate(app, 'ghosts');
    const persona = PERSONAS.find((p) => p.id === personaId) || PERSONAS[0];
    let html = ''; let source = '';
    if (demo) { html = DEMO_PAGE; source = 'Built-in demo page. The live app was not opened.'; }
    else {
      const up = app.urls?.[0]?.url;
      if (!up) return { measured: false, reason: 'not measured: this app has no URL in the registry.', persona };
      try {
        const r = await fetchImpl(up, { headers: { 'user-agent': 'DevX-Control-Ghost/1.0' }, signal: AbortSignal.timeout(TIME_CAP_MS), redirect: 'follow' });
        html = (await r.text()).slice(0, 400000);
        source = `Fetched ${up} (status ${r.status}). Not a full browser session.`;
      } catch (e) {
        return { measured: false, reason: `not measured: could not fetch the app URL (${e.message}).`, persona };
      }
    }
    const auditHtml = scriptedAudit(html, persona.id);
    let ai = null;
    if (llm?.configured?.()) {
      try {
        ai = await llm.json([{ role: 'system', content: 'Rank friction. JSON only: {"summary": string, "fixes": [{"title": string, "why": string}]} . Use only the findings given.' }, { role: 'user', content: JSON.stringify(auditHtml.findings).slice(0, 4000) }], { maxTokens: 400 });
      } catch { ai = null; }
    }
    const report = { ...auditHtml, source, steps: Math.min(STEP_CAP, auditHtml.findings.length + 1), ai: ai || null, aiNote: ai ? null : 'No AI model connected. Ranked list is the scripted findings only.', at: Date.now() };
    S.ghosts[app.id] = report; save();
    return report;
  }
  async function ghostApply(app, findingId) {
    gate(app, 'ghosts');
    const f = S.ghosts[app.id]?.findings?.find((x) => x.id === findingId);
    if (!f) throw Object.assign(new Error('That finding is not in the latest ghost report.'), { status: 404 });
    if (demo || !app.repo) return { queued: false, reason: 'Not queued. Demo mode and apps without a repo do not open a change report.' };
    const run = await autopilot.task(app.id, `Fix visitor friction: ${f.title}`, f.detail, 'Smallest HTML or CSS change that addresses this finding. Do not change data or payments.');
    return { queued: true, run: run?.id || null };
  }

  function universeBuild(app, { keepBrand = true } = {}) {
    gate(app, 'universes');
    const debt = S.debt[app.id]?.report;
    const brand = keepBrand ? brandFromColors(debt?.tokens || []) : null;
    const directions = buildDirections({ keepBrand, brand });
    if (llm?.configured?.()) {
      for (const d of directions) d.copyReason = 'A model is connected, but copy is still not invented here. Ask Autopilot when you adopt a direction.';
    }
    S.universes[app.id] = { at: Date.now(), keepBrand: !!keepBrand, brand: brand || null, directions: directions.map(({ css, ...rest }) => rest), css: Object.fromEntries(directions.map((d) => [d.id, d.css])) };
    save();
    return { ...S.universes[app.id], directions };
  }
  function universeCss(appId, id) {
    const css = S.universes[appId]?.css?.[id];
    if (!css || !DIRECTIONS.some((d) => d.id === id)) return null;
    return css;
  }
  async function universeAdopt(app, id) {
    gate(app, 'universes');
    const css = universeCss(app.id, id);
    if (!css) throw Object.assign(new Error('Build universes first, then pick one of the three directions.'), { status: 404 });
    const name = DIRECTIONS.find((d) => d.id === id).name;
    const det = { assets: [{ name: 'devx-universe.css', content: css }], explain: `Preview layer for the ${name} direction.`, report: { title: `Adopt the ${name} direction`, summary: `A contrast-checked stylesheet for the ${name} direction. No copy was rewritten.`, cause: 'You chose a design direction in Parallel Universes.', frontend: ['Colours, type and buttons follow the preview layer.'], backend: ['No change.'], risk: 'low' } };
    if (demo || !app.repo) return { queued: false, reason: 'Not queued: no change report in demo mode or without a repo.', css };
    const run = await autopilot.task(app.id, `Adopt the ${name} design direction`, det.explain, '', det);
    audit('orbit', app.id, `Universe ${id} sent to review for ${app.name}`, 'info');
    return { queued: true, run: run?.id || null };
  }

  function revenueSet(app, map) {
    gate(app, 'revenue');
    if (app.db?.type === 'dynamo') throw Object.assign(new Error(dynamoNote().reason), { status: 409 });
    if (!['postgres', 'sqlite'].includes(app.db?.type)) throw Object.assign(new Error('Revenue Pulse needs a Postgres or SQLite app.'), { status: 409 });
    const m = assertMapping(map);
    S.revenue[app.id] = { ...(S.revenue[app.id] || {}), map: m }; save();
    audit('orbit', app.id, `Revenue mapping saved for ${app.name} (${m.table})`, 'info');
    return S.revenue[app.id].map;
  }
  async function revenueCompute(app) {
    gate(app, 'revenue');
    if (app.db?.type === 'dynamo') return dynamoNote();
    const map = S.revenue[app.id]?.map;
    if (!map) return { measured: false, reason: 'not measured: map a table and the amount and time columns first.' };
    let rows = [];
    try {
      const q = await dbx.query(app, selectAll(map.table), false);
      rows = q.rows || [];
      audit('orbit', app.id, `Read-only revenue sample from ${map.table} (${rows.length} rows) on ${app.name}`, 'info');
    } catch (e) {
      return { measured: false, reason: `not measured: the read failed (${e.message}).`, map };
    }
    const agg = aggregate(rows, map);
    const incidents = (monitor.events || []).filter((e) => e.app === app.id && (e.level === 'bad' || e.level === 'warn')).slice(-20);
    const overlays = incidents.map((e) => ({ t: e.t, msg: e.msg, level: e.level, atRisk: revenueAtRisk(agg.hours, e.t) }));
    const out = { ...agg, overlays, at: Date.now() };
    S.revenue[app.id] = { map, last: { measured: out.measured, reason: out.reason, used: out.used, at: out.at } }; save();
    return out;
  }

  function mirrorSet(app, urls) {
    gate(app, 'mirror');
    const list = (Array.isArray(urls) ? urls : []).slice(0, 5).map((u) => checkUrl(u).toString());
    S.mirror[app.id] = { ...(S.mirror[app.id] || {}), urls: list }; save();
    return list;
  }
  async function mirrorFetch(app) {
    gate(app, 'mirror');
    const urls = S.mirror[app.id]?.urls || [];
    if (!urls.length) return { measured: false, reason: 'Add up to 5 public competitor URLs first.' };
    if (demo) return { measured: false, reason: 'not measured: demo mode does not fetch public sites.', urls };
    const last = S.mirror[app.id].fetchedAt || 0;
    if (Date.now() - last < 60_000) throw Object.assign(new Error('Wait a minute between competitor fetches.'), { status: 429 });
    const facts = [];
    for (const url of urls) {
      const u = new URL(url);
      let robots = '';
      try {
        const rr = await fetchImpl(new URL('/robots.txt', u.origin), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
        robots = rr.ok ? await rr.text() : '';
      } catch { robots = ''; }
      if (!robotsAllows(robots, u.pathname || '/', UA)) { facts.push({ url, fetchedAt: Date.now(), measured: false, reason: 'robots.txt disallows this path for our user-agent. Nothing was downloaded.' }); continue; }
      try {
        const r = await fetchImpl(u, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(12000), redirect: 'follow' });
        const buf = await r.arrayBuffer();
        const html = Buffer.from(buf).slice(0, 350000).toString('utf8');
        facts.push({ url, fetchedAt: Date.now(), status: r.status, measured: r.ok, reason: r.ok ? null : `The site answered ${r.status}.`, derived: derivePublic(html, buf.byteLength) });
      } catch (e) {
        facts.push({ url, fetchedAt: Date.now(), measured: false, reason: `not measured: ${e.message}` });
      }
    }
    const mine = new Set();
    for (const f of S.dna[app.id]?.result?.gaps?.features || []) if (f.state !== 'missing') mine.add(f.label.toLowerCase());
    const theirWords = [...new Set(facts.flatMap((f) => f.derived?.features || []))];
    const gaps = gapAgainst([...mine], theirWords);
    S.mirror[app.id] = { urls, fetchedAt: Date.now(), facts, gaps }; save();
    audit('orbit', app.id, `Competitor mirror fetched ${facts.length} URL(s) for ${app.name}`, 'info');
    return S.mirror[app.id];
  }

  function brainRemember(review) {
    if (!review?.app) return null;
    if (!settings.orbit(review.app).brain) return null;
    const pattern = {
      id: `p-${Date.now().toString(36)}`, app: review.app, at: Date.now(),
      signature: signatureOf({ title: review.title, rule: review.finding || '', file: review.files?.[0]?.path || '' }),
      summary: stripSecrets(review.summary || review.title),
      files: (review.files || []).map((f) => f.path).slice(0, 8),
    };
    S.brain.patterns.unshift(pattern);
    if (S.brain.patterns.length > 200) S.brain.patterns.length = 200;
    save();
    return pattern;
  }
  function brainTaste(area, approved) {
    S.brain.taste = bumpTaste(S.brain.taste, area, approved); save(); return S.brain.taste;
  }
  function brainMatch(text) { return similarFixes(S.brain.patterns, text); }
  function brainExport() { return { patterns: S.brain.patterns, taste: S.brain.taste }; }
  function brainDelete() { S.brain = { patterns: [], taste: { up: {}, down: {} } }; save(); return { ok: true }; }

  async function giftPrepare(app) {
    gate(app, 'gift');
    const week = weekKey();
    const prev = S.gifts[app.id]?.week;
    const flags = settings.orbit(app.id);
    const candidates = [];
    for (const c of S.debt[app.id]?.report?.causes || []) candidates.push({ id: `debt:${c.id}`, title: c.label, impact: 'Med', area: 'design', detail: c.detail });
    for (const f of S.dna[app.id]?.result?.gaps?.features || []) if (f.state === 'missing') candidates.push({ id: `gap:${f.id}`, title: f.label, impact: 'Med', area: f.id, detail: f.benefit });
    for (const f of S.ghosts[app.id]?.findings || []) candidates.push({ id: `ghost:${f.id}`, title: f.title, impact: f.severity === 'high' ? 'High' : 'Med', area: 'a11y', detail: f.detail });
    const ranked = tasteRank(candidates, S.brain.taste);
    const picked = pickGift(ranked, { week, previousWeek: prev, flags });
    if (!picked.ok) return { ...picked, week };
    const card = { week, state: 'pending', item: picked.item, skipped: picked.skipped, at: Date.now(), run: null, proving: S.proving[app.id]?.verdict || { measured: false, reason: 'Proving Ground has no measured verdict yet.' } };
    if (!demo && app.repo) {
      try { const run = await autopilot.task(app.id, `Weekly gift: ${picked.item.title}`, picked.item.detail || 'Small upgrade.', 'One small change. Do not touch auth, payments or schema unless the task says so.'); card.run = run?.id || null; }
      catch (e) { card.queueNote = e.message; }
    } else card.queueNote = 'Not sent to Autopilot (demo mode or no repo). The card is a recommendation only.';
    S.gifts[app.id] = card; save();
    audit('orbit', app.id, `Weekly gift prepared for ${app.name}: ${picked.item.title}`, 'info');
    return card;
  }
  function giftDecide(app, decision) {
    gate(app, 'gift');
    const g = S.gifts[app.id];
    if (!g || g.state !== 'pending') throw Object.assign(new Error('No gift is waiting.'), { status: 404 });
    if (!['approved', 'rejected', 'snoozed'].includes(decision)) throw Object.assign(new Error('Decision must be approved, rejected or snoozed.'), { status: 400 });
    g.state = decision; g.decidedAt = Date.now();
    if (decision !== 'snoozed') brainTaste(g.item.area || g.item.id, decision === 'approved');
    if (decision === 'snoozed') g.week = null;
    save();
    return g;
  }

  const confirms = new Map();
  function talk(text, knownApps) {
    const parsed = parseUtterance(text, [...knownApps.keys()]);
    if (!parsed.ok) throw Object.assign(new Error(parsed.reason), { status: 400 });
    const app = parsed.app && knownApps.has(parsed.app) ? knownApps.get(parsed.app) : null;
    if (parsed.intent !== 'unknown' && parsed.intent !== 'reviews' && parsed.intent !== 'changed' && !app && parsed.app) {
      return { ...parsed, answer: { measured: false, reason: `No app called ${parsed.app} that you can see.` } };
    }
    if (ACTION_INTENTS.has(parsed.intent)) {
      if (!app) return { ...parsed, answer: { measured: false, reason: 'Name the app. Example: restart nexus.' } };
      if (!settings.orbit(app.id).talk) throw off('talk');
      const id = `c-${Date.now().toString(36)}`;
      const card = { id, intent: parsed.intent, app: app.id, text: parsed.text, exp: Date.now() + 5 * 60e3 };
      confirms.set(id, card);
      return { ...parsed, confirmation: { id, needsTap: true, label: parsed.intent === 'restart' ? `Restart ${app.name}` : `Draft a task on ${app.name}`, detail: 'Nothing runs until you confirm this card.' } };
    }
    if (!READ_INTENTS.has(parsed.intent)) return { ...parsed, mode: parsed.mode, answer: { text: parsed.say } };
    if (app && !settings.orbit(app.id).talk) throw off('talk');
    return { ...parsed, answer: answerRead(parsed.intent, app) };
  }
  function answerRead(intent, app) {
    if (intent === 'status') {
      if (!app) return { measured: false, reason: 'Name an app. Example: why was nexus slow.' };
      const v = monitor.appView(app);
      return { source: 'monitor.appView', measured: true, status: v.status, ms: v.ms, cpu: v.cpu, mem: v.mem, note: v.ms == null ? 'Response time is not measured yet.' : null };
    }
    if (intent === 'backups') {
      return { source: 'caller must attach backup list', measured: false, reason: 'Use the backups tool result from the server route.' };
    }
    if (intent === 'reviews') return { source: 'autopilot', pending: autopilot.pendingCount(null) };
    if (intent === 'changed') {
      const since = Date.now() - 7 * 86400e3;
      const ev = (monitor.events || []).filter((e) => e.t >= since && (!app || e.app === app.id)).slice(-30);
      return { source: 'monitor.events', measured: ev.length > 0, reason: ev.length ? null : 'not measured: no events in the last 7 days.', events: ev.map((e) => ({ t: e.t, msg: e.msg, level: e.level, app: e.app })) };
    }
    if (intent === 'updates') {
      return { source: 'not in this helper', measured: false, reason: 'Server route fills GitHub behind-count.' };
    }
    if (intent === 'revenue') {
      if (!app) return { measured: false, reason: 'Name the app.' };
      const last = S.revenue[app.id]?.last;
      return last ? { source: 'revenue.last', ...last } : { measured: false, reason: 'Revenue Pulse has not been run for this app.' };
    }
    return { measured: false, reason: 'No tool for that.' };
  }
  async function talkConfirm(id, actor) {
    const card = confirms.get(id);
    if (!card || card.exp < Date.now()) throw Object.assign(new Error('That confirmation expired. Ask again.'), { status: 404 });
    confirms.delete(id);
    const app = appOf(card.app);
    if (!settings.orbit(app.id).talk) throw off('talk');
    if (card.intent === 'restart') {
      audit('orbit', app.id, `${actor} confirmed restart of ${app.name} from Talk`, 'warn');
      return { confirmed: true, intent: 'restart', app: app.id };
    }
    if (card.intent === 'draft') {
      if (demo || !app.repo) return { confirmed: true, queued: false, reason: 'Confirmed, but nothing was queued (demo or no repo).' };
      const run = await autopilot.task(app.id, card.text, 'Requested from Talk to Control.', 'Draft only.');
      return { confirmed: true, queued: true, run: run?.id || null };
    }
    return { confirmed: false };
  }

  function sky(apps, extras) { return shapeSky(apps, extras); }
  function flagsFor(app) { return settings.orbit(app.id); }

  return {
    gate, debtScan, debtAdopt, debtUndo, debtGet: (id) => S.debt[id] || null,
    dnaScan, dnaCorrect, dnaDraft, dnaGet: (id) => S.dna[id] || null,
    provingStart, provingGet, provingReplay, provingWatch, maskRows,
    ghostRun, ghostApply, ghostGet: (id) => S.ghosts[id] || null, personas: PERSONAS,
    universeBuild, universeCss, universeAdopt, universeGet: (id) => S.universes[id] ? { ...S.universes[id], css: undefined } : null,
    revenueSet, revenueCompute, revenueGet: (id) => S.revenue[id]?.map || null,
    mirrorSet, mirrorFetch, mirrorGet: (id) => S.mirror[id] || null,
    brainRemember, brainTaste, brainMatch, brainExport, brainDelete, brainList: () => S.brain.patterns,
    giftPrepare, giftDecide, giftGet: (id) => S.gifts[id] || null,
    talk, talkConfirm, parseUtterance,
    sky, flagsFor, state: () => S,
  };
}

async function runDockerInfo() {
  try {
    const { run } = await import('./docker.js');
    return await run('docker', ['info'], { timeout: 4000 });
  } catch (e) { return { ok: false, err: e.message }; }
}
