import { test } from 'node:test'; import assert from 'node:assert/strict';
import { placeholderFor } from '../lib/envscan.js';
test('placeholders are boot-safe and never empty for vendor keys', () => {
  for (const k of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','OPENAI_API_KEY','SMTP_HOST','SMTP_PASS','S3_BUCKET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','ADMIN_EMAIL','TWILIO_AUTH_TOKEN','SOME_API_KEY'])
    assert.ok(placeholderFor(k, { id: 'shop', domain: 'shop.example.com' }), k);
  assert.equal(placeholderFor('ADMIN_EMAIL', { id: 'shop', domain: 'shop.example.com' }), 'admin@example.com');
  assert.equal(placeholderFor('S3_BUCKET', { id: 'shop' }), 'shop-uploads');
  assert.equal(placeholderFor('FEATURE_FLAG_X', {}), null);
});
