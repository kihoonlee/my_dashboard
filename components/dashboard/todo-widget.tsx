"use client";

// Todo 위젯 — 오늘 마감 / 마감 지남 / 완료 도넛 차트 + 숫자 요약.
// 클릭하면 /todos로 이동.

import Link from "next/link";
import { CheckSquare, ChevronRight } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import type { DashboardData } from "./types";

export function TodoWidget({
  data,
  loading,
}: {
  data: DashboardData["todos"] | null;
  loading: boolean;
}) {
  const overdue = data?.overdue ?? 0;
  const dueToday = data?.dueToday ?? 0;
  const completedToday = data?.completedToday ?? 0;
  const totalActive = data?.totalActive ?? 0;

  // 도넛: overdue (red) / dueToday (cream) / 그 외 active (muted)
  const otherActive = Math.max(0, totalActive - overdue - dueToday);
  const chart = [
    { name: "마감 지남", value: overdue, color: "var(--destructive)" },
    {
      name: "오늘 마감",
      value: dueToday,
      color: "var(--pastel-cream)",
    },
    {
      name: "기타 미완료",
      value: otherActive,
      color: "var(--muted)",
    },
  ];
  const sum = chart.reduce((a, b) => a + b.value, 0);

  return (
    <Link
      href="/todos"
      className="group relative rounded-3xl border border-border bg-card p-6 hover:border-foreground/20 hover:shadow-sm transition flex flex-col gap-4 min-h-[220px]"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckSquare className="h-4 w-4" />
          <span className="font-semibold uppercase tracking-wider text-[10px]">
            오늘의 Todo
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition" />
      </div>

      {loading || !data ? (
        <div className="flex-1 flex items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-muted/50 animate-pulse" />
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-3 w-24 bg-muted/40 rounded-full animate-pulse" />
            <div className="h-3 w-20 bg-muted/40 rounded-full animate-pulse" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 shrink-0">
            {sum === 0 ? (
              <div className="h-full w-full rounded-full border-4 border-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                0
              </div>
            ) : (
              <PieChart width={96} height={96}>
                <Pie
                  data={chart}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={28}
                  outerRadius={45}
                  paddingAngle={2}
                  stroke="none"
                >
                  {chart.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            )}
          </div>
          <div className="flex-1 flex flex-col gap-1.5 text-xs">
            <Row label="오늘 마감" value={dueToday} dot="var(--pastel-cream)" />
            <Row
              label="마감 지남"
              value={overdue}
              dot="var(--destructive)"
              danger
            />
            <Row
              label="오늘 완료"
              value={completedToday}
              dot="var(--pastel-mint)"
            />
            <div className="text-[10px] text-muted-foreground mt-1">
              미완료 {totalActive}건 · 이번 주 완료 {data.completedThisWeek}건
            </div>
          </div>
        </div>
      )}
    </Link>
  );
}

function Row({
  label,
  value,
  dot,
  danger = false,
}: {
  label: string;
  value: number;
  dot: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: dot }}
      />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span
        className={danger && value > 0 ? "text-destructive font-semibold" : "font-semibold"}
      >
        {value}
      </span>
    </div>
  );
}
