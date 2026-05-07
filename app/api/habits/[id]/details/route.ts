// GET /api/habits/[id]/details
// 단일 habit + 90일 logs (날짜+completed+note) + 스트릭 데이터.

import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gte, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { habitLogs, habits } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeStreak, completionRate14d } from "@/lib/habits/streak";

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const [habit] = await db.select().from(habits).where(eq(habits.id, id)).limit(1);
  if (!habit) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const since = new Date();
  since.setDate(since.getDate() - 89);

  const logs = await db
    .select({
      date: habitLogs.date,
      completed: habitLogs.completed,
      note: habitLogs.note,
    })
    .from(habitLogs)
    .where(and(eq(habitLogs.habitId, id), gte(habitLogs.date, isoDate(since))))
    .orderBy(asc(habitLogs.date));

  const streak = computeStreak(logs);
  const rate14d = completionRate14d(logs);

  // 90일 완료율
  let logged90 = 0;
  let completed90 = 0;
  for (const l of logs) {
    logged90++;
    if (l.completed) completed90++;
  }

  return NextResponse.json({
    habit,
    logs,
    streak,
    rate14d,
    rate90d: {
      completed: completed90,
      logged: logged90,
      rate: logged90 > 0 ? completed90 / logged90 : 0,
    },
  });
}
