# DevX Infrastructure OS — Implementation Plan

Aligned with master build prompt PART 21 and design reference  
`/cursor/stores/self/media/command-center-design-reference.jpg`  
(near-black `#030607`, neon `#36FFB2`, Command Center + iPhone layouts).

---

## 0. Repo findings (DX-2 baseline)

| Finding | Implication |
|---------|-------------|
| No Swift / Xcode project in repo | Create `ios/` tree; cannot compile here |
| Linux Cloud Agent, Node 22 only | Document macOS blocker for native builds |
| Mature Control backend (Docker, DNS CF/GD, vault, Jarvis confirm tiers, SSE jobs) | Reuse; add `/api/v1/infra/*` + host agent |
| `localagent.js` ≠ infra host agent | New agent package; do not overwrite |
| Web CSS themes (teal / purple aurora) ≠ Command Center palette | iOS design system uses reference tokens; web left unchanged unless separately requested |
| No Tailscale / SSH / SFTP / tunnel publish in codebase | Greenfield for those capabilities |

**Preserve:** all existing `lib/*`, `public/*`, tests, install scripts. Additive only.

---

## 1. Delivery phases (PART 21)

### STEP 1 — Inspect (this turn) ✅

Environment + repo inventory complete. Toolchains: Node yes; Swift/Xcode **absent**.

### STEP 2 — Planning docs (this turn) ✅

Ship: `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `API_CONTRACTS.md`, `SECURITY_MODEL.md`, `DESIGN_SYSTEM.md`, `TEST_PLAN.md` in repo `docs/` and Project store `docs/`.

### STEP 3 — Design system components

**Priority after plans.**

1. SPM `DevXDesignSystem` with color/typography/spacing/motion tokens from `DESIGN_SYSTEM.md`.
2. Primitives: `NeonBorder`, `Hairline`, `StatusDot`, `MetricTile`, `IntegrationPill`, `CommandSearchField`, `PublishFAB`, `TopologyCanvas` (Metal/SwiftUI — real device nodes only).
3. Motion tokens + Reduce Motion hooks.
4. Snapshot/preview fixtures **only** in `#if DEBUG` / preview providers — never as live Command Center data.

### STEP 4 — Core app infrastructure

1. Xcode project / workspace under `ios/DevXInfra`.
2. Tab shell matching reference (5 tabs + Publish FAB).
3. AppState composition root, routing, deep links.
4. `DevXNetworking` (problem+json, CSRF/session or Bearer).
5. `DevXSecurity` Keychain + LocalAuthentication gate.
6. SwiftData models for non-secret cache.
7. Typed error surfaces + empty/offline templates.
8. Global command palette stub wired to real registries as features land.

### STEP 5 — Tailscale integration

1. Backend-held OAuth/API token (scoped); iOS calls `/api/v1/infra/tailscale/devices`.
2. Device list + topology modes (list / topology / activity / health).
3. Online / last-seen / IPs / OS / MagicDNS from real API.
4. Device → Workspace navigation.

### STEP 6 — SSH and SFTP

1. Adopt a maintained SSH library (evaluate Citadel / SwiftNIO SSH / vendor wrapper at implementation time on macOS — do not invent crypto).
2. PTY terminal (ANSI, resize, scrollback, selection, accessory bar).
3. Host-key verify UX; Keychain credentials.
4. SFTP browser with transfer queue and document picker import/export.

### STEP 7 — Device management (metrics, processes, containers)

1. Host agent MVP: heartbeat, CPU/RAM, process list, Docker/Podman inventory, log follow.
2. iOS Containers / Logs / Monitoring / Processes sections.
3. Authorized actions with confirmation; exec reuses terminal system.

### STEP 8 — Domains and publishing

1. Reuse Control DNS domain list; extend for tunnel-oriented records.
2. Agent website discovery (localhost candidates + HTTP validate).
3. Publish pipeline stages: `VALIDATING → ROUTING → CONFIGURING → CONNECTING → VERIFYING → LIVE` driven by real checks.
4. Cloudflare Tunnel workflow; no fake LIVE.

### STEP 9 — AI assistance

1. Extend Jarvis-style typed tools for infra (read-only default; confirm mutations).
2. Slash commands e.g. `/publish <app> from <device>` with structured tool plans.
3. Never fabricate tool results; reuse redaction patterns from `lib/jarvis/redact.js`.

### STEP 10 — Polish and validate

1. Motion polish, accessibility, iPad split views.
2. Unit / UI / contract tests per `TEST_PLAN.md`.
3. End-to-end acceptance on real Tailnet + Ubuntu host — **only on macOS + real credentials**.

---

## 2. Suggested work breakdown (engineering units)

| ID | Work | Depends | Risk |
|----|------|---------|------|
| P0 | Docs + design tokens + app shell | — | Low |
| P1 | Backend `/infra` device+agent registry stubs | P0 | Medium |
| P2 | Host agent heartbeat + metrics | P1 | Medium |
| P3 | Tailscale proxy + Network UI | P1 | Medium (credentials) |
| P4 | SSH/SFTP | P0 | High (library + UX) |
| P5 | Containers/logs via agent | P2 | Medium |
| P6 | DNS + publish pipeline | P2, P3 | High |
| P7 | AI tools | P5, P6 | Medium |
| P8 | macOS CI + E2E | All | Blocked without macOS |

---

## 3. Scaffolding goals for early PRs

1. `docs/*` planning set (this PR).
2. `ios/` Xcode-friendly layout + `DevXDesignSystem` token sources.
3. App shell SwiftUI files that compile **once Xcode is available**.
4. Optional: OpenAPI fragment draft for `/infra` (contract-first).

Do **not** delete or redesign the web Control UI in these PRs.

---

## 4. Credential and environment blockers

| Dependency | Status |
|------------|--------|
| macOS + Xcode | **Blocked** on current agent (Linux) |
| Tailscale API access token / OAuth | Not in repo; needs owner |
| Cloudflare / GoDaddy tokens | Supported in Control connections; need real accounts for E2E |
| SSH access to Ubuntu host | Needs user keys/host |
| LLM provider for AI | Control already supports connections; need configured endpoint |
| Apple Developer signing | Needed for device installs |

---

## 5. Definition of done (honest)

A step is done when:

- Code paths call real services or show an explicit unmet-dependency state.
- Tests covering the new logic pass in the environment that can run them.
- No production screen is backed only by hardcoded infrastructure lists.
- iOS build success is claimed only after `xcodebuild` (or Xcode) succeeds on macOS.
