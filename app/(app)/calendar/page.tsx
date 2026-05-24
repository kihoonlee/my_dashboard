"use client";

// /calendar — 캘린더 이벤트 리스트(7일) + 수민 사이드패널.
// MVP는 시각화 없이 list 형태. 수민에게 자연어로 등록 요청.

import { useCallback, useEffect, useState } from "react";
import { AgentSidepanel } from "@/components/agent-sidepanel";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Event = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  calendarSummary: string | null;
  calendarColorHex: string | null;
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(d: string, n: number): string {
  const [y, m, dd] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd + n));
  return dt.toISOString().slice(0, 10);
}

export default function CalendarPage() {
  const [items, setItems] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = isoToday();
  const weekEnd = addDays(today, 7);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/calendar/agenda?from=${today}&to=${weekEnd}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `status ${res.status}`);
      }
      const data = (await res.json()) as { items: Event[] };
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [today, weekEnd]);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/calendar", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `sync ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  // 날짜별 그룹
  const byDate: Record<string, Event[]> = {};
  for (const ev of items) {
    const d = ev.startAt.slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(ev);
  }
  const dates = Object.keys(byDate).sort();

  return (
    <div className="flex h-[calc(100svh-3.5rem)]">
      <main className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold tracking-tight">캘린더</h1>
          <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            동기화
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          {today} ~ {weekEnd} (Google Calendar 캐시)
        </p>

        {error && (
          <div className="mb-4 border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            앞으로 7일 일정 없음.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {dates.map((d) => (
              <div key={d}>
                <div className="text-xs font-medium text-muted-foreground mb-1.5 font-mono">
                  {d}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {byDate[d].map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded-2xl border border-border bg-card p-2.5 flex items-center gap-3"
                    >
                      <span
                        className="w-1.5 self-stretch rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            ev.calendarColorHex ?? "var(--muted-foreground)",
                        }}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {ev.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {formatTime(ev.startAt)} – {formatTime(ev.endAt)}
                          {ev.location ? ` · ${ev.location}` : ""}
                          {ev.calendarSummary
                            ? ` · ${ev.calendarSummary}`
                            : ""}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </main>

      <div className="w-80 shrink-0">
        <AgentSidepanel
          agentEnglishName="calendar"
          agentDisplayName="수민"
          helperText="자연어 일정 등록 + 정기 일정 + 사전 알림"
          pageContext={`[페이지 컨텍스트] 캘린더 페이지. 표시 범위: ${today} ~ ${weekEnd}. 등록된 이벤트 수: ${items.length}.`}
        />
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}
