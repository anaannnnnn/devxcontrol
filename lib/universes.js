// Parallel Universes: three deterministic, contrast-checked design layers. Copy tweaks are optional and never required.
import { ensureContrast } from './themelab.js';
import { contrast } from './themes.js';

export const DIRECTIONS = [
  { id: 'editorial', name: 'Calm editorial', blurb: 'Wide margins, serif headlines, paper and ink.' },
  { id: 'brutalist', name: 'Bold neo-brutalist', blurb: 'Hard borders, flat colour, no blur.' },
  { id: 'glass', name: 'Dark glass', blurb: 'Black field, translucent panels, one violet accent.' },
];

const PRESET = {
  editorial: { bg: '#f7f3ea', surface: '#fffdf8', text: '#1c1915', muted: '#5c564c', accent: '#8c3a2f', radius: '2px', font: 'Georgia, "Times New Roman", serif' },
  brutalist: { bg: '#fffdf5', surface: '#ffffff', text: '#111111', muted: '#333333', accent: '#ff3b00', radius: '0px', font: 'ui-sans-serif, system-ui, sans-serif' },
  glass: { bg: '#07060d', surface: '#161226', text: '#f4f1ff', muted: '#b7aed4', accent: '#9b7bff', radius: '18px', font: 'ui-sans-serif, system-ui, sans-serif' },
};

function layer(palette, preset) {
  const bg = palette.bg || preset.bg;
  const surface = palette.surface || preset.surface;
  const text = ensureContrast(palette.text || preset.text, bg, 7);
  const muted = ensureContrast(palette.muted || preset.muted, surface, 4.5);
  const accent = ensureContrast(palette.accent || preset.accent, bg, 3);
  const onAccent = contrast('#ffffff', accent) >= contrast('#0b0b0f', accent) ? '#ffffff' : '#0b0b0f';
  const checks = [
    { label: 'Text on background', ratio: Math.round(contrast(text, bg) * 100) / 100, min: 4.5 },
    { label: 'Muted on surface', ratio: Math.round(contrast(muted, surface) * 100) / 100, min: 4.5 },
    { label: 'Accent on background', ratio: Math.round(contrast(accent, bg) * 100) / 100, min: 3 },
  ].map((c) => ({ ...c, ok: c.ratio >= c.min }));
  return { bg, surface, text, muted, accent, onAccent, radius: preset.radius, font: preset.font, checks };
}

export function buildDirections({ keepBrand = true, brand = null } = {}) {
  return DIRECTIONS.map((d) => {
    const preset = PRESET[d.id];
    const palette = keepBrand && brand ? { ...preset, ...brand } : preset;
    const t = layer(palette, preset);
    const brutal = d.id === 'brutalist' ? 'button, .btn, input, select { border: 2px solid #111 !important; box-shadow: 4px 4px 0 #111 !important; }' : '';
    const glass = d.id === 'glass' ? '.card, article, section, nav { background: color-mix(in srgb, var(--dx-surface) 78%, transparent) !important; backdrop-filter: blur(16px); }' : '';
    const css = `/* universe:${d.id} keepBrand:${keepBrand ? '1' : '0'} — deterministic, contrast-checked */\n:root{--dx-bg:${t.bg};--dx-surface:${t.surface};--dx-text:${t.text};--dx-muted:${t.muted};--dx-accent:${t.accent};--dx-on:${t.onAccent};--dx-radius:${t.radius}}\nhtml,body{background:var(--dx-bg)!important;color:var(--dx-text)!important;font-family:${t.font}!important}\na{color:var(--dx-accent)!important}\nbutton,.btn,[role="button"]{background:var(--dx-accent)!important;color:var(--dx-on)!important;border-radius:var(--dx-radius)!important;min-height:44px}\ninput,select,textarea{background:var(--dx-surface)!important;color:var(--dx-text)!important;border-radius:var(--dx-radius)!important}\n${brutal}${glass}\n:focus-visible{outline:2px solid var(--dx-accent)!important;outline-offset:2px}`;
    return {
      id: d.id, name: d.name, blurb: d.blurb, keepBrand: !!keepBrand, css, colors: { bg: t.bg, surface: t.surface, text: t.text, muted: t.muted, accent: t.accent },
      contrast: t.checks, copy: null, copyReason: 'Copy tweaks are not included until an AI model is connected. The CSS layer does not need one.',
    };
  });
}

const HEX = /^#[0-9a-f]{6}$/;
export function brandFromColors(colors = []) {
  const list = colors.filter((c) => HEX.test(c));
  if (list.length < 2) return null;
  return { bg: list[0], surface: list[1] || list[0], text: list[2] || '#111111', muted: list[3] || '#555555', accent: list[4] || list[1] };
}
