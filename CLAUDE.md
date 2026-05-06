# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project — MyHub

1인용 개인 정보 허브 (`kihoon_dashboard` / repo: `kihoonlee/my_dashboard`). 10명의 한국어 AI Agent 팀(혜원·하영·수민·서연·다솜·현주·도연·민영·정연 + 메타 챗봇 민지)이 사업 운영(GitHub 추적)과 개인 정보(옵시디언·메일·일정·뉴스)를 통합 관리한다. 단일 사용자 화이트리스트 기반(Google OAuth, `ALLOWED_EMAIL` 환경변수).

**현재 위치**: **Phase 2A 완료** (민지 메인 채팅 + 혜원 홈 Hero + Agent 간 위임 ask_agent + chat_sessions/messages 영속화). Phase 2B(Calendar 동기화 + Realtime 스트리밍) 진입 가능. 상세 로드맵은 [progress.md](progress.md) 참조.

## Stack

- **Next.js 16.2.4 + React 19.2.4** (App Router, Turbopack). 이 버전은 학습 데이터 이후 — 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 먼저 읽어라 (AGENTS.md 규칙).
- **Tailwind v4** + shadcn/ui (neutral) + Pretendard Variable + tw-animate-css. 토큰은 `app/globals.css`에 CSS 변수 (Toss Blue `#3182F6` primary + 10명 Agent별 `--agent-*` 컬러).
- **Drizzle ORM** + `postgres-js`. 단일 사용자 dev에선 로컬 Supabase Postgres 직접 연결 (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
- **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`, supabase CLI dev dep). 로컬 dev는 `npm run supabase:start` (Docker 필요).
- **Anthropic SDK** (`@anthropic-ai/sdk` 0.93.x). 시드의 모델 ID 사용: `claude-sonnet-4-6` (혜원·민지·수민·현주) / `claude-haiku-4-5-20251001` (하영·서연·다솜·도연·민영·정연). `lib/anthropic/client.ts` 통해서만 호출.

## Commands

```bash
npm run dev                  # next dev -H 0.0.0.0 (IPv4+IPv6 강제 + LAN 미리보기)
npm run build
npm run lint                 # eslint flat config

# Supabase 로컬 (.env.local 자동 export → env(...) 치환 적용)
npm run supabase:start       # 14 컨테이너 (첫 실행 5-10분)
npm run supabase:stop
npm run supabase:status

# DB workflow
npm run db:enable-extensions # vector + pgcrypto + pg_trgm (최초 1회)
npm run db:push              # 인터랙티브; non-TTY는 db:push:force 사용
npm run db:push:force        # drizzle-kit push --force (CI/에이전트 환경)
npm run db:seed              # 10 Agent upsert (definitions.ts 변경 시 재실행)
npm run db:studio
```

`.env.example`를 `.env.local`로 복사해 채울 것. 테스트 프레임워크는 아직 없음.

## Architecture

**App Router** — 인증된 셸은 `app/(app)/` route group, auth 라우트는 `app/auth/`. proxy.ts에서 인증/리다이렉트 처리.

**Auth 흐름** (`proxy.ts` + `app/auth/*` + `lib/supabase/*`):
- 모든 요청에서 supabase 세션 + ALLOWED_EMAIL 화이트리스트 검사.
- `signInWithOAuth` → Google → `/auth/callback?code=...` → server-side `exchangeCodeForSession` → 홈.
- `next` 라우트는 query string 대신 **cookie `auth_next`** 로 전달 (Supabase wildcard 매칭 변수성 우회).
- Agent 간 내부 호출(ask_agent → /api/agents/*)은 `x-myhub-internal-call` + `x-myhub-agent-depth` 두 헤더로 인증 우회 통과.

**`lib/db/`** — DB 레이어의 단일 진입점.
- `schema.ts` — 26개 테이블 single source of truth. 도메인 섹션 구분(USERS / AGENTS & CHAT / TODO & CALENDAR / GOALS & REVIEWS / HABITS & YEAR IN PIXELS / KNOWLEDGE / BUSINESS-GitHub / DEV TOOLS / NEWS / MAIL). 모든 PK `uuid().defaultRandom()`, timestamp `withTimezone: true`.
- `client.ts` — `db` 싱글턴. **`.env.local`의 dotenv 자동 로드** (tsx 직접 실행 스크립트 호환). 새 쿼리는 `import { db } from "@/lib/db/client"`.
- `enable-extensions.ts` / `seed.ts` — 별도 tsx 스크립트.

**`lib/agents/`** — Agent 시스템.
- `definitions.ts`: 10 Agent의 model/temperature/maxTokens/systemPrompt/triggerConfig/toolPermissions/비용 한도 single source. 변경 시 `db:seed`.
- `guard.ts`: `checkBeforeInvoke` (활성/일·월 비용 한도) + `checkAfterInvoke` (5연속 오류 자동 일시정지).
- `tools/hayoung.ts`: 하영의 4개 Todo CRUD tool.
- `tools/shared.ts`: 모든 agent에 부여되는 **`ask_agent`** 공통 tool. `agents.toolPermissions.call_agents` 화이트리스트 기반 동적 schema.

**`lib/anthropic/`**.
- `client.ts`: SDK singleton + `invokeAgent()` 헬퍼. **`cacheSystemAndTools: true`** 시 system prompt 마지막 block + tools 마지막 정의에 `cache_control: ephemeral` 부여 (claude-api skill 가이드). **부모 셸이 빈 `ANTHROPIC_API_KEY=` export 시 fallback으로 .env.local 직접 파싱** (Claude Code harness 환경 대응).
- `pricing.ts`: 모델별 토큰 가격(input/output/cache write/read) + `calculateCostUsd()`.

**Agent 호출 골격** (`app/api/agents/[name]/invoke/route.ts`):
1. depth 헤더 검사(max 2) + agent 조회 + guard
2. tool defs = 도메인 tools + (call_agents 권한 있으면) ask_agent
3. invokeAgent — system prompt에 `{user_name}` `{current_time}` 치환
4. tool_use 루프 (max 5 iter, 동일 tool·동일 인자 2회 안티-루프)
5. agent_logs.insert (tokens / cost / duration / error)
6. checkAfterInvoke

**민지 메인 채팅** (`app/api/chat/route.ts` + `app/(app)/chat/page.tsx`):
- ensureUser로 supabase auth user → public.users 매핑.
- chat_sessions 신규/재사용 + chat_messages.insert(role=user) + 내부 fetch /api/agents/minji/invoke + chat_messages.insert(role=assistant, agentId=민지). lastMessageAt 갱신.
- URL `?session=<uuid>`로 세션 재진입 (히스토리 GET).

**핵심 도메인 관계**
- `agents` ↔ `agent_prompt_versions` (1:N, 버전 히스토리 + 롤백) / `agent_logs` (호출별 토큰·비용·에러)
- `chat_sessions` → `chat_messages` (`role`/`content`/`agentId`/`toolCalls` jsonb로 tool use 기록)
- `products` ↔ `todos` / `github_activity` — 13개 프로덕트 칸반(Phase 4)
- `obsidian_notes` — `vector(1024)` HNSW(`vector_cosine_ops`). 의미 검색 + `pg_trgm` FTS 병행 예정
- `goal_links.linked_type` + `linked_id` — 다형 참조
- 단일 사용자라도 멀티유저 확장 대비 RLS `user_id = auth.uid()` 정책 추후 추가

**Path alias**: `@/` → repo 루트. UI 컴포넌트는 `components/ui/`(shadcn CLI), 그 외 도메인 컴포넌트는 `components/` 직하.

## Conventions

- 한국어 UI/주석/커밋 메시지 OK. 코드 식별자는 영어.
- Agent **영문명**(`englishName`)은 unique key — `/api/agents/[name]/invoke`, `--agent-<englishName>` 컬러 토큰, `agent-badge.tsx`의 KOREAN_NAMES 매핑까지 일관.
- `db:push`는 마이그레이션 파일 없이 바로 적용 — 프로덕션 전환 시 `db:generate` + 검토.
- LLM 컨텍스트 주입은 `{user_name}`/`{current_time}` 플레이스홀더로 시스템 프롬프트에 포함.
- 모델 ID는 매 변경 시 최신 확인 (전역 CLAUDE.md 시간축 규칙). 시드 그대로 사용 권장.
- Anthropic SDK 호출은 항상 `lib/anthropic/client.ts` 통해서. 새 agent에 도구 추가 시 `app/api/agents/[name]/invoke/route.ts:getAgentTools()`에 등록.

## 이미 해결된 함정 (Pitfalls — 다시 빠지지 말 것)

> 같은 문제로 또 헤매지 않도록 모든 트러블슈팅을 여기에 누적. 새로운 함정 발견 시 이 섹션에 항목 추가.

**Next.js 16 — `middleware` → `proxy` 리네임**
- 파일명: `proxy.ts` (구 `middleware.ts`), export 이름: `proxy` 또는 `default`. 매처도 동일.
- matcher에서 `_next/*` 전체를 제외해야 함 (`_next/static`/`_next/image`만 제외하면 webpack-hmr WebSocket이 인증 redirect로 막혀 HMR 깨짐).

**Next.js 16 dev `allowedDevOrigins`**
- `-H 0.0.0.0`로 바인딩하고 `127.0.0.1`로 접근하면 cross-origin으로 분류돼 `_next/webpack-hmr` 차단. `next.config.ts`에 `allowedDevOrigins: ["127.0.0.1", "localhost"]` 추가 필수.

**부모 셸이 빈 `ANTHROPIC_API_KEY=` export → Next dotenv override:false에 막힘**
- Claude Code harness 등이 자식 프로세스에 빈 환경변수를 주입하면, Next.js가 .env.local 값을 읽고도 덮어쓰지 않음. `lib/anthropic/client.ts`에 fs 직접 파싱 fallback 구현됨.
- 새 server-only env var를 추가할 때 동일 문제 발생 가능 — 같은 패턴 적용 검토.

**dotenv 호이스팅 버그**
- `import { config } from "dotenv"; config(); import { db } from "./client";` 순서로 써도, ES module에서 `import`는 항상 호이스팅돼서 `client.ts`가 먼저 평가됨. `lib/db/client.ts`가 자체적으로 dotenv 호출하므로 신규 tsx 스크립트는 그냥 `import { db }`만 하면 됨.

**Supabase OAuth — `redirect_uri = ""` 빈 문자열 금지**
- `[auth.external.google]`에서 빈 값으로 두면 `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI` env var가 아예 주입 안 돼 "Unsupported provider: missing redirect URI" 400 발생. 명시적으로 `http://127.0.0.1:54321/auth/v1/callback` 박을 것.

**Supabase `additional_redirect_urls` wildcard 매칭 변수성**
- `?next=...` 같은 query string 포함된 redirectTo는 일관되게 매칭 안 됨. 해결: `redirectTo`는 path만 (`http://127.0.0.1:3000/auth/callback`), `next` 라우트는 cookie(`auth_next`, SameSite=Lax)로 전달. config.toml에는 `http://127.0.0.1:3000/**` wildcard.

**drizzle-kit push strict mode + non-TTY**
- `drizzle.config.ts`의 `strict: true` + 에이전트/CI 등 non-TTY 환경 → 인터랙티브 confirm 못 받아서 실패. `npm run db:push:force`(`--force`) 사용.
- 파괴적이지 않은 일상 dev에선 force 안전, 운영 마이그레이션 시점엔 별도 generate + 리뷰.

**Supabase config.toml의 `env(VAR)` 치환**
- supabase 데몬이 아닌 **supabase CLI 프로세스의 환경변수**에서 읽음. 따라서 `npm run supabase:start`는 `set -a && . ./.env.local && set +a && supabase start` 패턴.
- shell이 sh/bash/zsh 호환이라 macOS·Linux OK. Windows는 별도 패턴 필요 (현재 Mac만 지원).

**SSH 다중 계정 (Mac & Windows 공통)**
- default `github.com` SSH key가 회사 계정에 매핑됨. 개인 repo는 **반드시 alias** 사용: `git@github-kihoonlee:kihoonlee/<repo>.git` (Mac은 `~/.ssh/mac_ssh`, Win은 `~/.ssh/kihoonlee_pc`).
- 표준 형식으로 잘못 clone했으면 `git remote set-url origin git@github-kihoonlee:kihoonlee/my_dashboard.git`로 정정.
- 글로벌 CLAUDE.md(`~/.claude/CLAUDE.md`)의 "개인 GitHub 정보" 섹션에 동일 내용 영구 기록됨.

**Anthropic prompt caching invariant**
- prefix match — system prompt 첫 부분에 `Date.now()` / `uuid()` 같은 변동값 박으면 cache 전혀 안 됨. `{current_time}` 같은 placeholder 치환은 시스템 프롬프트 **끝부분**으로 옮기거나, message 쪽에 넣을 것 (현재는 시드 시스템 프롬프트 시작부에 있어서 cache 효과 제한적 — 추후 정밀화 대상).
- `cache_read_input_tokens > 0`인지로 검증. 0이면 silent invalidator 의심.

**Supabase OAuth PKCE — client-side `exchangeCodeForSession`은 작동 안 함**
- PKCE `code_verifier`는 server cookie(httpOnly)에 저장되므로 브라우저 JS에선 절대 못 읽음. 따라서 `/auth/login` 같은 client 페이지에서 `supabase.auth.exchangeCodeForSession(code)` 호출하면 항상 "PKCE code verifier not found" 에러. 모든 exchange는 server route handler(`/auth/callback`)에서.
- Supabase가 redirectTo 매칭에 실패하면 site_url(`/`)로 떨어뜨리는데, proxy.ts가 unauthenticated 요청을 `/auth/login?next=...`로 redirect할 때 OAuth query(`?code/?state/?error`)를 그대로 옮겨붙이면 위 함정에 빠짐. → proxy에서 `?code`/`?error` 들어오면 `/auth/callback`으로 forward, 일반 redirect는 OAuth params strip.

**`/auth/signout`은 PUBLIC_PATHS에 포함 + GET 핸들러 필수**
- 누락하면 unauthenticated 사용자가 signout URL 진입 시 `/auth/login?next=/auth/signout` 루프. PUBLIC_PATHS에 추가하고 `next`도 `/auth/*` strip.
- POST만 노출하면 브라우저 주소창 직접 진입 시 405. POST + GET 둘 다 export.

**Next 16 turbopack — route handler에 새 HTTP method 추가는 hot reload 못 잡음**
- `route.ts`에 `GET` 새로 export하면 dev 서버 reload만으로는 405 그대로. 프로세스 재시작 필요 (`Ctrl+C` → `npm run dev`).

**`next dev -H 0.0.0.0` + `NextResponse.redirect(new URL("/path", request.url))`의 host 누수**
- listen address가 `0.0.0.0`이면 `request.url`의 host도 `0.0.0.0`. 사용자가 `127.0.0.1`로 접근해도 redirect Location이 `http://0.0.0.0:3000/...`로 떨어져 supabase auth cookie scope가 깨짐(host 다른 origin으로 인식).
- 해결: `lib/http/origin.ts`의 `requestOrigin(request)` — Host 헤더를 우선 사용. signout/callback 등 absolute URL이 필요한 redirect는 모두 이걸 통해.

**drizzle-orm raw `sql` 템플릿은 `Date` 자동 캐스팅 안 함**
- `db.execute(sql\`... ${someDate} ...\`)` 패턴에서 `Date` 객체를 그대로 넘기면 postgres-js가 `ERR_INVALID_ARG_TYPE`로 거부. `someDate.toISOString()`으로 변환 + `${iso}::timestamptz` 명시 캐스트.
- drizzle ORM의 `db.insert(...).values({ ts: new Date() })` 같은 객체 빌더 경로는 자동 변환되므로 영향 없음. raw `sql` 템플릿에서만 발생.
