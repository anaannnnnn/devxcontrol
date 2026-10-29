#!/usr/bin/env bash
# Upgrade the running DevX Control to this version and move it to a new domain.
# Usage:  bash upgrade.sh <new-domain> [path-to-devx-control.tar.gz]
# Example: bash upgrade.sh devxpert.shop ~/devx-control.tar.gz
# Keeps: .env, apps.json, users, passwords, 2FA, vault (Docker volume). Backs up the old folder and Caddyfile first.
set -euo pipefail
DOMAIN="${1:-}"; TAR="${2:-$HOME/devx-control.tar.gz}"; SERVER_IP="${SERVER_IP:-$(curl -fsS https://api.ipify.org)}"
[ -n "$DOMAIN" ] || { echo "Usage: bash upgrade.sh <new-domain> [tarball]"; exit 1; }
[ -f "$TAR" ] || { echo "Tarball not found: $TAR"; exit 1; }
DOMAIN="$(echo "$DOMAIN" | tr 'A-Z' 'a-z' | sed 's#^https\?://##; s#/.*$##')"
TS="$(date +%s)"; mkdir -p "$HOME/backups"

# 1. find where the current install lives
OLD="$(docker inspect devx-control --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' 2>/dev/null || true)"
[ -n "$OLD" ] && [ -d "$OLD" ] || OLD="$HOME/devx-control"
[ -d "$OLD" ] || { echo "Could not find the current install. Set it up first: tar xzf $TAR && cd devx-control && DOMAIN=$DOMAIN bash install.sh"; exit 1; }
echo "Current install: $OLD"

# 2. back it up (includes .env)
tar -czf "$HOME/backups/devx-control-before-$TS.tar.gz" -C "$(dirname "$OLD")" "$(basename "$OLD")"
echo "Backup: $HOME/backups/devx-control-before-$TS.tar.gz"

# 3. unpack the new version and copy it over, keeping .env and apps.json
NEW="$(mktemp -d)"; tar -xzf "$TAR" -C "$NEW"
SRC="$NEW/devx-control"; [ -d "$SRC" ] || { echo "Unexpected tarball layout"; exit 1; }
rm -rf "$OLD/public" "$OLD/lib"
cp -r "$SRC/public" "$SRC/lib" "$OLD/"
for f in server.js package.json openapi.yaml Dockerfile docker-compose.yml install.sh upgrade.sh README.md; do [ -f "$SRC/$f" ] && cp "$SRC/$f" "$OLD/$f"; done
[ -d "$SRC/test" ] && { rm -rf "$OLD/test"; cp -r "$SRC/test" "$OLD/"; }
[ -d "$SRC/docs" ] && { rm -rf "$OLD/docs"; cp -r "$SRC/docs" "$OLD/"; }
rm -rf "$NEW"

# 4. rebuild and restart (data volume is untouched)
cd "$OLD"
docker network inspect web >/dev/null 2>&1 || docker network create web
docker compose up -d --build
ok=0
for i in $(seq 1 30); do
  docker exec devx-control node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && { ok=1; break; }
  sleep 2
done
[ "$ok" = 1 ] || { echo "New version did not start. Logs: docker logs devx-control"; echo "Roll back: tar xzf $HOME/backups/devx-control-before-$TS.tar.gz -C $(dirname "$OLD") && cd $OLD && docker compose up -d --build"; exit 1; }
echo "Dashboard is up."

# 5. point Caddy at the new domain (old dashboard block is replaced)
CF="$HOME/caddy/Caddyfile"
if [ -f "$CF" ]; then
  cp "$CF" "$CF.bak.$TS"
  python3 - "$CF" "$DOMAIN" <<'PY'
import re, sys
path, dom = sys.argv[1], sys.argv[2]
src = open(path).read()
blocks, i, n = [], 0, len(src)
while i < n:                                   # split into top-level blocks by brace depth
    j = src.find('{', i)
    if j < 0: blocks.append(src[i:]); break
    d, k = 1, j + 1
    while k < n and d: d += (src[k] == '{') - (src[k] == '}'); k += 1
    blocks.append(src[i:k]); i = k
old = set()
for b in blocks:
    if 'devx-control:3000' in b:
        head = b.split('{', 1)[0]
        old.update(h.strip().rstrip(',') for h in re.split(r'[\s,]+', head) if h.strip())
keep = []
for b in blocks:
    head = b.split('{', 1)[0].strip()
    names = {h for h in re.split(r'[\s,]+', head) if h}
    if 'devx-control:3000' in b: continue
    if any(('www.' + o) in names for o in old if not o.startswith('www.')): continue
    if dom in names or ('www.' + dom) in names: continue
    keep.append(b)
out = ''.join(keep).rstrip() + f"\n\nwww.{dom} {{\n\tredir https://{dom}{{uri}} permanent\n}}\n\n{dom} {{\n\tencode zstd gzip\n\treverse_proxy devx-control:3000\n}}\n"
open(path, 'w').write(out)
print('Caddy: removed old dashboard domain(s):', ', '.join(sorted(old)) or 'none', '| added', dom)
PY
  if docker exec caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    docker exec caddy caddy reload --config /etc/caddy/Caddyfile && echo "Caddy reloaded."
  else
    cp "$CF.bak.$TS" "$CF"; echo "Caddy config check failed, restored your old Caddyfile. Nothing changed there."; exit 1
  fi
else
  echo "No Caddyfile at $CF. Add this to your Caddy config by hand:"; printf '%s {\n\tencode zstd gzip\n\treverse_proxy devx-control:3000\n}\n' "$DOMAIN"
fi

# 6. DNS check
IP="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [ "$IP" != "$SERVER_IP" ]; then
  echo; echo "DNS NOT READY: $DOMAIN points to '${IP:-nothing}'. At your DNS provider set:"
  echo "  A   <name>   $SERVER_IP   (for a subdomain like control.xyz.com the name is 'control'; for the root use @)"
  echo "  If it is on Cloudflare, set the record to 'DNS only' (grey cloud) until the certificate is issued."
  echo "HTTPS is issued automatically a minute or two after DNS resolves."
fi
echo; echo "Done. Open https://$DOMAIN  (same users and passwords as before)."
