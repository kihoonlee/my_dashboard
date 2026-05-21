#!/bin/bash
# Mac local server 상태 한 눈 보기.

UID_=$(id -u)

echo "=== launchd jobs ==="
launchctl list | grep com.kihoon.myhub | awk '{ printf "  %-50s pid=%-7s exit=%s\n", $3, $1, $2 }' | sort

echo ""
echo "=== ports ==="
for port in 3000 3001 54321 54322; do
  pid=$(lsof -nP -iTCP:$port -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $2}')
  printf "  :%-6s  %s\n" "$port" "${pid:-(-)}"
done

echo ""
echo "=== HTTP probes ==="
for url in "http://127.0.0.1:3001/" "http://127.0.0.1:54321/auth/v1/health"; do
  http=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || echo "ERR")
  printf "  %-50s HTTP %s\n" "$url" "$http"
done

echo ""
echo "=== last cron exits (gui/${UID_}) ==="
for c in daily-morning sunday-evening hourly calendar-sync wiki-build; do
  out=$(launchctl print "gui/${UID_}/com.kihoon.myhub.cron.${c}" 2>&1 | grep -E "last exit code|run number" | head -2 | tr '\n' ' ')
  printf "  cron.%-15s %s\n" "$c" "$out"
done
