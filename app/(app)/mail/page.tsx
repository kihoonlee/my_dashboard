"use client";

// /mail — 정연 채팅 + 받은편지함 (우선순위별 그룹).
// 동기화 버튼: POST /api/sync/gmail (412면 reauth 안내).
// 분류 라벨: urgent(빨강) / important(파랑) / normal / promotion(회색).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { AgentBadge } from "@/components/agent-badge";
import {
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  Wrench,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { streamSseFetch } from "@/lib/sse/client";

type MailRow = {
  messageId: string;
  threadId: string;
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  aiPriority: string | null;
  needsReply: boolean;
  aiSummary: string | null;
  receivedAt: string;
  read: boolean;
};

type LastSync = {
  at?: string;
  fetched?: number;
  inserted?: number;
  classified?: number;
  costUsd?: number;
} | null;

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
  meta?: { iterations: number; durationMs: number; costUsd: number };
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "긴급",
  important: "중요",
  normal: "일반",
  promotion: "광고",
};

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive border-destructive/30",
  important: "bg-primary/10 text-primary border-primary/30",
  normal: "bg-muted text-muted-foreground border-border",
  promotion: "bg-muted/50 text-muted-foreground/70 border-border",
};

const AUTO_SYNC_STALE_MS = 5 * 60 * 1000;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function MailPage() {
  const [mails, setMails] = useState<MailRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastSync, setLastSync] = useState<LastSync>(null);
  const [reauth, setReauth] = useState<string | null>(null);
  const [justSynced, setJustSynced] = useState<{
    inserted: number;
    classified: number;
    costUsd: number;
  } | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchMails(): Promise<{ mails: MailRow[]; lastSync: LastSync } | null> {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("priority", filter);
      params.set("limit", "100");
      const res = await fetch(`/api/mail/list?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { mails: MailRow[]; lastSync: LastSync };
      setMails(data.mails);
      setLastSync(data.lastSync ?? null);
      return data;
    } catch (e) {
      setError(`메일 목록 실패: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function syncGmail() {
    if (syncing) return;
    setSyncing(true);
    setReauth(null);
    setJustSynced(null);
    try {
      const res = await fetch("/api/sync/gmail", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 412) {
        setReauth(
          data?.message ?? "Gmail 권한이 없습니다. 다시 로그인해주세요.",
        );
        return;
      }
      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? `status ${res.status}`);
      }
      setJustSynced({
        inserted: data.inserted ?? 0,
        classified: data.classified ?? 0,
        costUsd: data.totalCostUsd ?? 0,
      });
      await fetchMails();
      setTimeout(() => setJustSynced(null), 5000);
    } catch (e) {
      setError(`Gmail 동기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  const autoSyncDecidedRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const data = await fetchMails();
      if (autoSyncDecidedRef.current) return;
      autoSyncDecidedRef.current = true;
      if (!data) return;
      const stale =
        !data.lastSync?.at ||
        Date.now() - new Date(data.lastSync.at).getTime() > AUTO_SYNC_STALE_MS;
      if (stale) void syncGmail();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void fetchMails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

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
      "/api/agents/jeongyeon/invoke",
      {
        method: "POST",
        body: JSON.stringify({ message: text, trigger: "mail_chat" }),
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
            setError(`정연 호출 실패: ${d.message ?? "unknown"}`);
          }
        },
        onError: (e) => {
          setError(`정연 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
        },
      },
    );

    setStreaming(false);
    if (toolUsed) await fetchMails();
  }

  return (
    <div className="flex flex-col gap-8 p-6 max-w-5xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <AgentBadge englishName="jeongyeon" size="lg" showName={false} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">메일</h1>
          <p className="text-sm text-muted-foreground">
            정연이 받은편지함을 우선순위별로 정리합니다.
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
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", "urgent", "important", "normal", "promotion"] as const).map(
              (p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFilter(p)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors",
                    filter === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  {p === "all" ? "전체" : PRIORITY_LABEL[p]}
                </button>
              ),
            )}
          </div>
          <div className="flex items-center gap-3">
            {lastSync?.at && (
              <span className="text-[11px] text-muted-foreground font-mono">
                마지막 동기화{" "}
                {new Date(lastSync.at).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {typeof lastSync.classified === "number" &&
                  lastSync.classified > 0 &&
                  ` · ${lastSync.classified}건 분류`}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={syncGmail}
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
            동기화 완료 — 신규 {justSynced.inserted}건 / 분류{" "}
            {justSynced.classified}건 · ${justSynced.costUsd.toFixed(4)}
          </div>
        )}

        {reauth && (
          <div
            role="alert"
            className="border border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-300 rounded-lg p-3 text-sm flex items-start gap-3 justify-between"
          >
            <div>
              <div className="font-medium">Gmail 권한이 만료되었습니다.</div>
              <div className="text-xs opacity-80 mt-1">{reauth}</div>
            </div>
            <Link
              href="/auth/login?next=/mail"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              다시 로그인
            </Link>
          </div>
        )}

        {loading ? (
          <div className="text-xs text-muted-foreground">로딩 중...</div>
        ) : mails.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Mail className="h-5 w-5 opacity-60" />
            {lastSync?.at
              ? "이 필터에 해당하는 메일이 없습니다."
              : "아직 동기화하지 않았습니다. '동기화' 버튼을 눌러 가져오세요."}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border border border-border rounded-xl overflow-hidden">
            {mails.map((m) => (
              <li
                key={m.messageId}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 bg-card",
                  !m.read && "bg-primary/5",
                )}
              >
                <div className="flex flex-col items-start gap-1 w-20 shrink-0 pt-0.5">
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                      PRIORITY_STYLE[m.aiPriority ?? "normal"] ??
                        PRIORITY_STYLE.normal,
                    )}
                  >
                    {m.aiPriority
                      ? PRIORITY_LABEL[m.aiPriority] ?? m.aiPriority
                      : "분류 대기"}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {formatTime(m.receivedAt)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {m.fromName || m.fromEmail || "(unknown)"}
                    </span>
                    {m.needsReply && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-primary/40 text-primary">
                        답장 필요
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "text-sm truncate mt-0.5",
                      !m.read ? "font-semibold" : "font-medium",
                    )}
                  >
                    {m.subject || "(제목 없음)"}
                  </div>
                  {(m.aiSummary || m.snippet) && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {m.aiSummary || m.snippet}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">정연과 대화</h2>
        <div className="flex flex-col gap-3 min-h-[200px]">
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              예: &quot;시급한 메일 뭐 있어?&quot; / &quot;이 스레드 요약해줘&quot;
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
                  <AgentBadge
                    englishName="jeongyeon"
                    size="sm"
                    showName={false}
                  />
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
            placeholder="정연에게 우선순위·답장 필요 메일을 물어보세요…"
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
