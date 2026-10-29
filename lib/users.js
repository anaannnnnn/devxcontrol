// User accounts: scrypt password hashes in data/users.json, optional per-user TOTP. Seeded once on first start.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { safeEqual, totpValid } from './auth.js';

const hash = (pw, salt = crypto.randomBytes(16)) => `s1$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 64).toString('base64')}`;
const check = (pw, stored) => {
  const [v, s, h] = String(stored || '').split('$');
  if (v !== 's1' || !s || !h) return false;
  const a = crypto.scryptSync(pw, Buffer.from(s, 'base64'), 64), b = Buffer.from(h, 'base64');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const DUMMY = hash('not-a-real-password');
export const MIN_PASSWORD = 10;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const newSecret = () => Array.from(crypto.randomBytes(20), (b) => B32[b % 32]).join('');

export function makeUsers({ dataDir, seedNames, seedPassword }) {
  const file = path.join(dataDir, 'users.json');
  let users = [];
  try { users = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { users = []; }
  const save = () => { const t = `${file}.tmp`; fs.writeFileSync(t, JSON.stringify(users), { mode: 0o600 }); fs.renameSync(t, file); };
  if (!users.length && seedPassword) {
    users = seedNames.map((name) => ({ name, hash: hash(seedPassword), totp: null, pending: null, role: 'admin', apps: [], access: 'operate', created: Date.now() }));
    save();
  }
  for (const u of users) { if (!u.role) { u.role = 'admin'; u.apps = []; u.access = 'operate'; } }
  const find = (name) => users.find((u) => u.name === String(name || '').trim().toLowerCase());
  return {
    count: () => users.length,
    names: () => users.map((u) => ({ name: u.name, twoFactor: !!u.totp })),
    get(name) { const u = find(name); return u ? { name: u.name, role: u.role, apps: u.apps || [], access: u.access || 'view', twoFactor: !!u.totp } : null; },
    list: () => users.map((u) => ({ name: u.name, role: u.role, apps: u.apps || [], access: u.access || 'view', twoFactor: !!u.totp, created: u.created || null })),
    create({ name, role = 'member', apps = [], access = 'view' }, validApps = null) {
      const n = String(name || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(n)) throw new Error('Username: 2 to 31 letters, numbers, dots, dashes or underscores.');
      if (find(n)) throw new Error('That username is taken.');
      if (!['admin', 'member'].includes(role)) throw new Error('Role must be admin or member.');
      const list = [...new Set((Array.isArray(apps) ? apps : []).map(String))].filter((a) => !validApps || validApps.has(a));
      if (role === 'member' && !list.length) throw new Error('Choose at least one project this person can see.');
      const password = crypto.randomBytes(12).toString('base64url');
      users.push({ name: n, hash: hash(password), totp: null, pending: null, role, apps: role === 'admin' ? [] : list, access: access === 'operate' ? 'operate' : 'view', created: Date.now() }); save();
      return { name: n, password };
    },
    update(name, { role, apps, access }, validApps = null) {
      const u = find(name); if (!u) throw new Error('No such user.');
      const nextRole = role ?? u.role; if (!['admin', 'member'].includes(nextRole)) throw new Error('Role must be admin or member.');
      if (u.role === 'admin' && nextRole !== 'admin' && users.filter((x) => x.role === 'admin').length < 2) throw new Error('There must be at least one admin.');
      const list = apps === undefined ? (u.apps || []) : [...new Set((Array.isArray(apps) ? apps : []).map(String))].filter((a) => !validApps || validApps.has(a));
      if (nextRole === 'member' && !list.length) throw new Error('Choose at least one project this person can see.');
      u.role = nextRole; u.apps = nextRole === 'admin' ? [] : list; if (access) u.access = access === 'operate' ? 'operate' : 'view'; save();
    },
    remove(name) {
      const u = find(name); if (!u) throw new Error('No such user.');
      if (u.role === 'admin' && users.filter((x) => x.role === 'admin').length < 2) throw new Error('There must be at least one admin.');
      users = users.filter((x) => x !== u); save();
    },
    resetPassword(name) { const u = find(name); if (!u) throw new Error('No such user.'); const password = crypto.randomBytes(12).toString('base64url'); u.hash = hash(password); save(); return { name: u.name, password }; },
    verify(name, password, code) {
      const u = find(name);
      const ok = check(String(password || ''), u ? u.hash : DUMMY) && !!u; // always run one scrypt, even for unknown users
      if (!ok) return { ok: false };
      if (u.totp && !totpValid(u.totp, code)) return { ok: false, needCode: true };
      return { ok: true, name: u.name };
    },
    needsCode: (name) => !!find(name)?.totp,
    info: (name) => { const u = find(name); return u ? { name: u.name, twoFactor: !!u.totp, role: u.role, access: u.access || 'view', apps: u.apps || [] } : null; },
    changePassword(name, current, next) {
      const u = find(name);
      if (!u || !check(current || '', u.hash)) return 'Current password is incorrect.';
      if (typeof next !== 'string' || next.length < MIN_PASSWORD) return `New password must be at least ${MIN_PASSWORD} characters.`;
      if (next.length > 200) return 'New password is too long.';
      u.hash = hash(next); save(); return null;
    },
    usesPassword(name, pw) { const u = find(name); return !!(u && pw && check(pw, u.hash)); },
    setPassword(name, next) { const u = find(name); if (!u) return false; u.hash = hash(next); save(); return true; },
    startTotp(name) { const u = find(name); u.pending = newSecret(); save(); return u.pending; },
    enableTotp(name, code) { const u = find(name); if (!u.pending || !totpValid(u.pending, code)) return false; u.totp = u.pending; u.pending = null; save(); return true; },
    disableTotp(name, password) { const u = find(name); if (!check(password || '', u.hash)) return false; u.totp = null; u.pending = null; save(); return true; },
  };
}
