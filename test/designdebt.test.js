import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyseAssets, normaliseCss, readAndAnalyse } from '../lib/designdebt.js';
import { makeSettings } from '../lib/settings.js';
import { makeOrbit } from '../lib/orbit.js';

test('design debt names real causes and refuses to invent a score without files', () => {
  const empty = analyseAssets([]);
  assert.equal(empty.measured, false);
  assert.match(empty.reason, /not measured/);
  const report = analyseAssets([
    { path: 'a.css', text: '.a{color:#777777;background:#888888} button{font-size:10px;min-height:20px;background:#ffffff;border-radius:4px;padding:2px} button.b{background:#000000;border-radius:20px;padding:8px} button.c{background:#111111;border-radius:2px;padding:12px} button.d{background:#eeeeee;border-radius:8px;padding:16px} *{outline:none}' },
  ]);
  assert.equal(report.measured, true);
  assert.ok(report.score < 100);
  const ids = report.causes.map((c) => c.id);
  assert.ok(ids.includes('low-contrast'));
  assert.ok(ids.includes('tap-target'));
  assert.ok(ids.includes('missing-focus'));
  const css = normaliseCss(report);
  assert.equal(css.ok, true);
  assert.match(css.css, /--dx-0/);
  assert.match(css.css, /focus-visible/);
});

test('missing directory is not measured, and the switch defaults off', async () => {
  assert.equal(readAndAnalyse('/no/such/devx/app').measured, false);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debt-'));
  const settings = makeSettings(dataDir);
  assert.equal(settings.orbit('nexus').debt, false);
  const app = { id: 'nexus', name: 'Nexus', path: dataDir, db: null, repo: null };
  const orbit = makeOrbit({ registry: { byId: new Map([['nexus', app]]) }, settings, monitor: { events: [] }, dbx: {}, autopilot: {}, llm: { configured: () => false }, releases: {}, ops: {}, dataDir, demo: true });
  await assert.rejects(() => orbit.debtScan(app), /Turn on debt/);
});
