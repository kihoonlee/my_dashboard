"use client";

// /news — 민영 채팅 + 데일리 브리핑 + 최근 뉴스 + RSS source 관리.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AgentBadge } from "@/components/agent-badge";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Newspaper,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { streamSseFetch } from "@/lib/sse/client";
import { EmptyState } from "@/components/ui/empty-state";

type NewsSource = {
  id: string;
  name: string;
  url: string;
  type: string;
  category: string | null;
  active: boolean;
  lastFetchedAt: string | null;
};

type NewsItem = {
  id: string;
  title: string;
  url: string;
  category: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  sourceName: string | null;
};

type BriefingSection = {
  category: string;
  items: Array<{ title: string; url: string; marker?: string | null }>;
};

type BriefingRow = {
  date: string;
  hyewonIntro: string | null;
  sectionsJson: BriefingSection[];
  generatedAt: string;
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

export default function NewsPage() {
  const [briefing, setBriefing] = useState<BriefingRow | null>(null);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);
  const [showSources, setShowSources] = useState<boolean>(false);
  const [newSourceName, setNewSourceName] = useState<string>("");
  const [newSourceUrl, setNewSourceUrl] = useState<string>("");
  const [newSourceCategory, setNewSourceCategory] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);

  async function fetchBriefing() {
    try {
      const res = await fetch("/api/news/briefing", { cache: "no-store" });
      const data = await res.json();
      setBriefing(data.briefing ?? null);
    } catch (e) {
      setError(`브리핑 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function fetchItems() {
    try {
      const res = await fetch("/api/news/items?hours=48&limit=80", {
        cache: "no-store",
      });
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (e) {
      setError(`뉴스 목록 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function fetchSources() {
    try {
      const res = await fetch("/api/news/sources", { cache: "no-store" });
      const data = await res.json();
      setSources(data.sources ?? []);
    } catch (e) {
      setError(`Source 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function syncRss() {
    if (syncing) return;
    setSyncing(true);
    setInfo(null);
    setError(null);
    try {
      const res = await fetch("/api/sync/news", { method: "POST" });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.message ?? data?.error ?? `status ${res.status}`);
      setInfo(
        `동기화 완료 — ${data.sources}개 source · 신규 ${data.inserted}건${
          data.errors?.length ? ` · 오류 ${data.errors.length}건` : ""
        }`,
      );
      await Promise.all([fetchItems(), fetchSources()]);
      setTimeout(() => setInfo(null), 5000);
    } catch (e) {
      setError(`RSS 동기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function generateBriefing() {
    if (generating) return;
    setGenerating(true);
    setInfo(null);
    setError(null);
    try {
      const res = await fetch("/api/news/briefing", { method: "POST" });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.message ?? data?.error ?? `status ${res.status}`);
      setInfo(
        `브리핑 생성 — ${data.itemsConsidered}건 검토 · $${(data.costUsd ?? 0).toFixed(4)}`,
      );
      await fetchBriefing();
      setTimeout(() => setInfo(null), 5000);
    } catch (e) {
      setError(`브리핑 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  async function addSource() {
    if (!newSourceName.trim() || !newSourceUrl.trim()) return;
    try {
      const res = await fetch("/api/news/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSourceName.trim(),
          url: newSourceUrl.trim(),
          category: newSourceCategory.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `status ${res.status}`);
      setNewSourceName("");
      setNewSourceUrl("");
      setNewSourceCategory("");
      await fetchSources();
    } catch (e) {
      setError(`Source 추가 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function removeSource(id: string) {
    if (!confirm("이 source를 삭제하시겠습니까? (수집된 항목도 함께 삭제됩니다)")) return;
    try {
      const res = await fetch(`/api/news/sources?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchSources();
    } catch (e) {
      setError(`Source 삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => {
    void Promise.all([fetchBriefing(), fetchItems(), fetchSources()]);
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
      "/api/agents/minyoung/invoke",
      {
        method: "POST",
        body: JSON.stringify({ message: text, trigger: "news_chat" }),
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
            setError(`민영 호출 실패: ${d.message ?? "unknown"}`);
          }
        },
        onError: (e) => {
          setError(`민영 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
        },
      },
    );

    setStreaming(false);
    if (toolUsed) await Promise.all([fetchBriefing(), fetchItems()]);
  }

  const briefingSections = (briefing?.sectionsJson ?? []) as BriefingSection[];

  return (
    <div className="flex flex-col gap-8 p-6 max-w-5xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <AgentBadge englishName="minyoung" size="lg" showName={false} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">뉴스</h1>
          <p className="text-sm text-muted-foreground">
            민영이 RSS를 모아 데일리 브리핑을 만들어드립니다.
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
      {info && (
        <div className="text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
          {info}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            오늘 브리핑
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={generateBriefing}
              disabled={generating}
              className="gap-2"
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              브리핑 생성
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={syncRss}
              disabled={syncing}
              className="gap-2"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              RSS 동기화
            </Button>
          </div>
        </div>

        {briefing ? (
          <div className="border border-border rounded-xl bg-card p-4 flex flex-col gap-4">
            {briefing.hyewonIntro && (
              <p className="text-sm leading-relaxed">{briefing.hyewonIntro}</p>
            )}
            {briefingSections.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                구조화된 섹션이 없습니다. 다시 생성해보세요.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {briefingSections.map((sec) => (
                  <div key={sec.category} className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {sec.category}
                    </h3>
                    <ul className="flex flex-col gap-1">
                      {sec.items.map((it, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-muted-foreground/60">·</span>
                          <a
                            href={it.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline flex-1"
                          >
                            {it.marker && (
                              <span className="text-[10px] font-medium text-primary mr-1">
                                [{it.marker}]
                              </span>
                            )}
                            {it.title}
                          </a>
                          <ExternalLink className="h-3 w-3 text-muted-foreground/60 mt-1 shrink-0" />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[10px] font-mono text-muted-foreground">
              {briefing.date} · 생성 {new Date(briefing.generatedAt).toLocaleTimeString("ko-KR")}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Newspaper}
            title="오늘자 브리핑이 없습니다"
            description="RSS 동기화로 최신 글을 모은 뒤 '브리핑 생성'을 눌러 민영의 한국어 요약을 받아보세요."
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">최근 수집 ({items.length}건)</h2>
          <button
            type="button"
            onClick={() => setShowSources((s) => !s)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showSources ? "Source 접기" : `Source 관리 (${sources.length})`}
          </button>
        </div>

        {showSources && (
          <div className="border border-border rounded-xl bg-card p-4 flex flex-col gap-3">
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  이름
                </label>
                <input
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  placeholder="예: TechCrunch"
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex flex-col gap-1 flex-[2] min-w-[200px]">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  RSS URL
                </label>
                <input
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  placeholder="https://example.com/feed.xml"
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  카테고리
                </label>
                <input
                  value={newSourceCategory}
                  onChange={(e) => setNewSourceCategory(e.target.value)}
                  placeholder="기술/AI"
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <Button
                onClick={addSource}
                disabled={!newSourceName.trim() || !newSourceUrl.trim()}
                size="sm"
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                추가
              </Button>
            </div>
            {sources.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                등록된 source가 없습니다.
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {sources.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/40"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{s.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {s.url}
                        {s.category && ` · ${s.category}`}
                        {s.lastFetchedAt &&
                          ` · 마지막 ${new Date(s.lastFetchedAt).toLocaleString("ko-KR")}`}
                      </div>
                    </div>
                    <button
                      onClick={() => removeSource(s.id)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <EmptyState
            icon={Newspaper}
            title="최근 48시간 수집된 뉴스가 없습니다"
            description="Source를 추가한 뒤 RSS 동기화를 실행하면 여기 채워져요."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border border border-border rounded-xl overflow-hidden">
            {items.slice(0, 50).map((it) => (
              <li
                key={it.id}
                className="flex items-start gap-3 px-4 py-2.5 bg-card"
              >
                <div className="font-mono text-[10px] text-muted-foreground w-20 shrink-0 pt-0.5 truncate">
                  {it.sourceName ?? "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:underline line-clamp-1"
                  >
                    {it.title}
                  </a>
                  {it.category && (
                    <span className="text-[10px] text-muted-foreground ml-1">
                      [{it.category}]
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {new Date(it.fetchedAt).toLocaleDateString("ko-KR", {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">민영과 대화</h2>
        <div className="flex flex-col gap-3 min-h-[200px]">
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              예: &quot;오늘 브리핑 만들어줘&quot; / &quot;AI 뉴스만 보여줘&quot;
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
                  <AgentBadge englishName="minyoung" size="sm" showName={false} />
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
            placeholder="민영에게 뉴스 요약·검색을 부탁하세요…"
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
