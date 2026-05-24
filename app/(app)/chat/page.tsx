"use client";

// /chat — Owllet 대화 화면 스타일 (3-pane).
// 좌측 second-column: 검색 + 에이전트 6명 selector (탭) + 세션 목록 placeholder.
// 메인: 빈 상태에 큰 인사 + 제안 chip grid, 대화 중에는 메시지 + 하단 둥근 input.

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AgentBadge, AgentAvatar } from "@/components/agent-badge";
import {
  ArrowUp,
  CheckCircle2,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Wrench,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { streamSseFetch } from "@/lib/sse/client";

const AGENTS: Array<{ id: string; name: string; role: string }> = [
  { id: "main", name: "혜원", role: "메인 비서 · CSO · 토론 진행" },
  { id: "assistant", name: "민지", role: "보조 · CTO · 반대 시각" },
  { id: "daily", name: "하영", role: "데일리 리포터" },
  { id: "diary", name: "서연", role: "일기 어시스턴트" },
  { id: "memo", name: "다솜", role: "메모 어시스턴트" },
  { id: "calendar", name: "수민", role: "캘린더 어시스턴트" },
];

const SUGGESTIONS: Record<string, string[]> = {
  main: ["최근 AI 시장 동향", "v3 방향성 팀 토론 시작", "팀 헬스 점검"],
  assistant: ["오늘 인사", "혜원과 다른 시각", "내 패턴 분석"],
  daily: ["어제 뭐 했어?", "오늘 todo 정리", "어제 회고"],
  diary: ["지난주 일기 검색", "이번 달 기억 정리", "오늘 일기 도와줘"],
  memo: ["중요 todo 정리", "이전 메모 검색", "이번주 메모"],
  calendar: ["내일 오후 3시 치과", "월세 정기 등록", "이번 주 일정"],
};

const VALID_AGENT_IDS = new Set(AGENTS.map((a) => a.id));

type ToolEvent = {
  id: string;
  name: string;
  status: "running" | "ok" | "error";
  error?: string;
};

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  agentEnglishName?: string | null;
  toolEvents?: ToolEvent[];
  meta?: { durationMs: number; costUsd: number; iterations: number };
};

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentParam = searchParams.get("agent");
  const sessionParam = searchParams.get("session");
  const currentAgent =
    agentParam && VALID_AGENT_IDS.has(agentParam) ? agentParam : "main";
  const currentMeta = AGENTS.find((a) => a.id === currentAgent)!;

  const [sessionId, setSessionId] = useState<string | null>(sessionParam);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSessionId(sessionParam);
    setMessages([]);
    setError(null);
  }, [agentParam, sessionParam]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetch(`/api/chat/sessions/${sessionId}/messages`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(`세션 로드 실패: ${data.error}`);
          return;
        }
        setMessages(
          (data.messages ?? []).map(
            (m: {
              id: string;
              role: string;
              content: string;
              agentEnglishName: string | null;
            }) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              agentEnglishName: m.agentEnglishName,
            }),
          ),
        );
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            `세션 로드 실패: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  function selectAgent(agentId: string) {
    router.replace(`/chat?agent=${agentId}`);
  }

  async function send(text?: string) {
    const t = (text ?? input).trim();
    if (!t || streaming) return;
    setInput("");
    setError(null);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: t },
      {
        role: "assistant",
        content: "",
        agentEnglishName: currentAgent,
        toolEvents: [],
      },
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

    await streamSseFetch(
      "/api/chat",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          message: t,
          agent: currentAgent,
        }),
      },
      {
        onEvent: (name, data) => {
          if (name === "session" && data && typeof data === "object") {
            const d = data as { sessionId?: string };
            if (!sessionId && d.sessionId) {
              setSessionId(d.sessionId);
              router.replace(
                `/chat?agent=${currentAgent}&session=${d.sessionId}`,
              );
            }
          } else if (name === "delta" && data && typeof data === "object") {
            const d = data as { text?: string };
            if (d.text) {
              updateAssistant((m) => ({ ...m, content: m.content + d.text }));
            }
          } else if (name === "tool_call" && data && typeof data === "object") {
            const d = data as { id: string; name: string };
            updateAssistant((m) => ({
              ...m,
              toolEvents: [
                ...(m.toolEvents ?? []),
                { id: d.id, name: d.name, status: "running" },
              ],
            }));
          } else if (
            name === "tool_result" &&
            data &&
            typeof data === "object"
          ) {
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
              assistantMessageId?: string;
            };
            updateAssistant((m) => ({
              ...m,
              id: d.assistantMessageId ?? m.id,
              content:
                d.fullText && d.fullText.length > 0 ? d.fullText : m.content,
              meta: {
                durationMs: d.durationMs ?? 0,
                costUsd: d.costUsd ?? 0,
                iterations: d.iterations ?? 1,
              },
            }));
          } else if (name === "error" && data && typeof data === "object") {
            const d = data as { message?: string };
            setError(
              `${currentMeta.name} 응답 실패: ${d.message ?? "unknown"}`,
            );
          }
        },
        onError: (e) => {
          setError(
            `${currentMeta.name} 호출 실패: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        },
      },
    );

    setStreaming(false);
  }

  const isEmpty = messages.length === 0 && !streaming;

  return (
    <div className="flex h-[calc(100svh-3.5rem)] w-full">
      {/* 좌측 second-column — 검색 + 에이전트 + 새 대화 */}
      <aside className="hidden lg:flex w-72 border-r border-border bg-sidebar flex-col shrink-0">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-base font-bold tracking-tight">대화</h2>
          <button
            type="button"
            onClick={() => {
              setSessionId(null);
              setMessages([]);
              router.replace(`/chat?agent=${currentAgent}`);
            }}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted text-muted-foreground"
            aria-label="새 대화"
            title="새 대화"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4">
          <div className="flex items-center gap-2 rounded-full bg-muted/60 px-3.5 h-9 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            <input
              type="text"
              placeholder="검색"
              className="flex-1 bg-transparent focus:outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        <div className="mt-4 px-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold mb-2">
            에이전트
          </div>
          <ul className="flex flex-col gap-1">
            {AGENTS.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => selectAgent(a.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-2xl px-2 py-2 text-left text-sm transition",
                    currentAgent === a.id
                      ? "bg-foreground text-background"
                      : "hover:bg-muted text-foreground",
                  )}
                >
                  <AgentAvatar englishName={a.id} size="sm" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium">{a.name}</span>
                    <span
                      className={cn(
                        "text-[10px] truncate",
                        currentAgent === a.id
                          ? "text-background/60"
                          : "text-muted-foreground",
                      )}
                    >
                      {a.role}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* 메인 — 대화 영역 */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* 상단 에이전트 표시 (모바일에서는 selector 노출) */}
        <header className="flex items-center gap-3 p-5 border-b border-border">
          <AgentBadge englishName={currentAgent} size="lg" showName={false} />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold tracking-tight">
              {currentMeta.name}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {currentMeta.role}
            </p>
          </div>

          {/* 모바일 selector */}
          <select
            value={currentAgent}
            onChange={(e) => selectAgent(e.target.value)}
            className="lg:hidden rounded-full border border-border bg-background px-3 h-9 text-sm"
          >
            {AGENTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </header>

        {error && (
          <div
            role="alert"
            className="m-4 border border-destructive/30 bg-destructive/5 text-destructive rounded-2xl p-3 text-sm"
          >
            {error}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="h-full flex flex-col items-center justify-center px-6 gap-6">
              <AgentAvatar englishName={currentAgent} size="xl" />
              <div className="text-center flex flex-col gap-1.5">
                <h2 className="text-2xl font-bold tracking-tight">
                  무엇을 도와드릴까요?
                </h2>
                <p className="text-sm text-muted-foreground">
                  무엇이든 물어보세요. 아래 제안을 선택할 수도 있어요.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                {(SUGGESTIONS[currentAgent] ?? []).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full px-6 py-6 flex flex-col gap-4">
              {messages.map((m, i) => (
                <div
                  key={m.id ?? i}
                  className={cn(
                    "flex gap-3",
                    m.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {m.role === "assistant" && (
                    <AgentBadge
                      englishName={m.agentEnglishName ?? currentAgent}
                      size="sm"
                      showName={false}
                    />
                  )}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-3xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed",
                      m.role === "user"
                        ? "bg-foreground text-background"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {m.content ||
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
                              "inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border",
                              ev.status === "running" &&
                                "bg-background/40 text-muted-foreground border-border",
                              ev.status === "ok" &&
                                "bg-[var(--pastel-mint)] text-emerald-900 border-transparent",
                              ev.status === "error" &&
                                "bg-destructive/10 text-destructive border-destructive/20",
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
                      <div className="mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground/80 font-mono">
                        {m.meta.iterations}회 · {m.meta.durationMs}ms · $
                        {m.meta.costUsd.toFixed(6)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 입력 — Owllet 큰 둥근 input + 좌측 첨부 + 우측 send */}
        <div className="px-6 pb-6 pt-2">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2 rounded-3xl border border-border bg-card px-4 py-2 shadow-sm">
              <button
                type="button"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted text-muted-foreground"
                aria-label="첨부 (미구현)"
                disabled
              >
                <Paperclip className="h-4 w-4" />
              </button>
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
                placeholder={`${currentMeta.name}에게 메시지 보내기…`}
                disabled={streaming}
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/60"
              />
              <button
                type="button"
                onClick={() => send()}
                disabled={streaming || !input.trim()}
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-foreground text-background disabled:opacity-30 hover:opacity-90 transition"
                aria-label="보내기"
              >
                {streaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatContent />
    </Suspense>
  );
}
