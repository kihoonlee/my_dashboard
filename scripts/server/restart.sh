#!/bin/bash
# Mac local server 강제 재시작 (build 없이).
# 코드 변경 없을 때 단순 재기동.

UID_=$(id -u)
launchctl kickstart -k "gui/${UID_}/com.kihoon.myhub.app"
sleep 3
HTTP=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/)
echo "app HTTP=${HTTP}  (307 = 정상)"
