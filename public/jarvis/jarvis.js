// Jarvis — voice-first operator. Echo-free audio (mic meters only, never routed to output),
// particle orb, conversational login (name -> password -> glow), streamed speech, barge-in.
import { createOrb } from '/jarvis/orb.js';

const $ = (s) => document.querySelector(s);
let CSRF = null, USER = null, state = 'idle', screen = 'login';
let actx = null, micAnalyser = null, playAnalyser = null, micStream = null, recorder = null, chunks = [], speakAbort = null;
let orbLg = null, orbApp = null, pressT = 0, toggle = false;

const api = (path, { method = 'GET', body, raw, headers = {} } = {}) => fetch('/api/v1' + path, {
  method, credentials: 'same-origin',
  headers: { ...(body && !raw ? { 'content-type': 'application/json' } : {}), ...(CSRF ? { 'x-csrf-token': CSRF } : {}), ...headers },
  body: raw ? raw : (body ? JSON.stringify(body) : undefined),
});

/* ---------------- audio (no echo) ---------------- */
function ensureAudio() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    micAnalyser = actx.createAnalyser(); micAnalyser.fftSize = 256;      // metering only — NOT connected to output
    playAnalyser = actx.createAnalyser(); playAnalyser.fftSize = 256; playAnalyser.connect(actx.destination); // playback -> speakers
  }
  if (actx.state === 'suspended') actx.resume();
}
const readLevel = (an) => { const a = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(a); let s = 0; for (const v of a) s += v; return s / a.length / 255; };
function meterLoop() {
  requestAnimationFrame(meterLoop);
  let lvl = 0;
  if (state === 'listening' && micAnalyser) lvl = readLevel(micAnalyser);
  else if (state === 'speaking' && playAnalyser) lvl = readLevel(playAnalyser);
  (screen === 'login' ? orbLg : orbApp)?.setLevel(lvl);
}

function setState(s) { state = s; document.body.dataset.state = s; orbLg?.setState(s); orbApp?.setState(s); }

/* ---------------- boot ---------------- */
async function boot() {
  orbLg = createOrb($('#orb-lg'));
  meterLoop();
  const s = await api('/session').then((r) => r.json()).catch(() => ({}));
  if (s && s.authenticated) { CSRF = s.csrf; USER = s.user; enterApp(false); }
  else wireLogin();
}

/* ---------------- login (conversational) ---------------- */
function wireLogin() {
  const title = $('#lg-title'), sub = $('#lg-sub'), err = $('#lg-err');
  const nameForm = $('#lg-name-form'), passForm = $('#lg-pass-form'), codeWrap = $('#lg-code-wrap');
  setTimeout(() => nameForm.classList.add('show'), 300);
  let name = '';

  const askPassword = () => {
    name = $('#lg-name').value.trim();
    if (!name) return $('#lg-name').focus();
    title.innerHTML = `Hello, <b>${esc(name)}</b>.`; sub.textContent = 'Your password, please.';
    nameForm.classList.add('hidden'); passForm.classList.remove('hidden'); requestAnimationFrame(() => { passForm.classList.add('show'); $('#lg-pass').focus(); });
    $('#lg-mic').style.display = 'none';
  };
  nameForm.addEventListener('submit', (e) => { e.preventDefault(); askPassword(); });

  passForm.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    const r = await api('/session', { method: 'POST', body: { username: name.toLowerCase(), password: $('#lg-pass').value, code: $('#lg-code').value.trim() } });
    if (r.status === 201) { const d = await r.json(); CSRF = d.csrf; USER = d.user; bloomIn(); }
    else { const d = await r.json().catch(() => ({})); if (/code/i.test(d.title || '')) { codeWrap.classList.remove('hidden'); codeWrap.classList.add('show'); $('#lg-code').focus(); err.textContent = 'Enter your 2FA code.'; } else { err.textContent = d.detail || 'That didn’t match. Try again.'; } }
  });

  // say your name
  $('#lg-mic').addEventListener('click', async () => {
    ensureAudio(); err.textContent = '';
    try {
      const blob = await recordOnce(2600); sub.textContent = 'One moment…';
      const res = await fetch('/api/v1/jarvis/hear', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: blob });
      const d = await res.json().catch(() => ({}));
      const heard = (d.text || '').replace(/[^a-z\s]/gi, '').trim().split(/\s+/)[0] || '';
      if (heard) { $('#lg-name').value = heard; askPassword(); } else { sub.textContent = 'I didn’t catch that — type your name.'; $('#lg-name').focus(); }
    } catch (e2) { sub.textContent = 'Microphone blocked — type your name.'; $('#lg-name').focus(); }
  });
}

function bloomIn() {
  document.body.classList.add('loggingin');
  setTimeout(() => { document.body.classList.remove('loggingin'); enterApp(true); }, 900);
}

/* ---------------- app ---------------- */
function enterApp(greet) {
  screen = 'app';
  $('#login').hidden = true; $('#app').hidden = false;
  if (!orbApp) orbApp = createOrb($('#orb'));
  $('#assistant').textContent = 'Jarvis';
  wireApp();
  refreshState();
  setState('idle');
  if (greet) speak(`Welcome${USER ? ', ' + cap(USER) : ''}. How can I help?`);
}

function wireApp() {
  const talk = $('#btn-talk');
  const down = (e) => { e.preventDefault(); ensureAudio(); pressT = Date.now(); if (state === 'speaking') stopSpeaking(); if (state !== 'listening') startListening(); };
  const up = () => { const held = Date.now() - pressT; if (state === 'listening') { if (held > 450) stopListening(); else toggle = true; } };
  talk.addEventListener('pointerdown', down);
  talk.addEventListener('pointerup', (e) => { if (toggle && state === 'listening') { toggle = false; stopListening(); return; } up(e); });
  $('#orb').addEventListener('pointerdown', down);
  $('#orb').addEventListener('pointerup', (e) => { if (toggle && state === 'listening') { toggle = false; stopListening(); } else up(e); });

  $('#btn-type').addEventListener('click', () => { const f = $('#textform'); f.classList.toggle('hidden'); if (!f.classList.contains('hidden')) $('#textin').focus(); });
  $('#textform').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#textin').value.trim(); if (v) { $('#textin').value = ''; $('#textform').classList.add('hidden'); addMsg('user', v); caption(`<span class="you">${esc(v)}</span>`); handle(v); } });
  $('#btn-chat').addEventListener('click', () => $('#sheet').classList.toggle('open'));
  $('#btn-kill').addEventListener('click', async () => { const on = $('#btn-kill').getAttribute('aria-pressed') !== 'true'; await api('/jarvis/kill', { method: 'POST', body: { on } }); $('#btn-kill').setAttribute('aria-pressed', String(on)); $('#btn-kill').style.color = on ? '#ff6b6b' : ''; });
  addEventListener('keydown', (e) => { if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && state !== 'listening') { e.preventDefault(); ensureAudio(); if (state === 'speaking') stopSpeaking(); startListening(); } });
  addEventListener('keyup', (e) => { if (e.code === 'Space' && state === 'listening') stopListening(); });
}
async function refreshState() { try { const s = await api('/jarvis/state').then((r) => r.json()); const on = !!s.killed; $('#btn-kill').setAttribute('aria-pressed', String(on)); $('#btn-kill').style.color = on ? '#ff6b6b' : ''; if (s.name) $('#assistant').textContent = s.name; } catch {} }

/* ---------------- mic capture ---------------- */
async function getMic() {
  if (micStream) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  return micStream;
}
function newRecorder(stream) {
  const mime = ['audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  return mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
}
// record a single short clip (used by the login name capture)
async function recordOnce(ms) {
  const stream = await getMic(); const rec = newRecorder(stream); const cs = [];
  return new Promise((resolve, reject) => {
    rec.ondataavailable = (e) => e.data && e.data.size && cs.push(e.data);
    rec.onstop = () => resolve(new Blob(cs, { type: rec.mimeType || 'audio/webm' }));
    rec.onerror = reject; rec.start(); setTimeout(() => rec.state !== 'inactive' && rec.stop(), ms);
  });
}
async function startListening() {
  let stream; try { stream = await getMic(); } catch { setState('alert'); caption('Microphone blocked — allow it, or tap type.'); return; }
  ensureAudio();
  try { actx.createMediaStreamSource(stream).connect(micAnalyser); } catch {}  // meter only, no output -> no echo
  recorder = newRecorder(stream); chunks = [];
  recorder.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  recorder.onstop = () => onAudio(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
  recorder.start(); setState('listening'); caption('<span class="muted">listening…</span>');
}
function stopListening() { if (recorder && recorder.state !== 'inactive') recorder.stop(); setState('thinking'); caption('<span class="muted">thinking…</span>'); }

async function onAudio(blob) {
  if (!blob.size) { setState('idle'); caption('Tap the orb and speak.'); return; }
  try {
    const r = await api('/jarvis/stt', { method: 'POST', raw: blob, headers: { 'content-type': blob.type || 'application/octet-stream' } });
    const d = await r.json(); const text = (d.text || '').trim();
    if (!r.ok || !text) { setState('idle'); caption('<span class="muted">I didn’t catch that.</span>'); return; }
    addMsg('user', text); caption(`<span class="you">${esc(text)}</span>`);
    handle(text);
  } catch { setState('alert'); caption('Speech service is unavailable.'); }
}

/* ---------------- ask + speak ---------------- */
async function handle(text) {
  setState('thinking');
  try {
    const d = await api('/jarvis/ask', { method: 'POST', body: { text } }).then((r) => r.json());
    addMsg('bot', d.say || '', d.sources);
    if (d.pending) renderConfirm(d.pending);
    await speak(d.say || 'I did not catch that.');
    if (!d.pending) { setState('idle'); }
  } catch { setState('alert'); caption('The assistant had a problem.'); }
}
const splitSentences = (t) => (String(t).match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [t]).map((s) => s.trim()).filter(Boolean);
async function speak(text) {
  ensureAudio(); setState('speaking'); caption(esc(text)); ghost(text);
  const sents = splitSentences(text); speakAbort = { cancelled: false }; const mine = speakAbort;
  let startAt = actx.currentTime + 0.05; const bufs = new Array(sents.length);
  const fetchBuf = async (i) => { try { const r = await api('/jarvis/speak', { method: 'POST', body: { text: sents[i] } }); if (!r.ok) return null; return await actx.decodeAudioData(await r.arrayBuffer()); } catch { return null; } };
  bufs[0] = fetchBuf(0);
  for (let i = 0; i < sents.length; i++) {
    const buf = await bufs[i]; if (mine.cancelled) return;
    if (i + 1 < sents.length) bufs[i + 1] = fetchBuf(i + 1);
    if (!buf) continue;
    const src = actx.createBufferSource(); src.buffer = buf; src.connect(playAnalyser); // -> speakers + meter
    const when = Math.max(startAt, actx.currentTime + 0.01); src.start(when); startAt = when + buf.duration;
    await new Promise((res) => { src.onended = res; }); if (mine.cancelled) return;
  }
}
function stopSpeaking() { if (speakAbort) speakAbort.cancelled = true; setState('idle'); }

/* ---------------- confirmation ---------------- */
function renderConfirm(p) {
  const need = p.tier >= 2; const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `<h3>Confirm</h3><p>${esc(p.summary || '')}</p>${need ? '<div class="row"><input type="password" class="pw" placeholder="Password" autocomplete="current-password"><input class="code" placeholder="2FA code" inputmode="numeric"></div>' : ''}<div class="row"><button class="btn ok">Approve</button><button class="btn cancel">Cancel</button></div><div class="cerr"></div>`;
  $('#cards').prepend(card);
  card.querySelector('.cancel').onclick = () => card.remove();
  card.querySelector('.ok').onclick = async () => {
    const body = need ? { password: card.querySelector('.pw').value, code: card.querySelector('.code').value.trim() } : {};
    const r = await api('/jarvis/confirm/' + p.id, { method: 'POST', body }); const d = await r.json().catch(() => ({}));
    if (!r.ok) { card.querySelector('.cerr').textContent = d.detail || d.title || 'Could not confirm.'; return; }
    card.remove(); await speak('Done.'); setState('idle');
  };
}

/* ---------------- helpers ---------------- */
function caption(html) { $('#caption').innerHTML = html; }
function ghost(t) { $('#ghost').textContent = t.slice(0, 160); }
function addMsg(role, text, sources) { const m = document.createElement('div'); m.className = 'msg ' + (role === 'user' ? 'user' : 'bot'); m.textContent = text; if (sources && sources.length) { const s = document.createElement('span'); s.className = 'src'; s.textContent = 'source: ' + sources.slice(0, 3).join(', '); m.appendChild(s); } const box = $('#msgs'); box.appendChild(m); box.scrollTop = box.scrollHeight; }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;

boot();
