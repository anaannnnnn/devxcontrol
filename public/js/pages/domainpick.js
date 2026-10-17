// "name" + dropdown of your connected domains = the full address. Falls back to a free-text domain.
import { h, clear } from '../ui.js';
import { api } from '../api.js';

let cache = null;
export const loadDomains = () => (cache ? Promise.resolve(cache) : api('/dns/domains').then((d) => (cache = d)).catch(() => ({ domains: [], errors: {} })));
export const forgetDomains = () => { cache = null; };

/** onChange(fullHost) fires on every edit ('' when nothing usable). `hint` is the placeholder for the name part. */
export function domainPicker({ value = '', hint = 'app', onChange }) {
  const box = h('div', { class: 'stack', style: { gap: '6px' } });
  let sub = ''; let base = ''; let custom = value;
  const paint = (d) => {
    const list = d.domains || [];
    const hit = list.find((x) => value && value.endsWith(`.${x.name}`));
    if (hit) { base = hit.name; sub = value.slice(0, -(hit.name.length + 1)); custom = ''; } else { base = list[0]?.name || ''; if (value) base = ''; }
    const preview = h('div', { class: 'mono small muted' });
    const out = () => { const host = base ? (sub ? `${sub}.${base}` : '') : custom.trim().toLowerCase(); preview.textContent = host ? `https://${host}` : 'No domain: the app is only reachable inside the server.'; onChange(host); };
    const draw = () => {
      clear(box);
      const subIn = h('input', { class: 'field mono', placeholder: hint, value: sub, autocomplete: 'off', 'aria-label': 'Name', style: { flex: '1 1 120px', minWidth: 0 }, oninput: (e) => { sub = e.target.value.trim().toLowerCase().replace(/[^a-z0-9.-]/g, ''); e.target.value = sub; out(); } });
      const full = h('input', { class: 'field mono', placeholder: 'app.example.com', value: custom, autocomplete: 'off', 'aria-label': 'Full domain', style: { flex: '1 1 200px', minWidth: 0 }, oninput: (e) => { custom = e.target.value; out(); } });
      const sel = h('select', { class: 'field', 'aria-label': 'Domain', style: { flex: '1 1 160px', minWidth: 0 }, onchange: (e) => { base = e.target.value === '__custom' ? '' : e.target.value; draw(); } },
        ...list.map((x) => h('option', { value: x.name, selected: x.name === base }, `${x.name} (${x.provider})`)), h('option', { value: '__custom', selected: !base }, 'Other domain...'));
      box.append(h('div', { class: 'row', style: { gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, base ? [subIn, h('span', { class: 'muted' }, '.'), sel] : [list.length ? sel : null, full]), preview,
        !list.length && h('span', { class: 'muted small' }, 'Connect Cloudflare or GoDaddy in Connections to pick from your domains and get the DNS record made for you.'),
        Object.values(d.errors || {}).map((e) => h('span', { class: 'muted small' }, e)));
      out();
    };
    draw();
  };
  box.append(h('span', { class: 'muted small' }, 'Loading your domains ...'));
  loadDomains().then(paint);
  return box;
}
