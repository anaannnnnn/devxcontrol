# DevX Control handoff

## 2026-10-19 — Ledger page

### What changed
- **lib/ledger.js** (new): `validateRun()` + `makeLedger({ engineUrl, healthUrl, fetchImpl })`.
  - Kinds allowlisted: sales, purchase, perf, stock, move, age, ageItems, lines. Anything else → 400 before any engine call.
  - Group checked per kind (mirrors the engine's KIND_GROUPS); age/ageItems/lines take none.
  - Dates: real `YYYY-MM-DD`, from ≤ to, not before 2000-01-01, not in the future, max 366 days. Dropped for stock/age/ageItems.
  - Filters: `q` ≤ 80 chars (letters/digits/simple punctuation); code filters br/loc/item/dept/cat/sub/brand/supplier/bucket capped (10–40) and `[A-Za-z0-9._-]` only; `flow` sales|purchase for lines; page ≤ 1000, limit 1–1000 (default 300). Unknown keys are dropped.
  - `engine()` / `nexus()` status probes never throw.
- **server.js**: imports ledger; `LEDGER_URL` (default `http://127.0.0.1:4180`) and `NEXUS_HEALTH_URL` (default `https://nexus.devxpert.online/api/health`) env. Routes on `/api/v1` after `auth.middleware`:
  `GET /ledger/status`, `GET /ledger/meta`, `POST /ledger/run`. Only `/^\/ledger\/run$/` added to `READ_POSTS`; no other new write for members.
- **public/js/pages/ledger.js** (new): automation.js style (`h()`, `api()`). Nexus + engine status (refreshes every 30 s), report form (kind/breakdown/dates/search), results table with totals.
- **public/js/main.js**: imports `ledgerPage`, route `/ledger`, System menu entry "Ledger".
- **test/ledger.test.js** (new): node:test, validator + mocked fetch, no live DB.
- No fleet app registered. Nothing in /home/anan/apps/nexus or /home/anan/apps/supermarket-reports edited. 94.200.177.214 not contacted.

### Test result
- `node --test test/ledger.test.js` → 7/7 pass.
- `npm test` → 135/135 pass.
- Local smoke (throwaway DEMO instance on :3999, temp data dir, since removed): status showed engine up (134 branches, 2026-01-01..2026-10-19) and Nexus up (200); `{"kind":"drop"}` → 400; sales by branch for 2026-10-18 returned real rows.

### Not done / blocker before going live
- The running Control was **not** restarted or rebuilt.
- The `devx-control` container cannot reach the engine at `127.0.0.1:4180` (checked from inside: ECONNREFUSED; Nexus health from inside = 200). The engine listens on host loopback only and Control runs on bridge networks `web`/`jarvis-net`. Before deploying, pick one:
  1. Have the engine also listen on the docker bridge gateway, then set `LEDGER_URL=http://host.docker.internal:4180` and add `extra_hosts: ["host.docker.internal:host-gateway"]` to docker-compose.yml. This changes supermarket-reports, which is outside this task.
  2. Run the engine as a container on `web`, then set `LEDGER_URL=http://<name>:4180`.
  Until then, the page shows "Report engine: Down" and Nexus status still works.
- Changes are uncommitted on `feature/jarvis`.
