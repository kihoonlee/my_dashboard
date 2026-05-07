"use client";

// 데일리 모티베이션 카드 — /goals 메인 대시보드 상단.
// 진입 시 GET /api/insights/today. 오늘자 없으면 자동 POST로 생성.
// 사용자는 "다시 받기" 버튼으로 재생성 가능.

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { AgentBadge } from "@/components/agent-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Insight = {
  insight: string;
  focusHabit: string | null;
  tone: "encourage" | "insight" | "action" | "question";
  generatedAt: string;
  date: string;
};

const TONE_LABEL: Record<string, string> = {
  encourage: "격려",
  insight: "통찰",
  action: "행동",
  question: "질문",
};

const TONE_STYLE: Record<string, string> = {
  encourage:
    "border-emerald-400/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  insight:
    "border-primary/40 bg-primary/5 text-primary",
  action:
    "border-amber-400/40 bg-amber-400/5 text-amber-700 dark:text-amber-300",
  question:
    "border-violet-400/40 bg-violet-500/5 text-violet-700 dark:text-violet-400",
};

export function DailyMotivationCard() {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const triedAutoRef = useRef(false);

  async function fetchToday(): Promise<Insight | null> {
    try {
      const res = await fetch("/api/insights/today", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      return data.insight ?? null;
    } catch (e) {
      setError(`인사이트 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/today", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? data?.error ?? `status ${res.status}`);
      }
      const data = await res.json();
      setInsight(data.insight ?? null);
    } catch (e) {
      setError(`인사이트 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    void (async () => {
      const cur = await fetchToday();
      setInsight(cur);
      setLoading(false);
      // 첫 진입 + 오늘 거 없으면 자동 생성
      if (!triedAutoRef.current && !cur) {
        triedAutoRef.current = true;
        void generate();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 flex items-start gap-4 transition-colors",
        insight
          ? TONE_STYLE[insight.tone] ?? TONE_STYLE.encourage
          : "border-border bg-card",
      )}
    >
      <AgentBadge englishName="soomin" size="sm" showName={false} />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider font-medium opacity-70">
            오늘의 한 문장
          </span>
          {insight && (
            <span className="text-[10px] font-mono opacity-60">
              · {TONE_LABEL[insight.tone] ?? insight.tone}
            </span>
          )}
        </div>
        {loading || generating ? (
          <div className="text-sm flex items-center gap-2 opacity-80">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {generating ? "수민이 생각 중..." : "로딩 중..."}
          </div>
        ) : insight ? (
          <p className="text-base font-medium leading-relaxed">
            {insight.insight}
          </p>
        ) : (
          <p className="text-sm opacity-70">
            아직 오늘의 인사이트가 없습니다.
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={generate}
        disabled={generating || loading}
        className="shrink-0 gap-1.5 opacity-70 hover:opacity-100"
        title="다시 받기"
      >
        {generating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        다시
      </Button>
    </div>
  );
}
