# Installs DevX Control on Windows (native Node, no WSL needed).   Run in PowerShell:  .\install.ps1
# Needs: Node 20+ (https://nodejs.org) and, to manage containers, Docker Desktop running.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error 'Node.js 20+ is required: https://nodejs.org'; exit 1 }
if ([int](node -p "process.versions.node.split('.')[0]") -lt 20) { Write-Error 'Node 20 or newer is required.'; exit 1 }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Warning 'Docker not found. The panel will start, but it cannot manage containers until Docker Desktop is installed and running.' }
node scripts/setup.mjs
Write-Host 'Starting DevX Control (Ctrl+C to stop). To keep it running at login, create a Task Scheduler task that runs: node server.js'
node server.js
