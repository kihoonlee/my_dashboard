#!/bin/bash
# Mac local server deploy: production build + launchd app 강제 재시작.
# 사용: scripts/server/deploy.sh

set -e
cd "$(dirname "$0")/../.."

echo "[deploy] npm run build"
npm run build

UID_=$(id -u)
echo "[deploy] kickstart com.kihoon.myhub.app"
launchctl kickstart -k "gui/${UID_}/com.kihoon.myhub.app"

sleep 3
HTTP=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/)
echo "[deploy] app HTTP=${HTTP}  (307 = unauthenticated redirect, 정상)"
