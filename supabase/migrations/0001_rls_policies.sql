-- Phase 7 — Row Level Security 정책.
-- 단일 사용자 시점에서는 application 레벨 인증으로 충분하지만, production 배포 시 안전망 + 멀티유저 확장 대비.
--
-- 적용 시점:
--   1. Supabase production 프로젝트 생성 후
--   2. drizzle-kit push로 스키마 적용 후
--   3. 이 파일을 Supabase SQL Editor 또는 supabase migration up으로 실행
--
-- 정책 철학:
--   - public.users.id 가 supabase auth.uid()와 일치하지 않을 수 있음 (현 ensureUser는 email 기반 매핑).
--     → users 테이블에 auth_id 컬럼 추가 또는 id를 auth.uid() 와 일치시키는 마이그레이션 선행 필요.
--   - 이 파일은 "user_id = (SELECT id FROM users WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid()))"
--     서브쿼리를 헬퍼 함수로 캡슐화해 일관성 유지.

-- ─────────────────────────────────────────────────────────
-- 헬퍼 함수: 현재 auth user의 public.users.id 반환
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT u.id
  FROM public.users u
  JOIN auth.users au ON au.email = u.email
  WHERE au.id = auth.uid()
  LIMIT 1
$$;

-- ─────────────────────────────────────────────────────────
-- USER-SCOPED 테이블: user_id = current_user_id()
-- ─────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self_select ON public.users
  FOR SELECT USING (id = public.current_user_id());
CREATE POLICY users_self_update ON public.users
  FOR UPDATE USING (id = public.current_user_id());
-- INSERT는 application(ensureUser)이 service_role로 처리

ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY oauth_tokens_self_all ON public.oauth_tokens
  FOR ALL USING (user_id = public.current_user_id());

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_sessions_self_all ON public.chat_sessions
  FOR ALL USING (user_id = public.current_user_id());

-- chat_messages는 session 소유자 검사
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_messages_via_session ON public.chat_messages
  FOR ALL USING (
    session_id IN (
      SELECT id FROM public.chat_sessions WHERE user_id = public.current_user_id()
    )
  );

-- ─────────────────────────────────────────────────────────
-- SHARED-BUT-AUTH 테이블: 인증된 사용자라면 모두 read/write
-- (단일 사용자 가정 — 다중 사용자 도입 시 user_id 컬럼 추가 + 정책 갱신)
-- ─────────────────────────────────────────────────────────
DO $$
DECLARE
  tname text;
BEGIN
  FOR tname IN SELECT unnest(ARRAY[
    'agents', 'agent_prompt_versions', 'agent_logs',
    'todos', 'calendar_events_cache',
    'goals', 'goal_links', 'weekly_reviews',
    'habits', 'habit_logs', 'year_pixels',
    'quick_captures', 'read_later', 'learnings', 'obsidian_notes',
    'products', 'github_activity', 'github_digests',
    'claude_skills', 'skill_usage_logs',
    'news_sources', 'news_items', 'daily_briefings',
    'gmail_cache'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tname);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tname || '_authenticated_all',
      tname
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────
-- 백그라운드 service_role 우회 (cron 등)
-- service_role 키로 호출하는 cron job은 RLS 자동 우회 — 별도 정책 불필요.
-- ─────────────────────────────────────────────────────────

-- 검증 쿼리 (Supabase SQL Editor에서 실행):
--   SET ROLE authenticated;
--   SELECT * FROM users;  -- 자기 행만 보여야 함
--   SELECT * FROM agents;  -- 모두 보여야 함 (인증된 사용자라면)
--   RESET ROLE;
