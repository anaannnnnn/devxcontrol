// Talk to Control: keyword intents in Arabic and English. Actions never run until a confirmation card is accepted.
const INTENTS = [
  { id: 'status', re: /why.*(slow|down)|status|health|ليه|ليش|بطيء|الحالة|لماذا/i, confirm: false },
  { id: 'backups', re: /backup|نسخ|احتياط/i, confirm: false },
  { id: 'changed', re: /what changed|this week|ماذا تغير|هذا الأسبوع|تغيّر/i, confirm: false },
  { id: 'reviews', re: /review|pending|مراجعة|بانتظار/i, confirm: false },
  { id: 'updates', re: /behind|update|commit|تحديث/i, confirm: false },
  { id: 'revenue', re: /revenue|money|ايراد|إيراد|مبيعات/i, confirm: false },
  { id: 'restart', re: /restart|أعد تشغيل|اعادة تشغيل|إعادة تشغيل/i, confirm: true },
  { id: 'draft', re: /draft|اكتب|أضف|add the|booking feature/i, confirm: true },
];

export function detectLang(text) {
  return /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en';
}

export function parseUtterance(text, ids = []) {
  const raw = String(text || '').trim().slice(0, 400);
  if (raw.length < 2) return { ok: false, reason: 'Ask a question.' };
  const hit = INTENTS.find((i) => i.re.test(raw));
  const lower = raw.toLowerCase();
  const app = [...ids].map((id) => String(id).toLowerCase()).sort((a, b) => b.length - a.length).find((id) => new RegExp(`(^|[^a-z0-9-])${id}([^a-z0-9-]|$)`).test(lower)) || null;
  if (!hit) {
    return { ok: true, mode: 'keyword', intent: 'unknown', confirm: false, lang: detectLang(raw), app, text: raw, say: detectLang(raw) === 'ar' ? 'لم أفهم. جرّب: الحالة، النسخ الاحتياطي، ماذا تغيّر هذا الأسبوع.' : 'No keyword intent matched. A model is not required for the keyword fallback. Try status, backups, what changed this week, reviews, or restart and the app id.' };
  }
  return { ok: true, mode: 'keyword', intent: hit.id, confirm: hit.confirm, lang: detectLang(raw), app, text: raw, say: null };
}

export const READ_INTENTS = new Set(['status', 'backups', 'changed', 'reviews', 'updates', 'revenue']);
export const ACTION_INTENTS = new Set(['restart', 'draft']);
