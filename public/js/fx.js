// Motion and atmosphere: constellation canvas, cursor glow, scroll progress + parallax, reveal-on-scroll,
// pointer spotlight, card tilt, magnetic buttons, count-up. Everything degrades to static under reduced motion.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; parent?.append(e); return e; };

let started = false;
const seen = new Set();
export const fx = {
  init() {
    if (started) return; started = true;
    const bg = el('div', 'fx-bg', document.body); bg.setAttribute('aria-hidden', 'true');
    ['b b1', 'b b2', 'b b3'].forEach((c) => el('i', c, bg));
    el('div', 'grid', bg); const canvas = el('canvas', '', bg); el('div', 'vignette', bg);
    document.body.prepend(bg);
    const bar = el('div', 'fx-progress', document.body); bar.setAttribute('aria-hidden', 'true');
    const glow = fine && !reduce ? el('div', 'fx-cursor', document.body) : null;
    if (glow) glow.setAttribute('aria-hidden', 'true');

    /* scroll: progress bar, parallax variable, sticky header state */
    let ticking = false;
    const onScroll = () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
        document.documentElement.style.setProperty('--sy', String(Math.round(y)));
        bar.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : '0');
        document.querySelector('.top')?.classList.toggle('scrolled', y > 8);
        ticking = false;
      });
    };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();

    /* pointer: spotlight vars, tilt, magnetic, cursor glow */
    let gx = innerWidth / 2, gy = innerHeight / 2, cx = gx, cy = gy;
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      gx = e.clientX; gy = e.clientY; glow?.classList.add('on');
      const card = e.target.closest?.('.panel, .vessel, .stat, .upd');
      if (card) { const r = card.getBoundingClientRect(); card.style.setProperty('--mx', `${e.clientX - r.left}px`); card.style.setProperty('--my', `${e.clientY - r.top}px`); }
      if (reduce) return;
      const t = e.target.closest?.('.vessel, .upd, .stat');
      if (t && !t.classList.contains('rv')) {
        const r = t.getBoundingClientRect(); const amt = t.classList.contains('stat') ? 7 : t.classList.contains('vessel') ? 1.1 : 2.4;
        t.classList.add('tilt', 'moving');
        t.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width) - .5) * amt * 2}deg`);
        t.style.setProperty('--rx', `${(.5 - ((e.clientY - r.top) / r.height)) * amt * 2}deg`);
      }
      const b = e.target.closest?.('.btn.primary');
      if (b && !b.disabled) { const r = b.getBoundingClientRect(); b.style.setProperty('--tx', `${(e.clientX - (r.left + r.width / 2)) * .14}px`); b.style.setProperty('--ty', `${(e.clientY - (r.top + r.height / 2)) * .22}px`); }
    }, { passive: true });
    document.addEventListener('pointerout', (e) => {
      const t = e.target.closest?.('.tilt');
      if (t && !t.contains(e.relatedTarget)) { t.classList.remove('moving'); t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); }
      const b = e.target.closest?.('.btn.primary');
      if (b && !b.contains(e.relatedTarget)) { b.style.setProperty('--tx', '0px'); b.style.setProperty('--ty', '0px'); }
    });
    document.addEventListener('pointerleave', () => glow?.classList.remove('on'));
    if (glow) { const loop = () => { cx += (gx - cx) * .12; cy += (gy - cy) * .12; glow.style.transform = `translate3d(${cx}px, ${cy}px, 0)`; requestAnimationFrame(loop); }; loop(); }

    /* constellation */
    if (reduce) return;
    const ctx = canvas.getContext('2d'); let w = 0, h = 0, pts = [], color = '155,140,255', frame = 0;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const size = () => {
      w = innerWidth; h = innerHeight; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(64, Math.round((w * h) / 26000));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22, r: Math.random() * 1.4 + .5 }));
    };
    size(); addEventListener('resize', size);
    const rgb = () => { const hex = css('--accent').replace('#', ''); if (hex.length === 6) color = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(','); };
    rgb();
    const draw = () => {
      requestAnimationFrame(draw);
      if (document.hidden) return;
      if (++frame % 90 === 0) rgb();
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1;
        const dx = gx - p.x, dy = gy - p.y, d2 = dx * dx + dy * dy;
        if (d2 < 22500) { p.x += dx * .0016; p.y += dy * .0016; }
      }
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        ctx.fillStyle = `rgba(${color},.55)`; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.283); ctx.fill();
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d = dx * dx + dy * dy;
          if (d < 17000) { ctx.strokeStyle = `rgba(${color},${(1 - d / 17000) * .22})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
      }
    };
    draw();
  },

  /** Reveal-on-scroll for everything inside root. Safe to call repeatedly. */
  scan(root = document) {
    const nodes = [...root.querySelectorAll('.hero h1, .hero .lede, .stat, .radar-wrap, .ticker, .group > h2, .vessel, .panel, .upd, .app-head, .tabs, .dbx-side, .banner, .empty')]
      .filter((n) => !n.closest('.dialog, .palette, .rv, .toast') && !n.dataset.rvDone);
    if (reduce || !('IntersectionObserver' in window)) { nodes.forEach((n) => { n.dataset.rvDone = '1'; }); return; }
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
      vis.forEach((e, i) => {
        const n = e.target; io.unobserve(n);
        n.style.setProperty('--d', `${Math.min(i * 70, 420)}ms`);
        n.classList.add('in');
        setTimeout(() => { n.classList.remove('rv', 'in'); n.style.removeProperty('--d'); }, 1500 + i * 70);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    nodes.forEach((n) => { n.dataset.rvDone = '1'; n.classList.add('rv'); io.observe(n); });
  },

  /** Page entrance animation on a container. */
  enter(node) { node.classList.remove('page-enter'); void node.offsetWidth; node.classList.add('page-enter'); },

  /** Animate a number once per key; later calls just set the value. */
  count(node, to, { key, decimals = 0, dur = 1100 } = {}) {
    const fmt = (v) => (decimals ? v.toFixed(decimals) : String(Math.round(v)));
    const n = Number(to);
    if (!Number.isFinite(n) || reduce || (key && seen.has(key))) { node.textContent = Number.isFinite(n) ? fmt(n) : String(to); return; }
    if (key) seen.add(key);
    const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - (1 - p) ** 4; node.textContent = fmt(n * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  },
};
