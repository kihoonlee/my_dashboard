// GET /api/home/dashboard — 홈 위젯 4종(알림 / Todo / 캘린더 / 에이전트)을 한 번에.
// RTT 1회로 홈 진입 속도 최적화.

import { NextResponse } from "next/server";
import {
  and,
  desc,
  eq,
  gte,
  isNull,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  agentLogs,
  agents,
  calendarEventsCache,
  notifications,
  todos,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/api/auth";
import { tsTz } from "@/lib/db/sql-utils";

type HourlyRow = { hour: number; calls: number; cost_usd: string };
type PerAgentRow = {
  english_name: string;
  name: string;
  color_hex: string;
  avatar_emoji: string | null;
  daily_cost_usd: string;
  daily_calls: number;
};
type AgentTotalRow = {
  daily_cost_usd: string;
  monthly_cost_usd: string;
  daily_calls: number;
  daily_errors: number;
};

function todayDateString(): string {
  // YYYY-MM-DD (server-local). DB의 date 컬럼과 일치하면 충분.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const today = todayDateString();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);
  const calendarEnd = new Date();
  calendarEnd.setDate(calendarEnd.getDate() + 14);

  const [
    notifUnreadRow,
    notifRecent,
    todoDueToday,
    todoOverdue,
    todoCompletedToday,
    todoCompletedThisWeek,
    todoTotalActive,
    calendarUpcoming,
    agentHourly,
    agentPerAgent,
    agentTotals,
  ] = await Promise.all([
    db
      .select({
        unread: sql<number>`coalesce(count(*) filter (where ${notifications.readAt} is null), 0)::int`,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId)),
    db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        title: notifications.title,
        bodyMd: notifications.bodyMd,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(3),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(todos)
      .where(
        and(
          eq(todos.userId, userId),
          eq(todos.archived, false),
          isNull(todos.completedAt),
          eq(todos.dueDate, today),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(todos)
      .where(
        and(
          eq(todos.userId, userId),
          eq(todos.archived, false),
          isNull(todos.completedAt),
          sql`${todos.dueDate} is not null`,
          lt(todos.dueDate, today),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(todos)
      .where(
        and(
          eq(todos.userId, userId),
          sql`${todos.completedAt} >= ${tsTz(dayStart)}`,
          sql`${todos.completedAt} < ${tsTz(dayEnd)}`,
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(todos)
      .where(
        and(
          eq(todos.userId, userId),
          sql`${todos.completedAt} >= ${tsTz(weekAgo)}`,
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(todos)
      .where(
        and(
          eq(todos.userId, userId),
          eq(todos.archived, false),
          isNull(todos.completedAt),
        ),
      ),
    db
      .select({
        id: calendarEventsCache.id,
        title: calendarEventsCache.title,
        startAt: calendarEventsCache.startAt,
        endAt: calendarEventsCache.endAt,
        location: calendarEventsCache.location,
        calendarColorHex: calendarEventsCache.calendarColorHex,
        calendarSummary: calendarEventsCache.calendarSummary,
      })
      .from(calendarEventsCache)
      .where(
        and(
          gte(calendarEventsCache.endAt, new Date()),
          lte(calendarEventsCache.startAt, calendarEnd),
        ),
      )
      .orderBy(calendarEventsCache.startAt)
      .limit(3),
    // 24h 시간대별 호출 수 + 비용
    db.execute<HourlyRow>(sql`
      SELECT
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Seoul')::int AS hour,
        COUNT(*)::int AS calls,
        COALESCE(SUM(cost_usd), 0)::text AS cost_usd
      FROM ${agentLogs}
      WHERE created_at >= ${tsTz(dayStart)}
        AND created_at < ${tsTz(dayEnd)}
      GROUP BY hour
      ORDER BY hour
    `),
    // 오늘 에이전트별 비용/호출
    db.execute<PerAgentRow>(sql`
      SELECT
        a.english_name,
        a.name,
        a.color_hex,
        a.avatar_emoji,
        COALESCE(SUM(l.cost_usd), 0)::text AS daily_cost_usd,
        COUNT(l.id)::int AS daily_calls
      FROM ${agents} a
      LEFT JOIN ${agentLogs} l
        ON l.agent_id = a.id
       AND l.created_at >= ${tsTz(dayStart)}
       AND l.created_at < ${tsTz(dayEnd)}
      GROUP BY a.id, a.english_name, a.name, a.color_hex, a.avatar_emoji, a.created_at
      ORDER BY a.created_at
    `),
    db.execute<AgentTotalRow>(sql`
      SELECT
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN cost_usd ELSE 0 END), 0)::text AS daily_cost_usd,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN cost_usd ELSE 0 END), 0)::text AS monthly_cost_usd,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS daily_calls,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()) AND is_error)::int AS daily_errors
      FROM ${agentLogs}
    `),
  ]);

  const hourlyMap = new Map<number, { calls: number; costUsd: number }>();
  for (const r of agentHourly as unknown as HourlyRow[]) {
    hourlyMap.set(r.hour, {
      calls: r.calls,
      costUsd: parseFloat(r.cost_usd),
    });
  }
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const v = hourlyMap.get(h);
    return { hour: h, calls: v?.calls ?? 0, costUsd: v?.costUsd ?? 0 };
  });

  const perAgent = (agentPerAgent as unknown as PerAgentRow[]).map((r) => ({
    englishName: r.english_name,
    name: r.name,
    colorHex: r.color_hex,
    avatarEmoji: r.avatar_emoji,
    dailyCostUsd: parseFloat(r.daily_cost_usd),
    dailyCalls: r.daily_calls,
  }));

  const totals = (agentTotals as unknown as AgentTotalRow[])[0] ?? {
    daily_cost_usd: "0",
    monthly_cost_usd: "0",
    daily_calls: 0,
    daily_errors: 0,
  };

  return NextResponse.json({
    notifications: {
      unread: notifUnreadRow[0]?.unread ?? 0,
      recent: notifRecent,
    },
    todos: {
      dueToday: todoDueToday[0]?.n ?? 0,
      overdue: todoOverdue[0]?.n ?? 0,
      completedToday: todoCompletedToday[0]?.n ?? 0,
      completedThisWeek: todoCompletedThisWeek[0]?.n ?? 0,
      totalActive: todoTotalActive[0]?.n ?? 0,
    },
    calendar: {
      upcoming: calendarUpcoming,
    },
    agents: {
      dailyCostUsd: parseFloat(totals.daily_cost_usd),
      monthlyCostUsd: parseFloat(totals.monthly_cost_usd),
      dailyCalls: totals.daily_calls,
      dailyErrors: totals.daily_errors,
      hourly,
      perAgent,
    },
  });
}
