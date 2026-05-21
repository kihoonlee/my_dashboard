"use client";

// /discussions/[id] — 토론 상세. 요약 리포트가 기본 노출, "전체 대화 보기"로 turns 전체 펼침.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { AgentBadge } from "@/components/agent-badge";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

type Discussion = {
  id: string;
  topic: string;
  status: "running" | "done" | "failed";
  summaryMd: string | null;
  roundsRun: number;
  totalCostUsd: string;
  startedAt: string;
  completedAt: string | null;
  targetAgents: string[];
};

type Turn = {
  id: string;
  round: number;
  content: string;
  createdAt: string;
  speakerEnglishName: string | null;
  speakerName: string | null;
};

export default function DiscussionDetail() {
  const params = useParams();
  const id = String(params.id);

  const [discussion, setDiscussion] = useState<Discussion | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [showTurns, setShowTurns] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/discussions/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as {
        discussion: Discussion;
        turns: Turn[];
      };
      setDiscussion(data.discussion);
      setTurns(data.turns ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // 진행 중이면 15초마다 폴링
  useEffect(() => {
    if (discussion?.status !== "running") return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [discussion?.status, load]);

  if (loading) {
    return (
      <div className="p-6">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 text-destructive text-sm">에러: {error}</div>
    );
  }
  if (!discussion) return null;

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="font-mono text-muted-foreground">
          {new Date(discussion.startedAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          라운드 {discussion.roundsRun}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground font-mono">
          ${parseFloat(discussion.totalCostUsd ?? "0").toFixed(4)}
        </span>
      </div>
      <h1 className="text-2xl font-bold tracking-tight mb-4">
        {discussion.topic}
      </h1>

      {discussion.status === "running" ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            토론 진행 중입니다. 완료되면 알림이 도착합니다.
          </span>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            결과 리포트
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Markdown>{discussion.summaryMd ?? "(빈 요약)"}</Markdown>
          </div>
        </div>
      )}

      {turns.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowTurns((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {showTurns ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            전체 대화 보기 ({turns.length} turns)
          </button>

          {showTurns && (
            <ol className="flex flex-col gap-3 mt-3">
              {turns.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center gap-2 mb-2 text-xs">
                    {t.speakerEnglishName && (
                      <AgentBadge
                        englishName={t.speakerEnglishName}
                        size="sm"
                      />
                    )}
                    <span className="text-muted-foreground">
                      라운드 {t.round}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {t.content}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
