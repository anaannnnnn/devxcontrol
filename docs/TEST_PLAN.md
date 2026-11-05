# DevX Infrastructure OS — Test Plan

Honest testing only. Fixtures belong in test targets and SwiftUI previews — **never** as production Command Center state.

---

## 1. Environments

| Environment | What we can run |
|-------------|-----------------|
| Linux Cloud Agent (current) | Node `npm test`, API smoke, markdown/contract review, Swift **source** review |
| macOS + Xcode | `xcodebuild`, unit/UI tests, Simulator |
| Real lab | Tailscale tailnet, Ubuntu host + agent, CF/GD accounts, SSH keys |

**Blocker:** Native iOS compile/UI tests are **blocked** without macOS/Xcode. Plan CI job `macos-latest` when secrets and signing are available.

---

## 2. Backend / contract tests (extend existing)

Existing: `npm test` (node:test suite), `bash test/api.smoke.sh`.

Add as `/infra` lands:

| Suite | Asserts |
|-------|---------|
| `test/infra-overview.test.js` | Overview never invents devices when Tailscale stub disconnected |
| `test/infra-agent.test.js` | Enrollment token TTL, heartbeat auth, unknown capability rejected |
| `test/infra-publish.test.js` | Stage machine; `LIVE` only after verify mock returns OK |
| `test/infra-ai-confirm.test.js` | Mutation tools mint confirm; execute uses stored args |
| OpenAPI diff check | New paths documented |

Preserve: auth throttle, CSRF, vault reveal audit, DNS `ensureA`/`deleteA` behaviors.

---

## 3. Host agent tests

| Test | Level |
|------|-------|
| Path traversal refused | Unit |
| Secret path deny list | Unit |
| Docker list parsing against fixtures | Unit |
| Discovery only returns probed HTTP OK/Fail | Unit |
| Heartbeat signature / token failure | Unit |
| Integration against Docker-in-Docker or testcontainers | Optional CI |

---

## 4. iOS unit tests (macOS)

| Module | Cases |
|--------|-------|
| `DevXDomain` | Model decode; stage enum transitions; offline labeling rules |
| `DevXNetworking` | problem+json mapping; CSRF header injection; 401 handling |
| `DevXSecurity` | Keychain round-trip (simulator); host-key change detection logic |
| `DevXTailscale` | DTO mapping; filter/search |
| `DevXSSH` | Mock transport: resize, ANSI parser basics (library-dependent) |
| View models | Empty/error/loaded from mocked services — **no live fake fleet in app target** |

---

## 5. iOS UI / snapshot tests

- Tab shell layout smoke  
- Command Center empty state (Tailscale disconnected copy)  
- Publish FAB present; publish flow buttons disabled until selections valid  
- Terminal accessory bar visible  
- Reduce Motion: decorative orbit disabled  

Prefer accessibility audits over pixel-perfect snapshots initially.

---

## 6. Integration scenarios (lab)

Manual / automated when credentials exist:

1. Sign in → biometric unlock → session restore  
2. Tailscale devices match admin console inventory  
3. Select Ubuntu → SSH interactive (`echo`, `vim` smoke)  
4. SFTP list / upload via document picker / download  
5. Agent metrics match `top`/`free` approximately  
6. Container list matches `docker ps`  
7. Log follow shows new lines  
8. Discovery finds known local nginx/caddy on host  
9. Cloudflare subdomain publish → external `curl -fI https://…`  
10. Kill tunnel → UI shows failed health (not stuck LIVE)  
11. AI read tool returns real device list; mutation requires confirm  

---

## 7. Failure recovery

| Failure | Expected |
|---------|----------|
| Backend down | Explicit connection error; cached last-seen labeled stale |
| Agent heartbeat timeout | Device structured tabs disabled with reason; SSH may still work |
| SSH host key changed | Hard stop + explanation |
| DNS API 403 | Surface-visible provider error; no silent skip to LIVE |
| Publish verify fail | Stage `FAILED` with detail |
| LLM timeout | Error message; no invented checklist |

---

## 8. Security tests

- Release build scan: no embedded API keys  
- CSRF missing → 403  
- Member role cannot hit admin infra enrollment  
- AI T3 tools refused  
- Redaction unit tests for private keys / tokens in log strings  

---

## 9. Performance budgets

- Command Center first meaningful paint: avoid blocking main thread on large topology  
- Terminal input-to-send: no artificial delay  
- Log virtualization: bounded buffer (e.g. last N lines)  
- 60 FPS target for decorative motion when enabled  

---

## 10. Definition of tested

A feature is “tested” when:

1. Automated tests exist at the appropriate layer **and pass** in a real runner, or  
2. A documented manual lab checklist was executed with evidence (logs/screenshots) stored under Project `media/` / `internal/`.

“Should work” and unrun Simulator claims are insufficient for STEP 10 acceptance.
