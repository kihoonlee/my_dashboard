// 매일 아침 5시 — 뉴스 RSS 동기화 + 데일리 브리핑 생성 + 데일리 인사이트 갱신.
// vercel.json에서 schedule: "0 5 * * *" (UTC 기준 — Asia/Seoul 14시이므로 KST 5시는 "0 20 * * *" UTC)

import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest, getCronUserId } from "@/lib/cron/auth";
import { syncNewsSources } from "@/lib/news/sync";
import { generateDailyBriefing } from "@/lib/news/briefing";
import { generateDailyInsight } from "@/lib/insights/daily";
import { db } from "@/lib/db/client";
import {
  habits,
  habitLogs,
  todos,
  users,
  weeklyReviews,
} from "@/lib/db/schema";
import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
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

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const userId = await getCronUserId();
  const startedAt = Date.now();
  const results: Record<string, unknown> = {};

  // 1) News RSS 동기화
  if (userId) {
    try {
      results.newsSync = await syncNewsSources({ userId });
    } catch (e) {
      results.newsSyncError = e instanceof Error ? e.message : String(e);
    }
  } else {
    results.newsSyncError = "no cron user (set ALLOWED_EMAIL)";
  }

  // 2) 데일리 브리핑 생성
  try {
    const briefing = await generateDailyBriefing();
    results.briefing = {
      date: briefing.date,
      itemsConsidered: briefing.itemsConsidered,
      costUsd: briefing.costUsd,
    };
  } catch (e) {
    results.briefingError = e instanceof Error ? e.message : String(e);
  }

  // 3) 데일리 인사이트 (수민) — 컨텍스트 수집 후 LLM 호출
  if (userId) {
    try {
      const today = isoDate(new Date());
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const sinceIso = isoDate(since);

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

      const weekStartIso = isoDate(startOfWeek(new Date()));
      const [review] = await db
        .select({ id: weeklyReviews.id })
        .from(weeklyReviews)
        .where(eq(weeklyReviews.weekStart, weekStartIso))
        .limit(1);

      const insight = await generateDailyInsight({
        habits: habitsCtx,
        pendingTodos,
        hasWeeklyReview: !!review,
      });

      // settings_json에 저장
      const stored = { ...insight, date: today };
      await db
        .update(users)
        .set({
          settingsJson: sql`
            COALESCE(${users.settingsJson}, '{}'::jsonb)
            || jsonb_build_object('todayInsight', ${JSON.stringify(stored)}::jsonb)
          `,
        })
        .where(eq(users.id, userId));

      results.insight = {
        insight: insight.insight,
        focusHabit: insight.focusHabit,
        tone: insight.tone,
        costUsd: insight.costUsd,
      };
    } catch (e) {
      results.insightError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    ...results,
  });
}
