"use client";

// /chat — 민지 메인 채팅 페이지.
// 단일 세션 (URL ?session=ID로 재진입 가능). Phase 2 시점은 simple linear chat,
// 세션 사이드바·이전 세션 검색은 추후 (Phase 6 Agent 관리 통합).

import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AgentBadge } from "@/components/agent-badge";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  agentEnglishName?: string | null;
  meta?: {
    durationMs: number;
    costUsd: number;
    iterations: number;
  };
};

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session");
  const [sessionId, setSessionId] = useState<string | null>(sessionParam);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 기존 세션 진입 시 메시지 로드
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

  // 메시지 추가 시 자동 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isPending]);

  function send() {
    const text = input.trim();
    if (!text || isPending) return;
    setInput("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
    ]);

    startTransition(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message: text }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `status ${res.status}`);

        // 첫 호출이면 sessionId 받아서 URL 갱신
        if (!sessionId && data.sessionId) {
          setSessionId(data.sessionId);
          router.replace(`/chat?session=${data.sessionId}`);
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.text || "(빈 응답)",
            agentEnglishName: "minji",
            meta: {
              durationMs: data.durationMs,
              costUsd: data.costUsd ?? 0,
              iterations: data.iterations ?? 1,
            },
          },
        ]);
      } catch (e) {
        setError(`민지 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <div className="flex flex-col h-[calc(100svh-3.5rem)] max-w-3xl mx-auto w-full">
      <header className="flex items-center gap-3 p-6 border-b border-border">
        <AgentBadge englishName="minji" size="lg" showName={false} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight">민지</h1>
          <p className="text-xs text-muted-foreground">
            메타 챗봇 — 다른 Agent에 위임해 답변을 종합합니다.
          </p>
        </div>
        {sessionId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSessionId(null);
              setMessages([]);
              router.replace("/chat");
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
        {messages.length === 0 && !isPending ? (
          <div className="text-sm text-muted-foreground text-center py-12 max-w-md mx-auto leading-relaxed">
            예시:
            <br />
            <span className="text-xs">
              &quot;오늘 뭐 해야 해?&quot; · &quot;내일 회의 준비하기 추가&quot; ·
              &quot;전반적으로 일정 어떤지 종합해서 알려줘&quot;
            </span>
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
                    englishName={m.agentEnglishName ?? "minji"}
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
                  {m.content}
                  {m.meta && (
                    <div className="mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground/80 font-mono">
                      {m.meta.iterations}회 · {m.meta.durationMs}ms · $
                      {m.meta.costUsd.toFixed(6)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isPending && (
              <div className="flex gap-3 justify-start">
                <AgentBadge englishName="minji" size="sm" showName={false} />
                <div className="bg-muted text-muted-foreground rounded-2xl px-4 py-2.5 text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  생각 중...
                </div>
              </div>
            )}
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
            placeholder="민지에게 무엇이든 물어보세요…"
            disabled={isPending}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <Button onClick={send} disabled={isPending || !input.trim()}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "보내기"}
          </Button>
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
