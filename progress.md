# MyHub — 진행 상황 (Progress)

> 최종 업데이트: **2026-05-07 (/goals Grit 스타일 개편 — 데일리 인사이트 + 습관 detail + 코칭)**
> 기반 문서: `MyHub_기획서_v2.1.md` (1,448줄, Windows PC 보관)
> 개발 계획: `~/.claude/plans/prograss-md-http-prograss-md-temporal-glacier.md`

---

## 0. 프로젝트 개요

**MyHub** — Flowto.ai 운영자 본인이 매일 사용할 1인용 정보 허브. **10명의 AI Agent + 메타 챗봇 민지** 구조. 사업 운영(GitHub 추적·프로덕트 모니터링) + 개인 정보(옵시디언·메일·일정·뉴스) 통합.

- **유형**: 개인 프로젝트 (kihoonlee 계정)
- **로드맵**: 10주 풀빌드 (기획서 그대로) + 11-12주 버퍼
- **현재 위치**: **다솜·도연 활성화 완료** — 다솜(캡처/읽을거리/학습) + 도연(Claude Skills 카탈로그). 활성 Agent **9/10** (민지·혜원·하영·서연·현주·민영·수민·다솜·도연). 비활성 1: 정연(Gmail 보류).

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

### Phase 2B ⌘K 명령 팔레트 — ✅ 완료

| 항목 | 결과 |
|---|---|
| `components/command-palette.tsx` — `CommandPaletteProvider` (전역 ⌘K/Ctrl+K listener) + `CommandPaletteModal` (검색 + 그룹 리스트 + 키보드 navigation) + `useCommandPalette` hook | command-palette.tsx |
| 명령 8개 (정적, 점진 확장 예정): 홈/오늘/민지 채팅 이동, 새 대화 시작, 캘린더 동기화(인라인 피드백), 다크/라이트 토글, 로그아웃 | 동상 |
| `components/header.tsx` placeholder alert 제거 → `useCommandPalette().open()` 연결 | header.tsx |
| `app/(app)/layout.tsx`에 `CommandPaletteProvider` 마운트 (인증된 셸 전체에서 사용 가능) | (app)/layout.tsx |

### Phase 2B 잔여 (다음 후보)
- (현시점 모두 완료 — Phase 3 옵시디언 진입 가능)

---

### Phase 3 옵시디언 1차 — ✅ 완료 (수동 sync + 의미 검색 + 서연 도구)

| 항목 | 결과 |
|---|---|
| **임베딩 모델 결정**: OpenAI `text-embedding-3-small` + `dimensions=1024` (스키마 vector(1024) 호환). 비용 $0.02/M tokens. | `lib/openai/embeddings.ts` |
| **vault 위치**: 로컬 Mac Google Drive 경로 (`OBSIDIAN_VAULT_PATH` env). GitHub webhook + HMAC 흐름은 보류. | `.env.example`, `.env.local` |
| `lib/openai/embeddings.ts` — `embedOne` / `embedMany` (batch). 부모 셸 빈 `OPENAI_API_KEY=` fallback (anthropic/client.ts와 동일 패턴). | embeddings.ts |
| `lib/obsidian/parser.ts` — gray-matter frontmatter + 인라인 `#태그` + wikilinks 추출 + word count. title fallback (frontmatter > 첫 H1 > 파일명). | parser.ts |
| `lib/obsidian/scanner.ts` — vault root 재귀 walk, `.obsidian` / `.trash` / dotfile 무시, mtime + size 반환. | scanner.ts |
| `lib/obsidian/sync.ts` — vault scan ↔ DB 비교(mtime 1초 buffer), 변경/신규만 read+parse+embed+upsert, vault에서 사라진 노트 DB 삭제. | sync.ts |
| `POST /api/sync/obsidian` — 수동 동기화 트리거 + `users.settings_json.lastObsidianSync` 기록. | route.ts |
| `GET /api/knowledge/search?q=&limit=` — 쿼리 임베딩 → pgvector cosine 정렬 → 상위 N개 (filePath/title/preview/tags/score). | route.ts |
| `GET /api/knowledge/note?path=` — 단일 노트 본문 조회. | route.ts |
| `/knowledge` 페이지 — 검색 박스(600ms 디바운스 자동 검색) + 결과 리스트(score + tags + preview) + 노트 본문 패널. vault 동기화 버튼 + 결과 요약. | page.tsx |
| **서연 도메인 도구 2개**: `search_notes(query, limit)` / `get_note(filePath)`. invoke route의 `getAgentTools`에 등록. 민지/혜원의 `call_agents` 화이트리스트에 이미 `seoyeon` 포함되어 있어 위임 가능. | seoyeon.ts |
| `next build` 통과 (17 라우트). | — |

**사용자 검증 — ✅ 완료 (2026-05-07)**:
- `.env.local`에 `OPENAI_API_KEY` 추가 (등호 뒤 공백 trim 이슈 fix 후 정상).
- `/knowledge`에서 vault 동기화 → 2개 노트 upsert 확인.
- 검색 정상 출력 확인.
- 동기화 에러 발생 시 errors[] 본문이 UI에 노출되도록 개선.

진단 강화:
- `lib/obsidian/sync.ts`에 vault path + scanned 수 console.log (운영 모니터링용).
- `lib/openai/embeddings.ts`에 `process.env.X?.trim()` 방어적 적용.
- CLAUDE.md 트러블슈팅에 ".env 등호 뒤 공백" 항목 추가.

---

### Phase 4 GitHub Activity 1차 — ✅ 완료 (FlowTo-ai 27개 repo + 칸반 + 현주 도구)

| 항목 | 결과 |
|---|---|
| **인증**: `GITHUB_PAT` env 우선 → 없으면 `gh auth token` CLI fallback (단일 사용자 dev 한정). 현재 `mioichinose0817` 계정으로 인증되어 FlowTo-ai 조직 read 권한 보유. | `lib/github/client.ts` |
| `lib/github/client.ts` — 직접 fetch 기반 (Octokit 의존성 회피). `listOrgRepos` / `listRepoCommits` / `listRepoPulls` / `listRepoIssues`. | client.ts |
| `lib/github/sync.ts` — repo 메타 → `products` upsert (status는 archived만 자동, 나머지 사용자 분류 보존), 30일 윈도우 commits/PRs/issues → `github_activity` upsert (type+github_id unique 키). | sync.ts |
| `POST /api/sync/github?org=` — 수동 트리거. `users.settings_json.lastGithubSync` 기록. | route.ts |
| `GET /api/business/products` — products + 30일 활동 카운트(commit/PR/issue) 한 쿼리(LATERAL aggregate). | route.ts |
| `PATCH /api/business/products/[id]` — status/notes/iconEmoji/colorHex 갱신. status 화이트리스트 검사. | route.ts |
| `/business` 페이지 — 4컬럼 칸반(idea / active / paused / archived) + 카드(언어 배지 + 최근 push + 30일 활동 + GitHub 링크 + status 드롭다운 변경). | page.tsx |
| **현주 도메인 도구 2개**: `list_products(status?)` / `get_product(slug, activityLimit?)`. invoke route `getAgentTools`에 등록. 민지/혜원의 `call_agents`에 이미 `hyunju` 포함되어 있어 위임 가능. | hyunju.ts |
| `next build` 통과 (19 라우트). | — |

**검증 시나리오**:
1. `/business` 진입 → "GitHub 동기화" 한 번. 27개 repo가 칸반에 노출되고 archived 자동 분류.
2. 카드의 status 드롭다운으로 active/paused/idea로 분류 — 다음 sync에서도 보존.
3. 민지에게 "최근 활발한 프로덕트 뭐야?" → 현주 위임 → `list_products` 호출.

---

### Phase 4-2 GitHub 다이제스트 보고 시스템 — ✅ 완료 (칸반 폐기 → 요약 보고)

**Why**: Phase 4-1 칸반은 사용자 의도와 어긋남. 사용자가 원하는 건 "신규 커밋이 어떤 기능 했는지 요약 보고 + 활성 프로젝트 식별 + 토큰 가드". 27 repo 모두 매 sync마다 LLM 돌리는 건 컨텍스트 폭발 위험.

**정책 (사용자 답변)**:
- Stale 임계 = **14일** (마지막 push 14일+ → 활동 수집 skip, 메타만 갱신)
- 요약 단위 = **Repo별 + 전체 헤드라인** (active repo마다 1회 + 마지막 1회)
- /business = **다이제스트 화면으로 교체** (칸반 폐기)
- 비용 가드 = **자동 진행 + 사후 표시** (토스트에 LLM 호출 수 + $ 누적)

| 항목 | 결과 |
|---|---|
| `lib/db/schema.ts` — `github_digests` 테이블 (productId nullable=headline / kind / periodStart / summary / activityCount / model / costUsd). unique(productId, kind, periodStart)로 idempotent. | schema |
| `lib/github/digest.ts` — `summarizeRepoActivity` / `summarizeHeadline` (Haiku 4.5 + prompt caching). diff 미전송, title/메시지만. 1-3문장 한국어. | digest.ts |
| `lib/github/sync.ts` 재구성 — STALE_DAYS=14 분류 → active만 활동 fetch → 신규 활동 diff(SELECT existing) → 신규 있는 repo만 LLM → digests upsert → headline 1회. agent_logs에 trigger='github_digest_repo'/'_headline' 기록(현주 agent_id). 응답에 totalCostUsd / llmCalls / activeRepos / staleRepos / headline 포함. | sync.ts |
| `GET /api/business/digests` — 헤드라인 + 활성 product digest(DISTINCT ON 최신 1행씩) + stale 메타 리스트. | digests/route.ts |
| `POST /api/sync/github` — settings_json.lastGithubSync에 비용·LLM·repo 카운트 누적. | sync/github/route.ts |
| `/business` 페이지 완전 교체 — 헤드라인 카드(Sparkles 아이콘) + 활성 카드 그리드(요약 텍스트) + 오래된 프로젝트 접힌 섹션 + 동기화 결과 토스트(LLM 호출 수, $, 신규 활동 수). | (app)/business/page.tsx |
| `lib/agents/tools/hyunju.ts` — 도구 4개: `get_recent_digest`(최신 헤드라인+products), `get_product_digest(slug)`, `list_products(status?)`, `get_product(slug)`. 다이제스트 우선 안내. | hyunju.ts |
| `app/api/business/products/[id]/route.ts` 폐기 — status는 sync 시 자동 분류만(`active`/`stale`/`archived`). 사용자 수동 분류 제거. | — |
| `next build` 통과 (19 라우트, PATCH -1 / digests +1). | — |

**효율화 포인트**:
- Stale 14일 필터 → 27 → ~15 active repo로 LLM 호출 절반.
- 신규 활동 0건이면 LLM 호출 자체 skip (idempotent).
- Prompt caching으로 시스템 prompt cache hit (반복 호출 시 input 90% 절감).
- diff 미전송, title만 → repo당 input ~2K tokens 캡.
- Haiku 4.5 → Sonnet 대비 1/3 가격.
- 예상 비용: sync 1회 ~$0.05 미만.

**검증 시나리오**:
1. `/business` 진입 → "GitHub 동기화" 클릭. 토스트에 `27개 repo (active N, stale M, archived K) · 신규 활동 X건 · LLM 호출 Y회 · $0.0xxx` 노출.
2. 헤드라인 카드 + 활성 카드 N개(각: 1-3문장 요약)가 표시.
3. 같은 day 재 sync → 신규 활동 0 → LLM 호출 0 → 비용 ≈ $0.
4. 민지에게 "이번 주 어떤 일 있었어?" → 도구 칩 `get_recent_digest`. 헤드라인 + 활성 프로덕트 요약을 답변.
5. `agent_logs` 테이블에 `trigger='github_digest_*'` 행이 LLM 호출 수만큼 누적.

---

### /goals Grit 스타일 개편 — ✅ 완료 (2026-05-07)

Grit: Improve Daily With AI 컨셉 참고. /goals 4탭(목표/습관/Pixels/회고)을 메인 대시보드(데일리 모티베이션 + 습관 그리드 + 진척 막대) + 보조 3탭(목표/Pixels/회고)으로 재편.

| 항목 | 결과 |
|---|---|
| `lib/habits/streak.ts` — 90일 grid + 현재/최장 스트릭 + 14d 완료율 계산 (JS 전용) | streak.ts |
| `lib/insights/daily.ts` — 수민 데일리 인사이트 생성 (Haiku, JSON, 한 문장 25자, 4-tone). agent_logs 기록(trigger=daily_insight). | daily.ts |
| `lib/insights/coach.ts` — 단일 습관 코칭 (Sonnet, ~$0.02). 평일/주말 비교 + 패턴 인식 + 작은 행동 + 질문 1개. | coach.ts |
| `GET /api/habits/dashboard` — 활성 habits + 오늘 status + 스트릭 + 14d % + 주간 평균 한 번에 | route.ts |
| `GET /api/habits/[id]/details` — 90일 logs + 스트릭 + 14d/90d 완료율 | route.ts |
| `PATCH /api/habits/[id]/note` — 날짜별 habit_log.note 저장 (없으면 completed=false로 새로 만듦) | route.ts |
| `GET/POST /api/insights/today` — `users.settings_json.todayInsight` 캐시 조회/생성 | route.ts |
| 수민 도구 3개 추가: `daily_insight(force?)` / `coach_habit(habitName | habitId, struggle?)` / `add_habit_note(habitId, note, date?)` | soomin.ts |
| 수민 systemPrompt 정밀화 — 코칭 도구 3종 가이드 추가 | definitions.ts |
| `<DailyMotivationCard>` — 진입 시 자동 생성 (오늘자 없으면 자동 POST). 4-tone 색상. "다시 받기" 버튼. | components |
| `<HabitCard>` — 그리드 카드. 메인 영역=토글, 우측 화살표=detail. 스트릭 ⚡ + 14d 미니 progress | components |
| `<HabitHeatmap>` — 90일 GitHub 스타일 7일×13주 그리드. 노트 있는 날 amber ring. 클릭 → 노트 편집. | components |
| `/goals/habits/[id]` 신규 — 헤더(스트릭/완료율 stats) + 90일 히트맵 + 노트 리스트 + 수민 코칭 (Sonnet 호출) | page.tsx |
| `/goals` 재구성 — "습관" 탭 제거, 메인 = 데일리 모티베이션 + 습관 그리드 + 진척. 보조 탭 3개(목표/Pixels/회고) | page.tsx |
| `next build` 통과 (57 라우트, +5) | — |

**비용**:
- 데일리 인사이트: Haiku ~$0.001-0.003/회. 매일 1회 자동 = 월 ~$0.05.
- 습관 코칭: Sonnet ~$0.01-0.03/회. 사용자 명시 호출만.
- 수민 일일 한도 $1.50, 월 $45 — 충분.

**검증 시나리오**:
1. `/goals` 진입 → 데일리 모티베이션 카드 자동 생성(첫 진입 시 ~1초) + 오늘의 습관 그리드 + "오늘 N/M 완료" + "이번 주 평균 X%".
2. 습관 카드 클릭 → 오늘 토글 → 스트릭 +1 갱신.
3. 카드 우측 화살표 → `/goals/habits/[id]` → 90일 히트맵 + stats 4개 카드.
4. 히트맵 셀 클릭 → 그 날짜 노트 편집 모달.
5. "수민 코칭 받기" 버튼 → struggle 적은 후 클릭 → 평일/주말 비교 + 작은 행동 + 질문 노출.
6. 민지에게 "오늘 영감 줘" → 수민 위임 → daily_insight (캐시 hit이면 그대로).

### Skills 자동 동기화 — ✅ 완료 (2026-05-07)

| 항목 | 결과 |
|---|---|
| `lib/skills/scanner.ts` — `~/.claude/skills/<name>/SKILL.md` 1뎁스 스캔. 심볼릭 링크 따라가기, gray-matter로 frontmatter 파싱 (description/category/version/tags 추출) | scanner.ts |
| `lib/skills/sync.ts` — 스캔 ↔ DB(`scope='global'`) diff. 신규=insert / 변경=update(usageCount·lastUsedAt 보존) / 누락=delete (단 `filePath`가 rootPath 하위인 경우만). `users.settings_json.lastSkillsSync` 기록 | sync.ts |
| `POST /api/sync/skills` — `CLAUDE_SKILLS_PATH` env 우선, 기본 `~/.claude/skills` | route.ts |
| `/dev` 페이지 — 진입 시 5분 throttle 자동 sync (localStorage 기반), 헤더에 동기화 버튼 + 마지막 동기화 시각, 동기화 후 토스트(스캔/신규/업데이트/삭제) | app/(app)/dev/page.tsx |

**동작 시나리오**:
1. `~/.claude/skills/`에 새 skill(`<name>/SKILL.md`) 추가 → `/dev` 진입 시 자동 sync → DB에 INSERT.
2. 기존 skill의 `SKILL.md` frontmatter(description 등) 변경 → 다음 sync 시 UPDATE.
3. skill 디렉토리 삭제 → 다음 sync 시 DB에서 DELETE (단, frontmatter 외부에서 추가한 사용자 데이터 — usageCount/lastUsedAt은 사라짐).
4. 5분 이내 재진입 시 sync skip (localStorage 타임스탬프). 수동 동기화는 항상 실행.

**현재 디스크 상태 (참고)**: `~/.claude/skills/` 하위 ~61개 디렉토리.

### 홈 대시보드 위젯 — ✅ 완료 (2026-05-07)

| 항목 | 결과 |
|---|---|
| `GET /api/dashboard/summary` — 단일 엔드포인트로 4개 위젯 데이터 한 번에 (team / today / activity) | route.ts |
| `<HomeDashboard>` — 1분 자동 갱신, 3개 위젯 | components/home-dashboard.tsx |
| TodaySummaryWidget — 미완료 Todo + 오늘 호출/에러 + LLM 비용 합산 + 다음 일정 | 동상 |
| TeamStatusWidget — 10명 격자, 활성/정지 표시, 일일 비용 progress(80%↑ 빨강), 클릭 → /agents/[name] | 동상 |
| RecentActivityWidget — agent_logs 8건 timeline (agent badge + trigger + 상대 시간) | 동상 |
| 홈 페이지 — 기존 placeholder 격자 제거, Hero + Dashboard 구성 | app/(app)/page.tsx |

**효율**:
- 단일 fetch (4개 분리 호출 → 1회)
- 1분 polling (사용자가 안 보면 추가 부담 없음, 보고 있으면 신선)
- LATERAL aggregate로 10 agent × today_logs를 한 SQL에 집계

**검증 시나리오**:
1. `/` 진입 → 3개 위젯 노출 + 1분 후 갱신 확인.
2. 다른 페이지에서 도구 사용(예: /goals "회고 생성") → 홈 복귀 시 RecentActivity에 노출.
3. 비용 한도 80% 넘은 agent → progress bar 빨강.
4. 일시정지된 agent (있다면) → 격자에 흐림 + Pause 아이콘.

### 다솜 + 도연 활성화 — ✅ 완료 (2026-05-07)

| 항목 | 결과 |
|---|---|
| `lib/captures/categorize.ts` — Haiku로 캡처 1건 분류(JSON: category/summary/confidence). | categorize.ts |
| `lib/agents/tools/dasom.ts` — 9개 도구: create/list/categorize/move_capture + add/list/mark_read read_later + add/list learnings | dasom.ts |
| API: `/api/captures(/:id)` (categorize/move) / `/api/read-later(/:id)` / `/api/learnings` | route.ts × 5 |
| `/capture` 페이지 — 3탭(캡처/읽을거리/학습) + 입력 폼 + 다솜 분류 버튼 + Todo/ReadLater/Learning 이동 + 다솜 채팅 | app/(app)/capture/page.tsx |
| `lib/agents/tools/doyeon.ts` — 7개 도구: list/get/add/update/delete_skill + log_skill_usage + get_skill_stats | doyeon.ts |
| API: `/api/skills(/:id)` + `/api/skills/stats` | route.ts × 3 |
| `/dev` 페이지 — Stats 4카드 + Skill 등록 폼 + 카탈로그 + 도연 채팅 | app/(app)/dev/page.tsx |
| invoke route — dasom/doyeon dispatch 추가 | route.ts |
| 사이드바 — `/capture`(캡처·읽을거리, Inbox 아이콘) 추가, `/dev` 라벨 ✓ | sidebar.tsx |
| definitions.ts — 다솜·도연·민지 systemPrompt 정밀화 (도구 사용 가이드 포함) | definitions.ts |

**비용**:
- 다솜 캡처 분류는 사용자 트리거(LLM 호출 1건당 ~$0.0005, Haiku)
- 도연 도구는 LLM 호출 없음 (메타데이터 CRUD만)

**검증 시나리오**:
1. `/capture` → "캡처" 탭에서 메모 입력 → "다솜 분류" 버튼 → ai_category 자동 채워짐.
2. `/capture` → URL 입력 후 "→ 읽을거리" 또는 "읽을거리" 탭에서 직접 추가.
3. `/dev` → Skill 1-2개 등록 → 통계 카드에 카운트 갱신.
4. 민지에게 "방금 적은 거 분류해줘" → 다솜 위임 → categorize_capture.
5. 민지에게 "안 쓰는 skill 정리하자" → 도연 위임 → get_skill_stats.

### Phase 5-A Gmail + 정연 — ⛔ 롤백 (2026-05-07)

사용자 결정으로 Phase 5-A 전체 제거. 사이드바에 메뉴 추가 후 dev에서 404 노출 + 메뉴 자체를 빼는 게 낫다고 판단. 추후 필요 시 git history(커밋 `dd1e268`)에서 부활 가능.

**삭제된 산출물**:
- `app/(app)/mail/page.tsx`, `app/api/sync/gmail/`, `app/api/mail/`
- `lib/google/gmail.ts`, `lib/gmail/{classify,sync}.ts`
- `lib/agents/tools/jeongyeon.ts`
- `app/auth/login/page.tsx`의 `gmail.readonly` scope (Calendar만 남김)
- invoke route의 jeongyeon 도구 dispatch
- 사이드바 `/mail` 항목

**남은 것 (의도적)**:
- `gmail_cache` 테이블 (스키마만 — 데이터 없음, 부활 시 그대로 사용 가능)
- 정연 agent row (definitions.ts에 비활성 마크 + 시스템 프롬프트에 "Gmail 도구 비활성" 안내)
- `oauth_tokens` 인프라 (Calendar에서 계속 사용)

**Google Cloud Console 측 작업 (사용자 손)**:
- 등록한 `gmail.readonly` scope를 OAuth 동의 화면에서 제거하는 게 깔끔. 안 해도 동작에 영향 없음 (login에서 더 이상 요청 안 함).

### Phase 5-B 뉴스 + 민영 — ✅ 완료

| 항목 | 결과 |
|---|---|
| `lib/news/rss.ts` — RSS 2.0 + Atom 1.0 미니 파서 (regex 기반, 의존성 없음). CDATA/HTML 태그/entity 디코딩. | rss.ts |
| `lib/news/sync.ts` — 활성 source별 fetch + 신규 url diff + news_items upsert. AI 호출 없음 (별도 generate_briefing). | sync.ts |
| `lib/news/briefing.ts` — Haiku 4.5로 최근 24h 항목을 카테고리별 그룹 + 한 줄 요약. JSON 응답. `daily_briefings` upsert (date PK). agent_logs 기록(민영 agent_id, trigger=`news_briefing`). | briefing.ts |
| `POST /api/sync/news` — RSS 일괄 동기화 | route.ts |
| `POST /api/news/briefing` — 오늘자 브리핑 생성 / `GET` — 조회 | briefing/route.ts |
| `GET/POST/DELETE /api/news/sources` — 사용자 RSS source 관리 | sources/route.ts |
| `GET /api/news/items?category=&hours=&limit=` — UI용 최근 항목 | items/route.ts |
| `lib/agents/tools/minyoung.ts` — 4개 도구: `get_today_briefing` / `generate_briefing` / `list_recent_news` / `list_sources` | minyoung.ts |
| `/news` 페이지 — 데일리 브리핑 카드(인트로 + 카테고리별 항목 + URL) + 최근 수집 리스트 + RSS source 관리 폼(접힘/펼침) + 민영 채팅 | app/(app)/news/page.tsx |
| invoke route에 minyoung 등록 | route.ts |

**비용 / 효율**:
- RSS 동기화 자체엔 LLM 0회. 브리핑 생성 시 Haiku 1회 (~$0.01).
- 같은 날 재생성은 덮어쓰기 — 의도적 (저녁에 다시 생성 = 하루 두 번 정도 가정).
- 신규 항목 0건이면 generate_briefing은 빈 인트로 + 빈 sections 반환 (호출 비용 ~$0).

**검증 시나리오**:
1. `/news` 페이지에서 `Source 관리` → RSS URL 1-3개 등록 (예: techcrunch.com/feed).
2. `RSS 동기화` 클릭 → 신규 항목이 "최근 수집"에 노출.
3. `브리핑 생성` 클릭 → 카테고리별 정리된 카드 + 각 항목의 URL 클릭 가능.
4. 민지에게 "오늘 뉴스 뭐 있어?" → 민영 위임 → `get_today_briefing` 호출. 없으면 `generate_briefing`.

### Phase 5-C 수민 (목표·회고·습관·Year in Pixels) — ✅ 완료

| 항목 | 결과 |
|---|---|
| `lib/reviews/weekly.ts` — 한 주 자동 집계(완료 Todo, 습관 완료율, GitHub commit, 옵시디언 변경) + Sonnet 4.6 회고 (한 단락 + 제안 1-3개). `weekly_reviews` upsert (weekStart PK). agent_logs(수민, trigger=`weekly_review`). | weekly.ts |
| `app/api/goals/route.ts` (GET/POST) + `[id]/route.ts` (PATCH/DELETE) | — |
| `app/api/habits/route.ts` (GET 14일 완료율 / POST) + `[id]/route.ts` (PATCH archive / DELETE) + `log/route.ts` (POST upsert) | — |
| `app/api/year-pixels/route.ts` (GET 연도별 / POST mood upsert + score → color 자동) | — |
| `app/api/weekly-reviews/route.ts` (GET 단일 + 8주 history / POST generate) | — |
| `lib/agents/tools/soomin.ts` — 10개 도구: list_goals / create_goal / update_goal_progress / list_habits / log_habit / get_habit_stats / get_year_pixels / set_mood / get_weekly_review / generate_weekly_review | soomin.ts |
| `/goals` 페이지 — 4탭 UI: 목표(진행률 슬라이더) / 습관(오늘 체크 + 14일 완료율) / Year in Pixels(12개월 × 31칸 그리드, 클릭 시 prompt로 mood 1-5) / 주간 회고(자동 집계 stats + AI 요약 + 제안 + "다시 생성" 버튼) + 수민 채팅 | app/(app)/goals/page.tsx |
| invoke route에 soomin 등록 | route.ts |
| 사이드바 `/goals`/`/news`/`/mail` 모두 ✓ 마크 | sidebar.tsx |

**검증 시나리오**:
1. `/goals` 진입 → "목표" 탭에서 분기 목표 1-2개 추가, 진행률 슬라이더 작동.
2. "습관" 탭에서 매일 체크. 14일 완료율 자동 갱신.
3. "Year in Pixels" 탭에서 오늘 mood 1-5 선택 → 그리드에 색깔 셀 노출.
4. "주간 회고" 탭에서 "회고 생성" → 자동 집계 4개 stats + 한 단락 요약 + 제안 표시. 비용 ~$0.02.
5. 민지에게 "이번 주 어땠어?" → 수민 위임 → `get_weekly_review` 또는 `generate_weekly_review`.

**한 가지 알림 (사용자 작업 필요)**:
- `db:seed`는 conflict 시 `systemPrompt` 갱신을 건너뛴다 (사용자의 /agents 편집 보존). Phase 5에서 정연/민영/수민의 시드 prompt를 정밀화했으나, 기존 행에는 적용되지 않음. 적용하려면 `/agents/<name>` → 프롬프트 탭에서 직접 갱신하거나, definitions.ts의 `systemPrompt` 값을 복사해서 저장. 새 도구는 `tools` 배열로 LLM에 전달되므로 prompt와 별개로 즉시 작동함.

### Phase 6 Agent 관리 페이지 — ✅ 완료

| 항목 | 결과 |
|---|---|
| `GET /api/agents/list` — 10명 + 일/월 비용 사용률(`agent_logs` 집계) + 오늘 호출/에러 카운트 + 마지막 호출 시각 | list/route.ts |
| `GET /api/agents/[name]` — agent 상세 + 30일 통계 + 최근 50건 호출 + 프롬프트 버전 히스토리(전체) | [name]/route.ts |
| `PATCH /api/agents/[name]` — 화이트리스트 필드만 갱신(`systemPrompt` / `model` / `temperature` / `maxTokens` / `dailyCostLimitUsd` / 등). `systemPrompt` 변경 시 이전 값을 `agent_prompt_versions`에 자동 archive (changeNote 옵션). | [name]/route.ts |
| `POST /api/agents/[name]/rollback` — 지정 version의 system_prompt를 현재로 복원. 현재 prompt는 새 version으로 archive (롤백 자체도 history). | rollback/route.ts |
| `/agents` 일람 — 10명 카드 그리드. avatar + 한국어/영문명 + 역할 + 모델 배지 + 활성/일시정지 아이콘 + 일/월 비용 progress bar(80%↑ 빨강) + 오늘 호출/에러 + 마지막 호출 시각. 카드 클릭 → 상세. | (app)/agents/page.tsx |
| `/agents/[name]` 상세 — 4개 탭: 개요(설명+30일 통계+최근 5건 호출) / 프롬프트(편집 + 변경 메모 + 버전 리스트 펼침/롤백) / 메타(model·temperature·maxTokens·비용 한도·설명·triggerConfig·toolPermissions read-only) / 활동(최근 50건 호출 풀 리스트, 에러 강조). 헤더에서 활성/일시정지 토글. | (app)/agents/[name]/page.tsx |
| 사이드바 `/agents` 라벨에 ✓ 마크 | sidebar.tsx |
| `next build` 통과 (23 라우트, +5 라우트). | — |

**검증 시나리오**:
1. `/agents` 진입 → 10명 카드 노출. 활성 4명(민지·하영·서연·현주)은 ✓, 그 외는 일시정지 아이콘.
2. 비용 progress bar — 오늘 사용한 agent(민지·하영 등)는 일 한도 대비 % 표시.
3. 카드 클릭 → 상세. "프롬프트" 탭에서 system_prompt 수정 → "저장" → 즉시 반영 + 버전 히스토리 1행 추가.
4. 같은 탭에서 새 버전 옆 "롤백" → 이전 prompt 복원.
5. "메타" 탭에서 maxTokens / 비용 한도 변경 → 저장.
6. 헤더의 "일시정지" 클릭 → `is_paused_reason='manual'` 셋. 그 agent에 invoke 보내면 guard.ts에서 차단(이미 구현됨).

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

- [x] Google 로그인 작동, 본인 이메일만 허용 *(Phase 0 Day 4 + Phase 2B PKCE 정리)*
- [~] 10명의 Agent 모두 응답 가능 — **활성 9/10** (민지·혜원·하영·서연·현주·민영·수민·다솜·도연). 비활성 1: 정연(Gmail 보류).
- [x] 민지 채팅으로 다른 Agent 호출 가능 *(Phase 2A ask_agent)*
- [x] Agent 관리 페이지에서 10명 모두 제어 가능 *(Phase 6 — /agents)*
- [x] 홈 대시보드 AI 팀 위젯에서 각 Agent 상태 확인 + 클릭 진입 *(Phase 6 보조 — 2026-05-07)*
- [x] 프롬프트 버전 롤백 작동 *(Phase 6 — /agents/[name] 프롬프트 탭)*
- [x] 비용 한도 초과 시 자동 일시정지 *(Phase 1 — guard.ts)*
- [x] 옵시디언 vault 동기화 + 검색 작동 *(Phase 3 — 로컬 Mac vault, OpenAI 임베딩)*
- [~] 캘린더·메일 동기화 — **캘린더 Phase 2B ✓**, Gmail은 Phase 5-A 롤백 (보류)
- [x] 13(27)개 프로덕트 GitHub 활동 다이제스트 *(Phase 4-2)*
- [x] 데일리 뉴스 브리핑 — 수동 트리거(`/news` 브리핑 생성). cron 자동화는 Phase 7. *(Phase 5-B)*
- [x] 매주 회고 — 수동 트리거(`/goals` 회고 생성). cron 자동화는 Phase 7. *(Phase 5-C)*
- [ ] 모바일 반응형 (iPad 이상) *(Phase 7)*
- [ ] Lighthouse Performance 80+ *(Phase 7)*

### 운영 인프라 보강 — ✅ 완료

- [x] **`tsTz` 헬퍼** (`lib/db/sql-utils.ts`) — drizzle raw `sql\`\``의 Date 캐스팅 함정 3회 재발 후 통일. 잔여 inline `${iso}::timestamptz` 0건 (commit `5b9fa4e`).

---

## 10. 다음 즉시 액션 (Phase 5 끝 → Phase 7 진입 준비)

Phase 2B/3/4-2/5/6 모두 완료. 활성 Agent 8/10. 1차 완료 체크리스트 12/14 ✓.

```
[즉시 사용자 작업 (검증)]
  A. /news 페이지 → RSS source 1-3개 등록 → 동기화 → 브리핑 생성
  B. /goals 페이지 → 목표·습관 등록 → 회고 생성
  C. /capture 페이지 → 메모 캡처 → 다솜 분류 → 이동
  D. /dev 페이지 → skill 등록 → 도연 통계 확인

[Gmail 부활 시 (선택)]
  - 커밋 `dd1e268` 롤백 직전 상태에서 5-A 관련 파일들을 cherry-pick.
  - Google Cloud OAuth 동의 화면에 gmail.readonly scope 다시 등록.
  - /auth/login 재로그인 + /mail 동기화 검증.

[프롬프트 갱신 (선택)]
  - definitions.ts의 정연/민영/수민 systemPrompt가 정밀화됐으나 db:seed는 conflict 시 prompt 갱신 안 함.
  - /agents/<englishName> → 프롬프트 탭에서 직접 갱신하거나, 새 도구는 prompt와 별개로 즉시 작동하므로 그냥 두어도 OK.

[Phase 6 보조 — 홈 대시보드 (Phase 7 전 옵션)]
  - Hero에 AI 팀 상태 위젯 (8명 활성 + 일일 비용 합산 + 최근 활동 5건)
  - 혜원 종합 브리핑 자동 트리거 (체크리스트 #5)

[Phase 7 — Week 10 마감 (가장 굵은 다음 단계)]
  - Vercel Cron — 혜원 7시 / 민영 5시 / 수민 일요일 21시 / Calendar·Gmail 5분 / GitHub 1시간
    → 위 cron이 Phase 5의 데일리 브리핑·주간 회고·메일 분류를 자동화 (현재는 수동 트리거)
  - Sentry + Rate limiting
  - 모바일 반응형 (iPad+)
  - Lighthouse 80+
  - Supabase production 프로젝트 새로 생성 + RLS 정책 추가

추천: Phase 7 진입 전 사용자 검증 1주일. 실제 사용해보면서 Agent 응답 품질·비용·UX 다듬기.
```

---

### 옛 메모 (Phase 2B 진입 시점 — 보존용 참고)

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
