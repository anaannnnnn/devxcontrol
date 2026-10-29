// Blocks: a curated library of real, hand-crafted sections (hero, features, bento, pricing, testimonial, stats, CTA,
// FAQ, steps, logo cloud, newsletter, footer). Unlike the parametric generator, these are opinionated, finished designs.
// They are filled from the page's own content (so text is kept) and styled with the active Look's CSS variables
// (--dx-accent / --dx-surface / --dx-text / --dx-border / --dx-muted / --dx-on-accent / --dx-radius), so a block always
// matches whichever Look is applied. Output is plain HTML + scoped CSS that works in any project. No dependencies.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const href = (h) => (/^(https?:|mailto:|tel:|\/|#|\.\.?\/)/i.test(String(h || '')) ? String(h) : '#');
const first = (...v) => v.find((x) => x != null && x !== '') ?? '';
// token shorthands with safe fallbacks
const T = { acc: 'var(--dx-accent,#6366f1)', on: 'var(--dx-on-accent,#fff)', sur: 'var(--dx-surface,#fff)', txt: 'var(--dx-text,#0f172a)', mut: 'var(--dx-muted,#64748b)', bd: 'var(--dx-border,#e5e7eb)', bg: 'var(--dx-bg,#f8fafc)', r: 'var(--dx-radius,16px)' };

export const SAMPLE = {
  brand: 'Northwind', title: 'Ship faster with Northwind', sub: 'The toolkit teams actually enjoy using — real-time, reliable, and a joy to build on.',
  headings: ['Ship faster with Northwind', 'Fast by default', 'Secure', 'Scales with you', 'Starter', 'Pro', 'Team'],
  paras: ['The toolkit teams actually enjoy using.', 'Sub-50ms responses worldwide.', 'SOC 2 and encryption built in.', 'From first user to millions.', '$9', '$29', '$79'],
  links: [{ t: 'Features', h: '/features' }, { t: 'Pricing', h: '/pricing' }, { t: 'Docs', h: '/docs' }, { t: 'Blog', h: '/blog' }],
  buttons: [{ t: 'Start free trial', h: '/signup' }, { t: 'Book a demo', h: '/demo' }],
  items: [{ t: 'Fast global deploys', h: '' }, { t: 'Great support', h: '' }, { t: 'Built-in analytics', h: '' }, { t: 'Unlimited seats', h: '' }, { t: 'SSO & SAML', h: '' }, { t: 'Audit logs', h: '' }],
  copy: '© 2026 Northwind, Inc.',
};

const head = (p) => first(p.title, p.headings?.[0], 'A headline that says what you do');
const sub = (p) => first(p.sub, p.paras?.[0], 'One calm sentence that explains who it is for and why it matters.');
const btns = (p) => (p.buttons?.length ? p.buttons : [{ t: 'Get started', h: '#' }, { t: 'Learn more', h: '#' }]);
const feats = (p) => { const h = (p.headings || []).slice(1); const d = (p.paras || []).slice(1); const src = (p.items?.length ? p.items.map((x) => x.t) : h); return (src.length ? src : ['Fast', 'Secure', 'Scalable']).slice(0, 6).map((t, i) => ({ t, d: d[i] || '' })); };

const BASE = (k) => `.${k}{font-family:var(--dx-font,inherit);color:${T.txt};box-sizing:border-box;max-width:100%}.${k} *{box-sizing:border-box}`;

export const BLOCKS = [
  // ---------------------------------- Hero ----------------------------------
  { id: 'hero-split', group: 'Hero', name: 'Split hero', build(p, k) {
    const b = btns(p);
    const css = `${BASE(k)}.${k}{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center;padding:64px 32px}
.${k} h1{font-size:clamp(2rem,4.5vw,3.4rem);line-height:1.05;letter-spacing:-.02em;margin:0 0 .4em}
.${k} p{font-size:1.15rem;line-height:1.6;color:${T.mut};max-width:34em;margin:0 0 1.6em}
.${k} .acts{display:flex;gap:12px;flex-wrap:wrap}
.${k} .b1{background:${T.acc};color:${T.on};padding:13px 24px;border-radius:${T.r};font-weight:700;text-decoration:none}
.${k} .b2{border:1px solid ${T.bd};color:${T.txt};padding:12px 22px;border-radius:${T.r};font-weight:600;text-decoration:none}
.${k} .art{aspect-ratio:4/3;border-radius:${T.r};background:linear-gradient(135deg,${T.acc},color-mix(in srgb,${T.acc} 25%,${T.sur}));box-shadow:0 30px 60px rgba(0,0,0,.18)}
@media(max-width:760px){.${k}{grid-template-columns:1fr;padding:44px 20px}}`;
    const html = `<section class="${k}"><div><h1>${esc(head(p))}</h1><p>${esc(sub(p))}</p><div class="acts"><a class="b1" href="${esc(href(b[0].h))}">${esc(b[0].t)}</a>${b[1] ? `<a class="b2" href="${esc(href(b[1].h))}">${esc(b[1].t)}</a>` : ''}</div></div><div class="art" role="img" aria-label=""></div></section>`;
    return { html, css };
  } },
  { id: 'hero-center', group: 'Hero', name: 'Centered glow hero', build(p, k) {
    const b = btns(p);
    const css = `${BASE(k)}.${k}{text-align:center;padding:96px 24px;position:relative;overflow:hidden;background:radial-gradient(60% 50% at 50% 0%,color-mix(in srgb,${T.acc} 22%,transparent),transparent 70%)}
.${k} .tag{display:inline-block;padding:6px 14px;border-radius:999px;background:color-mix(in srgb,${T.acc} 14%,transparent);color:${T.acc};font-weight:600;font-size:.85rem;margin-bottom:18px}
.${k} h1{font-size:clamp(2.2rem,6vw,4rem);line-height:1.04;letter-spacing:-.03em;margin:0 auto .4em;max-width:16ch}
.${k} p{font-size:1.2rem;color:${T.mut};max-width:40ch;margin:0 auto 1.8em;line-height:1.6}
.${k} .acts{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.${k} .b1{background:${T.acc};color:${T.on};padding:14px 28px;border-radius:${T.r};font-weight:700;text-decoration:none;box-shadow:0 12px 30px color-mix(in srgb,${T.acc} 40%,transparent)}
.${k} .b2{border:1px solid ${T.bd};color:${T.txt};padding:13px 26px;border-radius:${T.r};font-weight:600;text-decoration:none}`;
    const html = `<section class="${k}"><span class="tag">${esc(first(p.headings?.[1], 'New'))}</span><h1>${esc(head(p))}</h1><p>${esc(sub(p))}</p><div class="acts"><a class="b1" href="${esc(href(b[0].h))}">${esc(b[0].t)}</a>${b[1] ? `<a class="b2" href="${esc(href(b[1].h))}">${esc(b[1].t)}</a>` : ''}</div></section>`;
    return { html, css };
  } },
  { id: 'hero-stats', group: 'Hero', name: 'Hero with stats', build(p, k) {
    const b = btns(p); const f = feats(p).slice(0, 3);
    const css = `${BASE(k)}.${k}{padding:72px 28px;text-align:center}
.${k} h1{font-size:clamp(2rem,5vw,3.2rem);letter-spacing:-.02em;margin:0 auto .35em;max-width:18ch;line-height:1.08}
.${k} p{color:${T.mut};font-size:1.1rem;max-width:40ch;margin:0 auto 1.4em}
.${k} .b1{display:inline-block;background:${T.acc};color:${T.on};padding:13px 26px;border-radius:${T.r};font-weight:700;text-decoration:none}
.${k} .stats{display:flex;gap:40px;justify-content:center;flex-wrap:wrap;margin-top:44px}
.${k} .stats b{display:block;font-size:2rem;letter-spacing:-.02em}.${k} .stats span{color:${T.mut};font-size:.9rem}`;
    const S = [['10k+', 'teams'], ['99.9%', 'uptime'], ['24/7', 'support']];
    const html = `<section class="${k}"><h1>${esc(head(p))}</h1><p>${esc(sub(p))}</p><a class="b1" href="${esc(href(b[0].h))}">${esc(b[0].t)}</a><div class="stats">${S.map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div></section>`;
    return { html, css };
  } },
  // -------------------------------- Features --------------------------------
  { id: 'bento', group: 'Features', name: 'Bento grid', build(p, k) {
    const f = feats(p); while (f.length < 4) f.push({ t: 'Feature', d: '' });
    const css = `${BASE(k)}.${k}{padding:56px 28px}.${k} h2{font-size:clamp(1.6rem,3.5vw,2.4rem);letter-spacing:-.02em;margin:0 0 28px;text-align:center}
.${k} .grid{display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:150px;gap:16px}
.${k} .cell{background:${T.sur};border:1px solid ${T.bd};border-radius:${T.r};padding:22px;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;position:relative}
.${k} .cell:nth-child(1){grid-column:span 2;grid-row:span 2;background:linear-gradient(135deg,color-mix(in srgb,${T.acc} 16%,${T.sur}),${T.sur})}
.${k} .cell:nth-child(4){grid-column:span 2}
.${k} .cell b{font-size:1.1rem}.${k} .cell span{color:${T.mut};font-size:.9rem;margin-top:4px}
.${k} .dot{width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,${T.acc} 20%,transparent);position:absolute;top:18px;left:18px}
@media(max-width:700px){.${k} .grid{grid-template-columns:1fr 1fr}.${k} .cell:nth-child(1),.${k} .cell:nth-child(4){grid-column:span 2}}`;
    const html = `<section class="${k}"><h2>${esc(first(p.headings?.[0], 'Everything you need'))}</h2><div class="grid">${f.slice(0, 5).map((x) => `<div class="cell"><span class="dot"></span><b>${esc(x.t)}</b>${x.d ? `<span>${esc(x.d)}</span>` : ''}</div>`).join('')}</div></section>`;
    return { html, css };
  } },
  { id: 'features-3', group: 'Features', name: 'Feature grid', build(p, k) {
    const f = feats(p);
    const css = `${BASE(k)}.${k}{padding:56px 28px}.${k} h2{font-size:clamp(1.6rem,3.5vw,2.4rem);text-align:center;letter-spacing:-.02em;margin:0 0 36px}
.${k} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}
.${k} .card{background:${T.sur};border:1px solid ${T.bd};border-radius:${T.r};padding:26px}
.${k} .ic{width:44px;height:44px;border-radius:12px;background:color-mix(in srgb,${T.acc} 16%,transparent);display:flex;align-items:center;justify-content:center;margin-bottom:16px;color:${T.acc};font-weight:800}
.${k} .card b{font-size:1.1rem;display:block;margin-bottom:6px}.${k} .card p{color:${T.mut};margin:0;line-height:1.55}`;
    const html = `<section class="${k}"><h2>${esc(first(p.headings?.[0], 'Built for teams'))}</h2><div class="grid">${f.map((x, i) => `<div class="card"><div class="ic">${i + 1}</div><b>${esc(x.t)}</b><p>${esc(x.d || 'A short line about what this does for you.')}</p></div>`).join('')}</div></section>`;
    return { html, css };
  } },
  { id: 'stats-band', group: 'Features', name: 'Stats band', build(p, k) {
    const nums = (p.paras || []).filter((x) => /\d/.test(x)).slice(0, 4); const S = (nums.length ? nums : ['10k+', '99.9%', '4.9/5', '24/7']).map((n, i) => ({ n, l: (feats(p)[i]?.t) || ['customers', 'uptime', 'rating', 'support'][i] }));
    const css = `${BASE(k)}.${k}{padding:48px 28px;background:${T.sur};border-block:1px solid ${T.bd}}
.${k} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:24px;text-align:center}
.${k} b{display:block;font-size:2.4rem;letter-spacing:-.02em;color:${T.acc}}.${k} span{color:${T.mut};font-size:.9rem}`;
    const html = `<section class="${k}"><div class="grid">${S.map((x) => `<div><b>${esc(x.n)}</b><span>${esc(x.l)}</span></div>`).join('')}</div></section>`;
    return { html, css };
  } },
  // ------------------------------ Social proof ------------------------------
  { id: 'testimonial', group: 'Social proof', name: 'Testimonial', build(p, k) {
    const quote = first(p.paras?.[0], p.sub, 'This completely changed how our team ships. We moved twice as fast within a week.');
    const css = `${BASE(k)}.${k}{padding:64px 28px;display:flex;justify-content:center}
.${k} figure{max-width:760px;margin:0;text-align:center}
.${k} blockquote{font-size:clamp(1.4rem,3vw,2rem);line-height:1.4;letter-spacing:-.01em;margin:0 0 24px;font-weight:500}
.${k} .who{display:flex;gap:12px;align-items:center;justify-content:center}
.${k} .av{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,${T.acc},color-mix(in srgb,${T.acc} 30%,${T.sur}))}
.${k} .who b{display:block}.${k} .who span{color:${T.mut};font-size:.9rem}`;
    const who = first(p.brand, 'A happy customer');
    const html = `<section class="${k}"><figure><blockquote>“${esc(quote)}”</blockquote><div class="who"><div class="av"></div><div style="text-align:left"><b>${esc(who)}</b><span>Verified customer</span></div></div></figure></section>`;
    return { html, css };
  } },
  { id: 'logos', group: 'Social proof', name: 'Logo cloud', build(p, k) {
    const names = (p.items?.length ? p.items.map((x) => x.t) : ['Acme', 'Globex', 'Umbra', 'Soylent', 'Initech', 'Hooli']).slice(0, 6);
    const css = `${BASE(k)}.${k}{padding:44px 28px;text-align:center}
.${k} p{color:${T.mut};font-size:.85rem;letter-spacing:.08em;text-transform:uppercase;margin:0 0 22px}
.${k} .row{display:flex;gap:36px;flex-wrap:wrap;justify-content:center;align-items:center}
.${k} .row b{font-size:1.3rem;font-weight:800;opacity:.55;letter-spacing:-.02em}`;
    const html = `<section class="${k}"><p>Trusted by teams everywhere</p><div class="row">${names.map((n) => `<b>${esc(n)}</b>`).join('')}</div></section>`;
    return { html, css };
  } },
  // -------------------------------- Pricing ---------------------------------
  { id: 'pricing-3', group: 'Pricing', name: 'Pricing (3 tiers)', build(p, k) {
    const names = (p.headings || []).slice(1, 4); const prices = (p.paras || []).filter((x) => /\$|\d/.test(x)).slice(0, 3);
    const plans = [0, 1, 2].map((i) => ({ name: names[i] || ['Starter', 'Pro', 'Team'][i], price: prices[i] || ['$9', '$29', '$79'][i], feats: feats(p).map((f) => f.t).slice(0, 4) }));
    const css = `${BASE(k)}.${k}{padding:56px 28px}.${k} h2{text-align:center;font-size:clamp(1.6rem,3.5vw,2.4rem);letter-spacing:-.02em;margin:0 0 36px}
.${k} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px;align-items:start}
.${k} .pl{background:${T.sur};border:1px solid ${T.bd};border-radius:${T.r};padding:28px}
.${k} .pl:nth-child(2){border:2px solid ${T.acc};box-shadow:0 20px 50px color-mix(in srgb,${T.acc} 18%,transparent)}
.${k} .pl h3{margin:0;color:${T.mut};font-size:1rem}.${k} .pr{font-size:2.6rem;font-weight:800;letter-spacing:-.02em;margin:.1em 0 .5em}
.${k} ul{list-style:none;padding:0;margin:0 0 20px;display:grid;gap:10px}.${k} li{color:${T.mut}}.${k} li::before{content:"✓";color:${T.acc};font-weight:800;margin-right:8px}
.${k} a{display:block;text-align:center;background:${T.acc};color:${T.on};padding:12px;border-radius:${T.r};text-decoration:none;font-weight:700}`;
    const html = `<section class="${k}"><h2>${esc(first(p.headings?.[0], 'Simple pricing'))}</h2><div class="grid">${plans.map((pl) => `<div class="pl"><h3>${esc(pl.name)}</h3><div class="pr">${esc(pl.price)}</div><ul>${pl.feats.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><a href="#">Choose ${esc(pl.name)}</a></div>`).join('')}</div></section>`;
    return { html, css };
  } },
  // ---------------------------------- CTA -----------------------------------
  { id: 'cta-band', group: 'Call to action', name: 'CTA band', build(p, k) {
    const b = btns(p);
    const css = `${BASE(k)}.${k}{padding:28px}.${k} .in{background:linear-gradient(120deg,${T.acc},color-mix(in srgb,${T.acc} 40%,#000));color:${T.on};border-radius:calc(${T.r} + 6px);padding:48px 40px;text-align:center}
.${k} h2{font-size:clamp(1.6rem,4vw,2.6rem);margin:0 0 .3em;letter-spacing:-.02em;color:${T.on}}
.${k} p{opacity:.9;margin:0 0 1.4em;font-size:1.1rem}
.${k} a{display:inline-block;background:${T.on};color:${T.acc};padding:13px 28px;border-radius:${T.r};font-weight:700;text-decoration:none}`;
    const html = `<section class="${k}"><div class="in"><h2>${esc(first(p.headings?.[0], p.title, 'Ready to get started?'))}</h2><p>${esc(sub(p))}</p><a href="${esc(href(b[0].h))}">${esc(b[0].t)}</a></div></section>`;
    return { html, css };
  } },
  { id: 'newsletter', group: 'Call to action', name: 'Newsletter', build(p, k) {
    const css = `${BASE(k)}.${k}{padding:56px 28px;text-align:center;background:${T.sur};border-block:1px solid ${T.bd}}
.${k} h2{font-size:clamp(1.5rem,3.2vw,2.2rem);letter-spacing:-.02em;margin:0 0 .3em}.${k} p{color:${T.mut};margin:0 0 1.4em}
.${k} .nl{display:flex;gap:10px;max-width:440px;margin:0 auto;flex-wrap:wrap}
.${k} input{flex:1;min-width:180px;padding:13px 16px;border:1px solid ${T.bd};border-radius:${T.r};background:var(--dx-bg,#fff);color:${T.txt}}
.${k} button{background:${T.acc};color:${T.on};border:0;padding:13px 24px;border-radius:${T.r};font-weight:700;cursor:pointer}`;
    const html = `<section class="${k}"><h2>${esc(first(p.headings?.[0], 'Stay in the loop'))}</h2><p>${esc(sub(p))}</p><div class="nl"><input type="email" placeholder="you@example.com" aria-label="Email"><button type="button">Subscribe</button></div></section>`;
    return { html, css };
  } },
  // -------------------------------- Content ---------------------------------
  { id: 'faq', group: 'Content', name: 'FAQ accordion', build(p, k) {
    const qs = feats(p).map((f) => f.t); while (qs.length < 3) qs.push('Frequently asked question');
    const css = `${BASE(k)}.${k}{padding:56px 28px;max-width:760px;margin:0 auto}.${k} h2{text-align:center;font-size:clamp(1.6rem,3.5vw,2.4rem);letter-spacing:-.02em;margin:0 0 28px}
.${k} details{border:1px solid ${T.bd};border-radius:${T.r};padding:4px 18px;margin-bottom:10px;background:${T.sur}}
.${k} summary{padding:14px 0;font-weight:600;cursor:pointer;list-style:none;display:flex;justify-content:space-between}
.${k} summary::after{content:"+";color:${T.acc};font-weight:800}.${k} details[open] summary::after{content:"–"}
.${k} p{color:${T.mut};margin:0 0 14px;line-height:1.6}`;
    const html = `<section class="${k}"><h2>Questions & answers</h2>${qs.slice(0, 5).map((q, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc((p.paras || [])[i + 1] || 'A clear, helpful answer goes here so visitors know exactly what to expect.')}</p></details>`).join('')}</section>`;
    return { html, css };
  } },
  { id: 'steps', group: 'Content', name: 'Steps / how it works', build(p, k) {
    const s = feats(p).slice(0, 4); while (s.length < 3) s.push({ t: 'Step', d: '' });
    const css = `${BASE(k)}.${k}{padding:56px 28px}.${k} h2{text-align:center;font-size:clamp(1.6rem,3.5vw,2.4rem);letter-spacing:-.02em;margin:0 0 36px}
.${k} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px}
.${k} .step .n{width:40px;height:40px;border-radius:50%;background:${T.acc};color:${T.on};display:flex;align-items:center;justify-content:center;font-weight:800;margin-bottom:14px}
.${k} .step b{display:block;font-size:1.05rem;margin-bottom:4px}.${k} .step p{color:${T.mut};margin:0;line-height:1.55}`;
    const html = `<section class="${k}"><h2>${esc(first(p.headings?.[0], 'How it works'))}</h2><div class="grid">${s.map((x, i) => `<div class="step"><div class="n">${i + 1}</div><b>${esc(x.t)}</b><p>${esc(x.d || 'A short description of this step.')}</p></div>`).join('')}</div></section>`;
    return { html, css };
  } },
  // ------------------------------ Nav / Footer ------------------------------
  { id: 'navbar', group: 'Navigation', name: 'Navbar', build(p, k) {
    const items = (p.links?.length ? p.links : SAMPLE.links).slice(0, 5); const b = btns(p)[0];
    const css = `${BASE(k)}.${k}{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;background:${T.sur};border-bottom:1px solid ${T.bd}}
.${k} .brand{font-weight:800;font-size:1.15rem;letter-spacing:-.01em;text-decoration:none;color:${T.txt}}
.${k} ul{display:flex;gap:24px;list-style:none;margin:0;padding:0}.${k} a{color:${T.mut};text-decoration:none;font-weight:500}.${k} a:hover{color:${T.txt}}
.${k} .cta{background:${T.acc};color:${T.on};padding:9px 18px;border-radius:${T.r};font-weight:600}
@media(max-width:620px){.${k} ul{display:none}}`;
    const html = `<nav class="${k}"><a class="brand" href="/">${esc(first(p.brand, 'Brand'))}</a><ul>${items.map((x) => `<li><a href="${esc(href(x.h))}">${esc(x.t)}</a></li>`).join('')}</ul><a class="cta" href="${esc(href(b.h))}">${esc(b.t)}</a></nav>`;
    return { html, css };
  } },
  { id: 'footer-cols', group: 'Navigation', name: 'Footer (columns)', build(p, k) {
    const links = (p.links?.length ? p.links : SAMPLE.links); const cols = [links.slice(0, 3), links.slice(3, 6).length ? links.slice(3, 6) : SAMPLE.links.slice(0, 3)];
    const css = `${BASE(k)}.${k}{padding:48px 28px 28px;background:${T.sur};border-top:1px solid ${T.bd}}
.${k} .top{display:grid;grid-template-columns:2fr 1fr 1fr;gap:28px}
.${k} .brand{font-weight:800;font-size:1.2rem}.${k} .brand+p{color:${T.mut};max-width:30ch;margin:8px 0 0}
.${k} h4{font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:${T.mut};margin:0 0 12px}
.${k} ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}.${k} a{color:${T.mut};text-decoration:none}.${k} a:hover{color:${T.txt}}
.${k} .bottom{border-top:1px solid ${T.bd};margin-top:28px;padding-top:18px;color:${T.mut};font-size:.85rem}
@media(max-width:620px){.${k} .top{grid-template-columns:1fr}}`;
    const html = `<footer class="${k}"><div class="top"><div><div class="brand">${esc(first(p.brand, 'Brand'))}</div><p>${esc(sub(p))}</p></div>${cols.map((c) => `<div><h4>Links</h4><ul>${c.map((x) => `<li><a href="${esc(href(x.h))}">${esc(x.t)}</a></li>`).join('')}</ul></div>`).join('')}</div><div class="bottom">${esc(first(p.copy, '© 2026 Brand, Inc.'))}</div></footer>`;
    return { html, css };
  } },
];

export const BLOCK_GROUPS = [...new Set(BLOCKS.map((b) => b.group))];

/** A standalone doc to preview one block inside the active Look's tokens. */
export function blockPreviewDoc(design, tokens = '') {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${tokens}}*{box-sizing:border-box}body{margin:0;background:var(--dx-bg,#f6f8fb);font-family:system-ui,sans-serif}${design.css}</style>${design.html}`;
}
