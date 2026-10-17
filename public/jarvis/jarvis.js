// Jarvis page: tap/hold to talk, stream the answer sentence-by-sentence, barge-in, cards.
// CSP is strict (script-src 'self'), so everything is here — no inline handlers.
const $ = (s) => document.querySelector(s);
const api = async (path, { method = 'GET', body, raw, headers = {} } = {}) => {
  const res = await fetch('/api/v1' + path, {
    method, credentials: 'same-origin',
    headers: { ...(body && !raw ? { 'content-type': 'application/json' } : {}), ...(CSRF ? { 'x-csrf-token': CSRF } : {}), ...headers },
    body: raw ? raw : (body ? JSON.stringify(body) : undefined),
  });
  return res;
};

let CSRF = null, USER = null;
let state = 'idle';           // idle | listening | thinking | speaking | alert
let actx = null, analyser = null, levelData = null;
let media = null, recorder = null, chunks = [], pressT = 0, toggle = false;
let speakAbort = null;

/* ---------------- session ---------------- */
async function boot() {
  const s = await (await api('/session')).json().catch(() => ({}));
  if (s && s.authenticated) { CSRF = s.csrf; USER = s.user; showApp(); }
  else showLogin();
}
function showLogin() {
  $('#login').hidden = false; $('#app').hidden = true;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#lg-err').textContent = '';
    const r = await api('/session', { method: 'POST', body: { username: $('#lg-user').value.trim(), password: $('#lg-pass').value, code: $('#lg-code').value.trim() } });
    if (r.status === 201) { const d = await r.json(); CSRF = d.csrf; USER = d.user; $('#login').hidden = true; showApp(); }
    else { const d = await r.json().catch(() => ({})); $('#lg-err').textContent = d.detail || d.title || 'Sign in failed.'; }
  });
}
function showApp() { $('#app').hidden = false; initOrb(); wireControls(); refreshState(); setStatus('Tap to talk'); }

/* ---------------- audio context ---------------- */
function ensureAudio() {
  if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); analyser = actx.createAnalyser(); analyser.fftSize = 256; levelData = new Uint8Array(analyser.frequencyBinCount); analyser.connect(actx.destination); }
  if (actx.state === 'suspended') actx.resume();
}

/* ---------------- orb ---------------- */
function initOrb() {
  const c = $('#orb'), ctx = c.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const fit = () => { const s = c.clientWidth; c.width = s * dpr; c.height = s * dpr; };
  fit(); addEventListener('resize', fit);
  const colors = { idle: [180, 140, 255], listening: [73, 214, 255], thinking: [160, 130, 255], speaking: [150, 110, 255], alert: [255, 180, 84] };
  let t = 0, shownLevel = 0;
  (function frame() {
    requestAnimationFrame(frame);
    t += 0.016;
    let lvl = 0;
    if (analyser && (state === 'listening' || state === 'speaking')) { analyser.getByteFrequencyData(levelData); lvl = levelData.reduce((a, b) => a + b, 0) / levelData.length / 255; }
    shownLevel += (lvl - shownLevel) * 0.2;
    const w = c.width, h = c.height, cx = w / 2, cy = h / 2, base = Math.min(w, h) * 0.26;
    const [r, g, b] = colors[state] || colors.idle;
    ctx.clearRect(0, 0, w, h);
    const breathe = reduce ? 1 : 1 + Math.sin(t * 1.4) * 0.03;
    const pulse = base * (breathe + shownLevel * 0.5);
    const grd = ctx.createRadialGradient(cx, cy - base * 0.2, base * 0.1, cx, cy, pulse * 1.9);
    grd.addColorStop(0, `rgba(${r},${g},${b},.95)`);
    grd.addColorStop(0.5, `rgba(${r},${g},${b},.35)`);
    grd.addColorStop(1, 'rgba(10,8,20,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, pulse * 1.9, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, pulse, 0, 7); ctx.fillStyle = `rgba(${r},${g},${b},.9)`; ctx.fill();
    // rings
    for (let i = 1; i <= 3; i++) {
      const rr = pulse + base * (0.35 * i) + (reduce ? 0 : Math.sin(t * (1 + i * 0.4)) * base * 0.05);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.strokeStyle = `rgba(${r},${g},${b},${0.18 / i + shownLevel * 0.2})`; ctx.lineWidth = dpr * 1.5; ctx.stroke();
    }
  })();
}
function setState(s) { state = s; $('#status').classList.toggle('alert', s === 'alert'); }
function setStatus(txt) { $('#status').textContent = txt; }
function caption(html) { $('#caption').innerHTML = html; }

/* ---------------- controls ---------------- */
function wireControls() {
  const talk = $('#talk');
  const down = (e) => { e.preventDefault(); ensureAudio(); pressT = Date.now(); if (state === 'speaking') { stopSpeaking(); } if (state !== 'listening') startListening(); };
  const up = () => { const held = Date.now() - pressT; if (state === 'listening') { if (held > 450) stopListening(); else toggle = true; /* tap: stay listening until next tap */ } };
  talk.addEventListener('pointerdown', down);
  talk.addEventListener('pointerup', (e) => { if (toggle && state === 'listening') { toggle = false; stopListening(); return; } up(e); });
  $('#toggletext').addEventListener('click', () => { const f = $('#textform'); f.hidden = !f.hidden; if (!f.hidden) $('#textin').focus(); });
  $('#textform').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#textin').value.trim(); if (v) { $('#textin').value = ''; handleUtterance(v); } });
  $('#kill').addEventListener('click', async () => { const on = $('#kill').getAttribute('aria-pressed') !== 'true'; await api('/jarvis/kill', { method: 'POST', body: { on } }); refreshState(); });
  $('#readonly').addEventListener('click', async () => { const on = $('#readonly').getAttribute('aria-pressed') !== 'true'; await api('/jarvis/readonly', { method: 'POST', body: { on } }); refreshState(); });
  // Space to talk on desktop
  addEventListener('keydown', (e) => { if (e.code === 'Space' && !$('#textform').contains(document.activeElement) && state !== 'listening') { e.preventDefault(); ensureAudio(); if (state === 'speaking') stopSpeaking(); startListening(); } });
  addEventListener('keyup', (e) => { if (e.code === 'Space' && state === 'listening') stopListening(); });
}
async function refreshState() {
  try { const s = await (await api('/jarvis/state')).json(); $('#kill').setAttribute('aria-pressed', String(!!s.killed)); $('#readonly').setAttribute('aria-pressed', String(!!s.readOnly)); if (s.name) { $('#assistant').textContent = s.name; } } catch {}
}

/* ---------------- listen (mic -> STT) ---------------- */
async function startListening() {
  try {
    if (!media) media = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) { setStatus('Microphone blocked — allow it, or type instead.'); $('#textform').hidden = false; return; }
  ensureAudio();
  const src = actx.createMediaStreamSource(media); src.connect(analyser);
  const mime = ['audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  recorder = mime ? new MediaRecorder(media, { mimeType: mime }) : new MediaRecorder(media);
  chunks = [];
  recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  recorder.onstop = () => onAudio(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
  recorder.start();
  setState('listening'); $('#talk').classList.add('live'); setStatus('Listening…'); caption('');
}
function stopListening() { if (recorder && recorder.state !== 'inactive') recorder.stop(); $('#talk').classList.remove('live'); setState('thinking'); setStatus('Thinking…'); }

async function onAudio(blob) {
  if (!blob.size) { setState('idle'); setStatus('Tap to talk'); return; }
  try {
    const r = await api('/jarvis/stt', { method: 'POST', raw: blob, headers: { 'content-type': blob.type || 'application/octet-stream' } });
    if (!r.ok) { const d = await r.json().catch(() => ({})); return fail(d.detail || 'I could not hear that clearly.'); }
    const d = await r.json();
    const text = (d.text || '').trim();
    if (!text) { setState('idle'); setStatus('Tap to talk'); caption('<span class="muted">(heard nothing)</span>'); return; }
    caption(`<span class="you">${esc(text)}</span>`);
    handleUtterance(text);
  } catch (e) { fail('Speech service is unavailable.'); }
}

/* ---------------- ask (brain) + speak ---------------- */
async function handleUtterance(text) {
  setState('thinking'); setStatus('Thinking…');
  try {
    const r = await api('/jarvis/ask', { method: 'POST', body: { text } });
    const d = await r.json();
    if (d.pending) renderConfirm(d.pending, d.say);
    await speak(d.say || 'I did not catch that.');
    if (!d.pending) { setState('idle'); setStatus('Tap to talk'); }
  } catch (e) { fail('The assistant had a problem.'); }
}

function splitSentences(t) {
  return (String(t).match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [t]).map((s) => s.trim()).filter(Boolean);
}
async function speak(text) {
  ensureAudio(); setState('speaking'); $('#caption').textContent = text;
  const sents = splitSentences(text);
  speakAbort = { cancelled: false };
  const mine = speakAbort;
  let startAt = actx.currentTime + 0.05;
  const buffers = new Array(sents.length);
  const fetchBuf = async (i) => {
    try {
      const r = await api('/jarvis/speak', { method: 'POST', body: { text: sents[i] } });
      if (!r.ok) return null;
      return await actx.decodeAudioData(await r.arrayBuffer());
    } catch { return null; }
  };
  buffers[0] = fetchBuf(0);
  for (let i = 0; i < sents.length; i++) {
    const buf = await buffers[i];
    if (mine.cancelled) return;
    if (i + 1 < sents.length) buffers[i + 1] = fetchBuf(i + 1); // prefetch next
    if (!buf) continue;
    const src = actx.createBufferSource(); src.buffer = buf; src.connect(analyser);
    const when = Math.max(startAt, actx.currentTime + 0.01); src.start(when); startAt = when + buf.duration;
    await new Promise((res) => { src.onended = res; });
    if (mine.cancelled) return;
  }
}
function stopSpeaking() { if (speakAbort) speakAbort.cancelled = true; setState('idle'); }

/* ---------------- confirmation card ---------------- */
function renderConfirm(pending, say) {
  const needAuth = pending.tier >= 2;
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `<h3>Confirm</h3><p>${esc(pending.summary || say || '')}</p>${needAuth ? '<div class="row"><input type="password" class="pw" placeholder="Password" autocomplete="current-password"><input class="code" placeholder="2FA code" inputmode="numeric" autocomplete="one-time-code"></div>' : ''}<div class="row"><button class="btn ok">Approve</button><button class="btn cancel">Cancel</button></div><div class="err cerr"></div>`;
  $('#cards').prepend(card);
  card.querySelector('.cancel').addEventListener('click', () => { card.remove(); });
  card.querySelector('.ok').addEventListener('click', async () => {
    const body = needAuth ? { password: card.querySelector('.pw').value, code: card.querySelector('.code').value.trim() } : {};
    const r = await api('/jarvis/confirm/' + pending.id, { method: 'POST', body });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { card.querySelector('.cerr').textContent = d.detail || d.title || 'Could not confirm.'; return; }
    card.remove(); await speak('Done.'); setState('idle'); setStatus('Tap to talk');
  });
}

/* ---------------- helpers ---------------- */
function fail(msg) { setState('alert'); setStatus(msg); caption(''); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

boot();
