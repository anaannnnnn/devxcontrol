# DevX Host Agent

Runs on each infrastructure host (Linux/macOS/Windows via Node 20+). Reports metrics, Docker inventory, processes, container logs (on demand), and local HTTP discovery to DevX Control. The iPhone app never invents this data.

## First-time enroll (admin on Control)

```http
POST /api/v1/infra/agents/enroll
{ "label": "ubuntu-server" }
```

Returns `enrollmentToken` (short-lived).

## Activate on the host

```bash
export CONTROL_URL=https://your-control.example.com
export ENROLLMENT_TOKEN=enr_...
export DEVICE_ID=ubuntu-server   # match Tailscale hostname/id used in the app
node agents/host/agent.mjs
```

Credentials are saved to `agent-state.json` (mode 0600). Re-runs reuse them.

## What it reports

| Capability | Source |
|---|---|
| metrics | `os` load/mem |
| containers | `docker ps -a` |
| processes | `ps -eo …` |
| applications | localhost HTTP probes on common ports |
| logs | `docker logs` when Control queues `container.logs` |

Without this agent, iOS Workspace containers/processes/logs/apps stay honestly empty.
