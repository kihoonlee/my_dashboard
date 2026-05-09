"use client";

// 홈 대시보드 위젯 3종:
//   - TodaySummaryWidget: 미완료 Todo + 가장 가까운 일정 + 오늘 LLM 비용 합산
//   - TeamStatusWidget: 10 Agent 격자 + 일/비용 progress + 클릭 시 /agents/[name]
//   - RecentActivityWidget: agent_logs 8건 timeline
// 단일 fetch (`/api/dashboard/summary`) 후 4초 간격 자동 갱신.

import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentBadge } from "@/components/agent-badge";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  CalendarClock,
  CheckSquare,
  Pause,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type TeamAgent = {
  id: string;
  name: string;
  englishName: string;
  role: string;
  isActive: boolean;
  isPausedReason: string | null;
  todayCalls: number;
  todayErrors: number;
  todayCostUsd: number;
  dailyCostLimitUsd: number | null;
  utilization: number;
  lastCallAt: string | null;
};

type DashboardData = {
  team: {
    summary: {
      activeCount: number;
      pausedCount: number;
      totalCallsToday: number;
      totalErrorsToday: number;
      totalCostUsdToday: number;
    };
    agents: TeamAgent[];
  };
  today: {
    pendingTodos: number;
    nextEvent: {
      id: string;
      title: string;
      startAt: string;
      endAt: string;
      location: string | null;
    } | null;
  };
  activity: Array<{
    id: string;
    trigger: string;
    durationMs: number;
    costUsd: number;
    isError: boolean;
    createdAt: string;
    agentEnglishName: string | null;
    agentName: string | null;
  }>;
};

const REFRESH_INTERVAL_MS = 60 * 1000;

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function formatEventTime(startAt: string, endAt: string): string {
  const s = new Date(startAt);
  const e = new Date(endAt);
  const isToday = new Date().toDateString() === s.toDateString();
  const date = isToday
    ? "오늘"
    : s.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  const isAllDay =
    s.getHours() === 0 && s.getMinutes() === 0 && e.getHours() === 0;
  if (isAllDay) return `${date} · 종일`;
  const fmt = (d: Date) =>
    d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  return `${date} · ${fmt(s)} – ${fmt(e)}`;
}

export function HomeDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  async function fetchData() {
    try {
      const res = await fetch("/api/dashboard/summary", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as DashboardData;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchData();
    const id = setInterval(() => void fetchData(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (loading && !data) {
    return (
      <div
        className="grid gap-4 md:grid-cols-2"
        role="status"
        aria-busy="true"
        aria-label="대시보드 로딩 중"
      >
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl md:col-span-2" />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
        대시보드 로딩 실패: {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TodaySummaryWidget data={data} />
      <TeamStatusWidget data={data} />
      <RecentActivityWidget data={data} className="md:col-span-2" />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 위젯들
// ───────────────────────────────────────────────────────────
function TodaySummaryWidget({ data }: { data: DashboardData }) {
  const { pendingTodos, nextEvent } = data.today;
  const { totalCallsToday, totalErrorsToday, totalCostUsdToday } =
    data.team.summary;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          오늘 요약
        </h2>
        <span className="text-[10px] text-muted-foreground font-mono">
          1분마다 자동 갱신
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/today"
          className="flex flex-col gap-1 p-3 rounded-lg border border-border bg-background hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckSquare className="h-3 w-3" />
            미완료 Todo
          </div>
          <div className="text-2xl font-bold tabular-nums">{pendingTodos}</div>
        </Link>
        <Link
          href="/agents"
          className="flex flex-col gap-1 p-3 rounded-lg border border-border bg-background hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="h-3 w-3" />
            오늘 호출
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {totalCallsToday}
            {totalErrorsToday > 0 && (
              <span className="text-sm text-destructive ml-1">
                ({totalErrorsToday}↯)
              </span>
            )}
          </div>
        </Link>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border/60">
        <span className="text-xs text-muted-foreground">오늘 LLM 비용</span>
        <span className="font-mono text-sm font-semibold tabular-nums">
          ${totalCostUsdToday.toFixed(4)}
        </span>
      </div>

      {nextEvent ? (
        <div className="pt-3 border-t border-border/60 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3 w-3" />
            다음 일정
          </div>
          <div className="text-sm font-medium truncate">{nextEvent.title}</div>
          <div className="text-[11px] font-mono text-muted-foreground">
            {formatEventTime(nextEvent.startAt, nextEvent.endAt)}
          </div>
        </div>
      ) : (
        <div className="pt-3 border-t border-border/60 text-xs text-muted-foreground flex items-center gap-1.5">
          <CalendarClock className="h-3 w-3 opacity-60" />
          예정된 일정이 없습니다.
        </div>
      )}
    </div>
  );
}

function TeamStatusWidget({ data }: { data: DashboardData }) {
  const { agents, summary } = data.team;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">AI 팀 ({summary.activeCount}/{agents.length})</h2>
        <Link
          href="/agents"
          className="text-[11px] text-primary hover:underline"
        >
          전체 관리 →
        </Link>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {agents.map((a) => {
          const paused = !a.isActive || !!a.isPausedReason;
          const utilizationPct = Math.min(100, Math.round(a.utilization * 100));
          const overBudget = a.utilization >= 0.8;
          return (
            <Link
              key={a.id}
              href={`/agents/${a.englishName}`}
              className={cn(
                "flex flex-col items-center gap-1.5 p-2 rounded-lg border border-border bg-background hover:bg-muted/40 transition-colors relative",
                paused && "opacity-50",
              )}
              title={`${a.name} (${a.role}) · 오늘 ${a.todayCalls}회${a.todayErrors > 0 ? `, ${a.todayErrors} 에러` : ""} · $${a.todayCostUsd.toFixed(4)}`}
            >
              <AgentBadge
                englishName={a.englishName}
                size="sm"
                showName={false}
              />
              <div className="text-[10px] text-muted-foreground truncate w-full text-center font-medium">
                {a.name}
              </div>
              {paused ? (
                <div className="absolute top-1 right-1">
                  <Pause className="h-3 w-3 text-muted-foreground" />
                </div>
              ) : a.todayErrors > 0 ? (
                <div className="absolute top-1 right-1">
                  <AlertCircle className="h-3 w-3 text-destructive" />
                </div>
              ) : null}
              {a.dailyCostLimitUsd && a.todayCalls > 0 && (
                <div className="w-full h-0.5 bg-muted rounded overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded transition-all",
                      overBudget ? "bg-destructive" : "bg-primary",
                    )}
                    style={{ width: `${utilizationPct}%` }}
                  />
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border/60 text-[11px] font-mono text-muted-foreground">
        <span>활성 {summary.activeCount} · 정지 {summary.pausedCount}</span>
        <span>오늘 ${summary.totalCostUsdToday.toFixed(4)}</span>
      </div>
    </div>
  );
}

function RecentActivityWidget({
  data,
  className,
}: {
  data: DashboardData;
  className?: string;
}) {
  const { activity } = data;
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 flex flex-col gap-3",
        className,
      )}
    >
      <h2 className="text-sm font-semibold">최근 활동</h2>

      {activity.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">
          아직 활동이 없습니다.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {activity.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 py-2"
            >
              {a.agentEnglishName ? (
                <AgentBadge
                  englishName={a.agentEnglishName}
                  size="sm"
                  showName={false}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs">
                  ?
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {a.agentName ?? "(알 수 없음)"}
                  </span>
                  {a.isError && (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                  <span className="text-[10px] font-mono text-muted-foreground/80 px-1.5 py-0.5 rounded bg-muted/60">
                    {a.trigger}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {formatRelative(a.createdAt)} · {a.durationMs}ms · $
                  {a.costUsd.toFixed(6)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
