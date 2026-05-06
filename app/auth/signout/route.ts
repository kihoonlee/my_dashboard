// 로그아웃 라우트.
// POST /auth/signout — form 또는 fetch에서 호출 (CSRF 안전성 ↑)
// GET  /auth/signout — 브라우저 주소창에서 직접 진입하는 케이스 호환
// 두 핸들러 모두 세션 제거 후 /auth/login 으로 redirect.

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/http/origin";

async function handleSignout(request: NextRequest, status: 303 | 307) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // next 파라미터는 의도적으로 무시 — 로그아웃 후엔 항상 로그인 페이지로.
  return NextResponse.redirect(absoluteUrl(request, "/auth/login"), { status });
}

export async function POST(request: NextRequest) {
  return handleSignout(request, 303); // POST → GET (RFC 7231)
}

export async function GET(request: NextRequest) {
  return handleSignout(request, 307);
}
