import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertMany, findBlock, upstreamOf } from '../lib/caddyfile.js';

test('upsertMany writes one block per address and replaces the app\'s old ones', () => {
  const start = 'other.example.com {\n\treverse_proxy other:80\n}\n\n# devx-control: shop\nshop.example.com {\n\treverse_proxy shop-api:4000\n}\n';
  const out = upsertMany(start, { id: 'shop', routes: [
    { host: 'shop.example.com', upstream: 'shop-web:80' }, { host: 'api-shop.example.com', upstream: 'shop-api:4000' }, { host: 'crm-shop.example.com', upstream: 'shop-crm:80' }] });
  assert.equal(upstreamOf(findBlock(out, 'shop.example.com').body), 'shop-web:80');
  assert.equal(upstreamOf(findBlock(out, 'api-shop.example.com').body), 'shop-api:4000');
  assert.equal(upstreamOf(findBlock(out, 'crm-shop.example.com').body), 'shop-crm:80');
  assert.equal(upstreamOf(findBlock(out, 'other.example.com').body), 'other:80');
});
