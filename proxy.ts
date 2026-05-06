// Next.js 16의 Proxy (구 middleware). 모든 요청 직전에 실행.
// 1) Supabase 세션 쿠키 갱신 (refresh_token 회전)
// 2) 단일 사용자 화이트리스트 (ALLOWED_EMAIL) 검사
// 3) 인증 안 된 사용자는 /auth/login 으로 리다이렉트

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/auth/login",
  "/auth/callback",
  "/auth/error",
  "/auth/signout",
];

// next로 사용 가능한 path: 내부 path여야 하고 auth 라우트 자체로는 못 감 (무한 재귀 방지).
function sanitizeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/auth/")) return "/";
  return raw;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // request에 먼저 반영하고, 새 response 객체로 갱신해 outgoing cookie도 셋팅
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 세션 새로고침 + 사용자 정보 조회 (한 번에 처리됨)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Agent 간 내부 호출 (ask_agent tool → /api/agents/[name]/invoke)은 인증 우회.
  // 외부에서 위조하지 못하도록 깊이 헤더 + internal 표시 둘 다 검사.
  const isInternalAgentCall =
    pathname.startsWith("/api/agents/") &&
    request.headers.get("x-myhub-internal-call") === "1" &&
    request.headers.has("x-myhub-agent-depth");

  // 인증 안 됨 → 로그인 페이지로 (public path 또는 내부 agent 호출 제외)
  if (!user && !isPublic && !isInternalAgentCall) {
    // OAuth provider 응답이 site_url(=`/`) 으로 떨어진 케이스 — Supabase가 redirectTo
    // 매칭에 실패해 `/?code=...&state=...`로 떨어뜨릴 수 있음.
    // 그대로 `/auth/login`으로 redirect하면 ?code가 같이 옮겨가 버려 PKCE verifier가
    // client storage에 없는 상황이 됨. → 서버 callback으로 forward해 exchange 흐름으로 일원화.
    const hasOauthCode = request.nextUrl.searchParams.has("code");
    const hasOauthError = request.nextUrl.searchParams.has("error");
    if (hasOauthCode || hasOauthError) {
      const callbackUrl = request.nextUrl.clone();
      callbackUrl.pathname = "/auth/callback";
      callbackUrl.searchParams.delete("next");
      return NextResponse.redirect(callbackUrl);
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    // OAuth 잔여 params는 절대 옮겨붙이지 않는다 (defense-in-depth)
    loginUrl.searchParams.delete("code");
    loginUrl.searchParams.delete("state");
    loginUrl.searchParams.delete("error");
    loginUrl.searchParams.delete("error_description");
    loginUrl.searchParams.set("next", sanitizeNext(pathname));
    return NextResponse.redirect(loginUrl);
  }

  // 인증 됐는데 화이트리스트 불일치 → 에러 페이지로 (signOut은 /auth/error에서 처리)
  if (user && process.env.ALLOWED_EMAIL && user.email !== process.env.ALLOWED_EMAIL) {
    if (!pathname.startsWith("/auth/error")) {
      const errorUrl = request.nextUrl.clone();
      errorUrl.pathname = "/auth/error";
      errorUrl.searchParams.set("reason", "not_allowed");
      return NextResponse.redirect(errorUrl);
    }
  }

  // 인증된 사용자가 /auth/login 접근 → 홈으로
  if (user && pathname === "/auth/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.searchParams.delete("next");
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  // 정적 자원 + Next 내부 라우트(_next/*: HMR 웹소켓 / RSC payload / chunks 포함) 모두 proxy 건너뜀.
  // 이전에 _next/webpack-hmr이 매칭되어 WebSocket이 /auth/login으로 리다이렉트 시도되며 깨졌음.
  matcher: [
    "/((?!_next|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico)$).*)",
  ],
};
