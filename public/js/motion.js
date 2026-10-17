// GSAP layer: shell intro, page entrance, scroll reveals, text decode. Everything is skipped under reduced motion
// or if the vendored library failed to load, in which case content simply shows.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ok = () => !reduce && !!window.gsap;
const SEL = '.page-head, .hero h1, .hero .lede, .stat, .scene-wrap, .ticker, .group > h2, .group-title, .vessel, .panel, .upd, .app-head, .tabs, .banner, .score, .ob-steps, .stage-info';

let st = false;
function plugin() { if (!st && window.ScrollTrigger) { window.gsap.registerPlugin(window.ScrollTrigger); st = true; } }

export const motion = {
  shell(shell) {
    if (!ok()) return;
    const g = window.gsap;
    g.from(shell.pill, { y: -48, opacity: 0, duration: 0.9, ease: 'power3.out', clearProps: 'transform,opacity' });
    g.from(shell.pill.querySelectorAll('.nv'), { y: -10, opacity: 0, duration: 0.5, stagger: 0.04, delay: 0.25, ease: 'power2.out', clearProps: 'transform,opacity' });
    g.from(shell.dock, { y: 60, opacity: 0, duration: 0.8, delay: 0.2, ease: 'power3.out', clearProps: 'transform,opacity' });
  },

  /** Animate everything inside root. Elements below the fold are revealed as they scroll in. */
  page(root) {
    if (!ok()) return;
    plugin();
    const g = window.gsap;
    const nodes = [...root.querySelectorAll(SEL)].filter((n) => !n.dataset.mo && !n.closest('.dialog, .palette, .toast, .term'));
    if (!nodes.length) return;
    nodes.forEach((n) => { n.dataset.mo = '1'; });
    const vh = innerHeight;
    const first = nodes.filter((n) => n.getBoundingClientRect().top < vh * 0.95);
    const rest = nodes.filter((n) => !first.includes(n));
    const from = { y: 26, opacity: 0, filter: 'blur(6px)' };
    const to = { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out', clearProps: 'transform,opacity,filter' };
    g.fromTo(first, from, { ...to, stagger: 0.055, delay: 0.05 });
    if (rest.length && window.ScrollTrigger) {
      g.set(rest, from);
      window.ScrollTrigger.batch(rest, { start: 'top 94%', once: true, onEnter: (els) => g.to(els, { ...to, stagger: 0.07 }) });
    } else if (rest.length) g.fromTo(rest, from, { ...to, stagger: 0.05, delay: 0.2 });
  },

  /** Decode-style text reveal for [data-decode]. */
  decode(root) {
    if (reduce) return;
    root.querySelectorAll('[data-decode]').forEach((el) => {
      if (el.dataset.dc) return; el.dataset.dc = '1';
      const final = el.textContent, chars = 'ABCDEF0123456789<>/#$%&';
      let f = 0; const total = 14;
      const t = setInterval(() => {
        f++; el.textContent = [...final].map((c, i) => (c === ' ' || i < (f / total) * final.length ? c : chars[Math.floor(Math.random() * chars.length)])).join('');
        if (f >= total) { clearInterval(t); el.textContent = final; }
      }, 32);
    });
  },

  refresh() { if (st) window.ScrollTrigger.refresh(); },
};
