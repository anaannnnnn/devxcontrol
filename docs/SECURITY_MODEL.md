# DevX Infrastructure OS — Security Model

DevXInfra is a high-privilege remote operations console. Security failures can yield shell, file, container, and DNS control across a tailnet. This model is mandatory for implementation.

---

## 1. Trust boundaries

| Boundary | Trust |
|----------|-------|
| iOS UI | Untrusted input; trusted only after local auth |
| iOS Keychain | Secrets at rest on device |
| Management backend | Trusted to hold integration tokens; compromise is critical |
| Host agent | Trusted on enrolled host; must be least-privilege |
| Tailscale control plane | Trusted for inventory; **not** for shell |
| LLM provider | **Untrusted** for side effects; tools gated |
| Published internet endpoints | Untrusted networks |

---

## 2. Authentication & session

### iOS

- Gate app unlock with **LocalAuthentication** (Face ID / Touch ID / device passcode) before revealing credentials or reconnecting sessions.
- Store session material in Keychain (`kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` or tighter as appropriate).
- Session idle timeout; require re-auth for high-impact actions (destroy data, approve AI consequential tools, reveal secrets).
- No credentials in logs, analytics, screenshots overlays, or crash reports.

### Backend (existing Control patterns to preserve)

- Scrypt password hashes; constant-time compare (`lib/auth.js`).
- Optional TOTP 2FA.
- Signed session cookie `dc_s`; CSRF double-submit on unsafe methods.
- Login throttling (429 + Retry-After).
- Admin vs member permission gates (`MEMBER_BLOCKED` in `server.js`).

### Evolution

If iOS adopts Bearer tokens, they must be revocable, rotated, and never logged. Cookie+CSRF remains supported for web.

---

## 3. Secrets handling

| Secret | Storage |
|--------|---------|
| Control session / CSRF | Keychain |
| SSH private keys / passwords | Keychain; never app bundle |
| Tailscale / CF / GD / LLM API keys | **Server** integrations store (`lib/integrations.js` AES-256-GCM); not in iOS binary |
| Host agent credentials | Agent keychain/file mode 0600 + server-side hash |
| Vault items | Server vault; reveal audited |

Hard rule: **no hardcoded credentials** in source, fixtures shipped in Release, or Info.plist.

---

## 4. SSH / SFTP host verification

- Verify host keys on first connect; present fingerprint; require explicit user trust.
- On key change: block connection; show clear warning; require explicit replace — **no silent accept**, no “trust forever” default bypass for unknowns in production builds.
- Do not disable known_hosts checks with debug flags in Release.
- Pasteboard: optional; do not auto-copy secrets.

---

## 5. Agent security

- Enrollment tokens are single-use / short-TTL.
- Agent authenticates every heartbeat/command channel.
- Capability advertise + server allowlist; unknown RPCs rejected.
- Scoped filesystem roots; block secret paths (env, keys, certs) similar to `SECRET_PATH` in `localagent.js`.
- Container actions and exec require user-confirmed server commands with audit events.
- Prefer agent **egress-only** to backend (no open inbound management port).

---

## 6. AI / LLM controls

Follow and extend Jarvis tiers (`lib/jarvis/tools.js`):

| Tier | Behavior |
|------|----------|
| T0 Read | Immediate |
| T1 Reversible | Confirmation card |
| T2 Consequential | Confirmation + step-up auth |
| T3 Forbidden | Refuse (e.g. vault.reveal by voice) |

Additional rules:

- Model never executes side effects directly; confirm store binds args (`lib/jarvis/confirm.js`).
- Redact secrets in prompts/logs (`lib/jarvis/redact.js` patterns).
- Never let tool results or page content override system instructions (prompt-injection resistance).
- Never fabricate tool outcomes in the UI if the tool failed or was skipped.

---

## 7. Network & transport

- TLS for all backend and provider APIs; certificate validation on.
- Tailscale provides underlay trust for SSH, but still verify SSH host keys.
- No cleartext credential query params.
- SSE/WebSocket streams authenticated.

---

## 8. DNS & publishing

- Domain mutations only for zones in connected accounts.
- Prefer least-privilege Cloudflare API tokens (DNS edit on specific zones).
- Publishing must **verify** public HTTPS before `LIVE`.
- Do not delete DNS records pointing elsewhere (`deleteA` already guards by IP — preserve that ethic for tunnels/CNAMEs).
- Audit every publish stage transition.

---

## 9. Logging & audit

- Audit: auth failures, secret reveals, container actions, DNS changes, publish ops, AI confirmations.
- Redact tokens, passwords, private keys, Authorization headers.
- Activity feed shows user-visible audit slice without secrets.

---

## 10. Threat mitigations checklist

- [ ] Biometric/app lock  
- [ ] Keychain-only secrets  
- [ ] CSRF or equivalent on mutations  
- [ ] Host-key verification  
- [ ] Agent enrollment + capability allowlist  
- [ ] AI confirmations for mutations  
- [ ] Honest offline/error states (no fake success)  
- [ ] No admin provider keys on device  
- [ ] Rate limiting on auth endpoints  
- [ ] Least-privilege OS entitlements (Network only as needed; no blanket file access)

---

## 11. Incident assumptions

Treat backend `VAULT_KEY` / `SESSION_SECRET` loss as full vault compromise (documented in README). iOS should support remote session revoke when backend adds token denylist. Compromised agent credentials → revoke enrollment and rotate.
