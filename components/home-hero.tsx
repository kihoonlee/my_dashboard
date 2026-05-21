"use client";

// 홈 Hero — 보조 에이전트(태오) 환영 위젯.
// 진입 시 자동 호출 안 함 (페이지 새로고침마다 비용 발생 방지).
// "인사 받기" 버튼 클릭 시 /api/agents/assistant/invoke 호출 — 태오가 사용자 컨텍스트를
// 가져와 따뜻한 인사 + 오늘 추천 한 줄을 한 단락으로 전달.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AgentBadge } from "@/components/agent-badge";
import { Markdown } from "@/components/markdown";
import { Loader2, Sparkles } from "lucide-react";

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
        setError(`태오 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <AgentBadge englishName="assistant" size="lg" showName={false} />
          <div>
            <h2 className="font-semibold text-foreground">태오의 인사</h2>
            <p className="text-xs text-muted-foreground">
              보조 에이전트 — 당신을 가장 잘 아는, 메인과는 의견이 다른 CTO.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={briefing ? "outline" : "default"}
          onClick={fetchBriefing}
          disabled={isPending}
          className="shrink-0"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {briefing ? "다시 받기" : "인사 받기"}
            </>
          )}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
        >
          {error}
        </div>
      )}

      {briefing && (
        <div className="flex flex-col gap-3">
          <Markdown>{briefing}</Markdown>
          {meta && (
            <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground/80 font-mono">
              {meta.durationMs}ms · ${meta.costUsd.toFixed(6)}
            </div>
          )}
        </div>
      )}

      {!briefing && !error && !isPending && (
        <p className="text-sm text-muted-foreground">
          버튼을 눌러 태오에게 오늘의 인사와 한 줄 인사이트를 받아보세요.
        </p>
      )}
    </div>
  );
}
