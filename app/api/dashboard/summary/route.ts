// GET /api/dashboard/summary
// 홈 대시보드 위젯 데이터 한 번에:
//   - team: 10 agents + 오늘 호출/에러/비용
//   - today: 미완료 todo 카운트 + 가장 가까운 일정 + 오늘 LLM 비용 합산
//   - activity: 최근 agent_logs 8건 (agent name 조인)

import { NextResponse } from "next/server";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  agentLogs,
  agents,
  calendarEventsCache,
  todos,
} from "@/lib/db/schema";
import { tsTz } from "@/lib/db/sql-utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  // ── 1. team status ────────────────────────────────────
  const agentRows = await db.execute<{
    id: string;
    name: string;
    english_name: string;
    role: string;
    color_hex: string;
    avatar_emoji: string | null;
    is_active: boolean;
    is_paused_reason: string | null;
    daily_cost_limit_usd: string | null;
    today_calls: number;
    today_errors: number;
    today_cost_usd: string;
    last_call_at: Date | null;
  }>(sql`
    SELECT
      a.id::text AS id,
      a.name,
      a.english_name,
      a.role,
      a.color_hex,
      a.avatar_emoji,
      a.is_active,
      a.is_paused_reason,
      a.daily_cost_limit_usd::text,
      COUNT(l.id) FILTER (WHERE l.created_at >= ${tsTz(startOfDay)})::int AS today_calls,
      COUNT(l.id) FILTER (WHERE l.created_at >= ${tsTz(startOfDay)} AND l.is_error = true)::int AS today_errors,
      COALESCE(SUM(l.cost_usd) FILTER (WHERE l.created_at >= ${tsTz(startOfDay)}), 0)::text AS today_cost_usd,
      MAX(l.created_at) AS last_call_at
    FROM ${agents} a
    LEFT JOIN ${agentLogs} l ON l.agent_id = a.id
    GROUP BY a.id
    ORDER BY a.is_active DESC, a.created_at ASC
  `);

  const team = (agentRows as unknown as Array<{
    id: string;
    name: string;
    english_name: string;
    role: string;
    color_hex: string;
    avatar_emoji: string | null;
    is_active: boolean;
    is_paused_reason: string | null;
    daily_cost_limit_usd: string | null;
    today_calls: number;
    today_errors: number;
    today_cost_usd: string;
    last_call_at: Date | null;
  }>).map((r) => {
    const dailyLimit = r.daily_cost_limit_usd
      ? parseFloat(r.daily_cost_limit_usd)
      : null;
    const todayCost = parseFloat(r.today_cost_usd);
    const utilization =
      dailyLimit && dailyLimit > 0 ? todayCost / dailyLimit : 0;
    return {
      id: r.id,
      name: r.name,
      englishName: r.english_name,
      role: r.role,
      colorHex: r.color_hex,
      avatarEmoji: r.avatar_emoji,
      isActive: r.is_active,
      isPausedReason: r.is_paused_reason,
      todayCalls: r.today_calls,
      todayErrors: r.today_errors,
      todayCostUsd: todayCost,
      dailyCostLimitUsd: dailyLimit,
      utilization,
      lastCallAt: r.last_call_at,
    };
  });

  const teamSummary = {
    activeCount: team.filter((t) => t.isActive && !t.isPausedReason).length,
    pausedCount: team.filter((t) => !t.isActive || t.isPausedReason).length,
    totalCallsToday: team.reduce((acc, t) => acc + t.todayCalls, 0),
    totalErrorsToday: team.reduce((acc, t) => acc + t.todayErrors, 0),
    totalCostUsdToday: team.reduce((acc, t) => acc + t.todayCostUsd, 0),
  };

  // ── 2. today summary (todos + next event) ──────────
  const today = isoToday();
  const todosCountRow = await db
    .select({ cnt: sql<number>`COUNT(*)::int` })
    .from(todos)
    .where(
      and(
        inArray(todos.status, ["todo", "doing"]),
        or(lte(todos.dueDate, today), isNull(todos.dueDate)),
      ),
    );
  const pendingTodos = todosCountRow[0]?.cnt ?? 0;

  const nextEvent = await db
    .select({
      id: calendarEventsCache.id,
      title: calendarEventsCache.title,
      startAt: calendarEventsCache.startAt,
      endAt: calendarEventsCache.endAt,
      location: calendarEventsCache.location,
    })
    .from(calendarEventsCache)
    .where(gte(calendarEventsCache.startAt, now))
    .orderBy(asc(calendarEventsCache.startAt))
    .limit(1);

  // ── 3. recent activity ────────────────────────────────
  const recentLogs = await db
    .select({
      id: agentLogs.id,
      trigger: agentLogs.trigger,
      durationMs: agentLogs.durationMs,
      costUsd: agentLogs.costUsd,
      isError: agentLogs.isError,
      createdAt: agentLogs.createdAt,
      agentEnglishName: agents.englishName,
      agentName: agents.name,
    })
    .from(agentLogs)
    .leftJoin(agents, eq(agentLogs.agentId, agents.id))
    .orderBy(desc(agentLogs.createdAt))
    .limit(8);

  return NextResponse.json({
    team: {
      summary: teamSummary,
      agents: team,
    },
    today: {
      pendingTodos,
      nextEvent: nextEvent[0] ?? null,
    },
    activity: recentLogs.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      durationMs: r.durationMs,
      costUsd: parseFloat(r.costUsd),
      isError: r.isError,
      createdAt: r.createdAt,
      agentEnglishName: r.agentEnglishName,
      agentName: r.agentName,
    })),
  });
}
