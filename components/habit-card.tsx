"use client";

// 습관 카드 — /goals 메인 대시보드 그리드용.
// 메인 영역 클릭 = 오늘 토글. 우측 화살표 = detail 페이지.

import Link from "next/link";
import { Check, ChevronRight, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardHabit = {
  id: string;
  name: string;
  description: string | null;
  colorHex: string | null;
  todayCompleted: boolean;
  todayLogged: boolean;
  streak: number;
  longestStreak: number;
  rate14d: number;
  logged14d: number;
};

export function HabitCard({
  habit,
  onToggle,
}: {
  habit: DashboardHabit;
  onToggle: (habitId: string, nextCompleted: boolean) => void;
}) {
  const pct = Math.round(habit.rate14d * 100);
  return (
    <div
      className={cn(
        "border border-border rounded-xl p-3 flex flex-col gap-2 transition-colors",
        habit.todayCompleted
          ? "bg-primary/5 border-primary/30"
          : "bg-card hover:bg-muted/40",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onToggle(habit.id, !habit.todayCompleted)}
          aria-label={habit.todayCompleted ? "완료 취소" : "오늘 완료"}
          className={cn(
            "shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition-colors",
            habit.todayCompleted
              ? "bg-primary border-primary text-primary-foreground"
              : "border-border hover:border-primary/60",
          )}
        >
          {habit.todayCompleted && <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => onToggle(habit.id, !habit.todayCompleted)}
          className="flex-1 min-w-0 text-left"
        >
          <div
            className={cn(
              "text-sm font-medium truncate",
              habit.todayCompleted && "text-primary",
            )}
          >
            {habit.name}
          </div>
          {habit.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
              {habit.description}
            </p>
          )}
        </button>
        <Link
          href={`/goals/habits/${habit.id}`}
          aria-label="상세"
          className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
        <div
          className={cn(
            "inline-flex items-center gap-1",
            habit.streak > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}
          title={`최장 ${habit.longestStreak}일`}
        >
          <Flame className="h-3 w-3" />
          {habit.streak}일
        </div>
        <div className="text-muted-foreground">
          14d {habit.logged14d > 0 ? `${pct}%` : "—"}
        </div>
      </div>
      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
