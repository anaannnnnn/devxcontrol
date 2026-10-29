// Harmonize: recolour a running page as ONE system. Every element's background, text, border and shadow colour is mapped from
// where it sits in the page's own light-to-dark scale onto the new palette, and every piece of text is then checked against the
// colour that is really behind it, so nothing can end up unreadable. Elements the new design styles itself (cards, buttons,
// navigation and so on, tagged data-dx by the role script) keep the design's own look; their text is still checked.
// Written as a real function so it can be tested; sent to pages as source text. Safe to run again with another palette.
export function harmonize(T) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var d = document, root = d.documentElement, body = d.body; if (!body) return;
  function P(c) { var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/.exec(c || ''); if (m) { var a = m[4] === undefined ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4])); return { r: +m[1], g: +m[2], b: +m[3], a: a }; } m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || ''); return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: 1 } : null; }
  function hsl(c) { var r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn, h = 0, s = 0; if (dd) { s = dd / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h = (h * 60 + 360) % 360; } return { h: h, s: s, l: l }; }
  function hex(c) { return '#' + [c.r, c.g, c.b].map(function (x) { return Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0'); }).join(''); }
  function mix(a, b, t) { a = P(a); b = P(b); return hex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t }); }
  function over(top, under) { var a = top.a; return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 }; }
  function lum(c) { c = typeof c === 'string' ? P(c) : c; var f = function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
  function ratio(a, b) { var x = lum(a), y = lum(b); if (x < y) { var z = x; x = y; y = z; } return (x + 0.05) / (y + 0.05); }
  function semantic(h, s) { return s > 0.35 && ((h < 18 || h > 345) || (h > 85 && h < 160) || (h > 30 && h < 50)); }
  var OWNED = /^(card|btn|btn2|badge|nav|foot|input|hero)$/;
  var SKIP = /^(SCRIPT|STYLE|LINK|META|BR|NOSCRIPT|HEAD|HTML|PATH|G|CIRCLE|RECT|LINE|POLYGON|POLYLINE|ELLIPSE|DEFS|USE|STOP|TITLE|OPTION|SOURCE|IFRAME|CANVAS)$/i;
  /* undo what a previous run set, so a new palette starts from the page's own colours */
  if (window.__dxHz) { window.__dxHz.stop(); }
  var touched = window.__dxTouched || (window.__dxTouched = []);
  touched.forEach(function (el) { (el.__dxset || []).forEach(function (p) { el.style.removeProperty(p); }); el.__dxset = []; el.__dxeb = null; el.__dxsrc = undefined; });
  touched.length = 0;
  function set(el, prop, val) { el.style.setProperty(prop, val, 'important'); if (!el.__dxset) el.__dxset = []; if (el.__dxset.indexOf(prop) < 0) el.__dxset.push(prop); if (touched.indexOf(el) < 0) touched.push(el); }
  /* how dark was the page originally? read before the page background is replaced */
  var bb = P(getComputedStyle(body).backgroundColor); if (!bb || bb.a < 0.5) bb = P(getComputedStyle(root).backgroundColor);
  if (!bb || bb.a < 0.5) { var big = d.querySelectorAll('body > *, #root > *, #app > *, #__next > *, main'); for (var i = 0; i < big.length && (!bb || bb.a < 0.5); i++) { var c0 = P(getComputedStyle(big[i]).backgroundColor); if (c0 && c0.a >= 0.5) bb = c0; } }
  var srcDark = bb && bb.a >= 0.5 ? hsl(bb).l < 0.5 : false; var dark = T.mode === 'dark';
  function roleBg(l) { if (!srcDark) return l >= 0.985 ? 'surface' : l >= 0.93 ? 'bg' : l >= 0.85 ? 's2' : l >= 0.6 ? 'border' : l >= 0.25 ? 'mid' : 'deep'; return l <= 0.04 ? 'deepest' : l <= 0.1 ? 'bg' : l <= 0.16 ? 'surface' : l <= 0.24 ? 's2' : l <= 0.4 ? 'border' : l <= 0.7 ? 'mid' : 'bright'; }
  var DEEP = mix(T.bg, '#000000', 0.35), MID = mix(T.border, T.muted, 0.5);
  function themeBg(r) { switch (r) { case 'surface': return T.surface; case 'bg': return T.bg; case 's2': return T.s2; case 'border': return T.border; case 'mid': return MID; case 'deepest': return dark ? DEEP : T.bg; case 'deep': return dark ? DEEP : T.text; case 'bright': return T.text; } return T.bg; }
  function pickText(strong, eb, min) { var c = [strong, T.text, T.bg, T.surface, '#ffffff', '#000000']; for (var i = 0; i < c.length; i++) if (ratio(c[i], eb) >= min) return c[i]; return ratio('#ffffff', eb) >= ratio('#000000', eb) ? '#ffffff' : '#000000'; }
  /* Fonts: measure every text element in the page's own font, switch to the new fonts once they have loaded, then fit each element's
     size so its line count and width match the original. A look can change how text is drawn, never how the page is laid out. */
  var FIT_SEL = 'h1,h2,h3,h4,h5,h6,p,li,a,button,label,span,div,td,th,dt,dd,summary,small,b,strong,em';
  function measure(el) {
    var r = d.createRange(), minL = 1e9, maxR = -1e9, tops = [], n = 0;
    for (var c = el.firstChild; c; c = c.nextSibling) { if (c.nodeType !== 3 || !c.nodeValue.trim()) continue; r.selectNodeContents(c); var rs = r.getClientRects(); for (var i = 0; i < rs.length; i++) { var q = rs[i]; if (q.width < 1) continue; minL = Math.min(minL, q.left); maxR = Math.max(maxR, q.right); var t = Math.round((q.top + q.bottom) / 2 / 3); if (tops.indexOf(t) < 0) tops.push(t); n++; } }
    return n ? { tw: maxR - minL, lines: tops.length, bh: el.getBoundingClientRect().height } : null;
  }
  function fitTargets() { var out = [], all = body.querySelectorAll(FIT_SEL); for (var i = 0; i < all.length && out.length < 600; i++) { var el = all[i]; if (SKIP.test(el.tagName) || !hasOwnText(el)) continue; var r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue; if (getComputedStyle(el).display === 'none') continue; out.push(el); } return out; }
  var fontsOn = root.hasAttribute('data-dx-font');
  var targets = fitTargets();
  if (!fontsOn) { targets.forEach(function (el) { if (!el.__dxo) el.__dxo = measure(el); }); }
  function fitAll() {
    targets.forEach(function (el) { if (el.__dxfs) { el.style.removeProperty('font-size'); el.__dxfs = false; } if (el.__dxmh) { el.style.removeProperty('min-height'); el.__dxmh = false; } });
    targets.forEach(function (el) {
      var o = el.__dxo; if (!o) return; var base = parseFloat(getComputedStyle(el).fontSize), cur = measure(el); if (!cur) return;
      var single = o.lines === 1, off = single ? Math.abs(cur.tw / o.tw - 1) > 0.05 || cur.lines !== 1 : cur.lines !== o.lines;
      if (off) {
        var lo = 0.75, hi = 1.3, best = 1;
        for (var k = 0; k < 7; k++) {
          var mid = (lo + hi) / 2; el.style.setProperty('font-size', (base * mid).toFixed(2) + 'px', 'important'); var m = measure(el); if (!m) break; best = mid;
          var tooBig = single ? (m.lines > 1 || m.tw > o.tw * 1.03) : m.lines > o.lines, tooSmall = single ? (m.lines === 1 && m.tw < o.tw * 0.97) : m.lines < o.lines;
          if (!tooBig && !tooSmall) break; if (tooBig) hi = mid; else lo = mid;
        }
        el.style.setProperty('font-size', (base * best).toFixed(2) + 'px', 'important'); el.__dxfs = true;
      }
      var disp = getComputedStyle(el).display, nh = el.getBoundingClientRect().height; if (o.bh && nh < o.bh - 3 && disp !== 'inline') { el.style.setProperty('min-height', o.bh.toFixed(1) + 'px', 'important'); el.__dxmh = true; }
    });
  }
  /* switch fonts on (the stylesheet only applies them once this attribute is present), wait for them, then fit */
  root.setAttribute('data-dx-font', '1');
  var fams = (T.fonts || []), ft = 0;
  function refit() { clearTimeout(ft); ft = setTimeout(function () { requestAnimationFrame(function () { try { fitAll(); } catch (e) { /* leave sizes alone */ } }); }, 150); }
  if (d.fonts && d.fonts.addEventListener) d.fonts.addEventListener('loadingdone', refit);
  fams.forEach(function (f) { if (d.fonts && d.fonts.load) d.fonts.load('16px "' + f + '"').then(refit, function () {}); });
  setTimeout(refit, 1200); setTimeout(refit, 3200);
  /* the page itself */
  set(root, 'background-color', T.bg); set(body, 'background-color', 'transparent'); set(body, 'color', T.text); body.__dxeb = T.bg;
  var seen = new WeakMap();
  function hasOwnText(el) { for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim().length) return true; return false; }
  function walk() {
    var els = body.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i]; if (SKIP.test(el.tagName) || el.closest('#dx-spot,#dx-progress,#dx-curtain')) continue;
      var cs = getComputedStyle(el); if (cs.display === 'none') continue;
      var role = el.getAttribute('data-dx') || '', owned = OWNED.test(role);
      var inBtn = !owned && el.closest('[data-dx=btn],[data-dx=btn2]');
      if (inBtn) { /* the label and decorations of a button belong to the button's own style: only clear decorative layers and let the label inherit */
        var ic = el.getBoundingClientRect(); if (cs.position === 'absolute' && !hasOwnText(el) && el.children.length === 0) { set(el, 'background-color', 'transparent'); set(el, 'background-image', 'none'); }
        el.__dxeb = inBtn.__dxeb || T.accent; seen.set(el, 'btn'); continue; }
      var key = role + '|' + cs.backgroundColor + '|' + cs.color + '|' + cs.borderTopColor + '|' + cs.backgroundImage;
      var par = el.parentElement, peb = (par && par.__dxeb) || T.bg;
      if (seen.get(el) === key && el.__dxeb) continue;
      var bg = P(cs.backgroundColor), fg = P(cs.color), bd = P(cs.borderTopColor), eb = peb, onAcc = false;
      if (role === 'canvas') { set(el, 'background-color', 'transparent'); set(el, 'background-image', 'none'); eb = T.bg; }
      else if (owned) { if (bg && bg.a >= 0.04) { var under = P(peb) || { r: 128, g: 128, b: 128, a: 1 }; eb = hex(over(bg, under)); } if (role === 'btn') onAcc = bg && bg.a >= 0.5; }
      else if (bg && bg.a >= 0.04) {
        var k = hsl(bg), rect = el.getBoundingClientRect(), dot = rect.width <= 56 && rect.height <= 56 && !hasOwnText(el) && el.children.length === 0;
        var tr = function (col) { return bg.a < 0.98 ? 'rgba(' + P(col).r + ',' + P(col).g + ',' + P(col).b + ',' + bg.a.toFixed(3) + ')' : col; };
        var flat = hex(over(bg, P(peb) || bg));
        if (dot) { eb = flat; }
        else if (k.s >= 0.4 && k.l > 0.12 && k.l < 0.88) { if (!semantic(k.h, k.s)) { eb = bg.a < 0.98 ? hex(over({ r: P(T.accent).r, g: P(T.accent).g, b: P(T.accent).b, a: bg.a }, P(peb) || bg)) : T.accent; onAcc = bg.a >= 0.6; set(el, 'background-color', tr(T.accent)); } else eb = flat; }
        else { var mapped = themeBg(roleBg(k.l)); eb = bg.a < 0.98 ? hex(over({ r: P(mapped).r, g: P(mapped).g, b: P(mapped).b, a: bg.a }, P(peb) || bg)) : mapped; set(el, 'background-color', tr(mapped)); }
      } else if (cs.backgroundImage && /gradient/.test(cs.backgroundImage) && !/url\(/.test(cs.backgroundImage)) {
        var gr = el.getBoundingClientRect(), bigG = gr.width * gr.height > innerWidth * innerHeight * 0.2;
        if (bigG) { eb = mix(T.bg, T.accent, 0.08); set(el, 'background-image', 'linear-gradient(135deg,' + mix(T.bg, T.accent, 0.04) + ',' + mix(T.bg, T.accent2 || T.accent, 0.16) + ')'); }
        else { var a2 = T.accent2 || T.accent; eb = ratio(T.on, T.accent) < ratio(T.on, a2) ? T.accent : a2; if (!/background-clip|text/.test(cs.webkitBackgroundClip + cs.backgroundClip)) set(el, 'background-image', 'linear-gradient(135deg,' + T.accent + ',' + a2 + ')'); else set(el, 'background-image', 'linear-gradient(135deg,' + T.accent + ',' + a2 + ')'); }
      }
      el.__dxeb = eb;
      if (hasOwnText(el) && !owned) { /* what is really painted behind this text? the nearest layer underneath it, even when it is a sibling decoration */
        try { var tr0 = el.getBoundingClientRect(); if (tr0.width > 0 && tr0.height > 0 && tr0.top >= 0 && tr0.top < innerHeight) { var stack = d.elementsFromPoint(tr0.left + tr0.width / 2, tr0.top + tr0.height / 2), at = stack.indexOf(el);
          for (var q = at + 1; q < stack.length; q++) { var u = stack[q]; if (u === body || u === root) break; var ucs = getComputedStyle(u); if (el.contains(u) || u.contains(el)) { if (!(ucs.backgroundImage !== 'none' || (P(ucs.backgroundColor) || { a: 0 }).a >= 0.5)) continue; } if ((ucs.backgroundImage !== 'none' || (P(ucs.backgroundColor) || { a: 0 }).a >= 0.5) && typeof u.__dxeb === 'string' && u.__dxeb !== eb) { eb = u.__dxeb; break; } else if (typeof u.__dxeb === 'string' && ((P(ucs.backgroundColor) || { a: 0 }).a >= 0.5)) break; } } } catch (e2) { /* keep the parent's colour */ }
      }
      if (fg && (hasOwnText(el) || el.matches('a,button,input,select,textarea,svg,svg *,label,li,h1,h2,h3,h4,h5,h6,p,span,td,th,small,code'))) {
        var tx = null;
        if (onAcc) tx = pickText(T.on, eb, 4.5);
        else if (!owned || role === 'btn2' || role === 'badge') {
          var kf = hsl(fg);
          if (kf.s < 0.2 || kf.l < 0.1 || kf.l > 0.9) { var diff = Math.abs(kf.l - (par && par.__dxsrc !== undefined ? par.__dxsrc : srcDark ? 0.1 : 0.97)); tx = diff > 0.5 ? pickText(T.text, eb, 4.5) : pickText(T.muted, eb, 3.5); }
          else if (!semantic(kf.h, kf.s)) tx = pickText(T.accent, eb, 3);
        }
        var final = tx || hex(fg); if (ratio(final, eb) < (parseFloat(cs.fontSize) >= 24 ? 3 : 4.5)) tx = pickText(T.text, eb, 4.5);
        if (tx) set(el, 'color', tx);
      }
      if (bd && bd.a > 0.04 && parseFloat(cs.borderTopWidth) > 0 && !owned) { var kb = hsl(bd); var nb = kb.s < 0.25 ? T.border : (semantic(kb.h, kb.s) ? null : T.accent); if (nb) set(el, 'border-color', nb); }
      if (!owned && cs.boxShadow && cs.boxShadow !== 'none' && !/inset/.test(cs.boxShadow)) set(el, 'box-shadow', dark ? '0 8px 30px rgba(0,0,0,.45)' : '0 6px 24px rgba(15,23,42,.10)');
      if (bg && bg.a >= 0.04) el.__dxsrc = hsl(bg).l;
      seen.set(el, key);
    }
  }
  /* last line of defence: whatever the rules above decided, text must be readable on what is really behind it */
  function sweep() {
    var els = body.querySelectorAll('*'), fixed = 0;
    for (var i = 0; i < els.length && i < 4000; i++) {
      var el = els[i]; if (SKIP.test(el.tagName) || !hasOwnText(el)) continue;
      var cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      var fg = P(cs.color); if (!fg || fg.a < 0.3) continue; if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue;
      var chain = [], n = el; for (; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
      var acc = { r: 255, g: 255, b: 255, a: 1 }, unknown = false;
      for (var j = chain.length - 1; j >= 0 && !unknown; j--) {
        var ncs = getComputedStyle(chain[j]);
        if (ncs.backgroundImage !== 'none') { if (typeof chain[j].__dxeb === 'string' && P(chain[j].__dxeb)) acc = P(chain[j].__dxeb); else if (/url\(/.test(ncs.backgroundImage)) unknown = true; else if (typeof chain[j].__dxeb === 'string') acc = P(chain[j].__dxeb); continue; }
        var nb = P(ncs.backgroundColor); if (nb && nb.a > 0) acc = over(nb, acc);
      }
      if (unknown) continue;
      var accHex = hex(acc), cur = hex(fg), need = parseFloat(cs.fontSize) >= 24 ? 3 : 4.2;
      if (ratio(cur, accHex) < need) { var fix = pickText(T.text, accHex, 4.5); if (ratio(fix, accHex) > ratio(cur, accHex)) { set(el, 'color', fix); fixed++; } }
    }
    return fixed;
  }
  var tm = 0, mo = null;
  function run() { try { walk(); sweep(); } catch (e) { /* a page we cannot read must not break */ } }
  function later() { clearTimeout(tm); tm = setTimeout(run, 220); }
  run(); setTimeout(run, 900);
  if (window.MutationObserver) { mo = new MutationObserver(later); mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-dx'] }); }
  window.__dxHz = { stop: function () { clearTimeout(tm); if (mo) mo.disconnect(); } };
}
export const harmonizeJs = (T) => `(${harmonize.toString()})(${JSON.stringify(T)});`;
