# MyHub — 진행 상황 (Progress)

> 최종 업데이트: **2026-05-05 22:40 (Mac 환경에서 Phase 0 Day 2 마무리)**
> 기반 문서: `MyHub_기획서_v2.1.md` (1,448줄, Windows PC 보관)
> 개발 계획: `~/.claude/plans/prograss-md-http-prograss-md-temporal-glacier.md` (Mac 이전 후 Day 2 마무리 플랜)

---

## 0. 프로젝트 개요

**MyHub** — Flowto.ai 운영자 본인이 매일 사용할 1인용 정보 허브. **10명의 AI Agent + 메타 챗봇 민지** 구조. 사업 운영(GitHub 추적·프로덕트 모니터링) + 개인 정보(옵시디언·메일·일정·뉴스) 통합.

- **유형**: 개인 프로젝트 (kihoonlee 계정)
- **로드맵**: 10주 풀빌드 (기획서 그대로) + 11-12주 버퍼
- **현재 위치**: **Phase 0 Day 2 완료** (Mac 환경, 로컬 Supabase 기반 DB 셋업 검증됨). Day 3 진입 가능.

---

## 1. Git 정보

| 항목 | 값 |
|---|---|
| **로컬 경로 (현재)** | `/Users/kihoon_mac/work/mywork/my_dashboard` (Mac) |
| **로컬 경로 (Windows, 참고)** | `D:\test\kihoon_dashboard` |
| **리모트** | `git@github.com:kihoonlee/my_dashboard.git` (Mac은 default SSH key 사용) |
| **GitHub URL** | https://github.com/kihoonlee/my_dashboard |
| **Default branch** | `master` |
| **사용자** | `kihoonlee <powergenes@gmail.com>` |

### 커밋 히스토리

```
e2588fb  docs: add progress.md (project status snapshot)
42a4b00  feat: phase 0 day 2 — DB layer + Supabase CLI
026f819  feat: phase 0 day 1 — design system foundation
9c11e96  Initial commit from Create Next App
```

### SSH 다중 계정 (PC별 차이)

- **Windows PC**: `~/.ssh/config`에 `github.com → home_flow` / `github-kihoonlee → kihoonlee_pc` 분리 alias.
  Windows에서 push할 때만 remote URL이 `git@github-kihoonlee:kihoonlee/my_dashboard.git` 형식이어야 함.
- **Mac**: 기본 SSH key가 kihoonlee 계정과 연결됨. Remote URL은 표준 `git@github.com:kihoonlee/my_dashboard.git` 그대로 사용.

따라서 progress.md의 remote URL 표기는 PC에 따라 다르며, GitHub 측 repo는 동일.

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

## 4. 남은 로드맵 (Phase 0 Day 3 이후)

### Phase 0 (Week 1) 잔여

| Day | 작업 | 사전 조건 |
|---|---|---|
| **Day 3** | Drizzle 스키마 재검토 + 시드 데이터 보완 | DB 동작 확인 후 |
| **Day 4** | Supabase Auth Google OAuth + 이메일 화이트리스트 | **Google OAuth 클라이언트 ID/Secret 발급 필요** |
| **Day 5** | 글로벌 레이아웃 (사이드바 11개 메뉴 / 헤더 ⌘K / 플로팅 채팅) + 다크모드 토글 | — |

### Phase 1 (Week 2) — Agent 호출 골격 + 첫 Agent (하영)

- `/api/agents/[name]/invoke` 통일 라우트 (모델 라우팅 + 비용 추적 + agent_logs 자동 기록)
- `lib/agents/guard.ts` (비용 한도 + 5연속 오류 자동 일시정지)
- Anthropic SDK 래퍼
- 하영 시스템 프롬프트 + Todo CRUD + 자동 분류
- `AgentBadge` 컴포넌트

### Phase 2 (Week 3) — 채팅(민지) + 혜원 + Calendar

> 기획서 대비 조정: 민지를 Week 9 → Week 3로 앞당김 (사용자가 첫 도메인에 채팅 포함 원함). 처음엔 하영·혜원만 호출 가능, 점진 확장.

- 혜원 시스템 프롬프트 + 홈 Hero
- **민지 메인 엔드포인트** (`/api/chat/route.ts`) — Anthropic tool use 다단계 루프
- 채팅 페이지 `/chat` + 플로팅 모달 + ⌘K 명령 팔레트
- Google Calendar 동기화 + Refresh Token pgcrypto 암호화 저장
- Supabase Realtime 응답 스트리밍

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

| 자원 | 필요 시점 | 발급 위치 |
|---|---|---|
| Google OAuth 클라이언트 (Gmail + Calendar) | **Phase 0 Day 4** | console.cloud.google.com |
| GitHub Webhook 시크릿 (옵시디언 vault) | Phase 3 Week 4 | repo Settings → Webhooks |
| 옵시디언 vault private GitHub repo | Phase 3 Week 4 | github.com/new |
| Vercel 계정 + (Pro 옵션) | Phase 7 Week 10 | vercel.com |

---

## 7. 미결정 사항 (Phase 진입 전 확정 필요)

| # | 항목 | 결정 시점 | 비고 |
|---|---|---|---|
| 1 | Vercel Pro 가입 의향 ($20/월) | Phase 7 진입 전 | Hobby Cron 한도 초과. 외부 cron(cron-job.org) 대안 가능 |
| 2 | 임베딩 모델 | Phase 3 진입 전 | Voyage-3(한국어 강함) vs OpenAI text-embedding-3-small(저렴) |
| 3 | 민지 비용 상한선 | Phase 1 셋업 시 | 일 $5? 월 $30? (현재 시드는 일 $3) |
| 4 | 다크모드 기본값 | Phase 0 Day 5 | 시스템 따름 / 라이트 / 다크 |

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

## 10. 다음 즉시 액션 (Day 3 진입)

Phase 0 Day 2는 완료 커밋·푸시까지 마쳤음. 다음 세션부터는 Day 3 작업으로 진입.

```
[Day 3 우선순위]
  1. Drizzle 스키마 재검토 + 시드 데이터 보완
     - schema.ts 26개 테이블 도메인별 일관성 점검
     - 누락된 인덱스/제약조건 추가
     - lib/agents/definitions.ts 시스템 프롬프트 1차 다듬기
  2. Day 2에서 발견된 잠재 이슈 정리
     - drizzle-kit push --force 정책 (또는 strict 토글) 결정해 npm scripts 반영
     - lib/db/seed.ts dotenv 호이스팅 버그 수정 (client.ts에서 dotenv 로드 권장)
  3. (선택) Day 4 사전 준비
     - Google Cloud Console에서 OAuth 클라이언트 ID/Secret 발급
     - Authorized redirect URI: http://localhost:54321/auth/v1/callback (로컬 supabase)

[Day 4]
  - Supabase Auth Google OAuth 연결 + ALLOWED_EMAIL 화이트리스트
  - middleware.ts에서 세션 검사 + 로그인 페이지 라우팅

[Day 5]
  - 사이드바 11개 메뉴 + 헤더 ⌘K + 플로팅 채팅 골격 + 다크모드 토글
```
