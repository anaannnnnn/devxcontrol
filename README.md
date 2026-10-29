# DevX Control

One dashboard for every DevX app: live status, start/stop/restart, logs, database browser and editor, GitHub updates with optional auto-pull, encrypted credential vault, backups, TLS/DNS checks and alerts.

## Install (on the server)
    tar xzf devx-control.tar.gz && cd devx-control && bash install.sh
Then open https://devxpert.shop

**DNS (GoDaddy):** `A @ YOUR_SERVER_IP` and `A www YOUR_SERVER_IP`. Delete any "Parked" A record. HTTPS is issued automatically once DNS resolves.

**Sign in:** users `anan` and `subunu`, first-time password is set by `INIT_PASSWORD` (printed by `install.sh`). Change it on the Account page straight away and turn on two-step sign-in. This dashboard controls the whole server.

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
- Demo: `npm run demo` (sign in as anan with the demo password in package.json). Tests: `npm test`. Smoke test: `bash test/api.smoke.sh`. API: `/openapi.yaml`.
- Not yet run against a real Docker daemon, a real Postgres or a real SQLite volume. Try the database tab on a small app first.

## Autopilot, Studio, Onboard (real data)
- Connections page: GitHub App (App ID + .pem) and a free AI (Ollama install button, or Groq/Gemini/OpenRouter key).
- Autopilot only drafts fixes. Nothing is pushed, merged or deployed until you approve the review.
- Env: `CADDYFILE` (path to host Caddyfile, mounted in docker-compose.yml), `DOMAIN_SUFFIX` (optional).
- New endpoints under `/api/v1`: connections/*, github/*, autopilot/*, reviews/*, studio/:id/*, onboard/*.

## Orbit
Twelve optional features (design debt, business DNA, proving ground, visitor ghosts, universes, revenue, competitor mirror, fleet brain, weekly gift, talk, client rooms, orbit view). Every switch is **off** until you turn it on under Automation. See [docs/ORBIT.md](docs/ORBIT.md). Nothing pushes, merges or deploys without a review, except a design-debt stylesheet you explicitly whitelist, which can be undone.

