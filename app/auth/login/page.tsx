"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

function sanitizeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/auth/")) return "/"; // 무한 재귀 방지
  return raw;
}

function LoginContent() {
  const searchParams = useSearchParams();
  const next = sanitizeNext(searchParams.get("next"));
  const code = searchParams.get("code");

  // PKCE code_verifier는 서버 cookie(httpOnly)에 저장되어 있어 client에서 exchange 불가능.
  // /auth/login에 ?code가 떨어진 케이스(이론상 proxy.ts에서 차단되지만 defense-in-depth)는
  // 그대로 /auth/callback?code=... 로 server forward해 정규 흐름에 합류시킨다.
  useEffect(() => {
    if (!code) return;
    const url = new URL("/auth/callback", window.location.origin);
    for (const [k, v] of new URLSearchParams(window.location.search)) {
      url.searchParams.set(k, v);
    }
    window.location.replace(url.toString());
  }, [code]);

  async function handleGoogleSignIn() {
    // next 라우트는 cookie로 전달 (Supabase의 redirect_to allowlist가 query string 매칭이 일관되지
    // 않아, redirectTo는 정확히 /auth/callback 한 줄로 고정). cookie는 SameSite=Lax + path=/ 라
    // OAuth 리다이렉트로 돌아올 때도 서버에 전달됨.
    document.cookie = `auth_next=${encodeURIComponent(next)}; Path=/; Max-Age=600; SameSite=Lax`;

    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        // Phase 2B: Calendar / Phase 5-A: Gmail 읽기.
        scopes:
          "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly",
        queryParams: {
          // refresh_token을 안정적으로 받기 위해 매 로그인 동의 강제
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      alert(`Google 로그인 시작 실패: ${error.message}`);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-svh bg-background px-6">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <header className="flex flex-col gap-2 text-center">
          <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            MyHub
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            로그인
          </h1>
          <p className="text-sm text-muted-foreground">
            {code
              ? "세션을 만드는 중..."
              : "등록된 Google 계정으로만 접근할 수 있습니다."}
          </p>
        </header>

        <Button
          onClick={handleGoogleSignIn}
          disabled={!!code}
          className="w-full justify-center h-11"
        >
          {code ? "처리 중..." : "Google로 계속하기"}
        </Button>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          처음 로그인하면 Supabase Auth가 사용자 정보를 받습니다. 화이트리스트
          이메일이 아닌 계정은 자동으로 거부됩니다.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
