"use client";

// /todos — 중요/기한/태그 필터, 보관/삭제. 사이드패널은 없음 (메모/일기 에이전트가 todo 조회 가능).

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Circle,
  Loader2,
  PlusCircle,
  Star,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Todo = {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  isImportant: boolean;
  tag: string | null;
  archived: boolean;
  completedAt: string | null;
  createdAt: string;
};

type Filter = "all" | "today" | "important" | "overdue" | "archived" | "completed";

export default function TodosPage() {
  const [items, setItems] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 새 todo 입력 폼
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isImportant, setIsImportant] = useState(false);
  const [tag, setTag] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/todos?filter=${filter}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { items: Todo[] };
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function createTodo() {
    const t = title.trim();
    if (!t) return;
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          dueDate: dueDate || undefined,
          isImportant,
          tag: tag.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`create ${res.status}`);
      setTitle("");
      setDueDate("");
      setIsImportant(false);
      setTag("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  type PatchInput = {
    title?: string;
    notes?: string | null;
    dueDate?: string | null;
    isImportant?: boolean;
    tag?: string | null;
    archived?: boolean;
    completed?: boolean;
  };

  async function patch(id: string, update: PatchInput) {
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!res.ok) throw new Error(`patch ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string) {
    if (!confirm("삭제할까요?")) return;
    try {
      const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`delete ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold tracking-tight mb-4">할일</h1>

      {error && (
        <div className="mb-4 border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* 새 todo */}
      <div className="rounded-xl border border-border bg-card p-4 mb-4">
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createTodo();
              }
            }}
            placeholder="새 할일…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1"
            />
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="태그"
              className="rounded-lg border border-border bg-background px-2 py-1 w-28"
            />
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isImportant}
                onChange={(e) => setIsImportant(e.target.checked)}
              />
              <span>중요</span>
            </label>
            <Button size="sm" onClick={createTodo} disabled={!title.trim()}>
              <PlusCircle className="h-3.5 w-3.5" /> 추가
            </Button>
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-1.5 mb-3 text-xs">
        {(
          [
            ["all", "전체"],
            ["today", "오늘"],
            ["important", "중요"],
            ["overdue", "지남"],
            ["completed", "완료"],
            ["archived", "보관"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              "rounded-full border px-3 py-1 transition",
              filter === k
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          항목 없음.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((t) => (
            <li
              key={t.id}
              className="flex items-start gap-2 rounded-lg border border-border bg-card p-3"
            >
              <button
                type="button"
                onClick={() => patch(t.id, { completed: !t.completedAt })}
                className="mt-0.5 text-muted-foreground hover:text-primary"
                aria-label={t.completedAt ? "완료 취소" : "완료 처리"}
              >
                {t.completedAt ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    "text-sm font-medium",
                    t.completedAt && "line-through text-muted-foreground",
                  )}
                >
                  {t.title}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                  {t.isImportant && (
                    <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                      <Star className="h-3 w-3 fill-current" /> 중요
                    </span>
                  )}
                  {t.dueDate && <span className="font-mono">~{t.dueDate}</span>}
                  {t.tag && (
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      #{t.tag}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => patch(t.id, { isImportant: !t.isImportant })}
                  className="text-muted-foreground hover:text-amber-500 p-1"
                  aria-label="중요 토글"
                >
                  <Star
                    className={cn(
                      "h-3.5 w-3.5",
                      t.isImportant && "fill-current text-amber-500",
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => patch(t.id, { archived: !t.archived })}
                  className="text-muted-foreground hover:text-foreground p-1"
                  aria-label={t.archived ? "복원" : "보관"}
                >
                  {t.archived ? (
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  ) : (
                    <Archive className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="text-muted-foreground hover:text-destructive p-1"
                  aria-label="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
