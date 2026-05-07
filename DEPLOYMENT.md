# MyHub — Production 배포 가이드 (Phase 7)

이 문서는 dev 환경에서 production으로 옮길 때 필요한 외부 작업과 환경변수 설정을 정리한다.

## 1. Supabase Production 프로젝트

### 1-1. 신규 프로젝트 생성
1. https://supabase.com/dashboard 에서 **New Project** 클릭
2. 이름: `myhub-production` (또는 임의)
3. Region: 가까운 곳 (Asia Northeast 권장)
4. 비밀번호 설정 후 생성

### 1-2. 스키마 적용
```bash
# .env.local의 DATABASE_URL을 production 값으로 일시 교체
# Settings → Database → Connection string (Direct, port 5432)

npm run db:enable-extensions   # vector + pgcrypto + pg_trgm
npm run db:push:force          # 26개 테이블 생성
npm run db:seed                # 10명 Agent 시드

# RLS 정책 적용
psql $DATABASE_URL -f supabase/migrations/0001_rls_policies.sql
# 또는 Supabase Dashboard → SQL Editor 에서 supabase/migrations/0001_rls_policies.sql 붙여넣기
```

### 1-3. Auth 설정 (Supabase Dashboard)
- **Authentication → URL Configuration**
  - Site URL: `https://your-app.vercel.app` (또는 사용자 정의 도메인)
  - Redirect URLs: `https://your-app.vercel.app/**`
- **Authentication → Providers → Google**
  - Client ID / Secret 설정
  - Authorized redirect URI에 `https://<production-ref>.supabase.co/auth/v1/callback` 등록

## 2. Google Cloud Console

### 2-1. OAuth Client redirect URI 추가
- https://console.cloud.google.com → APIs & Services → Credentials
- OAuth 2.0 Client ID → Authorized redirect URIs:
  - `https://<production-ref>.supabase.co/auth/v1/callback`

### 2-2. OAuth 동의 화면 scope
- 기본: `openid email profile`
- Calendar: `https://www.googleapis.com/auth/calendar.readonly` (Phase 2B)
- Test users 모드라면 powergenes@gmail.com 등록 확인

## 3. Vercel 배포

### 3-1. 계정 + 프로젝트
1. https://vercel.com/new 에서 GitHub repo `kihoonlee/my_dashboard` import
2. Framework: Next.js 자동 감지
3. Build settings는 default

### 3-2. 환경변수 (Project Settings → Environment Variables)
필수:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase production URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon publishable key
- `SUPABASE_SERVICE_ROLE_KEY` — secret key (cron RLS 우회용)
- `DATABASE_URL` — Direct connection (port 5432)
- `NEXT_PUBLIC_APP_URL` — `https://your-app.vercel.app`
- `ALLOWED_EMAIL` — 화이트리스트 이메일 (`flowto.ai.master@gmail.com`)
- `ANTHROPIC_API_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `OAUTH_TOKEN_KEY` — `openssl rand -base64 48` (dev와 다른 값으로!)
- `OPENAI_API_KEY` — 옵시디언 임베딩
- `GITHUB_PAT` — production은 PAT 필수 (gh CLI fallback 없음)
- `CRON_SECRET` — `openssl rand -base64 32`

선택:
- `SENTRY_DSN` — 가입 후 등록
- `GITHUB_ORG` — 기본 `FlowTo-ai`
- `OBSIDIAN_VAULT_PATH` — 클라우드는 vault 동기화 미지원 (로컬만)
- `CLAUDE_SKILLS_PATH` — 클라우드는 skills 자동 동기화 미지원 (로컬만)

### 3-3. Cron 활성화
- `vercel.json` 의 crons 배열이 자동으로 등록됨 (Project Settings → Cron Jobs에서 확인)
- **Hobby (무료)**: daily cron만 가능 (`daily-morning`, `sunday-evening`은 OK).
- **Pro ($20/월)**: `hourly`, `calendar-sync` 같은 sub-daily cron 가능.

Hobby 시작 시 vercel.json에서 `hourly`, `calendar-sync` 항목을 일시 제거하거나 외부 cron 서비스(cron-job.org) 사용.

## 4. Sentry (선택)

1. https://sentry.io → 신규 프로젝트 (Next.js)
2. DSN 복사 → Vercel 환경변수 `SENTRY_DSN`
3. SDK 설치: `npm i @sentry/nextjs && npx @sentry/wizard@latest -i nextjs`
4. wizard가 자동 설정. DSN이 환경변수에 있으면 production만 활성화.

`lib/observability.ts`의 `sendToSentry()`가 globalThis.Sentry 검사 후 capture 호출 — SDK 미설치여도 안전하게 noop.

## 5. 검증

### 5-1. Smoke test
- `https://your-app.vercel.app/auth/login` → Google 로그인
- 화이트리스트 외 계정은 차단 확인
- `/today`, `/news`, `/goals` 등 주요 페이지 200 OK

### 5-2. Cron 수동 트리거
```bash
curl -X GET https://your-app.vercel.app/api/cron/daily-morning \
  -H "Authorization: Bearer $CRON_SECRET"
```
응답 예: `{"ok": true, "newsSync": {...}, "briefing": {...}, "insight": {...}}`

### 5-3. Lighthouse
- Chrome DevTools → Lighthouse → Mobile, Performance/SEO/Accessibility/Best Practices
- 목표: 80+
- 주요 최적화는 next.config.ts에 적용됨 (`optimizePackageImports`, `removeConsole`, security headers).

## 6. 배포 후 운영

### 모니터링
- Vercel Dashboard → Logs (실시간)
- Vercel Dashboard → Analytics (트래픽)
- Sentry 대시보드 (에러)
- Supabase Dashboard → Database → SQL Editor 직접 조회

### Cost watch
- Vercel: Hobby 100GB-hours / Pro 1TB-hours
- Supabase: Free 500MB DB / Pro 8GB
- Anthropic: usage limit 설정 (https://console.anthropic.com)
- OpenAI: usage limit 설정

### 백업
- Supabase Pro 자동 백업 7일
- 추가 백업: `pg_dump` 주간 cron (별도 스크립트 필요)

## 7. 롤백

문제 발생 시:
- Vercel: Deployments → Previous Deployment → Promote to Production (instant rollback)
- DB schema: drizzle-kit migrations로 down 작성 (현재 push 모드라 down 없음 → production 진입 전 generate로 전환 권장)

---

## 자주 빠지는 함정 (CLAUDE.md Pitfalls 발췌)

- `OAUTH_TOKEN_KEY` 변경 시 기존 oauth_tokens 행 복호화 불가 → 사용자 재로그인 필요.
- `.env`에서 `KEY= value` 처럼 등호 뒤 공백 → 값에 공백 포함됨 (lib/openai/embeddings.ts에서 이미 trim 적용).
- drizzle raw `sql\`\``에 Date 객체 직접 바인딩 금지 → `tsTz()` 헬퍼 사용 (lib/db/sql-utils.ts).
- Next.js 16 turbopack은 새 라우트 hot reload 못 잡음 → dev 재시작.
