"use client";

// 에이전트 활동 위젯 — 오늘 비용·호출 큰 숫자 + 24h 시간대별 BarChart + 에이전트별 분포.

import Link from "next/link";
import { Bot, ChevronRight } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { DashboardData } from "./types";

export function AgentActivityWidget({
  data,
  loading,
}: {
  data: DashboardData["agents"] | null;
  loading: boolean;
}) {
  return (
    <Link
      href="/agents"
      className="group relative rounded-3xl border border-border bg-card p-6 hover:border-foreground/20 hover:shadow-sm transition flex flex-col gap-4 min-h-[260px]"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Bot className="h-4 w-4" />
          <span className="font-semibold uppercase tracking-wider text-[10px]">
            에이전트 활동 (24h)
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition" />
      </div>

      {loading || !data ? (
        <div className="flex-1 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-12 bg-muted/40 rounded-2xl animate-pulse"
              />
            ))}
          </div>
          <div className="h-20 bg-muted/40 rounded-2xl animate-pulse" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label="오늘 비용"
              value={`$${data.dailyCostUsd.toFixed(3)}`}
              sub={`${data.dailyCalls}회 호출`}
            />
            <Stat
              label="이번 달"
              value={`$${data.monthlyCostUsd.toFixed(2)}`}
            />
            <Stat
              label="에러"
              value={`${data.dailyErrors}`}
              danger={data.dailyErrors > 0}
            />
          </div>

          {/* 24h bar */}
          <div className="h-20 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.hourly}
                margin={{ top: 0, right: 4, left: 4, bottom: 0 }}
              >
                <XAxis
                  dataKey="hour"
                  ticks={[0, 6, 12, 18]}
                  tickFormatter={(h) => `${h}시`}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={<HourTooltip />}
                  cursor={{ fill: "var(--muted)" }}
                />
                <Bar
                  dataKey="calls"
                  fill="var(--foreground)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={10}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 에이전트별 — 활동 있는 것만 */}
          {data.perAgent.some((p) => p.dailyCalls > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {data.perAgent
                .filter((p) => p.dailyCalls > 0)
                .sort((a, b) => b.dailyCostUsd - a.dailyCostUsd)
                .slice(0, 6)
                .map((p) => (
                  <span
                    key={p.englishName}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1 text-[10px]"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: p.colorHex }}
                    />
                    <span className="font-medium">{p.name}</span>
                    <span className="font-mono text-muted-foreground">
                      {p.dailyCalls}회 · ${p.dailyCostUsd.toFixed(3)}
                    </span>
                  </span>
                ))}
            </div>
          )}
        </>
      )}
    </Link>
  );
}

function Stat({
  label,
  value,
  sub,
  danger = false,
}: {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={`text-lg font-bold tracking-tight ${danger ? "text-destructive" : ""}`}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[10px] text-muted-foreground">{sub}</span>
      )}
    </div>
  );
}

type TooltipPayload = {
  active?: boolean;
  payload?: Array<{
    payload?: { hour: number; calls: number; costUsd: number };
  }>;
};

function HourTooltip(rawProps: unknown) {
  const props = rawProps as TooltipPayload;
  if (!props.active || !props.payload || props.payload.length === 0)
    return null;
  const entry = props.payload[0]?.payload;
  if (!entry) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-2.5 py-1.5 text-[10px] shadow-sm">
      <div className="font-semibold">{entry.hour}시</div>
      <div className="text-muted-foreground">
        {entry.calls}회 · ${entry.costUsd.toFixed(4)}
      </div>
    </div>
  );
}
