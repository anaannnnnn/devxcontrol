import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUtterance, ACTION_INTENTS } from '../lib/talk.js';

test('english and arabic keyword intents name the app, not the first word', () => {
  const en = parseUtterance('why was nexus slow last night', ['nexus', 'aquaos']);
  assert.equal(en.intent, 'status');
  assert.equal(en.app, 'nexus');
  assert.equal(en.lang, 'en');
  assert.equal(en.mode, 'keyword');
  const ar = parseUtterance('أي التطبيقات بلا نسخ احتياطي', ['nexus']);
  assert.equal(ar.intent, 'backups');
  assert.equal(ar.lang, 'ar');
  const act = parseUtterance('restart aquaos please', ['aquaos']);
  assert.equal(act.intent, 'restart');
  assert.equal(act.confirm, true);
  assert.ok(ACTION_INTENTS.has('restart'));
  const miss = parseUtterance('play some music', []);
  assert.equal(miss.intent, 'unknown');
  assert.match(miss.say, /keyword|لم أفهم/);
});
