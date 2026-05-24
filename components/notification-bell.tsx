"use client";

// 헤더 종 배지 — unread count 폴링 (60초 주기).
// 클릭 시 /notifications 페이지로 이동.
// 추후 Supabase Realtime 구독으로 push 갱신 가능.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchUnread() {
      try {
        const res = await fetch("/api/notifications?unread=true&limit=1", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: number };
        if (!cancelled) setUnread(data.unread ?? 0);
      } catch {
        // 무시 — 폴링은 best-effort
      }
    }
    fetchUnread();
    const id = setInterval(fetchUnread, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      aria-label={`알림 ${unread}개 안 읽음`}
      title={`알림 ${unread}개 안 읽음`}
      className="relative inline-flex items-center justify-center min-h-9 min-w-9 rounded-md hover:bg-muted text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Bell className="h-4 w-4" aria-hidden />
      {unread > 0 && (
        <span
          className={cn(
            "absolute top-1 right-1 inline-flex items-center justify-center rounded-full bg-destructive text-white text-[10px] font-medium leading-none",
            unread > 9 ? "h-4 w-5 px-1" : "h-4 w-4",
          )}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
