import { h, clear, icon, modal } from './ui.js';

function onLook(row, fn) {
  const sync = () => {
    if (!row.isConnected) {
      window.removeEventListener('dc:scheme', sync);
      window.removeEventListener('dc:look', sync);
      return;
    }
    fn();
  };
  window.addEventListener('dc:scheme', sync);
  window.addEventListener('dc:look', sync);
  return sync;
}

// Swatches for the system menu and the demo dock. The full editor is openAppearance().
export function schemePicker({ dock = false } = {}) {
  const S = window.dcScheme; if (!S) return null;
  const keys = Object.keys(S.SCHEMES);
  const btns = keys.map((k) => {
    const v = S.SCHEMES[k];
    return h('button', {
      class: 'sw', type: 'button', title: v.label, 'aria-label': `${v.label} color`,
      'aria-pressed': String(S.get() === k), style: { '--c': v.dot },
      onclick: () => S.set(k),
    });
  });
  const tune = dock ? h('button', {
    class: 'sw tune', type: 'button', title: 'Themes, kits and customize', 'aria-label': 'Themes, kits and customize',
    onclick: () => openAppearance(),
  }, '✎') : null;
  const row = h('div', {
    class: dock ? 'schemes dock' : 'schemes grid', role: 'group', 'aria-label': 'Color scheme',
  }, dock && h('span', { class: 'lbl' }, 'Color'), btns, tune);
  onLook(row, () => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(S.get() === keys[i]))));
  return row;
}

function setMode(mode) {
  document.documentElement.classList.add('theme-switching');
  document.documentElement.dataset.theme = mode;
  try { localStorage.setItem('dc-theme', mode); } catch { /* ignore */ }
  requestAnimationFrame(() => document.documentElement.classList.remove('theme-switching'));
}

/** Full console customizer: colors, themes, component kits, and fine tuning. Console only. */
export function openAppearance(opts) {
  // The Aether Studio is the main look editor; the classic hue/kit editor stays reachable from it.
  if (!(opts && opts.classic === true) && window.dcAether) return window.dcAether.open();
  const S = window.dcScheme;
  if (!S || document.querySelector('.look-sheet')) return;
  const body = h('div', { class: 'look-body' });
  const sheet = h('div', {
    class: 'dialog sheet look-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'DevX Control appearance',
  },
  h('div', { class: 'row', style: { alignItems: 'center', gap: '8px' } },
    h('h2', { id: 'look-title', class: 'grow', style: { margin: 0 } }, 'Console look'),
    h('button', { class: 'btn sm icon ghost', type: 'button', 'aria-label': 'Close', onclick: () => m.close() }, icon('x', 16))),
  h('p', { class: 'look-note' }, 'Colors, component themes and kits for DevX Control itself. Apps you manage keep their own look.'),
  body);
  sheet.setAttribute('aria-labelledby', 'look-title');

  const seg = (label, key, entries, current) => h('div', { class: 'look-axis' },
    h('span', { class: 'look-k' }, label),
    h('div', { class: 'seg', role: 'group', 'aria-label': label }, entries.map(([id, lab]) => h('button', {
      type: 'button', 'aria-pressed': String(current === id),
      onclick: () => S.setSkin({ [key]: id }),
    }, lab))));

  function syncLive() {
    const skin = S.getSkin();
    const kit = S.KITS[skin.kit] || S.KITS.orbital;
    const label = (S.SCHEMES[skin.scheme] || { label: 'Custom' }).label;
    body.querySelectorAll('.sw-grid > .sw').forEach((el) => {
      if (el.classList.contains('custom')) el.setAttribute('aria-pressed', String(skin.scheme === 'custom'));
      else el.setAttribute('aria-pressed', String(el.getAttribute('aria-label') === label));
    });
    body.querySelectorAll('.theme-pick').forEach((el) => { el.classList.remove('on'); el.setAttribute('aria-pressed', 'false'); });
    const foot = body.querySelector('.look-foot .muted');
    if (foot) foot.textContent = `${label} · ${kit.label}`;
  }
  function paint() {
    const color = body.querySelector('input[type="color"]');
    if (color && document.activeElement === color && body.childElementCount) { syncLive(); return; }
    const skin = S.getSkin();
    const kit = S.KITS[skin.kit] || S.KITS.orbital;
    const themeId = S.activeTheme();
    const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const axes = {
      radius: skin.radius || kit.radius,
      density: skin.density || kit.density,
      font: skin.font || kit.font,
      glass: skin.glass || kit.glass,
    };
    clear(body);
    body.append(
      h('div', { class: 'hud-eyebrow' }, 'Mode'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Light or dark' },
        ['dark', 'light'].map((k) => h('button', {
          type: 'button', 'aria-pressed': String(mode === k),
          onclick: () => { setMode(k); paint(); },
        }, k === 'dark' ? 'Dark' : 'Light'))),
      h('div', { class: 'hud-eyebrow' }, 'Themes'),
      h('p', { class: 'look-note' }, 'A theme sets a color and a component kit together.'),
      h('div', { class: 'theme-picks', role: 'list' }, S.CONSOLE_THEMES.map((t) => {
        const dot = S.SCHEMES[t.scheme]?.dot || '#b69cff';
        return h('button', {
          type: 'button', class: `theme-pick${themeId === t.id ? ' on' : ''}`, role: 'listitem',
          'aria-pressed': String(themeId === t.id),
          onclick: () => S.applyTheme(t.id),
        }, h('i', { class: 'cdot', style: { '--c': dot } }), h('span', {}, h('b', {}, t.label), h('small', {}, t.note)));
      })),
      h('div', { class: 'hud-eyebrow' }, 'Color'),
      h('div', { class: 'sw-grid', role: 'group', 'aria-label': 'Color' },
        Object.entries(S.SCHEMES).map(([k, v]) => h('button', {
          type: 'button', class: 'sw', title: v.label, 'aria-label': v.label,
          'aria-pressed': String(skin.scheme === k), style: { '--c': v.dot },
          onclick: () => S.set(k),
        })),
        h('label', { class: 'sw custom', title: 'Custom hue', 'aria-pressed': String(skin.scheme === 'custom') },
          h('input', {
            type: 'color', value: /^#[0-9a-fA-F]{6}$/.test(skin.custom || '') ? skin.custom : '#b69cff',
            'aria-label': 'Custom hue',
            oninput: (e) => {
              const hex = e.target.value;
              clearTimeout(openAppearance._t);
              openAppearance._t = setTimeout(() => S.setSkin({ scheme: 'custom', custom: hex }), 80);
            },
          }))),
      h('div', { class: 'hud-eyebrow' }, 'Component kit'),
      h('div', { class: 'kit-list', role: 'group', 'aria-label': 'Component kit' },
        Object.entries(S.KITS).map(([k, v]) => h('button', {
          type: 'button', class: `kit-pick${skin.kit === k ? ' on' : ''}`,
          'aria-pressed': String(skin.kit === k),
          onclick: () => S.setSkin({ kit: k, radius: '', density: '', font: '', glass: '' }),
        }, h('b', {}, v.label), h('span', {}, v.note)))),
      h('div', { class: 'hud-eyebrow' }, 'Customize'),
      seg('Corners', 'radius', Object.entries(S.AXES.radius), axes.radius),
      seg('Density', 'density', Object.entries(S.AXES.density), axes.density),
      seg('Type', 'font', Object.entries(S.AXES.font), axes.font),
      seg('Glass', 'glass', Object.entries(S.AXES.glass), axes.glass),
      h('div', { class: 'look-specimen', inert: '' },
        h('button', { class: 'btn primary sm', type: 'button' }, 'Primary'),
        h('button', { class: 'btn sm', type: 'button' }, 'Button'),
        h('span', { class: 'chip' }, 'Chip'),
        h('input', { class: 'field', placeholder: 'Field', tabindex: '-1' })),
      h('div', { class: 'look-foot' },
        h('button', { class: 'btn sm', type: 'button', onclick: () => S.reset() }, 'Reset'),
        h('span', { class: 'muted small grow' }, `${(S.SCHEMES[skin.scheme] || { label: 'Custom' }).label} · ${kit.label}`)));
  }
  const m = modal(sheet, { onClose: () => window.removeEventListener('dc:look', paint) });
  window.addEventListener('dc:look', paint);
  paint();
}

window.__dcClassic = () => openAppearance({ classic: true });
