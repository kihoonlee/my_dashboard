"use client";

// /capture — 다솜 캡처 비서.
// 3탭: 캡처(미분류 + 분류된 quick_captures) / 읽을거리 / 학습 + 다솜 채팅.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AgentBadge } from "@/components/agent-badge";
import {
  CheckCircle2,
  ExternalLink,
  Inbox,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { streamSseFetch } from "@/lib/sse/client";

type Capture = {
  id: string;
  content: string;
  type: string;
  url: string | null;
  aiCategory: string | null;
  processed: boolean;
  movedToTable: string | null;
  movedToId: string | null;
  createdAt: string;
};

type ReadLaterItem = {
  id: string;
  url: string;
  title: string | null;
  domain: string | null;
  status: string;
  priority: string;
  tags: string[];
  savedAt: string;
};

type Learning = {
  id: string;
  content: string;
  tags: string[];
  source: string | null;
  createdAt: string;
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
  meta?: { iterations: number; durationMs: number; costUsd: number };
};

type Tab = "capture" | "readLater" | "learning";

const CATEGORY_LABEL: Record<string, string> = {
  todo: "할 일",
  idea: "아이디어",
  learning: "학습",
  read_later: "읽을거리",
};

const CATEGORY_STYLE: Record<string, string> = {
  todo: "bg-primary/10 text-primary border-primary/30",
  idea: "bg-amber-400/10 text-amber-700 dark:text-amber-300 border-amber-400/30",
  learning: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  read_later: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30",
};

export default function CapturePage() {
  const [tab, setTab] = useState<Tab>("capture");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // captures
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [newContent, setNewContent] = useState<string>("");
  const [newUrl, setNewUrl] = useState<string>("");
  const [categorizing, setCategorizing] = useState<string | null>(null);

  // read later
  const [readItems, setReadItems] = useState<ReadLaterItem[]>([]);
  const [readStatus, setReadStatus] = useState<string>("unread");
  const [newReadUrl, setNewReadUrl] = useState<string>("");
  const [newReadTitle, setNewReadTitle] = useState<string>("");

  // learnings
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [newLearning, setNewLearning] = useState<string>("");
  const [newLearningSource, setNewLearningSource] = useState<string>("");

  // chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);

  async function fetchCaptures() {
    try {
      const res = await fetch("/api/captures?limit=100", { cache: "no-store" });
      const data = await res.json();
      setCaptures(data.captures ?? []);
    } catch (e) {
      setError(`캡처 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function fetchReadLater() {
    try {
      const res = await fetch(`/api/read-later?status=${readStatus}&limit=100`, {
        cache: "no-store",
      });
      const data = await res.json();
      setReadItems(data.items ?? []);
    } catch (e) {
      setError(`읽을거리 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function fetchLearnings() {
    try {
      const res = await fetch("/api/learnings?limit=100", { cache: "no-store" });
      const data = await res.json();
      setLearnings(data.learnings ?? []);
    } catch (e) {
      setError(`학습 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => {
    void fetchCaptures();
    void fetchReadLater();
    void fetchLearnings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void fetchReadLater();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readStatus]);

  // ── 캡처 ──
  async function addCapture() {
    if (!newContent.trim()) return;
    try {
      const url = newUrl.trim() || undefined;
      const res = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newContent.trim(),
          type: url ? "url" : "text",
          url,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setNewContent("");
      setNewUrl("");
      await fetchCaptures();
    } catch (e) {
      setError(`캡처 추가 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function categorize(id: string) {
    setCategorizing(id);
    try {
      const res = await fetch(`/api/captures/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "categorize" }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error ?? `status ${res.status}`);
      setInfo(
        `다솜 분류: ${CATEGORY_LABEL[data.category] ?? data.category} · 확신도 ${Math.round((data.confidence ?? 0) * 100)}% · $${(data.costUsd ?? 0).toFixed(5)}`,
      );
      await fetchCaptures();
      setTimeout(() => setInfo(null), 4000);
    } catch (e) {
      setError(`분류 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCategorizing(null);
    }
  }
  async function move(id: string, target: "todo" | "read_later" | "learning") {
    try {
      const res = await fetch(`/api/captures/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `status ${res.status}`);
      setInfo(`${CATEGORY_LABEL[target]}로 이동 완료`);
      await Promise.all([fetchCaptures(), fetchReadLater(), fetchLearnings()]);
      setTimeout(() => setInfo(null), 3000);
    } catch (e) {
      setError(`이동 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function deleteCapture(id: string) {
    if (!confirm("캡처를 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/captures/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchCaptures();
    } catch (e) {
      setError(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 읽을거리 ──
  async function addReadLater() {
    if (!newReadUrl.trim()) return;
    try {
      const res = await fetch("/api/read-later", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newReadUrl.trim(),
          title: newReadTitle.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `status ${res.status}`);
      setNewReadUrl("");
      setNewReadTitle("");
      await fetchReadLater();
    } catch (e) {
      setError(`URL 추가 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function markRead(id: string) {
    try {
      const res = await fetch(`/api/read-later/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "read" }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchReadLater();
    } catch (e) {
      setError(`상태 변경 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function deleteRead(id: string) {
    if (!confirm("이 항목을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/read-later/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchReadLater();
    } catch (e) {
      setError(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 학습 ──
  async function addLearning() {
    if (!newLearning.trim()) return;
    try {
      const res = await fetch("/api/learnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newLearning.trim(),
          source: newLearningSource.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setNewLearning("");
      setNewLearningSource("");
      await fetchLearnings();
    } catch (e) {
      setError(`학습 추가 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function deleteLearning(id: string) {
    if (!confirm("학습을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/learnings?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchLearnings();
    } catch (e) {
      setError(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── chat ──
  async function send() {
    const text = chatInput.trim();
    if (!text || streaming) return;
    setChatInput("");
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
      "/api/agents/dasom/invoke",
      {
        method: "POST",
        body: JSON.stringify({ message: text, trigger: "capture_chat" }),
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
            setError(`다솜 호출 실패: ${d.message ?? "unknown"}`);
          }
        },
        onError: (e) => {
          setError(`다솜 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
        },
      },
    );
    setStreaming(false);
    if (toolUsed) {
      void Promise.all([fetchCaptures(), fetchReadLater(), fetchLearnings()]);
    }
  }

  return (
    <div className="flex flex-col gap-8 p-6 max-w-5xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <AgentBadge englishName="dasom" size="lg" showName={false} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">캡처</h1>
          <p className="text-sm text-muted-foreground">
            다솜이 메모·URL·학습을 받아 정리해드려요.
          </p>
        </div>
      </header>

      {error && (
        <div role="alert" className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
          {error}
        </div>
      )}
      {info && (
        <div className="text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
          {info}
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-border">
        {(
          [
            ["capture", "캡처"],
            ["readLater", "읽을거리"],
            ["learning", "학습"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
              tab === k
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "capture" && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 border border-border rounded-xl p-3 bg-card">
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="떠오른 생각·메모·할 일·인사이트…"
              rows={2}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary resize-y"
            />
            <div className="flex gap-2">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="URL (선택)"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
              <Button
                onClick={addCapture}
                disabled={!newContent.trim()}
                size="sm"
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                캡처
              </Button>
            </div>
          </div>

          {captures.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Inbox className="h-5 w-5 opacity-60" />
              아직 캡처가 없습니다.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {captures.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    "border border-border rounded-xl bg-card p-3 flex flex-col gap-2",
                    c.processed && "opacity-60",
                  )}
                >
                  <div className="flex items-start gap-2 flex-wrap">
                    {c.aiCategory ? (
                      <span
                        className={cn(
                          "text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0",
                          CATEGORY_STYLE[c.aiCategory] ?? CATEGORY_STYLE.idea,
                        )}
                      >
                        {CATEGORY_LABEL[c.aiCategory] ?? c.aiCategory}
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-muted text-muted-foreground shrink-0">
                        분류 대기
                      </span>
                    )}
                    {c.processed && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-muted/50 text-muted-foreground/70">
                        이동됨 → {c.movedToTable}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                      {new Date(c.createdAt).toLocaleString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {c.url}
                    </a>
                  )}
                  {!c.processed && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => categorize(c.id)}
                        disabled={categorizing === c.id}
                        className="gap-1.5"
                      >
                        {categorizing === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        다솜 분류
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => move(c.id, "todo")}
                      >
                        → 할 일
                      </Button>
                      {c.url && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => move(c.id, "read_later")}
                        >
                          → 읽을거리
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => move(c.id, "learning")}
                      >
                        → 학습
                      </Button>
                      <button
                        onClick={() => deleteCapture(c.id)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded ml-auto"
                        aria-label="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "readLater" && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 border border-border rounded-xl p-3 bg-card">
            <input
              value={newReadUrl}
              onChange={(e) => setNewReadUrl(e.target.value)}
              placeholder="https://..."
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <input
                value={newReadTitle}
                onChange={(e) => setNewReadTitle(e.target.value)}
                placeholder="제목 (선택)"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
              <Button onClick={addReadLater} disabled={!newReadUrl.trim()} size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                추가
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {(["unread", "read", "archived"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setReadStatus(s)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  readStatus === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted",
                )}
              >
                {s === "unread" ? "안 읽음" : s === "read" ? "읽음" : "보관"}
              </button>
            ))}
          </div>

          {readItems.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              {readStatus === "unread" ? "읽을거리가 없습니다." : "비어있음"}
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border border border-border rounded-xl overflow-hidden">
              {readItems.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3 bg-card">
                  <div className="flex-1 min-w-0">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline line-clamp-1"
                    >
                      {r.title || r.url}
                    </a>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {r.domain ?? r.url} ·{" "}
                      {new Date(r.savedAt).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                  {r.status === "unread" && (
                    <button
                      onClick={() => markRead(r.id)}
                      className="text-muted-foreground hover:text-primary p-1 rounded"
                      title="읽음 처리"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteRead(r.id)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "learning" && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 border border-border rounded-xl p-3 bg-card">
            <textarea
              value={newLearning}
              onChange={(e) => setNewLearning(e.target.value)}
              placeholder="배운 점 / 깨달음 / 인사이트…"
              rows={2}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary resize-y"
            />
            <div className="flex gap-2">
              <input
                value={newLearningSource}
                onChange={(e) => setNewLearningSource(e.target.value)}
                placeholder="출처 (책 / URL / 사람, 선택)"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
              <Button onClick={addLearning} disabled={!newLearning.trim()} size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                저장
              </Button>
            </div>
          </div>

          {learnings.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              저장된 학습이 없습니다.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {learnings.map((l) => (
                <li key={l.id} className="border border-border rounded-xl bg-card p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm whitespace-pre-wrap">{l.content}</p>
                    <div className="text-[11px] text-muted-foreground font-mono mt-1">
                      {l.source && <>{l.source} · </>}
                      {new Date(l.createdAt).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteLearning(l.id)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">다솜과 대화</h2>
        <div className="flex flex-col gap-3 min-h-[200px]">
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              예: &quot;방금 적은 메모 분류해줘&quot; / &quot;이 URL 읽을거리에 추가&quot;
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
                  <AgentBadge englishName="dasom" size="sm" showName={false} />
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
                    (m.role === "assistant" && streaming && i === messages.length - 1 ? (
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
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="다솜에게 캡처 분류·이동을 부탁하세요…"
            disabled={streaming}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <Button onClick={send} disabled={streaming || !chatInput.trim()}>
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : "보내기"}
          </Button>
        </div>
      </section>
    </div>
  );
}
