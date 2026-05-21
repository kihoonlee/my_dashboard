"use client";

// /discussions — 토론 리스트. 사용자에게는 결과 리포트만 보임 (진행 중은 spinner).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

type Discussion = {
  id: string;
  topic: string;
  status: "running" | "done" | "failed";
  summaryMd: string | null;
  roundsRun: number;
  startedAt: string;
  completedAt: string | null;
};

export default function DiscussionsPage() {
  const [items, setItems] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/discussions", { cache: "no-store" });
        const data = (await res.json()) as { items: Discussion[] };
        if (!cancelled) setItems(data.items ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 15_000); // 진행 중 토론 폴링
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold tracking-tight mb-1">토론</h1>
      <p className="text-xs text-muted-foreground mb-4">
        메인 비서(지원)에게 토론을 요청하면 여기에 결과 리포트가 도착합니다.
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
          토론 없음.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((d) => (
            <li key={d.id}>
              <Link
                href={`/discussions/${d.id}`}
                className="block rounded-lg border border-border bg-card p-3 hover:bg-muted/40 transition"
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="font-medium text-sm truncate">{d.topic}</span>
                  <StatusBadge status={d.status} />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {d.summaryMd
                    ? d.summaryMd.slice(0, 200)
                    : d.status === "running"
                      ? "진행 중..."
                      : "(요약 없음)"}
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
                  라운드 {d.roundsRun} ·{" "}
                  {new Date(d.startedAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "running"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
      : status === "done"
        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
        : "bg-destructive/10 text-destructive border-destructive/30";
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${cls}`}
    >
      {status === "running" ? "진행중" : status === "done" ? "완료" : "실패"}
    </span>
  );
}
