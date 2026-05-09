"use client";

// /agents — 10명 AI Agent 일람.
// 각 카드: avatar + 한국어/영문명 + 역할 + 모델 + 활성 상태 + 오늘/이번달 비용 progress bar + 호출 수.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  PauseCircle,
} from "lucide-react";
import { AgentAvatar } from "@/components/agent-badge";
import { cn } from "@/lib/utils";

type AgentItem = {
  id: string;
  englishName: string;
  name: string;
  role: string;
  description: string;
  model: string;
  colorHex: string;
  avatarEmoji: string | null;
  isActive: boolean;
  isPausedReason: string | null;
  dailyCostLimitUsd: number | null;
  monthlyCostLimitUsd: number | null;
  dailyCostUsd: number;
  monthlyCostUsd: number;
  dailyCalls: number;
  dailyErrors: number;
  lastCallAt: string | null;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAgents() {
    setLoading(true);
    try {
      const res = await fetch("/api/agents/list", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      setAgents(data.agents);
    } catch (e) {
      setError(`로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchAgents();
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-muted-foreground" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">AI 팀</h1>
          <p className="text-sm text-muted-foreground">
            10명 Agent의 상태·비용·프롬프트를 한 곳에서 관리.
          </p>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
        >
          {error}
        </div>
      )}

      {loading && !agents ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          로딩 중...
        </div>
      ) : !agents || agents.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center text-sm text-muted-foreground">
          등록된 Agent가 없습니다. <code>npm run db:seed</code>를 실행하세요.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <AgentCard key={a.id} a={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AgentCard({ a }: { a: AgentItem }) {
  const dailyPct = a.dailyCostLimitUsd
    ? Math.min(100, (a.dailyCostUsd / a.dailyCostLimitUsd) * 100)
    : 0;
  const monthlyPct = a.monthlyCostLimitUsd
    ? Math.min(100, (a.monthlyCostUsd / a.monthlyCostLimitUsd) * 100)
    : 0;

  return (
    <li>
      <Link
        href={`/agents/${a.englishName}`}
        className="block rounded-xl border border-border bg-card p-4 hover:bg-card/80 transition-colors"
      >
        <header className="flex items-start gap-3">
          <AgentAvatar
            englishName={a.englishName}
            size="lg"
            className="ring-2 ring-background shadow-sm"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-sm truncate">{a.name}</span>
              <span className="text-[11px] text-muted-foreground font-mono truncate">
                {a.englishName}
              </span>
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {a.role}
            </div>
          </div>
          {a.isActive ? (
            <CheckCircle2
              className="h-4 w-4 text-emerald-500 shrink-0"
              aria-label="활성"
            />
          ) : (
            <PauseCircle
              className="h-4 w-4 text-amber-500 shrink-0"
              aria-label={a.isPausedReason ?? "일시정지"}
            />
          )}
        </header>

        <p className="text-xs text-muted-foreground/80 mt-2 line-clamp-2 leading-relaxed">
          {a.description}
        </p>

        <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <span className="px-1.5 py-0.5 rounded bg-muted">{a.model}</span>
          {a.dailyCalls > 0 && <span>오늘 {a.dailyCalls}회</span>}
          {a.dailyErrors > 0 && (
            <span className="text-destructive flex items-center gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5" />
              {a.dailyErrors}
            </span>
          )}
          {a.lastCallAt && <span>· {timeAgo(a.lastCallAt)}</span>}
        </div>

        {(a.dailyCostLimitUsd || a.monthlyCostLimitUsd) && (
          <div className="mt-3 flex flex-col gap-1.5">
            {a.dailyCostLimitUsd !== null && (
              <CostBar
                label="오늘"
                value={a.dailyCostUsd}
                limit={a.dailyCostLimitUsd}
                pct={dailyPct}
              />
            )}
            {a.monthlyCostLimitUsd !== null && (
              <CostBar
                label="이번달"
                value={a.monthlyCostUsd}
                limit={a.monthlyCostLimitUsd}
                pct={monthlyPct}
              />
            )}
          </div>
        )}

        {!a.isActive && a.isPausedReason && (
          <div className="mt-2 text-[10px] text-amber-700 dark:text-amber-300 font-mono">
            일시정지: {a.isPausedReason}
          </div>
        )}
      </Link>
    </li>
  );
}

function CostBar({
  label,
  value,
  limit,
  pct,
}: {
  label: string;
  value: number;
  limit: number;
  pct: number;
}) {
  const danger = pct >= 80;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-12 shrink-0 text-muted-foreground font-mono">{label}</span>
      <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full transition-all",
            danger ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-muted-foreground shrink-0">
        ${value.toFixed(4)} / ${limit.toFixed(2)}
      </span>
    </div>
  );
}
