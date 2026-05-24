"use client";

// 알림 위젯 — 미열람 카운트 큰 숫자 + 최근 3건 미리보기.
// 클릭하면 /notifications로 이동.

import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./types";

function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

export function NotificationsWidget({
  data,
  loading,
}: {
  data: DashboardData["notifications"] | null;
  loading: boolean;
}) {
  return (
    <Link
      href="/notifications"
      className="group relative rounded-3xl border border-border bg-card p-6 hover:border-foreground/20 hover:shadow-sm transition flex flex-col gap-4 min-h-[220px]"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Bell className="h-4 w-4" />
          <span className="font-semibold uppercase tracking-wider text-[10px]">
            오늘의 알림
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition" />
      </div>

      {loading || !data ? (
        <div className="flex-1 flex flex-col gap-2">
          <div className="h-10 w-20 bg-muted/50 rounded-2xl animate-pulse" />
          <div className="h-3 w-32 bg-muted/40 rounded-full animate-pulse" />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight">
              {data.unread}
            </span>
            <span className="text-xs text-muted-foreground">건 안 읽음</span>
          </div>

          {data.recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">알림 없음</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.recent.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "text-xs flex items-baseline gap-2",
                    n.readAt
                      ? "text-muted-foreground"
                      : "text-foreground font-medium",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      n.readAt ? "bg-muted-foreground/30" : "bg-foreground",
                    )}
                  />
                  <span className="flex-1 truncate">{n.title}</span>
                  <span className="text-[10px] text-muted-foreground/70 shrink-0">
                    {relTime(n.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Link>
  );
}
