// Secret redaction for anything leaving to the LLM or the audio sidecars. Defence in depth:
// Jarvis sends summaries not raw dumps, but we still scrub common secret shapes first.
const PATTERNS = [
  [/\b(?:sk|rk|pk)-[A-Za-z0-9]{16,}\b/g, '[redacted-key]'],          // OpenAI-style
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[redacted-gh-token]'],         // GitHub tokens
  [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted-aws-id]'],                     // AWS access key id
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[redacted-slack]'],          // Slack
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted-jwt]'], // JWT
  [/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, '[redacted-private-key]'],
  [/\b([a-z]+):\/\/([^:@\s/]+):([^@\s/]+)@/gi, '$1://$2:[redacted]@'], // creds in URLs
  [/\bAuthorization:\s*Bearer\s+[A-Za-z0-9._-]+/gi, 'Authorization: Bearer [redacted]'],
];
// KEY=VALUE where the key name looks sensitive.
const ENV_LINE = /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE|CREDENTIAL|SESSION_KEY)[A-Z0-9_]*)\s*[=:]\s*("[^"]*"|'[^']*'|\S+)/gi;

export function redact(text) {
  if (text == null) return text;
  let s = String(text);
  for (const [re, to] of PATTERNS) s = s.replace(re, to);
  s = s.replace(ENV_LINE, (_m, k) => `${k}=[redacted]`);
  return s;
}

// Deep-redact an object's string values (for logs/tool results before they reach the model).
export function redactDeep(v) {
  if (typeof v === 'string') return redact(v);
  if (Array.isArray(v)) return v.map(redactDeep);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = redactDeep(v[k]); return o; }
  return v;
}
