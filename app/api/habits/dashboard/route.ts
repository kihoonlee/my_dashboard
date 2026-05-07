// GET /api/habits/dashboard
// 메인 /goals 대시보드용 — 모든 활성 habits + 오늘 status + 스트릭 + 14d 완료율 + 일일 요약 한 번에.

import { NextResponse } from "next/server";
import { eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { habitLogs, habits } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeStreak, completionRate14d } from "@/lib/habits/streak";

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = isoDate(new Date());
  const since = new Date();
  since.setDate(since.getDate() - 89); // 90일 윈도우

  // 활성 habits
  const habitRows = await db
    .select()
    .from(habits)
    .where(eq(habits.archived, false))
    .orderBy(habits.createdAt);

  if (habitRows.length === 0) {
    return NextResponse.json({
      today,
      habits: [],
      summary: {
        total: 0,
        completedToday: 0,
        weekRate: 0,
      },
    });
  }

  // 모든 활성 habit의 90일 logs 한 번에
  const allLogs = await db
    .select({
      habitId: habitLogs.habitId,
      date: habitLogs.date,
      completed: habitLogs.completed,
      note: habitLogs.note,
    })
    .from(habitLogs)
    .where(gte(habitLogs.date, isoDate(since)));

  const logsByHabit = new Map<
    string,
    Array<{ date: string; completed: boolean; note: string | null }>
  >();
  for (const l of allLogs) {
    const arr = logsByHabit.get(l.habitId) ?? [];
    arr.push({ date: l.date, completed: l.completed, note: l.note });
    logsByHabit.set(l.habitId, arr);
  }

  const habitsOut = habitRows.map((h) => {
    const logs = (logsByHabit.get(h.id) ?? []).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    const streak = computeStreak(logs);
    const rate = completionRate14d(logs);
    const todayLog = logs.find((l) => l.date === today);
    return {
      id: h.id,
      name: h.name,
      description: h.description,
      colorHex: h.colorHex,
      todayCompleted: todayLog?.completed ?? false,
      todayLogged: !!todayLog,
      streak: streak.current,
      longestStreak: streak.longest,
      rate14d: rate.rate,
      logged14d: rate.logged,
    };
  });

  const completedToday = habitsOut.filter((h) => h.todayCompleted).length;

  // 이번 주 평균 완료율 (월~오늘)
  const weekStart = startOfWeek(new Date());
  const weekStartIso = isoDate(weekStart);
  const weekStats = await db.execute<{ logged: number; completed: number }>(sql`
    SELECT
      COUNT(*)::int AS logged,
      COUNT(*) FILTER (WHERE l.completed = true)::int AS completed
    FROM ${habitLogs} l
    JOIN ${habits} h ON h.id = l.habit_id AND h.archived = false
    WHERE l.date >= ${weekStartIso}::date
  `);
  const ws = (weekStats[0] as unknown as { logged: number; completed: number }) ?? {
    logged: 0,
    completed: 0,
  };
  const weekRate = ws.logged > 0 ? ws.completed / ws.logged : 0;

  return NextResponse.json({
    today,
    habits: habitsOut,
    summary: {
      total: habitsOut.length,
      completedToday,
      weekRate,
      weekCompleted: ws.completed,
      weekLogged: ws.logged,
    },
  });
}
