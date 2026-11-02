// Run: node test/e2e/pwa.e2e.cjs [baseUrl]  (needs playwright-core + a Chrome; set PW and CHROME to override)
const { chromium } = require(process.env.PW || 'playwright-core');
const base = process.argv[2] || 'http://localhost:4190';
let fails = 0; const ok = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const apiHits = []; p.on('request', (r) => /\/api\//.test(r.url()) && apiHits.push(r.url()));
  await p.goto(base + '/'); await p.waitForTimeout(1500);
  const head = await p.evaluate(() => ({ man: !!document.querySelector('link[rel=manifest]'), cap: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content, st: document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]')?.content, ico: document.querySelector('link[rel=apple-touch-icon]')?.href, splash: document.querySelectorAll('link[rel=apple-touch-startup-image]').length }));
  ok('head tags', head.man && head.cap === 'yes' && head.st === 'black-translucent' && /icon-180/.test(head.ico) && head.splash === 8, JSON.stringify(head));
  const man = await (await p.request.get(base + '/manifest.webmanifest')).json();
  ok('manifest', man.display === 'standalone' && man.icons.length === 3 && man.scope === '/', JSON.stringify(man).slice(0, 80));
  for (const i of man.icons) { const r = await p.request.get(base + i.src); ok('icon ' + i.src, r.ok() && /png/.test(r.headers()['content-type'])); }
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 8000 }).catch(() => {});
  ok('sw controls page', await p.evaluate(() => !!navigator.serviceWorker.controller));
  const keys = await p.evaluate(async () => { const o = {}; for (const k of await caches.keys()) { const c = await caches.open(k); o[k] = (await c.keys()).map((r) => new URL(r.url).pathname); } return o; });
  const all = Object.values(keys).flat();
  ok('shell cached', all.includes('/') && all.includes('/js/main.js') && all.includes('/css/pwa.css'), all.length + '');
  ok('no api/jarvis/client cached', !all.some((u) => /^\/(api|jarvis|client)/.test(u)));
  // sign in, then go offline
  const u = await p.$('input[autocomplete=username]');
  if (u) { await u.fill('anan'); await p.fill('input[type=password]', 'Devx@2026'); await p.keyboard.press('Enter'); await p.waitForTimeout(2500); await p.keyboard.press('Escape'); }
  ok('signed in shows dock', await p.isVisible('.dock'));
  const fab = await p.evaluate(() => { const f = document.querySelector('.dc-ai-fab')?.getBoundingClientRect(), d = document.querySelector('.dock')?.getBoundingClientRect(); return f && d ? { overlap: !(f.bottom <= d.top || f.top >= d.bottom || f.right <= d.left || f.left >= d.right) } : null; });
  ok('AI button does not overlap dock', fab && !fab.overlap, JSON.stringify(fab));
  const small = await p.evaluate(() => [...document.querySelectorAll('a.chip, input[type=checkbox]')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 20).length);
  ok('chips/checkboxes tappable', small === 0, small + '');
  await ctx.setOffline(true); await p.waitForTimeout(400);
  ok('offline bar shows', await p.isVisible('#pw-offline'));
  const off = await ctx.newPage(); await off.goto(base + '/'); await off.waitForTimeout(1500);
  ok('shell loads offline', await off.evaluate(() => !!document.querySelector('#app') && document.querySelector('#app').children.length > 0 || document.title === 'DevX Control'));
  ok('offline page title', (await off.title()) === 'DevX Control');
  await off.close(); await ctx.setOffline(false); await p.waitForTimeout(500);
  ok('offline bar hides', !(await p.isVisible('#pw-offline')));
  // keyboard class
  await p.evaluate(() => location.hash = '/connections'); await p.waitForTimeout(1200);
  const inp = await p.$('input[type=text], input[type=password], input:not([type])');
  if (inp) { await inp.focus(); await p.waitForTimeout(200); ok('dock hidden while typing', await p.evaluate(() => document.documentElement.classList.contains('kb-open') && getComputedStyle(document.querySelector('.dock')).display === 'none')); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(200); ok('dock back after typing', await p.isVisible('.dock')); }
  // standalone mode behaviours
  await p.evaluate(() => document.documentElement.classList.add('is-app'));
  ok('user-select off in app mode', await p.evaluate(() => getComputedStyle(document.body).userSelect === 'none' || getComputedStyle(document.body).webkitUserSelect === 'none'));
  // api never cached by SW
  const after = await p.evaluate(async () => (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)))).flat());
  ok('api still not cached after use', !after.some((u2) => u2.startsWith('/api')));
  ok('api was reached (live data)', apiHits.length > 0);
  await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
