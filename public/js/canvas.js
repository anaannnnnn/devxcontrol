// Node canvas: the Autopilot workflow as cards with ports and bezier wires. Layout is snake-rows on wide screens and a
// single column on narrow ones; wires are recomputed from the layout, never from the DOM, so they cannot drift.
import { h, icon, clear } from './ui.js';
import { orb } from './orbs.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 196, H = 104, GX = 64, GY = 56, PAD = 28;

export function workflowCanvas({ stages, at, onPick, meta = {} }) {
  let sel = at, cols = 5, pos = [];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'cv-wires'); svg.setAttribute('aria-hidden', 'true');
  const cards = h('div', { class: 'cv-cards' });
  const world = h('div', { class: 'cv-world' }, svg, cards);
  const el = h('div', { class: 'cv' }, h('div', { class: 'cv-top' },
    h('span', { class: 'cv-tile' }, icon('flow', 18)), h('div', { class: 'cv-tabs', role: 'group' }, h('b', {}, meta.run || 'No run yet'), meta.app ? h('span', {}, meta.app) : ''),
    h('span', { class: 'grow' }), h('span', { class: 'cv-chip' }, h('i', { class: 'sdot', 'data-s': meta.live ? 'live' : 'idle' }), meta.chip || 'idle')),
    world, h('div', { class: 'cv-legend' }, h('span', {}, h('i', { class: 'lg done' }), 'done'), h('span', {}, h('i', { class: 'lg now' }), 'running'), h('span', {}, h('i', { class: 'lg next' }), 'queued'), h('span', {}, 'click a node to inspect')));

  const nodes = stages.map((s, i) => {
    const st = i < at ? 'done' : i === at ? 'now' : 'next';
    const head = h('div', { class: 'cv-h' }, h('span', { class: 'cv-n' }, String(i + 1).padStart(2, '0')), h('i', { class: 'sdot', 'data-s': st === 'now' ? 'live' : st === 'done' ? 'ok' : 'idle' }), h('span', { class: 'grow' }), st === 'now' ? orb('working', { size: 22 }) : st === 'done' ? icon('check', 14) : null);
    const c = h('button', { class: 'cv-node', dataset: { st }, 'aria-pressed': String(i === sel), 'aria-label': `${i + 1}. ${s.name}, ${st === 'now' ? 'running' : st === 'done' ? 'done' : 'queued'}`, onclick: () => pick(i) },
      h('span', { class: 'cv-port in' }), h('span', { class: 'cv-port out' }), head, h('b', {}, s.name), h('small', {}, s.by));
    cards.append(c); return c;
  });

  function pick(i) { sel = i; nodes.forEach((n, j) => n.setAttribute('aria-pressed', String(i === j))); onPick?.(i); }

  function layout() {
    const w = el.clientWidth || 800;
    cols = w < 560 ? 1 : Math.max(2, Math.min(5, Math.floor((w - PAD * 2 + GX) / (W + GX))));
    const n = stages.length, rows = Math.ceil(n / cols), cw = cols === 1 ? Math.min(w - PAD * 2, 320) : W;
    const gx = cols === 1 ? 0 : Math.max(24, Math.min(GX, (w - PAD * 2 - cols * cw) / Math.max(1, cols - 1)));
    const left = cols === 1 ? (w - cw) / 2 : (w - (cols * cw + (cols - 1) * gx)) / 2;
    pos = stages.map((_, i) => {
      const r = Math.floor(i / cols), k = i % cols, c = r % 2 && cols > 1 ? cols - 1 - k : k;
      return { x: left + c * (cw + gx), y: PAD + r * (H + GY), r, dir: r % 2 && cols > 1 ? -1 : 1 };
    });
    const hgt = PAD * 2 + rows * H + (rows - 1) * GY;
    world.style.height = `${hgt}px`; svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`); svg.setAttribute('width', w); svg.setAttribute('height', hgt);
    nodes.forEach((nd, i) => { nd.style.cssText = `left:${pos[i].x}px;top:${pos[i].y}px;width:${cw}px;height:${H}px`; nd.classList.toggle('flip', pos[i].dir < 0); nd.classList.toggle('vert', cols === 1); });
    wires(cw);
  }

  function wires(cw) {
    clear(svg);
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '';
    svg.append(defs);
    for (let i = 0; i < stages.length - 1; i++) {
      const a = pos[i], b = pos[i + 1], vert = cols === 1;
      let d;
      if (vert) { const x = a.x + cw / 2, y1 = a.y + H, y2 = b.y, m = (y2 - y1) / 2; d = `M${x},${y1} C${x},${y1 + m} ${x},${y2 - m} ${x},${y2}`; }
      else if (a.r === b.r) { const o = a.dir > 0 ? a.x + cw : a.x, e = b.dir > 0 ? b.x : b.x + cw, y = a.y + H / 2, m = Math.abs(e - o) / 2 * a.dir; d = `M${o},${y} C${o + m},${y} ${e - m},${y} ${e},${y}`; }
      else { const x = a.x + cw / 2, y1 = a.y + H, y2 = b.y, m = (y2 - y1) * 0.9; d = `M${x},${y1} C${x},${y1 + m} ${b.x + cw / 2},${y2 - m} ${b.x + cw / 2},${y2}`; }
      const st = i + 1 < at ? 'done' : i + 1 === at ? 'now' : 'next';
      const glow = document.createElementNS(NS, 'path'); glow.setAttribute('d', d); glow.setAttribute('class', `w-glow ${st}`);
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('class', `w ${st}`);
      svg.append(glow, p);
      if (!vert) for (const [px, py] of [[a.dir > 0 ? a.x + cw : a.x, a.y + H / 2], [b.dir > 0 ? b.x : b.x + cw, b.y + H / 2]]) if (a.r === b.r) { /* ports are drawn by CSS */ }
    }
  }

  const ro = new ResizeObserver(layout); ro.observe(el);
  queueMicrotask(layout);
  return { el, select: pick, destroy() { ro.disconnect(); el.querySelectorAll('svg.orb-svg').forEach((s) => s.orb?.destroy()); } };
}
