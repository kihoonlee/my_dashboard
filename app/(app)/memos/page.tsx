"use client";

// /memos — 메모 리스트 + 새 메모 작성 + 노트(메모 에이전트) 사이드패널.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AgentSidepanel } from "@/components/agent-sidepanel";
import { Loader2, PlusCircle } from "lucide-react";

type Memo = {
  id: string;
  entryDate: string;
  title: string | null;
  bodyMd: string;
  pinned: boolean;
  updatedAt: string;
};

export default function MemosPage() {
  const [items, setItems] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "archived">("active");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/memos?archived=${filter === "archived" ? "true" : "false"}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { items: Memo[] };
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function createNew() {
    setCreating(true);
    try {
      const res = await fetch("/api/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyMd: "" }),
      });
      const data = (await res.json()) as { id: string };
      window.location.href = `/memos/${data.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex h-[calc(100svh-3.5rem)]">
      <main className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold tracking-tight">메모</h1>
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as "active" | "archived")
              }
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="active">활성</option>
              <option value="archived">보관됨</option>
            </select>
            <Button onClick={createNew} disabled={creating}>
              <PlusCircle className="h-4 w-4" /> 새 메모
            </Button>
          </div>
        </div>

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
            메모 없음.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/memos/${m.id}`}
                  className="block rounded-lg border border-border bg-card p-3 hover:bg-muted/40 transition"
                >
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="font-medium text-sm truncate">
                      {m.title || "(제목 없음)"}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                      {m.entryDate}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {m.bodyMd.slice(0, 200) || "(빈 본문)"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <div className="w-80 shrink-0">
        <AgentSidepanel
          agentEnglishName="memo"
          agentDisplayName="노트"
          helperText="todo / 일기 / 이전 메모 검색 + 메모로 가져오기"
          pageContext="[페이지 컨텍스트] 메모 리스트 페이지."
        />
      </div>
    </div>
  );
}
