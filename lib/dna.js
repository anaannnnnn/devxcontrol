// Business DNA: classify from evidence only, then mark playbook features present / partial / missing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const TYPE_HINTS = [
  { id: 'restaurant', label: 'Restaurant', words: ['menu', 'reservation', 'dine', 'kitchen', 'dish'], tables: ['orders', 'menu_items', 'reservations'], files: ['menu', 'reserv'] },
  { id: 'logistics', label: 'Logistics', words: ['dispatch', 'fleet', 'delivery', 'driver', 'route'], tables: ['deliveries', 'drivers', 'routes'], files: ['driver', 'dispatch'] },
  { id: 'retail', label: 'Retail', words: ['sku', 'checkout', 'cart', 'catalog', 'boutique'], tables: ['products', 'orders'], files: ['product', 'shop', 'cart'] },
  { id: 'construction', label: 'Construction', words: ['site', 'crew', 'estimate', 'snag', 'contractor'], tables: ['projects', 'estimates'], files: ['estimate', 'crew'] },
  { id: 'erp', label: 'ERP', words: ['ledger', 'invoice', 'vendor', 'payroll', 'journal'], tables: ['accounts', 'invoices', 'journal_entries'], files: ['ledger', 'invoice'] },
  { id: 'saas', label: 'SaaS', words: ['subscription', 'tenant', 'workspace', 'billing', 'dashboard'], tables: ['users', 'subscriptions'], files: ['billing', 'auth'] },
  { id: 'education', label: 'Education', words: ['student', 'grade', 'attendance', 'classroom', 'school'], tables: ['students', 'grades', 'classes'], files: ['student', 'grade'] },
];

export function loadPlaybooks(dir = path.join(here, 'playbooks')) {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')); } catch { return out; }
  for (const n of names) {
    try { out.push(JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'))); } catch { /* skip bad playbook */ }
  }
  return out;
}

const hit = (hay, needle) => hay.includes(String(needle).toLowerCase());

export function classifyEvidence({ readme = '', files = [], pageText = '', tables = [] }) {
  const blob = `${readme}\n${pageText}`.toLowerCase();
  const fileBlob = files.map((f) => f.toLowerCase()).join('\n');
  const tableSet = new Set(tables.map((t) => String(t).toLowerCase()));
  const scored = TYPE_HINTS.map((t) => {
    const evidence = [];
    for (const w of t.words) if (hit(blob, w)) evidence.push({ kind: 'text', value: w });
    for (const f of t.files) if (hit(fileBlob, f)) evidence.push({ kind: 'file', value: f });
    for (const tb of t.tables) if (tableSet.has(tb)) evidence.push({ kind: 'table', value: tb });
    const possible = t.words.length + t.files.length + t.tables.length;
    return { id: t.id, label: t.label, evidence, confidence: possible ? Math.round((evidence.length / possible) * 100) : 0 };
  }).sort((a, b) => b.confidence - a.confidence || a.label.localeCompare(b.label));
  const top = scored[0];
  if (!top || top.confidence < 8) {
    return { id: 'unknown', label: 'Not classified', confidence: 0, evidence: [], runners: scored.slice(0, 3), reason: 'No playbook type had enough evidence in the README, file names, page text or table names.' };
  }
  return { id: top.id, label: top.label, confidence: Math.min(95, top.confidence), evidence: top.evidence.slice(0, 12), runners: scored.slice(0, 3), reason: null };
}

function featureState(feat, ctx) {
  const files = ctx.files.map((f) => f.toLowerCase()).join('\n');
  const blob = `${ctx.readme}\n${ctx.pageText}`.toLowerCase();
  const tables = new Set(ctx.tables.map((t) => String(t).toLowerCase()));
  const fileHit = (feat.files || []).some((f) => files.includes(f));
  const tableHit = (feat.tables || []).some((t) => tables.has(t));
  const wordHit = (feat.words || []).some((w) => blob.includes(w.toLowerCase()));
  const strong = fileHit || tableHit;
  if (strong && wordHit) return 'present';
  if (strong || wordHit) return 'partial';
  return 'missing';
}

export function gapMap(typeId, ctx, playbooks = loadPlaybooks()) {
  const book = playbooks.find((p) => p.id === typeId);
  if (!book) return { measured: typeId !== 'unknown', reason: typeId === 'unknown' ? 'No playbook until a type is known.' : `No playbook file for ${typeId}.`, features: [] };
  const features = book.features.map((f) => {
    const state = featureState(f, ctx);
    const found = [];
    const files = ctx.files.map((x) => x.toLowerCase()).join('\n');
    for (const n of f.files || []) if (files.includes(n)) found.push(`file:${n}`);
    for (const n of f.tables || []) if (ctx.tables.map((t) => t.toLowerCase()).includes(n)) found.push(`table:${n}`);
    for (const n of f.words || []) if (`${ctx.readme}\n${ctx.pageText}`.toLowerCase().includes(n.toLowerCase())) found.push(`text:${n}`);
    return { id: f.id, label: f.label, effort: f.effort, benefit: f.benefit, state, evidence: found };
  });
  return { measured: true, reason: null, type: book.id, label: book.label, features };
}

export function scanDna(input, correction) {
  const ctx = {
    readme: String(input.readme || '').slice(0, 20000),
    files: (input.files || []).map(String).slice(0, 500),
    pageText: String(input.pageText || '').slice(0, 20000),
    tables: (input.tables || []).map(String).slice(0, 200),
  };
  if (!ctx.readme && !ctx.files.length && !ctx.pageText && !ctx.tables.length) {
    return { measured: false, reason: 'not measured: no README, file tree, page text or table names were available.', classification: null, gaps: { features: [] } };
  }
  let classification = classifyEvidence(ctx);
  let corrected = false;
  if (correction && TYPE_HINTS.some((t) => t.id === correction)) {
    const t = TYPE_HINTS.find((x) => x.id === correction);
    classification = { id: t.id, label: t.label, confidence: 100, evidence: [{ kind: 'owner', value: 'You corrected this classification. It is remembered.' }], runners: classification.runners, reason: null };
    corrected = true;
  }
  const gaps = gapMap(classification.id, ctx);
  return { measured: true, reason: null, corrected, classification, gaps };
}
