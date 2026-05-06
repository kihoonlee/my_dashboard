"use client";

// 홈 Hero — 혜원의 일일 요약 위젯.
// 진입 시 자동 호출 안 함 (페이지 새로고침마다 비용 발생 방지).
// 사용자가 "오늘 종합" 버튼 클릭 시 /api/agents/hyewon/invoke 호출.
// Phase 5 cron(매일 7시)으로 daily_briefings에 자동 저장되면, 그 때부터는
// 캐시된 브리핑을 보여주는 모드로 전환 예정.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AgentBadge } from "@/components/agent-badge";
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
        const res = await fetch("/api/agents/hyewon/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message:
              "오늘의 종합 브리핑을 한 단락으로 알려줘. 필요하면 하영(오늘 매니저)에게 위임해서 미완료 Todo 상황을 확인해도 좋아.",
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
        setError(`혜원 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <AgentBadge englishName="hyewon" size="lg" showName={false} />
          <div>
            <h2 className="font-semibold text-foreground">혜원의 종합 브리핑</h2>
            <p className="text-xs text-muted-foreground">
              오케스트레이터 — 다른 Agent 결과를 한 단락으로 정리합니다.
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
              {briefing ? "다시 받기" : "오늘 종합"}
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
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
          {briefing}
          {meta && (
            <div className="mt-3 pt-3 border-t border-border/50 text-[10px] text-muted-foreground/80 font-mono">
              {meta.durationMs}ms · ${meta.costUsd.toFixed(6)}
            </div>
          )}
        </div>
      )}

      {!briefing && !error && !isPending && (
        <p className="text-sm text-muted-foreground">
          버튼을 눌러 혜원에게 오늘 상황을 종합 요청해 보세요. 매일 아침 7시 자동
          브리핑은 Phase 5에서 추가됩니다.
        </p>
      )}
    </div>
  );
}
