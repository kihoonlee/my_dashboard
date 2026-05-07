// GET  /api/insights/today — users.settings_json.todayInsight 캐시 조회 (오늘 거 없으면 null).
// POST /api/insights/today — LLM 호출해 새로 생성 + jsonb 저장.

import { NextResponse } from "next/server";
import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  habitLogs,
  habits,
  todos,
  users,
  weeklyReviews,
  yearPixels,
} from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/users/ensure";
import { generateDailyInsight, type InsightResult } from "@/lib/insights/daily";
import { completionRate14d } from "@/lib/habits/streak";

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

type StoredInsight = InsightResult & { date: string };

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = await ensureUser(user);

  const today = isoDate(new Date());
  const [u] = await db
    .select({ settings: users.settingsJson })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const stored = (u?.settings as Record<string, unknown> | null)?.todayInsight as
    | StoredInsight
    | undefined;
  if (!stored || stored.date !== today) {
    return NextResponse.json({ insight: null, today });
  }
  return NextResponse.json({ insight: stored, today });
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = await ensureUser(user);

  const today = isoDate(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = isoDate(yesterday);
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const sinceIso = isoDate(since);

  // 활성 habits + 14d 완료율
  const habitRows = await db
    .select()
    .from(habits)
    .where(eq(habits.archived, false))
    .orderBy(asc(habits.createdAt))
    .limit(10);

  const allLogs = await db
    .select({
      habitId: habitLogs.habitId,
      date: habitLogs.date,
      completed: habitLogs.completed,
      note: habitLogs.note,
    })
    .from(habitLogs)
    .where(gte(habitLogs.date, sinceIso));
  const logsByHabit = new Map<
    string,
    Array<{ date: string; completed: boolean; note: string | null }>
  >();
  for (const l of allLogs) {
    const arr = logsByHabit.get(l.habitId) ?? [];
    arr.push(l);
    logsByHabit.set(l.habitId, arr);
  }

  const habitsCtx = habitRows.map((h) => {
    const logs = (logsByHabit.get(h.id) ?? []).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    const r = completionRate14d(logs);
    return { name: h.name, rate14d: r.rate, loggedDays: r.logged };
  });

  // 미완료 todo 카운트
  const pendingRow = await db
    .select({ cnt: sql<number>`COUNT(*)::int` })
    .from(todos)
    .where(
      and(
        sql`${todos.status} IN ('todo', 'doing')`,
        or(lte(todos.dueDate, today), isNull(todos.dueDate)),
      ),
    );
  const pendingTodos = pendingRow[0]?.cnt ?? 0;

  // 어제 mood
  const [yesterdayPixel] = await db
    .select()
    .from(yearPixels)
    .where(eq(yearPixels.date, yesterdayIso))
    .limit(1);
  const yesterdayMood = yesterdayPixel?.moodScore ?? null;

  // 이번 주 회고 존재 여부
  const weekStart = isoDate(startOfWeek(new Date()));
  const [review] = await db
    .select({ id: weeklyReviews.id })
    .from(weeklyReviews)
    .where(eq(weeklyReviews.weekStart, weekStart))
    .limit(1);
  const hasWeeklyReview = !!review;

  let result: InsightResult;
  try {
    result = await generateDailyInsight({
      habits: habitsCtx,
      pendingTodos,
      yesterdayMood,
      hasWeeklyReview,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "generate_failed", message: msg },
      { status: 500 },
    );
  }

  const stored: StoredInsight = { ...result, date: today };
  await db
    .update(users)
    .set({
      settingsJson: sql`
        COALESCE(${users.settingsJson}, '{}'::jsonb)
        || jsonb_build_object('todayInsight', ${JSON.stringify(stored)}::jsonb)
      `,
    })
    .where(eq(users.id, userId));

  return NextResponse.json({ insight: stored, today });
}
