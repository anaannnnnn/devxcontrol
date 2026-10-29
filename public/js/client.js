const out = document.getElementById('out');
const say = (t) => { out.textContent = t; };
document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  const r = await fetch('/api/client/session', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { say(j.detail || 'Sign-in failed'); return; }
  const home = await fetch('/api/client/home', { credentials: 'same-origin' });
  const data = await home.json();
  if (!home.ok) { say(data.detail || 'Could not open the room'); return; }
  const up = data.measured?.uptime24h ? `${data.app.uptime24h}% in 24h` : (data.measured?.note || 'Uptime not measured');
  out.replaceChildren();
  const box = document.createElement('div');
  box.style.display = 'grid'; box.style.gap = '8px';
  const h2 = document.createElement('h2'); h2.textContent = data.app.name;
  const p = document.createElement('p'); p.textContent = `${data.app.status}. ${up}`;
  const n = document.createElement('h3'); n.textContent = "What's new";
  const ul = document.createElement('ul');
  for (const item of data.whatsNew || []) { const li = document.createElement('li'); li.textContent = item.title; ul.append(li); }
  if (!data.whatsNew?.length) { const li = document.createElement('li'); li.textContent = 'Nothing published.'; ul.append(li); }
  const g = document.createElement('h3'); g.textContent = 'Gifts';
  const ul2 = document.createElement('ul');
  for (const item of data.gifts || []) { const li = document.createElement('li'); li.textContent = `${item.title} (${item.state})`; ul2.append(li); }
  if (!data.gifts?.length) { const li = document.createElement('li'); li.textContent = 'No gift yet.'; ul2.append(li); }
  const label = document.createElement('label'); label.textContent = 'Request a change';
  const area = document.createElement('textarea'); area.rows = 3; area.className = 'field';
  label.append(area);
  const send = document.createElement('button'); send.className = 'btn'; send.type = 'button'; send.textContent = 'Send request';
  send.onclick = async () => {
    const rr = await fetch('/api/client/requests', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: area.value }) });
    const jj = await rr.json().catch(() => ({}));
    say(rr.ok ? 'Request sent to the owner as a draft.' : (jj.detail || 'Could not send'));
  };
  const report = document.createElement('a'); report.href = '/api/client/report'; report.textContent = 'Monthly report';
  const bye = document.createElement('button'); bye.className = 'btn'; bye.type = 'button'; bye.textContent = 'Sign out';
  bye.onclick = async () => { await fetch('/api/client/session', { method: 'DELETE', credentials: 'same-origin' }); location.reload(); };
  box.append(h2, p, n, ul, g, ul2, label, send, report, bye);
  out.append(box);
};
