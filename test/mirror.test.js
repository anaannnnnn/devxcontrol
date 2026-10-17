import test from 'node:test';
import assert from 'node:assert/strict';
import { robotsAllows, derivePublic, gapAgainst, checkUrl, UA } from '../lib/mirror.js';

test('robots.txt is respected and derived facts do not keep the page body', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /';
  assert.equal(robotsAllows(robots, '/private', UA), false);
  assert.equal(robotsAllows(robots, '/menu', UA), true);
  assert.equal(robotsAllows('', '/menu', UA), true);
  const html = '<html><head><title>Cafe</title><style>body{color:#112233}</style></head><body><h1>Welcome to our secret recipe text that must not be stored wholesale</h1><a href="/book">Book</a><form></form><p>Online booking and reviews</p></body></html>';
  const d = derivePublic(html, html.length);
  assert.equal(d.hasTitle, true);
  assert.ok(d.features.includes('booking'));
  assert.ok(d.features.includes('reviews'));
  assert.equal(JSON.stringify(d).includes('secret recipe'), false);
  const gap = gapAgainst(['menu'], d.features);
  assert.ok(gap.missing.includes('booking'));
  assert.throws(() => checkUrl('ftp://example.com'));
});
