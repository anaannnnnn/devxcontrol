# DevX Infrastructure OS — API Contracts

This document defines contracts between:

1. **DevXInfra iOS** ↔ **DevX Control management backend**
2. **Management backend** ↔ **DevX Host Agent**
3. **Management backend** ↔ **Tailscale / Cloudflare / GoDaddy / LLM** (server-side)

Existing Control API (`openapi.yaml`, base `/api/v1`) remains. New Infra surfaces live under `/api/v1/infra/*` and must use the same **RFC 7807 `application/problem+json`** error style (`lib/problem.js`).

---

## 1. Existing Control endpoints (reuse)

Relevant today for patterns and partial product overlap:

| Method | Path | Notes |
|--------|------|-------|
| POST/GET/DELETE | `/session` | Cookie `dc_s`; mutating calls need `x-csrf-token` |
| GET | `/fleet` | Control-host apps + health |
| GET | `/containers/{name}/logs` | Recent logs |
| POST | `/containers/{name}/{action}` | start/stop/restart |
| GET | `/jobs/{id}/stream` | SSE job output |
| GET | `/events` | Activity log |
| GET | `/host` | Control server Docker capacity |
| GET | `/dns/domains` | CF + GD domain inventory + `serverIp` |
| PUT/DELETE | `/connections/dns/{provider}` | Store DNS credentials (admin) |
| GET | `/credentials`, app credential CRUD | Encrypted vault metadata |
| Jarvis / Orbit talk | confirm-gated tools | Model for AI confirmations |

**Auth today:** session cookie + CSRF. iOS v1 should implement this faithfully (cookie jar + CSRF header). A later additive Bearer scheme is allowed if documented and dual-supported; do not break the web client.

---

## 2. Shared schemas (Infra)

```ts
// Conceptual TypeScript for clarity — Swift Codable mirrors these names.

type DeviceStatus = "online" | "offline" | "unknown";
type HealthStatus = "healthy" | "degraded" | "failed" | "unknown";
type OsFamily = "linux" | "windows" | "macos" | "ios" | "android" | "other";

interface Device {
  id: string;                 // stable: tailscale node id or agent device id
  name: string;               // hostname / MagicDNS label
  os: OsFamily;
  osVersion?: string;
  addresses: string[];        // Tailscale IPs
  magicDns?: string;
  status: DeviceStatus;
  lastSeenAt?: string;        // ISO-8601
  appsCount?: number;         // from agent discovery only
  publishedCount?: number;
  agent?: {
    enrolled: boolean;
    version?: string;
    lastHeartbeatAt?: string;
    capabilities: string[];   // e.g. ["metrics","docker","discovery","tunnel"]
  };
}

interface Application {
  id: string;
  name: string;
  deviceId: string;
  hostServer: string;         // display hostname
  status: "running" | "paused" | "stopped" | "unknown";
  listenAddresses: string[];  // host:port candidates
  rootPath?: string;
  discoveredAt: string;
  probe?: { ok: boolean; status?: number; ms?: number };
}

interface PublishedLink {
  id: string;
  url: string;
  deviceId: string;
  applicationId: string;
  domain: string;
  status: HealthStatus;
  latencyMs?: number;
  provider: "cloudflare" | "godaddy" | "other";
  verifiedAt?: string;
}

interface Domain {
  name: string;
  provider: "cloudflare" | "godaddy";
  id?: string;                // CF zone id when present
}

interface ActivityEvent {
  id: string;
  timestamp: string;
  message: string;
  statusType: "ok" | "info" | "warn" | "bad";
  deviceId?: string;
  applicationId?: string;
}

interface IntegrationStatus {
  id: "tailscale" | "cloudflare" | "godaddy" | "agent";
  state: "connected" | "disconnected" | "error";
  detail?: string;
}
```

Errors:

```json
{
  "type": "https://devx.control/problems/unauthenticated",
  "title": "Sign in required",
  "status": 401,
  "detail": "Your session is missing or expired."
}
```

---

## 3. New management API — `/api/v1/infra`

All routes require authentication unless noted. Mutations require CSRF (session mode).

### 3.1 Command Center overview

`GET /infra/overview`

Response:

```json
{
  "integrations": [
    { "id": "tailscale", "state": "connected" },
    { "id": "cloudflare", "state": "connected" },
    { "id": "godaddy", "state": "disconnected" }
  ],
  "devices": { "online": 4, "total": 5 },
  "applications": { "total": 27, "recentNew": 3 },
  "publishedLinks": { "total": 12, "allHealthy": true },
  "domains": { "total": 3, "providers": ["cloudflare", "godaddy"] },
  "uptimeRatio": null,
  "activity": [ /* ActivityEvent[] last N */ ],
  "notes": ["uptimeRatio is null when insufficient probe history"]
}
```

Rules: counts come from Tailscale + agent + DNS APIs. If Tailscale is disconnected, `devices.total` may be `0` with `notes` explaining why — **never invent devices**.

### 3.2 Tailscale devices

`GET /infra/tailscale/status`  
`GET /infra/tailscale/devices?q=&status=`  
`GET /infra/tailscale/devices/{id}`

Backend holds the Tailscale API credential. iOS never embeds tailnet API keys.

Device payloads map to `Device`. Filtering/search are server-side.

### 3.3 Host agent enrollment

`POST /infra/agents/enroll` (admin) → `{ enrollmentToken, expiresAt }`  
`POST /infra/agents/activate` (agent) → `{ agentId, deviceId, credentials }`  
`POST /infra/agents/heartbeat` (agent) → ack + desired config  
`GET /infra/agents` (user) → enrolled agents + health  

Heartbeat body (agent → server):

```json
{
  "agentId": "...",
  "deviceId": "...",
  "version": "0.1.0",
  "capabilities": ["metrics", "docker", "discovery"],
  "metrics": { "cpuPct": 12.4, "memUsed": 8388608000, "memTotal": 17179869184 },
  "ts": "2026-11-05T03:00:00Z"
}
```

### 3.4 Metrics, processes, containers (via backend proxy)

`GET /infra/devices/{id}/metrics?range=1h`  
`GET /infra/devices/{id}/processes`  
`GET /infra/devices/{id}/containers`  
`GET /infra/devices/{id}/containers/{cid}/logs?follow=1` (SSE)  
`POST /infra/devices/{id}/containers/{cid}/{action}` where `action ∈ start|stop|restart` — **confirm UX on client**; server audits.

404/409 with problem+json if agent offline — client shows disconnected state.

### 3.5 Website discovery

`POST /infra/devices/{id}/discovery/scan` → `{ jobId }`  
`GET /infra/devices/{id}/applications` → `Application[]`  

Agent validates candidates with local HTTP GET; only returns probed results. No phone-initiated LAN sweep API.

### 3.6 Domains

`GET /infra/domains` — may wrap existing `dns.domains()`  

`GET /infra/domains/{name}/records`  
`PUT /infra/domains/{name}/records` — constrained record editor (A/AAAA/CNAME/TXT); reject unsafe bulk deletes.

### 3.7 Publishing pipeline

`POST /infra/publish`

```json
{
  "deviceId": "…",
  "applicationId": "…",
  "domain": "example.com",
  "subdomain": "nexus",
  "provider": "cloudflare"
}
```

`202` → `{ operationId }`

`GET /infra/publish/{operationId}` / SSE `.../stream`

Stages (server-emitted, real checks only):

| Stage | Meaning |
|-------|---------|
| `VALIDATING` | App still reachable on device; domain owned |
| `ROUTING` | DNS plan computed |
| `CONFIGURING` | Tunnel / ingress config written |
| `CONNECTING` | Tunnel session established |
| `VERIFYING` | Public HTTPS probe |
| `LIVE` | Probe passed |
| `FAILED` | Terminal failure with `detail` |

Clients must not jump to `LIVE` locally.

### 3.8 AI assistant

`POST /infra/ai/chat` — contextual messages + optional `deviceId`  
`POST /infra/ai/confirm/{id}` — execute pending tool (mirrors Jarvis confirm)  

Tools (illustrative allowlist): `tailscale.devices`, `device.metrics`, `apps.list`, `publish.plan`, `publish.run` (confirm), `containers.restart` (confirm). Read-only by default.

Slash command example: `/publish nexus from WIN-DEV-PC` → structured plan → confirm card.

---

## 4. Host agent HTTP (agent-local or reverse channel)

Preferred: **agent dials out** to management backend (heartbeat + pull commands) to avoid inbound ports on hosts.

Command envelope:

```json
{
  "id": "cmd_…",
  "type": "containers.list" | "logs.follow" | "discovery.scan" | "metrics.snapshot" | "tunnel.apply",
  "params": {}
}
```

Result envelope:

```json
{
  "id": "cmd_…",
  "ok": true,
  "payload": {},
  "error": null
}
```

Agent must refuse unknown command types and path escapes (reuse Control’s path-safety ideas from `localagent.js` / scanners).

---

## 5. Direct path (non-HTTP)

| Protocol | Use |
|----------|-----|
| SSH (TCP 22 or custom) over Tailscale | Interactive PTY |
| SFTP | File ops |
| Host key | `ssh-ed25519` / RSA fingerprints stored in Keychain |

Not part of OpenAPI; specified in feature modules. Backend may store **metadata** (preferred user, port) but not private keys unless explicitly vaulted by user action with audit.

---

## 6. Versioning and compatibility

- Additive fields are encouraged; iOS ignores unknown keys.
- Breaking changes require `/api/v2` or explicit negotiated `Accept` version.
- Update `openapi.yaml` when `/infra` is implemented; until then this markdown is the source of truth.
