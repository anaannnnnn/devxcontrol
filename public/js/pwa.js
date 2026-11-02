// App shell: installs the service worker, shows update / offline / install cues and iPhone-only polish.
const $ = (sel, root = document) => root.querySelector(sel);
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const root = document.documentElement;
const syncMode = () => root.classList.toggle('is-app', standalone());
syncMode(); matchMedia('(display-mode: standalone)').addEventListener?.('change', syncMode);

const bar = (id, cls) => { let e = document.getElementById(id); if (!e) { e = mk('div', `pw-bar ${cls || ''}`); e.id = id; e.setAttribute('role', 'status'); e.hidden = true; document.body.append(e); } return e; };

/* ---- offline cue ---- */
const offline = bar('pw-offline', 'pw-offline');
const syncNet = () => { offline.hidden = navigator.onLine; offline.textContent = 'You are offline. Showing the app only; fleet data returns when you reconnect.'; root.classList.toggle('is-offline', !navigator.onLine); };
addEventListener('online', () => { syncNet(); dispatchEvent(new Event('hashchange')); });
addEventListener('offline', syncNet); syncNet();

/* ---- service worker + update bar ---- */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((reg) => {
    const offer = (worker) => {
      const b = bar('pw-update', 'pw-update'); b.hidden = false;
      b.innerHTML = '<span>New version ready.</span>';
      const go = mk('button', 'pw-btn', 'Reload'); go.type = 'button';
      go.onclick = () => { go.disabled = true; worker.postMessage('SKIP_WAITING'); };
      b.append(go);
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    // iOS never checks while the app sits in memory, so look again whenever it comes to the front.
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded || !hadController) return; reloaded = true; location.reload(); });
}

/* ---- install: Android/desktop prompt, iPhone Add-to-Home-Screen guide ---- */
let deferred = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; offerInstall(); });
addEventListener('appinstalled', () => { deferred = null; $('#pw-install')?.remove(); });
const SNOOZE = 'dc-install-snooze';
function offerInstall(force) {
  if (standalone() || $('#pw-install')) return;
  if (!force && Date.now() < Number(store.get(SNOOZE) || 0)) return;
  if (!deferred && !ios) return;
  const c = mk('div', 'pw-install'); c.id = 'pw-install'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', 'Install DevX Control');
  c.innerHTML = deferred
    ? '<b>Install DevX Control</b><p>Full screen, its own icon, and it opens faster.</p>'
    : '<b>Add DevX Control to your Home Screen</b><p>Tap <span class="pw-share" aria-label="Share"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg></span> in Safari, then <b>Add to Home Screen</b>.</p>';
  const row = mk('div', 'pw-row');
  if (deferred) { const y = mk('button', 'pw-btn', 'Install'); y.type = 'button'; y.onclick = async () => { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; c.remove(); }; row.append(y); }
  const n = mk('button', 'pw-btn pw-ghost', 'Not now'); n.type = 'button'; n.onclick = () => { store.set(SNOOZE, String(Date.now() + 14 * 864e5)); c.remove(); };
  row.append(n); c.append(row); document.body.append(c);
}
if (ios && !standalone()) setTimeout(() => offerInstall(), 4000);
// Account page and menus can call this to show the guide on demand.
window.dcInstall = () => { if (standalone()) return 'installed'; offerInstall(true); return deferred || ios ? 'shown' : 'unsupported'; };

/* ---- app badge: how many things need a look ---- */
const badge = () => {
  if (!navigator.setAppBadge) return;
  const seen = new Set(); let n = 0;
  document.querySelectorAll('.pip[data-pip]:not([hidden])').forEach((p) => { const k = p.dataset.pip; if (seen.has(k)) return; seen.add(k); n += parseInt(p.textContent, 10) || 1; });
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge?.())?.catch?.(() => {});
};
setInterval(badge, 15000); setTimeout(badge, 3000);

/* ---- keyboard: hide the floating dock and AI button while typing ---- */
const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) && !/^(checkbox|radio|button|submit|range)$/.test(e.target.type || '');
document.addEventListener('focusin', (e) => { if (typing(e)) root.classList.add('kb-open'); });
document.addEventListener('focusout', () => setTimeout(() => { if (!typing({ target: document.activeElement })) root.classList.remove('kb-open'); }, 80));

/* ---- pull to refresh (home-screen app only; Safari has its own) ---- */
if (ios || matchMedia('(pointer: coarse)').matches) {
  let y0 = null, pull = 0; const ind = mk('div', 'pw-ptr'); ind.setAttribute('aria-hidden', 'true'); ind.textContent = '↻'; document.body.append(ind);
  const blocked = (t) => t.closest?.('.dc-ai-overlay, .sheet, textarea, pre, .term, canvas, [data-no-ptr]');
  addEventListener('touchstart', (e) => { y0 = standalone() && scrollY <= 0 && e.touches.length === 1 && !blocked(e.target) ? e.touches[0].clientY : null; pull = 0; }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (y0 == null) return; pull = Math.max(0, e.touches[0].clientY - y0);
    if (pull > 8) { const d = Math.min(pull * 0.5, 70); ind.style.transform = `translate(-50%, ${d - 40}px) rotate(${pull * 3}deg)`; ind.style.opacity = String(Math.min(1, pull / 90)); }
  }, { passive: true });
  addEventListener('touchend', () => {
    if (y0 != null && pull > 100) { ind.classList.add('spin'); dispatchEvent(new Event('hashchange')); setTimeout(() => ind.classList.remove('spin'), 700); }
    ind.style.transform = ''; ind.style.opacity = '0'; y0 = null; pull = 0;
  }, { passive: true });
}

/* ---- iOS: stop the pinch-zoom gesture that breaks the layout, keep text zoom in settings ---- */
if (ios) for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
