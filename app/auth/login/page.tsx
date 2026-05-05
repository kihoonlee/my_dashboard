"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

function LoginContent() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  async function handleGoogleSignIn() {
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        // Phase 2 Calendar / Phase 5 Gmail 진입 시 추가 scope 확장 예정
        scopes: "openid email profile",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      // 에러는 사용자에게 보여줘야 함 (개인 글로벌 규칙)
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
            등록된 Google 계정으로만 접근할 수 있습니다.
          </p>
        </header>

        <Button
          onClick={handleGoogleSignIn}
          className="w-full justify-center h-11"
        >
          Google로 계속하기
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
