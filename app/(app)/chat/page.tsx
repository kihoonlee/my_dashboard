"use client";

// /chat — 멀티 에이전트 채팅 페이지 (SSE 스트리밍).
// URL: ?agent=<englishName> 으로 에이전트 선택, ?session=<id> 로 세션 재진입.
// 좌측 사이드바에 6명 에이전트 선택 카드.

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AgentBadge, AgentAvatar } from "@/components/agent-badge";
import { CheckCircle2, Loader2, Wrench, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { streamSseFetch } from "@/lib/sse/client";

const AGENTS: Array<{ id: string; name: string; role: string }> = [
  { id: "main", name: "지원", role: "메인 비서 · CSO · 토론 진행" },
  { id: "assistant", name: "태오", role: "보조 · CTO · 반대 시각" },
  { id: "daily", name: "새벽", role: "데일리 리포터" },
  { id: "diary", name: "달이", role: "일기 어시스턴트" },
  { id: "memo", name: "노트", role: "메모 어시스턴트" },
  { id: "calendar", name: "시아", role: "캘린더 어시스턴트" },
];

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
  meta?: {
    durationMs: number;
    costUsd: number;
    iterations: number;
  };
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

  // agent 또는 session param 변경 시 messages 리셋
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
          setError(`세션 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
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

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
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
          message: text,
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
            setError(`${currentMeta.name} 응답 실패: ${d.message ?? "unknown"}`);
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

  return (
    <div className="flex h-[calc(100svh-3.5rem)] w-full">
      {/* 좌측 에이전트 selector */}
      <aside className="w-48 border-r border-border bg-sidebar flex flex-col gap-1 p-3 shrink-0">
        <div className="text-xs font-medium tracking-wider uppercase text-muted-foreground px-2 py-1">
          에이전트
        </div>
        {AGENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => selectAgent(a.id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition",
              currentAgent === a.id
                ? "bg-primary/10 text-foreground ring-1 ring-primary/30"
                : "hover:bg-muted text-muted-foreground",
            )}
          >
            <AgentAvatar englishName={a.id} size="sm" />
            <span className="font-medium">{a.name}</span>
          </button>
        ))}
      </aside>

      <div className="flex flex-col flex-1 max-w-3xl mx-auto w-full">
        <header className="flex items-center gap-3 p-6 border-b border-border">
          <AgentBadge englishName={currentAgent} size="lg" showName={false} />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold tracking-tight">
              {currentMeta.name}
            </h1>
            <p className="text-xs text-muted-foreground">{currentMeta.role}</p>
          </div>
          {sessionId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSessionId(null);
                setMessages([]);
                router.replace(`/chat?agent=${currentAgent}`);
              }}
            >
              새 대화
            </Button>
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="m-4 border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
          >
            {error}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 && !streaming ? (
            <div className="text-sm text-muted-foreground text-center py-12 max-w-md mx-auto leading-relaxed">
              {currentAgent === "main"
                ? "지원에게 시장 동향을 묻거나, 팀 토론을 요청해보세요."
                : currentAgent === "assistant"
                  ? "태오에게 메인 의견의 반대 시각을 들어보세요."
                  : `${currentMeta.name}에게 자연어로 무엇이든 물어보세요.`}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
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
                      "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
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

        <div className="p-4 border-t border-border bg-background">
          <div className="flex gap-2">
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
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <Button onClick={send} disabled={streaming || !input.trim()}>
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "보내기"
              )}
            </Button>
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
