# Mac Local Server 운영 가이드

이 Mac (`/Users/kihoon_mac`)을 MyHub 24/7 서버로 운영하는 setup. Vercel/Supabase production 미사용 — 모든 게 Mac local.

## 구성

| 컴포넌트 | 포트 | 관리 방식 |
|---|---|---|
| **Next.js prod** (24/7) | `:3001` | `launchctl com.kihoon.myhub.app` (KeepAlive=true, RunAtLoad=true) |
| **Next.js dev** (작업용) | `:3000` | 사용자가 직접 `npm run dev` |
| **Supabase docker** | `:54321` (API), `:54322` (DB), `:54323` (Studio) | `npm run supabase:start` |
| **Cron 5개** | — | `launchctl com.kihoon.myhub.cron.*` (KST 시각) |

## 자주 쓰는 명령

```bash
# 상태 한 눈에
./scripts/server/status.sh

# 코드 수정 후 재배포 (build + restart)
./scripts/server/deploy.sh

# 로그 tail
./scripts/server/logs.sh         # 모두
./scripts/server/logs.sh app     # app만
./scripts/server/logs.sh cron    # cron만

# 단순 재시작 (build 없이)
./scripts/server/restart.sh
```

## launchd jobs

`~/Library/LaunchAgents/com.kihoon.myhub.*.plist` 6개. 시스템 로그인 시 자동 로드.

| Label | 역할 | 스케줄 (KST) |
|---|---|---|
| `com.kihoon.myhub.app` | Next.js prod 서버 :3001 | 항상 (KeepAlive) |
| `com.kihoon.myhub.cron.daily-morning` | RSS 동기화 + 데일리 브리핑 + 인사이트 | 매일 05:00 |
| `com.kihoon.myhub.cron.sunday-evening` | 주간 회고 + 관심 주제 갱신 | 일요일 21:00 |
| `com.kihoon.myhub.cron.hourly` | GitHub 동기화 + dirty mark 감지 시 관심 주제 재추출 | 매시 00분 |
| `com.kihoon.myhub.cron.calendar-sync` | Google Calendar 캐시 갱신 | 5분마다 (StartInterval) |
| `com.kihoon.myhub.cron.wiki-build` | Obsidian 임베딩 갱신 | 매일 01:00 |

cron은 `scripts/cron-launchers/run-cron.sh <path>`로 통일된 launcher 사용. `.env.local`의 `CRON_SECRET`을 Bearer 헤더로 자동 인증.

## launchd 명령어 (직접 제어)

```bash
# 등록 (재부팅 후 자동 + 즉시 시작)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.kihoon.myhub.app.plist

# 등록 해제
launchctl bootout gui/$(id -u)/com.kihoon.myhub.app

# 강제 재시작 (-k = 죽이고 다시)
launchctl kickstart -k gui/$(id -u)/com.kihoon.myhub.app

# 상세 상태
launchctl print gui/$(id -u)/com.kihoon.myhub.app

# 모든 myhub 작업
launchctl list | grep com.kihoon.myhub
```

## 코드 수정 후 반영

```bash
# 1. 변경
vim app/some-route/route.ts

# 2. 빌드 + 재시작 (한 줄)
./scripts/server/deploy.sh
```

`next start`는 `.next/` 빌드 결과만 보므로 dev hot reload 같은 자동 반영 없음. **`npm run build` 후 launchd 재시작 필요**.

## 환경변수 (`.env.local`)

prod·dev 같은 파일 공유. 다른 값 필요한 항목은 launchd plist의 `EnvironmentVariables`로 override:

| key | dev | prod |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` (.env.local) | `http://localhost:3001` (plist override) |
| `CRON_SECRET` | (사용 안 함) | run-cron.sh가 .env.local에서 읽음 |
| 그 외 | 동일 |

## 로그 위치

`~/Library/Logs/myhub/`:
- `app.out.log` / `app.err.log` — Next.js stdout/stderr
- `cron.<name>.log` / `cron.<name>.err.log` — 각 cron의 실행 결과

cron은 launcher가 `[YYYY-MM-DD HH:MM:SS] OK <name> 200 1s` 형식 + 응답 body 800자 print.

## Mac sleep 방지

```bash
pmset -g | grep -E "^ sleep"   # sleep 0이면 OK
```

현재 시스템 sleep 비활성. 디스플레이 sleep(30분)은 무관 — 백그라운드 process는 계속 실행.

**노트북 lid를 닫으면 sleep 들어갈 수 있음.** 닫고도 운영하려면 추가 조치 (외부 모니터 + 전원 + `caffeinate -d -i` 또는 `pmset disablesleep 1`).

## 보안 — 알아둘 것

- supabase docker가 `0.0.0.0`로 binding (CLI default). LAN에 같은 Wi-Fi 사용자가 있으면 `54321`/`54322`/`54323` 접근 가능. **RLS 미적용** 상태이므로 anon key 노출 시 모든 데이터 읽기 가능.
- Mac을 외부 인터넷에 노출(`cloudflared` 등)하지 말 것. RLS 적용 + production cloud 도입 후 별도 phase.
- 단일 사용자 Mac에서만 직접 사용하는 한 안전.

## 트러블슈팅

### cron이 안 도는 것 같다
```bash
launchctl print gui/$(id -u)/com.kihoon.myhub.cron.hourly | grep -E "next run|run number|last exit"
tail -50 ~/Library/Logs/myhub/cron.hourly.log
```

### app이 자꾸 죽는다
```bash
launchctl print gui/$(id -u)/com.kihoon.myhub.app | grep -E "last exit|run number"
tail -50 ~/Library/Logs/myhub/app.err.log
# ThrottleInterval=10 — 10초 안에 또 죽으면 launchd가 잠시 idle. 빌드 직후 정상.
```

### NEXT_PUBLIC_APP_URL 변경하고 싶다
- prod: `~/Library/LaunchAgents/com.kihoon.myhub.app.plist`의 `EnvironmentVariables`. plist 수정 후 `launchctl bootout` → `bootstrap`.
- dev: `.env.local`만 수정.

### CRON_SECRET 회전
1. 새 값 발급: `openssl rand -base64 32 | tr -d '\n=' | tr '+/' '-_'`
2. `.env.local`의 `CRON_SECRET=...` 값 교체
3. `./scripts/server/restart.sh` (prod 재시작 — env 새로 읽음)
4. `./scripts/server/deploy.sh` 가 더 안전 (build도 같이)

## 정지·해제 (서버 운영 멈출 때)

```bash
# 모든 myhub launchd 해제
for f in ~/Library/LaunchAgents/com.kihoon.myhub.*.plist; do
  launchctl bootout gui/$(id -u)/$(basename "$f" .plist) 2>/dev/null
done

# 다시 등록하려면
for f in ~/Library/LaunchAgents/com.kihoon.myhub.*.plist; do
  launchctl bootstrap gui/$(id -u) "$f"
done

# 완전 제거 (plist 파일 삭제)
rm ~/Library/LaunchAgents/com.kihoon.myhub.*.plist
```
