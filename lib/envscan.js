// Finds environment variables the code reads but .env.example never declares, and picks a safe value for each.
import crypto from 'node:crypto';
import { wantedService } from './provision.js';

const SKIP = /^(CI|HOME|PATH|PWD|USER|SHELL|LANG|TERM|TMPDIR|HOSTNAME|DEBUG|NODE_OPTIONS|NODE_ENV_FILE|NODE_TLS_REJECT_UNAUTHORIZED|npm_.*|NEXT_RUNTIME|NEXT_PHASE|VERCEL.*|NETLIFY.*|GITHUB_.*|RUNNER_.*|PYTHONPATH|VIRTUAL_ENV|PORT_DEFAULT|FORCE_COLOR|NO_COLOR|LC_.*|PS1|EDITOR)$/;
const READS = [/process\.env\.([A-Z][A-Z0-9_]{1,60})/g, /process\.env\[\s*['"`]([A-Z][A-Z0-9_]{1,60})['"`]\s*\]/g, /import\.meta\.env\.([A-Z][A-Z0-9_]{1,60})/g, /os\.environ(?:\.get)?\s*[\[(]\s*['"]([A-Z][A-Z0-9_]{1,60})['"]/g, /os\.getenv\(\s*['"]([A-Z][A-Z0-9_]{1,60})['"]/g, /os\.Getenv\(\s*"([A-Z][A-Z0-9_]{1,60})"/g, /\b(?:ENV|getenv)\s*[\[(]\s*['"]([A-Z][A-Z0-9_]{1,60})['"]/g];
// Secrets the app only needs to be random and private. Vendor keys (STRIPE_..., OPENAI_...) can never be invented.
const OWN_SECRET = /^(?:[A-Z0-9]+_)*(JWT|SESSION|COOKIE|AUTH|APP|SECRET|ENCRYPTION|SIGNING|CSRF|NEXTAUTH|HASH|TOKEN)(_(SECRET|KEY|SALT|TOKEN))?$|^(SECRET_KEY|APP_KEY|SALT|SECRET|JWT_KEY|AUTH_SECRET|SESSION_KEY)$/;
const VENDOR = /^(STRIPE|OPENAI|ANTHROPIC|GITHUB|GOOGLE|AWS|AZURE|TWILIO|SENDGRID|MAILGUN|SMTP|PAYPAL|SLACK|DISCORD|TELEGRAM|FIREBASE|SUPABASE|CLOUDINARY|SENTRY|RESEND|POSTMARK|NEON|VERCEL|CLERK|AUTH0|OKTA|GEMINI|GROQ|HF|HUGGINGFACE|OLLAMA|TWITTER|FACEBOOK|META|LINKEDIN|SHOPIFY|MAPBOX|ALGOLIA|MONGODB_ATLAS)_/;

export async function usedEnvNames(files, read, limit = 150) {
  const found = new Set();
  const src = files.filter((f) => /\.(m?[jt]sx?|py|go|rb|php)$/.test(f.path) && f.size < 150000 && !/(^|\/)(node_modules|vendor|dist|build|test|tests|__tests__|\.next)\//.test(f.path)).slice(0, limit);
  for (const f of src) { const t = (await read(f.path)) || ''; for (const re of READS) for (const m of t.matchAll(re)) if (!SKIP.test(m[1])) found.add(m[1]); }
  return [...found];
}

/** What to put in .env for a variable that has no example. Returns {src, v, note}. */
export function autoEntry(name, { port, depsText = '' }) {
  const svc = wantedService(name, '', depsText);
  if (svc) return { src: 'provision', v: '', provision: svc, note: `${svc} will be created on this server` };
  if (name === 'PORT') return { src: 'value', v: String(port || 3000), note: 'picked from the app' };
  if (name === 'NODE_ENV') return { src: 'value', v: 'production', note: 'production' };
  if (/^(HOST|BIND_ADDRESS|LISTEN_HOST)$/.test(name)) return { src: 'value', v: '0.0.0.0', note: 'listen on all interfaces' };
  if (/^(LOG_LEVEL)$/.test(name)) return { src: 'value', v: 'info', note: 'info' };
  if (/^(TZ|TIMEZONE)$/.test(name)) return { src: 'value', v: 'UTC', note: 'UTC' };
  if (isOwnSecret(name) || (!VENDOR.test(name) && OWN_SECRET.test(name))) return { src: 'generate', v: '', note: 'random value generated' };
  return { src: 'value', v: '', note: 'not in .env.example, set it if the app needs it' };
}

/** Variables a repo wants filled with a random private value (never a vendor key, those cannot be invented). */
export const isOwnSecret = (name) => !VENDOR.test(name) && /(SECRET|SALT|JWT|PASSWORD|PASSPHRASE|ENCRYPTION|SIGNING|(^|_)PIN$|^APP_KEY$|_KEY$)/.test(name) && !/(PUBLIC|PUBLISHABLE|^NEXT_PUBLIC)/.test(name);

const base62 = (n) => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; const b = crypto.randomBytes(n * 2); let o = ''; for (let i = 0; o.length < n; i++) o += a[b[i] % a.length]; return o; };

/** A value that works for this kind of variable: readable password, short PIN, or 32 random bytes as hex for secrets and keys. */
export function generateValue(name) {
  if (/PIN$/.test(name)) return String(crypto.randomInt(100000, 999999));
  if (/(PASSWORD|PASSPHRASE|^PASS$)/.test(name)) return base62(20);
  if (name === 'APP_KEY') return `base64:${crypto.randomBytes(32).toString('base64')}`; // Laravel format
  if (/FERNET/.test(name)) return crypto.randomBytes(32).toString('base64url') + '='; // Python Fernet: urlsafe base64 of 32 bytes
  if (/^(SECRET_KEY|DJANGO_SECRET_KEY|FLASK_SECRET_KEY|SECRET_KEY_BASE)$/.test(name)) return base62(name === 'SECRET_KEY_BASE' ? 64 : 50); // Django, Flask, Rails
  if (/AES/.test(name)) return base62(32); // exactly 32 characters
  return crypto.randomBytes(32).toString('hex');
}

/** One-line description of what Generate will produce, shown next to the dropdown. */
export function generateNote(name) {
  if (/PIN$/.test(name)) return 'a 6-digit PIN';
  if (/(PASSWORD|PASSPHRASE|^PASS$)/.test(name)) return 'a strong 20-character password';
  if (name === 'APP_KEY') return 'a base64 app key (Laravel format)';
  if (/FERNET/.test(name)) return 'a Fernet key (url-safe base64, 32 bytes)';
  if (/^(SECRET_KEY|DJANGO_SECRET_KEY|FLASK_SECRET_KEY)$/.test(name)) return 'a 50-character secret key';
  if (name === 'SECRET_KEY_BASE') return 'a 64-character secret';
  if (/AES/.test(name)) return 'a 32-character key';
  return 'a 256-bit secret (64 hex characters)';
}

const URLISH = /^(APP_URL|BASE_URL|PUBLIC_URL|SITE_URL|FRONTEND_URL|CLIENT_URL|WEB_URL|NEXTAUTH_URL|NEXT_PUBLIC_APP_URL|NEXT_PUBLIC_SITE_URL|SERVER_URL|API_URL|CORS_ORIGIN|ALLOWED_ORIGINS?|ORIGIN)$/;
const SSLFLAG = /^(DB_SSL|DATABASE_SSL|PG_SSL|PGSSL|POSTGRES_SSL|PGSSLMODE|DB_SSL_MODE)$/;
/** Settings that depend on where the app runs: its public address, and no TLS to the private database on this server. */
export function deriveDefault(name, value, { domain, hasProvisionedDb }) {
  const v = String(value || '');
  if (URLISH.test(name) && domain && (!v || /localhost|127\.0\.0\.1|example\.(com|org)/i.test(v))) return `https://${domain}`;
  if (/^(ADMIN_EMAIL|SUPPORT_EMAIL|MAIL_FROM|EMAIL_FROM)$/.test(name) && domain && !v) return `${/^ADMIN/.test(name) ? 'admin' : 'noreply'}@${domain.split('.').slice(-2).join('.')}`;
  if (hasProvisionedDb && SSLFLAG.test(name)) return name === 'PGSSLMODE' || name === 'DB_SSL_MODE' ? 'disable' : 'false';
  return null;
}

/**
 * Boot-safe stand-ins for settings that belong to an outside service (payments, email, login providers, AI keys).
 * The app starts and its other features work; only the feature that needs the real account stays off until the real
 * value is set under Secrets. Returns null when a blank is the safer value.
 */
export function placeholderFor(name, { id = 'app', domain = '' } = {}) {
  const n = String(name).toUpperCase(); const host = domain ? domain.split('.').slice(-2).join('.') : `${id}.local`;
  const rules = [
    [/^STRIPE_(PUBLISHABLE|PUBLIC)|STRIPE.*PUBLISHABLE/, 'pk_test_placeholder_not_configured'], [/^STRIPE_WEBHOOK/, 'whsec_placeholder_not_configured'], [/^STRIPE_/, 'sk_test_placeholder_not_configured'],
    [/^OPENAI_/, 'sk-placeholder-not-configured'], [/^ANTHROPIC_/, 'sk-ant-placeholder-not-configured'], [/^GROQ_/, 'gsk_placeholder_not_configured'], [/^(GEMINI|GOOGLE_AI|GOOGLE_API)_/, 'placeholder-not-configured'],
    [/^SENDGRID_/, 'SG.placeholder-not-configured'], [/^RESEND_/, 're_placeholder_not_configured'], [/^POSTMARK_/, '00000000-0000-0000-0000-000000000000'], [/^MAILGUN_DOMAIN/, host],
    [/^TWILIO_ACCOUNT_SID/, 'AC00000000000000000000000000000000'], [/^TWILIO_AUTH_TOKEN/, '00000000000000000000000000000000'], [/^TWILIO_.*(NUMBER|FROM|PHONE)/, '+10000000000'],
    [/^GITHUB_TOKEN|^GH_TOKEN/, 'ghp_placeholder_not_configured'], [/^SLACK_.*TOKEN/, 'xoxb-placeholder-not-configured'], [/^TELEGRAM_.*TOKEN/, '000000:placeholder'], [/^DISCORD_.*TOKEN/, 'placeholder.not.configured'],
    [/^AWS_ACCESS_KEY_ID/, 'AKIAPLACEHOLDER00000'], [/^AWS_SECRET/, 'placeholder-not-configured'], [/^AWS_(DEFAULT_)?REGION$|^S3_REGION$/, 'us-east-1'], [/(^|_)BUCKET(_NAME)?$/, `${id}-uploads`],
    [/^SMTP_HOST$|^MAIL_HOST$|^EMAIL_HOST$/, 'localhost'], [/^SMTP_(USER|USERNAME|PASS|PASSWORD)$|^MAIL_(USERNAME|PASSWORD)$|^EMAIL_HOST_(USER|PASSWORD)$/, 'placeholder'],
    [/^(ADMIN_|SUPPORT_|CONTACT_|OWNER_)?EMAIL$|^(MAIL|EMAIL|SMTP)_FROM$|^FROM_EMAIL$/, `${/^ADMIN/.test(n) ? 'admin' : 'noreply'}@${host}`],
    [/CLIENT_ID$/, 'placeholder-client-id.apps.example'], [/CLIENT_SECRET$/, 'placeholder-client-secret'], [/(^|_)PHONE(_NUMBER)?$/, '+10000000000'],
    [/(API_KEY|APIKEY|ACCESS_KEY|PRIVATE_KEY|AUTH_TOKEN|ACCESS_TOKEN|API_TOKEN|_TOKEN|_SECRET|_KEY)$/, `placeholder-${String(name).toLowerCase().replace(/_/g, '-')}`],
    [/(^|_)(URL|URI|ENDPOINT)$/, 'http://localhost'],
  ];
  for (const [re, val] of rules) if (re.test(n)) return val;
  return null;
}
