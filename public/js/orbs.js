// Thinking orbs: tiny dotted spheres that show what an agent is doing. A vanilla port of the "thinking-orbs" component
// (default looks only). Draws SVG circles in currentColor, so CSS `color` tints it. Holds still under reduced motion.
const TAU = Math.PI * 2, GOLDEN = Math.PI * (3 - Math.sqrt(5));
const ease = (x) => (1 - Math.cos(Math.PI * x)) / 2;
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export const ORB_STATES = ['base', 'working', 'reasoning', 'searching', 'background', 'retrying', 'compacting', 'waiting'];
const PERIOD = { base: 6500, working: 3000, reasoning: 6500, searching: 13000, background: 13000, retrying: 13000, compacting: 10000, waiting: 13000 };

function nearest(pts, i, k) {
  const idx = [], d = [], p = pts[i];
  for (let j = 0; j < pts.length; j++) {
    if (j === i) continue;
    const e = dist2(p, pts[j]); let at = idx.length;
    if (at === k) { if (e >= d[k - 1]) continue; at--; }
    while (at > 0 && d[at - 1] > e) { idx[at] = idx[at - 1]; d[at] = d[at - 1]; at--; }
    idx[at] = j; d[at] = e;
  }
  return idx;
}

const clocks = new Map();
function tick(look, now, speed) {
  let c = clocks.get(look);
  if (!c) clocks.set(look, (c = { t: 0, last: now }));
  if (now > c.last) { c.t += Math.min(now - c.last, 100) * speed; c.last = now; }
  return c.t;
}
const spring = (x) => 1 - Math.exp(-4.5 * x) * Math.cos(3 * Math.PI * x) - x * Math.exp(-4.5);
function rewind(t, w) {
  const P = 3200, k = Math.floor(t / P), u = t - k * P, back = 0.6 * 2100 * w, fwd = 2200 * w;
  let a;
  if (u < 2000) a = u * w;
  else if (u < 2200) { const x = (u - 2000) / 200; a = (2000 + 200 * (x - (x * x) / 2)) * w; }
  else if (u < 3000) a = 2100 * w - back * spring((u - 2200) / 800);
  else { const x = (u - 3000) / 200; a = 2100 * w - back + 100 * x * x * w; }
  return k * (fwd - back) + a;
}
const yawOf = (state, t) => (state === 'retrying' ? rewind(2 * t, TAU / 9000) : (t / PERIOD[state]) * TAU);

const RING_AXIS = (() => { const tip = (30 * Math.PI) / 180, roll = (10 * Math.PI) / 180; return [-Math.sin(roll) * Math.cos(tip), Math.cos(roll) * Math.cos(tip), Math.sin(tip)]; })();
const LENS_MS = 1800, MOVE = 0.4, LENS = 0.6;
function spot(k) {
  const phi = k * 2.45 + hash(k) * 1.5, theta = ((15 + 30 * hash(k + 0.5)) * Math.PI) / 180;
  return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
}
function lensAt(t) {
  const k = Math.floor(t / LENS_MS), u = t / LENS_MS - k, e = u < MOVE ? (1 - Math.cos((u / MOVE) * Math.PI)) / 2 : 1;
  const a = spot(k), b = spot(k + 1), v = a.map((ai, j) => ai + (b[j] - ai) * e), n = Math.hypot(v[0], v[1], v[2]);
  return v.map((vi) => vi / n);
}
const HOP = 220, TAIL = 5, REACH = 24, WALK = 16;

function arms(count) {
  const at = (lat, lon) => [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
  const g = Math.sqrt((4 * Math.PI) / count), n = 8, along = 0.6 * g, out = [];
  for (let m = 0; m < n; m++) {
    const room = m ? m & -m : n, lim = Math.min((85 * Math.PI) / 180, Math.acos(Math.min(1, (g * n) / (TAU * room))));
    for (let lat = -lim + ((m * 0.618) % 1) * along; lat <= lim; lat += along / Math.sqrt(1 + Math.cos(lat) ** 2)) out.push(at(lat, (m / n) * TAU - lat));
  }
  return out;
}
function distribute(state, count) {
  if (state === 'background') return arms(count);
  return Array.from({ length: count }, (_, i) => { const y = 1 - (2 * (i + 0.5)) / count, r = Math.sqrt(1 - y * y), th = i * GOLDEN; return [r * Math.cos(th), y, r * Math.sin(th)]; });
}

/** mountOrb(svg, { state, size, speed, label, density, dotSize, tilt }) -> { pause, play, destroy } */
export function mountOrb(svg, { state: asked, size = 20, speed = 1, label, density = 1, dotSize = 1, tilt = 20 } = {}) {
  const state = ORB_STATES.includes(asked) ? asked : 'base';
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: `0 0 ${size} ${size}`, fill: 'currentColor' })) svg.setAttribute(k, String(v));
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); svg.removeAttribute('aria-hidden'); }
  else { svg.setAttribute('aria-hidden', 'true'); svg.removeAttribute('role'); svg.removeAttribute('aria-label'); }
  const dens = state === 'background' ? 1 : 4;
  const count = Math.max(8, Math.round(size * dens * density));
  const c = size / 2, R = c * 0.8, rs = (size / 64) ** 0.6 * (0.72 * Math.sqrt(4 / dens)) * dotSize;
  const pts = distribute(state, count);
  const els = pts.map(() => svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'circle'))), hidden = new Uint8Array(pts.length);
  const reasoning = state === 'reasoning' && pts.length > 1, compacting = state === 'compacting';
  const near = reasoning ? pts.map((_, i) => nearest(pts, i, REACH)) : [];
  const walk = []; let hops = 0;

  const draw = (t) => {
    const period = PERIOD[state], yaw = yawOf(state, t), pitch = (tilt * Math.PI) / 180;
    const sy = Math.sin(yaw), cy = Math.cos(yaw), st = Math.sin(pitch), ct = Math.cos(pitch);
    const facing = (k) => pts[k][1] * st + (-pts[k][0] * sy + pts[k][2] * cy) * ct;
    const lit = new Map();
    if (reasoning) {
      const s = t / HOP, n = Math.floor(s), f = s - n;
      if (!walk.length) walk.push([...pts.keys()].reduce((b, k) => (facing(k) > facing(b) ? k : b), 0));
      hops = Math.max(hops, n - WALK);
      for (; hops < n; hops++) {
        const recent = walk.slice(-8), from = walk[walk.length - 1]; let best = -1, score = -Infinity;
        near[from].forEach((k, j) => { const sc = facing(k) + 0.35 * hash(hops * 31 + j); if (!recent.includes(k) && sc > score) { score = sc; best = k; } });
        walk.push(best < 0 ? near[from][0] : best); if (walk.length > WALK) walk.shift();
      }
      for (let j = TAIL - 1; j >= 0; j--) { const k = walk[walk.length - 1 - j]; if (k !== undefined) lit.set(k, Math.max(lit.get(k) ?? 0, j === 0 ? ease(Math.min(1, f * 2)) : 1 - (j - 1 + f) / TAIL)); }
    }
    const head = (t / 2000) * TAU + yaw, ahead = TAU / 2000 + TAU / period;
    const headLat = (tt) => ((70 * Math.PI) / 180) * (1 - 2 * ((tt % 6000) / 6000));
    const glow = Math.min(1, 3 * Math.sin(Math.PI * ((t % 6000) / 6000)));
    const lens = state === 'searching' ? lensAt(t) : null;
    let sweep = null;
    if (compacting) {
      const u = (t % 2800) / 2800, s = (u - 0.7) / 0.3;
      const release = s < 0.45 ? 1 - 1.25 * ease(s / 0.45) : s < 0.7 ? -0.25 * (1 - (s - 0.45) / 0.25) ** 2 : 0;
      sweep = { at: -1.15 + 2.3 * Math.min(1, u / 0.7), hold: u < 0.7 ? 1 : release };
    }
    pts.forEach(([x, y, z], i) => {
      const z1 = -x * sy + z * cy; let vx = x * cy + z * sy, vy = y * ct - z1 * st;
      const vz = y * st + z1 * ct, d = (vz + 1) / 2; let r = (0.5 + 1.4 * d) * rs, a = Math.max(0, (d - 0.3) / 0.7);
      if (lens) {
        const ang = Math.acos(Math.min(1, (vx * lens[0] + vy * lens[1] + vz * lens[2]) / Math.hypot(vx, vy, vz))), w = ang < LENS ? (1 - (ang / LENS) ** 2) ** 2 : 0;
        a *= 1 - 0.55 * (1 - w); if (size <= 24) r *= 1 + 0.5 * w;
        if (w) { vx *= 1 + 0.12 * w; vy *= 1 + 0.12 * w; vx += (vx - lens[0]) * 0.35 * w; vy += (vy - lens[1]) * 0.35 * w; r *= 1 + 0.9 * w; a += (1 - a) * w; }
      }
      if (sweep) { const w = Math.min(1, Math.max(0, (sweep.at - vx) / 0.2)) * sweep.hold; vx *= 1 - 0.3 * w; vy *= 1 - 0.3 * w; r *= 1 - 0.45 * w; }
      if (state === 'working') {
        const u = t % 1700, at = 1.3 - 2.6 * ease(Math.min(1, u / 1200)), q = vx * RING_AXIS[0] + vy * RING_AXIS[1] + vz * RING_AXIS[2];
        const g = u < 1200 ? Math.exp(-(((q - at) / 0.2) ** 2)) : 0; r *= 1 + 0.6 * g; a += (1 - a) * g;
        const w = Math.min(1, Math.max(0, (q - at) / 0.2)) * (u < 1200 ? 1 : 1 - Math.min(1, 1.6 * ((u - 1200) / 800)));
        vx *= 1 - 0.08 * w; vy *= 1 - 0.08 * w; r *= 1 - 0.15 * w;
      }
      if (reasoning) { const spark = lit.get(i) ?? 0; a *= 0.5; if (spark) { r *= 1 + 0.8 * spark; a += (1 - a) * spark; } }
      if (state === 'waiting') {
        const lat = Math.asin(y / (Math.hypot(x, y, z) || 1)), lon = Math.atan2(z, x), off = Math.atan2(Math.sin(lon - head), Math.cos(lon - head)), along = off * Math.cos(lat);
        const g = Math.exp(-(((lat - headLat(t + off / ahead)) / 0.28) ** 2)) * Math.exp(-((along / (off * ahead > 0 ? 0.12 : 1)) ** 2));
        const w = glow * g ** 0.6; a = a * 0.5 + (1 - a * 0.5) * w; r *= 1 + 1.1 * w;
      }
      const el = els[i], o = a.toFixed(2);
      if (o === '0.00' && hidden[i]) return;
      hidden[i] = +(o === '0.00');
      el.setAttribute('cx', (c + vx * R).toFixed(2)); el.setAttribute('cy', (c - vy * R).toFixed(2)); el.setAttribute('r', Math.max(0.45, r).toFixed(2)); el.setAttribute('fill-opacity', o);
    });
  };

  const look = `${state}@${speed}`;
  draw(tick(look, performance.now(), speed));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = true, raf = 0, dead = false;
  const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; }); io.observe(svg);
  const frame = (now) => { const t = tick(look, now, speed); if (visible) draw(t); raf = requestAnimationFrame(frame); };
  const pause = () => { cancelAnimationFrame(raf); raf = 0; };
  const play = () => { if (!raf && !still && !dead) raf = requestAnimationFrame(frame); };
  play();
  return { pause, play, destroy() { dead = true; pause(); io.disconnect(); svg.replaceChildren(); } };
}

/** Create an <svg> orb element. Returns the element; it cleans itself up via .orb.destroy(). */
export function orb(state, { size = 20, label, className = 'orb-svg', ...rest } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.orb = mountOrb(svg, { state, size, label, ...rest });
  return svg;
}
