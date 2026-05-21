// 메인 에이전트(지원) 전용 도구.
// - web_search: Anthropic web_search_20250305 server tool을 단발성으로 호출하는 wrapper
// - list_agent_health: 6명 에이전트의 최근 24h 호출/에러/비용 요약
// - send_notification: lib/notifications/dispatch.ts 로 위임
// - start_discussion: lib/discussions/runner.ts 로 위임 (비동기 시작, 즉시 반환)

import type { AgentTool } from "@/lib/anthropic/client";
import { db } from "@/lib/db/client";
import { agentLogs, agents } from "@/lib/db/schema";
import { and, gte, eq, sql } from "drizzle-orm";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { startDiscussion } from "@/lib/discussions/runner";
import { getAnthropicClient } from "@/lib/llm/anthropic-impl";

// ---- web_search ----
export const webSearchTool: AgentTool = {
  name: "web_search",
  description:
    "최신 시장·트렌드·기술 동향을 실시간으로 웹에서 검색해 요약. query는 한국어 또는 영어 자연어. 응답에는 출처 URL이 포함됨.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "검색어" },
      max_results: {
        type: "integer",
        description: "최대 사용 횟수(기본 3)",
      },
    },
    required: ["query"],
  },
};

export async function runWebSearch(
  input: Record<string, unknown>,
): Promise<
  | { ok: true; result: { text: string; citations?: unknown[] } }
  | { ok: false; error: string }
> {
  const query = typeof input.query === "string" ? input.query : "";
  if (!query) return { ok: false, error: "query is required" };
  const max =
    typeof input.max_results === "number" && input.max_results > 0
      ? Math.min(5, Math.floor(input.max_results))
      : 3;

  try {
    const client = await getAnthropicClient();
    // Haiku로 비용 최소화. web_search는 server tool — Anthropic이 자체 실행하고 결과를 stitch.
    // server tool은 SDK 타입에 명시되지 않은 변형이라 강제 캐스트.
    // 자체 검증 — runtime에서 Anthropic이 형식 검증.
    const serverTools = [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: max,
      },
    ] as unknown as Parameters<typeof client.messages.create>[0]["tools"];

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      tools: serverTools,
      messages: [
        {
          role: "user",
          content: `다음 주제를 웹에서 검색하고 한국어로 3-5문장 요약. 출처 URL은 마지막에 - 표시로 나열.\n\n${query}`,
        },
      ],
    });

    const textBlocks: string[] = [];
    const citations: unknown[] = [];
    for (const block of message.content) {
      if (block.type === "text") {
        textBlocks.push(block.text);
        if ("citations" in block && Array.isArray(block.citations)) {
          citations.push(...block.citations);
        }
      }
    }
    const text = textBlocks.join("\n").trim();
    if (!text) {
      return {
        ok: true,
        result: { text: "검색 결과를 가져오지 못했습니다.", citations: [] },
      };
    }
    return { ok: true, result: { text, citations } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `web_search failed: ${msg}` };
  }
}

// ---- list_agent_health ----
export const listAgentHealthTool: AgentTool = {
  name: "list_agent_health",
  description:
    "6명 에이전트(main/assistant/daily/diary/memo/calendar) 의 최근 24시간 호출 / 에러 / 비용 / 활성 상태를 요약. 메인 비서가 인사팀장 역할로 팀 건강 점검할 때 사용.",
  input_schema: { type: "object", properties: {} },
};

export async function runListAgentHealth(): Promise<{
  ok: true;
  result: {
    count: number;
    items: Array<{
      englishName: string;
      name: string;
      isActive: boolean;
      pausedReason: string | null;
      calls24h: number;
      errors24h: number;
      costUsd24h: number;
    }>;
  };
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: agents.id,
      englishName: agents.englishName,
      name: agents.name,
      isActive: agents.isActive,
      pausedReason: agents.isPausedReason,
    })
    .from(agents);

  const items = await Promise.all(
    rows.map(async (a) => {
      const [stats] = await db
        .select({
          calls: sql<number>`coalesce(count(*), 0)::int`,
          errors: sql<number>`coalesce(sum(case when ${agentLogs.isError} then 1 else 0 end), 0)::int`,
          cost: sql<string>`coalesce(sum(${agentLogs.costUsd}), 0)::text`,
        })
        .from(agentLogs)
        .where(
          and(eq(agentLogs.agentId, a.id), gte(agentLogs.createdAt, since)),
        );
      return {
        englishName: a.englishName,
        name: a.name,
        isActive: a.isActive,
        pausedReason: a.pausedReason ?? null,
        calls24h: stats?.calls ?? 0,
        errors24h: stats?.errors ?? 0,
        costUsd24h: parseFloat(stats?.cost ?? "0"),
      };
    }),
  );

  return { ok: true, result: { count: items.length, items } };
}

// ---- send_notification ----
export const sendNotificationTool: AgentTool = {
  name: "send_notification",
  description:
    "사용자에게 인앱 알림과 텔레그램(설정된 경우) 알림을 발송. kind는 daily_report/agent_alert/discussion_result/calendar_reminder 중 하나. 일반 채팅 응답이 아니라 비동기 보고/리마인더 용도.",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: [
          "daily_report",
          "agent_alert",
          "discussion_result",
          "calendar_reminder",
        ],
      },
      title: { type: "string" },
      body_md: { type: "string", description: "markdown 본문" },
    },
    required: ["kind", "title", "body_md"],
  },
};

export async function runSendNotification(
  userId: string,
  input: Record<string, unknown>,
): Promise<
  { ok: true; result: { id: string } } | { ok: false; error: string }
> {
  const kind = typeof input.kind === "string" ? input.kind : "";
  const title = typeof input.title === "string" ? input.title : "";
  const bodyMd = typeof input.body_md === "string" ? input.body_md : "";
  if (!kind || !title) return { ok: false, error: "kind and title required" };

  try {
    const id = await dispatchNotification({
      userId,
      kind,
      title,
      bodyMd,
      payload: {},
    });
    return { ok: true, result: { id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ---- start_discussion ----
export const startDiscussionTool: AgentTool = {
  name: "start_discussion",
  description:
    "다중 에이전트 토론을 시작. 메인 에이전트가 진행자가 되어 target_agents에 명시된 에이전트들의 의견을 모으고 결론이 날 때까지 무한 라운드(안전 cap 8). 즉시 반환되고 결과는 완료 시 알림으로 도착. 사용자에게 토론 과정은 노출되지 않음.",
  input_schema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "토론 주제" },
      target_agents: {
        type: "array",
        items: {
          type: "string",
          enum: ["assistant", "daily", "diary", "memo", "calendar"],
        },
        description: "토론에 참여할 에이전트들의 영문명",
      },
    },
    required: ["topic", "target_agents"],
  },
};

export async function runStartDiscussion(
  userId: string,
  input: Record<string, unknown>,
): Promise<
  { ok: true; result: { discussionId: string } } | { ok: false; error: string }
> {
  const topic = typeof input.topic === "string" ? input.topic : "";
  const target = Array.isArray(input.target_agents)
    ? (input.target_agents.filter((x) => typeof x === "string") as string[])
    : [];
  if (!topic || target.length === 0) {
    return { ok: false, error: "topic and target_agents required" };
  }

  try {
    const discussionId = await startDiscussion({
      userId,
      topic,
      targetAgents: target,
    });
    return { ok: true, result: { discussionId } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ---- export bundle ----
export const mainTools: AgentTool[] = [
  webSearchTool,
  listAgentHealthTool,
  sendNotificationTool,
  startDiscussionTool,
];

export async function runMainTool(
  toolName: string,
  userId: string,
  input: Record<string, unknown>,
) {
  switch (toolName) {
    case "web_search":
      return runWebSearch(input);
    case "list_agent_health":
      return runListAgentHealth();
    case "send_notification":
      return runSendNotification(userId, input);
    case "start_discussion":
      return runStartDiscussion(userId, input);
    default:
      return { ok: false as const, error: `unknown tool: ${toolName}` };
  }
}
