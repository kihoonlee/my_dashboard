"use client";

// 홈 Hero — 민지 인사 자동 표시 (6h TTL 캐시 — /api/home/greeting).
// 첫 진입 시 LLM 호출 1회, 같은 bucket(KST 0-5/6-11/12-17/18-23) 안에선 캐시 hit.
// "다시 받기" 버튼은 force=true로 명시적 재생성.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/agent-badge";
import { Markdown } from "@/components/markdown";
import { Loader2, Sparkles } from "lucide-react";

const SUGGESTIONS = [
  { label: "오늘 todo 정리해줘", href: "/chat?agent=memo" },
  { label: "어제 일기 검색", href: "/chat?agent=diary" },
  { label: "최근 시장 동향", href: "/chat?agent=main" },
  { label: "내일 일정 등록", href: "/chat?agent=calendar" },
];

type GreetingResponse = {
  text: string;
  bucket: "morning" | "afternoon" | "evening" | "night";
  dateKey: string;
  cached: boolean;
  costUsd?: number;
  durationMs?: number;
};

export function HomeHero() {
  const [greeting, setGreeting] = useState<GreetingResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGreeting = useCallback(async (force = false) => {
    if (force) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const url = force ? "/api/home/greeting?force=true" : "/api/home/greeting";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `status ${res.status}`);
      }
      setGreeting(data as GreetingResponse);
    } catch (e) {
      setError(`민지 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchGreeting(false);
  }, [fetchGreeting]);

  return (
    <section className="flex flex-col items-center text-center gap-5 pt-8 pb-4">
      <AgentAvatar englishName="assistant" size="xl" />

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          무엇을 도와드릴까요?
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          민지가 당신을 맞이합니다. 일기 · 메모 · 할일 · 캘린더 — 옆에 항상
          에이전트가 함께해요.
        </p>
      </div>

      {/* 인사 카드 — 로딩 중에는 skeleton, 끝나면 자동 표시 */}
      <div className="w-full max-w-2xl">
        {loading ? (
          <div className="rounded-3xl border border-border bg-card p-6 flex flex-col gap-2.5 text-left">
            <div className="h-3 w-3/4 bg-muted/50 rounded-full animate-pulse" />
            <div className="h-3 w-full bg-muted/40 rounded-full animate-pulse" />
            <div className="h-3 w-5/6 bg-muted/40 rounded-full animate-pulse" />
          </div>
        ) : error ? (
          <div
            role="alert"
            className="border border-destructive/30 bg-destructive/5 text-destructive rounded-2xl p-4 text-sm text-left"
          >
            {error}
          </div>
        ) : greeting ? (
          <div className="rounded-3xl border border-border bg-card p-6 text-left flex flex-col gap-3">
            <Markdown>{greeting.text}</Markdown>
            {!greeting.cached &&
              greeting.durationMs !== undefined &&
              greeting.costUsd !== undefined && (
                <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground/80 font-mono">
                  {greeting.durationMs}ms · ${greeting.costUsd.toFixed(6)}
                </div>
              )}
          </div>
        ) : null}
      </div>

      {/* 제안 chip + 재생성 */}
      <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
        {SUGGESTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted transition"
          >
            {s.label}
          </Link>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchGreeting(true)}
          disabled={loading || refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              다시 받기
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
