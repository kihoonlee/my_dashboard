// 인증 실패 / 권한 없음 표시 페이지.
// 화이트리스트 위반(reason=not_allowed)인 경우 즉시 signOut 처리.

import { Suspense } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const REASON_TEXT: Record<string, { title: string; description: string }> = {
  not_allowed: {
    title: "접근 권한 없음",
    description: "이 계정은 화이트리스트에 등록되어 있지 않습니다. 관리자에게 문의하세요.",
  },
  missing_code: {
    title: "OAuth 코드 누락",
    description: "Google 콜백에서 인증 코드를 받지 못했습니다. 다시 시도해 주세요.",
  },
  exchange_failed: {
    title: "세션 교환 실패",
    description: "Supabase가 OAuth 코드를 세션으로 변환하지 못했습니다.",
  },
  access_denied: {
    title: "Google 인증 거부",
    description: "Google에서 인증이 거부되었습니다.",
  },
};

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; description?: string }>;
}) {
  const { reason, description } = await searchParams;
  const reasonKey = reason ?? "unknown";
  const known = REASON_TEXT[reasonKey];

  // 화이트리스트 위반 → 즉시 signOut (다음 요청부터 세션 없는 상태로)
  if (reasonKey === "not_allowed") {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-svh bg-background px-6">
      <div className="w-full max-w-md flex flex-col gap-6 text-center">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-widest text-destructive uppercase">
            인증 오류
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {known?.title ?? "알 수 없는 오류"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {known?.description ?? `사유 코드: ${reasonKey}`}
          </p>
          {description && (
            <p className="mt-2 text-xs text-muted-foreground/70 break-all">
              {description}
            </p>
          )}
        </header>

        <Link
          href="/auth/login"
          className={buttonVariants({ className: "w-full justify-center h-11" })}
        >
          로그인 페이지로
        </Link>
      </div>
    </div>
  );
}

export default function ErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; description?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ErrorContent searchParams={searchParams} />
    </Suspense>
  );
}
