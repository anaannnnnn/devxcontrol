# DevX Control

One dashboard for every DevX app: live status, start/stop/restart, logs, database browser and editor, GitHub updates with optional auto-pull, encrypted credential vault, backups, TLS/DNS checks and alerts.

**Native iOS client (DevX Infrastructure OS):** see [`ios/`](ios/) — open `ios/DevXInfra.xcodeproj` on macOS with Xcode.

## Install (any OS)

DevX Control has no npm dependencies. It needs **Node 20+** and, to manage containers, **Docker** (Docker Desktop on Windows and macOS).

| System | Command |
|---|---|
| **Windows** (PowerShell) | `git clone https://github.com/anaannnnnn/devxcontrol; cd devxcontrol; .\install.ps1` |
| **macOS / Ubuntu / any Linux**, native | `git clone https://github.com/anaannnnnn/devxcontrol && cd devxcontrol && npm run setup && npm start` |
| **macOS / Linux**, in Docker | `git clone https://github.com/anaannnnnn/devxcontrol && cd devxcontrol && bash install.sh` |
| **Try it with fake data** | `npm run demo` then sign in as `admin` / `Demo@12345` |

Then open http://localhost:3000. Setup creates a `.env` with fresh secrets and prints a first-time admin password once. Change it on the Account page and turn on two-step sign-in. This dashboard controls Docker on the machine, so do not expose it to the internet without HTTPS.

- **Windows in Docker:** use the native route above, or run `install.sh` inside WSL2.
- **Public HTTPS:** `DOMAIN=panel.example.com bash install.sh` adds the site to an existing Caddy container named `caddy`; point the domain's DNS A record at the machine.
- **Keep it running:** Linux, a systemd unit or the Docker install (`restart: unless-stopped`); macOS, launchd; Windows, a Task Scheduler task running `node server.js`.
- **Settings** (all optional, in `.env`): `PORT`, `APPS_DIR` (default `~/devx-apps`), `DATA_DIR`, `BACKUP_DIR`, `CADDYFILE`, `INIT_USERS`, `GITHUB_TOKEN`.
- **Apps:** none are registered at first. Add them from the dashboard (Create or Onboard), or list them in `apps.json`.

## Features
- **Fleet:** radar, health, CPU/memory, response history, start/stop/restart per app.
- **Database tab:** tables, search, sort, edit cells (double-click), add/edit/delete rows, CSV export, SQL console (read-only unless you turn on "Allow changes"). Postgres and SQLite apps. Tables without a primary key are read-only in the grid.
- **Updates:** latest GitHub commit per app (newest first), what is pending, Pull and deploy, Pull all. **Auto-pull is off for every app** until you switch it on; it only fast-forwards and skips an app with uncommitted changes on the server. GitHub is checked every `GIT_CHECK_MIN` minutes (default 5).
- **Vault:** save your own logins and API keys per app, encrypted (AES-256-GCM) with `VAULT_KEY`. Each reveal is logged.
- **Account:** change password, two-step sign-in (authenticator app).

## Operating notes
- Accounts live in the `control-data` volume (`users.json`, scrypt hashes). The first-time password is removed from `.env` after the first successful start.
- Keep `VAULT_KEY` (and `SESSION_SECRET` if no VAULT_KEY) stable, or saved credentials cannot be decrypted.
- Alerts: set `ALERT_WEBHOOK`, or `TELEGRAM_TOKEN` + `TELEGRAM_CHAT`, in `.env`, then `docker compose up -d`.
- Backups: nightly at `BACKUP_HOUR` (default 3), last 14 kept per app, in `~/backups`. Back up before editing production data.
- Adding an app: edit `apps.json`, then `docker compose up -d --build`.
- The Docker socket is root-equivalent on the host. Keep the password strong and two-step on.
- SQLite editing uses a small helper image (`devx-sqlite:1`, built on first use) that mounts the app's volume.
- Demo: `npm run demo` (sign in as admin / Demo@12345). Tests: `npm test`. Smoke test: `bash test/api.smoke.sh`. API: `/openapi.yaml`.
- Not yet run against a real Docker daemon, a real Postgres or a real SQLite volume. Try the database tab on a small app first.

## Autopilot, Studio, Onboard (real data)
- Connections page: GitHub App (App ID + .pem) and a free AI (Ollama install button, or Groq/Gemini/OpenRouter key).
- Autopilot only drafts fixes. Nothing is pushed, merged or deployed until you approve the review.
- Env: `CADDYFILE` (path to host Caddyfile, mounted in docker-compose.yml), `DOMAIN_SUFFIX` (optional).
- New endpoints under `/api/v1`: connections/*, github/*, autopilot/*, reviews/*, studio/:id/*, onboard/*.

## Orbit
Twelve optional features (design debt, business DNA, proving ground, visitor ghosts, universes, revenue, competitor mirror, fleet brain, weekly gift, talk, client rooms, orbit view). Every switch is **off** until you turn it on under Automation. See [docs/ORBIT.md](docs/ORBIT.md). Nothing pushes, merges or deploys without a review, except a design-debt stylesheet you explicitly whitelist, which can be undone.

