// Visual-editor plumbing: fetch an app's own pages through the Control server, rewrite them so they load inside a sandboxed
// frame, and inject the small editor script. The upstream always comes from the registry (never from the request), the path is
// strictly checked, and access uses a short-lived signed link, because a sandboxed frame cannot send the login cookie.
import crypto from 'node:crypto';

const TTL = 20 * 60 * 1000;
const PATH_OK = /^\/[A-Za-z0-9._~%!$&'()*+,;=:@/-]{0,300}$/;
export const pathOk = (p) => p === '/' || (PATH_OK.test(p) && !p.includes('//') && !p.split('/').some((s) => s === '..' || s === '.'));

export const sign = (secret, appId, exp) => crypto.createHmac('sha256', secret).update(`preview|${appId}|${exp}`).digest('base64url').slice(0, 32);
export const mint = (secret, appId, now = Date.now()) => { const exp = now + TTL; return `${exp.toString(36)}-${sign(secret, appId, exp)}`; };
export function verify(secret, appId, token, now = Date.now()) {
  const m = /^([a-z0-9]{6,12})-([A-Za-z0-9_-]{32})$/.exec(String(token || '')); if (!m) return false;
  const exp = parseInt(m[1], 36); if (!(exp > now)) return false;
  const want = Buffer.from(sign(secret, appId, exp)), got = Buffer.from(m[2]); return want.length === got.length && crypto.timingSafeEqual(want, got);
}

export const upstreamOf = (app) => { const c = app.containers?.[0]; if (c && app.port) return `http://${c}:${app.port}`; const u = app.urls?.[0]?.url; return u ? u.replace(/\/+$/, '') : null; };

// ---- Runs first in every proxied page (before the app's own scripts). Makes the app believe it lives at its real address:
// the URL is rewritten to the real path (so single-page-app routers see "/menu", not "/preview/..."), and every request the
// app makes to a root-relative address is sent back through the preview prefix. ----
export const shimJs = (base, real) => `(function(){var B=${JSON.stringify(base)};
try{history.replaceState(history.state,'',${JSON.stringify(real)})}catch(e){}
function fix(u){if(typeof u!=='string')return u;if(u.charAt(0)==='/'&&u.charAt(1)!=='/'&&u.indexOf(B+'/')!==0&&u!==B)return B+u;if(/^https?:\\/\\//i.test(u)){try{var x=new URL(u);if(x.origin===location.origin&&x.pathname.indexOf(B+'/')!==0&&x.pathname!==B)return B+x.pathname+x.search+x.hash}catch(e){}}return u}
var of=window.fetch;if(of)window.fetch=function(i,o){try{if(typeof i==='string')i=fix(i);else if(i&&i.url&&typeof Request!=='undefined'&&i instanceof Request){var f=fix(i.url);if(f!==i.url)i=new Request(f,i)}else if(i instanceof URL)i=fix(i.href)}catch(e){}return of.call(this,i,o)};
var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var a=[].slice.call(arguments);try{a[1]=fix(String(u))}catch(e){}return xo.apply(this,a)};
if(window.EventSource){var E=window.EventSource;window.EventSource=function(u,o){return new E(fix(String(u)),o)};window.EventSource.prototype=E.prototype}
[[HTMLImageElement,'src'],[HTMLScriptElement,'src'],[HTMLLinkElement,'href'],[HTMLSourceElement,'src'],[HTMLIFrameElement,'src'],[HTMLAnchorElement,'href'],[HTMLFormElement,'action'],[HTMLMediaElement,'src']].forEach(function(p){try{var d=Object.getOwnPropertyDescriptor(p[0].prototype,p[1]);if(d&&d.set)Object.defineProperty(p[0].prototype,p[1],{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){d.set.call(this,fix(String(v)))}})}catch(e){}});
var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if(/^(src|href|action|poster)$/i.test(n)&&typeof v==='string')v=fix(v);return sa.call(this,n,v)};
document.addEventListener('click',function(ev){if(ev.defaultPrevented||ev.button||ev.metaKey||ev.ctrlKey||ev.shiftKey)return;var a=ev.target&&ev.target.closest&&ev.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href');if(!h)return;
if(h.charAt(0)==='#'){ev.preventDefault();try{var t=document.getElementById(decodeURIComponent(h.slice(1)));if(t)t.scrollIntoView()}catch(e){}return}
if(a.target&&a.target!=='_self'){ev.preventDefault();return}
if(/^(mailto|tel|javascript):/i.test(h)){ev.preventDefault();return}
try{var u=new URL(a.href,location.href);if(u.origin!==location.origin){ev.preventDefault();return}if(u.pathname.indexOf(B+'/')!==0&&u.pathname!==B){ev.preventDefault();location.href=B+u.pathname+u.search+u.hash}}catch(e){}},false);
})();`;

// ---- The visual-editor script: selection, live edits, live CSS, live HTML. Talks to the panel with postMessage only. ----
export const EDITOR_JS = `(function(){
var PROPS=['color','background-color','border-color','font-size','line-height','letter-spacing','font-weight','text-align','border-radius','padding','margin','gap','width','max-width','opacity','font-style','text-decoration','text-transform','box-shadow','border-width','border-style','display'];
var on=false,cur=null,st=document.createElement('style');
st.textContent='[data-dx-hover]{outline:2px dashed #9b7bff !important;outline-offset:2px !important;cursor:crosshair !important}[data-dx-sel]{outline:2px solid #ff4d8d !important;outline-offset:2px !important}';
document.documentElement.appendChild(st);
function esc(s){return (window.CSS&&CSS.escape)?CSS.escape(s):String(s).replace(/[^a-zA-Z0-9_-]/g,'\\\\$&')}
function part(e){var t=e.tagName.toLowerCase();if(e.id&&document.querySelectorAll('#'+esc(e.id)).length===1)return '#'+esc(e.id);var c=[].filter.call(e.classList,function(x){return !/^dx-|^\\d|[:\\/\\[\\]]/.test(x)}).slice(0,2).map(function(x){return '.'+esc(x)}).join('');var p=e.parentElement;if(p){var same=[].filter.call(p.children,function(s){return s.tagName===e.tagName});if(same.length>1)return t+c+':nth-of-type('+(same.indexOf(e)+1)+')'}return t+c}
function sel(e){var parts=[],n=e;while(n&&n.nodeType===1&&n!==document.documentElement){var p=part(n);parts.unshift(p);var s=parts.join(' > ');if(p.charAt(0)==='#'||document.querySelectorAll(s).length===1){return s}n=n.parentElement;if(parts.length>5)break}return parts.join(' > ')}
function kind(e){var t=e.tagName.toLowerCase(),r=(e.getAttribute('role')||'').toLowerCase(),c=(String(e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className)+' '+(e.id||'')).toLowerCase();
if(t==='nav'||r==='navigation'||/\\bnav(bar)?\\b|navigation|menubar/.test(c))return 'nav';if(t==='header'||/\\bheader\\b|topbar/.test(c))return 'header';if(t==='footer'||/\\bfooter\\b/.test(c))return 'footer';
if(t==='table'||r==='table'||r==='grid'||/^(tr|td|th|thead|tbody|tfoot|caption)$/.test(t))return 'table';if(t==='button'||r==='button'||/\\bbtn\\b|\\bbutton\\b/.test(c))return 'button';if(t==='a'&&/\\bbtn\\b|\\bbutton\\b/.test(c))return 'button';
if(t==='form'||/\\bform\\b/.test(c))return 'form';if(t==='input'||t==='select'||t==='textarea')return 'input';if(/^h[1-6]$/.test(t))return 'heading';if(t==='img'||t==='picture'||t==='svg')return 'image';
if(t==='ul'||t==='ol'||r==='list')return 'list';if(/\\bhero\\b|\\bbanner\\b|jumbotron/.test(c))return 'hero';if(/\\bcard\\b|\\btile\\b|\\bpanel\\b/.test(c)||t==='article')return 'card';if(/\\bmodal\\b|dialog/.test(c)||t==='dialog')return 'modal';
if(/\\balert\\b|\\bnotice\\b|\\btoast\\b/.test(c))return 'alert';if(/\\btabs?\\b/.test(c))return 'tabs';if(/pricing|\\bplan\\b/.test(c))return 'pricing';if(/\\bbadge\\b|\\bchip\\b|\\btag\\b/.test(c))return 'badge';if(t==='section'||t==='main'||t==='aside'||t==='div')return 'section';if(t==='p'||t==='span'||t==='a'||t==='li'||t==='label')return 'text';return 'section'}
function info(e){var cs=getComputedStyle(e),o={};PROPS.forEach(function(p){o[p]=cs.getPropertyValue(p)});var leaf=!e.children.length;var r=e.getBoundingClientRect();var comp=null,n=e,i=0;while(n&&n.nodeType===1&&i<7&&n!==document.body){var kk=kind(n);if(kk!=='section'&&kk!=='text'&&kk!=='heading'&&kk!=='image'&&kk!=='input'){if(kk==='table'&&n.tagName!=='TABLE'){var tb=n.closest('table');if(tb)n=tb}comp={selector:sel(n),kind:kk,tag:n.tagName.toLowerCase(),html:n.outerHTML.slice(0,8000)};break}n=n.parentElement;i++}return {dx:'select',comp:comp,selector:sel(e),tag:e.tagName.toLowerCase(),kind:kind(e),text:leaf?e.textContent.slice(0,500):null,styles:o,html:e.outerHTML.slice(0,6000),size:{w:Math.round(r.width),h:Math.round(r.height)},classes:String(e.getAttribute('class')||'').slice(0,300)}}
function clear(){document.querySelectorAll('[data-dx-hover]').forEach(function(x){x.removeAttribute('data-dx-hover')})}
document.addEventListener('mouseover',function(ev){if(!on)return;clear();if(ev.target!==document.body&&ev.target!==document.documentElement)ev.target.setAttribute('data-dx-hover','')},true);
document.addEventListener('mouseout',clear,true);
['click','submit','mousedown','mouseup','pointerdown','touchstart'].forEach(function(t){document.addEventListener(t,function(ev){if(!on)return;ev.preventDefault();ev.stopPropagation()},true)});
document.addEventListener('click',function(ev){if(!on)return;var e=ev.target;if(e===document.documentElement)return;if(cur)cur.removeAttribute('data-dx-sel');cur=e;e.setAttribute('data-dx-sel','');clear();parent.postMessage(info(e),'*')},true);
var undo={};
function q(s){try{return document.querySelectorAll(s)}catch(e){return []}}
window.addEventListener('message',function(ev){if(ev.source!==parent)return;var m=ev.data||{};
if(m.dx==='mode'){on=!!m.on;if(!on){clear();if(cur){cur.removeAttribute('data-dx-sel');cur=null}}}
if(m.dx==='apply'&&typeof m.selector==='string'){q(m.selector).forEach(function(el){if(m.props)Object.keys(m.props).forEach(function(k){el.style.setProperty(k,m.props[k],'important')});if(typeof m.text==='string')el.textContent=m.text})}
if(m.dx==='undo'&&typeof m.selector==='string'){q(m.selector).forEach(function(el){(m.props||[]).forEach(function(k){el.style.removeProperty(k)});if(typeof m.text==='string')el.textContent=m.text})}
if(m.dx==='find'&&typeof m.selector==='string'){var f=q(m.selector)[0];if(f){if(cur)cur.removeAttribute('data-dx-sel');cur=f;f.setAttribute('data-dx-sel','');f.scrollIntoView({block:'center'})}}
if(m.dx==='css'&&typeof m.id==='string'){var s=document.getElementById('dx-css-'+m.id);if(!s){s=document.createElement('style');s.id='dx-css-'+m.id;document.head.appendChild(s)}s.textContent=String(m.css||'')}
if(m.dx==='links'){var l=document.getElementById('dx-link-'+m.id);if(m.href){if(!l){l=document.createElement('link');l.id='dx-link-'+m.id;l.rel='stylesheet';document.head.appendChild(l)}l.href=m.href}else if(l)l.remove()}
if(m.dx==='js'&&typeof m.code==='string'&&m.code.length<60000){try{(new Function(m.code))()}catch(e){}}
if(m.dx==='uncss'&&typeof m.id==='string'){var u=document.getElementById('dx-css-'+m.id);if(u)u.remove()}
if(m.dx==='html'&&typeof m.selector==='string'&&typeof m.html==='string'){var t=q(m.selector)[0];if(t){var key=m.selector;if(!undo[key])undo[key]=t.outerHTML;var d=document.createElement('div');d.innerHTML=m.html;var n=d.firstElementChild;if(n){t.replaceWith(n);if(m.selectNew!==false){n.setAttribute('data-dx-sel','');cur=n;parent.postMessage(info(n),'*')}}}}
if(m.dx==='insert'&&typeof m.selector==='string'&&typeof m.html==='string'){var tt=q(m.selector)[0];if(tt){var dd=document.createElement('div');dd.innerHTML=m.html;var nn=dd.firstElementChild;if(nn){if(m.where==='before')tt.before(nn);else if(m.where==='inside')tt.append(nn);else tt.after(nn);nn.scrollIntoView({block:'center'})}}}
if(m.dx==='js'&&typeof m.code==='string'){try{(0,eval)(m.code)}catch(e){}}
});
function links(){var s={};[].forEach.call(document.querySelectorAll('a[href]'),function(a){try{var u=new URL(a.href,location.href);if(u.origin===location.origin&&!/\\.(png|jpe?g|gif|svg|webp|pdf|zip|css|js)$/i.test(u.pathname))s[u.pathname]=1}catch(e){}});return Object.keys(s).slice(0,80)}
var tmr=0;function nav(){clearTimeout(tmr);tmr=setTimeout(function(){parent.postMessage({dx:'nav',path:location.pathname+location.search,title:document.title,links:links()},'*')},250)}
['pushState','replaceState'].forEach(function(k){var o=history[k];history[k]=function(){var r=o.apply(this,arguments);nav();setTimeout(nav,900);return r}});
addEventListener('popstate',nav);addEventListener('hashchange',nav);addEventListener('load',function(){nav();setTimeout(nav,1200)});
if(window.MutationObserver){var mo=new MutationObserver(function(){nav()});var go=function(){mo.observe(document.body,{childList:true,subtree:true})};if(document.body)go();else addEventListener('DOMContentLoaded',go)}
parent.postMessage({dx:'ready',title:document.title,path:location.pathname+location.search},'*');
})();`;

const scriptTag = (js) => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`;
/** Make an upstream page load through /preview/<id>/<token>/ with the shim first and the editor last. */
export function rewriteHtml(html, base, { editor = true, real = '/' } = {}) {
  let out = String(html)
    .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<([a-z][a-z0-9-]*)(\s[^>]*)>/gi, (tag, name, attrs) => (/^(a|area)$/i.test(name) ? tag : tag.replace(/\b(src|href|action|poster)=("|')\/(?!\/)/gi, (_, a, q) => `${a}=${q}${base}/`)))
    .replace(/\burl\((["']?)\/(?!\/)/gi, (_, q) => `url(${q}${base}/`)
    .replace(/\bsrcset=("|')([^"']*)\1/gi, (_, q, v) => `srcset=${q}${v.replace(/(^|,\s*)\/(?!\/)/g, (m, p) => `${p}${base}/`)}${q}`);
  // relative addresses keep resolving against the real page location even after the shim rewrites the visible URL
  const dir = real.split('?')[0].replace(/[^/]*$/, '');
  const head = `<base href="${base}${dir}">${scriptTag(shimJs(base, real))}`;
  out = /<head\b[^>]*>/i.test(out) ? out.replace(/<head\b[^>]*>/i, (m) => `${m}${head}`) : /<html\b[^>]*>/i.test(out) ? out.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${head}</head>`) : `${head}${out}`;
  if (editor) { const tag = scriptTag(EDITOR_JS); out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${tag}</body>`) : out + tag; }
  return out;
}
export const rewriteCss = (css, base) => String(css).replace(/\burl\((["']?)\/(?!\/)/gi, (_, q) => `url(${q}${base}/`).replace(/@import\s+(["'])\/(?!\/)/gi, (_, q) => `@import ${q}${base}/`);

// ---- per-link cookie jar: lets an app's own login work inside the preview, since the sandboxed frame cannot hold cookies ----
const jars = new Map();
export function jarGet(tok) { const j = jars.get(tok); if (!j) return ''; if (j.exp < Date.now()) { jars.delete(tok); return ''; } return [...j.c].map(([k, v]) => `${k}=${v}`).join('; '); }
export function jarSet(tok, setCookies) {
  if (!setCookies?.length) return; let j = jars.get(tok); if (!j) { if (jars.size > 200) jars.delete(jars.keys().next().value); j = { c: new Map(), exp: Date.now() + TTL }; jars.set(tok, j); }
  for (const sc of setCookies) { const [kv, ...attrs] = sc.split(';'); const i = kv.indexOf('='); if (i < 1) continue; const k = kv.slice(0, i).trim(), val = kv.slice(i + 1).trim();
    const gone = attrs.some((a) => /^\s*max-age\s*=\s*(0|-\d+)\s*$/i.test(a)) || attrs.some((a) => { const m = /^\s*expires\s*=(.*)$/i.exec(a); return m && Date.parse(m[1]) < Date.now(); });
    if (gone || !val) j.c.delete(k); else j.c.set(k, val); }
}

export const DEMO_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demo shop</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f6f8fb;color:#0f172a}header{display:flex;align-items:center;gap:20px;padding:16px 28px;background:#fff;border-bottom:1px solid #e2e8f0}header b{margin-right:auto;font-size:20px}header a{color:#334155;text-decoration:none}.hero{padding:72px 24px;text-align:center}.hero h1{font-size:44px;margin:0 0 12px}.hero p{color:#475569;max-width:520px;margin:0 auto 24px}.btn{display:inline-block;background:#2563eb;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600}.cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));padding:0 28px 56px;max-width:960px;margin:0 auto}.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px}.card h3{margin:0 0 6px}.card p{margin:0;color:#64748b}</style></head>
<body><header><b>Corner Shop</b><a href="/">Home</a><a href="/menu">Menu</a><a href="/contact" class="btn">Order now</a></header>
<section class="hero"><h1>Fresh bread, every morning</h1><p>Baked on site from 5am. Come early, the sourdough goes fast.</p><a class="btn" href="/menu">See today's menu</a></section>
<section class="cards"><article class="card"><h3>Sourdough</h3><p>Slow-fermented for 24 hours.</p></article><article class="card"><h3>Croissants</h3><p>Butter, butter and more butter.</p></article><article class="card"><h3>Coffee</h3><p>Roasted two streets away.</p></article></section></body></html>`;

/** Find an app's pages: sitemap.xml plus links found by following the home page two levels deep. Single-page apps add more as you browse. */
export async function discoverPages(up, { fetchImpl = fetch, max = 40 } = {}) {
  const seen = new Set(['/']); const queue = [['/', 0]]; const base = new URL(up);
  const get = async (p) => { try { const r = await fetchImpl(`${up}${p}`, { redirect: 'follow', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'DevX-Control-Preview/1.0', accept: 'text/html,application/xml' } }); if (!r.ok) return ''; const ct = r.headers.get('content-type') || ''; if (!/html|xml|text/i.test(ct)) return ''; return (await r.text()).slice(0, 400000); } catch { return ''; } };
  const norm = (h) => { try { const u = new URL(h, base); if (u.origin !== base.origin) return null; const p = u.pathname.replace(/\/{2,}/g, '/'); if (!pathOk(p) || /\.(png|jpe?g|gif|svg|webp|ico|pdf|zip|css|js|json|xml|txt|woff2?|mp4|map)$/i.test(p)) return null; return p; } catch { return null; } };
  const sm = await get('/sitemap.xml'); for (const m of sm.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) { const p = norm(m[1]); if (p && !seen.has(p) && seen.size < max) { seen.add(p); } }
  while (queue.length && seen.size < max) {
    const [p, d] = queue.shift(); if (d >= 2) continue; const html = await get(p);
    for (const m of html.matchAll(/<a\b[^>]*\bhref=("|')([^"'#]+)\1/gi)) { const n = norm(m[2]); if (n && !seen.has(n) && seen.size < max) { seen.add(n); queue.push([n, d + 1]); } }
  }
  return [...seen].sort((a, b) => a.length - b.length || a.localeCompare(b));
}
