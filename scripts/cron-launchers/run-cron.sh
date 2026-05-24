#!/bin/bash
# launchd cron job 공통 launcher.
# .env.local에서 CRON_SECRET 읽어 Bearer 헤더로 /api/cron/<path> 호출.
#
# usage: run-cron.sh <cron-path>
# 예) run-cron.sh daily-morning  → curl http://127.0.0.1:3001/api/cron/daily-morning

set -u

CRON_PATH="${1:-}"
if [[ -z "$CRON_PATH" ]]; then
  echo "[$(date '+%F %T')] ERROR: missing cron path arg" >&2
  exit 2
fi

ENV_FILE="/Users/kihoon_mac/work/mywork/my_dashboard/.env.local"
if [[ ! -r "$ENV_FILE" ]]; then
  echo "[$(date '+%F %T')] ERROR: cannot read $ENV_FILE" >&2
  exit 3
fi

# CRON_SECRET 추출 (앞뒤 따옴표 제거)
CRON_SECRET=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//; s/^'\''//; s/'\''$//')
if [[ -z "$CRON_SECRET" ]]; then
  echo "[$(date '+%F %T')] ERROR: CRON_SECRET not found in $ENV_FILE" >&2
  exit 4
fi

URL="http://127.0.0.1:3001/api/cron/${CRON_PATH}"
START_TS=$(date '+%s')
echo "[$(date '+%F %T')] START $CRON_PATH"

HTTP_CODE=$(curl -sS -o /tmp/myhub-cron-${CRON_PATH}.out \
  -w '%{http_code}' \
  --max-time 540 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "$URL") || {
    echo "[$(date '+%F %T')] FAIL curl exit=$? path=$CRON_PATH" >&2
    exit 5
  }

DUR=$(($(date '+%s') - START_TS))

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  echo "[$(date '+%F %T')] OK $CRON_PATH ${HTTP_CODE} ${DUR}s"
  head -c 800 /tmp/myhub-cron-${CRON_PATH}.out
  echo
else
  echo "[$(date '+%F %T')] BAD $CRON_PATH ${HTTP_CODE} ${DUR}s" >&2
  head -c 800 /tmp/myhub-cron-${CRON_PATH}.out >&2
  echo >&2
  exit 6
fi
