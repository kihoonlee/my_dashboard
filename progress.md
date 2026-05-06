# MyHub — 진행 상황 (Progress)

> 최종 업데이트: **2026-05-06 (Phase 2B 캘린더 1차 + 인증 흐름 정리 + 자동 동기화 UX)**
> 기반 문서: `MyHub_기획서_v2.1.md` (1,448줄, Windows PC 보관)
> 개발 계획: `~/.claude/plans/prograss-md-http-prograss-md-temporal-glacier.md`

---

## 0. 프로젝트 개요

**MyHub** — Flowto.ai 운영자 본인이 매일 사용할 1인용 정보 허브. **10명의 AI Agent + 메타 챗봇 민지** 구조. 사업 운영(GitHub 추적·프로덕트 모니터링) + 개인 정보(옵시디언·메일·일정·뉴스) 통합.

- **유형**: 개인 프로젝트 (kihoonlee 계정)
- **로드맵**: 10주 풀빌드 (기획서 그대로) + 11-12주 버퍼
- **현재 위치**: **Phase 2B 캘린더 1차 완료** (OAuth refresh token pgcrypto 암호화 저장 + Calendar sync API + 하영 캘린더 tool 2개 + /today 캘린더 위젯). Phase 2B 잔여: Realtime 스트리밍, ⌘K, Cron.

---

## 1. Git 정보

| 항목 | 값 |
|---|---|
| **로컬 경로 (현재)** | `/Users/kihoon_mac/work/mywork/my_dashboard` (Mac) |
| **로컬 경로 (Windows, 참고)** | `D:\test\kihoon_dashboard` |
| **리모트 (alias)** | `git@github-kihoonlee:kihoonlee/my_dashboard.git` (PC별 SSH alias 사용) |
| **GitHub URL** | https://github.com/kihoonlee/my_dashboard |
| **Default branch** | `master` |
| **사용자** | `kihoon <powergenes@gmail.com>` (Mac global git config) |

### 커밋 히스토리

```
e2588fb  docs: add progress.md (project status snapshot)
42a4b00  feat: phase 0 day 2 — DB layer + Supabase CLI
026f819  feat: phase 0 day 1 — design system foundation
9c11e96  Initial commit from Create Next App
```

### SSH 다중 계정 (Mac / Windows 공통 패턴)

이 사용자는 **회사 계정과 개인 계정 SSH 키를 분리** 운영하며, default `github.com`은 회사 계정에 매핑되어 있음. 따라서 개인 repo는 **반드시 SSH alias**를 통해야 push/pull 가능.

| 환경 | `~/.ssh/config` alias | 개인 키 | 회사 키 |
|---|---|---|---|
| **Mac** | `github-kihoonlee` → `~/.ssh/mac_ssh` | `mac_ssh` | `macmini_flow` (default `github.com`) |
| **Windows** | `github-kihoonlee` → `~/.ssh/kihoonlee_pc` | `kihoonlee_pc` | `home_flow` (default `github.com`) |

이 repo의 정확한 remote URL: `git@github-kihoonlee:kihoonlee/my_dashboard.git` (Mac/Windows 공통).

**처음에 잘못 clone(`git@github.com:...` 표준 형식)했을 때 권한 거부됨** — 그 경우 `git remote set-url origin git@github-kihoonlee:kihoonlee/my_dashboard.git`로 즉시 정정 필요.

---

## 2. 완료된 작업

### ✅ Phase 0 Day 1 — 디자인 시스템 기반 (커밋 `026f819`)

| 항목 | 결과 |
|---|---|
| Next.js 16.2.4 + React 19.2 + Turbopack | `package.json` |
| Tailwind v4 + shadcn/ui (neutral 베이스) | `components.json`, `app/globals.css` |
| Pretendard Variable 폰트 | `npm i pretendard` + globals.css `@import` |
| Toss Blue (#3182F6) primary + Flowto.ai 팔레트 | `app/globals.css` |
| 10명 Agent 컬러 토큰 (`--agent-hyewon` ... `--agent-minji`) | `app/globals.css` |
| 다크모드 풀 커버리지 | `.dark` 클래스 |
| 한국어 lang + MyHub metadata | `app/layout.tsx` |
| 10명 Agent 그리드 placeholder | `app/page.tsx` |
| 빌드 검증 | 1.76초, 정적 4페이지 |

### ✅ Phase 0 Day 2 — DB Layer (커밋 `42a4b00`)

| 항목 | 결과 |
|---|---|
| Drizzle ORM + postgres-js + drizzle-kit | `package.json` deps |
| Supabase 클라이언트 (`@supabase/supabase-js`, `@supabase/ssr`) | `package.json` deps |
| Supabase CLI 2.98.1 (dev dep) | `package.json` devDeps |
| `supabase init` 실행 | `supabase/config.toml` |
| **26개 테이블 schema** (full spec §6) | `lib/db/schema.ts` |
| **10명 Agent 시드 정의** (모델·프롬프트·트리거·권한·비용 한도) | `lib/agents/definitions.ts` |
| Drizzle config | `drizzle.config.ts` |
| DB 클라이언트 래퍼 | `lib/db/client.ts` |
| Extension 활성화 헬퍼 | `lib/db/enable-extensions.ts` |
| Agent 시드 스크립트 | `lib/db/seed.ts` |
| npm scripts: `db:enable-extensions`, `db:generate`, `db:push`, `db:studio`, `db:seed` | `package.json` |
| `.env.example` 템플릿 | `.env.example` |
| `.env.local` 실제 키 (gitignored) | `.env.local` |
| `.gitignore`: `.env.example` 허용 | `!.env.example` 추가 |

### 📦 26개 테이블 (schema.ts)

```
users  agents  agent_prompt_versions  chat_sessions  chat_messages  agent_logs
todos  calendar_events_cache  products  goals  goal_links  weekly_reviews
habits  habit_logs  year_pixels
quick_captures  read_later  learnings  obsidian_notes(pgvector 1024d, HNSW)
github_activity  claude_skills  skill_usage_logs
news_sources  news_items  daily_briefings
gmail_cache
```

### 👥 10명 Agent (definitions.ts)

| # | 이름 | 영문 | 역할 | 모델 | 일 한도 |
|---|---|---|---|---|---|
| 1 | 혜원 | hyewon | 오케스트레이터 | Sonnet 4.6 | $2.00 |
| 2 | 하영 | hayoung | 오늘 매니저 | Haiku 4.5 | $1.00 |
| 3 | 수민 | soomin | 목표 코치 | Sonnet 4.6 | $1.50 |
| 4 | 서연 | seoyeon | 지식 사서 | Haiku 4.5 | $1.00 |
| 5 | 다솜 | dasom | 캡처 비서 | Haiku 4.5 | $1.00 |
| 6 | 현주 | hyunju | 사업 매니저 | Sonnet 4.6 | $1.50 |
| 7 | 도연 | doyeon | 개발 도구 관리자 | Haiku 4.5 | $0.50 |
| 8 | 민영 | minyoung | 뉴스 큐레이터 | Haiku 4.5 | $1.50 |
| 9 | 정연 | jeongyeon | 메일 정리자 | Haiku 4.5 | $1.00 |
| 10 | 민지 | minji | 메타 챗봇 | Sonnet 4.6 | $3.00 |

---

## 3. Phase 0 Day 2 완료 (Mac 환경, 2026-05-05)

Windows에서 멈췄던 "DB push/seed 검증" 작업을 Mac으로 옮겨와 마무리. Docker Desktop 블로커는 Mac에선 처음부터 실행 중이라 해결됨.

### 진행 흐름

| # | 단계 | 결과 |
|---|---|---|
| 1 | `git clone git@github.com:kihoonlee/my_dashboard.git` (Mac) | 4 commits clone |
| 2 | `npm install` | 672 packages, 8s |
| 3 | `.env.local` 1차 작성 (클라우드 `fquxtvaunhirrwenlhrv` 키) | tenant not found 에러 — ref가 현재 supabase CLI 로그인 계정에 없음 |
| 4 | **클라우드 → 로컬 Supabase로 전환** | `.env.local.cloud-backup`로 1차 파일 보관 후, 로컬 키로 재작성 |
| 5 | `npx supabase start` | 12개 컨테이너 Running (imgproxy/pooler 2개는 default disabled) |
| 6 | `npm run db:enable-extensions` | vector 0.8.0 / pgcrypto 1.3 / pg_trgm 1.6 ✓ |
| 7 | `npx drizzle-kit push --force` | 26개 테이블 + HNSW 인덱스 적용. **TTY 이슈 우회 위해 `--force` 필요** |
| 8 | `npm run db:seed` (env export 우회) | 10명 Agent upsert ✓. **dotenv 호이스팅 버그 우회 위해 `set -a; source .env.local; set +a` 선행** |
| 9 | DoD 검증 | 4/4 PASS (아래) |

### Day 2 완료 기준 (DoD) — 4/4 ✅

- [x] 로컬 Supabase 12개 핵심 컨테이너 실행 중 (postgres / postgrest / kong / gotrue / realtime / storage-api / postgres-meta / studio / edge-runtime / vector / mailpit / logflare). imgproxy + pooler 2개는 사용 안 함.
- [x] `agents` 테이블 10 row (혜원/하영/수민/서연/다솜/현주/도연/민영/정연/민지)
- [x] `obsidian_notes.embedding`은 `vector(1024)` 타입 (drizzle push 출력 + information_schema 검증)
- [x] HNSW 인덱스 `obsidian_notes_embedding_idx ... USING hnsw (embedding vector_cosine_ops)` 존재

### 발견된 잠재 이슈 (Day 3에서 정리 권장)

1. **drizzle-kit push가 TTY 요구** — `drizzle.config.ts`의 `strict: true` + non-TTY 환경(에이전트/CI)에서 인터랙티브 prompt 실패. 우회: `--force` 사용. 권장: package.json의 `db:push` 스크립트를 `drizzle-kit push --force`로 바꾸거나, 또는 strict 토글 정책 정립.
2. **`lib/db/seed.ts`의 dotenv 호이스팅 버그** — `import { config } from "dotenv"; config(...)` 후 `import { db } from "./client"` 순서지만, ES module은 import가 항상 먼저 호이스팅돼서 `client.ts`의 `process.env.DATABASE_URL` 체크가 dotenv 로드 전에 실행됨. 우회: `set -a; source .env.local; set +a; npm run db:seed`. 수정 옵션: (a) `client.ts`에서 dotenv 로드 (b) seed.ts에서 dynamic import로 변경 (c) tsx에 `--env-file=.env.local` 전달.
3. **클라우드 Supabase 프로젝트 정리** — `.env.local.cloud-backup`에 `fquxtvaunhirrwenlhrv` ref가 적혀 있으나 현재 supabase CLI 로그인 계정(`osprahfpujlqmyfwnqll` org — FlowTo.ai)에는 그 프로젝트가 없음. 다른 supabase 계정에 있거나 삭제됨. Phase 7 배포 전에 production 프로젝트 신규 생성 여부 결정 필요.

---

## 4. 남은 로드맵 (Phase 1 이후)

### Phase 0 (Week 1) — ✅ 완료

| Day | 작업 | 커밋 |
|---|---|---|
| Day 1 | 디자인 시스템 (토큰·폰트·Agent 컬러) | `026f819` |
| Day 2 | DB 26테이블 + HNSW + 10 Agent 시드 (Mac 검증 `25bf018`) | `42a4b00` / `25bf018` |
| Day 3 | dotenv 호이스팅 / drizzle-kit `--force` / dev `-H` 정리 | `c1cbff5` |
| Day 4 | Supabase Auth Google OAuth + 화이트리스트 (proxy.ts + auth 라우트) | `ebc6387` |
| Day 5 | 글로벌 셸 UI (사이드바 11메뉴 / 헤더 ⌘K placeholder / 플로팅 채팅 / 라이트 기본 + 다크 토글) | (현재 커밋) |

### Phase 1 (Week 2) — ✅ 완료 — Agent 호출 골격 + 첫 Agent (하영)

| 항목 | 결과 |
|---|---|
| `@anthropic-ai/sdk` 0.93.0 + `lib/anthropic/client.ts` | 모델 라우팅 + prompt caching (system + tools에 cache_control) |
| `lib/anthropic/pricing.ts` | Sonnet 4.6 / Haiku 4.5 / Opus 4.6/4.7 토큰 가격 + 비용 계산 헬퍼 |
| `lib/agents/guard.ts` | 일·월 비용 한도 + 5연속 오류 자동 일시정지 |
| `app/api/agents/[name]/invoke/route.ts` | 통일 라우트, max_iterations=5, 동일 도구·동일 인자 2회 가드 |
| `lib/agents/tools/hayoung.ts` | 4개 tool: create_todo / list_todos_today / complete_todo / update_todo_due_date |
| 하영 system prompt 정밀화 | tool 사용 가이드 + 행동 규칙. Haiku 4.5, max_tokens=1024 |
| `components/agent-badge.tsx` | 영문명 → --agent-{englishName} 컬러 토큰 매핑 |
| `app/(app)/today/page.tsx` | 미완료 Todo 그리드 + 하영 채팅 (메타: iterations / duration / cost / tokens) |
| `app/api/todos/today/route.ts` + `[id]/complete/route.ts` | UI에서 LLM 안 거치는 직접 경로 |
| 빌드 검증 | next build 성공, 10 라우트 + Proxy 등록 |

### Phase 2A (Week 3) — ✅ 민지 메인 채팅 + 혜원 종합 브리핑

| 항목 | 결과 |
|---|---|
| `lib/agents/tools/shared.ts` | `ask_agent` 공통 tool. `agents.toolPermissions.call_agents` 화이트리스트 기반 동적 schema 생성 + 권한 검사 + 자기 호출 차단. |
| `app/api/agents/[name]/invoke/route.ts` 보강 | 호출 깊이 헤더 (`x-myhub-agent-depth`, max 2) + 내부 호출 표시 (`x-myhub-internal-call`) |
| `proxy.ts` | 내부 agent 호출(`/api/agents/*` + 위 두 헤더)은 인증 우회. 외부 위조 방지를 위해 두 헤더 모두 필요. |
| 혜원/민지 systemPrompt 정밀화 | 도구 사용 가이드 + 행동 규칙. Phase 2 활성 agent(hayoung, hyewon) 명시 + 나머지는 "tools 미등록" 안내. |
| `/api/chat/route.ts` | 민지 메인 엔드포인트. `chat_sessions` / `chat_messages` 영속화. Supabase auth user → public.users 매핑(ensureUser). |
| `/api/chat/sessions/[id]/messages/route.ts` | 세션 진입 시 메시지 히스토리 로드 (agent englishName JOIN). |
| `app/(app)/chat/page.tsx` | 민지 채팅 UI. URL ?session=... 으로 세션 재진입. 자동 스크롤 + 메타 표시. |
| `components/floating-chat-button.tsx` | placeholder alert 제거 → `Link href="/chat"`. /chat 페이지에선 자기 자신 숨김. |
| `components/home-hero.tsx` | 혜원 종합 브리핑 위젯. 진입 시 자동 호출 안 함 (비용 보호) — 버튼 클릭 시 호출. |
| `app/(app)/page.tsx` | 홈을 Phase 0 placeholder에서 운영 화면으로 갱신. AgentBadge 통일 사용 + Phase별 활성 표시. |

### Phase 2B 캘린더 1차 — ✅ 완료

| 항목 | 결과 |
|---|---|
| `oauth_tokens` 테이블 신설 (user_id × provider unique, encrypted_refresh_token text) | `lib/db/schema.ts` |
| `OAUTH_TOKEN_KEY` 환경변수 + `.env.local` 자동 추가 (openssl rand -base64 48) | `.env.example`, `.env.local` |
| pgcrypto column-level 암호화 (`pgp_sym_encrypt` + base64) | `lib/oauth/token-store.ts` (saveRefreshToken/loadRefreshToken/deleteRefreshToken) |
| `app/auth/callback/route.ts`에서 `provider_refresh_token` 캡처 + 저장. 저장 실패해도 로그인 흐름은 유지. | `app/auth/callback/route.ts` |
| `ensureUser` 헬퍼 분리 (chat route + callback + sync route 공유) | `lib/users/ensure.ts` |
| Login에 `calendar.readonly` scope 추가 + `prompt=consent`로 refresh token 발급 강제 | `app/auth/login/page.tsx` |
| Google API 헬퍼 (refresh + Events.list) + `GoogleAuthError(needsReauth)` | `lib/google/calendar.ts` |
| `POST /api/sync/calendar` — 오늘+7일 윈도우 upsert, stale 정리, 412(reauth_required) 분기 | `app/api/sync/calendar/route.ts` |
| `GET /api/calendar/agenda?days=1\|7` — UI용 캐시 read-only | `app/api/calendar/agenda/route.ts` |
| 하영 tool 2개 추가: `list_events_today`, `list_events_week` (캐시만 읽음 — sync 안 함) | `lib/agents/tools/hayoung.ts` |
| `/today` 캘린더 섹션: 동기화 버튼 + 일정 리스트 + 권한 만료 시 "다시 로그인" CTA | `app/(app)/today/page.tsx` |
| `calendar_events_cache` startAt 인덱스 추가 | schema |
| `next build` 통과 (14 라우트, 새 라우트 3개: agenda, sync/calendar, oauth_tokens 관련 흐름) | — |

**진행 검증 잔여 (사용자 손 필요)**:
1. Google Cloud Console OAuth 동의 화면에 `https://www.googleapis.com/auth/calendar.readonly` scope 추가 등록 (Test users 모드면 체크박스에 노출되도록).
2. `npm run dev` → `/auth/login` 재로그인 (Calendar 동의 화면이 새로 떠야 함 — `prompt=consent` 덕분에 매 로그인 발급).
3. `/today`에서 "동기화" 버튼 → `oauth_tokens`에 1행 생긴 후 `calendar_events_cache` 채워지는지.
4. 하영에게 "오늘 일정 뭐 있어?" → `list_events_today` tool 호출 확인.

### Phase 2B 인증 흐름 정리 + 자동 동기화 — ✅ 완료

| 항목 | 결과 |
|---|---|
| **PKCE 흐름**: 무효한 client-side `exchangeCodeForSession` fallback 제거. ?code 들고 떨어진 요청은 `/auth/callback`으로 server forward. | `proxy.ts`, `app/auth/login/page.tsx` |
| **OAuth query 누수 차단**: proxy redirect 시 `code/state/error/error_description` strip. | `proxy.ts` |
| **next 화이트리스트**: `/auth/*`로 시작하는 next는 `/`로 강제 (무한 재귀 방지). | `proxy.ts`, `lib/http/origin.ts` 패턴, login/callback |
| **`/auth/signout`**: PUBLIC_PATHS에 추가. POST + GET 핸들러 둘 다 지원 (브라우저 직접 진입 호환). | `app/auth/signout/route.ts` |
| **Host header 기반 absolute redirect**: `next dev -H 0.0.0.0`이라 `request.url`의 host가 `0.0.0.0`이 박히는 문제 해결 — 사용자가 접근한 host(127.0.0.1) 그대로 보존. | `lib/http/origin.ts`, signout/callback 적용 |
| **Date → ISO::timestamptz 캐스트**: drizzle/postgres-js raw `sql` template은 Date 객체 자동 변환 안 함. `oauth_tokens` insert + `calendar_events_cache` stale delete 두 군데 수정. | `lib/oauth/token-store.ts`, `app/api/sync/calendar/route.ts` |
| **`users.settings_json.lastCalendarSync`**: 동기화 직후 `{ at, count, deletedStale }` upsert. agenda 응답에도 lastSync 포함해 "한 번도 sync 안 함" vs "sync 했는데 0건" 구분. | `app/api/sync/calendar/route.ts`, `app/api/calendar/agenda/route.ts` |
| **/today UX 개선**: 헤더에 "마지막 동기화 HH:mm · N건" 항상 표시 / 동기화 직후 4초 토스트 / 빈 상태 메시지 분기 / **5분 throttle 자동 동기화**(페이지 진입 시 fresh면 skip, stale이면 자동 호출). | `app/(app)/today/page.tsx` |

### Phase 2B Realtime 응답 스트리밍 — ✅ 완료

| 항목 | 결과 |
|---|---|
| `lib/anthropic/client.ts`에 `streamAgent` 추가 — `MessageStream` 반환, async iterable, prompt caching 동일 적용 | client.ts |
| `/api/agents/[name]/invoke` SSE 분기 — `Accept: text/event-stream` opt-in. tool-use 루프 안에서 토큰 단위 `delta` / `tool_call` / `tool_result` / `iteration` / `done` / `error` 이벤트 emit. JSON 모드는 ask_agent(server-to-server)가 그대로 사용. | invoke/route.ts |
| `/api/chat` SSE pass-through — `session` 이벤트로 sessionId/userMessageId 발급, upstream 이벤트 forward, `done`만 가로채 chat_messages 영속화 + assistantMessageId 추가해 다시 emit. | chat/route.ts |
| `lib/sse/client.ts` 공용 SSE 파서 — POST + body가 필요해 EventSource 못 씀, fetch + ReadableStream 직접 파싱. | client.ts |
| `/chat` (민지) UI: 송신 직후 빈 assistant 메시지 push → `delta`마다 누적 + tool 호출 칩(running/ok/error 상태) + `done`에서 meta. | app/(app)/chat/page.tsx |
| `/today` (하영) UI: 동일 패턴. tool 사용 후 Todo/Calendar 자동 새로고침. | app/(app)/today/page.tsx |

### Phase 2B 잔여 (다음 후보)
- ⌘K 명령 팔레트 헤더 연결 (현재 placeholder).

### Phase 3 (Week 4-5) — 지식 영역 (서연 + 다솜) + 옵시디언

- 옵시디언 vault GitHub webhook + HMAC 검증 + 임베딩
- pgvector 의미 검색 + PostgreSQL FTS
- 마크다운 렌더러 (mermaid 포함)
- 퀵 캡처 + 읽을거리 큐 + Learnings
- 민지 도구 추가: `ask_seoyeon`, `ask_dasom`, `create_capture`

### Phase 4 (Week 6-7) — 사업 (현주) + 개발자 도구 (도연)

- GitHub REST + GraphQL API 연동 + 매시간 동기화
- 13개 프로덕트 칸반 보드 + 활동 타임라인
- 프로덕트 상세 페이지
- Claude Code 스킬 관리 (`/dev/skills`)
- 민지 도구 추가: `ask_hyunju`, `ask_doyeon`

### Phase 5 (Week 8) — 정보 수집 (정연 + 민영 + 수민)

- Gmail 동기화 + 정연 우선순위 분류
- 뉴스 3소스 통합 (RSS + X + web search) + 새벽 5시 Cron
- 목표·회고·습관·Year in Pixels (수민)
- 민지 도구 추가: `ask_jeongyeon`, `ask_minyoung`, `ask_soomin` (9명 모두 호출 가능)

### Phase 6 (Week 9) — Agent 관리 페이지 ⭐

- `/agents` 일람 (10명 카드 그리드 + 상태/비용)
- `/agents/[name]` 상세 7개 탭 (개요·프롬프트·모델·트리거·권한·활동·통계)
- 프롬프트 버전 히스토리 + 1클릭 롤백
- 민지 전용 추가 탭 (도구 정의·의도 분류)
- 홈 위젯 11번 (AI 팀 상태) 연결

### Phase 7 (Week 10) — 마감 + 배포

- Vercel Cron (혜원 7시 / 민영 5시 / 수민 일요일 21시 / Calendar·Gmail 5분 / GitHub 1시간)
- 설정 페이지 + Sentry + Rate limiting
- 모바일 반응형 (iPad+)
- 성능 최적화 (DB 인덱스 + 번들)
- Lighthouse 80+ 달성

### Week 11-12 (버퍼)

실제 사용 중 발견되는 문제 해결, UX 다듬기, 추가 트리거 조정.

---

## 5. 환경 / 의존성

### 시스템 (Mac, 현재)

| 항목 | 버전 |
|---|---|
| OS | macOS (kihoon_mac) |
| Node.js | v24.14.0 |
| npm | 11.9.0 (→ 11.13.0 권장) |
| git | 시스템 기본 |
| Docker | 29.3.0 (Daemon 실행 중 ✅) |
| Supabase CLI | 2.75.0 (homebrew, 권장 v2.98.1) + 2.98.1 (devDep, npx 호출 시) |

### 시스템 (Windows, 참고)

| 항목 | 버전 |
|---|---|
| Node.js | v24.13.0 |
| npm | 11.6.2 |
| git | 2.38.0.windows.1 |
| Docker | 27.4.0 |
| gh CLI | 2.88.1 (활성 계정: mioichinose0817) |

### 핵심 dependencies

```
next            16.2.4
react           19.2.4
react-dom       19.2.4
tailwindcss     ^4
@tailwindcss/postcss ^4
shadcn          ^4.6.0
@base-ui/react  ^1.4.1
class-variance-authority ^0.7.1
clsx            ^2.1.1
tailwind-merge  ^3.5.0
lucide-react    ^1.14.0
pretendard      ^1.3.9
tw-animate-css  ^1.4.0
drizzle-orm     ^0.45.2
postgres        ^3.4.9
@supabase/supabase-js ^2.105.3
@supabase/ssr   ^0.10.2
zod             ^4.4.3
```

### dev dependencies

```
typescript      ^5
@types/node     ^20
@types/react    ^19
eslint          ^9
eslint-config-next 16.2.4
drizzle-kit     ^0.31.10
dotenv          ^17.4.2
tsx             ^4.21.0
supabase        ^2.98.1
```

---

## 6. 보유 자원 / 미보유 자원

### ✅ 보유

- Anthropic API Key
- GitHub PAT (FlowTo-ai 조직 + kihoonlee 개인)
- 로컬 Supabase 스택 (Mac Docker 27.4.0+ / Supabase CLI npx) — Phase 0~6 dev에서 사용
- 옵시디언 vault (Phase 3에서 GitHub repo로 동기화 예정)

### ⚠️ 재확인 필요

- Supabase 클라우드 production 프로젝트 — `.env.local.cloud-backup`에 적힌 `fquxtvaunhirrwenlhrv` ref가 현재 supabase CLI 로그인 계정에서 보이지 않음 (다른 계정에 있거나 삭제됨). Phase 7 배포 전 새로 생성하거나 진짜 가지고 있는 계정으로 로그인해 정리 필요.

### ❌ 미보유 (해당 Phase 진입 전 발급)

| 자원 | 필요 시점 | 발급 위치 | 상태 |
|---|---|---|---|
| Google OAuth 클라이언트 (Auth + Gmail + Calendar) | **Phase 0 Day 4** | console.cloud.google.com | ✅ 발급 완료 (.env.local 저장, Day 4 진입 가능) |
| GitHub Webhook 시크릿 (옵시디언 vault) | Phase 3 Week 4 | repo Settings → Webhooks | 미발급 |
| 옵시디언 vault private GitHub repo | Phase 3 Week 4 | github.com/new | 미발급 |
| Vercel 계정 + (Pro 옵션) | Phase 7 Week 10 | vercel.com | 미가입 |

#### Google OAuth 사전 체크 (Day 4 진입 시 확인)

- [ ] Google Cloud Console → Credentials → 해당 OAuth 클라이언트 → Authorized redirect URIs에 다음 등록 확인:
  - `http://127.0.0.1:54321/auth/v1/callback` (로컬 Supabase Auth callback)
  - `https://<production-ref>.supabase.co/auth/v1/callback` (Phase 7 진입 시 추가)
- [ ] OAuth consent screen에서 필요한 scope 추가 — 최소 `openid email profile`, Gmail/Calendar 사용 시점에 추가 scope 확장
- [ ] Test users 또는 Publishing status 확인 (개인 사용이라 External + Testing 모드 무방, 단 Test users에 powergenes@gmail.com 등록 필요)

---

## 7. 미결정 사항 (Phase 진입 전 확정 필요)

| # | 항목 | 결정 시점 | 비고 |
|---|---|---|---|
| 1 | Vercel Pro 가입 의향 ($20/월) | Phase 7 진입 전 | Hobby Cron 한도 초과. 외부 cron(cron-job.org) 대안 가능 |
| 2 | 임베딩 모델 | Phase 3 진입 전 | Voyage-3(한국어 강함) vs OpenAI text-embedding-3-small(저렴) |
| ~~3~~ | ~~민지 비용 상한선~~ | ✅ Phase 2 진입 전 결정 — **일 $3 / 월 $90**. 시드(`definitions.ts`) 그대로 사용. |
| ~~4~~ | ~~다크모드 기본값~~ | ✅ Day 5 결정 — **라이트 기본**, prefers-color-scheme 자동 추적 안 함, 명시적 토글로만 다크 전환, localStorage `theme` 키에 사용자 선택 보존 |

---

## 8. 핵심 위험 요소 (재정리)

| 위험 | 대응 |
|---|---|
| 민지 tool use 무한 루프 | `max_iterations = 5` 하드 캡 + 동일 도구·동일 인자 2회 호출 시 중단 |
| Claude API 비용 폭발 | Phase 1부터 비용 한도 + 자동 일시정지 (`agents.daily_cost_limit_usd`) |
| 한국어 임베딩 품질 | Voyage vs OpenAI 둘 다 시도 후 비교. `pg_trgm` 보조 |
| Refresh Token 평문 저장 | Phase 2에서 OAuth 도입 시 `pgcrypto` 암호화 동시 구현 |
| webhook signature 검증 누락 | 라우트 첫 줄에 HMAC SHA-256 검증, 실패 시 401 |
| 단일 사용자 RLS 누락 | 모든 테이블 RLS + `user_id = auth.uid()` 정책 (멀티유저 확장 대비) |
| Vercel Cron 한도 초과 | Pro 가입 또는 외부 cron 사용 |

---

## 9. 1차 완료 체크리스트 (기획서 §12)

- [ ] Google 로그인 작동, 본인 이메일만 허용 *(Day 4)*
- [ ] 10명의 Agent 모두 응답 가능 *(Phase 1-5)*
- [ ] 민지 채팅으로 다른 Agent 호출 가능 *(Phase 2)*
- [ ] Agent 관리 페이지에서 10명 모두 제어 가능 *(Phase 6)*
- [ ] 홈 대시보드 AI 팀 위젯에서 각 Agent 상태 확인 + 클릭 진입 *(Phase 6)*
- [ ] 프롬프트 버전 롤백 작동 *(Phase 6)*
- [ ] 비용 한도 초과 시 자동 일시정지 *(Phase 1)*
- [ ] 옵시디언 GitHub 동기화 + 검색 작동 *(Phase 3)*
- [ ] 캘린더·메일 동기화 작동 *(Phase 2, 5)*
- [ ] 13개 프로덕트 GitHub 활동 표시 *(Phase 4)*
- [ ] 데일리 뉴스 브리핑 매일 생성 *(Phase 5)*
- [ ] 매주 일요일 회고 자동 생성 *(Phase 5)*
- [ ] 모바일 반응형 (iPad 이상) *(Phase 7)*
- [ ] Lighthouse Performance 80+ *(Phase 7)*

---

## 10. 다음 즉시 액션 (Phase 2B 잔여 → Phase 3 진입 준비)

Phase 2B 캘린더 1차 완료. 다음 후보:

```
[Phase 2B 잔여 — 우선순위순]
  A. Google Cloud Console OAuth 동의 화면 + Test users에 calendar.readonly scope 등록
     → 등록 안 하면 sync 시 권한 오류. 사용자 손이 필요한 외부 작업.
  B. 재로그인 + /today 동기화 smoke test
     → oauth_tokens 1행 생성 + calendar_events_cache 채워지는지 + 하영 list_events_today 동작 확인
  C. (선택) Supabase Realtime 응답 스트리밍 — 현재는 동기 응답이라 tool 사용 시 1-3초 침묵
  D. (선택) ⌘K 명령 팔레트 (현재 placeholder)

[Phase 3 진입 — Week 4]
  1. 옵시디언 vault GitHub repo + private + webhook (HMAC SHA-256)
  2. 임베딩 모델 결정 (Voyage-3 vs OpenAI text-embedding-3-small) — 미결정
  3. 서연/다솜 도메인 tool + 시드 정밀화
```
