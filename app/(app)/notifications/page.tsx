"use client";

// /notifications — 알림 전체 리스트 + 읽음/안읽음 토글.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Notif = {
  id: string;
  kind: string;
  title: string;
  bodyMd: string;
  payloadJson: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  daily_report: "데일리 리포트",
  agent_alert: "에이전트 알림",
  discussion_result: "토론 결과",
  calendar_reminder: "캘린더 알림",
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications?limit=100", {
        cache: "no-store",
      });
      const data = (await res.json()) as { items: Notif[]; unread: number };
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleRead(id: string, read: boolean) {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], read }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function markAllRead() {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, read: true }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold tracking-tight">알림</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={markAllRead}
          disabled={unread === 0}
        >
          모두 읽음으로
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">안 읽은 알림 {unread}개</p>

      {error && (
        <div className="mb-4 border border-destructive/30 bg-destructive/5 text-destructive rounded-2xl p-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          알림 없음.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={cn(
                "rounded-2xl border p-3.5",
                n.readAt
                  ? "border-border bg-card"
                  : "border-foreground/20 bg-card shadow-sm",
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {KIND_LABEL[n.kind] ?? n.kind}
                  </span>
                  <span className="font-medium text-sm">{n.title}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(n.createdAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleRead(n.id, !n.readAt)}
                    className="text-muted-foreground hover:text-foreground p-1"
                    aria-label={n.readAt ? "안읽음 처리" : "읽음 처리"}
                  >
                    {n.readAt ? (
                      <BellOff className="h-3.5 w-3.5" />
                    ) : (
                      <Bell className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              {n.bodyMd && (
                <div className="text-xs prose prose-sm dark:prose-invert max-w-none">
                  <Markdown>{n.bodyMd}</Markdown>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
