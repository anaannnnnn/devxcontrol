#!/usr/bin/env bash
# Usage (demo server): BASE=http://localhost:3999 PASS='Devx@2026' bash test/api.smoke.sh
B=${BASE:-http://localhost:3999}; J=$(mktemp)
c() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
echo "unauth fleet   : $(c $B/api/v1/fleet) (want 401)"
echo "bad password   : $(c -X POST $B/api/v1/session -H 'content-type: application/json' -d '{"username":"anan","password":"x"}') (want 401)"
curl -s -c $J -X POST $B/api/v1/session -H 'content-type: application/json' -d "{\"username\":\"${USER_NAME:-anan}\",\"password\":\"${PASS:-Devx@2026}\"}" > /tmp/login.json
CSRF=$(python3 -c "import json;print(json.load(open('/tmp/login.json')).get('csrf',''))")
echo "fleet          : $(c -b $J $B/api/v1/fleet) (want 200)"
echo "unknown app    : $(c -b $J $B/api/v1/apps/nope) (want 404)"
echo "stop w/o csrf  : $(c -b $J -X POST $B/api/v1/apps/nexus/stop) (want 403)"
echo "restart caddy  : $(c -b $J -H "x-csrf-token: $CSRF" -X POST $B/api/v1/containers/caddy/stop) (want 4xx, protected)"
echo "restart nexus  : $(c -b $J -H "x-csrf-token: $CSRF" -X POST $B/api/v1/apps/nexus/restart) (want 200)"
echo "bad container  : $(c -b $J -H "x-csrf-token: $CSRF" -X POST "$B/api/v1/containers/..%2Fetc/restart") (want 4xx)"
echo "backups        : $(c -b $J $B/api/v1/backups) (want 200)"
echo "db tables      : $(c -b $J $B/api/v1/apps/nexus/db/tables) (want 200)"
echo "no-db app      : $(c -b $J $B/api/v1/apps/terrakit/db/tables) (want 404)"
echo "write w/o flag : $(c -b $J -H "x-csrf-token: $CSRF" -H content-type:application/json -X POST $B/api/v1/apps/nexus/db/query -d '{"sql":"delete from orders"}') (want 403)"
echo "updates        : $(c -b $J $B/api/v1/updates) (want 200)"
echo "vault list     : $(c -b $J $B/api/v1/credentials) (want 200)"
echo "openapi        : $(c $B/openapi.yaml) (want 200)"
echo "orbit flags    : $(c -b $J $B/api/v1/orbit/flags) (want 200)"
echo "orbit sky      : $(c -b $J $B/api/v1/orbit/sky) (want 200)"
echo "debt off       : $(c -b $J -H "x-csrf-token: $CSRF" -H content-type:application/json -X POST $B/api/v1/orbit/apps/nexus/debt/scan) (want 409)"
curl -sI $B/ | grep -i "content-security\|x-frame\|nosniff" | tr -d '\r'
