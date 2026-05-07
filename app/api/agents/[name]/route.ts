// GET /api/agents/[name]   — 단일 agent 상세 + 최근 활동 + 프롬프트 버전 히스토리
// PATCH /api/agents/[name] — 메타 갱신 (system_prompt 변경 시 agent_prompt_versions에 archive)
// invoke route는 동일 [name] 폴더의 invoke/route.ts에 분리되어 있음.

import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agents, agentLogs, agentPromptVersions } from "@/lib/db/schema";
import { tsTz } from "@/lib/db/sql-utils";

type AgentRow = typeof agents.$inferSelect;

const EDITABLE_FIELDS = new Set([
  "systemPrompt",
  "model",
  "temperature",
  "maxTokens",
  "topP",
  "isActive",
  "isPausedReason",
  "dailyCostLimitUsd",
  "monthlyCostLimitUsd",
  "triggerConfig",
  "toolPermissions",
  "description",
  "avatarEmoji",
  "colorHex",
  "changeNote",
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  const [agent] = (await db
    .select()
    .from(agents)
    .where(eq(agents.englishName, name))
    .limit(1)) as AgentRow[];
  if (!agent) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
  }

  // 최근 호출 50건
  const recentCalls = await db
    .select({
      id: agentLogs.id,
      trigger: agentLogs.trigger,
      inputTokens: agentLogs.inputTokens,
      outputTokens: agentLogs.outputTokens,
      durationMs: agentLogs.durationMs,
      costUsd: agentLogs.costUsd,
      isError: agentLogs.isError,
      errorMessage: agentLogs.errorMessage,
      createdAt: agentLogs.createdAt,
    })
    .from(agentLogs)
    .where(eq(agentLogs.agentId, agent.id))
    .orderBy(desc(agentLogs.createdAt))
    .limit(50);

  // 비용 사용률 (당일/당월).
  const since30d = new Date();
  since30d.setDate(since30d.getDate() - 30);
  const aggRows = (await db.execute<{
    daily_cost: string;
    monthly_cost: string;
    daily_calls: number;
    last_30d_calls: number;
  }>(sql`
    SELECT
      COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', now()) THEN cost_usd ELSE 0 END), 0)::text AS daily_cost,
      COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', now()) THEN cost_usd ELSE 0 END), 0)::text AS monthly_cost,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS daily_calls,
      COUNT(*)::int AS last_30d_calls
    FROM ${agentLogs}
    WHERE agent_id = ${agent.id} AND created_at >= ${tsTz(since30d)}
  `)) as unknown as Array<{
    daily_cost: string;
    monthly_cost: string;
    daily_calls: number;
    last_30d_calls: number;
  }>;
  const agg = aggRows[0] ?? {
    daily_cost: "0",
    monthly_cost: "0",
    daily_calls: 0,
    last_30d_calls: 0,
  };

  // 프롬프트 버전 히스토리 (최신순)
  const versions = await db
    .select({
      id: agentPromptVersions.id,
      version: agentPromptVersions.version,
      systemPrompt: agentPromptVersions.systemPrompt,
      changedBy: agentPromptVersions.changedBy,
      changeNote: agentPromptVersions.changeNote,
      createdAt: agentPromptVersions.createdAt,
    })
    .from(agentPromptVersions)
    .where(eq(agentPromptVersions.agentId, agent.id))
    .orderBy(desc(agentPromptVersions.version));

  return NextResponse.json({
    agent: {
      id: agent.id,
      englishName: agent.englishName,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      model: agent.model,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      topP: agent.topP,
      systemPrompt: agent.systemPrompt,
      colorHex: agent.colorHex,
      avatarEmoji: agent.avatarEmoji,
      isActive: agent.isActive,
      isPausedReason: agent.isPausedReason,
      triggerConfig: agent.triggerConfig,
      toolPermissions: agent.toolPermissions,
      dailyCostLimitUsd: agent.dailyCostLimitUsd
        ? parseFloat(agent.dailyCostLimitUsd)
        : null,
      monthlyCostLimitUsd: agent.monthlyCostLimitUsd
        ? parseFloat(agent.monthlyCostLimitUsd)
        : null,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    },
    stats: {
      dailyCostUsd: parseFloat(agg.daily_cost),
      monthlyCostUsd: parseFloat(agg.monthly_cost),
      dailyCalls: agg.daily_calls,
      last30dCalls: agg.last_30d_calls,
    },
    recentCalls,
    promptVersions: versions,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const [existing] = (await db
    .select()
    .from(agents)
    .where(eq(agents.englishName, name))
    .limit(1)) as AgentRow[];
  if (!existing) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
  }

  // 화이트리스트된 필드만 빌드
  const update: Record<string, unknown> = {};
  for (const k of Object.keys(body)) {
    if (!EDITABLE_FIELDS.has(k)) continue;
    if (k === "changeNote") continue; // 별도 처리
    update[k] = body[k];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  // numeric 필드 정규화 (string 또는 number 모두 허용 → string for decimal)
  for (const decimalField of [
    "temperature",
    "topP",
    "dailyCostLimitUsd",
    "monthlyCostLimitUsd",
  ]) {
    if (decimalField in update && update[decimalField] !== null) {
      const v = update[decimalField];
      if (typeof v === "number") update[decimalField] = String(v);
    }
  }

  // system_prompt가 변경되었으면 이전 버전을 agent_prompt_versions에 archive
  const promptChanged =
    typeof update.systemPrompt === "string" &&
    update.systemPrompt !== existing.systemPrompt;

  if (promptChanged) {
    const [latestVer] = await db
      .select({ version: agentPromptVersions.version })
      .from(agentPromptVersions)
      .where(eq(agentPromptVersions.agentId, existing.id))
      .orderBy(desc(agentPromptVersions.version))
      .limit(1);
    const nextVersion = (latestVer?.version ?? 0) + 1;

    // 이전 system_prompt를 nextVersion 직전 번호로 archive — 즉 현재 버전을 보존
    await db.insert(agentPromptVersions).values({
      agentId: existing.id,
      version: nextVersion,
      systemPrompt: existing.systemPrompt,
      changedBy: "user",
      changeNote: typeof body.changeNote === "string" ? body.changeNote : null,
    });
  }

  update.updatedAt = new Date();

  const [updated] = await db
    .update(agents)
    .set(update)
    .where(eq(agents.id, existing.id))
    .returning({
      id: agents.id,
      englishName: agents.englishName,
      systemPrompt: agents.systemPrompt,
      isActive: agents.isActive,
      isPausedReason: agents.isPausedReason,
      model: agents.model,
      temperature: agents.temperature,
      maxTokens: agents.maxTokens,
      dailyCostLimitUsd: agents.dailyCostLimitUsd,
      monthlyCostLimitUsd: agents.monthlyCostLimitUsd,
    });

  return NextResponse.json({
    agent: updated,
    promptArchived: promptChanged,
  });
}

// 미사용 import 회피
void and;
void gte;
