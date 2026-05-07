"use client";

// /dev — 도연 개발 도구 관리자.
// Claude Code skills 카탈로그 + 통계 + 도연 채팅.
// 진입 시 ~/.claude/skills 자동 동기화 (5분 throttle).

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AgentBadge } from "@/components/agent-badge";
import {
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { streamSseFetch } from "@/lib/sse/client";

const AUTO_SYNC_STALE_MS = 5 * 60 * 1000; // 5분
const LAST_SYNC_STORAGE_KEY = "myhub:lastSkillsSync";

type Skill = {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  category: string | null;
  version: string | null;
  filePath: string | null;
  projectPath: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  tags: string[];
  createdAt: string;
};

type Stats = {
  totalSkills: number;
  byCategory: Array<{ category: string; cnt: number }>;
  top30d: Array<{ name: string; uses: number }>;
  staleCandidates: Array<{ id: string; name: string; last_used_at: string | null }>;
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

const SCOPE_LABEL: Record<string, string> = { global: "전역", project: "프로젝트" };

export default function DevPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ scope: string; category: string }>({
    scope: "",
    category: "",
  });

  const [newSkill, setNewSkill] = useState({
    name: "",
    description: "",
    scope: "global",
    category: "",
    filePath: "",
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);

  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [justSynced, setJustSynced] = useState<{
    inserted: number;
    updated: number;
    removed: number;
    scanned: number;
  } | null>(null);
  const autoSyncDecidedRef = useRef(false);

  async function syncSkills() {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/skills", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message ?? data?.error ?? `status ${res.status}`);
      }
      const now = Date.now();
      setLastSyncAt(now);
      try {
        localStorage.setItem(LAST_SYNC_STORAGE_KEY, String(now));
      } catch {
        // storage 비활성 환경 — 무시
      }
      setJustSynced({
        inserted: data.inserted ?? 0,
        updated: data.updated ?? 0,
        removed: data.removed ?? 0,
        scanned: data.scanned ?? 0,
      });
      await Promise.all([fetchSkills(), fetchStats()]);
      setTimeout(() => setJustSynced(null), 5000);
    } catch (e) {
      setError(`Skills 동기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function fetchSkills() {
    try {
      const params = new URLSearchParams();
      if (filter.scope) params.set("scope", filter.scope);
      if (filter.category) params.set("category", filter.category);
      const res = await fetch(`/api/skills?${params}`, { cache: "no-store" });
      const data = await res.json();
      setSkills(data.skills ?? []);
    } catch (e) {
      setError(`Skill 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function fetchStats() {
    try {
      const res = await fetch("/api/skills/stats", { cache: "no-store" });
      const data = await res.json();
      setStats(data);
    } catch (e) {
      setError(`통계 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => {
    void (async () => {
      // localStorage에서 마지막 sync 시각 복원
      let lastTs = 0;
      try {
        const raw = localStorage.getItem(LAST_SYNC_STORAGE_KEY);
        lastTs = raw ? parseInt(raw, 10) || 0 : 0;
      } catch {
        // 무시
      }
      if (lastTs > 0) setLastSyncAt(lastTs);

      await Promise.all([fetchSkills(), fetchStats()]);

      if (autoSyncDecidedRef.current) return;
      autoSyncDecidedRef.current = true;
      const stale = !lastTs || Date.now() - lastTs > AUTO_SYNC_STALE_MS;
      if (stale) void syncSkills();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void fetchSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function addSkill() {
    if (!newSkill.name.trim()) return;
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSkill.name.trim(),
          description: newSkill.description.trim() || null,
          scope: newSkill.scope,
          category: newSkill.category.trim() || null,
          filePath: newSkill.filePath.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `status ${res.status}`);
      }
      setNewSkill({
        name: "",
        description: "",
        scope: "global",
        category: "",
        filePath: "",
      });
      await Promise.all([fetchSkills(), fetchStats()]);
      setInfo("Skill 등록 완료");
      setTimeout(() => setInfo(null), 3000);
    } catch (e) {
      setError(`Skill 추가 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function deleteSkill(id: string) {
    if (!confirm("Skill 메타를 삭제하시겠습니까? (사용 로그도 함께 삭제됩니다)")) return;
    try {
      const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await Promise.all([fetchSkills(), fetchStats()]);
    } catch (e) {
      setError(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

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
      "/api/agents/doyeon/invoke",
      {
        method: "POST",
        body: JSON.stringify({ message: text, trigger: "dev_chat" }),
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
            setError(`도연 호출 실패: ${d.message ?? "unknown"}`);
          }
        },
        onError: (e) => {
          setError(`도연 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
        },
      },
    );

    setStreaming(false);
    if (toolUsed) {
      void Promise.all([fetchSkills(), fetchStats()]);
    }
  }

  return (
    <div className="flex flex-col gap-8 p-6 max-w-5xl mx-auto w-full">
      <header className="flex items-center gap-3 flex-wrap">
        <AgentBadge englishName="doyeon" size="lg" showName={false} />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">개발 도구</h1>
          <p className="text-sm text-muted-foreground">
            도연이 Claude Code skill 카탈로그와 사용 패턴을 정리해드려요.
          </p>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          {lastSyncAt && (
            <span className="text-[11px] text-muted-foreground font-mono">
              마지막 동기화{" "}
              {new Date(lastSyncAt).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={syncSkills}
            disabled={syncing}
            className="gap-2"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            ~/.claude/skills 동기화
          </Button>
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
      {justSynced && (
        <div className="text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
          동기화 완료 — 스캔 {justSynced.scanned}건 · 신규 {justSynced.inserted} ·
          업데이트 {justSynced.updated} · 삭제 {justSynced.removed}
        </div>
      )}

      {stats && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="전체 skill" value={stats.totalSkills} />
          <Stat label="카테고리" value={stats.byCategory.length} />
          <Stat label="30일 활성" value={stats.top30d.length} />
          <Stat label="정리 후보" value={stats.staleCandidates.length} muted />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="border border-border rounded-xl p-3 bg-card flex flex-col gap-2">
          <h2 className="text-sm font-semibold">신규 등록</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                이름 *
              </label>
              <input
                value={newSkill.name}
                onChange={(e) => setNewSkill((p) => ({ ...p, name: e.target.value }))}
                placeholder="예: pdf-extract"
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                범위
              </label>
              <select
                value={newSkill.scope}
                onChange={(e) => setNewSkill((p) => ({ ...p, scope: e.target.value }))}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="global">전역 (~/.claude)</option>
                <option value="project">프로젝트</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                카테고리
              </label>
              <input
                value={newSkill.category}
                onChange={(e) =>
                  setNewSkill((p) => ({ ...p, category: e.target.value }))
                }
                placeholder="예: extraction"
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1 flex-[2] min-w-[200px]">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                설명
              </label>
              <input
                value={newSkill.description}
                onChange={(e) =>
                  setNewSkill((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="짧은 설명"
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-col gap-1 flex-[2] min-w-[200px]">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                파일 경로
              </label>
              <input
                value={newSkill.filePath}
                onChange={(e) =>
                  setNewSkill((p) => ({ ...p, filePath: e.target.value }))
                }
                placeholder="~/.claude/skills/..."
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <Button
              onClick={addSkill}
              disabled={!newSkill.name.trim()}
              size="sm"
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              등록
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Skills ({skills.length})</h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["", "global", "project"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter((p) => ({ ...p, scope: s }))}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  filter.scope === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted",
                )}
              >
                {s === "" ? "전체" : SCOPE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {skills.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Wrench className="h-5 w-5 opacity-60" />
            등록된 skill이 없습니다. 위 폼에서 첫 번째를 등록해보세요.
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border border border-border rounded-xl overflow-hidden">
            {skills.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-3 px-4 py-3 bg-card"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium">{s.name}</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">
                      {SCOPE_LABEL[s.scope] ?? s.scope}
                    </span>
                    {s.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border bg-primary/10 text-primary border-primary/30">
                        {s.category}
                      </span>
                    )}
                    {s.version && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        v{s.version}
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {s.description}
                    </p>
                  )}
                  {s.filePath && (
                    <p className="text-[11px] font-mono text-muted-foreground/80 mt-0.5 truncate">
                      {s.filePath}
                    </p>
                  )}
                  <div className="text-[11px] text-muted-foreground font-mono mt-1">
                    사용 {s.usageCount}회
                    {s.lastUsedAt && (
                      <> · 마지막 {new Date(s.lastUsedAt).toLocaleDateString("ko-KR")}</>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteSkill(s.id)}
                  className="text-muted-foreground hover:text-destructive p-1 rounded shrink-0"
                  aria-label="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">도연과 대화</h2>
        <div className="flex flex-col gap-3 min-h-[200px]">
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              예: &quot;skill 통계 보여줘&quot; / &quot;안 쓰는 skill 정리 제안해줘&quot;
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
                  <AgentBadge englishName="doyeon" size="sm" showName={false} />
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
            placeholder="도연에게 skill 카탈로그·통계를 부탁하세요…"
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

function Stat({
  label,
  value,
  muted,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "border border-border rounded-xl bg-card p-3 flex flex-col items-center gap-0.5",
        muted && "opacity-70",
      )}
    >
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
