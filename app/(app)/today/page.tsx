"use client";

// /today — 하영 채팅 + 오늘 Todo 그리드 + 오늘 캘린더(Phase 2B).
// 기능:
//   - 메시지 입력 → POST /api/agents/hayoung/invoke → 응답 표시
//   - 응답에서 새 Todo/Calendar 도구 호출 가능성 → 매번 새로고침
//   - "캘린더 동기화" 버튼 → POST /api/sync/calendar → calendar_events_cache 갱신

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { AgentBadge } from "@/components/agent-badge";
import {
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  Loader2,
  RefreshCw,
  Square,
  Wrench,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { streamSseFetch } from "@/lib/sse/client";

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
  calendarSummary: string | null;
  calendarColorHex: string | null;
};

type ToolEvent = {
  id: string;
  name: string;
  status: "running" | "ok" | "error";
  error?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  toolEvents?: ToolEvent[];
  meta?: {
    iterations: number;
    durationMs: number;
    costUsd: number;
  };
};

const PRIORITY_COLOR: Record<string, string> = {
  P0: "bg-destructive/10 text-destructive border-destructive/30",
  P1: "bg-primary/10 text-primary border-primary/30",
  P2: "bg-muted text-muted-foreground border-border",
  P3: "bg-muted/50 text-muted-foreground/70 border-border",
};

// 자동 동기화 stale 임계 — 마지막 sync로부터 이 시간 이상 지났으면 페이지 진입 시 자동 호출.
// Google Calendar API 쿼터/비용 부담을 피하면서도, 진입할 때 신선한 데이터를 보장하는 균형점.
const AUTO_SYNC_STALE_MS = 5 * 60 * 1000;

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
  const [lastSync, setLastSync] = useState<{ at: string; count: number } | null>(
    null,
  );
  const [justSynced, setJustSynced] = useState<{ count: number } | null>(null);
  const [calendarReauth, setCalendarReauth] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);
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

  async function fetchAgenda(): Promise<{
    events: AgendaEvent[];
    lastSync: { at: string; count: number } | null;
  } | null> {
    setLoadingEvents(true);
    try {
      const res = await fetch("/api/calendar/agenda?days=1", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as {
        events: AgendaEvent[];
        lastSync: { at: string; count: number } | null;
      };
      setEvents(data.events);
      setLastSync(data.lastSync ?? null);
      return data;
    } catch (e) {
      setError(
        `캘린더 캐시 조회 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    } finally {
      setLoadingEvents(false);
    }
  }

  async function syncCalendar() {
    if (syncing) return;
    setSyncing(true);
    setCalendarReauth(null);
    setJustSynced(null);
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
      setJustSynced({ count: data.upserts ?? 0 });
      await fetchAgenda();
      // 4초 후 토스트성 메시지 자동 정리
      setTimeout(() => setJustSynced(null), 4000);
    } catch (e) {
      setError(
        `캘린더 동기화 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSyncing(false);
    }
  }

  // 페이지 mount 시 1회만 자동 sync 결정 (StrictMode 이중 실행 / 의존성 변경 방어)
  const autoSyncDecidedRef = useRef(false);

  useEffect(() => {
    void (async () => {
      void fetchTodos();
      const data = await fetchAgenda();
      if (autoSyncDecidedRef.current) return;
      autoSyncDecidedRef.current = true;
      if (!data) return;
      const stale =
        !data.lastSync ||
        Date.now() - new Date(data.lastSync.at).getTime() > AUTO_SYNC_STALE_MS;
      if (stale) {
        // 자동 동기화. 권한 만료(412)면 syncCalendar 내부에서 calendarReauth 메시지 셋.
        void syncCalendar();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "assistant", text: "", toolEvents: [] },
    ]);
    setStreaming(true);

    function updateAssistant(updater: (m: ChatMessage) => ChatMessage) {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev.length - 1;
        const next = [...prev];
        next[last] = updater(next[last]);
        return next;
      });
    }

    let toolUsed = false;
    await streamSseFetch(
      "/api/agents/hayoung/invoke",
      {
        method: "POST",
        body: JSON.stringify({ message: text, trigger: "today_chat" }),
      },
      {
        onEvent: (name, data) => {
          if (name === "delta" && data && typeof data === "object") {
            const d = data as { text?: string };
            if (d.text) updateAssistant((m) => ({ ...m, text: m.text + d.text }));
          } else if (name === "tool_call" && data && typeof data === "object") {
            const d = data as { id: string; name: string };
            toolUsed = true;
            updateAssistant((m) => ({
              ...m,
              toolEvents: [
                ...(m.toolEvents ?? []),
                { id: d.id, name: d.name, status: "running" },
              ],
            }));
          } else if (name === "tool_result" && data && typeof data === "object") {
            const d = data as { id: string; ok: boolean; error?: string };
            updateAssistant((m) => ({
              ...m,
              toolEvents: (m.toolEvents ?? []).map((ev) =>
                ev.id === d.id
                  ? { ...ev, status: d.ok ? "ok" : "error", error: d.error }
                  : ev,
              ),
            }));
          } else if (name === "done" && data && typeof data === "object") {
            const d = data as {
              fullText?: string;
              durationMs?: number;
              costUsd?: number;
              iterations?: number;
            };
            updateAssistant((m) => ({
              ...m,
              text: d.fullText && d.fullText.length > 0 ? d.fullText : m.text,
              meta: {
                durationMs: d.durationMs ?? 0,
                costUsd: d.costUsd ?? 0,
                iterations: d.iterations ?? 1,
              },
            }));
          } else if (name === "error" && data && typeof data === "object") {
            const d = data as { message?: string };
            setError(`하영 호출 실패: ${d.message ?? "unknown"}`);
          }
        },
        onError: (e) => {
          setError(`하영 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
        },
      },
    );

    setStreaming(false);
    // 도구가 호출됐다면 Todo / 캘린더가 변경됐을 가능성 → 새로고침
    if (toolUsed) {
      await Promise.all([fetchTodos(), fetchAgenda()]);
    }
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
            {lastSync && (
              <span className="text-[11px] text-muted-foreground font-mono">
                마지막 동기화{" "}
                {new Date(lastSync.at).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {lastSync.count}건
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

        {justSynced && (
          <div className="text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
            동기화 완료 — 오늘 ~ +7일 윈도우에서 {justSynced.count}건 가져옴
          </div>
        )}

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
            {lastSync
              ? "오늘은 일정이 없습니다."
              : "아직 동기화하지 않았습니다. 위 '동기화' 버튼을 눌러 가져오세요."}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border border border-border rounded-xl overflow-hidden">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex items-start gap-3 px-4 py-3 bg-card"
              >
                <div className="flex items-start gap-2 w-28 shrink-0 pt-0.5">
                  <span
                    aria-hidden
                    title={ev.calendarSummary ?? ""}
                    className="mt-1 size-2 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        ev.calendarColorHex ?? "var(--muted-foreground)",
                    }}
                  />
                  <div className="font-mono text-xs text-muted-foreground">
                    {formatEventTime(ev.startAt, ev.endAt)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{ev.title}</div>
                  {ev.calendarSummary && (
                    <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                      {ev.calendarSummary}
                    </div>
                  )}
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
                {m.role === "assistant" && (
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
                  {m.text ||
                    (m.role === "assistant" &&
                    streaming &&
                    i === messages.length - 1 ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground/80">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        생각 중...
                      </span>
                    ) : null)}
                  {m.toolEvents && m.toolEvents.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.toolEvents.map((ev) => (
                        <span
                          key={ev.id}
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border",
                            ev.status === "running" &&
                              "bg-muted-foreground/10 text-muted-foreground border-border",
                            ev.status === "ok" &&
                              "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
                            ev.status === "error" &&
                              "bg-destructive/10 text-destructive border-destructive/30",
                          )}
                          title={ev.error ?? ev.name}
                        >
                          {ev.status === "running" ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : ev.status === "ok" ? (
                            <CheckCircle2 className="h-2.5 w-2.5" />
                          ) : (
                            <XCircle className="h-2.5 w-2.5" />
                          )}
                          <Wrench className="h-2.5 w-2.5" />
                          {ev.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.meta && (
                    <div className="mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground font-mono">
                      {m.meta.iterations}회 · {m.meta.durationMs}ms · $
                      {m.meta.costUsd.toFixed(6)}
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
            disabled={streaming}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <Button onClick={send} disabled={streaming || !input.trim()}>
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : "보내기"}
          </Button>
        </div>
      </section>
    </div>
  );
}
