# Orbit

Orbit is a set of optional tools on DevX Control. Each one has a per-app switch in **Automation**. The switch is **off** until you turn it on. Off means the feature will not scan, fetch, draft or notify.

Nothing in Orbit pushes, merges, changes DNS or edits production data by itself. A change that should land in an app becomes a Change Report in Reviews (the existing Autopilot task). The only auto-apply is the design-debt stylesheet, and only if you add `debt` to that app's auto-apply list. Undo is one click on the Design debt page and deletes `devx-debt.css`.

AI, when a model is connected in Connections, is optional. Every AI feature still runs a deterministic path and the screen says when the model was not used.

## Switches

| Switch | What it does | Data | If it cannot measure |
| --- | --- | --- | --- |
| debt | Scores CSS and HTML for palette, spacing, radii, buttons, tap size, contrast, focus | `data/orbit.json` | "not measured" when the app directory or files are missing |
| dna | Classifies the business from README, file names, page text and table names, then a playbook gap map | `lib/playbooks/*.json`, correction remembered | No evidence means "not classified", not a guess |
| proving | Compares paired responses and decides rollback from monitor samples | run record in `orbit.json` | No Docker daemon: shadow is not started and the verdict says so. Rollback does not change the running image from this process |
| ghosts | Persona checks on HTML | latest report | No headless browser in this build: rule checks only, labelled as such |
| universes | Three contrast-checked CSS directions. Preview injects the layer. Adopt opens a review | CSS in `orbit.json` | Copy tweaks are not invented without a model |
| revenue | Read-only `SELECT *` on a table you name. At-risk compares the same hour to earlier weeks | mapping only | DynamoDB: "not measurable here". Fewer than two earlier weeks: no bare number |
| mirror | Up to 5 public URLs, robots.txt, one fetch a minute | derived facts only, not the page | Demo mode does not fetch. A disallow is stored as "not fetched" |
| brain | Local fix patterns after you approve a review, plus a taste profile | `orbit.json`, exportable, deletable | Patterns are stored only when the brain switch is on for that app |
| gift | One small suggestion per app per week | gift card | Auth, payments and schema are skipped unless you allow auth or schema. Payments are never allowed |
| talk | Arabic and English keyword tools. Actions need a confirmation card | confirmation lives in memory for 5 minutes | Unknown phrases say the keyword fallback missed. No paid speech service |
| rooms | Client logins, one app each | `data/clients.json` (scrypt) | A client cannot call owner APIs. Portal is `/client.html` |
| orbit | Planet view from the monitor | no extra store | Apps with the switch off are absent. Missing samples stay null, not zero visitors |

Thresholds on the same page: rollback error-rate rise (default 5 points), p95 rise (default 150 ms), watch minutes (default 15), minimum samples (default 8). A decision with too few samples is "hold", not a rollback.

## How a feature fails safe

- The upstream URL always comes from the registry.
- Revenue and schema reads go through the existing database layer, read-only, and each revenue read is audited.
- Competitor fetches use a named user-agent and stop when robots.txt disallows the path.
- Secrets in the fix library are stripped before save. The raw page of a competitor is not saved.
- Client passwords are scrypt hashes. The API never returns the hash.
- Talk will not restart an app until you tap the confirmation card, and that route is admin-only.

## Upgrade

Use the existing tarball flow. `upgrade.sh` copies `lib/`, `public/`, `server.js` and `docs/`. Your `settings.json`, vault and users stay on the Docker volume. New switches appear as off because a missing key is off.

```bash
bash upgrade.sh devxpert.shop ~/devx-control.tar.gz
```

## What this environment did not run

Unit tests cover the pure rules (`npm test`). They do not start a Docker daemon, a real Postgres, a headless browser, or a live competitor site. Demo mode (`npm run demo`) loads the UI and answers those features with an explicit "not measured" or "not queued" instead of fake numbers.
