// Custom visuals: sparkline, interactive line chart, gauge, fleet radar. SVG only, no libraries.
import { h, clear, fmt, STATUS_LABEL } from './ui.js';

const nice = (max) => { if (max <= 0) return 1; const p = 10 ** Math.floor(Math.log10(max)); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

/* ---------------- sparkline ---------------- */
export function sparkline(values, { w = 120, h: ht = 32, color = 'var(--s1)' } = {}) {
  const v = values.map((x) => (x == null ? null : +x));
  const real = v.filter((x) => x != null);
  const svg = h('svg', { viewBox: `0 0 ${w} ${ht}`, width: '100%', height: ht, preserveAspectRatio: 'none', role: 'img', 'aria-label': real.length ? `Trend, latest ${fmt.ms(real.at(-1))}` : 'No data yet' });
  if (real.length < 2) { svg.append(h('line', { x1: 0, x2: w, y1: ht - 4, y2: ht - 4, stroke: 'var(--line)', 'stroke-dasharray': '3 4' })); return svg; }
  const lo = Math.min(...real), hi = Math.max(...real), span = hi - lo || 1;
  const x = (i) => (i / (v.length - 1)) * (w - 4) + 2;
  const y = (n) => ht - 4 - ((n - lo) / span) * (ht - 8);
  let d = '', pen = false;
  v.forEach((n, i) => { if (n == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(n).toFixed(1)}`; pen = true; });
  svg.append(h('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
  const last = v.map((n, i) => [n, i]).filter(([n]) => n != null).at(-1);
  svg.append(h('circle', { cx: x(last[1]), cy: y(last[0]), r: 3, fill: color }));
  return svg;
}

/* ---------------- line chart with crosshair, tooltip, keyboard ---------------- */
export function lineChart({ series, unit = (n) => String(n), min0 = true, height = 200, label }) {
  const W = 640, H = height, L = 48, R = 12, T = 10, B = 24;
  const svg = h('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: 0, 'aria-label': label || 'Line chart. Use left and right arrow keys to read values.' });
  const tip = h('div', { class: 'chart-tip', role: 'status' });
  const root = h('div', { class: 'chart' }, svg, tip);
  let data = null, idx = -1;

  const layers = { grid: h('g'), lines: h('g'), cross: h('g'), hit: h('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent' }) };
  svg.append(layers.grid, layers.lines, layers.cross, layers.hit);
  const xAt = (i, n) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));

  function draw() {
    clear(layers.grid); clear(layers.lines); clear(layers.cross);
    if (!data || !data.t.length) { layers.grid.append(h('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'axis-t' }, 'Collecting data...')); return; }
    const n = data.t.length;
    const all = series.flatMap((s) => data[s.key].filter((v) => v != null));
    const top = nice(Math.max(...all, 1) * 1.08);
    const bot = min0 ? 0 : Math.min(...all, top);
    const y = (v) => T + (1 - (v - bot) / (top - bot || 1)) * (H - T - B);
    for (let g = 0; g <= 4; g++) {
      const val = bot + ((top - bot) * g) / 4, yy = y(val);
      layers.grid.append(h('line', { class: 'grid', x1: L, x2: W - R, y1: yy, y2: yy }), h('text', { class: 'axis-t', x: L - 8, y: yy + 3.5, 'text-anchor': 'end' }, unit(val)));
    }
    [0, 0.5, 1].forEach((f) => {
      const i = Math.round(f * (n - 1));
      layers.grid.append(h('text', { class: 'axis-t', x: xAt(i, n), y: H - 6, 'text-anchor': f === 0 ? 'start' : f === 1 ? 'end' : 'middle' }, new Date(data.t[i]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
    });
    for (const s of series) {
      let d = '', pen = false;
      data[s.key].forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${xAt(i, n).toFixed(1)} ${y(v).toFixed(1)}`; pen = true; });
      layers.lines.append(h('path', { class: 'ln', d, stroke: s.color }));
    }
    root._geom = { n, y };
    if (idx >= 0) cross(idx);
  }

  function cross(i) {
    clear(layers.cross);
    if (!data || !root._geom) return;
    const { n, y } = root._geom; i = Math.max(0, Math.min(n - 1, i)); idx = i;
    const x = xAt(i, n);
    layers.cross.append(h('line', { class: 'cross', x1: x, x2: x, y1: T, y2: H - B }));
    clear(tip);
    tip.append(h('div', { class: 't' }, fmt.clock(data.t[i])));
    for (const s of series) {
      const v = data[s.key][i];
      if (v != null) layers.cross.append(h('circle', { class: 'pt', cx: x, cy: y(v), r: 4.5, fill: s.color }));
      tip.append(h('div', { class: 'li' }, h('i', { style: { background: s.color } }), h('span', {}, `${s.name}: `), h('b', {}, v == null ? '-' : unit(v))));
    }
    const box = svg.getBoundingClientRect(), scale = box.width / W;
    const px = x * scale;
    tip.style.left = `${Math.min(Math.max(px + 12, 4), box.width - 150)}px`;
    tip.style.top = `${T * scale + 4}px`;
    tip.classList.add('on');
  }
  const leave = () => { idx = -1; clear(layers.cross); tip.classList.remove('on'); };
  layers.hit.addEventListener('pointermove', (e) => {
    if (!data?.t.length) return;
    const box = svg.getBoundingClientRect(), fx = ((e.clientX - box.left) / box.width) * W;
    cross(Math.round(((fx - L) / (W - L - R)) * (data.t.length - 1)));
  });
  layers.hit.addEventListener('pointerleave', leave);
  svg.addEventListener('keydown', (e) => {
    if (!data?.t.length) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); cross((idx < 0 ? data.t.length : idx) - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); cross(idx + 1); }
    if (e.key === 'Escape') leave();
  });
  svg.addEventListener('blur', leave);

  return { el: root, set(d) { data = d; draw(); } };
}

/** Accessible table twin of a chart (last 12 samples). */
export function chartTable(data, series, unit) {
  const n = data?.t?.length || 0;
  const rows = [];
  for (let i = Math.max(0, n - 12); i < n; i++) rows.push(h('tr', {}, h('td', { class: 'mono' }, fmt.clock(data.t[i])), series.map((s) => h('td', { class: 'r mono' }, data[s.key][i] == null ? '-' : unit(data[s.key][i])))));
  return h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Time'), series.map((s) => h('th', { class: 'r' }, s.name)))), h('tbody', {}, rows)));
}

/* ---------------- gauge ---------------- */
export function gauge({ value, label, sub, color = 'var(--s1)', text }) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value ?? 0));
  const ring = h('circle', { class: 'val', cx: 66, cy: 66, r, stroke: color, 'stroke-width': 10, 'stroke-dasharray': c, 'stroke-dashoffset': c, transform: 'rotate(-90 66 66)' });
  requestAnimationFrame(() => requestAnimationFrame(() => ring.setAttribute('stroke-dashoffset', c * (1 - v / 100))));
  return h('div', { class: 'gauge', role: 'img', 'aria-label': `${label}: ${text ?? v.toFixed(0) + '%'}` },
    h('svg', { viewBox: '0 0 132 132' }, h('circle', { class: 'trk', cx: 66, cy: 66, r, 'stroke-width': 10 }), ring, h('text', { x: 66, y: 74 }, text ?? `${v.toFixed(0)}%`)),
    h('div', {}, h('b', {}, label), h('div', { class: 'cap' }, sub || '')));
}

/* ---------------- fleet radar: angle = app, distance from centre = response time ---------------- */
export function radar(onOpen) {
  const S = 400, C = 200;
  const rOf = (ms) => (ms == null ? 58 : Math.max(52, Math.min(168, 52 + (Math.log(Math.max(ms, 25) / 25) / Math.log(1200 / 25)) * 118)));
  const svg = h('svg', { class: 'radar-svg', viewBox: `0 0 ${S} ${S}`, role: 'group', 'aria-label': 'Fleet radar. Each dot is an app; closer to the centre means faster response.' });
  const sweep = h('div', { class: 'radar-sweep', 'aria-hidden': 'true' });
  const tip = h('div', { class: 'radar-tip', role: 'status' });
  const el = h('div', {}, h('div', { class: 'radar-wrap' }, sweep, svg, tip), h('p', { class: 'radar-cap' }, 'Distance from the centre is response time. Down and stopped apps sit on the rim.'));
  const wrap = el.firstChild;
  const guides = h('g');
  svg.append(guides);
  [[100, '100 ms'], [300, '300 ms'], [1000, '1 s']].forEach(([ms, t]) => {
    guides.append(h('circle', { class: 'ring', cx: C, cy: C, r: rOf(ms) }), h('text', { class: 'ring-label', x: C + 5, y: C - rOf(ms) + 11 }, t));
  });
  guides.append(h('circle', { class: 'ring', cx: C, cy: C, r: 182, 'stroke-dasharray': '2 5' }));
  svg.append(h('circle', { class: 'radar-core', cx: C, cy: C, r: 24 }), h('text', { x: C, y: C + 4, 'text-anchor': 'middle', style: { fill: 'var(--text-2)', font: '600 10px var(--f-mono)' } }, 'VPS'));
  const nodes = new Map();
  let first = true;

  function place(app, i, n) {
    const ang = ((i / n) * 360 - 90 + 18) * (Math.PI / 180);
    const rim = app.status === 'down' || app.status === 'stopped' || app.status === 'unknown';
    const r = rim ? 178 : rOf(app.ms);
    return { x: C + Math.cos(ang) * r, y: C + Math.sin(ang) * r, right: Math.cos(ang) >= 0 };
  }
  function update(apps, openId) {
    apps.forEach((app, i) => {
      let nd = nodes.get(app.id);
      const p = place(app, i, apps.length);
      if (!nd) {
        const g = h('g', { class: `radar-node ${first ? 'enter' : ''}`, tabindex: 0, role: 'link', style: { '--i': i } });
        const halo = h('circle', { class: 'halo', r: 13 });
        const pulse = h('circle', { class: 'radar-pulse', r: 6 });
        const dot = h('circle', { class: 'dot', r: 6 });
        const label = h('text', { y: 4 });
        g.append(pulse, halo, dot, label);
        g.addEventListener('click', () => onOpen(app.id));
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(app.id); } });
        g.addEventListener('pointerenter', () => hover(app.id, true));
        g.addEventListener('pointerleave', () => hover(app.id, false));
        g.addEventListener('focus', () => hover(app.id, true));
        g.addEventListener('blur', () => hover(app.id, false));
        svg.append(g);
        nd = { g, pulse, dot, label, app };
        nodes.set(app.id, nd);
      }
      nd.app = app;
      nd.g.dataset.s = app.status;
      nd.g.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      nd.g.style.transition = 'transform .8s cubic-bezier(.2,0,0,1)';
      nd.g.setAttribute('aria-label', `${app.name}: ${STATUS_LABEL[app.status] || app.status}${app.ms != null ? `, ${app.ms} milliseconds` : ''}. Open details.`);
      nd.label.textContent = app.name.length > 14 ? app.name.slice(0, 13) + '…' : app.name;
      nd.label.setAttribute('x', p.right ? 12 : -12);
      nd.label.setAttribute('text-anchor', p.right ? 'start' : 'end');
      nd.pulse.style.display = app.status === 'healthy' ? '' : 'none';
      nd.pulse.style.animationDelay = `${(i * 0.45).toFixed(2)}s`;
      nd.g.classList.toggle('on', app.id === openId);
    });
    first = false;
  }
  function hover(id, on) {
    const nd = nodes.get(id);
    if (!on || !nd) { tip.classList.remove('on'); return; }
    const a = nd.app, m = /translate\(([\d.]+)px, ([\d.]+)px\)/.exec(nd.g.style.transform) || [0, 200, 200];
    clear(tip);
    tip.append(h('b', {}, a.name), h('div', {}, STATUS_LABEL[a.status] || a.status), h('div', { class: 'muted' }, a.ms != null ? `${a.ms} ms avg` : 'no response'));
    const box = wrap.getBoundingClientRect(), k = box.width / S;
    tip.style.left = `${Math.min(Math.max(m[1] * k - 70, 0), box.width - 150)}px`;
    tip.style.top = `${Math.min(m[2] * k + 18, box.height - 70)}px`;
    tip.classList.add('on');
  }
  return { el, update, hover };
}
