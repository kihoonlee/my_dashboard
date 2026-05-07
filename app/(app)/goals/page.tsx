"use client";

// /goals — 수민 채팅 + 4개 탭: 목표 / 습관 / Year in Pixels / 주간 회고.

import { useEffect, useMemo, useState } from "react";
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

type Habit = {
  id: string;
  name: string;
  description: string | null;
  targetFrequency: string;
  colorHex: string | null;
  archived: boolean;
  completed14d: number;
  logCount14d: number;
  completionRate14d: number;
};

type YearPixel = {
  date: string;
  moodScore: number;
  colorHex: string | null;
  note: string | null;
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

type Tab = "goals" | "habits" | "pixels" | "review";

const COLOR_BY_SCORE: Record<number, string> = {
  1: "#dc2626",
  2: "#fb923c",
  3: "#facc15",
  4: "#84cc16",
  5: "#16a34a",
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
  const [tab, setTab] = useState<Tab>("goals");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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

  // Habits
  const [habits, setHabits] = useState<Habit[]>([]);
  const [newHabit, setNewHabit] = useState<string>("");
  const today = isoDate(new Date());

  // Year in Pixels
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [pixels, setPixels] = useState<YearPixel[]>([]);

  // Weekly review
  const [reviewWeekStart, setReviewWeekStart] = useState<string>(
    isoDate(startOfThisWeek()),
  );
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [generatingReview, setGeneratingReview] = useState<boolean>(false);

  async function fetchGoals() {
    try {
      const res = await fetch("/api/goals", { cache: "no-store" });
      const data = await res.json();
      setGoals(data.goals ?? []);
    } catch (e) {
      setError(`목표 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function fetchHabits() {
    try {
      const res = await fetch("/api/habits", { cache: "no-store" });
      const data = await res.json();
      setHabits(data.habits ?? []);
    } catch (e) {
      setError(`습관 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function fetchPixels(y: number) {
    try {
      const res = await fetch(`/api/year-pixels?year=${y}`, { cache: "no-store" });
      const data = await res.json();
      setPixels(data.pixels ?? []);
    } catch (e) {
      setError(`Year in Pixels 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
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
    void fetchGoals();
    void fetchHabits();
    void fetchPixels(year);
    void fetchReview(reviewWeekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      await fetchHabits();
    } catch (e) {
      setError(`습관 추가 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function logHabit(habitId: string, completed: boolean) {
    try {
      const res = await fetch("/api/habits/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habitId, completed, date: today }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchHabits();
    } catch (e) {
      setError(`습관 로그 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function archiveHabit(habitId: string) {
    if (!confirm("이 습관을 보관 처리하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/habits/${habitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchHabits();
    } catch (e) {
      setError(`습관 보관 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Year in Pixels ──
  async function setMood(date: string, moodScore: number) {
    try {
      const res = await fetch("/api/year-pixels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, moodScore }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchPixels(year);
    } catch (e) {
      setError(`Mood 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
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
        fetchGoals(),
        fetchHabits(),
        fetchPixels(year),
        fetchReview(reviewWeekStart),
      ]);
    }
  }

  const pixelsByDate = useMemo(() => {
    const map = new Map<string, YearPixel>();
    for (const p of pixels) map.set(p.date, p);
    return map;
  }, [pixels]);

  return (
    <div className="flex flex-col gap-8 p-6 max-w-5xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <AgentBadge englishName="soomin" size="lg" showName={false} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">목표 · 회고</h1>
          <p className="text-sm text-muted-foreground">
            수민이 분기 목표·습관·Year in Pixels·주간 회고를 함께합니다.
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
            ["goals", "목표"],
            ["habits", "습관"],
            ["pixels", "Year in Pixels"],
            ["review", "주간 회고"],
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

      {tab === "goals" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex flex-col gap-1 flex-[2] min-w-[200px]">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                목표 제목
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
            <Button
              onClick={addGoal}
              disabled={!newGoal.title.trim()}
              size="sm"
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              추가
            </Button>
          </div>

          {goals.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Target className="h-5 w-5 opacity-60" />
              아직 등록된 목표가 없습니다.
            </div>
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
      )}

      {tab === "habits" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                새 습관
              </label>
              <input
                value={newHabit}
                onChange={(e) => setNewHabit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addHabit();
                }}
                placeholder="예: 매일 30분 산책"
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <Button onClick={addHabit} disabled={!newHabit.trim()} size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              추가
            </Button>
          </div>

          {habits.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              아직 등록된 습관이 없습니다.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {habits.map((h) => (
                <li
                  key={h.id}
                  className="border border-border rounded-xl bg-card p-3 flex items-center gap-3"
                >
                  <button
                    onClick={() => logHabit(h.id, true)}
                    className="text-muted-foreground hover:text-primary"
                    aria-label="오늘 완료"
                    title="오늘 완료"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{h.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      14일 완료율{" "}
                      {h.logCount14d > 0
                        ? `${Math.round(h.completionRate14d * 100)}%`
                        : "—"}{" "}
                      ({h.completed14d}/{h.logCount14d})
                    </div>
                  </div>
                  <button
                    onClick={() => archiveHabit(h.id)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded text-[11px]"
                  >
                    보관
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "pixels" && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const y = year - 1;
                setYear(y);
                void fetchPixels(y);
              }}
              className="px-2 py-1 text-sm rounded border border-border hover:bg-muted"
            >
              ←
            </button>
            <span className="font-mono text-sm">{year}</span>
            <button
              onClick={() => {
                const y = year + 1;
                setYear(y);
                void fetchPixels(y);
              }}
              className="px-2 py-1 text-sm rounded border border-border hover:bg-muted"
            >
              →
            </button>
            <span className="text-xs text-muted-foreground ml-2">
              {pixels.length}일 기록됨
            </span>
          </div>

          <YearPixelGrid
            year={year}
            pixelsByDate={pixelsByDate}
            onSet={setMood}
          />

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>오늘 ({today}):</span>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setMood(today, s)}
                className="w-6 h-6 rounded border border-border"
                style={{ background: COLOR_BY_SCORE[s] }}
                aria-label={`mood ${s}`}
                title={`mood ${s}`}
              />
            ))}
          </div>
        </section>
      )}

      {tab === "review" && (
        <section className="flex flex-col gap-3">
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
                <Stat label="완료한 Todo" value={review.todosCompleted} />
                <Stat
                  label="습관 완료율"
                  value={`${Math.round(parseFloat(review.habitsCompletionRate ?? "0") * 100)}%`}
                />
                <Stat label="GitHub 커밋" value={review.githubCommits} />
                <Stat label="옵시디언 변경" value={review.obsidianNotesCreated} />
              </div>
              {review.aiSummary && (
                <p className="text-sm leading-relaxed border-t border-border pt-3">
                  {review.aiSummary}
                </p>
              )}
              {review.aiSuggestions && review.aiSuggestions.length > 0 && (
                <div className="border-t border-border pt-3 flex flex-col gap-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    제안
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
            <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              이 주 회고가 없습니다. &apos;회고 생성&apos;을 누르면 자동 집계 +
              수민의 한 단락 요약을 만듭니다.
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">수민과 대화</h2>
        <div className="flex flex-col gap-3 min-h-[200px]">
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              예: &quot;이번 주 회고 만들어줘&quot; / &quot;산책 습관 추가해줘&quot;
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
            placeholder="수민에게 회고·목표·습관을 물어보세요…"
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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function YearPixelGrid({
  year,
  pixelsByDate,
  onSet,
}: {
  year: number;
  pixelsByDate: Map<string, YearPixel>;
  onSet: (date: string, score: number) => void;
}) {
  // 12개월 × 31칸 그리드 (없는 날은 비워둠)
  const months = Array.from({ length: 12 }, (_, m) => m);
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1.5 min-w-fit">
        {months.map((m) => {
          const days = new Date(year, m + 1, 0).getDate();
          return (
            <div key={m} className="flex flex-col items-center gap-0.5">
              <div className="text-[10px] text-muted-foreground font-mono">
                {String(m + 1).padStart(2, "0")}
              </div>
              <div className="grid grid-cols-1 gap-0.5">
                {Array.from({ length: days }, (_, d) => {
                  const dateStr = `${year}-${String(m + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
                  const pixel = pixelsByDate.get(dateStr);
                  return (
                    <button
                      key={dateStr}
                      onClick={() => {
                        const next = window.prompt(
                          `${dateStr} mood 1-5 (현재: ${pixel?.moodScore ?? "—"})`,
                          String(pixel?.moodScore ?? ""),
                        );
                        if (!next) return;
                        const n = parseInt(next, 10);
                        if (n >= 1 && n <= 5) onSet(dateStr, n);
                      }}
                      className="w-3 h-3 rounded-sm border border-border hover:ring-1 hover:ring-primary"
                      style={{
                        background: pixel?.colorHex ?? "transparent",
                      }}
                      title={`${dateStr}${pixel ? ` · ${pixel.moodScore}` : ""}${pixel?.note ? ` · ${pixel.note}` : ""}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
