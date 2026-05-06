"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const code = searchParams.get("code");
  const [exchanging, setExchanging] = useState<boolean>(false);

  // Defensive: Supabase가 redirectTo를 정확히 매칭 못해 /auth/callback이 아닌 /auth/login으로
  // code를 들고 떨어뜨리는 케이스를 처리. 정상 흐름은 /auth/callback route handler 사용.
  useEffect(() => {
    if (!code) return;
    setExchanging(true);
    console.log("[auth/login fallback] exchanging code, document.cookie:", document.cookie);
    const supabase = createSupabaseBrowserClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        console.error("[auth/login fallback] exchange failed:", error.message);
        router.replace(
          `/auth/error?reason=exchange_failed&description=${encodeURIComponent(error.message)}`,
        );
        return;
      }
      router.replace(next);
    });
  }, [code, next, router]);

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
        // Phase 2B: Calendar 읽기 권한. Phase 5에서 Gmail 추가 예정.
        scopes:
          "openid email profile https://www.googleapis.com/auth/calendar.readonly",
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
            {exchanging
              ? "세션을 만드는 중..."
              : "등록된 Google 계정으로만 접근할 수 있습니다."}
          </p>
        </header>

        <Button
          onClick={handleGoogleSignIn}
          disabled={exchanging}
          className="w-full justify-center h-11"
        >
          {exchanging ? "처리 중..." : "Google로 계속하기"}
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
