// Persisted settings. Auto-pull and every Orbit feature default to off.
import fs from 'node:fs';
import path from 'node:path';

export const ORBIT_FEATURES = ['debt', 'dna', 'proving', 'ghosts', 'universes', 'revenue', 'mirror', 'brain', 'gift', 'talk', 'rooms', 'orbit'];

const blankOrbit = () => ({
  ...Object.fromEntries(ORBIT_FEATURES.map((k) => [k, false])),
  rollbackErrorPct: 5,
  rollbackP95Ms: 150,
  watchMin: 15,
  minSamples: 8,
  giftAllowSchema: false,
  giftAllowAuth: false,
  sensitiveColumns: [],
  autoApply: [],
});

function cleanOrbit(raw) {
  const o = blankOrbit();
  if (!raw || typeof raw !== 'object') return o;
  for (const k of ORBIT_FEATURES) o[k] = raw[k] === true;
  const num = (k, min, max, d) => { const n = Number(raw[k]); o[k] = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  num('rollbackErrorPct', 0, 100, 5);
  num('rollbackP95Ms', 0, 60000, 150);
  num('watchMin', 1, 180, 15);
  num('minSamples', 2, 200, 8);
  o.giftAllowSchema = raw.giftAllowSchema === true;
  o.giftAllowAuth = raw.giftAllowAuth === true;
  o.sensitiveColumns = Array.isArray(raw.sensitiveColumns) ? raw.sensitiveColumns.map((x) => String(x).slice(0, 63)).filter((x) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(x)).slice(0, 40) : [];
  o.autoApply = Array.isArray(raw.autoApply) ? [...new Set(raw.autoApply.map((x) => String(x).slice(0, 40)))].slice(0, 20) : [];
  return o;
}

export function makeSettings(dataDir) {
  const file = path.join(dataDir, 'settings.json');
  let s = { autoPull: {}, orbitApps: {} };
  try { s = { autoPull: {}, orbitApps: {}, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  const save = () => { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(s)); fs.renameSync(tmp, file); };
  return {
    autoPull: (id) => s.autoPull[id] === true,
    setAutoPull(id, on) { if (on) s.autoPull[id] = true; else delete s.autoPull[id]; save(); },
    allAutoPull: () => ({ ...s.autoPull }),
    orbit(id) { return cleanOrbit(s.orbitApps?.[id]); },
    setOrbit(id, patch) {
      const cur = cleanOrbit(s.orbitApps?.[id]);
      const next = cleanOrbit({ ...cur, ...patch });
      s.orbitApps ||= {};
      const off = ORBIT_FEATURES.every((k) => !next[k]) && !next.autoApply.length && !next.sensitiveColumns.length && !next.giftAllowSchema && !next.giftAllowAuth;
      if (off && next.rollbackErrorPct === 5 && next.rollbackP95Ms === 150 && next.watchMin === 15 && next.minSamples === 8) delete s.orbitApps[id];
      else s.orbitApps[id] = next;
      save();
      return this.orbit(id);
    },
    allOrbit: () => ({ ...s.orbitApps }),
  };
}
