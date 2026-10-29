// Design Debt Radar: deterministic CSS/HTML consistency scan. No AI, no network.
import fs from 'node:fs';
import path from 'node:path';
import { contrast } from './themes.js';

const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|out|coverage|vendor|\.venv|venv)(\/|$)/;
const HEX = /#([0-9a-f]{3}|[0-9a-f]{6})\b/gi;
const RGB = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi;

export function expandHex(h) {
  const s = h.replace('#', '').toLowerCase();
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return `#${f}`;
}
const dist = (a, b) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(expandHex(h).slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

export function walkStyleFiles(dir, limit = 160) {
  const out = [];
  const walk = (rel, depth) => {
    if (depth > 6 || out.length >= limit) return;
    let ents = [];
    try { ents = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (SKIP.test(r)) continue;
      if (e.isDirectory()) walk(r, depth + 1);
      else if (/\.(css|html?|scss)$/i.test(e.name)) out.push(r);
      if (out.length >= limit) return;
    }
  };
  walk('', 0);
  return out;
}

function colorsIn(text) {
  const found = [];
  for (const m of text.matchAll(HEX)) found.push(expandHex(m[0]));
  for (const m of text.matchAll(RGB)) {
    const hex = `#${[m[1], m[2], m[3]].map((n) => Math.min(255, +n).toString(16).padStart(2, '0')).join('')}`;
    found.push(hex);
  }
  return found;
}

function ruleBlocks(css) {
  const blocks = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) blocks.push({ sel: m[1].trim(), body: m[2] });
  return blocks;
}

/** @param {{path:string,text:string}[]} files */
export function analyseAssets(files) {
  const cssFiles = files.filter((f) => /\.(css|scss)$/i.test(f.path));
  const htmlFiles = files.filter((f) => /\.html?$/i.test(f.path));
  if (!cssFiles.length && !htmlFiles.length) {
    return { measured: false, reason: 'not measured: no CSS or HTML files were found in this app directory.', score: null, causes: [], pages: [], tokens: [] };
  }
  const colorCount = new Map();
  const radii = new Map();
  const spaces = new Map();
  const buttons = new Map();
  const causes = [];
  const pages = [];
  let focusMissing = 0; let contrastFails = 0; let tinyTaps = 0;

  const bump = (map, k) => { if (!k) return; map.set(k, (map.get(k) || 0) + 1); };
  for (const f of [...cssFiles, ...htmlFiles]) {
    const cols = colorsIn(f.text);
    cols.forEach((c) => bump(colorCount, c));
    const page = { path: f.path, colors: cols.length, issues: [] };
    if (/\.(css|scss)$/i.test(f.path)) {
      for (const b of ruleBlocks(f.text)) {
        const rad = b.body.match(/border-radius:\s*([0-9.]+px)/i)?.[1];
        bump(radii, rad);
        for (const sp of b.body.matchAll(/(?:margin|padding)(?:-[a-z]+)?:\s*([0-9.]+px)/gi)) bump(spaces, sp[1]);
        if (/button|\.btn|\[role=.?button/i.test(b.sel)) {
          const sig = [b.body.match(/background(?:-color)?:\s*([^;]+)/i)?.[1]?.trim(), rad, b.body.match(/padding:\s*([^;]+)/i)?.[1]?.trim()].filter(Boolean).join('|');
          bump(buttons, sig || b.sel.slice(0, 40));
          const fs = +(b.body.match(/font-size:\s*([0-9.]+)px/i)?.[1] || 16);
          const mh = +(b.body.match(/min-height:\s*([0-9.]+)px/i)?.[1] || 0);
          if (fs < 14 || (mh && mh < 44)) { tinyTaps++; page.issues.push('tiny-tap'); }
        }
        const fg = b.body.match(/(?:^|;)\s*color:\s*(#[0-9a-f]{3,6})/i)?.[1];
        const bg = b.body.match(/background(?:-color)?:\s*(#[0-9a-f]{3,6})/i)?.[1];
        if (fg && bg) {
          try {
            const ratio = contrast(expandHex(fg), expandHex(bg));
            if (ratio < 4.5) { contrastFails++; page.issues.push('low-contrast'); }
          } catch { /* ignore non-hex */ }
        }
      }
      if (/outline\s*:\s*(none|0)\b/i.test(f.text) && !/:focus-visible|:focus\b/i.test(f.text)) { focusMissing++; page.issues.push('missing-focus'); }
    }
    pages.push({ path: page.path, issues: [...new Set(page.issues)], heat: page.issues.length });
  }

  const palette = [...colorCount.entries()].sort((a, b) => b[1] - a[1]);
  const core = palette.slice(0, 6).map(([c]) => c);
  const off = palette.filter(([c]) => core.length && !core.some((k) => dist(c, k) < 28)).map(([c, n]) => ({ color: c, count: n }));
  const dupes = [];
  const keys = palette.map(([c]) => c);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const d = dist(keys[i], keys[j]);
    if (d > 0 && d < 18) dupes.push([keys[i], keys[j]]);
  }
  const add = (id, label, count, detail) => { if (count > 0) causes.push({ id, label, count, detail }); };
  add('off-palette', 'Off-palette colours', off.length, off.slice(0, 8).map((x) => `${x.color} ×${x.count}`).join(', ') || '');
  add('near-duplicate', 'Near-duplicate colours', dupes.length, dupes.slice(0, 6).map((p) => p.join(' ~ ')).join('; '));
  add('spacing-drift', 'Spacing drift', Math.max(0, spaces.size - 6), `${spaces.size} distinct px spacing values`);
  add('radii', 'Inconsistent radii', Math.max(0, radii.size - 4), `${radii.size} distinct border-radius values`);
  add('buttons', 'Too many button styles', Math.max(0, buttons.size - 3), `${buttons.size} button signatures`);
  add('tap-target', 'Tiny tap targets', tinyTaps, 'A control uses font-size under 14px or min-height under 44px.');
  add('low-contrast', 'Low contrast', contrastFails, 'A colour and background in the same rule are below 4.5:1.');
  add('missing-focus', 'Missing focus styles', focusMissing, 'outline is removed and no :focus or :focus-visible rule was found in that file.');

  let score = 100;
  const weight = { 'off-palette': 4, 'near-duplicate': 3, 'spacing-drift': 4, radii: 4, buttons: 6, 'tap-target': 8, 'low-contrast': 10, 'missing-focus': 8 };
  for (const c of causes) score -= Math.min(24, (weight[c.id] || 4) * Math.min(c.count, 4));
  score = Math.max(0, Math.min(100, score));
  return {
    measured: true, reason: null, score, causes, pages: pages.filter((p) => p.issues.length).slice(0, 40),
    tokens: core, counts: { colors: palette.length, radii: radii.size, spaces: spaces.size, buttons: buttons.size },
    scanned: { css: cssFiles.length, html: htmlFiles.length },
  };
}

export function readAndAnalyse(dir) {
  if (!dir || !fs.existsSync(dir)) return { measured: false, reason: 'not measured: the app directory is not on this machine.', score: null, causes: [], pages: [], tokens: [] };
  const names = walkStyleFiles(dir);
  const files = [];
  for (const n of names) {
    try {
      const text = fs.readFileSync(path.join(dir, n), 'utf8');
      if (text.length > 220000) continue;
      files.push({ path: n, text });
    } catch { /* unreadable */ }
  }
  return analyseAssets(files);
}

/** Map stray colours onto the nearest kept token. Deterministic CSS layer, no source rewrite here. */
export function normaliseCss(analysis) {
  if (!analysis?.measured) return { ok: false, reason: analysis?.reason || 'Nothing to normalise.' };
  const tokens = analysis.tokens?.length ? analysis.tokens : ['#0b0b12', '#f4f1ff', '#7c5cff'];
  const vars = tokens.map((c, i) => `  --dx-${i}: ${c};`).join('\n');
  const off = (analysis.causes.find((c) => c.id === 'off-palette')?.detail || '').split(',').map((s) => s.trim().split(' ')[0]).filter((c) => /^#[0-9a-f]{6}$/.test(c));
  const maps = off.map((c) => {
    let best = tokens[0]; let bd = Infinity;
    for (const t of tokens) { const d = dist(c, t); if (d < bd) { bd = d; best = t; } }
    return { from: c, to: best };
  });
  const rules = maps.map((m) => `/* ${m.from} -> ${m.to} */`).join('\n');
  const css = `/* devx design-debt normalise — generated, deterministic */\n:root {\n${vars}\n}\n${rules}\nbutton, [role="button"], .btn { min-height: 44px; }\n:focus-visible { outline: 2px solid var(--dx-2, currentColor); outline-offset: 2px; }\n`;
  return { ok: true, css, mappings: maps, explain: `Mapped ${maps.length} off-palette colour${maps.length === 1 ? '' : 's'} to the nearest token and added a 44px tap target plus a visible focus ring.` };
}
