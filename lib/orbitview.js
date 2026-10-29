// Orbit View: shape real monitor facts into planets. Missing measurements stay null.
export function shapeSky(apps, { events = [], backups = [], behind = {} } = {}) {
  const now = Date.now();
  const recent = events.filter((e) => now - e.t < 6 * 3600e3);
  return {
    measuredAt: now,
    planets: apps.map((a) => {
      const samples = (a.spark?.ms || []).filter((n) => n != null);
      const histCount = samples.length;
      const backs = backups.filter((b) => b.app === a.id).length;
      const flares = recent.filter((e) => e.app === a.id && (e.level === 'bad' || e.level === 'warn') && /status|incident|down|degraded/i.test(`${e.type} ${e.msg}`));
      const comets = recent.filter((e) => e.app === a.id && e.type === 'deploy');
      const pending = behind[a.id] > 0 ? behind[a.id] : 0;
      return {
        id: a.id,
        name: a.name,
        status: a.status || 'unknown',
        size: histCount ? histCount : null,
        sizeMeaning: histCount ? 'Count of recent monitor samples with a response time. Not visitor traffic.' : null,
        sizeReason: histCount ? null : 'not measured: this app has no response-time samples yet.',
        glow: a.status || 'unknown',
        orbitSpeed: histCount ? Math.round((histCount / Math.max(samples.length, 1)) * 100) / 100 : null,
        orbitReason: histCount ? 'Relative to how many recent samples included a response time.' : 'not measured: request rate is not in the monitor.',
        latencyMs: a.ms ?? null,
        rings: backups.length || backs ? backs : (backups.length === 0 ? 0 : null),
        ringsMeaning: 'Backup files Control can see for this app.',
        moons: (a.containers || []).map((c) => ({ name: c.name, state: c.state || 'unknown' })),
        flares: flares.slice(-3).map((e) => ({ t: e.t, msg: e.msg, level: e.level })),
        comets: comets.slice(-3).map((e) => ({ t: e.t, msg: e.msg })),
        satellites: pending,
        cpu: a.cpu ?? null,
        mem: a.mem ?? null,
      };
    }),
  };
}
