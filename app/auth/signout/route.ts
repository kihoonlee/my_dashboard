// 로그아웃 라우트. POST /auth/signout 호출 → 세션 제거 후 /auth/login 리다이렉트.

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/auth/login", request.url), {
    status: 303, // POST → GET (RFC 7231)
  });
}
