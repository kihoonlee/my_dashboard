// Agent 호출 가드. 호출 전 / 직후에 다음 검사:
// 1. agent.is_active 확인 (일시정지 상태면 즉시 거부)
// 2. 일·월 비용 한도 검사 — agent_logs 합산
// 3. 호출 후 5연속 오류면 자동 일시정지 (is_active=false + is_paused_reason 기록)

import { db } from "@/lib/db/client";
import { agents, agentLogs } from "@/lib/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: string; status: 403 | 429 };

/**
 * 호출 직전 검사. 거부되면 호출 자체를 막음 (route handler에서 즉시 응답).
 */
export async function checkBeforeInvoke(agentId: string): Promise<GuardResult> {
  const [agent] = await db
    .select({
      id: agents.id,
      isActive: agents.isActive,
      isPausedReason: agents.isPausedReason,
      dailyCostLimitUsd: agents.dailyCostLimitUsd,
      monthlyCostLimitUsd: agents.monthlyCostLimitUsd,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) return { ok: false, reason: "agent_not_found", status: 403 };
  if (!agent.isActive) {
    return {
      ok: false,
      reason: agent.isPausedReason ?? "paused",
      status: 403,
    };
  }

  // 비용 한도 검사
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todayCost, monthCost] = await Promise.all([
    db
      .select({ sum: sql<string>`COALESCE(SUM(${agentLogs.costUsd}), 0)` })
      .from(agentLogs)
      .where(
        and(
          eq(agentLogs.agentId, agentId),
          gte(agentLogs.createdAt, startOfDay),
        ),
      ),
    db
      .select({ sum: sql<string>`COALESCE(SUM(${agentLogs.costUsd}), 0)` })
      .from(agentLogs)
      .where(
        and(
          eq(agentLogs.agentId, agentId),
          gte(agentLogs.createdAt, startOfMonth),
        ),
      ),
  ]);

  const todaySum = parseFloat(todayCost[0]?.sum ?? "0");
  const monthSum = parseFloat(monthCost[0]?.sum ?? "0");
  const dailyLimit = agent.dailyCostLimitUsd
    ? parseFloat(agent.dailyCostLimitUsd)
    : null;
  const monthlyLimit = agent.monthlyCostLimitUsd
    ? parseFloat(agent.monthlyCostLimitUsd)
    : null;

  if (dailyLimit !== null && todaySum >= dailyLimit) {
    return { ok: false, reason: "daily_cost_limit_exceeded", status: 429 };
  }
  if (monthlyLimit !== null && monthSum >= monthlyLimit) {
    return { ok: false, reason: "monthly_cost_limit_exceeded", status: 429 };
  }

  return { ok: true };
}

/**
 * 호출 직후 검사. 최근 5건이 모두 에러면 agent를 자동 일시정지.
 * agent_logs.insert가 끝난 다음에 호출.
 */
export async function checkAfterInvoke(agentId: string): Promise<void> {
  const recent = await db
    .select({ isError: agentLogs.isError })
    .from(agentLogs)
    .where(eq(agentLogs.agentId, agentId))
    .orderBy(desc(agentLogs.createdAt))
    .limit(5);

  if (recent.length < 5) return;
  if (!recent.every((r) => r.isError)) return;

  await db
    .update(agents)
    .set({
      isActive: false,
      isPausedReason: "5_consecutive_errors",
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  console.warn(`[guard] agent ${agentId} auto-paused: 5 consecutive errors`);
}
