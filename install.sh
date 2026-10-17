#!/usr/bin/env bash
# Installs DevX Control on the VPS. Run: bash install.sh
set -euo pipefail
cd "$(dirname "$0")"
HOME_DIR="${HOME_DIR:-$HOME}"
DOMAIN="${DOMAIN:-devxpert.shop}"
mkdir -p "$HOME_DIR/backups"
rand() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
if [ ! -f .env ]; then
  SECRET="$(rand 48)"; VKEY="$(rand 48)"
  TOKEN=""; command -v gh >/dev/null && TOKEN="$(gh auth token 2>/dev/null || true)"
  cat > .env <<EOF
HOME_DIR=$HOME_DIR
DOCKER_GID=$(getent group docker | cut -d: -f3)
SESSION_SECRET=$SECRET
VAULT_KEY=$VKEY
INIT_USERS=anan,subunu
INIT_PASSWORD=Devx@2026
GITHUB_TOKEN=$TOKEN
SERVER_IP=172.105.36.108
GIT_CHECK_MIN=5
EOF
  chmod 600 .env
  echo "Users: anan and subunu (first-time password: Devx@2026). Change it after signing in: Account page."
fi
docker network inspect web >/dev/null 2>&1 || docker network create web
docker compose up -d --build
ok=0; for i in $(seq 1 20); do curl -fs http://127.0.0.1:3000/healthz >/dev/null 2>&1 || docker exec devx-control node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && { ok=1; break; }; sleep 2; done
[ "$ok" = 1 ] && { grep -v '^INIT_PASSWORD=' .env > .env.new && mv .env.new .env && chmod 600 .env; echo "Dashboard is up. The first-time password has been removed from .env (accounts keep their own hashed passwords)."; } || { echo "Dashboard did not start. Check: docker logs devx-control"; exit 1; }
CF="$HOME_DIR/caddy/Caddyfile"
if [ -f "$CF" ] && ! grep -q "^$DOMAIN" "$CF"; then
  cp "$CF" "$CF.bak.$(date +%s)"
  printf '\nwww.%s {\n\tredir https://%s{uri} permanent\n}\n\n%s {\n\tencode zstd gzip\n\treverse_proxy devx-control:3000\n}\n' "$DOMAIN" "$DOMAIN" "$DOMAIN" >> "$CF"
  docker exec caddy caddy validate --config /etc/caddy/Caddyfile && docker exec caddy caddy reload --config /etc/caddy/Caddyfile
fi
IP="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1)"
if [ "$IP" != "172.105.36.108" ]; then
  echo; echo "DNS NOT READY: $DOMAIN points to '${IP:-nothing}'. In GoDaddy DNS set:"
  echo "  A   @    172.105.36.108   (delete any 'Parked' A record)"
  echo "  A   www  172.105.36.108"
  echo "HTTPS certificates are issued automatically a minute or two after DNS resolves."
fi
echo "Open https://$DOMAIN"
