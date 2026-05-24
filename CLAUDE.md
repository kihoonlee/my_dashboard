# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project — MyHub v2

1인용 개인 정보 허브 (`kihoon_dashboard` / repo: `kihoonlee/my_dashboard`). **v2 clean slate 재설계**로 6명의 한국어 AI Agent 팀이 일기·메모·할일·캘린더를 통합 관리한다. 단일 사용자 화이트리스트(Google OAuth + `ALLOWED_EMAIL`).

**6 Agent 라인업** — `(name / englishName / role / model)`
- 혜원 / `main` / chief_of_staff / Sonnet — 메인 비서, CSO+인사팀장+토론 진행자
- 민지 / `assistant` / cto_devil_advocate / Sonnet — 보조 비서, 의도적 반대 관점
- 하영 / `daily` / daily_reporter / Haiku — 매일 8시 데일리 리포트
- 서연 / `diary` / diary_assistant / Haiku — 일기 작성 도우미
- 다솜 / `memo` / memo_assistant / Haiku — 메모 작성 도우미
- 수민 / `calendar` / calendar_assistant / Haiku — 캘린더 작성 도우미

v1의 Obsidian 의미검색·GitHub 활동 추적·HABITS/Year-in-Pixels는 **전부 폐기**. 더 좁고 깊게.

## Stack

- **Next.js 16.2.4 + React 19.2.4** (App Router, Turbopack). 이 버전은 학습 데이터 이후 — 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 먼저 읽어라 (AGENTS.md 규칙).
- **Tailwind v4** + shadcn/ui (neutral) + Pretendard Variable + tw-animate-css + `@base-ui/react`. 토큰은 `app/globals.css` (Toss Blue primary + 6 Agent `--agent-*` 컬러).
- **Drizzle ORM** + `postgres-js`. 단일 사용자 dev는 로컬 Supabase Postgres (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), 운영은 Supabase Cloud (`DATABASE_URL` env).
- **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`, supabase CLI dev dep). 로컬은 `npm run supabase:start` (Docker 필요, 14 컨테이너).
- **Anthropic SDK** (`@anthropic-ai/sdk` 0.93.x). 시드의 모델 ID 사용: `claude-sonnet-4-6` (혜원·민지) / `claude-haiku-4-5-20251001` (하영·서연·다솜·수민). v2에선 6명 전원 Anthropic — Gemini 어댑터는 `lib/llm/gemini-impl.ts`에 살아있지만 시드 모델로는 호출 안 됨.
- **OpenAI** (`openai` ^6) — 잔여 의존성, v2에서 활성 호출처 없음.
- **Google Calendar** 동기화 — OAuth refresh token 암호화 저장(`OAUTH_TOKEN_KEY`).
- **Telegram Bot** — 알림 push 채널(옵션).
- **Vercel Cron** — 매일 8시 데일리 리포트 + 5분 캘린더 동기화 (`CRON_SECRET` 인증).

## Commands

```bash
npm run dev                  # next dev -H 0.0.0.0 (IPv4+IPv6 + LAN preview)
npm run build
npm run lint                 # eslint flat config (eslint-config-next)

# Supabase 로컬 (.env.local 자동 export → env(VAR) 치환 적용)
npm run supabase:start       # 14 컨테이너 (첫 실행 5-10분)
npm run supabase:stop
npm run supabase:status
npm run supabase:reset

# DB workflow
npm run db:enable-extensions # vector + pgcrypto + pg_trgm (최초 1회)
npm run db:push              # 인터랙티브; non-TTY는 db:push:force
npm run db:push:force        # drizzle-kit push --force (CI/에이전트 환경)
npm run db:seed              # 6 Agent upsert (definitions.ts 변경 시 재실행)
npm run db:studio
npm run db:generate          # 마이그레이션 파일 생성 (현재 미사용, 운영 전환 시)

# 진단 스크립트 (tsx)
tsx scripts/verify-api-keys.ts       # ANTHROPIC/GEMINI/OPENAI 키 라이브 검증
tsx scripts/verify-gemini-adapter.ts # 어댑터 정합성 체크
tsx scripts/list-gemini-models.ts
```

`.env.example` → `.env.local`. 테스트 프레임워크 없음 — 완료 보고 전 최소 `npm run build` + `npm run lint` 통과 확인.

## Architecture

**App Router** — 인증된 셸은 `app/(app)/` route group (`/`, `/chat`, `/diary`, `/memos`, `/todos`, `/calendar`, `/discussions`, `/notifications`, `/agents`, `/settings`), auth 라우트는 `app/auth/*`. proxy.ts에서 인증·리다이렉트 처리.

**Auth 흐름** (`proxy.ts` + `app/auth/*` + `lib/supabase/*`):
- 모든 요청에서 supabase 세션 + `ALLOWED_EMAIL` 화이트리스트 검사
- `signInWithOAuth` → Google → `/auth/callback?code=...` → server-side `exchangeCodeForSession` → 홈
- `next` 라우트는 query string 대신 **cookie `auth_next`**로 전달 (Supabase wildcard 매칭 변수성 우회)
- Agent 간 내부 호출(`ask_agent` → `/api/agents/[name]/invoke`)은 `x-myhub-internal-call: 1` + `x-myhub-agent-depth` 두 헤더로 인증 우회
- Vercel Cron 호출은 `/api/cron/*` 패턴 + `CRON_SECRET`로 라우트 내부에서 검증
- OAuth `?code/?error` 잔여 query는 proxy에서 strip하지 않고 `/auth/callback`으로 forward

**`lib/db/`** — DB 레이어 단일 진입점.
- `schema.ts` — 17개 테이블 single source of truth. 모든 PK `uuid().defaultRandom()`, timestamp `withTimezone: true`. v2 도메인: users / agents·chat·discussions·notifications / diary·memos·todos / calendar_events_cache / oauth_tokens·api_keys.
- `client.ts` — `db` 싱글턴. **`.env.local` dotenv 자동 로드** (tsx 직접 실행 호환).
- `sql-utils.ts` — `tsTz(date)`, `dateLiteral(date)` 헬퍼. **raw `sql\`...\`` 템플릿에서 Date를 넘기는 모든 곳에서 강제** (Pitfalls 참조).

**`lib/agents/`** — Agent 시스템.
- `definitions.ts` — 6 Agent의 model/temperature/maxTokens/systemPrompt/triggerConfig/toolPermissions/비용 한도 single source. 변경 시 `db:seed`.
- `guard.ts` — `checkBeforeInvoke` (활성/일·월 비용 한도) + `checkAfterInvoke` (5연속 오류 자동 일시정지).
- `tools/main.ts` — 혜원: `web_search`, `start_discussion`, `list_agent_health`, `send_notification` 등.
- `tools/assistant.ts` — 민지: 사용자 맥락 조회 + 반대 의견.
- `tools/daily.ts` — 하영: 데일리 데이터 수집.
- `tools/diary.ts`, `tools/memo.ts`, `tools/calendar.ts` — 도메인 CRUD.
- `tools/shared.ts` — 모든 agent에 부여되는 `ask_agent` 공통 tool. `agents.toolPermissions.call_agents` 화이트리스트 기반 동적 schema.

**`lib/llm/`** — Multi-provider router.
- `router.ts` — `invokeAgent` / `streamAgent` 단일 진입점. 모델 ID prefix(`gemini-*` vs `claude-*`)로 provider 자동 분기. **반환 타입은 항상 Anthropic.Message 형태로 정규화** (route.ts 호환).
- `anthropic-impl.ts` / `gemini-impl.ts` — provider별 어댑터.
- `gemini-stream.ts` — Gemini stream을 Anthropic `RawMessageStreamEvent` AsyncIterable로 변환.
- `translators.ts` — tools / messages / tool-result schema 변환 + `parseToolResultContent` 안전망(array→`{items}` 자동 wrap, Gemini protobuf 호환).
- `pricing.ts` — 모델별 토큰 가격 + `calculateCostUsd()`.

v2 시드 모델은 전부 Anthropic이라 평소엔 anthropic-impl 경로만 hot. Gemini 경로 변경 시엔 `verify-gemini-adapter.ts`로 검증.

**`lib/anthropic/`** — Anthropic 전용 헬퍼 (router 위 얇은 레이어).
- `client.ts` — SDK singleton. **부모 셸이 빈 `ANTHROPIC_API_KEY=` export 시 fallback으로 `.env.local` 직접 파싱** (Claude Code harness 대응).
- `cacheSystemAndTools: true` 시 system prompt 마지막 block + tools 마지막 정의에 `cache_control: ephemeral` 부여.

**`lib/google/`** — Google Calendar.
- `calendar.ts` — OAuth client + REST 호출 (events.list / insert / update / delete).
- `calendar-sync.ts` — 5분 cron pull → `calendar_events_cache` upsert + stale 삭제.

**`lib/oauth/token-store.ts`** — Google refresh_token을 `OAUTH_TOKEN_KEY` (32+ byte) AES로 암호화해 `oauth_tokens` 테이블에 저장. **키가 바뀌면 기존 토큰 복호화 불가 → 재로그인 필요.**

**`lib/secrets/`** — API 키 동적 저장 (`api_keys` 테이블, 사용자가 settings UI에서 등록). `api-key-store.ts` 저장/복호화, `resolver.ts` env 우선 → DB fallback, `validators.ts` 라이브 핑 검증.

**`lib/cron/auth.ts`** — Vercel cron 호출 검증 (`Authorization: Bearer $CRON_SECRET`).

**`lib/discussions/runner.ts`** — 토론 비동기 실행. 혜원이 `start_discussion`으로 호출하면 즉시 `discussions` 행 + `pending` 상태 반환, 백그라운드에서 target agents 호출 + `discussion_turns` 누적 + 완료 시 `send_notification`.

**`lib/notifications/dispatch.ts`** — 인앱 알림 insert + (옵션) Telegram push (`lib/telegram/client.ts`).

**`lib/users/ensure.ts`** — supabase auth user → `users` 테이블 ensure (`getOrCreate` 패턴, 모든 server-side 진입점에서 호출).

**`lib/http/origin.ts`** — `requestOrigin(request)`. `next dev -H 0.0.0.0` 환경에서 `request.url`의 host가 `0.0.0.0`으로 새는 문제 회피 — Host 헤더 우선. absolute URL이 필요한 모든 redirect는 이걸 통해.

**`lib/sse/client.ts`** — 클라이언트용 `streamSseFetch` 헬퍼. SSE 이벤트 파싱·재조립.

**Agent 호출 골격** (`app/api/agents/[name]/invoke/route.ts`):
1. depth 헤더 검사(max 2) + agent 조회 + guard
2. tool defs = 도메인 tools + (`call_agents` 권한 있으면) `ask_agent`
3. `Accept: text/event-stream`이면 SSE 모드 (`streamAgent` + tool-loop 토큰 stream), 그 외 JSON 모드 (`invokeAgent`)
4. system prompt에 `{user_name}` `{current_time}` 치환
5. tool_use 루프 (max 5 iter, 동일 tool·동일 인자 2회 안티-루프)
6. `agent_logs.insert` (tokens / cost / duration / error)
7. `checkAfterInvoke`

SSE 이벤트 — `iteration` / `delta` / `tool_call` / `tool_result` / `done` / `error`. `ask_agent` server-to-server는 Accept 헤더 안 보내 자동 JSON.

**메인 채팅** (`app/api/chat/route.ts` + `app/(app)/chat/page.tsx`):

기본 라우팅은 혜원(`main`). SSE 스트리밍:
1. `ensureUser` → `chat_sessions` 신규/재사용 → user 메시지 insert
2. invoke route에 `Accept: text/event-stream` fetch
3. upstream 이벤트 forward — `session` 이벤트로 `sessionId`/`userMessageId` 추가
4. `done`만 가로채 `chat_messages.insert` + `assistantMessageId` emit
5. `lastMessageAt` 갱신

URL `?session=<uuid>`로 세션 재진입(`/api/chat/sessions` GET). 클라이언트는 `streamSseFetch` 사용.

**Agent 관리 UI** (`/agents` + `/agents/[name]`):
- 일람: `GET /api/agents/list` (6명 + 일/월 비용 사용률 + 오늘 호출/에러)
- 상세: `GET /api/agents/[name]` (agent + 30일 stats + 최근 50건 + 프롬프트 버전 히스토리)
- 갱신: `PATCH /api/agents/[name]` (system_prompt 변경 시 자동 archive → `agent_prompt_versions`)
- 롤백: `POST /api/agents/[name]/rollback` body `{ version }`

**핵심 도메인 관계**
- `agents` ↔ `agent_prompt_versions` (1:N, 버전 히스토리 + 롤백) / `agent_logs` (호출별 토큰·비용·에러)
- `chat_sessions` → `chat_messages` (`role`/`content`/`agentId`/`toolCalls` jsonb로 tool use 기록)
- `discussions` → `discussion_turns` (다중 agent 토론 — 혜원이 진행)
- `diary_entries` ↔ `diary_images` / `memos` / `todos` — 각각 독립 도메인
- `calendar_events_cache` — Google Calendar pull mirror, source-of-truth는 Google 측
- `oauth_tokens` (Google refresh) / `api_keys` (사용자가 등록한 LLM 키) — 둘 다 암호화 저장
- 단일 사용자라도 멀티유저 확장 대비 RLS `user_id = auth.uid()` 정책 추후 추가 (현재 `supabase/migrations/0001_rls_policies.sql` 일부 존재)

**Path alias**: `@/` → repo 루트. UI 컴포넌트는 `components/ui/`(shadcn CLI), 그 외 도메인 컴포넌트는 `components/` 직하.

## Conventions

- 한국어 UI/주석/커밋 메시지 OK. 코드 식별자는 영어.
- 작업 규칙 우선순위: `AGENTS.md` > 이 파일 > 글로벌 `~/.claude/CLAUDE.md`.
- Agent **영문명**(`englishName`)은 unique key — `/api/agents/[name]/invoke`, `--agent-<englishName>` 컬러 토큰, `agent-badge.tsx`의 KOREAN_NAMES 매핑까지 일관.
- `db:push`는 마이그레이션 파일 없이 바로 적용 — 프로덕션 전환 시 `db:generate` + 검토.
- LLM 컨텍스트 주입은 `{user_name}`/`{current_time}` 플레이스홀더로 시스템 프롬프트에 포함.
- 모델 ID는 매 변경 시 최신 확인 (전역 CLAUDE.md 시간축 규칙). 시드 그대로 사용 권장.
- LLM 호출은 항상 `lib/llm/router.ts`의 `invokeAgent`/`streamAgent` 통해서. 새 agent에 도구 추가 시 `app/api/agents/[name]/invoke/route.ts`의 `getAgentTools()`에 등록.
- 새 server-only env var 추가 시 빈 export fallback 패턴(`lib/anthropic/client.ts` 참조) 검토.

## 이미 해결된 함정 (Pitfalls — 다시 빠지지 말 것)

> 같은 문제로 또 헤매지 않도록 모든 트러블슈팅을 여기에 누적. 새 함정은 해당 카테고리 하위에 추가, 카테고리에 없으면 신설.

### Next.js 16

**`middleware` → `proxy` 리네임**
- 파일명: `proxy.ts` (구 `middleware.ts`), export 이름: `proxy` 또는 `default`. 매처도 동일.
- matcher에서 `_next/*` **전체**를 제외해야 함 (`_next/static`/`_next/image`만 제외하면 webpack-hmr WebSocket이 인증 redirect로 막혀 HMR 깨짐).

**dev `allowedDevOrigins`**
- `-H 0.0.0.0`로 바인딩하고 `127.0.0.1`로 접근하면 cross-origin으로 분류돼 `_next/webpack-hmr` 차단. `next.config.ts`에 `allowedDevOrigins: ["127.0.0.1", "localhost"]` 추가 필수.

**turbopack — route handler에 새 HTTP method 추가는 hot reload 못 잡음**
- `route.ts`에 `GET` 새로 export하면 dev 서버 reload만으로는 405 그대로. 프로세스 재시작 필요 (`Ctrl+C` → `npm run dev`).

**`next dev -H 0.0.0.0` + `NextResponse.redirect(new URL("/path", request.url))`의 host 누수**
- listen address가 `0.0.0.0`이면 `request.url`의 host도 `0.0.0.0`. 사용자가 `127.0.0.1`로 접근해도 redirect Location이 `http://0.0.0.0:3000/...`로 떨어져 supabase auth cookie scope가 깨짐.
- 해결: `lib/http/origin.ts`의 `requestOrigin(request)` — Host 헤더 우선. signout/callback 등 absolute URL이 필요한 redirect는 모두 이걸 통해.

### Supabase / Auth

**OAuth — `redirect_uri = ""` 빈 문자열 금지**
- `[auth.external.google]`에서 빈 값으로 두면 `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI` env var가 아예 주입 안 돼 "Unsupported provider: missing redirect URI" 400 발생. 명시적으로 `http://127.0.0.1:54321/auth/v1/callback` 박을 것.

**`additional_redirect_urls` wildcard 매칭 변수성**
- `?next=...` 같은 query string 포함된 redirectTo는 일관되게 매칭 안 됨. 해결: `redirectTo`는 path만 (`http://127.0.0.1:3000/auth/callback`), `next` 라우트는 cookie(`auth_next`, SameSite=Lax)로 전달. config.toml엔 `http://127.0.0.1:3000/**` wildcard.

**config.toml의 `env(VAR)` 치환**
- supabase 데몬이 아닌 **supabase CLI 프로세스의 환경변수**에서 읽음. 따라서 `npm run supabase:start`는 `set -a && . ./.env.local && set +a && supabase start` 패턴.
- shell이 sh/bash/zsh 호환이라 macOS·Linux OK. Windows는 별도 패턴 필요.

**OAuth PKCE — client-side `exchangeCodeForSession`은 작동 안 함**
- PKCE `code_verifier`는 server cookie(httpOnly)에 저장 → 브라우저 JS에선 읽을 수 없음. 모든 exchange는 server route handler(`/auth/callback`)에서.
- Supabase가 redirectTo 매칭에 실패하면 site_url(`/`)로 떨어뜨림 → proxy.ts에서 `?code`/`?error` 들어오면 `/auth/callback`으로 forward, 일반 redirect는 OAuth params strip.

**`/auth/signout`은 PUBLIC_PATHS에 포함 + GET 핸들러 필수**
- 누락 시 unauthenticated 사용자가 signout URL 진입 → `/auth/login?next=/auth/signout` 루프. POST + GET 둘 다 export.

### Drizzle / DB

**drizzle-kit push strict mode + non-TTY**
- `drizzle.config.ts`의 `strict: true` + 에이전트/CI 등 non-TTY 환경 → 인터랙티브 confirm 못 받아 실패. `npm run db:push:force`(`--force`) 사용.
- 파괴적이지 않은 일상 dev에선 force 안전, 운영 마이그레이션 시점엔 별도 generate + 리뷰.

**drizzle-orm raw `sql` 템플릿은 `Date` 자동 캐스팅 안 함 — `tsTz()` 헬퍼 강제**
- `db.execute(sql\`... ${someDate} ...\`)` 패턴에서 `Date` 객체 그대로 넘기면 postgres-js가 `ERR_INVALID_ARG_TYPE`로 거부. **3번 재발한 함정** (oauth_tokens insert / calendar stale delete / agents stats).
- 절대 inline으로 `${date.toISOString()}::timestamptz`를 다시 박지 말 것. **항상 `lib/db/sql-utils.ts`의 `tsTz(date)`**:
  ```ts
  import { tsTz } from "@/lib/db/sql-utils";
  await db.execute(sql`... WHERE created_at >= ${tsTz(since)}`);
  ```
- `tsTz`는 null/undefined도 받아 `NULL::timestamptz` 반환. date(only)는 `dateLiteral`.
- ORM 빌더(`db.insert(...).values({ts: new Date()})`)는 자동 변환되므로 영향 없음. raw `sql` 템플릿에서만 발생.

**drizzle-orm raw `sql` 템플릿에 JS 배열 보간 금지 — `($1, $2, …)` record로 펼쳐짐**
- `sql\`... col = ANY(${arr}::uuid[])\`` 패턴 → 단일 array 파라미터가 아니라 **각 요소가 개별 positional param인 record**로 풀려서 `ANY(($1,$2,…)::uuid[])`가 됨. record→array 캐스트 불가.
- **해결**: ORM 빌더의 `inArray(col, arr)` + `selectDistinctOn` / `groupBy` / `leftJoin` 사용. raw `sql` 회피.

**`.env.local`의 등호 뒤 공백은 값에 그대로 포함됨**
- `KEY= value` 처럼 `=` 다음 공백 넣으면 `process.env.KEY` 값이 `" value"`로 들어감. dotenv 표준은 trim 안 함. API 키 헤더에 `Bearer  sk-...`처럼 박혀 401.
- 코드 단 방어: `process.env.X?.trim()` 패턴.
- 진단: `grep -E "^KEY=" .env.local | od -c`.

### Anthropic SDK / LLM

**부모 셸이 빈 `ANTHROPIC_API_KEY=` export → Next dotenv override:false에 막힘**
- Claude Code harness 등이 자식 프로세스에 빈 환경변수를 주입하면, Next.js가 `.env.local` 값을 읽고도 덮어쓰지 않음. `lib/anthropic/client.ts`에 fs 직접 파싱 fallback 구현됨.
- 새 server-only env var 추가 시 동일 문제 발생 가능 — 같은 패턴 적용 검토.

**prompt caching invariant**
- prefix match — system prompt 첫 부분에 `Date.now()` / `uuid()` 같은 변동값 박으면 cache 전혀 안 됨. `{current_time}` 같은 placeholder 치환은 시스템 프롬프트 **끝부분** 또는 message 쪽으로.
- `cache_read_input_tokens > 0`인지로 검증. 0이면 silent invalidator 의심.

### LLM / Tool Use (multi-provider)

**Gemini의 `functionResponse.response`는 JSON object만 — array는 reject**
- 에러: `Invalid JSON payload received. Unknown name "response" at 'contents[N].parts[M].function_response': Proto field is not repeating, cannot start list.`
- Gemini protobuf에서 `functionResponse.response`는 single message field — array(`[...]`)로 시작하면 `INVALID_ARGUMENT 400`. Anthropic은 array도 받기 때문에 같은 코드가 Claude에선 통과하다 Gemini-routed agent에서 첫 tool round-trip에 폭발.
- **해결 (2 layer)**:
  1. **모든 tool 결과는 object로 wrap.** `return { ok: true, result: { count, items: arr } }` 패턴. 단순 array 직접 return 금지.
  2. **안전망 — `lib/llm/translators.ts:parseToolResultContent`** 가 array 받으면 `{ items: [...] }`로 자동 wrap. primitive면 `{ result: prim }`.
- 진단: `select error_message from agent_logs where is_error and english_name='X' order by created_at desc limit 1;`

**Gemini SDK의 `parametersJsonSchema` vs 레거시 `parameters`**
- `lib/llm/translators.ts:toolsToGemini`가 JSON Schema를 그대로 `parametersJsonSchema`로 통과 (lossless). 단 Gemini가 받지 않는 키워드 있음 — `$schema`, `$id`, `$ref`, `oneOf`/`anyOf`/`allOf`, `additionalProperties`. 도구 입력 schema는 단순하게 (`type`/`properties`/`required`/`enum`/`description`/`items`)만.

**Tool description / system prompt에서 모델 차이**
- Gemini는 tool 호출 결정 시 description의 한국어 가중치가 Claude보다 약함. "이 도구를 반드시 호출하라"라고 명령형으로 넣어도 무시하고 평문 답변 가능. 회피책: system prompt 행동규칙에 "X를 물으면 list_X 도구로 답하라"처럼 명시.

### 도구 / 환경

**dotenv 호이스팅 버그**
- `import { config } from "dotenv"; config(); import { db } from "./client";` 순서로 써도, ES module에서 `import`는 항상 호이스팅돼 `client.ts`가 먼저 평가됨. `lib/db/client.ts`가 자체적으로 dotenv 호출하므로 신규 tsx 스크립트는 그냥 `import { db }`만.

**SSH 다중 계정 (Mac & Windows 공통)**
- default `github.com` SSH key가 회사 계정에 매핑됨. 개인 repo는 **반드시 alias** 사용: `git@github-kihoonlee:kihoonlee/<repo>.git` (Mac은 `~/.ssh/mac_ssh`, Win은 `~/.ssh/kihoonlee_pc`).
- 표준 형식으로 잘못 clone했으면 `git remote set-url origin git@github-kihoonlee:kihoonlee/my_dashboard.git`로 정정.
- 글로벌 CLAUDE.md(`~/.claude/CLAUDE.md`) "개인 GitHub 정보" 섹션에 동일 내용 영구 기록.
