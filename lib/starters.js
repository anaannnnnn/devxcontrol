// Starter apps that work with no AI at all. Each one is a complete, tested, zero-dependency app: pick it, give it a name, deploy.
// "CRUD" starters share one well-tested server and page, configured by their fields. Static starters are single pages.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `:root{--bg:#f7f8fa;--fg:#14171c;--mut:#5b6472;--card:#fff;--bd:#e2e6ec;--ac:#2563eb;--acfg:#fff;--bad:#c62828;--r:12px}
@media(prefers-color-scheme:dark){:root{--bg:#0f1218;--fg:#e8ebf0;--mut:#9aa4b2;--card:#171b23;--bd:#262c37;--ac:#6ea0ff;--acfg:#0b1220;--bad:#ff8a80}}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
main{max-width:860px;margin:0 auto;padding:20px 16px 60px}h1{font-size:1.6rem;margin:.2em 0}p.sub{color:var(--mut);margin-top:0}
.card{background:var(--card);border:1px solid var(--bd);border-radius:var(--r);padding:16px;margin:14px 0}
form{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}label{display:grid;gap:4px;font-size:.88rem;color:var(--mut)}
input,select,textarea{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--bd);border-radius:8px;padding:10px;min-height:44px;width:100%}
input[type=checkbox]{width:24px;min-height:24px}textarea{min-height:90px}
button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid var(--bd);background:var(--card);color:var(--fg);padding:10px 16px;min-height:44px}
button.p{background:var(--ac);color:var(--acfg);border-color:var(--ac);font-weight:600}button.d{color:var(--bad)}
:focus-visible{outline:3px solid var(--ac);outline-offset:2px}
.item{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;border-top:1px solid var(--bd);padding:12px 0}.item:first-child{border-top:0}
.item .t{font-weight:600}.item .m{color:var(--mut);font-size:.9rem;white-space:pre-wrap;word-break:break-word}.done .t{text-decoration:line-through;opacity:.6}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.bar input{flex:1;min-width:160px}.sum{color:var(--mut)}.empty{color:var(--mut);text-align:center;padding:24px}`;

function crudServer(title) {
  return `'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = +process.env.PORT || 3000, DATA = path.join(__dirname, 'data', 'items.json'), PASS = process.env.APP_PASSWORD || '';
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
fs.mkdirSync(path.dirname(DATA), { recursive: true });
let items = []; try { items = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { items = []; }
let saving = Promise.resolve();
const save = () => (saving = saving.then(() => fs.promises.writeFile(DATA + '.tmp', JSON.stringify(items)).then(() => fs.promises.rename(DATA + '.tmp', DATA))).catch(() => {}));
const TYPES = { text: (v) => String(v ?? '').slice(0, 300), textarea: (v) => String(v ?? '').slice(0, 5000), number: (v) => (Number.isFinite(+v) && v !== '' ? +v : null), date: (v) => (/^\\d{4}-\\d{2}-\\d{2}$/.test(v) ? v : ''), checkbox: (v) => v === true || v === 'true', select: (v, f) => (f.options.includes(v) ? v : f.options[0]) };
const clean = (b) => { const o = {}; for (const f of CFG.fields) o[f.name] = TYPES[f.type](b[f.name], f); return o; };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type + '; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
const body = (req) => new Promise((ok, no) => { let n = 0, b = ''; req.on('data', (c) => { n += c.length; if (n > 20000) { no(new Error('too big')); req.destroy(); } else b += c; }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { no(new Error('bad json')); } }); });
const authed = (req) => { if (!PASS) return true; const m = /^Basic (.+)$/.exec(req.headers.authorization || ''); if (!m) return false; const p = Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':'); const a = crypto.createHash('sha256').update(p).digest(), b = crypto.createHash('sha256').update(PASS).digest(); return crypto.timingSafeEqual(a, b); };
const page = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname;
  if (p === '/healthz') return send(res, 200, 'ok', 'text/plain');
  if (!authed(req)) { res.writeHead(401, { 'www-authenticate': 'Basic realm="${esc(title)}"' }); return res.end('Password needed'); }
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, 200, page, 'text/html');
    if (req.method === 'GET' && p === '/api/config') return send(res, 200, CFG);
    if (p === '/api/items' && req.method === 'GET') return send(res, 200, items);
    if (p === '/api/items' && req.method === 'POST') { const it = { id: crypto.randomUUID(), at: Date.now(), ...clean(await body(req)) }; items.unshift(it); if (items.length > 5000) items.pop(); save(); return send(res, 201, it); }
    const m = /^\\/api\\/items\\/([a-f0-9-]{36})$/.exec(p);
    if (m) {
      const i = items.findIndex((x) => x.id === m[1]); if (i < 0) return send(res, 404, { error: 'not found' });
      if (req.method === 'DELETE') { items.splice(i, 1); save(); return send(res, 200, { ok: true }); }
      if (req.method === 'PUT') { items[i] = { ...items[i], ...clean({ ...items[i], ...(await body(req)) }) }; save(); return send(res, 200, items[i]); }
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 400, { error: e.message }); }
}).listen(PORT, () => console.log('listening on ' + PORT));
`;
}

function crudPage(c) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.title)}</title><style>${CSS}</style></head><body><main>
<h1>${esc(c.title)}</h1><p class="sub">${esc(c.sub)}</p>
<section class="card"><form id="f" aria-label="Add"><div id="fields" style="display:contents"></div><div style="align-self:end"><button class="p" type="submit">${esc(c.add)}</button></div></form></section>
<section class="card"><div class="bar"><input id="q" type="search" placeholder="Search" aria-label="Search"><span class="sum" id="sum" aria-live="polite"></span></div><div id="list"></div></section></main>
<script>
const $=(s)=>document.querySelector(s);let CFG,items=[];
const api=async(u,o)=>{const r=await fetch(u,o&&{method:o.method,headers:{'content-type':'application/json'},body:o.body&&JSON.stringify(o.body)});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||r.status);return r.json()};
const el=(t,a={},...k)=>{const e=document.createElement(t);for(const[x,v]of Object.entries(a))x==='class'?e.className=v:e[x]=v;e.append(...k);return e};
function build(){const box=$('#fields');for(const f of CFG.fields){const id='f_'+f.name;let inp;
 if(f.type==='textarea')inp=el('textarea',{id,name:f.name});else if(f.type==='select'){inp=el('select',{id,name:f.name},...f.options.map(o=>el('option',{value:o},o)))}
 else inp=el('input',{id,name:f.name,type:f.type==='checkbox'?'checkbox':f.type==='number'?'number':f.type==='date'?'date':'text'});
 if(f.type==='number')inp.step='any';if(f.req)inp.required=true;if(f.type==='date'&&f.today)inp.value=new Date().toISOString().slice(0,10);
 box.append(el('label',{htmlFor:id},f.label,inp))}}
async function load(){items=await api('/api/items');draw()}
function draw(){const q=$('#q').value.toLowerCase();const L=$('#list');L.textContent='';
 const rows=items.filter(i=>!q||CFG.fields.some(f=>String(i[f.name]).toLowerCase().includes(q)));
 if(!rows.length)L.append(el('div',{class:'empty'},items.length?'Nothing matches.':CFG.empty));
 const num=CFG.fields.find(f=>f.type==='number'&&f.sum);$('#sum').textContent=rows.length+(rows.length===1?' item':' items')+(num?' · '+num.label+' total '+rows.reduce((a,i)=>a+(+i[num.name]||0),0).toLocaleString():'');
 for(const i of rows){const first=CFG.fields[0];const meta=CFG.fields.slice(1).filter(f=>f.type!=='checkbox'&&i[f.name]!==''&&i[f.name]!==null).map(f=>f.label+': '+i[f.name]).join('\\n');
  const chk=CFG.fields.find(f=>f.type==='checkbox');const row=el('div',{class:'item'+(chk&&i[chk.name]?' done':'')});
  const left=el('div',{},el('div',{class:'t'},String(i[first.name]||'(untitled)')),el('div',{class:'m'},meta));
  const right=el('div',{class:'bar'});
  if(chk){const b=el('button',{type:'button',title:chk.label,ariaLabel:chk.label+': '+(i[chk.name]?'yes':'no')},i[chk.name]?'Undo':chk.label);b.onclick=async()=>{await api('/api/items/'+i.id,{method:'PUT',body:{[chk.name]:!i[chk.name]}});load()};right.append(b)}
  const d=el('button',{type:'button',class:'d',ariaLabel:'Delete'},'Delete');d.onclick=async()=>{if(confirm('Delete this?')){await api('/api/items/'+i.id,{method:'DELETE'});load()}};right.append(d);
  row.append(left,right);L.append(row)}}
$('#f').onsubmit=async(e)=>{e.preventDefault();const b={};for(const f of CFG.fields){const n=$('#f_'+f.name);b[f.name]=f.type==='checkbox'?n.checked:n.value}
 try{await api('/api/items',{method:'POST',body:b});e.target.reset();for(const f of CFG.fields)if(f.type==='date'&&f.today)$('#f_'+f.name).value=new Date().toISOString().slice(0,10);load()}catch(x){alert(x.message)}};
$('#q').oninput=draw;
api('/api/config').then(c=>{CFG=c;build();return load()});
</script></body></html>`;
}

const CRUD = {
  todo: { label: 'To-do list', note: 'Tasks you can tick off.', title: 'To-do list', sub: 'Things to get done.', add: 'Add task', empty: 'No tasks yet. Add the first one above.', fields: [{ name: 'task', label: 'Task', type: 'text', req: true }, { name: 'due', label: 'Due', type: 'date' }, { name: 'done', label: 'Done', type: 'checkbox' }] },
  notes: { label: 'Notes', note: 'Quick notes you can search.', title: 'Notes', sub: 'Write it down, find it later.', add: 'Save note', empty: 'No notes yet.', fields: [{ name: 'title', label: 'Title', type: 'text', req: true }, { name: 'text', label: 'Note', type: 'textarea' }] },
  contacts: { label: 'Contacts / CRM', note: 'People, companies and follow-ups.', title: 'Contacts', sub: 'Everyone you talk to, in one place.', add: 'Add contact', empty: 'No contacts yet.', fields: [{ name: 'name', label: 'Name', type: 'text', req: true }, { name: 'company', label: 'Company', type: 'text' }, { name: 'email', label: 'Email', type: 'text' }, { name: 'phone', label: 'Phone', type: 'text' }, { name: 'stage', label: 'Stage', type: 'select', options: ['Lead', 'Talking', 'Customer', 'Lost'] }, { name: 'notes', label: 'Notes', type: 'textarea' }] },
  expenses: { label: 'Expense tracker', note: 'Spending with running total.', title: 'Expenses', sub: 'Track what you spend.', add: 'Add expense', empty: 'No expenses yet.', fields: [{ name: 'what', label: 'What', type: 'text', req: true }, { name: 'amount', label: 'Amount', type: 'number', req: true, sum: true }, { name: 'date', label: 'Date', type: 'date', today: true }, { name: 'category', label: 'Category', type: 'select', options: ['Food', 'Travel', 'Bills', 'Shopping', 'Other'] }] },
  bookings: { label: 'Booking requests', note: 'Customers request a time, you confirm.', title: 'Bookings', sub: 'Appointments and requests.', add: 'Add booking', empty: 'No bookings yet.', fields: [{ name: 'name', label: 'Customer', type: 'text', req: true }, { name: 'service', label: 'Service', type: 'text' }, { name: 'date', label: 'Date', type: 'date', req: true }, { name: 'time', label: 'Time', type: 'text' }, { name: 'phone', label: 'Phone', type: 'text' }, { name: 'confirmed', label: 'Confirm', type: 'checkbox' }] },
  inventory: { label: 'Inventory', note: 'Items and quantities.', title: 'Inventory', sub: 'What you have in stock.', add: 'Add item', empty: 'Nothing in stock yet.', fields: [{ name: 'item', label: 'Item', type: 'text', req: true }, { name: 'qty', label: 'Quantity', type: 'number', sum: true }, { name: 'location', label: 'Location', type: 'text' }, { name: 'price', label: 'Price', type: 'number' }] },
  bookmarks: { label: 'Bookmarks', note: 'Saved links with tags.', title: 'Bookmarks', sub: 'Links worth keeping.', add: 'Save link', empty: 'No links yet.', fields: [{ name: 'title', label: 'Title', type: 'text', req: true }, { name: 'url', label: 'Link', type: 'text' }, { name: 'tag', label: 'Tag', type: 'text' }] },
  standup: { label: 'Team standup', note: 'Yesterday, today, blockers.', title: 'Standup', sub: 'What everyone is up to.', add: 'Post update', empty: 'No updates yet.', fields: [{ name: 'who', label: 'Name', type: 'text', req: true }, { name: 'yesterday', label: 'Yesterday', type: 'textarea' }, { name: 'today', label: 'Today', type: 'textarea' }, { name: 'blockers', label: 'Blockers', type: 'textarea' }, { name: 'date', label: 'Date', type: 'date', today: true }] },
};

const STATIC_CSS = `:root{--bg:#fff;--fg:#14171c;--mut:#5b6472;--ac:#2563eb;--acfg:#fff;--card:#f4f6fa;--bd:#e2e6ec}@media(prefers-color-scheme:dark){:root{--bg:#0f1218;--fg:#e8ebf0;--mut:#9aa4b2;--ac:#6ea0ff;--acfg:#0b1220;--card:#171b23;--bd:#262c37}}
*{box-sizing:border-box}body{margin:0;font:17px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}a{color:var(--ac)}
header,section,footer{max-width:960px;margin:0 auto;padding:28px 18px}nav{display:flex;gap:16px;flex-wrap:wrap;align-items:center;justify-content:space-between}nav a{text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
.hero{padding:64px 18px 40px}.hero h1{font-size:clamp(2rem,6vw,3.4rem);line-height:1.1;margin:.2em 0}.hero p{color:var(--mut);font-size:1.15rem;max-width:36em}
.btn{display:inline-flex;align-items:center;min-height:48px;padding:0 22px;border-radius:10px;background:var(--ac);color:var(--acfg);font-weight:600;text-decoration:none}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:18px}.card h3{margin:.1em 0 .3em}.card p{margin:0;color:var(--mut)}
h2{font-size:1.6rem}footer{color:var(--mut);border-top:1px solid var(--bd);font-size:.9rem}:focus-visible{outline:3px solid var(--ac);outline-offset:2px}`;
const staticPage = (t, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t)}</title><meta name="description" content="${esc(t)}"><style>${STATIC_CSS}</style></head><body>${body}</body></html>`;
const STATIC = {
  landing: { label: 'Business landing page', note: 'Hero, services, contact.', build: (n) => staticPage(n, `<header><nav><b>${esc(n)}</b><span><a href="#services">Services</a> <a href="#contact">Contact</a></span></nav></header><div class="hero" style="max-width:960px;margin:0 auto"><h1>${esc(n)}: simple, reliable, local.</h1><p>Tell visitors what you do and why they should trust you, in two sentences.</p><a class="btn" href="#contact">Get in touch</a></div><section id="services"><h2>What we do</h2><div class="grid"><div class="card"><h3>Service one</h3><p>A short line about the first thing you offer.</p></div><div class="card"><h3>Service two</h3><p>A short line about the second thing you offer.</p></div><div class="card"><h3>Service three</h3><p>A short line about the third thing you offer.</p></div></div></section><section id="contact"><h2>Contact</h2><p>Email <a href="mailto:hello@example.com">hello@example.com</a> or call <a href="tel:+10000000000">+1 000 000 0000</a>.</p></section><footer>&copy; ${esc(n)}</footer>`) },
  portfolio: { label: 'Portfolio', note: 'About, work, contact.', build: (n) => staticPage(n, `<header><nav><b>${esc(n)}</b><span><a href="#work">Work</a> <a href="#about">About</a></span></nav></header><div class="hero" style="max-width:960px;margin:0 auto"><h1>Hi, I am ${esc(n)}.</h1><p>I design and build things for the web. Replace this with one sentence about you.</p></div><section id="work"><h2>Selected work</h2><div class="grid"><div class="card"><h3>Project one</h3><p>What it was and what you did.</p></div><div class="card"><h3>Project two</h3><p>What it was and what you did.</p></div><div class="card"><h3>Project three</h3><p>What it was and what you did.</p></div></div></section><section id="about"><h2>About</h2><p>A short paragraph about your background and how to reach you.</p></section><footer>&copy; ${esc(n)}</footer>`) },
  linkinbio: { label: 'Link in bio', note: 'A page of links for social profiles.', build: (n) => staticPage(n, `<section style="max-width:520px;text-align:center"><h1>${esc(n)}</h1><p style="color:var(--mut)">Your one-line bio.</p><p><a class="btn" style="width:100%;justify-content:center" href="https://example.com">My website</a></p><p><a class="btn" style="width:100%;justify-content:center" href="https://example.com">Latest video</a></p><p><a class="btn" style="width:100%;justify-content:center" href="mailto:hello@example.com">Email me</a></p></section>`) },
  menu: { label: 'Restaurant menu', note: 'Menu with prices and hours.', build: (n) => staticPage(n, `<header><nav><b>${esc(n)}</b><span><a href="#menu">Menu</a> <a href="#hours">Hours</a></span></nav></header><div class="hero" style="max-width:960px;margin:0 auto"><h1>${esc(n)}</h1><p>Fresh food, made every day.</p></div><section id="menu"><h2>Menu</h2><div class="grid"><div class="card"><h3>Dish one &middot; 9</h3><p>What is in it.</p></div><div class="card"><h3>Dish two &middot; 11</h3><p>What is in it.</p></div><div class="card"><h3>Dish three &middot; 7</h3><p>What is in it.</p></div></div></section><section id="hours"><h2>Opening hours</h2><p>Mon to Fri 9:00 to 21:00<br>Sat and Sun 10:00 to 22:00</p></section><footer>&copy; ${esc(n)}</footer>`) },
};

export const STARTERS = [
  ...Object.entries(CRUD).map(([id, c]) => ({ id, kind: 'crud', template: 'node', label: c.label, note: c.note })),
  ...Object.entries(STATIC).map(([id, c]) => ({ id, kind: 'static', template: 'static', label: c.label, note: c.note })),
];

/** Files for a starter. name is the app title the owner chose. */
export function starterFiles(id, name = '') {
  const n = String(name || '').trim().slice(0, 60);
  if (CRUD[id]) { const c = { ...CRUD[id], title: n || CRUD[id].title }; return { name: c.title, tagline: CRUD[id].note, template: 'node', files: [
    { path: 'server.js', content: crudServer(c.title) }, { path: 'config.json', content: JSON.stringify({ title: c.title, empty: c.empty, fields: c.fields }, null, 2) }, { path: 'public/index.html', content: crudPage(c) }, { path: 'README.md', content: `# ${c.title}\n\nZero-dependency Node app. Data is saved in ./data/items.json.\nSet APP_PASSWORD to require a password (any username).\n` }] }; }
  if (STATIC[id]) { const t = n || STATIC[id].label; return { name: t, tagline: STATIC[id].note, template: 'static', files: [{ path: 'index.html', content: STATIC[id].build(t) }] }; }
  return null;
}

/** Best starter for a free-text description, used as the safety net when the AI is unavailable or fails. */
export function pickStarter(text) {
  const t = String(text).toLowerCase();
  const rules = [['todo', /to-?do|task|checklist|chores/], ['expenses', /expense|spend|budget|cost|money|split/], ['bookings', /book|appointment|reserv|schedul/], ['contacts', /crm|contact|customer|client|lead|people/], ['inventory', /inventory|stock|product|warehouse/], ['standup', /stand-?up|team update|daily/], ['bookmarks', /bookmark|links?\b|reading list/], ['notes', /note|journal|diary|memo/], ['menu', /menu|restaurant|cafe|food/], ['portfolio', /portfolio|resume|cv\b|personal site/], ['linkinbio', /link in bio|linktree/], ['landing', /landing|website|business|shop|company|bakery|barber|service/]];
  for (const [id, re] of rules) if (re.test(t)) return id; return 'notes';
}
