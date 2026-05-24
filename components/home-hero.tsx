"use client";

// 홈 Hero — Owllet 인사말 스타일.
// 큰 인사 + 옅은 chip 형식 제안. 인사 받기 버튼을 누르면 보조 에이전트(민지) 응답이 채워짐.

import { useState, useTransition } from "react";
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

export function HomeHero() {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    durationMs: number;
    costUsd: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function fetchBriefing() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/agents/assistant/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message:
              "사용자가 홈에 진입했습니다. get_user_context 도구로 최근 일기·메모·todo 패턴을 살펴본 뒤, 따뜻한 인사 + 오늘 도움이 될 한 줄을 3-5줄로 전달해주세요.",
            trigger: "home_hero",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `status ${res.status}`);
        setBriefing(data.text || "(빈 응답)");
        setMeta({
          durationMs: data.durationMs,
          costUsd: data.costUsd ?? 0,
        });
      } catch (e) {
        setError(`민지 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

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

      {/* 제안 chip */}
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
          variant="default"
          size="sm"
          onClick={fetchBriefing}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              민지에게 인사 받기
            </>
          )}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="w-full max-w-2xl border border-destructive/30 bg-destructive/5 text-destructive rounded-2xl p-4 text-sm text-left"
        >
          {error}
        </div>
      )}

      {briefing && (
        <div className="w-full max-w-2xl rounded-3xl border border-border bg-card p-6 text-left flex flex-col gap-3">
          <Markdown>{briefing}</Markdown>
          {meta && (
            <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground/80 font-mono">
              {meta.durationMs}ms · ${meta.costUsd.toFixed(6)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
