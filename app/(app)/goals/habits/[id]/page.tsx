"use client";

// /goals/habits/[id] — 단일 습관 상세.
// 헤더 (이름, 스트릭, 14d/90d 완료율) + 90일 히트맵 + 날짜별 노트 + 수민 코칭.

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AgentBadge } from "@/components/agent-badge";
import {
  ArrowLeft,
  CheckCircle2,
  Flame,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HabitHeatmap } from "@/components/habit-heatmap";
import { buildHeatmap, type HabitLog, type HeatmapCell } from "@/lib/habits/streak";

type DetailResponse = {
  habit: {
    id: string;
    name: string;
    description: string | null;
    targetFrequency: string;
    archived: boolean;
  };
  logs: HabitLog[];
  streak: { current: number; longest: number; todayCompleted: boolean };
  rate14d: { completed: number; logged: number; rate: number };
  rate90d: { completed: number; logged: number; rate: number };
};

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function HabitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Note editing
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>("");
  const [savingNote, setSavingNote] = useState<boolean>(false);

  // Coach
  const [struggle, setStruggle] = useState<string>("");
  const [coachMessage, setCoachMessage] = useState<string | null>(null);
  const [coachMeta, setCoachMeta] = useState<{
    costUsd: number;
    durationMs: number;
  } | null>(null);
  const [coaching, setCoaching] = useState<boolean>(false);

  async function fetchDetails() {
    try {
      const res = await fetch(`/api/habits/${id}/details`, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const j = (await res.json()) as DetailResponse;
      setData(j);
      setError(null);
    } catch (e) {
      setError(`상세 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function toggleToday(nextCompleted: boolean) {
    try {
      const res = await fetch("/api/habits/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          habitId: id,
          completed: nextCompleted,
          date: isoDate(new Date()),
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fetchDetails();
    } catch (e) {
      setError(`토글 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function saveNote() {
    if (!editingDate) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/habits/${id}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: editingDate, note: noteDraft.trim() || null }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setEditingDate(null);
      setNoteDraft("");
      await fetchDetails();
    } catch (e) {
      setError(`노트 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingNote(false);
    }
  }

  function startEditNote(cell: HeatmapCell) {
    setEditingDate(cell.date);
    setNoteDraft(cell.note ?? "");
  }

  async function getCoaching() {
    if (coaching) return;
    setCoaching(true);
    setCoachMessage(null);
    setCoachMeta(null);
    try {
      const res = await fetch("/api/agents/soomin/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: struggle.trim()
            ? `습관 "${data?.habit.name}"에 대해 코칭해줘. 어려움: ${struggle.trim()}. coach_habit 도구를 써서 분석해줘.`
            : `습관 "${data?.habit.name}"에 대해 패턴을 분석하고 작은 행동을 제안해줘. coach_habit 도구를 써.`,
          trigger: "habit_detail_coach",
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `status ${res.status}`);
      setCoachMessage(j.text || "(빈 응답)");
      setCoachMeta({
        costUsd: j.costUsd ?? 0,
        durationMs: j.durationMs ?? 0,
      });
    } catch (e) {
      setError(`코칭 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCoaching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-8 p-6 max-w-5xl mx-auto w-full">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          로딩 중...
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-8 p-6 max-w-5xl mx-auto w-full">
        <Link href="/goals" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> 목표·회고로
        </Link>
        <div className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
          {error ?? "habit을 찾을 수 없습니다."}
        </div>
      </div>
    );
  }

  const heatmapCells = buildHeatmap(data.logs, 90);
  const recentNotes = data.logs
    .filter((l) => l.note && l.note.trim().length > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 20);

  return (
    <div className="flex flex-col gap-8 p-6 max-w-5xl mx-auto w-full">
      <Link href="/goals" className="text-sm text-primary inline-flex items-center gap-1 hover:underline w-fit">
        <ArrowLeft className="h-3.5 w-3.5" /> 목표·회고로
      </Link>

      <header className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{data.habit.name}</h1>
          {data.habit.description && (
            <p className="text-sm text-muted-foreground mt-1">{data.habit.description}</p>
          )}
        </div>
        <Button
          variant={data.streak.todayCompleted ? "outline" : "default"}
          onClick={() => toggleToday(!data.streak.todayCompleted)}
          className="gap-2"
        >
          {data.streak.todayCompleted ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              오늘 완료
            </>
          ) : (
            "오늘 체크"
          )}
        </Button>
      </header>

      {error && (
        <div className="border border-destructive/40 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="현재 스트릭"
          value={data.streak.current}
          unit="일"
          icon={<Flame className="h-3.5 w-3.5 text-amber-500" />}
        />
        <Stat label="최장 스트릭" value={data.streak.longest} unit="일" />
        <Stat
          label="14일 완료율"
          value={Math.round(data.rate14d.rate * 100)}
          unit="%"
          sub={`${data.rate14d.completed}/${data.rate14d.logged}`}
        />
        <Stat
          label="90일 완료율"
          value={Math.round(data.rate90d.rate * 100)}
          unit="%"
          sub={`${data.rate90d.completed}/${data.rate90d.logged}`}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          최근 90일
        </h2>
        <HabitHeatmap cells={heatmapCells} onCellClick={startEditNote} />
        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary" /> 완료
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-destructive/20 border border-destructive/40" /> 미완료
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-muted/40" /> 기록 없음
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary ring-1 ring-amber-400" /> 노트
          </span>
        </div>
      </section>

      {editingDate && (
        <section className="border border-border rounded-xl bg-card p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editingDate} 노트</h3>
            <button
              onClick={() => {
                setEditingDate(null);
                setNoteDraft("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              취소
            </button>
          </div>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="이 날 어땠어? (왜 못 했는지 / 어떻게 했는지)"
            rows={3}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary resize-y"
          />
          <Button onClick={saveNote} disabled={savingNote} size="sm" className="w-fit">
            {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "저장"}
          </Button>
        </section>
      )}

      {recentNotes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            노트 ({recentNotes.length}건)
          </h2>
          <ul className="flex flex-col gap-2">
            {recentNotes.map((l) => (
              <li
                key={l.date}
                className="border border-border rounded-lg bg-card p-3 flex items-start gap-3 cursor-pointer hover:bg-muted/40"
                onClick={() => {
                  setEditingDate(l.date);
                  setNoteDraft(l.note ?? "");
                }}
              >
                <span
                  className={cn(
                    "text-[11px] font-mono px-1.5 py-0.5 rounded border shrink-0",
                    l.completed
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-destructive/10 text-destructive border-destructive/30",
                  )}
                >
                  {l.date}
                </span>
                <p className="text-sm flex-1 whitespace-pre-wrap">{l.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border border-border rounded-2xl bg-card p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <AgentBadge englishName="soomin" size="sm" showName={false} />
          <h2 className="font-semibold">수민 코칭</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          최근 90일 패턴 + 평일/주말 비교를 자동 분석해 작은 행동 1-2개와 질문 1개를 제안합니다.
          비용 ~$0.02 (Sonnet 4.6).
        </p>
        <textarea
          value={struggle}
          onChange={(e) => setStruggle(e.target.value)}
          placeholder="어려움이 있다면 짧게 (선택). 예: '저녁이 되면 잊어요'"
          rows={2}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary resize-y"
        />
        <Button onClick={getCoaching} disabled={coaching} size="sm" className="gap-2 w-fit">
          {coaching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          코칭 받기
        </Button>
        {coachMessage && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap border-t border-border/60 pt-3">
            {coachMessage}
            {coachMeta && (
              <div className="mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground font-mono">
                {coachMeta.durationMs}ms · ${coachMeta.costUsd.toFixed(6)}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  sub,
  icon,
}: {
  label: string;
  value: number | string;
  unit?: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-xl bg-card p-3 flex flex-col items-center gap-0.5">
      <div className="flex items-baseline gap-1">
        {icon}
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {unit && (
          <span className="text-xs text-muted-foreground font-mono">{unit}</span>
        )}
      </div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {sub && (
        <span className="text-[10px] font-mono text-muted-foreground/70">{sub}</span>
      )}
    </div>
  );
}
