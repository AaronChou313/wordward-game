#!/bin/sh
set -eu

BASE_URL=${1:-http://127.0.0.1:8080}
SMOKE_TMP=$(mktemp -d)
trap 'rm -rf "$SMOKE_TMP"' EXIT HUP INT TERM

SMOKE_USER="smoke$(date +%s)"
SMOKE_PASSWORD=$(openssl rand -hex 16)
RUN_SUFFIX=$(openssl rand -hex 8)
STARTED_AT=$(date -u -d '10 minutes ago' '+%Y-%m-%dT%H:%M:%S.000Z')
FINISHED_AT=$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')

curl --fail --silent --show-error "$BASE_URL/api/health" > "$SMOKE_TMP/health.json"
curl --fail --silent --show-error \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$SMOKE_USER\",\"password\":\"$SMOKE_PASSWORD\"}" \
  "$BASE_URL/api/auth/register" > "$SMOKE_TMP/register.json"

ACCESS_TOKEN=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["accessToken"])' "$SMOKE_TMP/register.json")
AUTHORIZATION="Authorization: Bearer $ACCESS_TOKEN"

curl --fail --silent --show-error \
  -X PUT \
  -H "$AUTHORIZATION" \
  -H 'Content-Type: application/json' \
  -d '{"version":0,"data":{"version":2,"gold":100}}' \
  "$BASE_URL/api/save" > "$SMOKE_TMP/save.json"

curl --fail --silent --show-error \
  -H "$AUTHORIZATION" \
  -H 'Content-Type: application/json' \
  -d "{\"difficulty\":\"easy\",\"endlessFloor\":1,\"bossWave\":30,\"runId\":\"smoke-run-$RUN_SUFFIX\",\"seed\":\"smoke-seed-$RUN_SUFFIX\",\"startedAt\":\"$STARTED_AT\",\"finishedAt\":\"$FINISHED_AT\",\"summary\":{\"wave\":30,\"kills\":1100,\"lordHp\":10}}" \
  "$BASE_URL/api/merit/claims" > "$SMOKE_TMP/claim.json"

curl --fail --silent --show-error \
  -H "$AUTHORIZATION" \
  "$BASE_URL/api/leaderboard/me" > "$SMOKE_TMP/leaderboard.json"

python3 - "$SMOKE_TMP" "$SMOKE_USER" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
username = sys.argv[2]
health = json.loads((root / 'health.json').read_text())
registration = json.loads((root / 'register.json').read_text())
save = json.loads((root / 'save.json').read_text())
claim = json.loads((root / 'claim.json').read_text())
leaderboard = json.loads((root / 'leaderboard.json').read_text())

assert health == {'status': 'ok'}
assert registration['user']['username'] == username
assert save == {'version': 1, 'data': {'version': 2, 'gold': 100}}
assert claim['awarded'] is True and claim['merit'] == 1
assert leaderboard['nickname'] == username
assert leaderboard['merit'] == 1
assert leaderboard['rank'] is not None
print('smoke ok: health, registration, save, merit claim, leaderboard')
PY
