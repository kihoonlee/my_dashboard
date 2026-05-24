"use client";

// 캘린더 위젯 — 다음 일정 3개. 클릭하면 /calendar로 이동.

import Link from "next/link";
import { Calendar, ChevronRight } from "lucide-react";
import type { DashboardData } from "./types";

function fmtTime(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const day = isToday
    ? "오늘"
    : isTomorrow
      ? "내일"
      : d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
  const time = d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { day, time };
}

export function CalendarWidget({
  data,
  loading,
}: {
  data: DashboardData["calendar"] | null;
  loading: boolean;
}) {
  return (
    <Link
      href="/calendar"
      className="group relative rounded-3xl border border-border bg-card p-6 hover:border-foreground/20 hover:shadow-sm transition flex flex-col gap-4 min-h-[220px]"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span className="font-semibold uppercase tracking-wider text-[10px]">
            다음 일정
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition" />
      </div>

      {loading || !data ? (
        <div className="flex-1 flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-10 bg-muted/40 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : data.upcoming.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          예정된 일정이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.upcoming.map((ev) => {
            const { day, time } = fmtTime(ev.startAt);
            return (
              <li
                key={ev.id}
                className="flex items-center gap-3 rounded-2xl bg-muted/40 px-3 py-2"
              >
                <span
                  className="h-8 w-1 rounded-full shrink-0"
                  style={{
                    backgroundColor: ev.calendarColorHex ?? "var(--foreground)",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {ev.title}
                  </div>
                  {ev.location && (
                    <div className="text-[10px] text-muted-foreground truncate">
                      {ev.location}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-muted-foreground">
                    {day}
                  </div>
                  <div className="text-xs font-mono font-medium">{time}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Link>
  );
}
