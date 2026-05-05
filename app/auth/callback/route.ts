// OAuth 콜백 라우트. Supabase가 PKCE 흐름으로 ?code=... 를 보내고,
// 우리가 exchangeCodeForSession으로 세션 쿠키를 만든다.

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // OAuth provider 측 에러 (사용자가 거부 등)
  const errorCode = searchParams.get("error");
  if (errorCode) {
    const url = new URL("/auth/error", origin);
    url.searchParams.set("reason", errorCode);
    url.searchParams.set(
      "description",
      searchParams.get("error_description") ?? "OAuth 제공자에서 에러가 반환되었습니다",
    );
    return NextResponse.redirect(url);
  }

  if (!code) {
    const url = new URL("/auth/error", origin);
    url.searchParams.set("reason", "missing_code");
    return NextResponse.redirect(url);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL("/auth/error", origin);
    url.searchParams.set("reason", "exchange_failed");
    url.searchParams.set("description", error.message);
    return NextResponse.redirect(url);
  }

  // 화이트리스트 검사는 proxy.ts가 매 요청마다 실행하므로 여기서는 단순 redirect.
  return NextResponse.redirect(new URL(next, origin));
}
