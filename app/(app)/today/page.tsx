"use client";

// /today — 하영 채팅 + 오늘 Todo 그리드 + 오늘 캘린더(Phase 2B).
// 기능:
//   - 메시지 입력 → POST /api/agents/hayoung/invoke → 응답 표시
//   - 응답에서 새 Todo/Calendar 도구 호출 가능성 → 매번 새로고침
//   - "캘린더 동기화" 버튼 → POST /api/sync/calendar → calendar_events_cache 갱신

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { AgentBadge } from "@/components/agent-badge";
import { CalendarClock, CheckSquare, Loader2, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/utils";

type Todo = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  createdAt: string;
};

type AgendaEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  attendees: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  syncedAt: string;
};

type ChatMessage = {
  role: "user" | "agent";
  text: string;
  meta?: {
    iterations: number;
    durationMs: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    cacheRead: number;
  };
};

const PRIORITY_COLOR: Record<string, string> = {
  P0: "bg-destructive/10 text-destructive border-destructive/30",
  P1: "bg-primary/10 text-primary border-primary/30",
  P2: "bg-muted text-muted-foreground border-border",
  P3: "bg-muted/50 text-muted-foreground/70 border-border",
};

function formatEventTime(startAt: string, endAt: string): string {
  const s = new Date(startAt);
  const e = new Date(endAt);
  const isAllDay =
    s.getHours() === 0 &&
    s.getMinutes() === 0 &&
    e.getHours() === 0 &&
    e.getMinutes() === 0;
  if (isAllDay) return "종일";
  const fmt = (d: Date) =>
    d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    });
  return `${fmt(s)} – ${fmt(e)}`;
}

export default function TodayPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loadingTodos, setLoadingTodos] = useState<boolean>(true);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [calendarReauth, setCalendarReauth] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function fetchTodos() {
    setLoadingTodos(true);
    try {
      const res = await fetch("/api/todos/today", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { todos: Todo[] };
      setTodos(data.todos);
    } catch (e) {
      setError(`Todo 목록 불러오기 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingTodos(false);
    }
  }

  async function fetchAgenda() {
    setLoadingEvents(true);
    try {
      const res = await fetch("/api/calendar/agenda?days=1", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { events: AgendaEvent[] };
      setEvents(data.events);
      const latest = data.events.reduce<string | null>(
        (acc, ev) => (acc && acc > ev.syncedAt ? acc : ev.syncedAt),
        null,
      );
      setLastSyncedAt(latest);
    } catch (e) {
      setError(
        `캘린더 캐시 조회 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setLoadingEvents(false);
    }
  }

  async function syncCalendar() {
    if (syncing) return;
    setSyncing(true);
    setCalendarReauth(null);
    try {
      const res = await fetch("/api/sync/calendar", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 412) {
        setCalendarReauth(
          data?.message ?? "Google Calendar 권한이 없습니다. 다시 로그인해주세요.",
        );
        return;
      }
      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? `status ${res.status}`);
      }
      await fetchAgenda();
    } catch (e) {
      setError(
        `캘린더 동기화 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    fetchTodos();
    fetchAgenda();
  }, []);

  function send() {
    const text = input.trim();
    if (!text || isPending) return;
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", text }]);

    startTransition(async () => {
      try {
        const res = await fetch("/api/agents/hayoung/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, trigger: "today_chat" }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? `status ${res.status}`);
        }
        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            text: data.text || "(빈 응답)",
            meta: {
              iterations: data.iterations,
              durationMs: data.durationMs,
              costUsd: data.costUsd,
              inputTokens: data.usage?.input_tokens ?? 0,
              outputTokens: data.usage?.output_tokens ?? 0,
              cacheRead: data.usage?.cache_read_input_tokens ?? 0,
            },
          },
        ]);
        // 도구 호출이 있었을 가능성 → Todo + 캘린더 새로고침
        await Promise.all([fetchTodos(), fetchAgenda()]);
      } catch (e) {
        setError(`하영 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  async function toggleComplete(todo: Todo) {
    if (todo.status === "done") return;
    try {
      const res = await fetch(`/api/todos/${todo.id}/complete`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchTodos();
    } catch (e) {
      setError(
        `Todo 완료 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return (
    <div className="flex flex-col gap-8 p-6 max-w-5xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <AgentBadge englishName="hayoung" size="lg" showName={false} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">오늘</h1>
          <p className="text-sm text-muted-foreground">
            하영이 Todo 정리 + 우선순위 + 일정 분석을 도와드립니다.
          </p>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
        >
          {error}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">미완료 Todo</h2>
          <span className="text-xs text-muted-foreground">
            {loadingTodos ? "로딩 중..." : `${todos.length}건`}
          </span>
        </div>
        {todos.length === 0 && !loadingTodos ? (
          <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
            오늘 처리할 Todo가 없습니다. 하영에게 새로 만들어달라고 요청해보세요.
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border border border-border rounded-xl overflow-hidden">
            {todos.map((todo) => (
              <li
                key={todo.id}
                className="flex items-start gap-3 px-4 py-3 bg-card hover:bg-muted/40 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleComplete(todo)}
                  aria-label="완료 처리"
                  className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {todo.status === "done" ? (
                    <CheckSquare className="h-5 w-5 text-primary" />
                  ) : (
                    <Square className="h-5 w-5" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-[10px] font-mono px-1.5 py-0.5 rounded border",
                        PRIORITY_COLOR[todo.priority] ?? PRIORITY_COLOR.P2,
                      )}
                    >
                      {todo.priority}
                    </span>
                    <span
                      className={cn(
                        "font-medium text-sm truncate",
                        todo.status === "done" &&
                          "line-through text-muted-foreground",
                      )}
                    >
                      {todo.title}
                    </span>
                  </div>
                  {todo.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {todo.description}
                    </p>
                  )}
                  {todo.dueDate && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      마감 {todo.dueDate}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">오늘 캘린더</h2>
          <div className="flex items-center gap-3">
            {lastSyncedAt && (
              <span className="text-[11px] text-muted-foreground font-mono">
                마지막 동기화{" "}
                {new Date(lastSyncedAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={syncCalendar}
              disabled={syncing}
              className="gap-2"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              동기화
            </Button>
          </div>
        </div>

        {calendarReauth && (
          <div
            role="alert"
            className="border border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-300 rounded-lg p-3 text-sm flex items-start gap-3 justify-between"
          >
            <div>
              <div className="font-medium">캘린더 권한이 만료되었습니다.</div>
              <div className="text-xs opacity-80 mt-1">{calendarReauth}</div>
            </div>
            <Link
              href="/auth/login?next=/today"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              다시 로그인
            </Link>
          </div>
        )}

        {loadingEvents ? (
          <div className="text-xs text-muted-foreground">캐시 로딩 중...</div>
        ) : events.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <CalendarClock className="h-5 w-5 opacity-60" />
            오늘 일정이 없거나, 아직 동기화하지 않았습니다.
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border border border-border rounded-xl overflow-hidden">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex items-start gap-3 px-4 py-3 bg-card"
              >
                <div className="font-mono text-xs text-muted-foreground w-24 shrink-0 pt-0.5">
                  {formatEventTime(ev.startAt, ev.endAt)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{ev.title}</div>
                  {ev.location && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {ev.location}
                    </div>
                  )}
                  {ev.attendees.length > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {ev.attendees.length}명 참석
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">하영과 대화</h2>
        <div className="flex flex-col gap-3 min-h-[200px]">
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              예: &quot;내일까지 분기 보고서 초안 만들기 추가해줘&quot; / &quot;오늘 뭐 해야
              해?&quot;
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-3",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {m.role === "agent" && (
                  <AgentBadge englishName="hayoung" size="sm" showName={false} />
                )}
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {m.text}
                  {m.meta && (
                    <div className="mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground font-mono">
                      {m.meta.iterations}회 · {m.meta.durationMs}ms · $
                      {m.meta.costUsd.toFixed(6)} · in {m.meta.inputTokens} /
                      out {m.meta.outputTokens}
                      {m.meta.cacheRead > 0 && ` · cached ${m.meta.cacheRead}`}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="하영에게 물어보거나 Todo를 만들어달라고 하세요…"
            disabled={isPending}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <Button onClick={send} disabled={isPending || !input.trim()}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "보내기"}
          </Button>
        </div>
      </section>
    </div>
  );
}
