"use client";

// 홈 대시보드 4개 위젯 wrapper — /api/home/dashboard 한 번 호출 후 분배.

import { useEffect, useState } from "react";
import { NotificationsWidget } from "./notifications-widget";
import { TodoWidget } from "./todo-widget";
import { CalendarWidget } from "./calendar-widget";
import { AgentActivityWidget } from "./agent-activity-widget";
import type { DashboardData } from "./types";

export function DashboardWidgets() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/home/dashboard", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<DashboardData>;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <NotificationsWidget data={data?.notifications ?? null} loading={loading} />
      <TodoWidget data={data?.todos ?? null} loading={loading} />
      <CalendarWidget data={data?.calendar ?? null} loading={loading} />
      <AgentActivityWidget data={data?.agents ?? null} loading={loading} />
    </section>
  );
}
