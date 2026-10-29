#!/usr/bin/env bash
# Installs DevX Control with Docker on Linux or macOS.   Run: bash install.sh
# Optional: DOMAIN=panel.example.com bash install.sh   (adds it to an existing Caddy container, if you run one)
# No Docker? Use the native route instead:  npm run setup && npm start   (works on Windows too, see README)
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo "Docker is not installed. Install it first (https://docs.docker.com/get-docker/) or use: npm run setup && npm start"; exit 1; }
HOME_DIR="${HOME_DIR:-$HOME}"
mkdir -p "$HOME_DIR/apps" "$HOME_DIR/backups" "$HOME_DIR/caddy"
rand() { head -c 96 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
sock_gid() { stat -c %g /var/run/docker.sock 2>/dev/null || stat -f %g /var/run/docker.sock 2>/dev/null || echo 0; }
if [ ! -f .env ]; then
  INIT_PASSWORD="${INIT_PASSWORD:-$(rand 14)A1}"
  cat > .env <<EOT
HOME_DIR=$HOME_DIR
DOCKER_GID=$(sock_gid)
SESSION_SECRET=$(rand 48)
VAULT_KEY=$(rand 48)
INIT_USERS=${INIT_USERS:-admin}
INIT_PASSWORD=$INIT_PASSWORD
GIT_CHECK_MIN=5
EOT
  chmod 600 .env
  echo "User: ${INIT_USERS:-admin}   first-time password: $INIT_PASSWORD   (change it on the Account page)"
fi
docker network inspect web >/dev/null 2>&1 || docker network create web
docker compose up -d --build
ok=0; for i in $(seq 1 20); do
  docker exec devx-control node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && { ok=1; break; }; sleep 2
done
[ "$ok" = 1 ] || { echo "Dashboard did not start. Check: docker logs devx-control"; exit 1; }
grep -v '^INIT_PASSWORD=' .env > .env.new && mv .env.new .env && chmod 600 .env
echo "Dashboard is up. The first-time password was removed from .env (accounts keep their own hashed passwords)."

CF="$HOME_DIR/caddy/Caddyfile"
if [ -n "${DOMAIN:-}" ] && [ -f "$CF" ] && ! grep -q "^$DOMAIN" "$CF"; then
  cp "$CF" "$CF.bak.$(date +%s)"
  printf '\n%s {\n\tencode zstd gzip\n\treverse_proxy devx-control:3000\n}\n' "$DOMAIN" >> "$CF"
  docker exec caddy caddy validate --config /etc/caddy/Caddyfile && docker exec caddy caddy reload --config /etc/caddy/Caddyfile
  echo "Open https://$DOMAIN  (point its DNS A record at this machine's public IP)"
else
  echo "Open http://localhost:${PORT:-3000}"
fi
