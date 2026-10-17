// Authentication: scrypt-free constant-time password check, optional TOTP, signed stateless sessions,
// CSRF double-submit token, login throttling. No secrets are ever logged.
import crypto from 'node:crypto';
import { problem } from './problem.js';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
export const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

/* ------------------------------ TOTP (RFC 6238) ------------------------------ */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32decode(s) {
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '')) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('invalid base32');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
export function totp(secret, atMs = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(atMs / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}
export const totpValid = (secret, code) =>
  /^\d{6}$/.test(String(code || '')) && [-1, 0, 1].some((w) => safeEqual(totp(secret, Date.now() + w * 30000), code));

/* ------------------------------ sessions ------------------------------ */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function makeAuth({ secret, ttlMs = 12 * 3600e3 }) {
  const mac = (p) => crypto.createHmac('sha256', secret).update(p).digest('base64url');
  const issue = (user) => {
    const csrf = crypto.randomBytes(18).toString('base64url');
    const p = b64({ u: user, exp: Date.now() + ttlMs, csrf, n: crypto.randomBytes(6).toString('hex') });
    return { token: `${p}.${mac(p)}`, csrf };
  };
  const verify = (token) => {
    if (!token || !token.includes('.')) return null;
    const [p, sig] = token.split('.');
    if (!safeEqual(mac(p), sig)) return null;
    try {
      const j = JSON.parse(Buffer.from(p, 'base64url').toString());
      return j.exp > Date.now() ? j : null;
    } catch { return null; }
  };

  // throttle: 5 failures / 10 min per key (IP and username), then 429 with Retry-After
  const fails = new Map();
  const throttle = (ip) => {
    const now = Date.now();
    const arr = (fails.get(ip) || []).filter((t) => now - t < 600e3);
    fails.set(ip, arr);
    return arr.length >= 5 ? Math.ceil((600e3 - (now - arr[0])) / 1000) : 0;
  };
  const fail = (ip) => fails.set(ip, [...(fails.get(ip) || []), Date.now()]);
  const clear = (ip) => fails.delete(ip);

  const parseCookies = (h = '') => Object.fromEntries(h.split(';').map((c) => c.trim().split(/=(.*)/s).slice(0, 2)).filter(([k]) => k));

  const middleware = (req, res, next) => {
    const sess = verify(parseCookies(req.headers.cookie).dc_s);
    if (!sess) return problem(res, 401, 'unauthenticated', 'Sign in required', 'Your session is missing or expired.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !safeEqual(req.headers['x-csrf-token'] || '', sess.csrf))
      return problem(res, 403, 'csrf', 'Request blocked', 'Missing or invalid CSRF token. Reload the page and try again.');
    req.session = sess;
    next();
  };

  return {
    issue, verify, middleware, throttle, fail, clear, parseCookies,
  };
}
