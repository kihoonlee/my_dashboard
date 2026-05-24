"use client";

// 도메인 페이지(/diary, /memos, /calendar) 우측에 부착되는 에이전트 사이드패널.
// /api/agents/{englishName}/invoke 를 SSE 모드로 직접 호출.
// 단발성 대화 — chat_messages에 영속화 안 함 (chat 페이지 사용).
//
// onProposal — 도구 결과로 받은 propose_*_block / propose_memo_block payload를 부모에게 전달.
// 부모가 "본문에 추가" 버튼을 띄워서 사용자 수락 시 본문에 삽입.

import { useRef, useState } from "react";
import { AgentBadge } from "@/components/agent-badge";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { streamSseFetch } from "@/lib/sse/client";

type Message = { role: "user" | "assistant"; content: string };

export type Proposal = {
  content: string;
  reason?: string;
  source: "diary" | "memo";
};

export function AgentSidepanel(props: {
  agentEnglishName: "diary" | "memo" | "calendar";
  agentDisplayName: string;
  helperText?: string;
  /** 페이지 컨텍스트를 system prompt 뒤에 덧붙이고 싶을 때 (예: "현재 작성중 일기 날짜: 2026-05-21") */
  pageContext?: string;
  onProposal?: (proposal: Proposal) => void;
}) {
  const { agentEnglishName, agentDisplayName, helperText, pageContext } = props;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);

    const enrichedMessage = pageContext
      ? `${pageContext}\n\n사용자: ${text}`
      : text;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setStreaming(true);

    function updateAssistant(updater: (m: Message) => Message) {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev.length - 1;
        const next = [...prev];
        next[last] = updater(next[last]);
        return next;
      });
    }

    await streamSseFetch(
      `/api/agents/${agentEnglishName}/invoke`,
      {
        method: "POST",
        body: JSON.stringify({
          message: enrichedMessage,
          trigger: `sidepanel_${agentEnglishName}`,
        }),
        headers: { Accept: "text/event-stream" },
      },
      {
        onEvent: (name, data) => {
          if (name === "delta" && data && typeof data === "object") {
            const d = data as { text?: string };
            if (d.text) {
              updateAssistant((m) => ({ ...m, content: m.content + d.text }));
            }
          } else if (
            name === "tool_result" &&
            data &&
            typeof data === "object"
          ) {
            const d = data as {
              id: string;
              ok: boolean;
              result?: { proposal?: { content: string; reason?: string } };
            };
            const proposal = d.result?.proposal;
            if (d.ok && proposal && proposal.content && props.onProposal) {
              const source: "diary" | "memo" =
                agentEnglishName === "diary" ? "diary" : "memo";
              props.onProposal({
                content: proposal.content,
                reason: proposal.reason,
                source,
              });
            }
          } else if (name === "done" && data && typeof data === "object") {
            const d = data as { fullText?: string };
            if (d.fullText && d.fullText.length > 0) {
              updateAssistant((m) => ({ ...m, content: d.fullText! }));
            }
          } else if (name === "error" && data && typeof data === "object") {
            const d = data as { message?: string };
            setError(d.message ?? "unknown");
          }
        },
        onError: (e) => {
          setError(e instanceof Error ? e.message : String(e));
        },
      },
    );

    setStreaming(false);
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 50);
  }

  return (
    <aside className="flex flex-col h-full border-l border-border bg-sidebar">
      <header className="flex items-center gap-2.5 p-4 border-b border-border">
        <AgentBadge
          englishName={agentEnglishName}
          size="sm"
          showName={false}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">{agentDisplayName}</h3>
          {helperText && (
            <p className="text-[11px] text-muted-foreground truncate">
              {helperText}
            </p>
          )}
        </div>
      </header>

      {error && (
        <div className="m-3 text-xs border border-destructive/30 bg-destructive/5 text-destructive rounded-2xl p-3">
          {error}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streaming ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            자연어로 무엇이든 물어보세요.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 text-xs whitespace-pre-wrap leading-relaxed",
                  m.role === "user"
                    ? "bg-foreground text-background self-end max-w-[88%]"
                    : "bg-card text-foreground self-start max-w-[92%] border border-border",
                )}
              >
                {m.content ||
                  (m.role === "assistant" &&
                  streaming &&
                  i === messages.length - 1 ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground/80">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      생각 중...
                    </span>
                  ) : null)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
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
            placeholder={`${agentDisplayName}에게 묻기…`}
            disabled={streaming}
            className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground/60 py-1"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={streaming || !input.trim()}
            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background disabled:opacity-30 hover:opacity-90"
            aria-label="보내기"
          >
            {streaming ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "→"
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
