#!/bin/bash
# Mac local server 모든 로그 tail.
# 사용: scripts/server/logs.sh         # 모두
#       scripts/server/logs.sh app     # app만
#       scripts/server/logs.sh cron    # cron만

set -e
LOG_DIR="$HOME/Library/Logs/myhub"

case "${1:-all}" in
  app)
    files=("$LOG_DIR/app.out.log" "$LOG_DIR/app.err.log")
    ;;
  cron)
    files=("$LOG_DIR"/cron.*.log "$LOG_DIR"/cron.*.err.log)
    ;;
  all|*)
    files=("$LOG_DIR"/*.log)
    ;;
esac

# 존재하는 파일만 필터
existing=()
for f in "${files[@]}"; do
  [[ -f "$f" ]] && existing+=("$f")
done

if [[ ${#existing[@]} -eq 0 ]]; then
  echo "(no logs in $LOG_DIR)"
  exit 0
fi

exec tail -F "${existing[@]}"
