// Next.js 16의 Proxy (구 middleware). 모든 요청 직전에 실행.
// 1) Supabase 세션 쿠키 갱신 (refresh_token 회전)
// 2) 단일 사용자 화이트리스트 (ALLOWED_EMAIL) 검사
// 3) 인증 안 된 사용자는 /auth/login 으로 리다이렉트

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/auth/login", "/auth/callback", "/auth/error"];

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

  // 인증 안 됨 → 로그인 페이지로 (public path 제외)
  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("next", pathname);
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
  // Auth callback 라우트와 정적 자원은 proxy 건너뜀
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico)$).*)",
  ],
};
