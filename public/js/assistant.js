import { h, clear, icon } from './ui.js';
import { api, stream } from './api.js';

export function mountAssistant() {
  const history = [];
  const timers = new Set();
  const streams = new Set();
  let closed = true, busy = false, voice = false;
  const fab = h('button', { class: 'dc-ai-fab', type: 'button', 'aria-label': 'Open DevX AI assistant', title: 'DevX AI' }, h('span', { class: 'dc-ai-orbit', 'aria-hidden': 'true' }, '✦'));
  const overlay = h('div', { class: 'dc-ai-overlay', hidden: '' });
  const panel = h('section', { class: 'dc-ai-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dc-ai-title' });
  const head = h('header', { class: 'dc-ai-head' }, h('div', { class: 'dc-ai-brand' }, h('span', { class: 'dc-ai-mark', 'aria-hidden': 'true' }, '✦'), h('div', {}, h('strong', { id: 'dc-ai-title' }, 'DevX AI'), h('small', {}, 'Databricks · Qwen local backup'))));
  const voiceReplyBtn = h('button', { class: 'dc-ai-iconbtn', type: 'button', 'aria-label': 'Enable voice replies', title: 'Read replies aloud' }, '◖))');
  const close = h('button', { class: 'dc-ai-iconbtn', type: 'button', 'aria-label': 'Close assistant', title: 'Close' }, icon('x', 18));
  head.append(h('div', { class: 'dc-ai-head-actions' }, voiceReplyBtn, close));
  const messages = h('div', { class: 'dc-ai-messages', 'aria-live': 'polite', 'aria-relevant': 'additions text' });
  const welcome = h('div', { class: 'dc-ai-welcome' }, h('span', { class: 'dc-ai-eyebrow' }, 'FLEET AWARE · SKILL AUGMENTED'), h('h2', {}, 'What can I help you build?'), h('p', {}, 'Ask about your apps, fleet health, design, code or deployment workflow. I can see the current screen and recent activity.'));
  messages.append(welcome);
  const input = h('textarea', { class: 'dc-ai-input', rows: '1', maxlength: '6000', placeholder: 'Message DevX AI…', 'aria-label': 'Message DevX AI' });
  const resizeComposer = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 130)}px`; };
  input.addEventListener('input', resizeComposer);
  input.setAttribute('enterkeyhint', 'search');
  const dictate = h('button', { class: 'dc-ai-tool', type: 'button', 'aria-label': 'Add a voice note', title: 'Speak your message' }, icon('mic', 19));
  const send = h('button', { class: 'dc-ai-send', type: 'submit', 'aria-label': 'Search with DevX AI', title: 'Search with DevX AI' }, icon('search', 19));
  const form = h('form', { class: 'dc-ai-compose' }, input, h('div', { class: 'dc-ai-compose-actions' }, dictate, send));
  const top = h('div', { class: 'dc-ai-top' }, form, h('div', { class: 'dc-ai-foot' }, h('span', {}, 'Databricks primary · local Qwen failover'), h('span', { class: 'dc-ai-hint' }, 'Search or dictate')));
  panel.append(head, top, messages); overlay.append(panel); document.body.append(overlay, fab);

  try {
    const p = JSON.parse(localStorage.getItem('dc-ai-fab-position') || 'null');
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) { fab.style.left = `${Math.max(8, Math.min(innerWidth - 66, p.x))}px`; fab.style.top = `${Math.max(8, Math.min(innerHeight - 66, p.y))}px`; fab.style.right = 'auto'; fab.style.bottom = 'auto'; }
  } catch { /* use the default dock position */ }
  try {
    const p = JSON.parse(localStorage.getItem('dc-ai-panel-position') || 'null');
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y) && innerWidth > 560) { panel.classList.add('dc-ai-moved'); panel.style.left = `${Math.max(8, Math.min(innerWidth - 540, p.x))}px`; panel.style.top = `${Math.max(8, Math.min(innerHeight - 740, p.y))}px`; }
  } catch { /* use the centered panel */ }

  function setOpen(value) {
    closed = !value; overlay.hidden = closed; fab.hidden = !closed;
    if (!closed) { if (matchMedia('(min-width: 561px)').matches) input.focus(); messages.scrollTop = messages.scrollHeight; }
    if (closed && window.speechSynthesis) window.speechSynthesis.cancel();
    if (closed && recognition) { try { recognition.stop(); } catch { /* already stopped */ } }
  }
  function bubble(role, text, cls = '') {
    const row = h('div', { class: `dc-ai-row ${role} ${cls}` });
    row.append(h('div', { class: 'dc-ai-bubble' }, text)); messages.append(row); messages.scrollTop = messages.scrollHeight; return row;
  }
  async function watchRun(runId, app, row) {
    const out = row.querySelector('.dc-ai-bubble');
    for (let i = 0; i < 240; i++) {
      await new Promise((resolve) => { const t = setTimeout(() => { timers.delete(t); resolve(); }, 4000); timers.add(t); });
      if (!document.body.contains(row)) return;
      try {
        const s = await api(`/assistant/status/${encodeURIComponent(runId)}`);
        if (s.state === 'queued' || s.state === 'running') { out.textContent = `${app.name}: ${s.stage || 'working'}…`; continue; }
        if (s.state === 'done') {
          out.textContent = s.health === 'healthy' ? `${app.name} is updated and the health check passed. Open:` : `${app.name} deployment finished, but health is ${s.health}. Check the app before continuing.`;
          if (s.health === 'healthy' && s.url) out.append(document.createTextNode(' '), h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.url));
          return;
        }
        if (s.state === 'attention') { out.textContent = `${app.name} is ready, but GitHub did not complete the automatic merge. Finish at Reviews${s.review?.pr?.url ? ` (${s.review.pr.url})` : ''}.`; return; }
        if (s.state === 'failed') { out.textContent = `${app.name} change stopped: ${s.error || 'a required check or deployment failed'}. No successful deployment was reported.`; return; }
        out.textContent = `${app.name} task state: ${s.state}. Check Autopilot and Reviews for details.`; return;
      } catch { /* retry while the server is reachable again */ }
    }
    out.textContent = `The ${app.name} task is still running. Follow it in Autopilot and Reviews.`;
  }
  async function rollbackPrevious(text) {
    const appId = /^\/app\/([a-z0-9-]+)/i.exec(location.hash.replace(/^#/, ''))?.[1];
    if (!appId || !/\b(no[, ]+go back|go back to (the )?(previous|last)|roll back to (the )?(previous|last)|restore the previous deployment)\b/i.test(text)) return false;
    const { data = [] } = await api(`/apps/${appId}/deployments`);
    if (data.length < 2) { bubble('assistant', 'There is not an earlier saved deployment for this app yet. Successful redeploys are now being recorded for rollback.'); return true; }
    const target = data[1];
    const started = await api(`/apps/${appId}/rollback`, { method: 'POST', body: { deploymentId: target.id } });
    const row = bubble('assistant', `Rolling ${target.label} back into service. DevX Control is backing up the current source and local database first.`);
    const sub = stream(`/jobs/${started.job}/stream`, {
      done: async ({ code }) => {
        sub.close(); streams.delete(sub);
        try {
          const app = await api(`/apps/${appId}`);
          const out = row.querySelector('.dc-ai-bubble');
          if (code === 0 && app.status === 'healthy') { out.textContent = `Done. ${app.name} is back on the previous saved deployment and passed its health check. Open:`; if (app.checks?.[0]?.url) out.append(document.createTextNode(' '), h('a', { href: app.checks[0].url, target: '_blank', rel: 'noopener noreferrer' }, app.checks[0].url)); }
          else out.textContent = `The rollback did not finish with a healthy app (status: ${app.status || 'unknown'}). Check the app logs and the rollback job before trying again.`;
        } catch { row.querySelector('.dc-ai-bubble').textContent = `Rollback finished with exit ${code}; check the app health in DevX Control.`; }
      },
      error: () => {},
    });
    streams.add(sub); return true;
  }
  let fabDrag = null, suppressClick = false;
  fab.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r = fab.getBoundingClientRect(); fab.setPointerCapture(e.pointerId);
    fabDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, moved: false };
  });
  fab.addEventListener('pointermove', (e) => {
    if (!fabDrag || fabDrag.id !== e.pointerId) return;
    const dx = e.clientX - fabDrag.sx, dy = e.clientY - fabDrag.sy;
    if (!fabDrag.moved && Math.hypot(dx, dy) < 7) return;
    fabDrag.moved = true;
    const x = Math.max(8, Math.min(innerWidth - fab.offsetWidth - 8, fabDrag.x + dx));
    const y = Math.max(8, Math.min(innerHeight - fab.offsetHeight - 8, fabDrag.y + dy));
    fab.style.left = `${x}px`; fab.style.top = `${y}px`; fab.style.right = 'auto'; fab.style.bottom = 'auto';
  });
  const endFabDrag = (e) => {
    if (!fabDrag || fabDrag.id !== e.pointerId) return;
    if (fabDrag.moved) { suppressClick = true; localStorage.setItem('dc-ai-fab-position', JSON.stringify({ x: fab.offsetLeft, y: fab.offsetTop })); setTimeout(() => { suppressClick = false; }, 0); }
    else setOpen(true);
    fabDrag = null;
  };
  fab.addEventListener('pointerup', endFabDrag); fab.addEventListener('pointercancel', endFabDrag);
  fab.addEventListener('click', (e) => { if (!suppressClick && e.detail === 0) setOpen(true); });
  fab.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } });

  let panelDrag = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || e.button !== 0) return;
    const mobile = matchMedia('(max-width: 560px)').matches, r = panel.getBoundingClientRect();
    head.setPointerCapture(e.pointerId);
    panelDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, mobile };
  });
  head.addEventListener('pointermove', (e) => {
    if (!panelDrag || panelDrag.id !== e.pointerId) return;
    const dx = e.clientX - panelDrag.sx, dy = e.clientY - panelDrag.sy;
    if (panelDrag.mobile) panel.style.transform = `translateY(${Math.max(0, dy)}px)`;
    else {
      panel.classList.add('dc-ai-moved');
      panel.style.left = `${Math.max(8, Math.min(innerWidth - panel.offsetWidth - 8, panelDrag.x + dx))}px`;
      panel.style.top = `${Math.max(8, Math.min(innerHeight - panel.offsetHeight - 8, panelDrag.y + dy))}px`;
    }
  });
  const endPanelDrag = (e) => {
    if (!panelDrag || panelDrag.id !== e.pointerId) return;
    const dy = e.clientY - panelDrag.sy;
    if (panelDrag.mobile) {
      panel.style.transform = '';
      if (dy > 90) setOpen(false); else if (dy < -55) panel.classList.add('expanded');
    } else if (Math.abs(dy) > 4 || Math.abs(e.clientX - panelDrag.sx) > 4) localStorage.setItem('dc-ai-panel-position', JSON.stringify({ x: panel.offsetLeft, y: panel.offsetTop }));
    panelDrag = null;
  };
  head.addEventListener('pointerup', endPanelDrag); head.addEventListener('pointercancel', endPanelDrag);
  close.addEventListener('click', () => setOpen(false));
  voiceReplyBtn.addEventListener('click', () => { voice = !voice; voiceReplyBtn.classList.toggle('active', voice); voiceReplyBtn.setAttribute('aria-label', voice ? 'Disable voice replies' : 'Enable voice replies'); if (!voice) window.speechSynthesis?.cancel(); });
  let recognition = null;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition(); recognition.lang = navigator.language || 'en-US'; recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => { dictate.classList.add('recording'); dictate.setAttribute('aria-label', 'Stop voice note'); dictate.title = 'Listening…'; };
    recognition.onresult = (event) => { const text = Array.from(event.results).map((r) => r[0]?.transcript || '').join(''); if (text) { input.value = text; resizeComposer(); } };
    recognition.onerror = (event) => { bubble('assistant', event.error === 'not-allowed' ? 'Microphone access is blocked. Allow microphone access in your browser to dictate a voice note.' : 'Voice input stopped. You can type your message instead.', 'error'); };
    recognition.onend = () => { dictate.classList.remove('recording'); dictate.setAttribute('aria-label', 'Add a voice note'); dictate.title = 'Speak your message'; };
  } else { dictate.title = 'Voice dictation is not available in this browser'; dictate.setAttribute('aria-label', 'Voice dictation is not available in this browser'); }
  dictate.addEventListener('click', () => {
    if (!recognition) { bubble('assistant', 'Voice dictation is not available in this browser. Try a current version of Chrome or Safari, or type your message.'); return; }
    try { dictate.classList.contains('recording') ? recognition.stop() : recognition.start(); } catch { /* ignore duplicate start */ }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); if (busy) return;
    const text = input.value.trim(); if (!text) return;
    if (history.length === 0) clear(messages);
    history.push({ role: 'user', content: text }); bubble('user', text); input.value = ''; resizeComposer(); busy = true; send.disabled = true;
    const pending = bubble('assistant', 'Thinking…', 'pending');
    try {
      if (await rollbackPrevious(text)) { pending.remove(); return; }
      const result = await api('/assistant/chat', { method: 'POST', body: { messages: history.slice(-12), page: location.hash.replace(/^#/, '') || '/' } });
      pending.remove(); history.push({ role: 'assistant', content: result.answer });
      const answerRow = bubble('assistant', result.answer);
      if (result.action) {
        const actionBar = h('div', { class: 'dc-ai-action' });
        const approve = h('button', { class: 'dc-ai-approve', type: 'button' }, 'Approve & implement');
        actionBar.append(approve); answerRow.append(actionBar);
        approve.addEventListener('click', async () => {
          approve.disabled = true; approve.textContent = 'Starting…';
          try {
            const started = await api('/assistant/execute', { method: 'POST', body: { token: result.action.token } });
            approve.remove();
            const progress = bubble('assistant', `Approved. Source${started.app ? ` for ${started.app.name}` : ''} and any local database backup are saved. Autopilot is now implementing the approved change, checking it, and preparing the deployment.`);
            history.push({ role: 'assistant', content: 'Owner approved the implementation plan.' });
            void watchRun(started.run, started.app, progress);
          } catch (err) { approve.disabled = false; approve.textContent = 'Approve & implement'; bubble('assistant', err.message || 'The approved task could not start.', 'error'); }
        });
      }
      if (voice && window.speechSynthesis) { const u = new SpeechSynthesisUtterance(result.answer); u.rate = 1.02; u.pitch = 1; window.speechSynthesis.speak(u); }
    } catch (err) { pending.remove(); bubble('assistant', err.message || 'I could not reach the AI service. Try again shortly.', 'error'); }
    finally { busy = false; send.disabled = false; if (matchMedia('(min-width: 561px)').matches) input.focus(); }
  });
  const keys = (e) => { if (e.key === 'Escape' && !closed) setOpen(false); if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && !e.repeat) { e.preventDefault(); setOpen(closed); } };
  document.addEventListener('keydown', keys);
  return { destroy() { window.speechSynthesis?.cancel(); if (recognition) { try { recognition.stop(); } catch { /* already stopped */ } } for (const t of timers) clearTimeout(t); timers.clear(); for (const s of streams) s.close(); streams.clear(); document.removeEventListener('keydown', keys); overlay.remove(); fab.remove(); } };
}
