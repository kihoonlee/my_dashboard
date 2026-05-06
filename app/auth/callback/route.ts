// OAuth 콜백 라우트. Supabase가 PKCE 흐름으로 ?code=... 를 보내고,
// 우리가 exchangeCodeForSession으로 세션 쿠키를 만든다.
// 이 시점에 Google이 발급한 provider_refresh_token을 잡아 oauth_tokens에 암호화 저장한다.
// (Calendar/Gmail API 호출용. 첫 로그인 또는 prompt=consent 재로그인 시에만 발급됨.)

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";
import { saveRefreshToken } from "@/lib/oauth/token-store";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // next 라우트는 login 시 클라이언트가 cookie로 보냄 (?next= 쿼리는 Supabase wildcard 매칭
  // 문제로 사용 안 함). 없으면 홈.
  const cookieStore = await cookies();
  const nextCookie = cookieStore.get("auth_next")?.value;
  const next = nextCookie ? decodeURIComponent(nextCookie) : "/";

  console.log("[auth/callback] code present:", !!code, "next:", next);

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
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchange failed:", error.message);
    const url = new URL("/auth/error", origin);
    url.searchParams.set("reason", "exchange_failed");
    url.searchParams.set("description", error.message);
    return NextResponse.redirect(url);
  }

  // Google refresh token 캡처 — 발급된 경우에만 저장.
  // (재로그인이라도 prompt=consent 없이는 refresh token이 안 올 수 있음 → 그땐 기존 행 유지)
  const session = data.session;
  const refreshToken = session?.provider_refresh_token ?? null;
  if (session?.user && refreshToken) {
    try {
      const userId = await ensureUser(session.user);
      const scope = (session.user.user_metadata as { provider_scope?: string } | null)
        ?.provider_scope ?? "";
      const expiresAt = session.expires_at
        ? new Date(session.expires_at * 1000)
        : null;
      await saveRefreshToken({
        userId,
        provider: "google",
        refreshToken,
        scope,
        expiresAt,
      });
      console.log("[auth/callback] google refresh token saved");
    } catch (e) {
      // 저장 실패는 로그인 자체를 막지 않음 — 사용자 흐름 유지
      console.error("[auth/callback] failed to save refresh token:", e);
    }
  } else if (session?.user) {
    console.log(
      "[auth/callback] no provider_refresh_token in session (재인증 시 prompt=consent 필요할 수 있음)",
    );
  }

  // 사용한 next cookie 정리
  const response = NextResponse.redirect(new URL(next, origin));
  response.cookies.delete("auth_next");
  return response;
}
