// GET /api/agents/list
// 10명 agent 목록 + 오늘/이번 달 비용 사용률 + 최근 호출 메타.
// /agents 일람 페이지가 호출.

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agents, agentLogs } from "@/lib/db/schema";

type Row = {
  id: string;
  english_name: string;
  name: string;
  role: string;
  description: string;
  model: string;
  color_hex: string;
  avatar_emoji: string | null;
  is_active: boolean;
  is_paused_reason: string | null;
  daily_cost_limit_usd: string | null;
  monthly_cost_limit_usd: string | null;
  // aggregates
  daily_cost_usd: string;
  monthly_cost_usd: string;
  daily_calls: number;
  daily_errors: number;
  last_call_at: string | null;
};

export async function GET() {
  const rows = (await db.execute<Row>(sql`
    WITH log_agg AS (
      SELECT
        agent_id,
        SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN cost_usd ELSE 0 END)::numeric AS daily_cost_usd,
        SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN cost_usd ELSE 0 END)::numeric AS monthly_cost_usd,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS daily_calls,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()) AND is_error)::int AS daily_errors,
        MAX(created_at) AS last_call_at
      FROM ${agentLogs}
      GROUP BY agent_id
    )
    SELECT
      a.id::text AS id,
      a.english_name, a.name, a.role, a.description,
      a.model, a.color_hex, a.avatar_emoji,
      a.is_active, a.is_paused_reason,
      a.daily_cost_limit_usd, a.monthly_cost_limit_usd,
      COALESCE(l.daily_cost_usd, 0)::text AS daily_cost_usd,
      COALESCE(l.monthly_cost_usd, 0)::text AS monthly_cost_usd,
      COALESCE(l.daily_calls, 0)::int AS daily_calls,
      COALESCE(l.daily_errors, 0)::int AS daily_errors,
      l.last_call_at
    FROM ${agents} a
    LEFT JOIN log_agg l ON l.agent_id = a.id
    ORDER BY a.created_at
  `)) as unknown as Row[];

  return NextResponse.json({
    agents: rows.map((r) => ({
      id: r.id,
      englishName: r.english_name,
      name: r.name,
      role: r.role,
      description: r.description,
      model: r.model,
      colorHex: r.color_hex,
      avatarEmoji: r.avatar_emoji,
      isActive: r.is_active,
      isPausedReason: r.is_paused_reason,
      dailyCostLimitUsd: r.daily_cost_limit_usd
        ? parseFloat(r.daily_cost_limit_usd)
        : null,
      monthlyCostLimitUsd: r.monthly_cost_limit_usd
        ? parseFloat(r.monthly_cost_limit_usd)
        : null,
      dailyCostUsd: parseFloat(r.daily_cost_usd),
      monthlyCostUsd: parseFloat(r.monthly_cost_usd),
      dailyCalls: r.daily_calls,
      dailyErrors: r.daily_errors,
      lastCallAt: r.last_call_at,
    })),
  });
}
