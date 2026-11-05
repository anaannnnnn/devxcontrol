# DevX Infrastructure OS — Architecture

**Product:** DevX Infrastructure OS (DevXInfra)  
**Primary client:** Native iOS (iPhone + adaptive iPad), Swift 6 / SwiftUI  
**Repo context:** This repository today hosts **DevX Control** — a Node 20+ zero-dependency fleet console (`server.js`, `lib/*`, web UI under `public/`). The iOS app is a **new first-class client** that reuses and extends that control plane; it does **not** replace the web dashboard.

**Environment note (DX-2):** Planning and scaffolding run on Linux Cloud Agent hosts. There is **no Xcode / `swift` / `xcodebuild`** in this environment. Native compile and Simulator verification require macOS + Xcode. Do not claim an iOS build succeeded without running it.

---

## 1. Goals and non-goals

### Goals

- One intelligent command center for Tailscale devices, SSH/SFTP, containers, metrics, local website discovery, domains, publishing, and AI ops.
- Real integrations only — honest empty/offline/error states; no shipped fake fleet data.
- Two remote-access paths with shared feature protocols: **direct** (SSH/SFTP on the tailnet) and **managed agent** (authorized host agent ↔ management backend).
- Security-first credentials (Keychain + LocalAuthentication), host-key verification, least privilege, auditable mutations.

### Non-goals (v1)

- Replacing or rewriting the existing web Control UI.
- Claiming Tailscale control-plane APIs provide shell, Docker, or local website discovery.
- Unrestricted phone-side network scanning of remote LANs.
- Shipping demo/fixture infrastructure as production app state.

---

## 2. System context

```
┌─────────────────────────────┐
│  DevXInfra iOS (SwiftUI)    │
│  Tabs: Command Center,      │
│  Network, Applications,     │
│  Domains, Workspace         │
└─────────────┬───────────────┘
              │ HTTPS (TLS) + optional SSH over Tailscale
     ┌────────┴────────┐
     ▼                 ▼
┌──────────────┐  ┌────────────────────────────┐
│ Tailscale    │  │ DevX Control / Management  │
│ (tailnet)    │  │ Backend (extend server.js) │
│ devices, DNS │  │ session/auth, fleet, DNS,  │
│ IPs, status  │  │ vault patterns, AI tools,  │
└──────┬───────┘  │ agent registry, publish    │
       │          └─────────────┬──────────────┘
       │ SSH/SFTP               │ mTLS / signed agent channel
       ▼                        ▼
┌──────────────┐  ┌────────────────────────────┐
│ Host (direct)│  │ DevX Host Agent            │
│ OpenSSH      │  │ (new; Windows/Linux/macOS) │
└──────────────┘  │ metrics, processes,        │
                  │ Docker/Podman, logs,       │
                  │ website discovery, tunnel  │
                  └────────────────────────────┘
       External: Cloudflare API, GoDaddy API, Cloudflare Tunnel, LLM providers
```

### Existing assets to preserve and reuse

| Area | Location | Reuse for iOS |
|------|----------|---------------|
| Session auth, CSRF, TOTP | `lib/auth.js` | Backend contract; iOS uses cookie/token + CSRF for mutating calls (or evolve to Bearer+refresh — see API_CONTRACTS) |
| Fleet / containers / logs / SSE jobs | `lib/docker.js`, `lib/monitor.js`, `server.js`, `openapi.yaml` | Patterns for container inventory, logs, job streams |
| DNS Cloudflare + GoDaddy | `lib/dns.js`, `/api/v1/dns/domains`, connections DNS | Domain inventory + A-record ops; extend for CNAME/tunnel publish |
| Encrypted vault | `lib/vault.js`, `lib/integrations.js` | Server-side secret storage patterns; iOS keeps secrets in Keychain |
| AI tool tiers + confirm | `lib/jarvis/tools.js`, `confirm.js`, `redact.js` | Template for typed tools, T0 read / T1–T2 confirm / T3 refuse |
| Activity events | `Monitor.event`, `/events` | Activity feed model |
| OpenAPI + problem+json | `openapi.yaml`, `lib/problem.js` | Error envelope for new Infra APIs |

### Existing assets that are **not** the host agent

`lib/localagent.js` is an **approved source-edit / redeploy helper** for Control apps. It is **not** the managed infrastructure agent required for metrics, process lists, website discovery, or tunnel ops. A new **DevX Host Agent** package will be introduced (planned under `agents/host/` in later steps) without overwriting `localagent.js`.

---

## 3. iOS modular architecture

Prefer SPM packages (or Xcode local packages) under `ios/`:

```
ios/
  DevXInfra/                 # App target (shell, DI composition root)
  Packages/
    DevXDesignSystem/        # Tokens, motion, primitives
    DevXDomain/              # Models, errors, use cases (pure)
    DevXServices/            # Protocol interfaces
    DevXNetworking/          # HTTP, SSE, WebSocket clients
    DevXTailscale/           # Tailscale API client
    DevXSSH/                 # SSH/SFTP (maintained library wrapper)
    DevXAgentClient/         # Managed agent channel via backend
    DevXPersistence/         # SwiftData/SQLite non-secrets
    DevXSecurity/            # Keychain, biometrics, host keys
    DevXFeatures/            # Feature modules (CommandCenter, Network, …)
```

### Layering

1. **Presentation** — SwiftUI views; Observation (`@Observable`) view models; no networking in views.
2. **Features** — Coordinators / use-case façades per tab and device workspace section.
3. **Domain** — `Device`, `Application`, `PublishedLink`, `Domain`, `ActivityEvent`, `Operation`, typed errors.
4. **Services (protocols)** — `TailscaleServing`, `SSHSessionServing`, `SFTPServing`, `HostMetricsServing`, `ContainerServing`, `WebsiteDiscoveryServing`, `DomainServing`, `PublishingServing`, `AIAssistantServing`, `CredentialStore`.
5. **Infrastructure** — URLSession, Keychain, SwiftData, SSH library, backend API client.

Dependency injection: protocol-based, composition root in the app target. Structured concurrency (`async`/`await`, task groups, actors for session multiplexers). Avoid monolithic view models.

---

## 4. Dual access path (shared interfaces)

Feature code depends on **capability protocols**, not on transport:

```swift
protocol HostShellSession: Sendable { /* PTY I/O */ }
protocol HostFileSystem: Sendable { /* SFTP-like ops */ }
protocol HostMetricsSource: Sendable { /* CPU/RAM/disk samples */ }
protocol HostContainerSource: Sendable { /* Docker/Podman */ }
protocol HostWebsiteDiscovery: Sendable { /* validated HTTP candidates */ }
```

| Capability | Direct path | Managed agent path |
|------------|-------------|--------------------|
| Shell | SSH PTY over Tailscale IP | Agent `exec` / PTY bridge (optional; prefer SSH when available) |
| Files | SFTP | Agent file API (scoped roots) |
| Metrics / processes | Optional via SSH scripts (fragile) → prefer agent | Agent collectors |
| Containers / logs | Prefer agent (Docker socket on host) | Agent Docker/Podman API |
| Website discovery | Not via phone scan | Agent localhost probe + HTTP validate |
| Publish / tunnel | Backend + Cloudflare APIs | Agent runs `cloudflared` / reports tunnel status |

Selection policy: if device has agent registered and healthy → use agent for structured ops; if user opens Terminal/Files and SSH credentials exist → direct SSH/SFTP. Surfaces must label the active path.

---

## 5. Navigation (maps to design reference)

**Primary tabs (iPhone):** Command Center · Network · Applications · Domains · Workspace  

**Secondary / sheet routes:** AI Assistant · Activity · Monitoring · Settings · Credentials · Notifications · Command Palette  

**Device workspace sections:** Overview · Terminal · Files · Containers · Processes · Network · Applications · Domains · Logs · AI Diagnostics  

Design reference alignment: near-black Command Center with neon wireframe topology, integration status pills (Tailscale / Cloudflare / GoDaddy), live activity, Publish FAB, bottom tab bar — see `DESIGN_SYSTEM.md`.

---

## 6. Backend evolution (non-destructive)

Extend DevX Control rather than forking:

1. **`/api/v1/infra/*`** — Tailscale proxy (scoped token server-side), device registry join, agent heartbeats, metrics snapshots, website candidates, publish pipelines.
2. Keep existing `/fleet`, `/containers`, `/dns`, `/connections`, Jarvis routes for the **Control host itself**.
3. New OpenAPI paths documented in `API_CONTRACTS.md`; update `openapi.yaml` when implemented.
4. Agent auth: device enrollment token → rotating agent credentials; never embed admin Tailscale/Cloudflare secrets in the iOS bundle.

---

## 7. Data persistence (iOS)

| Data | Store |
|------|--------|
| Session tokens, SSH passwords/keys, API tokens, host keys | Keychain (`DevXSecurity`) |
| Device cache, last-seen, UI layout, offline labels | SwiftData / SQLite |
| Terminal scrollback (bounded) | On-disk cache with size caps |
| Secrets in logs / analytics | Never |

Clear stale “online” labeling when last successful probe exceeds threshold; show last-seen timestamps from real sources only.

---

## 8. Streaming and realtime

- **SSE** already used for Control jobs (`/jobs/{id}/stream`) — reuse pattern for publish stages and agent log tails via backend.
- **SSH PTY** — byte stream; terminal UI must not animate keystroke latency.
- **Metrics** — pull/push from agent at bounded intervals; Swift Charts bind only to real samples.
- **Reduce Motion / Low Power** — throttle decorative motion; keep operational streams.

---

## 9. Threat model snapshot

See `SECURITY_MODEL.md`. High-level: iOS is a privileged remote console; compromise of the phone or backend session can reach infrastructure. Mitigations: biometric gate, short sessions, CSRF/Bearer discipline, host-key pinning, agent least privilege, mutation confirmations, redaction.

---

## 10. Build & CI reality

| Check | Where |
|-------|--------|
| Node unit/smoke tests | Existing `npm test`, `test/api.smoke.sh` — keep green |
| Swift package resolve / `xcodebuild` | **Requires macOS runner** — add GitHub Actions `macos-latest` when available |
| Linux agent | Generate project + docs + static review only |

---

## 11. Acceptance architecture mapping

Full journey (auth → Tailscale → device → SSH → SFTP → metrics → containers → discover site → domain → publish → verify → AI) maps to features above. Each step requires a real dependency (credentials, agent, or SSH). Missing dependency → explicit blocked UI, never simulated success.
