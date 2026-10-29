// Visitor Ghosts: scripted checks on HTML. A headless browser is optional and never invented.
export const PERSONAS = [
  { id: 'shopper', label: 'Impatient mobile shopper', goal: 'order something', note: 'Slow network, small screen, gives up fast.' },
  { id: 'reader', label: 'Screen-reader user', goal: 'contact us', note: 'Needs names on controls and text for images.' },
  { id: 'arabic', label: 'Arabic right-to-left user', goal: 'read the page', note: 'Expects dir=rtl and lang=ar when the copy is Arabic.' },
  { id: 'elder', label: 'First-time user, large text', goal: 'contact us', note: 'Needs 18px body text and 44px targets.' },
  { id: 'keys', label: 'Keyboard-only user', goal: 'reach the main action', note: 'Needs a focus style and no keyboard trap hint.' },
];

const strip = (html) => String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');

export function scriptedAudit(html, personaId) {
  const persona = PERSONAS.find((p) => p.id === personaId) || PERSONAS[0];
  const raw = String(html || '');
  if (!raw.trim()) return { measured: false, reason: 'not measured: no HTML was available to check.', persona, findings: [] };
  const text = strip(raw);
  const findings = [];
  const add = (id, severity, title, detail) => findings.push({ id, severity, title, detail, persona: persona.id });
  if (!/<html[^>]*\blang=/i.test(raw)) add('lang', 'med', 'No language on the page', 'The <html> tag has no lang attribute.');
  if (persona.id === 'arabic') {
    if (!/\bdir\s*=\s*["']rtl["']/i.test(raw)) add('rtl', 'high', 'No right-to-left direction', 'An Arabic visitor needs dir="rtl" on html or body.');
    if (!/<html[^>]*\blang=["']ar/i.test(raw)) add('lang-ar', 'med', 'Language is not Arabic', 'lang is not ar, so a screen reader may use the wrong voice.');
  }
  const imgs = [...raw.matchAll(/<img\b[^>]*>/gi)];
  const noAlt = imgs.filter((m) => !/\balt\s*=/i.test(m[0]));
  if (noAlt.length) add('alt', 'med', 'Images without alt', `${noAlt.length} img tag${noAlt.length === 1 ? '' : 's'} have no alt attribute.`);
  const inputs = [...raw.matchAll(/<input\b[^>]*>/gi)].filter((m) => !/\btype\s*=\s*["']hidden["']/i.test(m[0]));
  const unlabeled = inputs.filter((m) => !/\b(aria-label|aria-labelledby|id)\s*=/i.test(m[0]) && !/<label\b/i.test(raw));
  if (persona.id === 'reader' && unlabeled.length) add('label', 'high', 'Inputs without a name', `${unlabeled.length} input${unlabeled.length === 1 ? '' : 's'} have no label, aria-label or id.`);
  const buttons = [...raw.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)];
  const emptyBtns = buttons.filter((m) => !/\baria-label=/i.test(m[0]) && !strip(m[1]).trim());
  if (emptyBtns.length) add('button-name', 'high', 'Buttons with no name', `${emptyBtns.length} button${emptyBtns.length === 1 ? '' : 's'} have no text and no aria-label.`);
  if (persona.id === 'elder') {
    const small = /font-size:\s*(1[0-7]|[0-9])px/i.test(raw);
    if (small) add('type-size', 'med', 'Body text looks small', 'A font-size under 18px was found inline. Large-text visitors will struggle.');
  }
  if (persona.id === 'keys' && /outline\s*:\s*(none|0)/i.test(raw) && !/:focus/.test(raw)) add('focus', 'high', 'Focus outline removed', 'Keyboard users cannot see where they are.');
  if (persona.id === 'shopper') {
    const hasOrder = /order|cart|checkout|book/i.test(text);
    if (!hasOrder) add('goal', 'med', 'No obvious way to finish the goal', `Could not find order, cart, checkout or book in the text. Goal: ${persona.goal}.`);
  }
  if (/overflow\s*:\s*visible/i.test(raw) && persona.id === 'shopper') add('overflow', 'low', 'Overflow left visible', 'A visible overflow can spill on a phone. This is a hint, not a measured layout.');
  findings.sort((a, b) => ({ high: 3, med: 2, low: 1 }[b.severity] - { high: 3, med: 2, low: 1 }[a.severity]));
  return {
    measured: true, reason: null, persona, findings,
    browser: { measured: false, reason: 'Headless browser was not used for this result. These are rule checks on the HTML only.' },
    capped: true,
  };
}

export const STEP_CAP = 12;
export const TIME_CAP_MS = 20000;
