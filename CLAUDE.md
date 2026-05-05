# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project — MyHub

1인용 개인 정보 허브 (`kihoon_dashboard` / repo: `kihoonlee/my_dashboard`). 10명의 한국어 AI Agent 팀(혜원·하영·수민·서연·다솜·현주·도연·민영·정연 + 메타 챗봇 민지)이 사업 운영(GitHub 추적)과 개인 정보(옵시디언·메일·일정·뉴스)를 통합 관리한다. 단일 사용자 화이트리스트 기반(Google OAuth, Phase 0 Day 4 예정).

현재 위치: **Phase 0 Day 2 마무리 직전** (DB 스키마/시드 코드까지 작성됨, 로컬 Supabase 기동 + push/seed 실행은 보류). 상세 로드맵은 [progress.md](progress.md) 참조.

## Stack

- **Next.js 16.2.4 + React 19.2.4** (App Router, Turbopack). 이 버전은 학습 데이터 이후 — 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 먼저 읽어라 (AGENTS.md 규칙).
- **Tailwind v4** + shadcn/ui (neutral) + Pretendard Variable + tw-animate-css. 토큰은 `app/globals.css`에 CSS 변수로 정의 (Toss Blue `#3182F6` primary + 10명 Agent별 `--agent-*` 컬러).
- **Drizzle ORM** + `postgres-js` (런타임은 풀러 6543, 마이그레이션은 직접 5432 권장 — `.env.example` 참조)
- **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`, supabase CLI dev dep). 로컬 dev는 `npx supabase start` (Docker 필요).

## Commands

```bash
npm run dev                  # next dev (Turbopack)
npm run build
npm run lint                 # eslint (flat config)

# DB workflow — 반드시 이 순서로
npm run db:enable-extensions # vector + pgcrypto + pg_trgm 활성화 (최초 1회)
npm run db:generate          # schema → SQL 마이그레이션 생성
npm run db:push              # 26개 테이블 + HNSW 인덱스 push
npm run db:seed              # lib/agents/definitions.ts 의 10명 Agent upsert
npm run db:studio            # drizzle-kit studio
```

DB 스크립트는 `tsx`로 직접 실행되며 `.env.local`의 `DATABASE_URL`을 요구한다. `.env.example`을 복사해 채울 것. 단일 테스트 프레임워크는 아직 없음.

## Architecture

**App Router** — `app/layout.tsx`(`lang="ko"`, Pretendard 적용), `app/page.tsx`(현재 placeholder, 10명 Agent 그리드).

**`lib/db/`** — DB 레이어의 단일 진입점.
- `schema.ts` — 26개 테이블의 single source of truth. 도메인별 섹션(USERS / AGENTS & CHAT / TODO & CALENDAR / GOALS & REVIEWS / HABITS & YEAR IN PIXELS / KNOWLEDGE / BUSINESS-GitHub / DEV TOOLS / NEWS / MAIL)으로 구분. 모든 PK는 `uuid().defaultRandom()`, 모든 timestamp는 `withTimezone: true`.
- `client.ts` — `db` 싱글턴(`drizzle(postgres(url, { prepare: false, max: 10 }))`). 새 쿼리 코드는 항상 여기서 import (`import { db } from "@/lib/db/client"`).
- `enable-extensions.ts` — pgvector(임베딩 1024차원 HNSW) + pgcrypto(추후 OAuth 토큰 암호화) + pg_trgm(한국어 FTS 보조) 활성화. `db:push` 전에 한 번만 실행.
- `seed.ts` — `AGENT_SEEDS`를 `agents` 테이블에 upsert.

**`lib/agents/definitions.ts`** — 10명 Agent의 시드 정의. `model`(`claude-sonnet-4-6` / `claude-haiku-4-5-20251001`), `temperature`, `maxTokens`, `systemPrompt`, `triggerConfig`(cron / page_visits / data_events), `toolPermissions`(`data_read`/`data_write`/`external_apis`/`call_agents`), 일·월 비용 한도(`dailyCostLimitUsd`/`monthlyCostLimitUsd`)까지 한 곳에서 관리. Agent 추가/수정은 여기를 고친 뒤 `db:seed`.

**핵심 도메인 관계**
- `agents` ↔ `agent_prompt_versions` (1:N, 버전 히스토리 + 롤백) / `agent_logs` (호출별 토큰·비용·에러)
- `chat_sessions` → `chat_messages` (`role`/`content`/`agentId`/`toolCalls` jsonb로 tool use 기록) — Phase 2의 민지 채팅 백본
- `products` ↔ `todos` / `github_activity` — 13개 프로덕트 칸반(Phase 4)
- `obsidian_notes` — `vector(1024)` 컬럼 + HNSW(`vector_cosine_ops`) 인덱스. 의미 검색 + `pg_trgm` FTS 병행 예정
- `goal_links.linked_type` + `linked_id` — 다형 참조(어떤 테이블이든 가리키는 generic FK)
- 모든 `created_at`/`updated_at`은 timezone-aware. 단일 사용자라도 멀티유저 확장 대비 RLS `user_id = auth.uid()` 정책 추후 추가 예정 (Phase 0 Day 4+)

**Path alias**: `@/` → repo 루트 (`tsconfig.json` 기본). UI 컴포넌트는 `components/ui/`에 shadcn CLI로 추가 (`components.json`: neutral 베이스, lucide 아이콘, `cn()` 유틸은 `lib/utils.ts`).

## Conventions

- 한국어 UI/주석/커밋 메시지 OK. 코드 식별자는 영어.
- Agent 영문명(`englishName`)은 unique key — 라우트(`/api/agents/[name]/invoke`, Phase 1+)와 색상 토큰(`--agent-<englishName>`)에 그대로 대응되므로 변경 시 양쪽 동기화.
- `db:push`는 마이그레이션 파일 없이 바로 적용 — 프로덕션 전환 시 `db:generate` + 검토 후 적용으로 워크플로 변경.
- 시간/날씨 등 LLM에 컨텍스트 주입은 `{user_name}`/`{current_time}` 플레이스홀더로 시스템 프롬프트에 포함 (`definitions.ts` 참조).
- 모델 ID는 매 변경 시 최신 확인 필요 (전역 CLAUDE.md 시간축 규칙). 현재 시드: `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`.
