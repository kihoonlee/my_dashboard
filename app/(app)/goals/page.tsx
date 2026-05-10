"use client";

// /goals — Grit 스타일 단일 흐름 페이지.
// 위에서 아래로: 데일리 모티베이션 → 오늘의 습관 → 장기 목표
// → 이번 주 회고 → 수민 코칭. 탭 없이 한 스크롤로 코칭 흐름이 이어진다.
// 습관 detail은 /goals/habits/[id]에서.
// (무드 히트맵 / Year in Pixels는 2026-05-10 폐기)

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AgentBadge } from "@/components/agent-badge";
import {
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { streamSseFetch } from "@/lib/sse/client";
import { DailyMotivationCard } from "@/components/daily-motivation-card";
import { HabitCard, type DashboardHabit } from "@/components/habit-card";

type Goal = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  targetDate: string | null;
  progress: number;
  status: string;
  createdAt: string;
};

type WeeklyReview = {
  weekStart: string;
  todosCompleted: number;
  habitsCompletionRate: string | null;
  githubCommits: number;
  obsidianNotesCreated: number;
  aiSummary: string | null;
  aiSuggestions: string[];
  userNotes: string | null;
  createdAt: string;
};

type DashboardData = {
  today: string;
  habits: DashboardHabit[];
  summary: {
    total: number;
    completedToday: number;
    weekRate: number;
    weekCompleted?: number;
    weekLogged?: number;
  };
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

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfThisWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export default function GoalsPage() {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Dashboard
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [newHabit, setNewHabit] = useState<string>("");

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);

  // Goals
  const [goals, setGoals] = useState<Goal[]>([]);
  const [newGoal, setNewGoal] = useState<{ title: string; targetDate: string }>({
    title: "",
    targetDate: "",
  });

  // Weekly review
  const [reviewWeekStart, setReviewWeekStart] = useState<string>(
    isoDate(startOfThisWeek()),
  );
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [generatingReview, setGeneratingReview] = useState<boolean>(false);

  const today = isoDate(new Date());

  async function fetchDashboard() {
    try {
      const res = await fetch("/api/habits/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const j = (await res.json()) as DashboardData;
      setDashboard(j);
    } catch (e) {
      setError(`습관 대시보드 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function fetchGoals() {
    try {
      const res = await fetch("/api/goals", { cache: "no-store" });
      const data = await res.json();
      setGoals(data.goals ?? []);
    } catch (e) {
      setError(`목표 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function fetchReview(weekStart: string) {
    try {
      const res = await fetch(`/api/weekly-reviews?weekStart=${weekStart}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setReview(data.review ?? null);
    } catch (e) {
      setError(`회고 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => {
    void fetchDashboard();
    void fetchGoals();
    void fetchReview(reviewWeekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Habits ──
  async function addHabit() {
    if (!newHabit.trim()) return;
    try {
      const res = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newHabit.trim() }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setNewHabit("");
      await fetchDashboard();
    } catch (e) {
      setError(`습관 추가 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function toggleHabit(habitId: string, nextCompleted: boolean) {
    try {
      const res = await fetch("/api/habits/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habitId, completed: nextCompleted, date: today }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchDashboard();
    } catch (e) {
      setError(`습관 토글 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Goals ──
  async function addGoal() {
    if (!newGoal.title.trim()) return;
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newGoal.title.trim(),
          targetDate: newGoal.targetDate || null,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setNewGoal({ title: "", targetDate: "" });
      await fetchGoals();
    } catch (e) {
      setError(`목표 추가 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function updateProgress(id: string, progress: number) {
    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchGoals();
    } catch (e) {
      setError(`목표 갱신 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function deleteGoal(id: string) {
    if (!confirm("목표를 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchGoals();
    } catch (e) {
      setError(`목표 삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Weekly review ──
  async function generateReview() {
    if (generatingReview) return;
    setGeneratingReview(true);
    setInfo(null);
    setError(null);
    try {
      const res = await fetch("/api/weekly-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: reviewWeekStart }),
      });
      // 응답이 JSON이 아니면 (HTML 에러 페이지 등) 더 구체적으로 안내
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        const truncated = text.slice(0, 200).replace(/\s+/g, " ");
        throw new Error(
          `서버가 JSON 대신 ${contentType || "비-JSON"}을(를) 반환 (status ${res.status}). 본문: ${truncated}…`,
        );
      }
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.message ?? data?.error ?? `status ${res.status}`);
      setInfo(`회고 생성 완료 — $${(data.costUsd ?? 0).toFixed(4)}`);
      await fetchReview(reviewWeekStart);
      setTimeout(() => setInfo(null), 5000);
    } catch (e) {
      setError(`회고 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGeneratingReview(false);
    }
  }

  // ── Chat ──
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
      "/api/agents/soomin/invoke",
      {
        method: "POST",
        body: JSON.stringify({ message: text, trigger: "goals_chat" }),
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
            setError(`수민 호출 실패: ${d.message ?? "unknown"}`);
          }
        },
        onError: (e) => {
          setError(`수민 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
        },
      },
    );

    setStreaming(false);
    if (toolUsed) {
      void Promise.all([
        fetchDashboard(),
        fetchGoals(),
        fetchReview(reviewWeekStart),
      ]);
    }
  }

  const summary = dashboard?.summary ?? null;
  const habits = dashboard?.habits ?? [];

  return (
    <div className="flex flex-col gap-8 p-6 max-w-5xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <AgentBadge englishName="soomin" size="lg" showName={false} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">목표 · 코칭</h1>
          <p className="text-sm text-muted-foreground">
            오늘 → 이번 주 → 올해. 수민과 한 흐름으로 보고 다듬습니다.
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

      {/* 메인: 데일리 모티베이션 */}
      <DailyMotivationCard />

      {/* 오늘의 습관 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <SectionHeader
            title="오늘의 습관"
            sub="작은 것 하나라도 매일. 카드를 눌러 체크, 화살표로 90일 자취를 보세요."
          />
          {summary && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
              <span>
                오늘 <strong className="text-foreground">{summary.completedToday}</strong>/{summary.total}
              </span>
              <span>이번 주 평균 {Math.round(summary.weekRate * 100)}%</span>
            </div>
          )}
        </div>
        {summary && summary.total > 0 && (
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${(summary.completedToday / Math.max(1, summary.total)) * 100}%`,
              }}
            />
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            value={newHabit}
            onChange={(e) => setNewHabit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addHabit();
            }}
            placeholder="새 습관 (예: 매일 30분 산책)"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
          />
          <Button onClick={addHabit} disabled={!newHabit.trim()} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            추가
          </Button>
        </div>

        {habits.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5 opacity-60" />}
            title="아직 습관이 없어요"
            sub="‘매일 30분 산책’ 하나로 시작해도 충분합니다."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {habits.map((h) => (
              <HabitCard key={h.id} habit={h} onToggle={toggleHabit} />
            ))}
          </div>
        )}
      </section>

      {/* 장기 목표 */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="장기 목표"
          sub="이번 분기·해 단위로 가져갈 큰 그림. 진척바를 옮겨 자취를 남기세요."
        />
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-1 flex-[2] min-w-[200px]">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              새 목표
            </label>
            <input
              value={newGoal.title}
              onChange={(e) => setNewGoal((p) => ({ ...p, title: e.target.value }))}
              placeholder="예: Q2 안에 MyHub Phase 7 배포"
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              마감일 (선택)
            </label>
            <input
              type="date"
              value={newGoal.targetDate}
              onChange={(e) => setNewGoal((p) => ({ ...p, targetDate: e.target.value }))}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <Button onClick={addGoal} disabled={!newGoal.title.trim()} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            추가
          </Button>
        </div>

        {goals.length === 0 ? (
          <EmptyState
            icon={<Target className="h-5 w-5 opacity-60" />}
            title="아직 큰 목표가 없어요"
            sub="작게 한 줄이라도 적어두면 매일의 습관이 의미를 가집니다."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {goals.map((g) => (
              <li key={g.id} className="border border-border rounded-xl bg-card p-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{g.title}</div>
                    {g.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 font-mono">
                      <span>{g.type}</span>
                      {g.targetDate && <span>마감 {g.targetDate}</span>}
                      <span className={g.status === "done" ? "text-emerald-600" : ""}>
                        {g.status}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteGoal(g.id)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={g.progress}
                    onChange={(e) => updateProgress(g.id, parseInt(e.target.value, 10))}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-muted-foreground w-10 text-right">
                    {g.progress}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 이번 주 회고 */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="이번 주 회고"
          sub="Todo·습관·코드·노트가 한 단락으로 묶입니다. 매주 일요일 자동 생성, 수동 생성도 가능."
        />
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={reviewWeekStart}
            onChange={(e) => {
              setReviewWeekStart(e.target.value);
              void fetchReview(e.target.value);
            }}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          />
          <span className="text-xs text-muted-foreground">
            주간 시작 (월요일 기준 권장)
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={generateReview}
            disabled={generatingReview}
            className="gap-2 ml-auto"
          >
            {generatingReview ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {review ? "다시 생성" : "회고 생성"}
          </Button>
        </div>

        {review ? (
          <div className="border border-border rounded-xl bg-card p-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <ReviewStat label="완료한 Todo" value={review.todosCompleted} />
              <ReviewStat
                label="습관 완료율"
                value={`${Math.round(parseFloat(review.habitsCompletionRate ?? "0") * 100)}%`}
              />
              <ReviewStat label="GitHub 커밋" value={review.githubCommits} />
              <ReviewStat label="옵시디언 변경" value={review.obsidianNotesCreated} />
            </div>
            {review.aiSummary && (
              <p className="text-sm leading-relaxed border-t border-border pt-3">
                {review.aiSummary}
              </p>
            )}
            {review.aiSuggestions && review.aiSuggestions.length > 0 && (
              <div className="border-t border-border pt-3 flex flex-col gap-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  다음 한 걸음
                </h3>
                <ul className="flex flex-col gap-1">
                  {review.aiSuggestions.map((s, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-primary mt-0.5">→</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-[10px] font-mono text-muted-foreground">
              생성 {new Date(review.createdAt).toLocaleString("ko-KR")}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Sparkles className="h-5 w-5 opacity-60" />}
            title="이 주 회고가 아직 없어요"
            sub="‘회고 생성’을 누르면 한 주의 자취를 자동 집계하고 수민이 한 단락으로 정리합니다."
          />
        )}
      </section>

      {/* 수민 코칭 */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="수민 코칭"
          sub="목표·습관·회고 — 막히는 지점을 적어주세요. 수민이 작은 다음 행동을 제안해줍니다."
        />
        <div className="flex flex-col gap-3 min-h-[200px]">
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              예: &quot;매일 운동 어떻게 하면 좋을까?&quot; / &quot;이번 주 회고 만들어줘&quot;
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
                  <AgentBadge englishName="soomin" size="sm" showName={false} />
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
            placeholder="수민에게 코칭·회고·목표를 물어보세요…"
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

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm flex flex-col items-center gap-1.5">
      <div className="text-muted-foreground">{icon}</div>
      <div className="font-medium text-foreground/90">{title}</div>
      {sub && <p className="text-xs text-muted-foreground max-w-md">{sub}</p>}
    </div>
  );
}

function ReviewStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

