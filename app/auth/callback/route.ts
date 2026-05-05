// OAuth 콜백 라우트. Supabase가 PKCE 흐름으로 ?code=... 를 보내고,
// 우리가 exchangeCodeForSession으로 세션 쿠키를 만든다.

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // next 라우트는 login 시 클라이언트가 cookie로 보냄 (?next= 쿼리는 Supabase wildcard 매칭
  // 문제로 사용 안 함). 없으면 홈.
  const cookieStore = await cookies();
  const nextCookie = cookieStore.get("auth_next")?.value;
  const next = nextCookie ? decodeURIComponent(nextCookie) : "/";

  console.log("[auth/callback] code present:", !!code, "next:", next);
  console.log(
    "[auth/callback] cookies received:",
    cookieStore.getAll().map((c) => c.name),
  );

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
    console.error("[auth/callback] exchange failed:", error.message);
    const url = new URL("/auth/error", origin);
    url.searchParams.set("reason", "exchange_failed");
    url.searchParams.set("description", error.message);
    return NextResponse.redirect(url);
  }

  // 사용한 next cookie 정리
  const response = NextResponse.redirect(new URL(next, origin));
  response.cookies.delete("auth_next");
  return response;
}
