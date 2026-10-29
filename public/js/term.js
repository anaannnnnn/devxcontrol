// Terminal-style log view with filtering, level colouring and bounded memory.
import { h, clear, icon, copy } from './ui.js';

export function terminal({ wrap = true, max = 3000 } = {}) {
  const el = h('div', { class: `term ${wrap ? '' : 'nowrap'}`, role: 'log', 'aria-live': 'off', tabindex: 0, 'aria-label': 'Log output' });
  let lines = [], filter = '', paused = false, pending = [];
  const cls = (s) => (/\b(error|err|fatal|exception|panic|fail(ed)?|denied|refused|ECONN)\b/i.test(s) ? 'err' : /\b(warn(ing)?|deprecated)\b/i.test(s) ? 'wrn' : '');
  const node = (l) => {
    const m = /^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s(.*)$/s.exec(l.raw);
    const n = h('span', { class: `ln ${l.cls}` });
    if (m) n.append(h('span', { class: 'ts' }, m[1].slice(11, 19)), m[2]); else n.append(l.raw);
    return n;
  };
  const visible = () => (filter ? lines.filter((l) => l.raw.toLowerCase().includes(filter)) : lines);
  const stick = () => el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  function paint() {
    clear(el);
    const v = visible();
    if (!v.length) el.append(h('span', { class: 'term-empty' }, filter ? 'No lines match this filter.' : 'Waiting for output...'));
    else el.append(...v.map(node));
    el.scrollTop = el.scrollHeight;
  }
  function add(text) {
    const fresh = String(text).split('\n').filter((s) => s.length).map((raw) => ({ raw, cls: cls(raw) }));
    if (!fresh.length) return;
    if (paused) { pending.push(...fresh); return; }
    ingest(fresh);
  }
  function ingest(fresh) {
    const wasEmpty = !lines.length;
    const follow = stick();
    lines.push(...fresh);
    if (lines.length > max) lines = lines.slice(-max);
    if (wasEmpty) return paint();
    for (const l of fresh) if (!filter || l.raw.toLowerCase().includes(filter)) el.append(node(l));
    while (el.childNodes.length > max) el.firstChild.remove();
    if (follow) el.scrollTop = el.scrollHeight;
  }
  paint();
  return {
    el, add,
    reset() { lines = []; pending = []; paint(); },
    setFilter(q) { filter = q.trim().toLowerCase(); paint(); },
    setWrap(w) { el.classList.toggle('nowrap', !w); },
    setPaused(p) { paused = p; if (!p && pending.length) { const f = pending; pending = []; ingest(f); } },
    text: () => visible().map((l) => l.raw).join('\n'),
    count: () => lines.length,
  };
}
